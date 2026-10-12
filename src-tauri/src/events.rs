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
/// An album's art files exist now; the payload is the album id (P10.2).
pub const ART_READY: &str = "art-ready";
/// The playlists or an entry changed (P11.4).
pub const PLAYLISTS_CHANGED: &str = "playlists-changed";

/// Emits an event and logs a failure instead of failing the caller.
pub fn emit<R: tauri::Runtime, S: serde::Serialize + Clone>(
    app: &AppHandle<R>,
    event: &str,
    payload: S,
) {
    if let Err(error) = app.emit(event, payload) {
        log::warn!("events: cannot emit {event}: {error}");
    }
}

/// The player's events go to the webview and to the OS media controls (P8.3).
pub struct AppEvents {
    app: AppHandle,
}

impl AppEvents {
    /// The app also manages a [`Publisher`] for the OS media controls.
    pub fn new(app: AppHandle) -> Self {
        AppEvents { app }
    }

    fn media(&self) -> Option<tauri::State<'_, Publisher>> {
        self.app.try_state::<Publisher>()
    }
}

impl PlayerEvents for AppEvents {
    fn state(&self, player: PlayerSnapshot) {
        if let Some(store) = self.app.try_state::<StateStore>() {
            store.player(&player);
        }
        if let Some(update) = self.media().and_then(|media| media.state(&player)) {
            media_controls::apply(&self.app, update);
        }
        emit(&self.app, PLAYER_STATE, player);
    }

    fn queue(&self, queue: &QueueSnapshot) {
        if let Some(store) = self.app.try_state::<StateStore>() {
            store.queue(queue);
        }
        if let Some(update) = self.media().and_then(|media| {
            media.queue(
                queue,
                |id| media_controls::song(&self.app, id),
                |album| media_controls::cover_url(&self.app, album),
            )
        }) {
            media_controls::apply(&self.app, update);
        }
        emit(&self.app, QUEUE_CHANGED, queue.clone());
    }

    fn position(&self, position_ms: u32) {
        if let Some(store) = self.app.try_state::<StateStore>() {
            store.position(position_ms);
        }
        if let Some(update) = self.media().and_then(|media| media.position(position_ms)) {
            media_controls::apply(&self.app, update);
        }
        emit(&self.app, PLAYER_POSITION, position_ms);
    }

    fn message(&self, text: String) {
        emit(&self.app, STATUS_MESSAGE, text);
    }
}
