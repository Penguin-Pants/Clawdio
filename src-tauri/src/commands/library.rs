//! Library queries (section 6.7, D14). The UI asks for id lists and fetches rows for the
//! visible window only.

use clawdio_core::api::{
    AlbumRow, ArtistRow, FindHit, FindList, SongRow, SongScope, SortKey, TreeArtist,
};
use clawdio_core::error::CoreError;
use tauri::State;

use super::{lock_error, CommandResult};
use crate::player::PlayerHandle;
use crate::state::{Library, Playlists};

#[tauri::command]
pub fn library_artists(library: State<'_, Library>, query: String) -> CommandResult<Vec<u32>> {
    Ok(library
        .0
        .read()
        .map_err(|_| lock_error())?
        .artist_ids(&query))
}

#[tauri::command]
pub fn library_artist_rows(
    library: State<'_, Library>,
    ids: Vec<u32>,
) -> CommandResult<Vec<ArtistRow>> {
    Ok(library
        .0
        .read()
        .map_err(|_| lock_error())?
        .artist_rows(&ids)?)
}

#[tauri::command]
pub fn library_albums(
    library: State<'_, Library>,
    artist: Option<u32>,
    query: String,
) -> CommandResult<Vec<u32>> {
    Ok(library
        .0
        .read()
        .map_err(|_| lock_error())?
        .album_ids(artist, &query)?)
}

#[tauri::command]
pub fn library_album_rows(
    library: State<'_, Library>,
    ids: Vec<u32>,
) -> CommandResult<Vec<AlbumRow>> {
    Ok(library
        .0
        .read()
        .map_err(|_| lock_error())?
        .album_rows(&ids)?)
}

#[tauri::command]
pub fn library_song_ids(
    library: State<'_, Library>,
    scope: SongScope,
    query: String,
    sort: Vec<SortKey>,
) -> CommandResult<Vec<u32>> {
    Ok(library
        .0
        .read()
        .map_err(|_| lock_error())?
        .song_ids(scope, &query, &sort)?)
}

#[tauri::command]
pub fn library_rows(library: State<'_, Library>, ids: Vec<u32>) -> CommandResult<Vec<SongRow>> {
    Ok(library.0.read().map_err(|_| lock_error())?.rows(&ids)?)
}

#[tauri::command]
pub fn library_tree(library: State<'_, Library>, query: String) -> CommandResult<Vec<TreeArtist>> {
    Ok(library.0.read().map_err(|_| lock_error())?.tree(&query))
}

/// Type-to-find (R36, D65): the first row of the list as shown whose name starts with `text`,
/// or null. The playlist view and the queue match the titles of their entries.
#[tauri::command]
pub async fn library_find(
    library: State<'_, Library>,
    playlists: State<'_, Playlists>,
    player: State<'_, PlayerHandle>,
    list: FindList,
    text: String,
) -> CommandResult<Option<FindHit>> {
    let tracks: Vec<Option<u32>> = match &list {
        // The player thread owns the queue (D46); read it before the library lock.
        FindList::Queue => player.queue().entries.into_iter().map(Some).collect(),
        FindList::Playlist { id } => {
            let set = playlists.0.lock().map_err(|_| lock_error())?;
            let index = library.0.read().map_err(|_| lock_error())?;
            let entries = set.entries(*id, &index).ok_or(CoreError::UnknownId {
                kind: "playlist",
                id: *id,
            })?;
            entries.iter().map(|entry| entry.track).collect()
        }
        _ => {
            let index = library.0.read().map_err(|_| lock_error())?;
            return Ok(index.find(&list, &text)?);
        }
    };
    let index = library.0.read().map_err(|_| lock_error())?;
    Ok(index.find_title(&tracks, &text))
}
