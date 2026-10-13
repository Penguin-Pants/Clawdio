//! Lyrics of a song (P13.3, R9): read in Rust from the song's folder or tags (D13).

use clawdio_core::api::{IpcError, JobProgress, Lyrics};
use clawdio_core::net::lyrics::{self as online_lyrics, LyricsQuery};
use clawdio_core::net::NetError;
use tauri::{AppHandle, Manager, Runtime};

use super::CommandResult;
use crate::events::{emit, JOB_PROGRESS, LYRICS_CHANGED, STATUS_MESSAGE};
use crate::online::Online;
use crate::state::{Library, LyricsState, MusicRoot};

/// The status line job id of "Fetch lyrics".
pub const LYRICS_JOB: &str = "lyrics";

/// The lyrics of a track, or None when it has no source or is not in the library.
fn read<R: Runtime>(app: &AppHandle<R>, track: u32) -> Option<Lyrics> {
    // One lock at a time: the player's resolver takes these two in the other order.
    let rel_path = app
        .state::<Library>()
        .0
        .read()
        .ok()?
        .rel_path(track)?
        .to_owned();
    let path = app
        .state::<MusicRoot>()
        .0
        .read()
        .ok()?
        .as_ref()?
        .join(rel_path);
    clawdio_core::lyrics::load(&path)
}

/// The lyrics of a track, or null when no source exists (the widget then offers "Fetch
/// lyrics"). Async, so the file and tag reads stay off the main thread.
#[tauri::command]
pub async fn lyrics_get(app: AppHandle, track: u32) -> CommandResult<Option<Lyrics>> {
    Ok(get(&app, track))
}

fn get<R: Runtime>(app: &AppHandle<R>, track: u32) -> Option<Lyrics> {
    let lyrics = read(app, track);
    // Only the playing song's lyrics count for the scan check: a late answer for the song
    // before must not replace them.
    let state = app.state::<LyricsState>();
    let playing = state.song.lock().is_ok_and(|song| *song == Some(track));
    if let (true, Ok(mut served)) = (playing, state.served.lock()) {
        *served = Some((track, lyrics.clone()));
    }
    lyrics
}

fn fetch_error(message: impl Into<String>) -> IpcError {
    IpcError {
        code: "lyrics_fetch".into(),
        message: message.into(),
    }
}

fn progress<R: Runtime>(app: &AppHandle<R>, text: Option<&str>) {
    emit(
        app,
        JOB_PROGRESS,
        JobProgress {
            id: LYRICS_JOB.into(),
            text: text.map(str::to_owned),
            cancelable: true,
        },
    );
}

/// "Fetch lyrics" (P15): asks LRCLIB for the song and saves `.lrc` or `.txt` next to it.
/// True when lyrics were saved; the widget reads them on `lyrics-changed`. An error when
/// Online lookups are off (no request) or the folder is read-only (checked first).
#[tauri::command]
pub async fn lyrics_fetch(app: AppHandle, track: u32) -> CommandResult<bool> {
    fetch(&app, track).await
}

async fn fetch<R: Runtime>(app: &AppHandle<R>, track: u32) -> CommandResult<bool> {
    let gate = app
        .try_state::<Online>()
        .map(|online| online.gate.clone())
        .ok_or_else(|| fetch_error("Online lookups are not available. The log has the reason"))?;
    if !gate.is_on() {
        return Err(fetch_error("Online lookups are off"));
    }
    let (song, query) = {
        let library = app.state::<Library>();
        let index = library.0.read().map_err(|_| super::lock_error())?;
        let song = index
            .track(track)
            .ok_or_else(|| fetch_error("The song is not in the library"))?;
        (song.rel_path().to_owned(), LyricsQuery::for_track(song))
    };
    let root = app
        .state::<MusicRoot>()
        .0
        .read()
        .map_err(|_| super::lock_error())?
        .clone()
        .ok_or_else(|| fetch_error("Choose a music folder first"))?;
    let song = root.join(song);
    // File work runs on a blocking thread, so a slow disk never stalls the runtime.
    let probe = song.clone();
    tauri::async_runtime::spawn_blocking(move || online_lyrics::check_writable(&probe))
        .await
        .map_err(|_| fetch_error("The song's folder cannot be checked"))?
        .map_err(|error| fetch_error(error.to_string()))?;
    let token = app.state::<LyricsState>().fetches.token(&gate);
    progress(app, Some("Fetching lyrics"));
    let found = online_lyrics::fetch(&gate, &query, &token).await;
    progress(app, None);
    let found = match found {
        Err(NetError::Canceled) => {
            emit(app, STATUS_MESSAGE, "Lyrics fetch canceled");
            return Ok(false);
        }
        found => found.map_err(|error| fetch_error(format!("Cannot fetch lyrics: {error}")))?,
    };
    let Some(found) = found else {
        emit(app, STATUS_MESSAGE, "No lyrics found");
        return Ok(false);
    };
    // The write runs under the commit lock, so no file appears after Cancel returns.
    let commits = gate.commit_lock();
    let saved = tauri::async_runtime::spawn_blocking(move || {
        commits.run(&token, || online_lyrics::save(&song, &found))
    })
    .await
    .map_err(|_| fetch_error("The lyrics file cannot be written"))?;
    let Ok(saved) = saved else {
        emit(app, STATUS_MESSAGE, "Lyrics fetch canceled");
        return Ok(false);
    };
    saved.map_err(|error| fetch_error(error.to_string()))?;
    emit(app, STATUS_MESSAGE, "Lyrics saved");
    emit(app, LYRICS_CHANGED, ());
    Ok(true)
}

/// Cancel on the status line (R5): stops every running fetch; no file is written after it.
pub fn cancel<R: Runtime>(app: &AppHandle<R>) {
    let gate = app.try_state::<Online>().map(|online| online.gate.clone());
    app.state::<LyricsState>().fetches.cancel(gate.as_deref());
}

/// After a complete scan: when the shown song's lyrics source changed, tell the widget
/// (section 5: folder edits appear after Rescan).
pub fn after_scan<R: Runtime>(app: &AppHandle<R>) {
    let Some((track, old)) = app
        .state::<LyricsState>()
        .served
        .lock()
        .ok()
        .and_then(|served| served.clone())
    else {
        return;
    };
    let new = read(app, track);
    if new == old {
        return;
    }
    if let Ok(mut served) = app.state::<LyricsState>().served.lock() {
        *served = Some((track, new));
    }
    emit(app, LYRICS_CHANGED, ());
}

/// The playing song changed: the widget reads the new song's lyrics.
pub fn song_changed<R: Runtime>(app: &AppHandle<R>, song: Option<u32>) {
    let state = app.state::<LyricsState>();
    let changed = state
        .song
        .lock()
        .is_ok_and(|mut current| std::mem::replace(&mut *current, song) != song);
    if changed {
        emit(app, LYRICS_CHANGED, ());
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::{Arc, RwLock};

    use clawdio_core::library::{FileStamp, LibraryIndex, NewTrack};
    use tauri::test::{mock_app, MockRuntime};
    use tauri::Listener;

    use super::*;

    /// An app with one track, "A/B/01 Song.mp3", in `music`, and a counter of
    /// `lyrics-changed` events.
    fn app(music: &Path) -> (tauri::App<MockRuntime>, Arc<AtomicU32>) {
        std::fs::create_dir_all(music.join("A/B")).unwrap();
        std::fs::write(music.join("A/B/01 Song.mp3"), b"").unwrap();
        let app = mock_app();
        let mut index = LibraryIndex::default();
        index.insert(NewTrack {
            rel_path: "A/B/01 Song.mp3".into(),
            artist: "A".into(),
            album: "B".into(),
            subfolder: None,
            title: "Song".into(),
            tag_artist: None,
            track_no: None,
            disc: None,
            duration_ms: 1000,
            stamp: FileStamp::default(),
            has_picture: false,
        });
        app.manage(Library(Arc::new(RwLock::new(index))));
        app.manage(MusicRoot(Arc::new(RwLock::new(Some(music.to_path_buf())))));
        app.manage(LyricsState::default());
        let events = Arc::new(AtomicU32::new(0));
        let counter = events.clone();
        app.listen_any(LYRICS_CHANGED, move |_| {
            counter.fetch_add(1, Ordering::SeqCst);
        });
        (app, events)
    }

    /// P13-AC6: adding, editing and removing the `.lrc` file, then a scan, tells the widget;
    /// a scan with no change does not.
    #[test]
    fn a_scan_reports_a_changed_lyrics_source_of_the_shown_song() {
        let music = tempfile::tempdir().unwrap();
        let (app, events) = app(music.path());
        let handle = app.handle();
        let lrc = music.path().join("A/B/01 Song.lrc");
        song_changed(handle, Some(0));
        events.store(0, Ordering::SeqCst);
        assert_eq!(get(handle, 0), None);
        after_scan(handle);
        assert_eq!(events.load(Ordering::SeqCst), 0, "no change");
        std::fs::write(&lrc, "[00:01.00]one").unwrap();
        after_scan(handle);
        assert_eq!(events.load(Ordering::SeqCst), 1, "added");
        assert_eq!(
            get(handle, 0).map(|lyrics| lyrics.text).as_deref(),
            Some("one")
        );
        std::fs::write(&lrc, "[00:01.00]two").unwrap();
        after_scan(handle);
        assert_eq!(events.load(Ordering::SeqCst), 2, "edited");
        std::fs::remove_file(&lrc).unwrap();
        after_scan(handle);
        assert_eq!(events.load(Ordering::SeqCst), 3, "removed");
        after_scan(handle);
        assert_eq!(events.load(Ordering::SeqCst), 3, "no change");
    }

    #[test]
    fn a_new_playing_song_tells_the_widget_once() {
        let music = tempfile::tempdir().unwrap();
        let (app, events) = app(music.path());
        let handle = app.handle();
        song_changed(handle, Some(0));
        song_changed(handle, Some(0));
        assert_eq!(events.load(Ordering::SeqCst), 1);
        song_changed(handle, None);
        assert_eq!(events.load(Ordering::SeqCst), 2);
    }

    /// A late answer for the song before does not replace the playing song's lyrics.
    #[test]
    fn only_the_playing_song_counts_for_the_scan_check() {
        let music = tempfile::tempdir().unwrap();
        let (app, events) = app(music.path());
        let handle = app.handle();
        song_changed(handle, Some(0));
        events.store(0, Ordering::SeqCst);
        assert_eq!(get(handle, 0), None);
        assert_eq!(get(handle, 99), None, "a late answer for another song");
        std::fs::write(music.path().join("A/B/01 Song.lrc"), "one").unwrap();
        after_scan(handle);
        assert_eq!(events.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn an_unknown_track_has_no_lyrics() {
        let music = tempfile::tempdir().unwrap();
        let (app, _) = app(music.path());
        assert_eq!(get(app.handle(), 99), None);
    }

    /// The app with Online lookups pointed at a mock LRCLIB.
    fn online(app: &tauri::App<MockRuntime>, server: &httpmock::MockServer, on: bool) {
        use clawdio_core::net::{NetConfig, OnlineGate, Url};
        let mut config = NetConfig::production("Test/1 ( https://example.org )".into());
        config.lrclib = Url::parse(&format!("{}/", server.base_url())).unwrap();
        config.allowed_hosts = vec!["127.0.0.1".into()];
        config.https_only = false;
        config.use_proxy = false;
        app.manage(Online::new(OnlineGate::new(config, on).unwrap()));
    }

    /// P15-AC3, P15-AC7: found lyrics are saved and the widget is told at once.
    #[test]
    fn fetched_lyrics_are_saved_and_announced() {
        let music = tempfile::tempdir().unwrap();
        let (app, events) = app(music.path());
        let server = httpmock::MockServer::start();
        server.mock(|when, then| {
            when.path("/api/get").query_param("track_name", "Song");
            then.status(200)
                .body(r#"{"duration":1.0,"syncedLyrics":"[00:00.50]hi","plainLyrics":"hi"}"#);
        });
        online(&app, &server, true);
        let saved = tauri::async_runtime::block_on(fetch(app.handle(), 0));
        assert_eq!(saved, Ok(true));
        let lrc = music.path().join("A/B/01 Song.lrc");
        assert_eq!(std::fs::read_to_string(lrc).unwrap(), "[00:00.50]hi\n");
        assert_eq!(events.load(Ordering::SeqCst), 1);
        assert_eq!(
            get(app.handle(), 0).map(|lyrics| lyrics.text).as_deref(),
            Some("hi")
        );
    }

    /// R5: Cancel on the status line stops a slow fetch at once, and no file is written.
    #[test]
    fn cancel_stops_a_slow_fetch_and_writes_nothing() {
        let music = tempfile::tempdir().unwrap();
        let (app, events) = app(music.path());
        let server = httpmock::MockServer::start();
        let slow = server.mock(|when, then| {
            when.path("/api/get");
            then.status(200)
                .delay(std::time::Duration::from_secs(10))
                .body(r#"{"duration":1.0,"syncedLyrics":"[00:00.50]hi","plainLyrics":"hi"}"#);
        });
        online(&app, &server, true);
        let handle = app.handle().clone();
        let started = std::time::Instant::now();
        let fetching =
            std::thread::spawn(move || tauri::async_runtime::block_on(fetch(&handle, 0)));
        // Cancel once the request is out: a cancel before the fetch starts has nothing to stop.
        while slow.calls() == 0 {
            assert!(started.elapsed() < std::time::Duration::from_secs(5));
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        cancel(app.handle());
        assert_eq!(fetching.join().unwrap(), Ok(false));
        assert!(started.elapsed() < std::time::Duration::from_secs(5));
        assert!(!music.path().join("A/B/01 Song.lrc").exists());
        assert_eq!(events.load(Ordering::SeqCst), 0);
    }

    /// P15-AC4, P15-AC6: no result writes nothing; with the switch off no request is made.
    #[test]
    fn no_result_or_switch_off_writes_nothing() {
        let music = tempfile::tempdir().unwrap();
        let (app, events) = app(music.path());
        let server = httpmock::MockServer::start();
        let any = server.mock(|when, then| {
            when.path_includes("/api/");
            then.status(404).body("[]");
        });
        online(&app, &server, false);
        let result = tauri::async_runtime::block_on(fetch(app.handle(), 0));
        assert_eq!(
            result.map_err(|error| error.message),
            Err("Online lookups are off".into())
        );
        assert_eq!(any.calls(), 0);
        app.state::<Online>().gate.set_on(true);
        let result = tauri::async_runtime::block_on(fetch(app.handle(), 0));
        assert_eq!(result, Ok(false));
        assert_eq!(any.calls(), 2, "get, then search");
        assert_eq!(
            std::fs::read_dir(music.path().join("A/B")).unwrap().count(),
            1
        );
        assert_eq!(events.load(Ordering::SeqCst), 0);
    }
}
