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

/// The name of a folder for display. IPC carries no paths (D13).
fn display_name(folder: &Path) -> String {
    folder
        .file_name()
        .unwrap_or(folder.as_os_str())
        .to_string_lossy()
        .into_owned()
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
    }
}

/// Changes the settings, saves them and returns the new view.
fn update(app: &AppHandle, change: impl FnOnce(&mut Settings)) -> CommandResult<SettingsView> {
    let state = app.state::<AppState>();
    let mut settings = state.settings.lock().map_err(io_error)?;
    change(&mut settings);
    save(&state.dirs.config, &settings).map_err(io_error)?;
    let view = view(&state, &settings);
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
/// and starts a scan. Canceling the picker changes nothing.
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
    if let Ok(mut root) = app.state::<MusicRoot>().0.write() {
        *root = Some(folder.clone());
    }
    jobs::start_scan(&app, folder, true);
    Ok(view)
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
        assert_eq!(display_name(Path::new("/")), "/");
    }
}
