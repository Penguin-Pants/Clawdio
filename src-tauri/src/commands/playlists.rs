//! Playlist commands (P11.4). IPC carries playlist ids, track ids, entry positions and names;
//! the files are found in Rust (D13). Each edit sends `playlists-changed`.

use std::path::PathBuf;

use clawdio_core::api::{ImportBatch, IpcError, PlaylistEntry, PlaylistRow, RepairBatch};
use clawdio_core::import::{after_scan, import_files, playlist_files};
use clawdio_core::library::LibraryIndex;
use clawdio_core::playlist::{PlaylistError, PlaylistSet};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

use super::{lock_error, CommandResult};
use crate::events::{emit, PLAYLISTS_CHANGED};
use crate::state::{Library, MusicRoot, Playlists};

fn playlist_error(error: PlaylistError) -> IpcError {
    match error {
        PlaylistError::UnknownTrack(id) => {
            clawdio_core::error::CoreError::UnknownId { kind: "track", id }.into()
        }
        error => IpcError {
            code: "playlist".into(),
            message: error.to_string(),
        },
    }
}

fn unknown(id: u32) -> IpcError {
    clawdio_core::error::CoreError::UnknownId {
        kind: "playlist",
        id,
    }
    .into()
}

fn root(app: &AppHandle) -> Result<PathBuf, IpcError> {
    app.state::<MusicRoot>()
        .0
        .read()
        .map_err(|_| lock_error())?
        .clone()
        .ok_or_else(|| IpcError {
            code: "playlist".into(),
            message: "Choose a music folder first".into(),
        })
}

/// Runs an edit with the playlists, the music folder and the index, then tells the UI.
fn edit<T>(
    app: &AppHandle,
    change: impl FnOnce(
        &mut clawdio_core::playlist::PlaylistSet,
        &std::path::Path,
        &clawdio_core::library::LibraryIndex,
    ) -> Result<T, PlaylistError>,
) -> CommandResult<T> {
    let root = root(app)?;
    let playlists = app.state::<Playlists>();
    let mut set = playlists.0.lock().map_err(|_| lock_error())?;
    let library = app.state::<Library>();
    let index = library.0.read().map_err(|_| lock_error())?;
    let result = change(&mut set, &root, &index).map_err(playlist_error);
    drop(index);
    drop(set);
    if result.is_ok() {
        emit(app, PLAYLISTS_CHANGED, ());
    }
    result
}

/// Playlists in natural name order (P11.5), with their missing counts (R33.3).
#[tauri::command]
pub fn playlists_list(
    playlists: State<'_, Playlists>,
    library: State<'_, Library>,
) -> CommandResult<Vec<PlaylistRow>> {
    let set = playlists.0.lock().map_err(|_| lock_error())?;
    let index = library.0.read().map_err(|_| lock_error())?;
    Ok(set.rows(&index))
}

/// A playlist's entries: track ids, or missing files by their path text (R13).
#[tauri::command]
pub fn playlist_entries(
    playlists: State<'_, Playlists>,
    library: State<'_, Library>,
    id: u32,
) -> CommandResult<Vec<PlaylistEntry>> {
    let set = playlists.0.lock().map_err(|_| lock_error())?;
    let index = library.0.read().map_err(|_| lock_error())?;
    set.entries(id, &index).ok_or_else(|| unknown(id))
}

/// The message for a new playlist name, or null when it is valid (R12, D21), for the name
/// dialog's inline check.
#[tauri::command]
pub fn playlist_name_check(app: AppHandle, name: String) -> CommandResult<Option<String>> {
    let root = root(&app)?;
    let playlists = app.state::<Playlists>();
    let set = playlists.0.lock().map_err(|_| lock_error())?;
    Ok(set
        .check_name(&root, &name)
        .err()
        .map(|error| error.to_string()))
}

#[tauri::command]
pub fn playlist_create(app: AppHandle, name: String) -> CommandResult<u32> {
    edit(&app, |set, root, _| set.create(root, &name))
}

/// Add to playlist (R12): appends; duplicates are allowed.
#[tauri::command]
pub fn playlist_add(app: AppHandle, id: u32, tracks: Vec<u32>) -> CommandResult<()> {
    edit(&app, |set, root, index| set.add(root, id, &tracks, index))
}

#[tauri::command]
pub fn playlist_remove_entry(app: AppHandle, id: u32, index: u32) -> CommandResult<()> {
    edit(&app, |set, root, _| {
        set.remove_entry(root, id, index as usize)
    })
}

/// Deletes the playlist file, after the confirmation in the UI (R12).
#[tauri::command]
pub fn playlist_delete(app: AppHandle, id: u32) -> CommandResult<()> {
    edit(&app, |set, root, _| set.delete(root, id))
}

/// The heart (R26): true when the track is a favorite now.
#[tauri::command]
pub fn favorite_toggle(app: AppHandle, track: u32) -> CommandResult<bool> {
    edit(&app, |set, root, index| {
        set.toggle_favorite(root, track, index)
    })
}

/// The tracks in Favorites, for the hearts.
#[tauri::command]
pub fn favorites(
    playlists: State<'_, Playlists>,
    library: State<'_, Library>,
) -> CommandResult<Vec<u32>> {
    let set = playlists.0.lock().map_err(|_| lock_error())?;
    let index = library.0.read().map_err(|_| lock_error())?;
    Ok(set.favorite_tracks(&index))
}

/// Rescan first (R33.1), then `work` with the playlists, the music folder and the index; then
/// tells the UI. None when the scan was canceled or failed, or the music folder changed
/// meanwhile: nothing was matched or written. Blocks the calling thread.
fn after_rescan<T>(
    app: &AppHandle,
    work: impl FnOnce(&mut PlaylistSet, &std::path::Path, &LibraryIndex) -> CommandResult<T>,
) -> CommandResult<Option<T>> {
    let root = root(app)?;
    let ran = after_scan(
        || {
            crate::jobs::scan_and_wait(app, root.clone())
                && self::root(app).ok() == Some(root.clone())
        },
        || {
            let playlists = app.state::<Playlists>();
            let mut set = playlists.0.lock().map_err(|_| lock_error())?;
            let library = app.state::<Library>();
            let index = library.0.read().map_err(|_| lock_error())?;
            let result = work(&mut set, &root, &index);
            drop(index);
            drop(set);
            emit(app, PLAYLISTS_CHANGED, ());
            result
        },
    );
    ran.transpose()
}

/// Runs a blocking import or repair off the async runtime.
async fn blocking<T: Send + 'static>(
    run: impl FnOnce() -> CommandResult<T> + Send + 'static,
) -> CommandResult<T> {
    tauri::async_runtime::spawn_blocking(run)
        .await
        .map_err(|error| {
            log::warn!("playlists: a background task failed: {error}");
            IpcError {
                code: "playlist".into(),
                message: "The playlist task stopped".into(),
            }
        })?
}

/// One import action (R32, R33.1): `files()` lists the sources, then the rescan, then every
/// source in path order. Canceled when the scan was.
async fn import(
    app: AppHandle,
    files: impl FnOnce() -> Vec<PathBuf> + Send + 'static,
) -> CommandResult<ImportBatch> {
    blocking(move || {
        // The folder walk runs before the locks are taken.
        let files = files();
        let reports = after_rescan(&app, |set, root, index| {
            Ok(import_files(set, root, index, &files, |_| {}))
        })?;
        Ok(match reports {
            Some(reports) => ImportBatch {
                canceled: false,
                reports,
            },
            None => ImportBatch {
                canceled: true,
                reports: Vec::new(),
            },
        })
    })
    .await
}

/// "Import playlist" (P12.6, R32): a Rust picker for one or more `.m3u`, `.m3u8` and `.xml`
/// files; each playlist in them becomes a new `.m3u8` in `Playlists/`. Matching searches the
/// library only. Returns the combined report, or null when the user cancels the picker. The
/// source files are only read.
#[tauri::command]
pub async fn playlist_import(app: AppHandle) -> CommandResult<Option<ImportBatch>> {
    let picked = app
        .dialog()
        .file()
        .add_filter("Playlists", &["m3u", "m3u8", "xml"])
        .blocking_pick_files();
    let Some(picked) = picked else {
        return Ok(None);
    };
    let files: Vec<PathBuf> = picked
        .into_iter()
        .filter_map(|path| path.into_path().ok())
        .collect();
    import(app, move || files).await.map(Some)
}

/// "Import folder" (R32): a Rust folder picker; every `.m3u`, `.m3u8` and `.xml` file in the
/// folder and its subfolders imports. Null when the user cancels the picker.
#[tauri::command]
pub async fn playlist_import_folder(app: AppHandle) -> CommandResult<Option<ImportBatch>> {
    let picked = app.dialog().file().blocking_pick_folder();
    let Some(folder) = picked.and_then(|path| path.into_path().ok()) else {
        return Ok(None);
    };
    import(app, move || playlist_files(&folder)).await.map(Some)
}

/// "Find missing songs" (R33.3): rescan first, then repair `ids()` of the playlists.
async fn repair(
    app: AppHandle,
    ids: impl FnOnce(&PlaylistSet, &LibraryIndex) -> CommandResult<Vec<u32>> + Send + 'static,
) -> CommandResult<RepairBatch> {
    blocking(move || {
        let reports = after_rescan(&app, |set, root, index| {
            let ids = ids(set, index)?;
            Ok(set.repair(root, &ids, index))
        })?;
        Ok(match reports {
            Some(reports) => RepairBatch {
                canceled: false,
                reports,
            },
            None => RepairBatch {
                canceled: true,
                reports: Vec::new(),
            },
        })
    })
    .await
}

/// "Find missing songs" on one playlist (R33.3 to R33.5).
#[tauri::command]
pub async fn playlist_find_missing(app: AppHandle, id: u32) -> CommandResult<RepairBatch> {
    repair(app, move |set, _| match set.get(id) {
        Some(_) => Ok(vec![id]),
        None => Err(unknown(id)),
    })
    .await
}

/// "Find missing songs in all playlists" (R33.3): each playlist with missing entries.
#[tauri::command]
pub async fn playlist_find_missing_all(app: AppHandle) -> CommandResult<RepairBatch> {
    repair(app, |set, index| Ok(set.with_missing(index))).await
}
