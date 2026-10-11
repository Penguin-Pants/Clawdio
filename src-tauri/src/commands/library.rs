//! Library queries (section 6.7, D14). The UI asks for id lists and fetches rows for the
//! visible window only.

use clawdio_core::api::{AlbumRow, ArtistRow, SongRow, SongScope, TreeArtist};
use tauri::State;

use super::{lock_error, CommandResult};
use crate::state::{Library, Thumbs};

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
    thumbs: State<'_, Thumbs>,
    ids: Vec<u32>,
) -> CommandResult<Vec<AlbumRow>> {
    let mut rows = library
        .0
        .read()
        .map_err(|_| lock_error())?
        .album_rows(&ids)?;
    for row in &mut rows {
        row.thumb = row
            .thumb
            .take()
            .map(|name| thumbs.0.join(name).to_string_lossy().into_owned());
    }
    Ok(rows)
}

#[tauri::command]
pub fn library_song_ids(
    library: State<'_, Library>,
    scope: SongScope,
    query: String,
) -> CommandResult<Vec<u32>> {
    Ok(library
        .0
        .read()
        .map_err(|_| lock_error())?
        .song_ids(scope, &query)?)
}

#[tauri::command]
pub fn library_rows(library: State<'_, Library>, ids: Vec<u32>) -> CommandResult<Vec<SongRow>> {
    Ok(library.0.read().map_err(|_| lock_error())?.rows(&ids)?)
}

#[tauri::command]
pub fn library_tree(library: State<'_, Library>, query: String) -> CommandResult<Vec<TreeArtist>> {
    Ok(library.0.read().map_err(|_| lock_error())?.tree(&query))
}

/// The thumbnail of a track's album, for Now playing. An unknown or removed track is an error (D46).
#[tauri::command]
pub fn album_art(
    library: State<'_, Library>,
    thumbs: State<'_, Thumbs>,
    track: u32,
) -> CommandResult<Option<String>> {
    let index = library.0.read().map_err(|_| lock_error())?;
    Ok(index
        .album_of(track)?
        .thumb
        .as_ref()
        .map(|name| thumbs.0.join(name).to_string_lossy().into_owned()))
}
