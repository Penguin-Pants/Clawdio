//! The artwork job (P14.5 to P14.7): looks up album art after a complete scan while Online
//! lookups are on. One album at a time; the status line shows progress with Cancel.

use std::sync::{Arc, Mutex};

use clawdio_core::api::JobProgress;
use clawdio_core::artwork::COVER_FILE;
use clawdio_core::library::{AlbumId, CoverInfo, CoverState};
use clawdio_core::net::artwork::{self, AlbumTarget, Lookup, LookupError};
use clawdio_core::net::{CancellationToken, NetConfig, NetError, OnlineGate};
use tauri::{AppHandle, Manager, Runtime};

use crate::events::{emit, JOB_PROGRESS, STATUS_MESSAGE};
use crate::state::{Library, MusicRoot};
use crate::thumbs::ArtService;

pub const ARTWORK_JOB: &str = "artwork";

#[derive(Default)]
struct JobState {
    /// The running job's token.
    running: Option<CancellationToken>,
    /// A scan ended while the job ran: run again when it ends.
    again: bool,
    /// The startup scan ended with a full traversal (P14-AC15).
    scanned: bool,
    /// "Retry lookup": this album goes first in the next pass and reports its result.
    first: Option<AlbumId>,
}

/// The gate and the job state, managed by the app.
pub struct Online {
    pub gate: Arc<OnlineGate>,
    job: Mutex<JobState>,
}

impl Online {
    pub fn new(gate: OnlineGate) -> Self {
        Online {
            gate: Arc::new(gate),
            job: Mutex::new(JobState::default()),
        }
    }
}

/// `<productName>/<version> ( <repository URL> )` (R8, R31). The names come from the app
/// configuration and the package, not from literals (D34).
pub fn user_agent<R: Runtime>(app: &AppHandle<R>) -> String {
    let info = app.package_info();
    format!(
        "{}/{} ( {} )",
        info.name,
        info.version,
        env!("CARGO_PKG_REPOSITORY")
    )
}

/// The production gate. A client that cannot be built leaves the app offline.
pub fn gate<R: Runtime>(app: &AppHandle<R>, on: bool) -> Option<OnlineGate> {
    OnlineGate::new(NetConfig::production(user_agent(app)), on)
        .inspect_err(|error| log::error!("net: cannot build the HTTP client: {error}"))
        .ok()
}

fn progress<R: Runtime>(app: &AppHandle<R>, text: Option<String>) {
    emit(
        app,
        JOB_PROGRESS,
        JobProgress {
            id: ARTWORK_JOB.into(),
            text,
            cancelable: true,
        },
    );
}

/// A complete scan ended (P14.6): the job runs when the switch is on.
pub fn scan_done<R: Runtime>(app: &AppHandle<R>) {
    let Some(online) = app.try_state::<Online>() else {
        return;
    };
    if let Ok(mut job) = online.job.lock() {
        job.scanned = true;
    };
    start(app, false);
}

/// The switch changed (R7): off cancels the queue and drops in-flight requests; on starts
/// the job once the startup scan has ended.
pub fn switch<R: Runtime>(app: &AppHandle<R>, on: bool) {
    let Some(online) = app.try_state::<Online>() else {
        return;
    };
    online.gate.set_on(on);
    if on {
        start(app, false);
    }
}

/// Cancel on the status line: stops the job; no file is written after it.
pub fn cancel<R: Runtime>(app: &AppHandle<R>) {
    let Some(online) = app.try_state::<Online>() else {
        return;
    };
    if let Ok(mut job) = online.job.lock() {
        job.again = false;
        job.first = None;
        if let Some(token) = &job.running {
            token.cancel();
        }
    };
    // A write that passed its token check ends first; then the job writes nothing more.
    online.gate.wait_commits();
}

/// The shared token of a user-started lookup kind ("Fetch lyrics", "Fill missing
/// metadata"): Cancel on the status line stops every running request of that kind (R5).
#[derive(Default)]
pub struct CancelSlot(std::sync::Mutex<Option<CancellationToken>>);

impl CancelSlot {
    /// A token for one request: a child of the slot's token, which is a child of the gate's
    /// job token, so Cancel and the Online switch both stop it.
    pub fn token(&self, gate: &OnlineGate) -> CancellationToken {
        let Ok(mut parent) = self.0.lock() else {
            return gate.job_token();
        };
        let live = parent
            .as_ref()
            .filter(|token| !token.is_cancelled())
            .cloned();
        let parent = live.unwrap_or_else(|| parent.insert(gate.job_token()).clone());
        parent.child_token()
    }

    /// Stops every request of this kind, then waits until no final write runs.
    pub fn cancel(&self, gate: Option<&OnlineGate>) {
        if let Some(token) = self.0.lock().ok().and_then(|mut parent| parent.take()) {
            token.cancel();
        }
        if let Some(gate) = gate {
            gate.wait_commits();
        }
    }
}

/// Clears the running slot if the job task ends by a panic, so a later start works.
struct RunningGuard<R: Runtime>(AppHandle<R>);

impl<R: Runtime> Drop for RunningGuard<R> {
    fn drop(&mut self) {
        if std::thread::panicking() {
            if let Some(online) = self.0.try_state::<Online>() {
                if let Ok(mut job) = online.job.lock() {
                    job.running = None;
                }
            }
        }
    }
}

/// Starts the job, or asks the running one to run again with the new library. `now` skips
/// the wait for the startup scan ("Retry lookup").
fn start<R: Runtime>(app: &AppHandle<R>, now: bool) {
    let Some(online) = app.try_state::<Online>() else {
        return;
    };
    if !online.gate.is_on() {
        return;
    }
    let token = {
        let Ok(mut job) = online.job.lock() else {
            return;
        };
        if !job.scanned && !now {
            return;
        }
        if job.running.is_some() {
            // Also after a Cancel or a switch-off that the task has not seen yet: the task
            // runs again with a new token when it ends.
            job.again = true;
            return;
        }
        let token = online.gate.job_token();
        job.running = Some(token.clone());
        token
    };
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let _guard = RunningGuard(app.clone());
        let mut token = token;
        loop {
            run(&app, &token).await;
            let Some(online) = app.try_state::<Online>() else {
                return;
            };
            let Ok(mut job) = online.job.lock() else {
                return;
            };
            if job.again && online.gate.is_on() {
                job.again = false;
                token = online.gate.job_token();
                job.running = Some(token.clone());
            } else {
                job.running = None;
                job.again = false;
                return;
            }
        }
    });
}

/// The candidates and the music folder, read under the locks; no file is read (D44).
fn targets<R: Runtime>(app: &AppHandle<R>) -> Option<(std::path::PathBuf, Vec<AlbumTarget>)> {
    let root = app.state::<MusicRoot>().0.read().ok()?.clone()?;
    let targets = artwork::candidates(&*app.state::<Library>().0.read().ok()?);
    Some((root, targets))
}

/// One pass over the candidates.
async fn run<R: Runtime>(app: &AppHandle<R>, token: &CancellationToken) {
    let Some((root, mut targets)) = targets(app) else {
        return;
    };
    let gate = app.state::<Online>().gate.clone();
    let first = app
        .state::<Online>()
        .job
        .lock()
        .ok()
        .and_then(|mut job| job.first.take());
    if let Some(index) =
        first.and_then(|album| targets.iter().position(|target| target.album == album))
    {
        let target = targets.remove(index);
        targets.insert(0, target);
    }
    if targets.is_empty() {
        return;
    }
    let total = targets.len();
    let mut saved = 0;
    for (number, target) in targets.iter().enumerate() {
        if token.is_cancelled() {
            break;
        }
        progress(
            app,
            Some(format!(
                "Fetching artwork: {} of {total} albums",
                number + 1
            )),
        );
        let old_key = ArtService::input(app, target.album).map(|(_, key)| key);
        let result = artwork::lookup(&gate, &root, target, token).await;
        if Some(target.album) == first {
            emit(app, STATUS_MESSAGE, retry_message(&result));
        }
        match result {
            Ok(Lookup::Saved) => {
                saved += 1;
                cover_saved(app, &root, target, old_key.as_deref());
            }
            Ok(Lookup::NoMatch | Lookup::NoArt) => sidecar_written(app, &root, target),
            Ok(_) => {}
            Err(LookupError::Net(NetError::Off | NetError::Canceled)) => break,
            Err(LookupError::Net(
                error @ (NetError::Network(_) | NetError::Status(429 | 500..=599)),
            )) => {
                // No marker: the album and the rest are tried at the next startup (R8).
                log::warn!("art: lookups stop until the next start: {error}");
                break;
            }
            Err(error) => log::warn!("art: {}/{}: {error}", target.artist, target.name),
        }
    }
    progress(app, None);
    if saved > 0 {
        let text = if saved == 1 {
            "Fetched 1 album cover".to_owned()
        } else {
            format!("Fetched {saved} album covers")
        };
        emit(app, STATUS_MESSAGE, text);
    }
}

/// A marker changed `sidecar.json` but no song value: the index keeps the new stamp, so the
/// next scan does not read the album's songs again.
fn sidecar_written<R: Runtime>(app: &AppHandle<R>, root: &std::path::Path, target: &AlbumTarget) {
    let stamp = clawdio_core::artwork::stamp(
        &root
            .join(&target.folder)
            .join(clawdio_core::sidecar::SIDECAR_FILE),
    );
    if let Ok(mut index) = app.state::<Library>().0.write() {
        index.set_sidecar(&target.artist, &target.name, stamp);
    }
}

/// A saved `cover.jpg`: the index marks the cover valid, the old thumbnails go and new ones
/// are made, so the UI and the OS panel update at once (P10.5, P14.5).
fn cover_saved<R: Runtime>(
    app: &AppHandle<R>,
    root: &std::path::Path,
    target: &AlbumTarget,
    old_key: Option<&str>,
) {
    let path = root.join(&target.folder).join(COVER_FILE);
    let file = clawdio_core::artwork::cover_files(&root.join(&target.folder))
        .into_iter()
        .find(|(found, _)| *found == path)
        .map(|(_, stamp)| (COVER_FILE.to_owned(), stamp));
    if let Ok(mut index) = app.state::<Library>().0.write() {
        index.set_cover(
            &target.artist,
            &target.name,
            CoverInfo {
                state: CoverState::Valid,
                file,
            },
        );
    }
    app.state::<ArtService>()
        .refresh(app, target.album, old_key);
}

/// The status line text for the result of "Retry lookup".
fn retry_message(result: &Result<Lookup, LookupError>) -> String {
    match result {
        Ok(Lookup::Saved) => "Album cover saved".into(),
        Ok(Lookup::NoMatch) => "No single match on MusicBrainz".into(),
        Ok(Lookup::NoArt) => "Cover Art Archive has no cover for this album".into(),
        Ok(Lookup::Skipped(_)) => "This album was not looked up. The log has the reason".into(),
        Err(error) => format!("Lookup failed: {error}"),
    }
}

/// "Retry lookup" (P14.7): clears the album's marker and puts the album first in the
/// artwork job, which starts now or runs again. Cancel on the status line stops it too.
pub fn retry<R: Runtime>(app: &AppHandle<R>, album: AlbumId) -> Result<(), String> {
    let online = app
        .try_state::<Online>()
        .ok_or("Online lookups are not available. The log has the reason")?;
    if !online.gate.is_on() {
        return Err("Online lookups are off".into());
    }
    let root = app
        .state::<MusicRoot>()
        .0
        .read()
        .ok()
        .and_then(|root| root.clone())
        .ok_or("Choose a music folder first")?;
    let target = app
        .state::<Library>()
        .0
        .read()
        .ok()
        .map(|index| artwork::candidates(&index))
        .and_then(|targets| targets.into_iter().find(|target| target.album == album))
        .ok_or("This album has art or no album folder")?;
    if clawdio_core::sidecar::clear_marker(&root.join(&target.folder))
        .map_err(|error| error.to_string())?
    {
        sidecar_written(app, &root, &target);
    }
    if let Ok(mut job) = online.job.lock() {
        job.first = Some(album);
        // A running pass took its first album already: it stops at once, and the job runs
        // again with this album first, so the status line shows the retry's own result.
        if let Some(token) = &job.running {
            token.cancel();
        }
    };
    start(app, true);
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::path::Path;
    use std::sync::RwLock;
    use std::time::{Duration, Instant};

    use clawdio_core::library::{FileStamp, LibraryIndex, NewTrack};
    use clawdio_core::net::Url;
    use httpmock::MockServer;
    use tauri::test::{mock_app, MockRuntime};

    use super::*;

    const GROUP: &str = "0b1c2d3e-0000-4000-8000-00000000abcd";

    /// A small valid JPEG from the e2e test files.
    fn jpeg() -> Vec<u8> {
        include_bytes!("../../tests/e2e/public/thumb/album.jpg").to_vec()
    }

    /// A mock server for one album "Artist/Album" with one matching release group.
    fn server() -> MockServer {
        let server = MockServer::start();
        server.mock(|when, then| {
            when.path("/ws/2/release-group/");
            then.status(200).body(format!(
                r#"{{"release-groups":[{{"id":"{GROUP}","title":"Album","artist-credit":[{{"name":"Artist"}}]}}]}}"#
            ));
        });
        server.mock(|when, then| {
            when.path(format!("/release-group/{GROUP}/front-500"));
            then.status(200)
                .header("content-type", "image/jpeg")
                .body(jpeg());
        });
        server
    }

    /// An app with one album in `music`, the gate pointed at `server`, and the art service.
    fn app(music: &Path, thumbs: &Path, server: &MockServer, on: bool) -> tauri::App<MockRuntime> {
        let folder = music.join("Artist/Album");
        std::fs::create_dir_all(&folder).unwrap();
        std::fs::write(folder.join("01 Song.mp3"), b"").unwrap();
        let app = mock_app();
        let mut index = LibraryIndex::default();
        index.insert(NewTrack {
            rel_path: "Artist/Album/01 Song.mp3".into(),
            artist: "Artist".into(),
            album: "Album".into(),
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
        app.manage(ArtService::new(thumbs.to_path_buf()));
        let base = Url::parse(&format!("{}/", server.base_url())).unwrap();
        let mut config = NetConfig::production("Test/1 ( https://example.org )".into());
        config.musicbrainz = base.clone();
        config.cover_art = base;
        config.allowed_hosts = vec!["127.0.0.1".into()];
        config.https_only = false;
        config.use_proxy = false;
        config.musicbrainz_gap = Duration::ZERO;
        app.manage(Online::new(OnlineGate::new(config, on).unwrap()));
        app
    }

    fn idle(app: &tauri::App<MockRuntime>) -> bool {
        app.state::<Online>().job.lock().unwrap().running.is_none()
    }

    fn wait_idle(app: &tauri::App<MockRuntime>) {
        let start = Instant::now();
        while !idle(app) {
            assert!(
                start.elapsed() < Duration::from_secs(10),
                "the job did not end"
            );
            std::thread::sleep(Duration::from_millis(20));
        }
    }

    /// P14-AC15: the switch alone starts nothing before the startup scan ends; the end of the
    /// scan starts the job, which saves the cover and marks it valid in the index.
    #[test]
    fn the_job_waits_for_the_startup_scan_then_saves_the_cover() {
        let (music, thumbs) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let server = server();
        let app = app(music.path(), thumbs.path(), &server, false);
        switch(app.handle(), true);
        assert!(idle(&app));
        assert_eq!(app.state::<Online>().gate.request_count(), 0);
        scan_done(app.handle());
        wait_idle(&app);
        assert!(music.path().join("Artist/Album/cover.jpg").is_file());
        let library = app.state::<Library>();
        let index = library.0.read().unwrap();
        assert_eq!(
            index.cover("Artist", "Album").unwrap().state,
            CoverState::Valid
        );
    }

    /// P14-AC1: with the switch off, the end of a scan and "Retry lookup" make no request.
    #[test]
    fn the_switch_off_starts_no_job_and_no_retry() {
        let (music, thumbs) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let server = server();
        let app = app(music.path(), thumbs.path(), &server, false);
        scan_done(app.handle());
        assert!(idle(&app));
        assert_eq!(retry(app.handle(), 0), Err("Online lookups are off".into()));
        std::thread::sleep(Duration::from_millis(200));
        assert_eq!(app.state::<Online>().gate.request_count(), 0);
        assert!(!music.path().join("Artist/Album/cover.jpg").exists());
    }

    /// P14-AC7: a retry during a running pass gets its own result on the status line.
    #[test]
    fn retry_during_a_pass_restarts_the_job_with_the_album_first() {
        let (music, thumbs) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let server = server();
        let app = app(music.path(), thumbs.path(), &server, true);
        let online = app.state::<Online>();
        let pass = online.gate.job_token();
        if let Ok(mut job) = online.job.lock() {
            job.running = Some(pass.clone());
        }
        assert_eq!(retry(app.handle(), 0), Ok(()));
        assert!(pass.is_cancelled(), "the running pass stops");
        let job = online.job.lock().unwrap();
        assert_eq!(job.first, Some(0));
        assert!(job.again, "the job runs again with the album first");
    }

    /// P14-AC7: "Retry lookup" clears the marker and looks the album up again.
    #[test]
    fn retry_clears_the_marker_and_looks_up() {
        let (music, thumbs) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let server = server();
        let app = app(music.path(), thumbs.path(), &server, true);
        let folder = music.path().join("Artist/Album");
        clawdio_core::sidecar::write_marker(
            &folder,
            clawdio_core::sidecar::ArtworkMarker::NoMatch,
            std::time::SystemTime::now(),
        )
        .unwrap();
        scan_done(app.handle());
        wait_idle(&app);
        assert!(
            !folder.join("cover.jpg").exists(),
            "the marker blocks the job"
        );
        assert_eq!(retry(app.handle(), 0), Ok(()));
        let start = Instant::now();
        while !folder.join("cover.jpg").exists() {
            assert!(start.elapsed() < Duration::from_secs(10), "no cover");
            std::thread::sleep(Duration::from_millis(20));
        }
        assert_eq!(clawdio_core::sidecar::read(&folder).marker(), None);
    }

    /// P14-AC13: a 503 stops the queue: one request, no marker, no file.
    #[test]
    fn a_service_error_stops_the_queue_and_writes_nothing() {
        let (music, thumbs) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let server = MockServer::start();
        let search = server.mock(|when, then| {
            when.path("/ws/2/release-group/");
            then.status(503);
        });
        let app = app(music.path(), thumbs.path(), &server, true);
        let folder = music.path().join("Artist/Second");
        std::fs::create_dir_all(&folder).unwrap();
        std::fs::write(folder.join("01 Song.mp3"), b"").unwrap();
        app.state::<Library>().0.write().unwrap().insert(NewTrack {
            rel_path: "Artist/Second/01 Song.mp3".into(),
            artist: "Artist".into(),
            album: "Second".into(),
            subfolder: None,
            title: "Song".into(),
            tag_artist: None,
            track_no: None,
            disc: None,
            duration_ms: 1000,
            stamp: FileStamp::default(),
            has_picture: false,
        });
        scan_done(app.handle());
        wait_idle(&app);
        assert_eq!(search.calls(), 1);
        for album in ["Album", "Second"] {
            let folder = music.path().join("Artist").join(album);
            assert_eq!(std::fs::read_dir(&folder).unwrap().count(), 1, "{album}");
        }
    }
}
