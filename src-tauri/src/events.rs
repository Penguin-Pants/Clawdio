//! Event names and the player's event sink (section 6.7).

use clawdio_core::api::{PlayerSnapshot, QueueSnapshot};
use tauri::{AppHandle, Emitter, Manager};

use crate::media_controls::{self, Publisher};
use crate::persist::StateStore;
use crate::player::PlayerEvents;

pub const LIBRARY_CHANGED: &str = "library-changed";
pub const JOB_PROGRESS: &str = "job-progress";
pub const STATUS_MESSAGE: &str = "status-message";
pub const PLAYER_STATE: &str = "player-state";
pub const PLAYER_POSITION: &str = "player-position";
pub const QUEUE_CHANGED: &str = "queue-changed";
pub const SETTINGS_CHANGED: &str = "settings-changed";

/// Emits an event and logs a failure instead of failing the caller.
pub fn emit<S: serde::Serialize + Clone>(app: &AppHandle, event: &str, payload: S) {
    if let Err(error) = app.emit(event, payload) {
        log::warn!("events: cannot emit {event}: {error}");
    }
}

/// The player's events go to the webview and to the OS media controls (P8.3).
pub struct AppEvents {
    app: AppHandle,
    media: Publisher,
}

impl AppEvents {
    pub fn new(app: AppHandle) -> Self {
        AppEvents {
            app,
            media: Publisher::default(),
        }
    }
}

impl PlayerEvents for AppEvents {
    fn state(&self, player: PlayerSnapshot) {
        if let Some(store) = self.app.try_state::<StateStore>() {
            store.player(&player);
        }
        if let Some(update) = self.media.state(&player) {
            media_controls::apply(&self.app, update);
        }
        emit(&self.app, PLAYER_STATE, player);
    }

    fn queue(&self, queue: &QueueSnapshot) {
        if let Some(store) = self.app.try_state::<StateStore>() {
            store.queue(queue);
        }
        if let Some(update) = self
            .media
            .queue(queue, |id| media_controls::song(&self.app, id))
        {
            media_controls::apply(&self.app, update);
        }
        emit(&self.app, QUEUE_CHANGED, queue.clone());
    }

    fn position(&self, position_ms: u32) {
        if let Some(store) = self.app.try_state::<StateStore>() {
            store.position(position_ms);
        }
        if let Some(update) = self.media.position(position_ms) {
            media_controls::apply(&self.app, update);
        }
        emit(&self.app, PLAYER_POSITION, position_ms);
    }

    fn message(&self, text: String) {
        emit(&self.app, STATUS_MESSAGE, text);
    }
}
