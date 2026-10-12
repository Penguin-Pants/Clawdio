//! Playlist commands (P11.4). IPC carries playlist ids, track ids, entry positions and names;
//! the files are found in Rust (D13). Each edit sends `playlists-changed`.

use std::path::PathBuf;

use clawdio_core::api::{ImportReport, IpcError, PlaylistEntry, PlaylistRow};
use clawdio_core::import::import_file;
use clawdio_core::playlist::PlaylistError;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

use super::{lock_error, CommandResult};
use crate::events::{emit, PLAYLISTS_CHANGED};
use crate::state::{Library, MusicRoot, Playlists};

fn playlist_error(error: PlaylistError) -> IpcError {
    IpcError {
        code: "playlist".into(),
        message: error.to_string(),
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

/// Playlists in natural name order (P11.5).
#[tauri::command]
pub fn playlists_list(playlists: State<'_, Playlists>) -> CommandResult<Vec<PlaylistRow>> {
    Ok(playlists.0.lock().map_err(|_| lock_error())?.rows())
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

/// "Import playlist" (P12.6): a Rust file picker for `.m3u`, `.m3u8` and `.xml`; each playlist
/// in the file becomes a new `.m3u8` in `Playlists/`. Matching searches the library only.
/// Returns the reports, or null when the user cancels. The source file is only read.
#[tauri::command]
pub async fn playlist_import(app: AppHandle) -> CommandResult<Option<Vec<ImportReport>>> {
    let picked = app
        .dialog()
        .file()
        .add_filter("Playlists", &["m3u", "m3u8", "xml"])
        .blocking_pick_file();
    let Some(file) = picked.and_then(|path| path.into_path().ok()) else {
        return Ok(None);
    };
    let reports = edit_import(&app, &file)?;
    Ok(Some(reports))
}

fn edit_import(app: &AppHandle, file: &std::path::Path) -> CommandResult<Vec<ImportReport>> {
    let root = root(app)?;
    let playlists = app.state::<Playlists>();
    let mut set = playlists.0.lock().map_err(|_| lock_error())?;
    let library = app.state::<Library>();
    let index = library.0.read().map_err(|_| lock_error())?;
    let reports = import_file(&mut set, &root, &index, file).map_err(|error| IpcError {
        code: "import".into(),
        message: error.to_string(),
    });
    drop(index);
    drop(set);
    emit(app, PLAYLISTS_CHANGED, ());
    reports
}
