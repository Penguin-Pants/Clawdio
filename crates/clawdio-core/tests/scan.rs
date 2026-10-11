//! Scan skeleton (P4.7) on a generated tree in a temp folder.

use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::sync::RwLock;

use clawdio_core::api::SongScope;
use clawdio_core::cache::Cache;
use clawdio_core::library::LibraryIndex;
use clawdio_core::scan::{scan, BATCH};

#[path = "../examples/gen_test_library.rs"]
#[allow(dead_code)]
mod generator;

fn seed(name: &str) -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/seed")
        .join(name)
}

#[test]
fn reads_tags_and_groups_by_folder() {
    let root = tempfile::tempdir().unwrap();
    generator::generate(root.path(), 12).unwrap();
    std::fs::copy(seed("tone.mp3"), root.path().join("Loose.mp3")).unwrap();
    std::fs::write(root.path().join("notes.txt"), "not audio").unwrap();
    let index = RwLock::new(LibraryIndex::new());
    let mut cache = Cache::in_memory().unwrap();
    let report = scan(
        root.path(),
        &index,
        Some(&mut cache),
        &AtomicBool::new(false),
        |_| {},
    );
    assert_eq!(
        (report.added, report.skipped, report.canceled),
        (13, 0, false)
    );
    assert_eq!(cache.count().unwrap(), 13);
    let index = index.read().unwrap();
    let names: Vec<String> = index
        .artist_rows(&index.artist_ids(""))
        .unwrap()
        .into_iter()
        .map(|a| a.name)
        .collect();
    assert_eq!(names, ["Artist 0000", "Unknown Artist"]);
    let ids = index.song_ids(SongScope::default(), "").unwrap();
    let rows = index.rows(&ids).unwrap();
    assert_eq!(
        rows[0].title, "Song 1 of Album 0 of 0000",
        "the tag title wins"
    );
    assert_eq!(rows[0].album_name, "Album 0 of 0000");
    assert!(
        rows.iter()
            .all(|row| row.duration_ms > 900 && row.duration_ms < 1100),
        "decoded durations"
    );
    assert_eq!(rows.last().unwrap().title, "Loose", "no tag: the file name");
}

#[test]
fn writes_in_batches_and_cancel_keeps_what_it_added() {
    let root = tempfile::tempdir().unwrap();
    generator::generate(root.path(), BATCH + 20).unwrap();
    let index = RwLock::new(LibraryIndex::new());
    let mut cache = Cache::in_memory().unwrap();
    let mut batches = Vec::new();
    let report = scan(
        root.path(),
        &index,
        Some(&mut cache),
        &AtomicBool::new(false),
        |added| batches.push(added),
    );
    assert_eq!(batches, [BATCH as u64, BATCH as u64 + 20]);
    assert_eq!(report.added, BATCH as u64 + 20);

    let index = RwLock::new(LibraryIndex::new());
    let canceled = scan(
        root.path(),
        &index,
        Some(&mut Cache::in_memory().unwrap()),
        &AtomicBool::new(true),
        |_| {},
    );
    assert!(canceled.canceled);
    assert_eq!(canceled.added, 0);
}

#[test]
fn a_scan_without_a_cache_still_fills_the_index() {
    let root = tempfile::tempdir().unwrap();
    generator::generate(root.path(), 3).unwrap();
    let index = RwLock::new(LibraryIndex::new());
    let report = scan(root.path(), &index, None, &AtomicBool::new(false), |_| {});
    assert_eq!(report.added, 3);
    let ids = index
        .read()
        .unwrap()
        .song_ids(SongScope::default(), "")
        .unwrap();
    assert_eq!(ids.len(), 3);
}
