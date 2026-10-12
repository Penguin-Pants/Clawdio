//! Playback state persistence (P9.1, R27): restore `state.json` at startup and save it 2 s
//! after a change and on exit. Nothing is saved until the restore has resolved, and nothing
//! is written while the music folder is missing.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Condvar, Mutex};
use std::time::{Duration, Instant};

use clawdio_core::api::{PlayerSnapshot, QueueSnapshot};
use clawdio_core::state::{self, PlaybackState};
use tauri::{AppHandle, Manager, Runtime};

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

    /// A queue change before the restore is the user's: their queue wins and the saved one
    /// is dropped. `ready` changes only under the `pending` lock, like in `try_restore`.
    fn user_first(&self) {
        let Ok(mut pending) = self.pending.lock() else {
            return;
        };
        if self.ready.swap(true, Ordering::SeqCst) {
            return;
        }
        if pending.take().is_some() {
            log::info!("state: the queue changed before the restore; saved queue dropped");
        }
    }

    pub fn queue(&self, queue: &QueueSnapshot) {
        self.user_first();
        self.update(|latest| latest.queue = queue.clone());
    }

    /// Volume and position changes keep the saved queue waiting (only a queue change drops
    /// it); before the restore they are not saved.
    pub fn player(&self, player: &PlayerSnapshot) {
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
    pub fn try_restore<R: Runtime>(&self, app: &AppHandle<R>, complete: bool) {
        let Ok(mut pending) = self.pending.lock() else {
            return;
        };
        if self.ready.load(Ordering::SeqCst) {
            return;
        }
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
        // The restored values are the latest state already, so an exit before the player
        // applies them saves the same queue, not an empty one.
        if let Ok(mut latest) = self.latest.lock() {
            latest.queue = QueueSnapshot {
                entries: restored.ids.clone(),
                current: restored.current.map(|index| index as u32),
            };
            latest.position_ms = restored.position_ms;
            latest.volume = restored.volume;
        }
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
            self.ready.store(true, Ordering::SeqCst);
        }
    }

    /// Writes the state now when there is a change (or `force`, at exit) and writing is
    /// allowed. An unchanged state is not written again.
    pub fn save_now<R: Runtime>(&self, app: &AppHandle<R>, force: bool) {
        // One save at a time, so an older capture is never written after a newer one.
        let Ok(mut written) = self.written.lock() else {
            return;
        };
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
        if written.as_ref() == Some(&state) {
            return;
        }
        match state::save(&self.config, &state) {
            Ok(()) => *written = Some(state),
            Err(error) => log::warn!("state: cannot save: {error}"),
        }
    }

    /// The save thread: waits for a change, then SAVE_DELAY, then saves.
    pub fn spawn_saver<R: Runtime>(app: AppHandle<R>) {
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
    pub fn flush<R: Runtime>(&self, app: &AppHandle<R>) {
        self.save_now(app, true);
        if let Ok(mut latest) = self.latest.lock() {
            latest.stop = true;
            self.changed.notify_all();
        }
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;
    use std::sync::{Arc, RwLock};

    use clawdio_core::api::PlayerStatus;
    use clawdio_core::library::{FileStamp, LibraryIndex, NewTrack};
    use clawdio_core::state::STATE_FILE;
    use tauri::test::{mock_app, MockRuntime};

    use super::*;
    use crate::player::output::TestOutput;
    use crate::player::{PlayerEvents, Resolve};

    struct Quiet;

    impl PlayerEvents for Quiet {
        fn state(&self, _: PlayerSnapshot) {}
        fn queue(&self, _: &QueueSnapshot) {}
        fn position(&self, _: u32) {}
        fn message(&self, _: String) {}
    }

    fn track(rel_path: &str) -> NewTrack {
        NewTrack {
            rel_path: rel_path.into(),
            artist: "Artist".into(),
            album: "Album".into(),
            subfolder: None,
            title: rel_path.into(),
            tag_artist: None,
            track_no: None,
            disc: None,
            duration_ms: 1000,
            stamp: FileStamp::default(),
            has_picture: false,
        }
    }

    /// An app with the library `paths`, the music folder `music` and a saved queue.
    fn app(config: &Path, music: Option<&Path>, paths: &[&str]) -> tauri::App<MockRuntime> {
        let saved = PlaybackState {
            version: state::STATE_VERSION,
            queue: vec!["A/a.mp3".into(), "B/b.mp3".into()],
            current: Some(1),
            position_ms: 5_000,
            volume: 70,
        };
        state::save(config, &saved).unwrap();
        let app = mock_app();
        let mut index = LibraryIndex::default();
        for path in paths {
            index.insert(track(path));
        }
        app.manage(Library(Arc::new(RwLock::new(index))));
        app.manage(MusicRoot(Arc::new(RwLock::new(
            music.map(Path::to_path_buf),
        ))));
        let resolve: Resolve = Arc::new(|_| None);
        let (player, _thread) = PlayerHandle::spawn(TestOutput::default, Quiet, resolve);
        app.manage(player);
        app.manage(StateStore::load(config.to_path_buf()));
        app
    }

    fn file(config: &Path) -> Vec<u8> {
        std::fs::read(config.join(STATE_FILE)).unwrap()
    }

    fn snapshot(volume: u8) -> PlayerSnapshot {
        PlayerSnapshot {
            status: PlayerStatus::Stopped,
            volume,
            ..PlayerSnapshot::default()
        }
    }

    #[test]
    fn nothing_is_saved_before_the_restore_resolves() {
        let (config, music) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let app = app(config.path(), Some(music.path()), &["A/a.mp3"]);
        let store = app.state::<StateStore>();
        let before = file(config.path());
        store.player(&snapshot(20));
        store.try_restore(app.handle(), false);
        store.flush(app.handle());
        assert_eq!(file(config.path()), before, "B/b.mp3 waits for the scan");
    }

    #[test]
    fn a_volume_change_keeps_the_saved_queue_waiting() {
        let (config, music) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let app = app(config.path(), Some(music.path()), &["A/a.mp3", "B/b.mp3"]);
        let store = app.state::<StateStore>();
        store.player(&snapshot(20));
        store.try_restore(app.handle(), false);
        assert_eq!(store.latest.lock().unwrap().queue.entries.len(), 2);
        store.flush(app.handle());
        let saved = state::load(config.path()).unwrap();
        assert_eq!(saved.queue, ["A/a.mp3", "B/b.mp3"]);
        assert_eq!(saved.current, Some(1));
        assert_eq!(
            saved.position_ms, 5_000,
            "an exit before the player applies it keeps it"
        );
    }

    #[test]
    fn a_queue_change_by_the_user_drops_the_saved_queue() {
        let (config, music) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let app = app(config.path(), Some(music.path()), &["A/a.mp3", "B/b.mp3"]);
        let store = app.state::<StateStore>();
        let user = app
            .state::<Library>()
            .0
            .read()
            .unwrap()
            .track_at("A/a.mp3")
            .unwrap()
            .id;
        store.queue(&QueueSnapshot {
            entries: vec![user],
            current: Some(0),
        });
        store.try_restore(app.handle(), true);
        store.flush(app.handle());
        assert_eq!(state::load(config.path()).unwrap().queue, ["A/a.mp3"]);
    }

    #[test]
    fn with_the_music_folder_missing_the_file_stays_the_same() {
        let config = tempfile::tempdir().unwrap();
        let missing = config.path().join("no-such-folder");
        let app = app(config.path(), Some(&missing), &["A/a.mp3", "B/b.mp3"]);
        let store = app.state::<StateStore>();
        let before = file(config.path());
        store.queue(&QueueSnapshot::default());
        store.flush(app.handle());
        assert_eq!(file(config.path()), before);
    }
}
