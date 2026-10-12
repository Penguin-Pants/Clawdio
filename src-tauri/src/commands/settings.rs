//! Settings, the music folder and the first-run notice (P4.4 to P4.6, P4.10).

use std::path::Path;

use clawdio_core::api::{FolderState, IpcError, SettingsView};
use clawdio_core::paths::{resolve_music_path, store_music_path};
use clawdio_core::settings::{save, Settings};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use super::CommandResult;
use crate::events::{emit, SETTINGS_CHANGED};
use crate::jobs;
use crate::state::{AppState, MusicRoot};

fn io_error(error: impl std::fmt::Display) -> IpcError {
    IpcError {
        code: "io".into(),
        message: error.to_string(),
    }
}

/// The name of a folder for display. IPC carries no paths (D13), so a drive or file system
/// root gets a label.
fn display_name(folder: &Path) -> String {
    if let Some(name) = folder.file_name() {
        return name.to_string_lossy().into_owned();
    }
    match folder.components().next() {
        Some(std::path::Component::Prefix(prefix)) => match prefix.kind() {
            std::path::Prefix::Disk(letter) | std::path::Prefix::VerbatimDisk(letter) => {
                format!("Drive {}", char::from(letter).to_ascii_uppercase())
            }
            _ => "Network folder".into(),
        },
        _ => "Root folder".into(),
    }
}

/// The view of the settings for the webview.
pub fn view(state: &AppState, settings: &Settings) -> SettingsView {
    let folder = settings
        .music_folder
        .as_deref()
        .map(|stored| resolve_music_path(stored, &state.base));
    SettingsView {
        folder_state: match &folder {
            None => FolderState::None,
            Some(path) if path.is_dir() => FolderState::Ready,
            Some(_) => FolderState::Missing,
        },
        folder_name: folder.as_deref().map(display_name),
        online_lookups: settings.online_lookups,
        notice_pending: !settings.online_notice_done,
        portable: state.dirs.portable,
        last_scan: settings.last_scan,
    }
}

/// Changes the settings, saves them and returns the new view. A failed save changes nothing.
pub(crate) fn update(
    app: &AppHandle,
    change: impl FnOnce(&mut Settings),
) -> CommandResult<SettingsView> {
    let state = app.state::<AppState>();
    let mut settings = state.settings.lock().map_err(io_error)?;
    let mut changed = settings.clone();
    change(&mut changed);
    save(&state.dirs.config, &changed).map_err(io_error)?;
    let online =
        (changed.online_lookups != settings.online_lookups).then_some(changed.online_lookups);
    *settings = changed;
    let view = view(&state, &settings);
    // Under the settings lock, so two quick changes reach the gate in the saved order.
    if let Some(on) = online {
        crate::online::switch(app, on);
    }
    drop(settings);
    emit(app, SETTINGS_CHANGED, view.clone());
    Ok(view)
}

#[tauri::command]
pub fn settings_get(state: State<'_, AppState>) -> CommandResult<SettingsView> {
    let settings = state.settings.lock().map_err(io_error)?;
    Ok(view(&state, &settings))
}

#[tauri::command]
pub fn set_online_lookups(app: AppHandle, on: bool) -> CommandResult<SettingsView> {
    update(&app, |settings| settings.online_lookups = on)
}

#[tauri::command]
pub fn first_run_notice_done(app: AppHandle) -> CommandResult<SettingsView> {
    update(&app, |settings| settings.online_notice_done = true)
}

/// Checks that the folder exists and can be listed.
fn readable_folder(path: &Path) -> Result<(), IpcError> {
    std::fs::read_dir(path)
        .map(|_| ())
        .map_err(|error| IpcError {
            code: "folder_unreadable".into(),
            message: format!("The folder cannot be read: {error}"),
        })
}

/// Opens the native folder picker from Rust (D13), stores the chosen folder by the R18.1 rule
/// and scans it (P5.9: the running scan stops, playback stops, the queue, the index and the
/// cache clear). Canceling the picker changes nothing.
#[tauri::command]
pub async fn choose_music_folder(app: AppHandle) -> CommandResult<SettingsView> {
    let picked = app.dialog().file().blocking_pick_folder();
    let Some(folder) = picked.and_then(|path| path.into_path().ok()) else {
        let state = app.state::<AppState>();
        let settings = state.settings.lock().map_err(io_error)?;
        return Ok(view(&state, &settings));
    };
    readable_folder(&folder)?;
    let (base, portable) = {
        let state = app.state::<AppState>();
        (state.base.clone(), state.dirs.portable)
    };
    let stored = store_music_path(&folder, &base, portable);
    let view = update(&app, |settings| settings.music_folder = Some(stored))?;
    // Playback of the old folder stops before the root changes, so no old id plays from the
    // new folder (P5.9).
    app.state::<crate::player::PlayerHandle>().clear();
    if let Ok(mut root) = app.state::<MusicRoot>().0.write() {
        *root = Some(folder.clone());
    }
    jobs::start_scan(&app, folder, jobs::ScanKind::NewFolder);
    Ok(view)
}

/// Rescans the music folder (R2). Does nothing while a scan runs (P5-AC5).
#[tauri::command]
pub fn rescan(app: AppHandle) {
    let root = app
        .state::<MusicRoot>()
        .0
        .read()
        .ok()
        .and_then(|root| root.clone());
    if let Some(root) = root {
        jobs::start_rescan(&app, root);
    }
}

#[tauri::command]
pub fn cancel_job(app: AppHandle, id: String) {
    jobs::cancel(&app, &id);
}

/// Opens the log folder in the file manager (R23).
#[tauri::command]
pub fn open_log_folder(app: AppHandle, state: State<'_, AppState>) -> CommandResult<()> {
    app.opener()
        .open_path(state.dirs.logs.to_string_lossy(), None::<&str>)
        .map_err(io_error)
}

/// Opens the third-party notices of the project in the browser (D12).
#[tauri::command]
pub fn open_notice(app: AppHandle) -> CommandResult<()> {
    let url = format!("{}/blob/main/NOTICE", clawdio_core::config::CONTACT_URL);
    app.opener().open_url(url, None::<&str>).map_err(io_error)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_view_names_the_folder_without_its_path() {
        assert_eq!(display_name(Path::new("/home/a/Music")), "Music");
        assert_eq!(display_name(Path::new("/")), "Root folder");
        #[cfg(windows)]
        {
            assert_eq!(display_name(Path::new(r"d:\")), "Drive D");
            assert_eq!(
                display_name(Path::new(r"\\server\share\")),
                "Network folder"
            );
        }
    }
}
