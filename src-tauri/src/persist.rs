//! Playback state persistence (P9.1, R27): restore `state.json` at startup and save it 2 s
//! after a change and on exit. Nothing is saved until the restore has resolved, and nothing
//! is written while the music folder is missing.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Condvar, Mutex};
use std::time::{Duration, Instant};

use clawdio_core::api::{PlayerSnapshot, QueueSnapshot};
use clawdio_core::state::{self, PlaybackState};
use tauri::{AppHandle, Manager};

use crate::player::{Command, PlayerHandle};
use crate::state::{Library, MusicRoot};

/// A change is saved this long after it (P9.1).
pub const SAVE_DELAY: Duration = Duration::from_secs(2);

/// What the player last reported.
#[derive(Default)]
struct Latest {
    queue: QueueSnapshot,
    position_ms: u32,
    volume: u8,
    /// A change since the last save, and when it came.
    dirty_since: Option<Instant>,
    stop: bool,
}

/// The state store, managed by the app.
pub struct StateStore {
    config: PathBuf,
    /// The saved state that waits for the library (P9.1). None once resolved.
    pending: Mutex<Option<PlaybackState>>,
    /// True once the restore resolved, or the user changed the queue first.
    ready: AtomicBool,
    latest: Mutex<Latest>,
    changed: Condvar,
    /// The last state written, so an unchanged state is not written again.
    written: Mutex<Option<PlaybackState>>,
}

impl StateStore {
    /// Reads `state.json` from the config folder.
    pub fn load(config: PathBuf) -> Self {
        let pending = state::load(&config);
        StateStore {
            written: Mutex::new(pending.clone()),
            config,
            pending: Mutex::new(pending),
            ready: AtomicBool::new(false),
            latest: Mutex::new(Latest {
                volume: 100,
                ..Latest::default()
            }),
            changed: Condvar::new(),
        }
    }

    fn update(&self, change: impl FnOnce(&mut Latest)) {
        if let Ok(mut latest) = self.latest.lock() {
            change(&mut latest);
            latest.dirty_since.get_or_insert_with(Instant::now);
            self.changed.notify_all();
        }
    }

    /// A player event before the restore is a user action: the user's queue wins and the
    /// saved one is dropped.
    fn user_first(&self) {
        if !self.ready.swap(true, Ordering::SeqCst) {
            if let Ok(mut pending) = self.pending.lock() {
                if pending.take().is_some() {
                    log::info!("state: the queue changed before the restore; saved queue dropped");
                }
            }
        }
    }

    pub fn queue(&self, queue: &QueueSnapshot) {
        self.user_first();
        self.update(|latest| latest.queue = queue.clone());
    }

    pub fn player(&self, player: &PlayerSnapshot) {
        self.user_first();
        self.update(|latest| {
            latest.position_ms = player.position_ms;
            latest.volume = player.volume;
        });
    }

    /// Position ticks (4 per second) only update the value: a 50,000-entry queue is a few
    /// MB, so a save comes from queue and state changes (pause, seek, track change) and at
    /// exit, not from the clock.
    pub fn position(&self, position_ms: u32) {
        if let Ok(mut latest) = self.latest.lock() {
            latest.position_ms = position_ms;
        }
    }

    /// Restores the saved state when the library holds every entry, or when `complete` (a
    /// full traversal ended) drops the missing ones (P9.1).
    pub fn try_restore(&self, app: &AppHandle, complete: bool) {
        let Ok(mut pending) = self.pending.lock() else {
            return;
        };
        let Some(saved) = pending.as_ref() else {
            self.ready.store(true, Ordering::SeqCst);
            return;
        };
        let restored = {
            let library = app.state::<Library>();
            let Ok(index) = library.0.read() else {
                return;
            };
            state::resolve(saved, &index, complete)
        };
        let Some(restored) = restored else {
            log::info!("state: queue entries wait for the scan");
            return;
        };
        pending.take();
        // Ready first: the restore's own events are saved, not taken as a user action.
        self.ready.store(true, Ordering::SeqCst);
        log::info!("state: restored {} queue entries", restored.ids.len());
        app.state::<PlayerHandle>().send(Command::Restore {
            ids: restored.ids,
            current: restored.current,
            position_ms: restored.position_ms,
            volume: restored.volume,
        });
    }

    /// A new music folder: the saved queue belongs to the old one.
    pub fn new_folder(&self) {
        if let Ok(mut pending) = self.pending.lock() {
            pending.take();
        }
        self.ready.store(true, Ordering::SeqCst);
    }

    /// Writes the state now when there is a change (or `force`, at exit) and writing is
    /// allowed. An unchanged state is not written again.
    pub fn save_now(&self, app: &AppHandle, force: bool) {
        let (ids, current, position_ms, volume) = {
            let Ok(mut latest) = self.latest.lock() else {
                return;
            };
            if latest.dirty_since.take().is_none() && !force {
                return;
            }
            (
                latest.queue.entries.clone(),
                latest.queue.current.map(|index| index as usize),
                latest.position_ms,
                latest.volume,
            )
        };
        if !self.ready.load(Ordering::SeqCst) {
            return;
        }
        let root_ready = app
            .state::<MusicRoot>()
            .0
            .read()
            .ok()
            .and_then(|root| root.as_ref().map(|path| path.is_dir()))
            .unwrap_or(false);
        if !root_ready {
            return;
        }
        let state = {
            let library = app.state::<Library>();
            let Ok(index) = library.0.read() else {
                return;
            };
            state::capture(&ids, current, position_ms, volume, &index)
        };
        let Ok(mut written) = self.written.lock() else {
            return;
        };
        if written.as_ref() == Some(&state) {
            return;
        }
        match state::save(&self.config, &state) {
            Ok(()) => *written = Some(state),
            Err(error) => log::warn!("state: cannot save: {error}"),
        }
    }

    /// The save thread: waits for a change, then SAVE_DELAY, then saves.
    pub fn spawn_saver(app: AppHandle) {
        let spawned = std::thread::Builder::new()
            .name("state-saver".into())
            .spawn(move || loop {
                let store = app.state::<StateStore>();
                {
                    let Ok(mut latest) = store.latest.lock() else {
                        return;
                    };
                    loop {
                        if latest.stop {
                            return;
                        }
                        if let Some(since) = latest.dirty_since {
                            let due = since + SAVE_DELAY;
                            let now = Instant::now();
                            if now >= due {
                                break;
                            }
                            latest = match store.changed.wait_timeout(latest, due - now) {
                                Ok((guard, _)) => guard,
                                Err(_) => return,
                            };
                        } else {
                            latest = match store.changed.wait(latest) {
                                Ok(guard) => guard,
                                Err(_) => return,
                            };
                        }
                    }
                }
                store.save_now(&app, false);
            });
        if let Err(error) = spawned {
            log::warn!("state: cannot start the save thread: {error}");
        }
    }

    /// Saves a pending change and stops the save thread (app exit).
    pub fn flush(&self, app: &AppHandle) {
        self.save_now(app, true);
        if let Ok(mut latest) = self.latest.lock() {
            latest.stop = true;
            self.changed.notify_all();
        }
    }
}
