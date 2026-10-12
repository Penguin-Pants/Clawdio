//! Lyrics of a song (P13.3, R9): read in Rust from the song's folder or tags (D13).

use clawdio_core::api::Lyrics;
use tauri::{AppHandle, Manager, Runtime};

use super::CommandResult;
use crate::events::{emit, LYRICS_CHANGED};
use crate::state::{Library, LyricsState, MusicRoot};

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
}
