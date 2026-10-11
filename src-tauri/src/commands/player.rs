//! Player commands. They go through the player thread, which owns the queue (D46).

use std::time::Duration;

use clawdio_core::api::{PlayerSnapshot, QueueSnapshot, RepeatMode};
use tauri::State;

use super::CommandResult;
use crate::player::{Command, PlayerHandle};

/// Replaces the queue with `ids` and plays from `start` (R6 queue rule).
#[tauri::command]
pub fn player_play_list(player: State<'_, PlayerHandle>, ids: Vec<u32>, start: u32) {
    player.send(Command::PlayList {
        ids,
        start: start as usize,
    });
}

#[tauri::command]
pub fn player_play(player: State<'_, PlayerHandle>) {
    player.send(Command::Play);
}

#[tauri::command]
pub fn player_pause(player: State<'_, PlayerHandle>) {
    player.send(Command::Pause);
}

#[tauri::command]
pub fn player_toggle(player: State<'_, PlayerHandle>) {
    player.send(Command::Toggle);
}

#[tauri::command]
pub fn player_stop(player: State<'_, PlayerHandle>) {
    player.send(Command::Stop);
}

#[tauri::command]
pub fn player_next(player: State<'_, PlayerHandle>) {
    player.send(Command::Next);
}

#[tauri::command]
pub fn player_previous(player: State<'_, PlayerHandle>) {
    player.send(Command::Previous);
}

/// Moves to `ms` in the current song.
#[tauri::command]
pub fn player_seek(player: State<'_, PlayerHandle>, ms: u32) {
    player.send(Command::Seek(Duration::from_millis(u64::from(ms))));
}

/// Volume from 0 to 100. Larger values count as 100.
#[tauri::command]
pub fn player_set_volume(player: State<'_, PlayerHandle>, volume: u8) {
    player.send(Command::SetVolume(volume));
}

#[tauri::command]
pub fn player_set_shuffle(player: State<'_, PlayerHandle>, on: bool) {
    player.send(Command::SetShuffle(on));
}

#[tauri::command]
pub fn player_set_repeat(player: State<'_, PlayerHandle>, mode: RepeatMode) {
    player.send(Command::SetRepeat(mode));
}

/// Add to queue: appends; the playing song does not change (R6).
#[tauri::command]
pub fn queue_append(player: State<'_, PlayerHandle>, ids: Vec<u32>) {
    player.send(Command::Append(ids));
}

#[tauri::command]
pub fn queue_remove(player: State<'_, PlayerHandle>, index: u32) {
    player.send(Command::Remove(index as usize));
}

/// Clear queue: stops playback and empties the queue (R6).
#[tauri::command]
pub fn queue_clear(player: State<'_, PlayerHandle>) {
    player.send(Command::ClearQueue);
}

// The reads wait for the player thread's answer. As async commands they wait off the main
// thread, so a slow player never freezes the window.
#[tauri::command]
pub async fn queue_get(player: State<'_, PlayerHandle>) -> CommandResult<QueueSnapshot> {
    Ok(player.queue())
}

#[tauri::command]
pub async fn player_state(player: State<'_, PlayerHandle>) -> CommandResult<PlayerSnapshot> {
    Ok(player.state())
}
