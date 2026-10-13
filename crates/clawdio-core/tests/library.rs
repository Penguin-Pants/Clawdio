//! Library queries on a scanned fixture tree (P6.1): search folds case and accents, and the
//! Tree rule shows a whole album when its name matches (R6).

mod common;

use std::sync::atomic::AtomicBool;
use std::sync::RwLock;

use clawdio_core::api::SongScope;
use clawdio_core::library::LibraryIndex;
use clawdio_core::scan::scan;

fn scanned() -> (tempfile::TempDir, RwLock<LibraryIndex>) {
    let root = tempfile::tempdir().unwrap();
    common::tree::build(root.path());
    let index = RwLock::new(LibraryIndex::new());
    scan(root.path(), &index, None, &AtomicBool::new(false), |_| {});
    (root, index)
}

fn artist_names(index: &LibraryIndex, query: &str) -> Vec<String> {
    index
        .artist_rows(&index.artist_ids(query))
        .unwrap()
        .into_iter()
        .map(|row| row.name)
        .collect()
}

#[test]
fn search_folds_case_and_accents() {
    let (_root, index) = scanned();
    let index = index.read().unwrap();
    assert_eq!(artist_names(&index, "BJORK"), ["Björk"]);
    assert_eq!(artist_names(&index, "début"), ["Björk"]);
    assert_eq!(artist_names(&index, "debut"), ["Björk"]);
    assert_eq!(artist_names(&index, "チベタン"), ["坂本龍一"]);
    assert!(artist_names(&index, "no such thing").is_empty());
}

#[test]
fn the_tree_shows_a_whole_album_on_a_name_match_and_only_matching_songs_otherwise() {
    let (_root, index) = scanned();
    let index = index.read().unwrap();
    let tree = index.tree("ummagumma");
    assert_eq!(tree.len(), 1);
    assert_eq!(tree[0].albums.len(), 1);
    assert_eq!(
        tree[0].albums[0].songs.len(),
        3,
        "an album name match shows all its songs"
    );

    let tree = index.tree("axe");
    assert_eq!(tree[0].albums[0].name, "Ummagumma");
    assert_eq!(tree[0].albums[0].songs.len(), 1);

    let tree = index.tree("pink floyd");
    let songs: usize = tree[0].albums.iter().map(|album| album.songs.len()).sum();
    assert_eq!(
        songs, 9,
        "an artist name match shows all songs of the artist"
    );
}

#[test]
fn song_scopes_follow_the_selection() {
    let (_root, index) = scanned();
    let index = index.read().unwrap();
    let all = index.song_ids(SongScope::default(), "", &[]).unwrap();
    let floyd = index.artist_ids("pink floyd")[0];
    let by_artist = index
        .song_ids(
            SongScope {
                artist: Some(floyd),
                album: None,
            },
            "",
            &[],
        )
        .unwrap();
    assert!(by_artist.len() < all.len());
    let wall = index.album_ids(Some(floyd), "wall").unwrap()[0];
    let by_album = index
        .song_ids(
            SongScope {
                artist: None,
                album: Some(wall),
            },
            "",
            &[],
        )
        .unwrap();
    assert_eq!(by_album.len(), 4);
}
