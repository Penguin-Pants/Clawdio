//! Queue, player, playlist and lyrics reads. Later phases replace the data source.

use clawdio_core::api::{Lyrics, PlayerSnapshot, PlaylistEntry, PlaylistRow, QueueSnapshot};
use tauri::State;

use super::CommandResult;
use crate::state::Widgets;

#[tauri::command]
pub fn queue_get(widgets: State<'_, Widgets>) -> CommandResult<QueueSnapshot> {
    Ok(widgets.queue.clone())
}

#[tauri::command]
pub fn player_state(widgets: State<'_, Widgets>) -> CommandResult<PlayerSnapshot> {
    Ok(widgets.player)
}

#[tauri::command]
pub fn playlists_list(widgets: State<'_, Widgets>) -> CommandResult<Vec<PlaylistRow>> {
    Ok(widgets
        .playlists
        .iter()
        .map(|(row, _)| row.clone())
        .collect())
}

#[tauri::command]
pub fn playlist_entries(widgets: State<'_, Widgets>, id: u32) -> CommandResult<Vec<PlaylistEntry>> {
    widgets
        .playlists
        .iter()
        .find(|(row, _)| row.id == id)
        .map(|(_, entries)| entries.clone())
        .ok_or_else(|| {
            clawdio_core::error::CoreError::UnknownId {
                kind: "playlist",
                id,
            }
            .into()
        })
}

#[tauri::command]
pub fn lyrics_get(widgets: State<'_, Widgets>, track: u32) -> CommandResult<Option<Lyrics>> {
    // P13 reads the lyrics of this track. Until then the same text serves every track.
    let _ = track;
    Ok(widgets.lyrics.clone())
}
