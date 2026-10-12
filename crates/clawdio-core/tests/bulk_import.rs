//! Bulk import and missing-song repair (P19-AC2 to P19-AC6, P19-AC9). Temp folders only.

mod common;

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::RwLock;

use clawdio_core::api::{ImportReport, ImportStatus, MissingImport, MissingReason, RepairReport};
use clawdio_core::import::{after_scan, import_files, playlist_files};
use clawdio_core::library::{FileStamp, LibraryIndex, NewTrack};
use clawdio_core::playlist::PlaylistSet;
use clawdio_core::scan::scan;
use common::tree::{put, Tags};

fn track(rel_path: &str, title: &str) -> NewTrack {
    let parts: Vec<&str> = rel_path.split('/').collect();
    NewTrack {
        rel_path: rel_path.into(),
        artist: parts[0].into(),
        album: parts[1].into(),
        subfolder: None,
        title: title.into(),
        tag_artist: None,
        track_no: None,
        disc: None,
        duration_ms: 200_400,
        stamp: FileStamp::default(),
        has_picture: false,
    }
}

/// The library: `Band A/Live/Intro.mp3` and `Band B/Live/Intro.mp3` make an Intro ambiguous.
fn index() -> LibraryIndex {
    let mut index = LibraryIndex::default();
    for (path, title) in [
        ("Artist/Album/Song.mp3", "Song"),
        ("Artist/Album/Two.mp3", "Two"),
        ("Other/Album/Three.ogg", "Three"),
        ("Band A/Live/Intro.mp3", "Intro"),
        ("Band B/Live/Intro.mp3", "Intro"),
    ] {
        index.insert(track(path, title));
    }
    index
}

fn write(path: &Path, text: &str) {
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, text).unwrap();
}

fn read(path: &Path) -> String {
    std::fs::read_to_string(path).unwrap()
}

fn missing(label: &str, reason: MissingReason) -> MissingImport {
    MissingImport {
        label: label.into(),
        reason,
    }
}

fn imported(playlist: &str, matched: u32, missing: Vec<MissingImport>) -> ImportReport {
    ImportReport {
        playlist: playlist.into(),
        status: ImportStatus::Imported,
        matched,
        missing,
        error: None,
    }
}

fn skipped(playlist: &str) -> ImportReport {
    ImportReport {
        playlist: playlist.into(),
        status: ImportStatus::Skipped,
        matched: 0,
        missing: Vec::new(),
        error: None,
    }
}

fn failed(playlist: &str, error: &str) -> ImportReport {
    ImportReport {
        playlist: playlist.into(),
        status: ImportStatus::Failed,
        matched: 0,
        missing: Vec::new(),
        error: Some(error.into()),
    }
}

/// Every file under `folder` with its bytes.
fn snapshot(folder: &Path) -> BTreeMap<PathBuf, Vec<u8>> {
    walkdir::WalkDir::new(folder)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file())
        .map(|entry| {
            (
                entry.path().to_path_buf(),
                std::fs::read(entry.path()).unwrap(),
            )
        })
        .collect()
}

/// An Apple XML export with two user playlists and the system list.
const APPLE: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
	<key>Tracks</key>
	<dict>
		<key>1</key>
		<dict>
			<key>Name</key><string>Three</string>
			<key>Location</key><string>file://localhost/C:/Music/Other/Album/Three.m4a</string>
		</dict>
		<key>2</key>
		<dict>
			<key>Name</key><string>Two</string>
			<key>Location</key><string>file://localhost/C:/Music/Artist/Album/Two.mp3</string>
		</dict>
	</dict>
	<key>Playlists</key>
	<array>
		<dict>
			<key>Name</key><string>Library</string>
			<key>Master</key><true/>
			<key>Playlist Items</key>
			<array><dict><key>Track ID</key><integer>1</integer></dict></array>
		</dict>
		<dict>
			<key>Name</key><string>Evening</string>
			<key>Playlist Items</key>
			<array><dict><key>Track ID</key><integer>1</integer></dict></array>
		</dict>
		<dict>
			<key>Name</key><string>Road</string>
			<key>Playlist Items</key>
			<array><dict><key>Track ID</key><integer>2</integer></dict></array>
		</dict>
	</array>
</dict>
</plist>
"#;

/// The P19-AC3 source tree: subfolders, upper-case extensions, a non-Apple `.xml`, an
/// unreadable file (Unix: a link to nothing), an Apple XML with two playlists and a file that
/// is not a playlist.
fn source_tree(source: &Path) {
    write(
        &source.join("A/Road.M3U8"),
        "#EXTM3U\n#EXTINF:200,Artist - Song\nD:\\Old\\Artist\\Album\\Song.m4a\n#EXTINF:1,Gone\nD:\\Old\\Gone.mp3\n",
    );
    write(
        &source.join("B/sub/Mix.m3u"),
        "D:\\Old\\Live\\Intro.flac\r\nD:\\Old\\Artist\\Album\\Two.mp3\r\n",
    );
    write(
        &source.join("C/notes.XML"),
        "<notes>not a playlist</notes>\n",
    );
    write(&source.join("D/library.xml"), APPLE);
    write(&source.join("readme.txt"), "not a playlist\n");
    #[cfg(unix)]
    std::os::unix::fs::symlink(source.join("nowhere.m3u"), source.join("C/broken.m3u")).unwrap();
}

/// P19-AC3: one combined report in path order and the golden `.m3u8` files. The sources stay
/// byte for byte. The second "Road" gets " (2)" (D51).
#[test]
fn a_folder_import_gives_the_golden_combined_report() {
    let music = tempfile::tempdir().unwrap();
    let source = tempfile::tempdir().unwrap();
    source_tree(source.path());
    let before = snapshot(source.path());
    let files = playlist_files(source.path());
    let names: Vec<String> = files
        .iter()
        .map(|file| {
            file.strip_prefix(source.path())
                .unwrap()
                .to_string_lossy()
                .replace('\\', "/")
        })
        .collect();
    let mut expected_names = vec![
        "A/Road.M3U8",
        "B/sub/Mix.m3u",
        "C/notes.XML",
        "D/library.xml",
    ];
    if cfg!(unix) {
        expected_names.insert(2, "C/broken.m3u");
    }
    assert_eq!(names, expected_names);

    let mut set = PlaylistSet::default();
    let mut seen = Vec::new();
    let reports = import_files(&mut set, music.path(), &index(), &files, |report| {
        seen.push(report.playlist.clone());
    });
    let mut expected = vec![
        imported("Road", 1, vec![missing("Gone", MissingReason::NotFound)]),
        imported(
            "Mix",
            1,
            vec![missing("Intro.flac", MissingReason::Ambiguous)],
        ),
        failed(
            "notes.XML",
            "The file is not an Apple Music or iTunes playlist export",
        ),
        imported("Evening", 1, Vec::new()),
        imported("Road (2)", 1, Vec::new()),
    ];
    if cfg!(unix) {
        expected.insert(2, failed("broken.m3u", "The playlist file cannot be read"));
    }
    assert_eq!(reports, expected);
    assert_eq!(seen.len(), reports.len(), "each report as it is ready");
    let playlists = music.path().join("Playlists");
    assert_eq!(
        read(&playlists.join("Road.m3u8")),
        "#EXTM3U\n#EXTINF:200,Artist - Song\n../Artist/Album/Song.mp3\n#EXTINF:1,Gone\nD:\\Old\\Gone.mp3\n"
    );
    assert_eq!(
        read(&playlists.join("Mix.m3u8")),
        "#EXTM3U\n#EXTINF:-1,Intro.flac\nD:\\Old\\Live\\Intro.flac\n#EXTINF:200,Artist - Two\n../Artist/Album/Two.mp3\n"
    );
    assert_eq!(
        read(&playlists.join("Evening.m3u8")),
        "#EXTM3U\n#EXTINF:200,Other - Three\n../Other/Album/Three.ogg\n"
    );
    assert_eq!(
        read(&playlists.join("Road (2).m3u8")),
        "#EXTM3U\n#EXTINF:200,Artist - Two\n../Artist/Album/Two.mp3\n"
    );
    assert_eq!(snapshot(source.path()), before, "the sources are only read");
}

/// P19-AC3: a write failure after the first source. The first playlist is on disk; the later
/// ones fail and are not.
#[test]
fn a_write_failure_keeps_the_playlists_written_before_it() {
    let music = tempfile::tempdir().unwrap();
    let source = tempfile::tempdir().unwrap();
    source_tree(source.path());
    let playlists = music.path().join("Playlists");
    let kept = music.path().join("Playlists.kept");
    let mut set = PlaylistSet::default();
    let mut first = true;
    let reports = import_files(
        &mut set,
        music.path(),
        &index(),
        &playlist_files(source.path()),
        |_| {
            if std::mem::take(&mut first) {
                // A file in place of the folder fails every later write, for root too.
                std::fs::rename(&playlists, &kept).unwrap();
                std::fs::write(&playlists, "").unwrap();
            }
        },
    );
    assert_eq!(reports[0].status, ImportStatus::Imported);
    for report in reports.iter().skip(1) {
        assert_eq!(report.status, ImportStatus::Failed, "{report:?}");
    }
    let on_disk: Vec<PathBuf> = snapshot(&kept).into_keys().collect();
    assert_eq!(on_disk, [kept.join("Road.m3u8")]);
}

/// P19-AC2 (D51): an existing name in any letter case is skipped, also outside `Playlists/`;
/// repeats in one import are numbered; "Favorites" gets " (imported)".
#[test]
fn the_name_rule_skips_existing_names_and_numbers_repeats() {
    let music = tempfile::tempdir().unwrap();
    let source = tempfile::tempdir().unwrap();
    write(&music.path().join("Playlists/road.m3u8"), "#EXTM3U\n");
    write(&music.path().join("Artist/Mix.m3u8"), "#EXTM3U\n");
    let mut set = PlaylistSet::default();
    set.load(
        music.path(),
        &["Playlists/road.m3u8".into(), "Artist/Mix.m3u8".into()],
    );
    let entry = "D:\\Old\\Artist\\Album\\Song.mp3\n";
    for rel in [
        "a/ROAD.m3u",
        "b/mix.m3u",
        "c/Name.m3u",
        "d/Name.m3u8",
        "e/Name.m3u",
        "f/Favorites.m3u",
    ] {
        write(&source.path().join(rel), entry);
    }
    let before = snapshot(music.path());
    let reports = import_files(
        &mut set,
        music.path(),
        &index(),
        &playlist_files(source.path()),
        |_| {},
    );
    assert_eq!(
        reports,
        [
            skipped("ROAD"),
            skipped("mix"),
            imported("Name", 1, Vec::new()),
            imported("Name (2)", 1, Vec::new()),
            imported("Name (3)", 1, Vec::new()),
            imported("Favorites (imported)", 1, Vec::new()),
        ]
    );
    let after = snapshot(music.path());
    for (path, bytes) in &before {
        assert_eq!(after.get(path), Some(bytes), "{} changed", path.display());
    }
    assert!(!music.path().join("Playlists/ROAD.m3u8").exists() || cfg!(not(target_os = "linux")));
    assert!(!music.path().join("Playlists/mix.m3u8").exists());
}

/// The playlist for the repair tests: a CRLF line, a comment, `.m4a` entries, an ambiguous
/// entry, a not-found entry, a present entry and a matched entry with no `#EXTINF`.
const OLD: &str = "#EXTM3U\n#PLAYLIST:Old\n#EXTINF:100,Artist - Song\r\n../Artist/Album/Song.m4a\r\n#EXTINF:100,Somebody - Gone\nD:\\Old\\Gone.m4a\n#EXTINF:60,Intro\nD:\\Old\\Live\\Intro.m4a\n#EXTINF:61,Artist - Two\n../Artist/Album/Two.mp3\n\nC:\\Users\\Me\\Music\\Other\\Album\\Three.flac\n";

const OLD_FIXED: &str = "#EXTM3U\n#PLAYLIST:Old\n#EXTINF:200,Artist - Song\r\n../Artist/Album/Song.mp3\r\n#EXTINF:100,Somebody - Gone\nD:\\Old\\Gone.m4a\n#EXTINF:60,Intro\nD:\\Old\\Live\\Intro.m4a\n#EXTINF:61,Artist - Two\n../Artist/Album/Two.mp3\n\n#EXTINF:200,Other - Three\n../Other/Album/Three.ogg\n";

fn old_report() -> RepairReport {
    RepairReport {
        playlist: "Old".into(),
        fixed: 2,
        missing: vec![
            missing("Somebody - Gone", MissingReason::NotFound),
            missing("Intro", MissingReason::Ambiguous),
        ],
        error: None,
    }
}

/// P19-AC4: matched entries change in place; the others and every other line stay byte for
/// byte. A playlist with no match is not written.
#[test]
fn repair_replaces_matches_in_place_and_writes_nothing_without_a_match() {
    let music = tempfile::tempdir().unwrap();
    let old = music.path().join("Playlists/Old.m3u8");
    let none = music.path().join("Playlists/None.m3u8");
    write(&old, OLD);
    write(&none, "#EXTM3U\n#EXTINF:1,Gone\n../Gone/x.m4a\n");
    let stamp = std::time::UNIX_EPOCH + std::time::Duration::from_secs(1_000_000);
    std::fs::File::options()
        .write(true)
        .open(&none)
        .unwrap()
        .set_modified(stamp)
        .unwrap();
    let index = index();
    let mut set = PlaylistSet::default();
    set.load(
        music.path(),
        &["Playlists/Old.m3u8".into(), "Playlists/None.m3u8".into()],
    );
    let ids = set.with_missing(&index);
    let reports = set.repair(music.path(), &ids, &index);
    assert_eq!(
        reports,
        [
            RepairReport {
                playlist: "None".into(),
                fixed: 0,
                missing: vec![missing("Gone", MissingReason::NotFound)],
                error: None,
            },
            old_report(),
        ]
    );
    assert_eq!(read(&old), OLD_FIXED);
    assert_eq!(
        std::fs::metadata(&none).unwrap().modified().unwrap(),
        stamp,
        "not written"
    );
    let row = set
        .rows(&index)
        .into_iter()
        .find(|row| row.name == "Old")
        .unwrap();
    assert_eq!(row.missing_count, 2, "the set has the new entries");
}

/// P19-AC4: "Find missing songs in all playlists" repairs Favorites and a nested `.m3u8`
/// too, and leaves out playlists with nothing missing.
#[test]
fn repair_of_all_playlists_gives_the_golden_combined_report() {
    let music = tempfile::tempdir().unwrap();
    let root = music.path();
    write(&root.join("Playlists/Old.m3u8"), OLD);
    write(
        &root.join("Playlists/Favorites.m3u8"),
        "#EXTM3U\n#EXTINF:100,Artist - Song\n../Artist/Album/Song.flac\n",
    );
    write(
        &root.join("Artist/Album/list.m3u8"),
        "#EXTM3U\nTwo.m4a\nSong.mp3\n",
    );
    write(
        &root.join("Playlists/Fine.m3u8"),
        "#EXTM3U\n../Artist/Album/Two.mp3\n",
    );
    let index = index();
    let mut set = PlaylistSet::default();
    set.load(
        root,
        &[
            "Playlists/Old.m3u8".into(),
            "Playlists/Favorites.m3u8".into(),
            "Artist/Album/list.m3u8".into(),
            "Playlists/Fine.m3u8".into(),
        ],
    );
    let fine = read(&root.join("Playlists/Fine.m3u8"));
    let ids = set.with_missing(&index);
    let reports = set.repair(root, &ids, &index);
    let fixed = |playlist: &str| RepairReport {
        playlist: playlist.into(),
        fixed: 1,
        missing: Vec::new(),
        error: None,
    };
    assert_eq!(reports, [fixed("Favorites"), fixed("list"), old_report()]);
    assert_eq!(
        read(&root.join("Playlists/Favorites.m3u8")),
        "#EXTM3U\n#EXTINF:200,Artist - Song\n../Artist/Album/Song.mp3\n"
    );
    assert_eq!(
        read(&root.join("Artist/Album/list.m3u8")),
        "#EXTM3U\n#EXTINF:200,Artist - Two\nTwo.mp3\nSong.mp3\n"
    );
    assert_eq!(read(&root.join("Playlists/Old.m3u8")), OLD_FIXED);
    assert_eq!(read(&root.join("Playlists/Fine.m3u8")), fine);
    assert!(set.with_missing(&index).len() == 1, "Old keeps two missing");
}

fn complete(root: &Path, index: &RwLock<LibraryIndex>, cancel: bool) -> bool {
    let report = scan(root, index, None, &AtomicBool::new(cancel), |_| {});
    !report.canceled && !report.failed
}

/// P19-AC5: a song added after the last scan matches during import and repair (rescan
/// first). A canceled or failed scan writes no playlist.
#[test]
fn import_and_repair_rescan_first_and_stop_on_a_canceled_scan() {
    let music = tempfile::tempdir().unwrap();
    let root = music.path();
    let source = tempfile::tempdir().unwrap();
    put(root, "Artist/Album/Song.mp3", "tone.mp3", Tags::default());
    let index = RwLock::new(LibraryIndex::default());
    assert!(complete(root, &index, false));
    // Added after the last scan.
    put(root, "Artist/Album/New.mp3", "tone.mp3", Tags::default());
    put(root, "Artist/Album/Late.mp3", "tone.mp3", Tags::default());
    let list = source.path().join("New.m3u");
    write(&list, "D:\\Old\\Artist\\Album\\New.m4a\n");
    write(
        &root.join("Playlists/Old.m3u8"),
        "#EXTM3U\n../Artist/Album/Late.flac\n",
    );
    let guard = common::guard::Guard::new(root);
    let mut set = PlaylistSet::default();
    set.load(root, &["Playlists/Old.m3u8".into()]);
    let old = read(&root.join("Playlists/Old.m3u8"));

    // Canceled, then failed: nothing is matched or written.
    let scans: [fn() -> bool; 2] = [
        || false,
        || {
            let missing = tempfile::tempdir().unwrap().path().join("gone");
            complete(&missing, &RwLock::new(LibraryIndex::default()), false)
        },
    ];
    for scan_ok in scans {
        let result = after_scan(scan_ok, || {
            import_files(
                &mut set,
                root,
                &index.read().unwrap(),
                std::slice::from_ref(&list),
                |_| {},
            )
        });
        assert_eq!(result, None);
    }
    assert_eq!(
        after_scan(|| complete(root, &index, true), || ()),
        None,
        "a canceled scan"
    );
    assert!(!root.join("Playlists/New.m3u8").exists());
    let ids = set.with_missing(&index.read().unwrap());
    assert_eq!(
        after_scan(|| false, || set.repair(root, &ids, &index.read().unwrap())),
        None
    );
    assert_eq!(read(&root.join("Playlists/Old.m3u8")), old);

    let reports = after_scan(
        || complete(root, &index, false),
        || {
            import_files(
                &mut set,
                root,
                &index.read().unwrap(),
                std::slice::from_ref(&list),
                |_| {},
            )
        },
    )
    .unwrap();
    assert_eq!(reports[0].matched, 1, "{reports:?}");
    let ids = set.with_missing(&index.read().unwrap());
    let repaired = after_scan(
        || complete(root, &index, false),
        || set.repair(root, &ids, &index.read().unwrap()),
    )
    .unwrap();
    assert_eq!(repaired[0].fixed, 1, "{repaired:?}");
    assert!(read(&root.join("Playlists/Old.m3u8")).contains("../Artist/Album/Late.mp3"));
    guard.check();
}

/// P19-AC9: an unmatched relative entry is written relative to the new file; "Find missing
/// songs" repairs it once the song is there. An unmatched absolute entry keeps its text.
#[test]
fn an_unmatched_relative_entry_keeps_its_folder_for_a_later_repair() {
    let music = tempfile::tempdir().unwrap();
    let root = music.path();
    let list = root.join("Artist/Album/list.m3u");
    write(&list, "Song.m4a\nC:\\Elsewhere\\X.mp3\n");
    let mut index = LibraryIndex::default();
    index.insert(track("Other/Album/Three.ogg", "Three"));
    let mut set = PlaylistSet::default();
    let reports = import_files(&mut set, root, &index, &[list], |_| {});
    assert_eq!(reports[0].matched, 0);
    let file = root.join("Playlists/list.m3u8");
    assert_eq!(
        read(&file),
        "#EXTM3U\n#EXTINF:-1,Song.m4a\n../Artist/Album/Song.m4a\n#EXTINF:-1,X.mp3\nC:\\Elsewhere\\X.mp3\n"
    );
    index.insert(track("Artist/Album/Song.mp3", "Song"));
    let ids = set.with_missing(&index);
    let repaired = set.repair(root, &ids, &index);
    assert_eq!(repaired[0].fixed, 1);
    assert_eq!(
        read(&file),
        "#EXTM3U\n#EXTINF:200,Artist - Song\n../Artist/Album/Song.mp3\n#EXTINF:-1,X.mp3\nC:\\Elsewhere\\X.mp3\n"
    );
}

/// P19-AC6: repair on a read-only folder reports the error and changes no file. Root can
/// write such a folder, so the test runs for other users (CI).
#[cfg(unix)]
#[test]
fn repair_on_a_read_only_folder_reports_the_error_and_changes_nothing() {
    use std::os::unix::fs::PermissionsExt;
    let music = tempfile::tempdir().unwrap();
    let folder = music.path().join("Playlists");
    write(&folder.join("Old.m3u8"), OLD);
    let index = index();
    let mut set = PlaylistSet::default();
    set.load(music.path(), &["Playlists/Old.m3u8".into()]);
    std::fs::set_permissions(&folder, std::fs::Permissions::from_mode(0o555)).unwrap();
    if tempfile::NamedTempFile::new_in(&folder).is_ok() {
        std::fs::set_permissions(&folder, std::fs::Permissions::from_mode(0o755)).unwrap();
        eprintln!("skipped: this user can write a read-only folder (root)");
        return;
    }
    let ids = set.with_missing(&index);
    let reports = set.repair(music.path(), &ids, &index);
    let after = snapshot(&folder);
    std::fs::set_permissions(&folder, std::fs::Permissions::from_mode(0o755)).unwrap();
    assert_eq!(
        reports,
        [RepairReport {
            playlist: "Old".into(),
            fixed: 0,
            missing: Vec::new(),
            error: Some("The playlist file cannot be written. The folder may be read-only".into()),
        }]
    );
    assert_eq!(after.len(), 1);
    assert_eq!(after.values().next().unwrap(), OLD.as_bytes());
}
