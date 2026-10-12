//! P16-AC4 (R11): every write of P10 to P16 leaves the audio files byte-identical. Temp
//! folders only.

mod common;

use std::collections::BTreeMap;
use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::sync::RwLock;
use std::time::SystemTime;

use clawdio_core::artwork;
use clawdio_core::import::import_file;
use clawdio_core::library::LibraryIndex;
use clawdio_core::net::lyrics::{self, Fetched};
use clawdio_core::playlist::PlaylistSet;
use clawdio_core::scan::scan;
use clawdio_core::sidecar::{self, ArtworkMarker, TrackEntry};
use common::tree::{png_bytes, put, Tags};

/// The bytes of every audio file under `root`.
fn audio(root: &Path) -> BTreeMap<String, Vec<u8>> {
    walkdir::WalkDir::new(root)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| clawdio_core::scan::is_audio(entry.path()))
        .map(|entry| {
            (
                entry.path().display().to_string(),
                std::fs::read(entry.path()).unwrap(),
            )
        })
        .collect()
}

#[test]
fn audio_files_stay_byte_identical_after_every_write() {
    let root = tempfile::tempdir().unwrap();
    let album = root.path().join("Artist/Album");
    put(
        root.path(),
        "Artist/Album/01 One.mp3",
        "tone.mp3",
        Tags::default(),
    );
    put(
        root.path(),
        "Artist/Album/02 Two.ogg",
        "tone-vorbis.ogg",
        Tags::default(),
    );
    put(
        root.path(),
        "Artist/Album/03 Three.wav",
        "tone-pcm16.wav",
        Tags::default(),
    );
    let before = audio(root.path());
    let index = RwLock::new(LibraryIndex::new());
    let scan_now = || {
        scan(root.path(), &index, None, &AtomicBool::new(false), |_| {});
    };
    scan_now();

    // P10: Set cover. P14: the artwork marker and a fetched cover (create-new).
    let png = root.path().join("picked.png");
    std::fs::write(&png, png_bytes()).unwrap();
    artwork::write_cover(&album, &artwork::cover_jpeg(&png).unwrap()).unwrap();
    std::fs::remove_file(album.join("cover.jpg")).unwrap();
    clawdio_core::atomic::write_new(&album.join("cover.jpg"), b"jpeg").unwrap();
    sidecar::write_marker(&album, ArtworkMarker::NoMatch, SystemTime::now()).unwrap();
    sidecar::clear_marker(&album).unwrap();

    // P11 and P12: playlists, the heart and an import.
    let mut set = PlaylistSet::default();
    {
        let index = index.read().unwrap();
        let ids: Vec<u32> = index
            .paths()
            .filter_map(|path| index.track_at(path).map(|track| track.id))
            .collect();
        let id = set.create(root.path(), "Mix").unwrap();
        set.add(root.path(), id, &ids, &index).unwrap();
        set.toggle_favorite(root.path(), ids[0], &index).unwrap();
        let source = root.path().join("source.m3u8");
        std::fs::write(&source, "Artist/Album/01 One.mp3\n").unwrap();
        import_file(&mut set, root.path(), &index, &source).unwrap();
    }

    // P13 and P15: lyrics files next to the songs.
    lyrics::save(
        &album.join("01 One.mp3"),
        &Fetched::Synced("[00:01.00]a".into()),
    )
    .unwrap();
    lyrics::save(&album.join("02 Two.ogg"), &Fetched::Plain("b".into())).unwrap();

    // P16: the metadata sidecar, then a scan that reads it.
    let entry = TrackEntry {
        title: Some("Real".into()),
        track: Some(1),
        year: Some(1973),
    };
    sidecar::write_tracks(&album, &[("01 One.mp3".into(), entry)], true).unwrap();
    scan_now();

    assert_eq!(audio(root.path()), before);
}
