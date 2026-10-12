//! Lyrics reads. P13 replaces the data source.

use clawdio_core::api::Lyrics;
use tauri::State;

use super::CommandResult;
use crate::state::Widgets;

#[tauri::command]
pub fn lyrics_get(widgets: State<'_, Widgets>, track: u32) -> CommandResult<Option<Lyrics>> {
    // P13 reads the lyrics of this track. Until then the same text serves every track.
    let _ = track;
    Ok(widgets.lyrics.clone())
}
