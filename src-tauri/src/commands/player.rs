//! Player commands. They go through the player thread, which owns the queue (D46).

use clawdio_core::api::{PlayerSnapshot, QueueSnapshot};
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
pub fn player_toggle(player: State<'_, PlayerHandle>) {
    player.send(Command::Toggle);
}

#[tauri::command]
pub fn player_stop(player: State<'_, PlayerHandle>) {
    player.send(Command::Stop);
}

#[tauri::command]
pub fn queue_get(player: State<'_, PlayerHandle>) -> CommandResult<QueueSnapshot> {
    Ok(player.queue())
}

#[tauri::command]
pub fn player_state(player: State<'_, PlayerHandle>) -> CommandResult<PlayerSnapshot> {
    Ok(player.state())
}
