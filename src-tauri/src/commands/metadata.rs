//! "Fill missing metadata" (P16): a per-album lookup that proposes titles, track numbers and
//! years, a preview, and the sidecar write after Confirm. Nothing is written before Confirm,
//! not even a probe file (R10, P16.1).

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use clawdio_core::api::{IpcError, JobProgress, MetadataField, MetadataPreview, MetadataRow};
use clawdio_core::artwork::album_folder;
use clawdio_core::cache::Cache;
use clawdio_core::library::{UNKNOWN_ALBUM, UNKNOWN_ARTIST};
use clawdio_core::net::metadata::{self, SongInfo};
use clawdio_core::scan::{self, sidecar_key, Sidecars};
use clawdio_core::sidecar::{self, Sidecar, SidecarError, TrackEntry, SIDECAR_FILE};
use tauri::{AppHandle, Manager, Runtime};

use super::{lock_error, CommandResult};
use crate::events::{emit, JOB_PROGRESS, LIBRARY_CHANGED, STATUS_MESSAGE};
use crate::online::Online;
use crate::state::{AppState, Library, MusicRoot};

const METADATA_JOB: &str = "metadata";
const READ_ONLY: &str = "The album folder is read-only";

/// A proposal waiting for Confirm.
#[derive(Clone)]
struct Pending {
    artist: String,
    album: String,
    /// The music folder of the preview: a proposal from another folder is not applied.
    root: PathBuf,
    folder: PathBuf,
    entries: Vec<(String, TrackEntry)>,
    /// The preview named a corrupt sidecar, so Confirm may replace it (P16.4).
    corrupt: bool,
}

/// Proposals by album id, from the preview to Confirm.
#[derive(Default)]
pub struct MetadataFills(Mutex<HashMap<u32, Pending>>);

fn fill_error(message: impl Into<String>) -> IpcError {
    IpcError {
        code: "metadata".into(),
        message: message.into(),
    }
}

fn progress<R: Runtime>(app: &AppHandle<R>, text: Option<&str>) {
    emit(
        app,
        JOB_PROGRESS,
        JobProgress {
            id: METADATA_JOB.into(),
            text: text.map(str::to_owned),
            cancelable: false,
        },
    );
}

/// Whether the folder's permissions show it is read-only. Only metadata is read: no probe
/// file is made (P16.1). A write that still fails on Confirm shows the same error.
#[cfg(unix)]
fn read_only(folder: &Path) -> bool {
    std::fs::metadata(folder).is_ok_and(|metadata| metadata.permissions().readonly())
}

/// Windows sets the read-only flag on many folders that stay writable (customized folders),
/// so the flag says nothing; a failed write on Confirm shows the error.
#[cfg(not(unix))]
fn read_only(_folder: &Path) -> bool {
    false
}

/// The preview rows of the proposals, one per field.
fn rows(entries: &[(String, TrackEntry)]) -> Vec<MetadataRow> {
    let mut rows = Vec::new();
    for (song, entry) in entries {
        let row = |field, value: String| MetadataRow {
            song: song.clone(),
            field,
            value,
        };
        if let Some(title) = &entry.title {
            rows.push(row(MetadataField::Title, title.clone()));
        }
        if let Some(track) = entry.track {
            rows.push(row(MetadataField::Track, track.to_string()));
        }
        if let Some(year) = entry.year {
            rows.push(row(MetadataField::Year, year.to_string()));
        }
    }
    rows
}

/// Looks the album up and returns the preview, or null when there is no proposal (the status
/// line says so). An error when Online lookups are off (no request), for an Unknown group or
/// for a read-only folder.
#[tauri::command]
pub async fn metadata_preview(
    app: AppHandle,
    album: u32,
) -> CommandResult<Option<MetadataPreview>> {
    preview(&app, album).await
}

async fn preview<R: Runtime>(
    app: &AppHandle<R>,
    album: u32,
) -> CommandResult<Option<MetadataPreview>> {
    let gate = app
        .try_state::<Online>()
        .map(|online| online.gate.clone())
        .ok_or_else(|| fill_error("Online lookups are not available. The log has the reason"))?;
    if !gate.is_on() {
        return Err(fill_error("Online lookups are off"));
    }
    let (artist, name, folder, keys) = {
        let library = app.state::<Library>();
        let index = library.0.read().map_err(|_| lock_error())?;
        let found = index
            .album(album)
            .ok_or_else(|| fill_error("The album is not in the library"))?;
        let artist = index
            .artist(found.artist)
            .map(|artist| artist.name.clone())
            .unwrap_or_default();
        if artist == UNKNOWN_ARTIST || found.name == UNKNOWN_ALBUM {
            return Err(fill_error(
                "Songs outside an album folder have no album to look up",
            ));
        }
        let paths: Vec<String> = found
            .tracks
            .iter()
            .filter_map(|track| index.rel_path(*track).map(str::to_owned))
            .collect();
        let folder = paths
            .first()
            .and_then(|path| album_folder(path))
            .ok_or_else(|| fill_error("Songs outside an album folder have no album to look up"))?;
        let keys: Vec<(String, String)> = paths
            .into_iter()
            .filter_map(|path| sidecar_key(&path).map(|(_, key)| (key, path)))
            .collect();
        (artist, found.name.clone(), folder, keys)
    };
    let root = app
        .state::<MusicRoot>()
        .0
        .read()
        .map_err(|_| lock_error())?
        .clone()
        .ok_or_else(|| fill_error("Choose a music folder first"))?;
    let folder = root.join(folder);
    if read_only(&folder) {
        return Err(fill_error(READ_ONLY));
    }
    let songs: Vec<SongInfo> = {
        let root = root.clone();
        tauri::async_runtime::spawn_blocking(move || {
            keys.into_iter()
                .map(|(key, path)| metadata::read_song(&root.join(path), key))
                .collect()
        })
        .await
        .map_err(|_| fill_error("The songs cannot be read"))?
    };
    progress(app, Some("Looking up metadata"));
    let found = metadata::propose(&gate, &artist, &name, &songs, &gate.job_token()).await;
    progress(app, None);
    let entries = found.map_err(|error| fill_error(format!("Lookup failed: {error}")))?;
    if entries.is_empty() {
        emit(app, STATUS_MESSAGE, "No metadata found for this album");
        return Ok(None);
    }
    let corrupt_sidecar = sidecar::read(&folder) == Sidecar::Corrupt;
    let preview = MetadataPreview {
        album: name.clone(),
        rows: rows(&entries),
        corrupt_sidecar,
    };
    app.state::<MetadataFills>()
        .0
        .lock()
        .map_err(|_| lock_error())?
        .insert(
            album,
            Pending {
                artist,
                album: name,
                root,
                folder,
                entries,
                corrupt: corrupt_sidecar,
            },
        );
    Ok(Some(preview))
}

/// Confirm (P16.5): merges the proposal into `sidecar.json` (replacing a corrupt one), reads
/// the album's songs again with it, and updates the index, the cache rows and the stored
/// sidecar stamp in the same step.
#[tauri::command]
pub async fn metadata_apply(app: AppHandle, album: u32) -> CommandResult<()> {
    apply(&app, album).await
}

async fn apply<R: Runtime>(app: &AppHandle<R>, album: u32) -> CommandResult<()> {
    // The proposal stays until the write succeeds, so a failed Confirm can be tried again.
    let pending = app
        .state::<MetadataFills>()
        .0
        .lock()
        .map_err(|_| lock_error())?
        .get(&album)
        .cloned()
        .ok_or_else(|| fill_error("Look up the album first"))?;
    let root = app
        .state::<MusicRoot>()
        .0
        .read()
        .map_err(|_| lock_error())?
        .clone()
        .ok_or_else(|| fill_error("Choose a music folder first"))?;
    if root != pending.root {
        drop_pending(app, album);
        return Err(fill_error(
            "The music folder changed. Look up the album again",
        ));
    }
    let library = app.state::<Library>().0.clone();
    let cache_dir = app
        .try_state::<AppState>()
        .map(|state| state.dirs.cache.clone());
    let result =
        tauri::async_runtime::spawn_blocking(move || confirm(&library, &pending, cache_dir))
            .await
            .map_err(|_| fill_error("The metadata cannot be saved"))?;
    match &result {
        Ok(()) => {
            drop_pending(app, album);
            emit(app, LIBRARY_CHANGED, ());
            emit(app, STATUS_MESSAGE, "Metadata saved");
        }
        // The file is no longer what the preview showed: the user looks again.
        Err(error) if error.message == STALE => drop_pending(app, album),
        Err(_) => {}
    }
    result
}

const STALE: &str = "The album's sidecar.json changed since the preview. Look up the album again";

fn drop_pending<R: Runtime>(app: &AppHandle<R>, album: u32) {
    if let Ok(mut fills) = app.state::<MetadataFills>().0.lock() {
        fills.remove(&album);
    }
}

/// Writes the sidecar, reads the album's songs again with it and stores the rows and the
/// sidecar stamp in the index and the cache in one step (P16.5).
fn confirm(
    library: &std::sync::RwLock<clawdio_core::library::LibraryIndex>,
    pending: &Pending,
    cache_dir: Option<PathBuf>,
) -> CommandResult<()> {
    // A scan writes the same rows: Confirm does not wait for it, the user confirms again.
    let _gate = crate::jobs::SCAN_GATE
        .try_lock()
        .map_err(|_| fill_error("A scan is running. Confirm again when it ends"))?;
    sidecar::write_tracks(&pending.folder, &pending.entries, pending.corrupt).map_err(|error| {
        match error {
            SidecarError::Write => fill_error(READ_ONLY),
            SidecarError::Corrupt => fill_error(STALE),
        }
    })?;
    let mut cache = cache_dir.and_then(|dir| {
        Cache::open(&dir)
            .inspect_err(|error| log::warn!("cache: cannot open: {error}"))
            .ok()
    });
    let tracks = scan::reread_album(
        &pending.root,
        library,
        &pending.artist,
        &pending.album,
        &HashSet::new(),
        &mut Sidecars::new(&pending.root),
    );
    scan::flush_tracks(library, cache.as_mut(), tracks);
    let stamp = clawdio_core::artwork::stamp(&pending.folder.join(SIDECAR_FILE));
    if let Ok(mut index) = library.write() {
        index.set_sidecar(&pending.artist, &pending.album, stamp);
    }
    scan::put_sidecars(library, cache.as_mut());
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, RwLock};

    use clawdio_core::library::{FileStamp, LibraryIndex, NewTrack};
    use clawdio_core::net::{NetConfig, OnlineGate, Url};
    use httpmock::MockServer;
    use tauri::test::{mock_app, MockRuntime};

    use super::*;

    const RELEASE: &str = "aaaaaaaa-0000-4000-8000-000000000001";
    /// Confirm takes the global scan gate, so the tests that confirm run one at a time.
    static CONFIRM: Mutex<()> = Mutex::new(());

    fn seed() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../crates/clawdio-core/tests/fixtures/seed/tone.mp3")
    }

    /// The folder's state: each entry with its bytes, and the folder's modified time. A
    /// probe file made and removed changes the time, so this stands for a file-system watch.
    fn snapshot(folder: &Path) -> (Vec<(String, Vec<u8>)>, std::time::SystemTime) {
        let mut entries: Vec<_> = std::fs::read_dir(folder)
            .unwrap()
            .map(|entry| {
                let entry = entry.unwrap();
                (
                    entry.file_name().to_string_lossy().into_owned(),
                    std::fs::read(entry.path()).unwrap_or_default(),
                )
            })
            .collect();
        entries.sort();
        (
            entries,
            std::fs::metadata(folder).unwrap().modified().unwrap(),
        )
    }

    /// An app with "Artist/Album/01 One.mp3" and "02 Two.mp3" (untagged) and MusicBrainz
    /// pointed at `server`, which knows the album.
    fn app(music: &Path, server: &MockServer) -> tauri::App<MockRuntime> {
        let folder = music.join("Artist/Album");
        std::fs::create_dir_all(&folder).unwrap();
        let app = mock_app();
        let mut index = LibraryIndex::default();
        for (file, title, track) in [("01 One.mp3", "One", 1), ("02 Two.mp3", "Two", 2)] {
            std::fs::copy(seed(), folder.join(file)).unwrap();
            index.insert(NewTrack {
                rel_path: format!("Artist/Album/{file}"),
                artist: "Artist".into(),
                album: "Album".into(),
                subfolder: None,
                title: title.into(),
                tag_artist: None,
                track_no: Some(track),
                disc: None,
                duration_ms: 1000,
                stamp: FileStamp::default(),
                has_picture: false,
            });
        }
        app.manage(Library(Arc::new(RwLock::new(index))));
        app.manage(MusicRoot(Arc::new(RwLock::new(Some(music.to_path_buf())))));
        app.manage(MetadataFills::default());
        let mut config = NetConfig::production("Test/1 ( https://example.org )".into());
        config.musicbrainz = Url::parse(&format!("{}/", server.base_url())).unwrap();
        config.allowed_hosts = vec!["127.0.0.1".into()];
        config.https_only = false;
        config.use_proxy = false;
        config.musicbrainz_gap = std::time::Duration::ZERO;
        app.manage(Online::new(OnlineGate::new(config, true).unwrap()));
        server.mock(|when, then| {
            when.path("/ws/2/release/");
            then.status(200).body(format!(
                r#"{{"releases":[{{"id":"{RELEASE}","title":"Album","date":"1973","track-count":2,"artist-credit":[{{"name":"Artist"}}],"release-group":{{"id":"g"}}}}]}}"#
            ));
        });
        server.mock(|when, then| {
            when.path(format!("/ws/2/release/{RELEASE}"));
            then.status(200).body(
                r#"{"id":"x","date":"1973-03-01","media":[{"position":1,"tracks":[{"position":1,"title":"One (Real)"},{"position":2,"title":"Two"}]}]}"#,
            );
        });
        app
    }

    /// P16-AC1, P16-AC2, P16-AC8, P16-AC3, P16-AC4: the preview lists the missing fields and
    /// changes nothing in the folder; Confirm writes the sidecar, the songs show its titles,
    /// and the audio files stay byte-identical.
    #[test]
    fn the_preview_writes_nothing_and_confirm_applies_it() {
        let _one = CONFIRM
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let music = tempfile::tempdir().unwrap();
        let server = MockServer::start();
        let app = app(music.path(), &server);
        let folder = music.path().join("Artist/Album");
        let before = snapshot(&folder);
        std::thread::sleep(std::time::Duration::from_millis(20));
        let preview = tauri::async_runtime::block_on(preview(app.handle(), 0))
            .unwrap()
            .unwrap();
        assert_eq!(snapshot(&folder), before, "nothing changed before Confirm");
        assert!(!preview.corrupt_sidecar);
        let fields: Vec<_> = preview
            .rows
            .iter()
            .map(|row| (row.song.as_str(), row.field, row.value.as_str()))
            .collect();
        assert_eq!(
            fields,
            [
                ("01 One.mp3", MetadataField::Title, "One (Real)"),
                ("01 One.mp3", MetadataField::Track, "1"),
                ("01 One.mp3", MetadataField::Year, "1973"),
                ("02 Two.mp3", MetadataField::Title, "Two"),
                ("02 Two.mp3", MetadataField::Track, "2"),
                ("02 Two.mp3", MetadataField::Year, "1973"),
            ]
        );
        tauri::async_runtime::block_on(apply(app.handle(), 0)).unwrap();
        let sidecar = sidecar::read(&folder);
        assert_eq!(
            sidecar.track("01 One.mp3").unwrap().title.as_deref(),
            Some("One (Real)")
        );
        let library = app.state::<Library>();
        let index = library.0.read().unwrap();
        let one = index.track_at("Artist/Album/01 One.mp3").unwrap();
        assert_eq!(one.title(), "One (Real)");
        assert!(index.album(0).unwrap().sidecar.is_some());
        for (name, bytes) in &before.0 {
            assert_eq!(&std::fs::read(folder.join(name)).unwrap(), bytes, "{name}");
        }
        assert_eq!(
            tauri::async_runtime::block_on(apply(app.handle(), 0)).map_err(|error| error.message),
            Err("Look up the album first".into())
        );
    }

    /// P16-AC5: a corrupt sidecar is named in the preview and replaced only on Confirm.
    #[test]
    fn a_corrupt_sidecar_is_replaced_only_after_confirm() {
        let _one = CONFIRM
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let music = tempfile::tempdir().unwrap();
        let server = MockServer::start();
        let app = app(music.path(), &server);
        let sidecar_path = music.path().join("Artist/Album").join(SIDECAR_FILE);
        std::fs::write(&sidecar_path, "{broken").unwrap();
        let preview = tauri::async_runtime::block_on(preview(app.handle(), 0))
            .unwrap()
            .unwrap();
        assert!(preview.corrupt_sidecar);
        assert_eq!(std::fs::read_to_string(&sidecar_path).unwrap(), "{broken");
        tauri::async_runtime::block_on(apply(app.handle(), 0)).unwrap();
        assert!(sidecar::read(&sidecar_path.with_file_name(""))
            .track("02 Two.mp3")
            .is_some());
    }

    /// P16-AC8: a read-only folder shows the error before any request, and nothing changes.
    #[cfg(unix)]
    #[test]
    fn a_read_only_folder_shows_the_error_and_asks_nothing() {
        use std::os::unix::fs::PermissionsExt;
        let music = tempfile::tempdir().unwrap();
        let server = MockServer::start();
        let app = app(music.path(), &server);
        let folder = music.path().join("Artist/Album");
        std::fs::set_permissions(&folder, std::fs::Permissions::from_mode(0o555)).unwrap();
        let before = snapshot(&folder);
        let result = tauri::async_runtime::block_on(preview(app.handle(), 0));
        let after = snapshot(&folder);
        std::fs::set_permissions(&folder, std::fs::Permissions::from_mode(0o755)).unwrap();
        assert_eq!(result.map_err(|error| error.message), Err(READ_ONLY.into()));
        assert_eq!(app.state::<Online>().gate.request_count(), 0);
        assert_eq!(after, before);
    }

    /// P16.5: Confirm stores the rows and the sidecar stamp in the cache, so a restart shows
    /// the new titles and its scan reads no song again.
    #[test]
    fn confirm_updates_the_cache_in_the_same_step() {
        let _one = CONFIRM
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let music = tempfile::tempdir().unwrap();
        let cache_dir = tempfile::tempdir().unwrap();
        let server = MockServer::start();
        let app = app(music.path(), &server);
        tauri::async_runtime::block_on(preview(app.handle(), 0)).unwrap();
        let pending = app.state::<MetadataFills>().0.lock().unwrap()[&0].clone();
        let library = app.state::<Library>().0.clone();
        confirm(&library, &pending, Some(cache_dir.path().to_path_buf())).unwrap();
        let cache = Cache::open(cache_dir.path()).unwrap();
        let restarted = std::sync::RwLock::new(clawdio_core::library::LibraryIndex::default());
        scan::load(&restarted, &cache).unwrap();
        let one = |index: &std::sync::RwLock<clawdio_core::library::LibraryIndex>| {
            index
                .read()
                .unwrap()
                .track_at("Artist/Album/01 One.mp3")
                .map(|track| track.title().to_owned())
        };
        assert_eq!(one(&restarted).as_deref(), Some("One (Real)"));
        let mut cache = cache;
        let report = scan::scan(
            music.path(),
            &restarted,
            Some(&mut cache),
            &std::sync::atomic::AtomicBool::new(false),
            |_| {},
        );
        assert_eq!(report.read, 0, "unchanged songs and sidecar");
        assert_eq!(one(&restarted).as_deref(), Some("One (Real)"));
    }

    /// A Confirm while a scan runs fails with a message and keeps the proposal.
    #[test]
    fn confirm_during_a_scan_can_be_tried_again() {
        let _one = CONFIRM
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let music = tempfile::tempdir().unwrap();
        let server = MockServer::start();
        let app = app(music.path(), &server);
        tauri::async_runtime::block_on(preview(app.handle(), 0)).unwrap();
        {
            let _scan = crate::jobs::SCAN_GATE
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let result = tauri::async_runtime::block_on(apply(app.handle(), 0));
            assert_eq!(
                result.map_err(|error| error.message),
                Err("A scan is running. Confirm again when it ends".into())
            );
        }
        assert!(!music
            .path()
            .join("Artist/Album")
            .join(SIDECAR_FILE)
            .exists());
        tauri::async_runtime::block_on(apply(app.handle(), 0)).unwrap();
        assert!(music
            .path()
            .join("Artist/Album")
            .join(SIDECAR_FILE)
            .exists());
    }

    /// P16-AC5: a sidecar that turned corrupt after the preview is not replaced.
    #[test]
    fn a_sidecar_corrupted_after_the_preview_stays() {
        let _one = CONFIRM
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let music = tempfile::tempdir().unwrap();
        let server = MockServer::start();
        let app = app(music.path(), &server);
        let preview = tauri::async_runtime::block_on(preview(app.handle(), 0))
            .unwrap()
            .unwrap();
        assert!(!preview.corrupt_sidecar);
        let path = music.path().join("Artist/Album").join(SIDECAR_FILE);
        std::fs::write(&path, "{broken").unwrap();
        let result = tauri::async_runtime::block_on(apply(app.handle(), 0));
        assert_eq!(result.map_err(|error| error.message), Err(STALE.into()));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "{broken");
    }
}
