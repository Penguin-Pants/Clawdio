//! Playback state persistence (P9.1, R27): restore `state.json` at startup and save it 2 s
//! after a change and on exit. Nothing is saved until the restore has resolved, and nothing
//! is written while the music folder is missing. The shuffle and repeat modes (P27) restore
//! at once: they do not wait for the library.
//!
//! The Library selection (P26, R37, D66) has its own pending value and ready flag, so a user
//! queue change does not drop it and a user selection change does not drop the saved queue.
//! It resolves after the queue: a restored current song wins (R37 v1.14). A save while one
//! part still waits writes that part unchanged from the file.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Condvar, Mutex};
use std::time::{Duration, Instant};

use clawdio_core::api::{
    LibrarySelectionIds, PlayerSnapshot, QueueSnapshot, RepeatMode, SelectionRestore,
};
use clawdio_core::library::TrackId;
use clawdio_core::state::{self, PlaybackState, SavedSelection};
use tauri::{AppHandle, Manager, Runtime};

use crate::events::{emit, LIBRARY_SELECTION_RESTORED};
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
    shuffle: bool,
    repeat: RepeatMode,
    /// The Library selection to save (R37).
    selection: Option<SavedSelection>,
    /// A change since the last save, and when it came.
    dirty_since: Option<Instant>,
    stop: bool,
}

/// The selection part of the restore (R37, D66).
struct SelectionPart {
    /// The saved selection that waits for the library. None once resolved or dropped.
    pending: Option<SavedSelection>,
    /// True once the restore resolved, the user changed the selection first, or the music
    /// folder changed.
    ready: bool,
    /// What `library_selection_restored` answers.
    answer: SelectionRestore,
    /// The current song of the restored queue: it wins over the saved selection.
    playing: Option<TrackId>,
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
    /// Locked after `pending` and before `latest`.
    selection: Mutex<SelectionPart>,
}

impl StateStore {
    /// Reads `state.json` from the config folder.
    pub fn load(config: PathBuf) -> Self {
        let pending = state::load(&config);
        let (shuffle, repeat) = pending.as_ref().map_or((false, RepeatMode::Off), |saved| {
            (saved.shuffle, saved.repeat)
        });
        let saved_selection = pending
            .as_ref()
            .and_then(|saved| saved.library_selection.clone());
        StateStore {
            selection: Mutex::new(SelectionPart {
                pending: saved_selection,
                ready: false,
                answer: SelectionRestore::Pending,
                playing: None,
            }),
            written: Mutex::new(pending.clone()),
            config,
            pending: Mutex::new(pending),
            ready: AtomicBool::new(false),
            // The saved modes are the latest state already, so an exit before the player
            // applies them saves the same modes, not off.
            latest: Mutex::new(Latest {
                volume: 100,
                shuffle,
                repeat,
                ..Latest::default()
            }),
            changed: Condvar::new(),
        }
    }

    /// Sends the saved shuffle and repeat modes to the player (P27, R27 v1.13). They do not
    /// depend on the library, so they apply at startup before the queue restore.
    pub fn restore_modes(&self, player: &PlayerHandle) {
        let Ok(latest) = self.latest.lock() else {
            return;
        };
        player.send(Command::SetShuffle(latest.shuffle));
        player.send(Command::SetRepeat(latest.repeat));
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
            latest.shuffle = player.shuffle;
            latest.repeat = player.repeat;
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
    /// full traversal ended) drops the missing ones (P9.1). Then the selection (R37).
    pub fn try_restore<R: Runtime>(&self, app: &AppHandle<R>, complete: bool) {
        self.restore_queue(app, complete);
        self.restore_selection(app, complete);
    }

    fn restore_queue<R: Runtime>(&self, app: &AppHandle<R>, complete: bool) {
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
        if let Ok(mut selection) = self.selection.lock() {
            selection.playing = restored
                .current
                .and_then(|index| restored.ids.get(index).copied());
        }
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

    /// Resolves the saved selection once the queue part is done (R37). The restored current
    /// song wins (R37 v1.14); else the saved selection, which waits for a complete traversal
    /// while a level is missing (R37.6). Emits `library-selection-restored` when it resolves.
    fn restore_selection<R: Runtime>(&self, app: &AppHandle<R>, complete: bool) {
        // The playing song decides, so the selection waits while the queue waits.
        let Ok(_pending) = self.pending.lock() else {
            return;
        };
        if !self.ready.load(Ordering::SeqCst) {
            return;
        }
        let Ok(mut part) = self.selection.lock() else {
            return;
        };
        if part.ready {
            return;
        }
        let resolved = {
            let library = app.state::<Library>();
            let Ok(index) = library.0.read() else {
                return;
            };
            let playing = part
                .playing
                .and_then(|song| state::playing_selection(song, &index));
            let resolved = match (playing, &part.pending) {
                (Some(playing), _) => Some(playing),
                (None, Some(saved)) => match state::resolve_selection(saved, &index, complete) {
                    Some(ids) => Some(ids),
                    None => {
                        log::info!("state: the saved selection waits for the scan");
                        return;
                    }
                },
                (None, None) => None,
            };
            resolved.map(|ids| (ids, state::capture_selection(ids, &index)))
        };
        part.pending = None;
        part.ready = true;
        part.answer = match resolved {
            Some((ids, _)) => SelectionRestore::Selection { selection: ids },
            None => SelectionRestore::None,
        };
        let answer = part.answer;
        drop(part);
        // The restored selection is the latest already, so an exit before the webview echoes
        // it saves it.
        if let (Some((_, saved)), Ok(mut latest)) = (resolved, self.latest.lock()) {
            latest.selection = Some(saved);
        }
        log::info!("state: Library selection restored");
        emit(app, LIBRARY_SELECTION_RESTORED, answer);
    }

    /// What `library_selection_restored` answers (R37).
    pub fn selection_answer(&self) -> SelectionRestore {
        self.selection
            .lock()
            .map_or(SelectionRestore::None, |part| part.answer)
    }

    /// A selection change in the webview (R37.2). One before the restore is the user's: the
    /// saved selection is dropped, and the saved queue stays.
    pub fn save_selection<R: Runtime>(&self, app: &AppHandle<R>, ids: LibrarySelectionIds) {
        let saved = {
            let library = app.state::<Library>();
            let Ok(index) = library.0.read() else {
                return;
            };
            state::capture_selection(ids, &index)
        };
        if let Ok(mut part) = self.selection.lock() {
            if !part.ready {
                part.ready = true;
                part.pending = None;
                part.answer = SelectionRestore::None;
                log::info!(
                    "state: the selection changed before the restore; saved selection dropped"
                );
            }
        }
        self.update(|latest| latest.selection = Some(saved));
    }

    /// A new music folder: the saved queue and selection belong to the old one. The next save
    /// writes no selection, and the webview drops a restore it still holds.
    pub fn new_folder<R: Runtime>(&self, app: &AppHandle<R>) {
        if let Ok(mut pending) = self.pending.lock() {
            pending.take();
            self.ready.store(true, Ordering::SeqCst);
            if let Ok(mut part) = self.selection.lock() {
                part.pending = None;
                part.ready = true;
                part.answer = SelectionRestore::None;
                part.playing = None;
            }
        }
        self.update(|latest| latest.selection = None);
        emit(app, LIBRARY_SELECTION_RESTORED, SelectionRestore::None);
    }

    /// Writes the state now when there is a change (or `force`, at exit) and writing is
    /// allowed. An unchanged state is not written again.
    pub fn save_now<R: Runtime>(&self, app: &AppHandle<R>, force: bool) {
        // One save at a time, so an older capture is never written after a newer one.
        let Ok(mut written) = self.written.lock() else {
            return;
        };
        let (ids, current, position_ms, volume, shuffle, repeat, selection) = {
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
                latest.shuffle,
                latest.repeat,
                latest.selection.clone(),
            )
        };
        // Each part that still waits is written as the file has it (D66).
        let waiting_queue = match self.pending.lock() {
            Ok(pending) if !self.ready.load(Ordering::SeqCst) => Some(pending.clone()),
            Ok(_) => None,
            Err(_) => return,
        };
        let (selection_ready, waiting_selection) = match self.selection.lock() {
            Ok(part) => (part.ready, part.pending.clone()),
            Err(_) => return,
        };
        if waiting_queue.is_some() && !selection_ready {
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
            let queue = match waiting_queue {
                Some(Some(saved)) => saved,
                Some(None) => PlaybackState {
                    version: state::STATE_VERSION,
                    ..PlaybackState::default()
                },
                None => state::capture(&ids, current, position_ms, volume, &index),
            };
            PlaybackState {
                shuffle,
                repeat,
                library_selection: if selection_ready {
                    selection
                } else {
                    waiting_selection
                },
                ..queue
            }
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
    use clawdio_core::state::{SavedAlbum, STATE_FILE};
    use tauri::test::{mock_app, MockRuntime};
    use tauri::Listener;

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

    /// A track whose artist is the first folder, and its album the second (else "Album").
    fn track(rel_path: &str) -> NewTrack {
        let parts: Vec<&str> = rel_path.split('/').collect();
        NewTrack {
            rel_path: rel_path.into(),
            artist: parts[0].into(),
            album: if parts.len() > 2 { parts[1] } else { "Album" }.into(),
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
            shuffle: true,
            repeat: RepeatMode::One,
            library_selection: None,
        };
        app_with(config, music, paths, &saved)
    }

    /// An app with the library `paths`, the music folder `music` and the saved state `saved`.
    fn app_with(
        config: &Path,
        music: Option<&Path>,
        paths: &[&str],
        saved: &PlaybackState,
    ) -> tauri::App<MockRuntime> {
        state::save(config, saved).unwrap();
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
    fn the_saved_modes_reach_the_player_at_startup_before_the_queue_restore() {
        let (config, music) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let app = app(config.path(), Some(music.path()), &["A/a.mp3"]);
        let store = app.state::<StateStore>();
        let player = app.state::<PlayerHandle>();
        store.restore_modes(&player);
        let state = player.state();
        assert!(state.shuffle);
        assert_eq!(state.repeat, RepeatMode::One);
        assert!(player.queue().entries.is_empty(), "B/b.mp3 still waits");
    }

    #[test]
    fn a_mode_change_is_saved_with_the_queue() {
        let (config, music) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let app = app(config.path(), Some(music.path()), &["A/a.mp3", "B/b.mp3"]);
        let store = app.state::<StateStore>();
        store.try_restore(app.handle(), false);
        store.player(&PlayerSnapshot {
            shuffle: false,
            repeat: RepeatMode::All,
            ..snapshot(70)
        });
        store.flush(app.handle());
        let saved = state::load(config.path()).unwrap();
        assert!(!saved.shuffle);
        assert_eq!(saved.repeat, RepeatMode::All);
        assert_eq!(saved.queue, ["A/a.mp3", "B/b.mp3"]);
    }

    #[test]
    fn an_exit_before_the_player_applies_the_saved_modes_keeps_them() {
        let (config, music) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let app = app(config.path(), Some(music.path()), &["A/a.mp3", "B/b.mp3"]);
        let store = app.state::<StateStore>();
        store.try_restore(app.handle(), false);
        store.flush(app.handle());
        let saved = state::load(config.path()).unwrap();
        assert!(saved.shuffle);
        assert_eq!(saved.repeat, RepeatMode::One);
    }

    /// The saved selection X, X/A, X/A/2.mp3 (R37).
    fn saved_selection() -> SavedSelection {
        SavedSelection {
            artist: Some("X".into()),
            album: Some(SavedAlbum {
                artist: "X".into(),
                name: "A".into(),
            }),
            song: Some("X/A/2.mp3".into()),
        }
    }

    const LIBRARY: [&str; 4] = ["X/A/1.mp3", "X/A/2.mp3", "X/B/1.mp3", "Y/C/1.mp3"];

    /// A saved queue of `queue` with `current`, and the saved selection.
    fn with_selection(queue: &[&str], current: Option<usize>) -> PlaybackState {
        PlaybackState {
            version: state::STATE_VERSION,
            queue: queue.iter().map(|path| path.to_string()).collect(),
            current,
            volume: 70,
            library_selection: Some(saved_selection()),
            ..PlaybackState::default()
        }
    }

    /// The ids of the songs and groups in the app's library.
    fn lookup(
        app: &tauri::App<MockRuntime>,
    ) -> impl Fn(&str, Option<&str>, Option<&str>) -> LibrarySelectionIds + '_ {
        move |artist, album, song| {
            let library = app.state::<Library>();
            let index = library.0.read().unwrap();
            LibrarySelectionIds {
                artist: index.live_artist(artist),
                album: album.and_then(|name| index.live_album(artist, name)),
                song: song.map(|path| index.track_at(path).unwrap().id),
            }
        }
    }

    /// Records the `library-selection-restored` payloads.
    fn events(app: &tauri::App<MockRuntime>) -> Arc<std::sync::Mutex<Vec<String>>> {
        let seen = Arc::new(std::sync::Mutex::new(Vec::new()));
        let sink = seen.clone();
        app.listen_any(LIBRARY_SELECTION_RESTORED, move |event| {
            sink.lock().unwrap().push(event.payload().to_owned());
        });
        seen
    }

    fn selection(ids: LibrarySelectionIds) -> SelectionRestore {
        SelectionRestore::Selection { selection: ids }
    }

    #[test]
    fn the_restore_answers_pending_until_it_resolves_then_emits_the_selection() {
        let (config, music) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        // X/A/2.mp3 is not in the cache yet: the selection waits for the end of the scan.
        let app = app_with(
            config.path(),
            Some(music.path()),
            &["X/A/1.mp3", "Y/C/1.mp3"],
            &with_selection(&["Y/C/1.mp3"], None),
        );
        let seen = events(&app);
        let store = app.state::<StateStore>();
        assert_eq!(store.selection_answer(), SelectionRestore::Pending);
        store.try_restore(app.handle(), false);
        assert_eq!(
            store.selection_answer(),
            SelectionRestore::Pending,
            "the song waits"
        );
        assert!(seen.lock().unwrap().is_empty());
        app.state::<Library>()
            .0
            .write()
            .unwrap()
            .insert(track("X/A/2.mp3"));
        store.try_restore(app.handle(), true);
        let expected = selection(lookup(&app)("X", Some("A"), Some("X/A/2.mp3")));
        assert_eq!(store.selection_answer(), expected);
        assert_eq!(seen.lock().unwrap().len(), 1, "one event after the resolve");
        assert_eq!(
            seen.lock().unwrap()[0],
            serde_json::to_string(&expected).unwrap()
        );
    }

    #[test]
    fn the_restored_current_song_wins_over_the_saved_selection() {
        let (config, music) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let app = app_with(
            config.path(),
            Some(music.path()),
            &LIBRARY,
            &with_selection(&["X/A/1.mp3", "Y/C/1.mp3"], Some(1)),
        );
        let store = app.state::<StateStore>();
        store.try_restore(app.handle(), false);
        assert_eq!(
            store.selection_answer(),
            selection(lookup(&app)("Y", Some("C"), Some("Y/C/1.mp3")))
        );
        store.flush(app.handle());
        let saved = state::load(config.path())
            .unwrap()
            .library_selection
            .unwrap();
        assert_eq!(
            saved.song.as_deref(),
            Some("Y/C/1.mp3"),
            "an exit before the echo keeps it"
        );
    }

    #[test]
    fn the_selection_waits_while_the_saved_queue_waits() {
        let (config, music) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let app = app_with(
            config.path(),
            Some(music.path()),
            &LIBRARY,
            &with_selection(&["X/A/1.mp3", "Z/gone.mp3"], Some(0)),
        );
        let store = app.state::<StateStore>();
        store.try_restore(app.handle(), false);
        assert_eq!(store.selection_answer(), SelectionRestore::Pending);
        store.try_restore(app.handle(), true);
        assert_eq!(
            store.selection_answer(),
            selection(lookup(&app)("X", Some("A"), Some("X/A/1.mp3")))
        );
    }

    #[test]
    fn a_user_selection_before_the_restore_drops_only_the_saved_selection() {
        let (config, music) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        // The saved queue waits for Z/gone.mp3 (the scan has not ended).
        let app = app_with(
            config.path(),
            Some(music.path()),
            &LIBRARY,
            &with_selection(&["Y/C/1.mp3", "Z/gone.mp3"], None),
        );
        let seen = events(&app);
        let store = app.state::<StateStore>();
        store.try_restore(app.handle(), false);
        let user = lookup(&app)("Y", None, None);
        store.save_selection(app.handle(), user);
        assert_eq!(store.selection_answer(), SelectionRestore::None);
        // An exit while the queue waits keeps the saved queue and writes the user's selection.
        store.flush(app.handle());
        let file = state::load(config.path()).unwrap();
        assert_eq!(file.queue, ["Y/C/1.mp3", "Z/gone.mp3"]);
        assert_eq!(file.library_selection.unwrap().artist.as_deref(), Some("Y"));
        // The queue still restores; the dropped selection does not come back.
        store.try_restore(app.handle(), true);
        assert_eq!(app.state::<PlayerHandle>().queue().entries.len(), 1);
        assert_eq!(store.selection_answer(), SelectionRestore::None);
        assert!(seen.lock().unwrap().is_empty());
    }

    #[test]
    fn a_queue_edit_before_the_restore_drops_only_the_saved_queue() {
        let (config, music) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let app = app_with(
            config.path(),
            Some(music.path()),
            &LIBRARY,
            &with_selection(&["Y/C/1.mp3"], Some(0)),
        );
        let store = app.state::<StateStore>();
        store.queue(&QueueSnapshot::default());
        store.try_restore(app.handle(), false);
        assert!(app.state::<PlayerHandle>().queue().entries.is_empty());
        assert_eq!(
            store.selection_answer(),
            selection(lookup(&app)("X", Some("A"), Some("X/A/2.mp3"))),
            "no restored song: the saved selection"
        );
    }

    #[test]
    fn an_exit_with_the_queue_ready_and_the_selection_waiting_keeps_the_saved_selection() {
        let (config, music) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        // The saved album X/A is not in the cache yet.
        let app = app_with(
            config.path(),
            Some(music.path()),
            &["X/B/1.mp3", "Y/C/1.mp3"],
            &with_selection(&["Y/C/1.mp3"], None),
        );
        let store = app.state::<StateStore>();
        store.try_restore(app.handle(), false);
        assert_eq!(store.selection_answer(), SelectionRestore::Pending);
        store.player(&snapshot(30));
        store.flush(app.handle());
        let file = state::load(config.path()).unwrap();
        assert_eq!(file.volume, 30, "the ready queue part is written");
        assert_eq!(file.library_selection, Some(saved_selection()));
    }

    #[test]
    fn a_selection_saved_after_the_restore_resolves_after_a_reload() {
        let (config, music) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let app = app_with(
            config.path(),
            Some(music.path()),
            &LIBRARY,
            &with_selection(&["Y/C/1.mp3"], None),
        );
        let store = app.state::<StateStore>();
        store.try_restore(app.handle(), true);
        // The echo of the restored selection does not drop it.
        let restored = lookup(&app)("X", Some("A"), Some("X/A/2.mp3"));
        store.save_selection(app.handle(), restored);
        assert_eq!(store.selection_answer(), selection(restored));
        let chosen = lookup(&app)("X", Some("B"), None);
        store.save_selection(app.handle(), chosen);
        store.flush(app.handle());
        let reloaded = app_with(
            config.path(),
            Some(music.path()),
            &LIBRARY,
            &state::load(config.path()).unwrap(),
        );
        let store = reloaded.state::<StateStore>();
        store.try_restore(reloaded.handle(), true);
        assert_eq!(
            store.selection_answer(),
            selection(lookup(&reloaded)("X", Some("B"), None))
        );
    }

    #[test]
    fn a_new_music_folder_drops_the_selection_and_the_next_save_writes_none() {
        let (config, music) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let app = app_with(
            config.path(),
            Some(music.path()),
            &["X/A/1.mp3"],
            &with_selection(&["X/A/1.mp3"], None),
        );
        let seen = events(&app);
        let store = app.state::<StateStore>();
        store.save_selection(app.handle(), lookup(&app)("X", None, None));
        store.new_folder(app.handle());
        assert_eq!(store.selection_answer(), SelectionRestore::None);
        assert_eq!(seen.lock().unwrap().as_slice(), [r#"{"kind":"none"}"#]);
        store.flush(app.handle());
        assert_eq!(state::load(config.path()).unwrap().library_selection, None);
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
