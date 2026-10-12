//! Playlists against a scanned tree (P11-AC6, P11-AC7, P11-AC11). Temp folders only.

mod common;

use std::collections::BTreeMap;
use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::sync::RwLock;

use clawdio_core::api::PlaylistEntry;
use clawdio_core::cache::Cache;
use clawdio_core::library::LibraryIndex;
use clawdio_core::playlist::PlaylistSet;
use clawdio_core::scan::{scan, ScanReport};
use common::tree::{put, Tags};

fn run(root: &Path, index: &RwLock<LibraryIndex>, cache: Option<&mut Cache>) -> ScanReport {
    scan(root, index, cache, &AtomicBool::new(false), |_| {})
}

/// Two artist folders, playlists in three places, and two formats that are not listed.
fn tree(root: &Path) {
    put(
        root,
        "Björk/Debut/01 Human.mp3",
        "tone.mp3",
        Tags::default(),
    );
    put(
        root,
        "Nina/Blues/02 Sinner.ogg",
        "tone-vorbis.ogg",
        Tags::default(),
    );
    let write = |rel: &str, text: &str| {
        let path = root.join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, text).unwrap();
    };
    write(
        "Playlists/Mix.m3u8",
        "#EXTM3U\n#PLAYLIST:kept as is\n../Björk/Debut/01 Human.mp3\n../Gone/x.mp3\n",
    );
    write("Nina/Blues/album.M3U8", "02 Sinner.ogg\n");
    write("root.m3u8", "Björk/Debut/01 Human.mp3\n");
    write("Playlists/old.m3u", "../Björk/Debut/01 Human.mp3\n");
    write("Playlists/old.pls", "[playlist]\n");
    write(".hidden/secret.m3u8", "x\n");
}

fn hashes(root: &Path) -> BTreeMap<String, Vec<u8>> {
    walkdir::WalkDir::new(root)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| {
            entry
                .path()
                .extension()
                .is_some_and(|e| e.eq_ignore_ascii_case("m3u8"))
        })
        .map(|entry| {
            (
                entry.path().display().to_string(),
                std::fs::read(entry.path()).unwrap(),
            )
        })
        .collect()
}

/// Names and entry states, for comparing two loads.
fn states(set: &PlaylistSet, index: &LibraryIndex) -> Vec<(String, Vec<bool>)> {
    set.rows()
        .into_iter()
        .map(|row| {
            let entries: Vec<PlaylistEntry> = set.entries(row.id, index).unwrap();
            (
                row.name,
                entries.iter().map(|entry| entry.track.is_some()).collect(),
            )
        })
        .collect()
}

/// P11-AC6: `.m3u8` files in any folder are listed; `.m3u`, `.pls` and hidden ones are not.
#[test]
fn m3u8_files_in_any_folder_are_listed() {
    let dir = tempfile::tempdir().unwrap();
    tree(dir.path());
    let index = RwLock::new(LibraryIndex::default());
    let mut report = run(dir.path(), &index, None);
    report.playlists.sort();
    assert_eq!(
        report.playlists,
        ["Nina/Blues/album.M3U8", "Playlists/Mix.m3u8", "root.m3u8"]
    );
    let mut set = PlaylistSet::default();
    set.load(dir.path(), &report.playlists);
    let index = index.read().unwrap();
    assert_eq!(
        states(&set, &index),
        [
            ("album".to_owned(), vec![true]),
            ("Mix".to_owned(), vec![true, false]),
            ("root".to_owned(), vec![true]),
        ]
    );
}

/// P11-AC7: a rescan leaves every playlist file byte-identical.
#[test]
fn a_rescan_writes_no_playlist() {
    let dir = tempfile::tempdir().unwrap();
    tree(dir.path());
    let before = hashes(dir.path());
    let index = RwLock::new(LibraryIndex::default());
    let report = run(dir.path(), &index, None);
    let mut set = PlaylistSet::default();
    set.load(dir.path(), &report.playlists);
    let again = run(dir.path(), &index, None);
    set.load(dir.path(), &again.playlists);
    assert_eq!(hashes(dir.path()), before);
}

/// P11-AC11: after the cache is deleted the same playlists show with the same entry states.
#[test]
fn a_deleted_cache_gives_the_same_playlists() {
    let dir = tempfile::tempdir().unwrap();
    let cache_dir = tempfile::tempdir().unwrap();
    tree(dir.path());
    let first = {
        let index = RwLock::new(LibraryIndex::default());
        let mut cache = Cache::open(cache_dir.path()).unwrap();
        let report = run(dir.path(), &index, Some(&mut cache));
        let mut set = PlaylistSet::default();
        set.load(dir.path(), &report.playlists);
        let index = index.read().unwrap();
        states(&set, &index)
    };
    std::fs::remove_dir_all(cache_dir.path()).unwrap();
    std::fs::create_dir_all(cache_dir.path()).unwrap();
    let index = RwLock::new(LibraryIndex::default());
    let mut cache = Cache::open(cache_dir.path()).unwrap();
    let report = run(dir.path(), &index, Some(&mut cache));
    let mut set = PlaylistSet::default();
    set.load(dir.path(), &report.playlists);
    assert_eq!(states(&set, &index.read().unwrap()), first);
}
