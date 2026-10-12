//! Library scan and cache (P5) on generated trees in temp folders.

mod common;

use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::sync::RwLock;

use clawdio_core::api::SongScope;
use clawdio_core::cache::{Cache, CACHE_FILE, SCHEMA_VERSION};
use clawdio_core::library::{CoverState, LibraryIndex};
use clawdio_core::scan::probe::{probe, Kind, Skip};
use clawdio_core::scan::{load, scan, ScanReport, BATCH};
use common::guard::Guard;
use common::logs;
use common::tree::{self, put, seed, Tags};
use serde_json::{json, Value};

#[path = "../examples/gen_test_library.rs"]
#[allow(dead_code)]
mod generator;

fn run(root: &Path, index: &RwLock<LibraryIndex>, cache: Option<&mut Cache>) -> ScanReport {
    scan(root, index, cache, &AtomicBool::new(false), |_| {})
}

/// Artists, their albums and their songs (title and track number) in display order.
fn library_json(index: &RwLock<LibraryIndex>) -> Value {
    let index = index.read().unwrap();
    let artists = index.artist_rows(&index.artist_ids("")).unwrap();
    Value::Array(
        artists
            .into_iter()
            .map(|artist| {
                let albums = index
                    .album_rows(&index.album_ids(Some(artist.id), "").unwrap())
                    .unwrap();
                json!({
                    "artist": artist.name,
                    "albums": albums.into_iter().map(|album| {
                        let scope = SongScope { artist: None, album: Some(album.id) };
                        let ids = index.song_ids(scope, "").unwrap();
                        let songs: Vec<Value> = ids.iter().map(|id| {
                            let track = index.track(*id).unwrap();
                            json!([track.data.title, track.data.track_no])
                        }).collect();
                        json!({ "album": album.name, "songs": songs })
                    }).collect::<Vec<_>>(),
                })
            })
            .collect(),
    )
}

fn paths(index: &RwLock<LibraryIndex>) -> Vec<String> {
    let index = index.read().unwrap();
    let mut paths: Vec<String> = index.paths().map(str::to_owned).collect();
    paths.sort();
    paths
}

#[test]
fn p5_ac1_the_fixture_tree_gives_the_golden_library() {
    let root = tempfile::tempdir().unwrap();
    tree::build(root.path());
    let guard = Guard::new(root.path());
    let index = RwLock::new(LibraryIndex::new());
    run(root.path(), &index, None);
    guard.check();
    let golden: Value = serde_json::from_str(
        &std::fs::read_to_string(
            Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/golden/fixture-tree.json"),
        )
        .unwrap(),
    )
    .unwrap();
    let actual = library_json(&index);
    // GOLDEN_DUMP=<file> writes the actual library, to review and copy over the golden file.
    if std::env::var_os("GOLDEN_DUMP").is_some() {
        std::fs::write(
            std::env::var_os("GOLDEN_DUMP").unwrap(),
            serde_json::to_string_pretty(&actual).unwrap(),
        )
        .unwrap();
    }
    assert_eq!(actual, golden);
}

#[test]
fn p5_ac2_skips_count_with_one_log_line_each() {
    logs::install();
    // The tree sits in its own folder, so its log lines differ from other tests' lines.
    let root = tempfile::tempdir().unwrap();
    tree::build(&root.path().join("ac2"));
    let index = RwLock::new(LibraryIndex::new());
    let report = run(root.path(), &index, None);
    assert_eq!(report.skipped, 4, "opus, A-law, corrupt and MP3 in WAV");
    for (name, reason) in [
        ("Formats/Skipped/opus.ogg", "unsupported codec"),
        ("Formats/Skipped/alaw.wav", "unsupported codec"),
        ("Formats/Skipped/corrupt.mp3", "corrupt file"),
        ("Formats/Skipped/mp3 inside.wav", "unsupported type"),
    ] {
        let line = format!("({reason}): ac2/{name}");
        assert_eq!(logs::lines_with(&line).len(), 1, "{line}");
    }
    assert!(
        logs::lines_with("notes.txt").is_empty(),
        "other types are not logged"
    );
    assert!(paths(&index)
        .iter()
        .all(|p| !p.starts_with("Formats/Skipped")));
}

#[test]
fn classifies_each_seed() {
    let cases = [
        ("tone.mp3", Kind::Mp3, None),
        ("tone-vorbis.ogg", Kind::Ogg, None),
        ("tone-pcm16.wav", Kind::Wav, None),
        ("tone-float.wav", Kind::Wav, None),
        ("tone-adpcm.wav", Kind::Wav, None),
        ("tone-opus.ogg", Kind::Ogg, Some(Skip::UnsupportedCodec)),
        ("tone-alaw.wav", Kind::Wav, Some(Skip::UnsupportedCodec)),
        ("corrupt.mp3", Kind::Mp3, Some(Skip::Corrupt)),
        ("truncated.mp3", Kind::Mp3, None),
        ("damaged.ogg", Kind::Ogg, None),
        ("tone.mp3", Kind::Wav, Some(Skip::UnsupportedType)),
        ("tone-pcm16.wav", Kind::Ogg, Some(Skip::UnsupportedType)),
    ];
    for (name, kind, expected) in cases {
        assert_eq!(
            probe(&seed(name), kind).err(),
            expected,
            "{name} as {kind:?}"
        );
    }
    let adpcm = probe(&seed("tone-adpcm.wav"), Kind::Wav).unwrap();
    assert!(
        (900..=1100).contains(&adpcm.duration_ms),
        "{}",
        adpcm.duration_ms
    );
}

#[test]
fn p5_ac3_hidden_names_are_skipped() {
    let root = tempfile::tempdir().unwrap();
    tree::build(root.path());
    let index = RwLock::new(LibraryIndex::new());
    run(root.path(), &index, None);
    assert!(paths(&index).iter().all(|p| !p.contains("Secret")));
}

#[cfg(unix)]
#[test]
fn p5_ac3_and_ac14_links_case_and_bad_names_on_linux() {
    logs::install();
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    tree::build(root.path());
    tree::add_unix_extras(root.path(), outside.path());
    let guard = Guard::new(root.path());
    let index = RwLock::new(LibraryIndex::new());
    let report = run(root.path(), &index, None);
    guard.check();
    let paths = paths(&index);
    assert!(
        paths.contains(&"Links/Album/linked.mp3".to_string()),
        "a file link is scanned"
    );
    assert!(
        paths.iter().all(|p| !p.contains("Loop")),
        "the folder link is not entered"
    );
    assert!(paths.contains(&"case/Album/01 Lower.mp3".to_string()));
    assert!(paths.contains(&"Case/Album/01 Upper.mp3".to_string()));
    assert_eq!(
        report.skipped, 5,
        "the four skipped formats and the bad name"
    );
    assert_eq!(logs::lines_with("name is not valid UTF-8").len(), 1);
    let index = index.read().unwrap();
    let artists = index.artist_rows(&index.artist_ids("")).unwrap();
    let names: Vec<&str> = artists.iter().map(|a| a.name.as_str()).collect();
    assert!(names.contains(&"case") && names.contains(&"Case"));
}

#[test]
fn p5_ac4_removal_rules() {
    let root = tempfile::tempdir().unwrap();
    tree::build(root.path());
    let index = RwLock::new(LibraryIndex::new());
    let mut cache = Cache::in_memory().unwrap();
    let first = run(root.path(), &index, Some(&mut cache));
    let all = paths(&index);
    assert_eq!(first.added as usize, all.len());

    // A canceled scan removes nothing.
    std::fs::remove_file(root.path().join("Root Song.mp3")).unwrap();
    let canceled = scan(
        root.path(),
        &index,
        Some(&mut cache),
        &AtomicBool::new(true),
        |_| {},
    );
    assert!(canceled.canceled);
    assert_eq!(paths(&index), all);

    // A complete scan removes the missing file and a file that is now corrupt.
    std::fs::copy(
        seed("corrupt.mp3"),
        root.path().join("Prefixes/Examples/1984.mp3"),
    )
    .unwrap();
    let complete = run(root.path(), &index, Some(&mut cache));
    assert_eq!(complete.removed, 2);
    let now = paths(&index);
    assert!(!now.contains(&"Root Song.mp3".to_string()));
    assert!(!now.contains(&"Prefixes/Examples/1984.mp3".to_string()));
    assert_eq!(cache.count().unwrap() as usize, now.len());

    // A missing root removes nothing.
    let missing = run(&root.path().join("gone"), &index, Some(&mut cache));
    assert!(missing.failed);
    assert_eq!(paths(&index), now);

    // A readable, empty root removes all tracks.
    let empty = tempfile::tempdir().unwrap();
    let report = run(empty.path(), &index, Some(&mut cache));
    assert_eq!(report.removed as usize, now.len());
    assert!(index.read().unwrap().is_empty());
    assert_eq!(cache.count().unwrap(), 0);
}

#[test]
fn p5_ac7_a_second_scan_of_an_unchanged_folder_reads_no_tags() {
    let root = tempfile::tempdir().unwrap();
    tree::build(root.path());
    let index = RwLock::new(LibraryIndex::new());
    let first = run(root.path(), &index, None);
    assert!(first.read > 0);
    let second = run(root.path(), &index, None);
    assert_eq!(
        (second.read, second.added, second.removed, second.skipped),
        (0, 0, 0, 4),
        "skipped files count again but are not read again"
    );
}

#[test]
fn p5_ac8_the_cache_restores_the_library_and_a_deleted_cache_rebuilds_it() {
    let root = tempfile::tempdir().unwrap();
    let cache_dir = tempfile::tempdir().unwrap();
    tree::build(root.path());
    let index = RwLock::new(LibraryIndex::new());
    run(
        root.path(),
        &index,
        Some(&mut Cache::open(cache_dir.path()).unwrap()),
    );
    let expected = library_json(&index);

    // Restart: the cache fills the index, then the startup scan reads nothing new.
    let restarted = RwLock::new(LibraryIndex::new());
    let mut cache = Cache::open(cache_dir.path()).unwrap();
    load(&restarted, &cache).unwrap();
    assert_eq!(library_json(&restarted), expected);
    let report = run(root.path(), &restarted, Some(&mut cache));
    assert_eq!((report.added, report.removed), (0, 0));
    drop(cache);

    // Deleting the cache loses nothing.
    std::fs::remove_file(cache_dir.path().join(CACHE_FILE)).unwrap();
    let rebuilt = RwLock::new(LibraryIndex::new());
    run(
        root.path(),
        &rebuilt,
        Some(&mut Cache::open(cache_dir.path()).unwrap()),
    );
    assert_eq!(library_json(&rebuilt), expected);
}

#[test]
fn p5_ac9_another_schema_version_rebuilds_the_cache() {
    let root = tempfile::tempdir().unwrap();
    let cache_dir = tempfile::tempdir().unwrap();
    tree::build(root.path());
    run(
        root.path(),
        &RwLock::new(LibraryIndex::new()),
        Some(&mut Cache::open(cache_dir.path()).unwrap()),
    );
    let connection = rusqlite::Connection::open(cache_dir.path().join(CACHE_FILE)).unwrap();
    connection
        .pragma_update(None, "user_version", SCHEMA_VERSION - 1)
        .unwrap();
    drop(connection);
    let mut cache = Cache::open(cache_dir.path()).unwrap();
    assert!(cache.rebuilt);
    assert_eq!(cache.count().unwrap(), 0);
    let index = RwLock::new(LibraryIndex::new());
    let report = run(root.path(), &index, Some(&mut cache));
    assert_eq!(cache.count().unwrap() as u64, report.added);
}

#[test]
fn p5_ac13_a_new_folder_leaves_nothing_of_the_old_one() {
    let old = tempfile::tempdir().unwrap();
    let new = tempfile::tempdir().unwrap();
    tree::build(old.path());
    put(
        new.path(),
        "New Artist/New Album/01 New.mp3",
        "tone.mp3",
        Tags::default(),
    );
    let index = RwLock::new(LibraryIndex::new());
    let mut cache = Cache::in_memory().unwrap();
    // The old folder's scan stops early, as when the folder changes during the startup scan.
    scan(
        old.path(),
        &index,
        Some(&mut cache),
        &AtomicBool::new(true),
        |_| {},
    );
    run(old.path(), &index, Some(&mut cache));
    // The folder change (P5.9): clear, then scan the new folder.
    cache.clear().unwrap();
    index.write().unwrap().clear_tracks();
    run(new.path(), &index, Some(&mut cache));
    assert_eq!(paths(&index), ["New Artist/New Album/01 New.mp3"]);
    let cached: Vec<String> = cache
        .tracks()
        .unwrap()
        .into_iter()
        .map(|t| t.rel_path)
        .collect();
    assert_eq!(cached, ["New Artist/New Album/01 New.mp3"]);
}

#[cfg(windows)]
#[test]
fn p5_ac14_a_path_over_260_characters_works_on_windows() {
    let root = tempfile::tempdir().unwrap();
    let rel = tree::add_long_path(root.path());
    assert!(root.path().join(&rel).as_os_str().len() > 260);
    let index = RwLock::new(LibraryIndex::new());
    let report = run(root.path(), &index, None);
    assert_eq!((report.added, report.skipped), (1, 0));
    assert_eq!(paths(&index), [rel]);
}

#[test]
fn p5_ac15_a_new_file_appears_only_after_the_next_scan() {
    let root = tempfile::tempdir().unwrap();
    tree::build(root.path());
    let index = RwLock::new(LibraryIndex::new());
    run(root.path(), &index, None);
    let before = paths(&index);
    put(
        root.path(),
        "Later/Album/01 Later.mp3",
        "tone.mp3",
        Tags::default(),
    );
    assert_eq!(paths(&index), before, "the app does not watch the folder");
    let report = run(root.path(), &index, None);
    assert_eq!(report.added, 1);
    assert!(paths(&index).contains(&"Later/Album/01 Later.mp3".to_string()));
}

#[test]
fn p5_ac16_the_cache_holds_the_d44_flags_and_covers_decode_once() {
    let root = tempfile::tempdir().unwrap();
    let cache_dir = tempfile::tempdir().unwrap();
    put(
        root.path(),
        "A/Valid/01 Song.mp3",
        "tone.mp3",
        Tags {
            picture: true,
            ..Tags::default()
        },
    );
    std::fs::write(root.path().join("A/Valid/cover.png"), tree::png_bytes()).unwrap();
    std::fs::write(
        root.path().join("A/Valid/folder.jpg"),
        b"not used: cover.png wins",
    )
    .unwrap();
    put(
        root.path(),
        "A/Broken/01 Song.mp3",
        "tone.mp3",
        Tags::default(),
    );
    std::fs::write(root.path().join("A/Broken/cover.jpg"), b"not a jpeg").unwrap();
    put(
        root.path(),
        "A/None/01 Song.mp3",
        "tone.mp3",
        Tags::default(),
    );

    let index = RwLock::new(LibraryIndex::new());
    let first = run(
        root.path(),
        &index,
        Some(&mut Cache::open(cache_dir.path()).unwrap()),
    );
    assert_eq!(first.covers_decoded, 2);

    // A restart reads the flags from the cache and decodes no cover file.
    let restarted = RwLock::new(LibraryIndex::new());
    let mut cache = Cache::open(cache_dir.path()).unwrap();
    load(&restarted, &cache).unwrap();
    let second = run(root.path(), &restarted, Some(&mut cache));
    assert_eq!(second.covers_decoded, 0);
    let index = restarted.read().unwrap();
    let state = |album: &str| index.cover("A", album).unwrap().state;
    assert_eq!(state("Valid"), CoverState::Valid);
    assert_eq!(state("Broken"), CoverState::Broken);
    assert_eq!(state("None"), CoverState::None);
    assert_eq!(
        index.cover("A", "Valid").unwrap().file.as_ref().unwrap().0,
        "cover.png"
    );
    let picture = |rel: &str| index.track_at(rel).unwrap().data.has_picture;
    assert!(picture("A/Valid/01 Song.mp3"));
    assert!(!picture("A/None/01 Song.mp3"));
    drop(index);

    // A changed cover file decodes again.
    std::fs::write(root.path().join("A/Broken/cover.jpg"), b"still not a jpeg!").unwrap();
    let third = run(root.path(), &restarted, Some(&mut cache));
    assert_eq!(third.covers_decoded, 1);
}

#[test]
fn writes_in_batches_and_reports_progress() {
    let root = tempfile::tempdir().unwrap();
    generator::generate(root.path(), BATCH + 20).unwrap();
    let index = RwLock::new(LibraryIndex::new());
    let mut cache = Cache::in_memory().unwrap();
    let mut progress = Vec::new();
    let report = scan(
        root.path(),
        &index,
        Some(&mut cache),
        &AtomicBool::new(false),
        |report| progress.push(report.files),
    );
    assert_eq!(progress, [BATCH as u64, BATCH as u64 + 20]);
    assert_eq!(report.added, BATCH as u64 + 20);
    assert_eq!(cache.count().unwrap() as u64, report.added);
}

#[test]
fn a_scan_without_a_cache_still_fills_the_index() {
    let root = tempfile::tempdir().unwrap();
    generator::generate(root.path(), 3).unwrap();
    let index = RwLock::new(LibraryIndex::new());
    let report = run(root.path(), &index, None);
    assert_eq!(report.added, 3);
    assert_eq!(index.read().unwrap().len(), 3);
}

#[test]
fn p5_13_the_generator_adds_edge_cases_two_disc_albums_and_covers() {
    let root = tempfile::tempdir().unwrap();
    let options = generator::Options {
        tracks: 1_010,
        edge_cases: true,
        covers: 3,
    };
    assert_eq!(
        generator::generate_with(root.path(), options).unwrap(),
        1_010
    );
    let guard = Guard::new(root.path());
    let index = RwLock::new(LibraryIndex::new());
    let report = run(root.path(), &index, None);
    guard.check();
    // Albums 0 and 100 hold an edge-case file each: opus.ogg and float.wav. Only opus is skipped.
    assert_eq!(report.skipped, 1);
    assert_eq!(report.covers_decoded, 3);
    let index = index.read().unwrap();
    let disc_two: Vec<Option<u32>> = index
        .paths()
        .filter(|path| path.starts_with("Artist 0010/Album 0 of 0010/Disc 2/"))
        .map(|path| index.track_at(path).unwrap().data.disc)
        .collect();
    assert_eq!(disc_two, [Some(2); 5]);
    assert_eq!(
        index.cover("Artist 0000", "Album 2 of 0000").unwrap().state,
        CoverState::Valid
    );
}

#[cfg(unix)]
#[test]
fn a_broken_file_link_does_not_stop_removals() {
    let root = tempfile::tempdir().unwrap();
    tree::build(root.path());
    std::os::unix::fs::symlink(
        root.path().join("gone.mp3"),
        root.path().join("Pink Floyd/dangling.mp3"),
    )
    .unwrap();
    let index = RwLock::new(LibraryIndex::new());
    run(root.path(), &index, None);
    std::fs::remove_file(root.path().join("Root Song.mp3")).unwrap();
    let report = run(root.path(), &index, None);
    assert!(!report.failed);
    assert_eq!(report.removed, 1);
}

#[test]
fn skipped_files_are_not_read_again_after_a_restart() {
    let root = tempfile::tempdir().unwrap();
    let cache_dir = tempfile::tempdir().unwrap();
    tree::build(root.path());
    run(
        root.path(),
        &RwLock::new(LibraryIndex::new()),
        Some(&mut Cache::open(cache_dir.path()).unwrap()),
    );
    let restarted = RwLock::new(LibraryIndex::new());
    let mut cache = Cache::open(cache_dir.path()).unwrap();
    load(&restarted, &cache).unwrap();
    let report = run(root.path(), &restarted, Some(&mut cache));
    assert_eq!((report.read, report.skipped), (0, 4));

    // A skipped file that becomes valid is read and added.
    std::fs::copy(
        seed("tone.mp3"),
        root.path().join("Formats/Skipped/corrupt.mp3"),
    )
    .unwrap();
    let fixed = run(root.path(), &restarted, Some(&mut cache));
    assert_eq!((fixed.read, fixed.added, fixed.skipped), (1, 1, 3));
}

/// R11, P14.3: `sidecar.json` is never a track and never a skipped file, and the scan leaves
/// it as it is, also an orphan one.
#[test]
fn a_sidecar_is_not_a_track() {
    let root = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(root.path().join("A/B")).unwrap();
    std::fs::copy(seed("tone.mp3"), root.path().join("A/B/01 Song.mp3")).unwrap();
    let text = r#"{"version":1,"artwork":{"status":"no-match"},"tracks":{"gone.mp3":{}}}"#;
    std::fs::write(root.path().join("A/B/sidecar.json"), text).unwrap();
    let index = RwLock::new(LibraryIndex::new());
    let report = run(root.path(), &index, None);
    assert_eq!(paths(&index), ["A/B/01 Song.mp3"]);
    assert_eq!(report.skipped, 0);
    assert_eq!(
        std::fs::read_to_string(root.path().join("A/B/sidecar.json")).unwrap(),
        text
    );
}

/// Title and track number of each song in the index.
fn titles(index: &RwLock<LibraryIndex>) -> Vec<(String, String, Option<u32>)> {
    let index = index.read().unwrap();
    let mut rows: Vec<_> = index
        .paths()
        .filter_map(|path| index.track_at(path))
        .map(|track| {
            (
                track.rel_path().to_owned(),
                track.title().to_owned(),
                track.data.track_no,
            )
        })
        .collect();
    rows.sort();
    rows
}

/// P16.6, P16-AC3, P5.3: untagged songs take the sidecar title and track number; tagged
/// songs keep their tags; a changed or removed sidecar updates the album's rows at the next
/// scan, also from the cache after a restart.
#[test]
fn the_sidecar_fills_untagged_songs_and_follows_its_changes() {
    let root = tempfile::tempdir().unwrap();
    put(root.path(), "A/B/01 One.mp3", "tone.mp3", Tags::default());
    put(root.path(), "A/B/CD2/x.mp3", "tone.mp3", Tags::default());
    put(
        root.path(),
        "A/B/03 Tagged.mp3",
        "tone.mp3",
        Tags {
            title: Some("Tag Title"),
            track: Some(9),
            ..Tags::default()
        },
    );
    let sidecar = root.path().join("A/B/sidecar.json");
    std::fs::write(
        &sidecar,
        r#"{"version":1,"tracks":{"01 One.mp3":{"title":"Real One","track":4},"CD2/x.mp3":{"title":"Disc Two"},"03 Tagged.mp3":{"title":"Not Used","track":1},"gone.mp3":{"title":"Orphan"}}}"#,
    )
    .unwrap();
    let cache_dir = tempfile::tempdir().unwrap();
    let mut cache = Cache::open(cache_dir.path()).unwrap();
    let index = RwLock::new(LibraryIndex::new());
    run(root.path(), &index, Some(&mut cache));
    let expected = |one: &str, track: Option<u32>| {
        vec![
            ("A/B/01 One.mp3".to_owned(), one.to_owned(), track),
            (
                "A/B/03 Tagged.mp3".to_owned(),
                "Tag Title".to_owned(),
                Some(9),
            ),
            ("A/B/CD2/x.mp3".to_owned(), "Disc Two".to_owned(), None),
        ]
    };
    assert_eq!(titles(&index), expected("Real One", Some(4)));

    // A restart: the cache gives the same rows, and an unchanged folder reads no tags.
    let index = RwLock::new(LibraryIndex::new());
    load(&index, &cache).unwrap();
    assert_eq!(titles(&index), expected("Real One", Some(4)));
    let report = run(root.path(), &index, Some(&mut cache));
    assert_eq!(report.read, 0);

    // A changed sidecar updates the album with no audio file change.
    std::fs::write(&sidecar, r#"{"tracks":{"01 One.mp3":{"title":"Changed"}}}"#).unwrap();
    run(root.path(), &index, Some(&mut cache));
    let mut changed = expected("Changed", Some(1));
    changed[2].1 = "x".into();
    assert_eq!(titles(&index), changed);

    // A removed sidecar gives the file names back.
    std::fs::remove_file(&sidecar).unwrap();
    run(root.path(), &index, Some(&mut cache));
    let mut plain = expected("One", Some(1));
    plain[2].1 = "x".into();
    assert_eq!(titles(&index), plain);
    let reloaded = RwLock::new(LibraryIndex::new());
    load(&reloaded, &cache).unwrap();
    assert_eq!(titles(&reloaded), plain);
}
