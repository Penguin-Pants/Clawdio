//! Event names and the player's event sink (section 6.7).

use clawdio_core::api::{PlayerEvent, PlayerSnapshot, QueueSnapshot};
use tauri::{AppHandle, Emitter};

use crate::player::PlayerEvents;

pub const LIBRARY_CHANGED: &str = "library-changed";
pub const JOB_PROGRESS: &str = "job-progress";
pub const STATUS_MESSAGE: &str = "status-message";
pub const PLAYER_STATE: &str = "player-state";
pub const PLAYER_POSITION: &str = "player-position";
pub const SETTINGS_CHANGED: &str = "settings-changed";

/// Emits an event and logs a failure instead of failing the caller.
pub fn emit<S: serde::Serialize + Clone>(app: &AppHandle, event: &str, payload: S) {
    if let Err(error) = app.emit(event, payload) {
        log::warn!("events: cannot emit {event}: {error}");
    }
}

/// The player's events go to the webview.
pub struct AppEvents(pub AppHandle);

impl PlayerEvents for AppEvents {
    fn state(&self, player: PlayerSnapshot, queue: &QueueSnapshot) {
        emit(
            &self.0,
            PLAYER_STATE,
            PlayerEvent {
                player,
                queue: queue.clone(),
            },
        );
    }

    fn position(&self, position_ms: u32) {
        emit(&self.0, PLAYER_POSITION, position_ms);
    }

    fn message(&self, text: String) {
        emit(&self.0, STATUS_MESSAGE, text);
    }
}
