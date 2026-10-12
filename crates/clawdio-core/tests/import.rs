//! Playlist import against fixtures (P12-AC2, P12-AC3, P12-AC4, P12-AC5). Temp folders only.

use std::path::{Path, PathBuf};

use clawdio_core::api::{ImportReport, MissingImport, MissingReason};
use clawdio_core::import::import_file;
use clawdio_core::library::{FileStamp, LibraryIndex, NewTrack};
use clawdio_core::playlist::PlaylistSet;

fn fixture(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/import")
        .join(name)
}

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

/// The library the fixtures match against. Two "Live/Intro.mp3" make the Intro ambiguous.
fn index() -> LibraryIndex {
    let mut index = LibraryIndex::default();
    for (path, title) in [
        ("Björk/Debut/01 Human Behaviour.mp3", "Human Behaviour"),
        ("Nina Simone/Pastel Blues/02 Sinnerman.ogg", "Sinnerman"),
        ("Café Tacvba/Re/01 La Ingrata.mp3", "La Ingrata"),
        ("Band A/Live/Intro.mp3", "Intro"),
        ("Band B/Live/Intro.mp3", "Intro"),
    ] {
        index.insert(track(path, title));
    }
    index
}

fn missing(label: &str, reason: MissingReason) -> MissingImport {
    MissingImport {
        label: label.into(),
        reason,
    }
}

/// Imports `name` and returns the reports and the new files' text.
fn import(name: &str) -> (Vec<ImportReport>, Vec<String>) {
    let root = tempfile::tempdir().unwrap();
    let source = fixture(name);
    let before = std::fs::read(&source).unwrap();
    let mut set = PlaylistSet::default();
    let reports = import_file(&mut set, root.path(), &index(), &source).unwrap();
    // P12-AC3: the source file is only read.
    assert_eq!(std::fs::read(&source).unwrap(), before, "{name} changed");
    let texts = reports
        .iter()
        .map(|report| {
            std::fs::read_to_string(root.path().join(PlaylistSet::new_path(&report.playlist)))
                .unwrap()
        })
        .collect();
    (reports, texts)
}

/// P12-AC2, P12-AC5: one user playlist (D22), the streaming track in the report only, `%20`
/// and `file://localhost/C:/` paths decoded.
#[test]
fn apple_xml_imports_the_user_playlist() {
    let (reports, texts) = import("apple.xml");
    assert_eq!(
        reports,
        [ImportReport {
            playlist: "Road Trip_ 2026".into(),
            matched: 1,
            missing: vec![
                missing("Cloud Band - Streaming Song", MissingReason::NoLocation),
                missing("Lost Song", MissingReason::NotFound),
            ],
            error: None,
        }]
    );
    assert_eq!(
        texts[0],
        "#EXTM3U\n\
         #EXTINF:200,Björk - Human Behaviour\n\
         ../Björk/Debut/01 Human Behaviour.mp3\n\
         #EXTINF:-1,Lost Song.mp3\n\
         C:/Users/Me/Music/Lost/Lost Song.mp3\n"
    );
}

/// P12-AC2: absolute Windows and UNC paths; the unmatched entries keep their text.
#[test]
fn a_musicbee_m3u8_imports_with_absolute_paths() {
    let (reports, texts) = import("musicbee.m3u8");
    assert_eq!(
        reports,
        [ImportReport {
            playlist: "musicbee".into(),
            matched: 1,
            missing: vec![
                missing("Somebody - Unknown", MissingReason::NotFound),
                missing("Intro", MissingReason::Ambiguous),
            ],
            error: None,
        }]
    );
    assert_eq!(
        texts[0],
        "#EXTM3U\n\
         #EXTINF:200,Nina Simone - Sinnerman\n\
         ../Nina Simone/Pastel Blues/02 Sinnerman.ogg\n\
         #EXTINF:100,Somebody - Unknown\n\
         D:\\Old\\Unknown.mp3\n\
         #EXTINF:60,Intro\n\
         \\\\nas\\music\\Live\\Intro.mp3\n"
    );
}

/// P12-AC2, P12-AC4: a Windows-1252 `.m3u` with "é".
#[test]
fn a_legacy_m3u_decodes_windows_1252() {
    let (reports, texts) = import("legacy.m3u");
    assert_eq!(reports[0].matched, 1);
    assert!(reports[0].missing.is_empty());
    assert_eq!(
        texts[0],
        "#EXTM3U\n#EXTINF:200,Café Tacvba - La Ingrata\n../Café Tacvba/Re/01 La Ingrata.mp3\n"
    );
}

#[test]
fn a_second_import_gets_a_numbered_name() {
    let root = tempfile::tempdir().unwrap();
    let mut set = PlaylistSet::default();
    let first = import_file(&mut set, root.path(), &index(), &fixture("legacy.m3u")).unwrap();
    let second = import_file(&mut set, root.path(), &index(), &fixture("legacy.m3u")).unwrap();
    assert_eq!(first[0].playlist, "legacy");
    assert_eq!(second[0].playlist, "legacy (2)");
}

/// A playlist that cannot be written gets a report with its error; the next one still imports.
#[test]
fn a_failed_playlist_does_not_stop_the_others() {
    let root = tempfile::tempdir().unwrap();
    let text = std::fs::read_to_string(fixture("apple.xml")).unwrap();
    let road_trip = "<dict>\n\t\t\t<key>Name</key><string>Road Trip: 2026</string>";
    // A file name over 255 bytes cannot be written on Linux, macOS or Windows.
    let long = format!(
        "<dict>\n\t\t\t<key>Name</key><string>{}</string>",
        "a".repeat(300)
    );
    let start = text.find(road_trip).unwrap();
    let end = start + text[start..].find("</dict>\n\t</array>").unwrap() + "</dict>".len();
    let copy = text[start..end].replacen(road_trip, &long, 1);
    let source = root.path().join("two.xml");
    std::fs::write(
        &source,
        text.replacen(road_trip, &format!("{copy}\n\t\t{road_trip}"), 1),
    )
    .unwrap();
    let mut set = PlaylistSet::default();
    let reports = import_file(&mut set, root.path(), &index(), &source).unwrap();
    assert_eq!(reports.len(), 2);
    assert!(reports[0].error.is_some(), "{reports:?}");
    assert_eq!(reports[1].playlist, "Road Trip_ 2026");
    assert_eq!(reports[1].error, None);
    assert_eq!(reports[1].matched, 1);
}
