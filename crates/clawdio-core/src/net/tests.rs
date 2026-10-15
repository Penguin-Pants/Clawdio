//! Online rules against a local mock server (P14.8). Temp folders only.

use std::path::{Path, PathBuf};
use std::time::Duration;

use httpmock::Method::GET;
use httpmock::MockServer;
use image::{DynamicImage, ImageFormat, Rgb, RgbImage};
use tokio::time::Instant;

use super::artwork::{self, AlbumTarget, Lookup, LookupError, Skip};
use super::*;
use crate::library::{CoverInfo, FileStamp, LibraryIndex, NewTrack};
use crate::sidecar::{self, ArtworkMarker, Sidecar, SIDECAR_FILE};

const USER_AGENT: &str = "Player/1.2.3 ( https://example.org/player )";
const GROUP_ID: &str = "0b1c2d3e-0000-4000-8000-00000000abcd";
const IMAGE_PATH: &str = "/release-group/0b1c2d3e-0000-4000-8000-00000000abcd/front-500";

fn config(server: &MockServer) -> NetConfig {
    let base = Url::parse(&format!("{}/", server.base_url())).unwrap();
    NetConfig {
        musicbrainz: base.clone(),
        cover_art: base.clone(),
        lrclib: base.clone(),
        lyrics_ovh: base,
        hosts: Hosts::every(&["127.0.0.1"]),
        https_only: false,
        user_agent: USER_AGENT.into(),
        musicbrainz_gap: Duration::ZERO,
        lrclib_gap: Duration::ZERO,
        request_timeout: Duration::from_secs(30),
        use_proxy: false,
    }
}

/// A gate for the mock server, with the D64 notice answered.
fn gate(server: &MockServer) -> OnlineGate {
    let gate = OnlineGate::new(config(server), true).unwrap();
    gate.set_lyrics_ovh_allowed(true);
    gate
}

fn image(format: ImageFormat) -> Vec<u8> {
    let image = DynamicImage::ImageRgb8(RgbImage::from_pixel(8, 8, Rgb([200, 0, 0])));
    let mut bytes = Vec::new();
    image
        .write_to(&mut std::io::Cursor::new(&mut bytes), format)
        .unwrap();
    bytes
}

fn search(groups: &[(&str, &str, &str)]) -> String {
    let groups: Vec<_> = groups
        .iter()
        .map(|(id, title, artist)| {
            serde_json::json!({ "id": id, "title": title, "artist-credit": [{ "name": artist }] })
        })
        .collect();
    serde_json::json!({ "release-groups": groups }).to_string()
}

fn seed() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/seed/tone.mp3")
}

/// A music folder with one song in "Artist/<album>" and the album as a lookup target.
fn library(album: &str) -> (tempfile::TempDir, AlbumTarget) {
    let root = tempfile::tempdir().unwrap();
    let folder = root.path().join("Artist").join(album);
    std::fs::create_dir_all(&folder).unwrap();
    std::fs::copy(seed(), folder.join("01 Song.mp3")).unwrap();
    let rel_path = format!("Artist/{album}/01 Song.mp3");
    let stamp = crate::artwork::stamp(&root.path().join(&rel_path)).unwrap();
    let target = AlbumTarget {
        album: 0,
        artist: "Artist".into(),
        name: album.into(),
        folder: format!("Artist/{album}"),
        songs: vec![(rel_path, stamp)],
    };
    (root, target)
}

fn folder(root: &tempfile::TempDir, target: &AlbumTarget) -> PathBuf {
    root.path().join(&target.folder)
}

/// Mocks a search answer and an image answer.
async fn services<'a>(
    server: &'a MockServer,
    groups: &[(&str, &str, &str)],
    image_status: u16,
    content_type: &str,
    body: Vec<u8>,
) -> (httpmock::Mock<'a>, httpmock::Mock<'a>) {
    let answer = search(groups);
    let search = server
        .mock_async(|when, then| {
            when.method(GET)
                .path("/ws/2/release-group/")
                .query_param("fmt", "json")
                .header("user-agent", USER_AGENT);
            then.status(200)
                .header("content-type", "application/json")
                .body(answer);
        })
        .await;
    let content_type = content_type.to_owned();
    let image = server
        .mock_async(|when, then| {
            when.method(GET).path(IMAGE_PATH);
            then.status(image_status)
                .header("content-type", content_type)
                .body(body);
        })
        .await;
    (search, image)
}

/// P14-AC3, P14-AC4: the folder "1973 - Album (Remastered)" matches the group "Album"; one
/// match saves a valid `cover.jpg` and no marker.
#[tokio::test]
async fn one_matching_group_saves_the_cover() {
    let server = MockServer::start_async().await;
    let groups = [
        (GROUP_ID, "Album", "Artist"),
        ("ffff", "Album Two", "Artist"),
    ];
    let jpeg = image(ImageFormat::Jpeg);
    let (search, cover) = services(&server, &groups, 200, "image/jpeg", jpeg.clone()).await;
    let (root, target) = library("1973 - Album (Remastered)");
    let gate = gate(&server);
    let result = artwork::lookup(&gate, root.path(), &target, &gate.job_token()).await;
    assert_eq!(result, Ok(Lookup::Saved));
    assert_eq!(search.calls_async().await, 1);
    assert_eq!(cover.calls_async().await, 1);
    let saved = std::fs::read(folder(&root, &target).join("cover.jpg")).unwrap();
    assert_eq!(saved, jpeg);
    assert_eq!(sidecar::read(&folder(&root, &target)), Sidecar::Missing);
}

/// P14-AC4: zero or two matches write the no-match marker; no image request.
#[tokio::test]
async fn zero_or_two_matches_write_the_marker() {
    for groups in [
        vec![("aaaa", "Other", "Artist")],
        vec![
            (GROUP_ID, "Album", "Artist"),
            ("bbbb", "The Album", "Artist"),
        ],
    ] {
        let server = MockServer::start_async().await;
        let (_, cover) = services(
            &server,
            &groups,
            200,
            "image/jpeg",
            image(ImageFormat::Jpeg),
        )
        .await;
        let (root, target) = library("Album");
        let gate = gate(&server);
        let result = artwork::lookup(&gate, root.path(), &target, &gate.job_token()).await;
        assert_eq!(result, Ok(Lookup::NoMatch));
        assert_eq!(cover.calls_async().await, 0);
        let sidecar = sidecar::read(&folder(&root, &target));
        assert_eq!(sidecar.marker(), Some(ArtworkMarker::NoMatch));
        assert!(!folder(&root, &target).join("cover.jpg").exists());
    }
}

/// R8: a second exact match on a later search page makes two matches, so no match.
#[tokio::test]
async fn a_second_match_on_the_next_page_is_no_match() {
    let server = MockServer::start_async().await;
    let mut first: Vec<_> = (0..99).map(|_| ("cccc", "Other", "Artist")).collect();
    first.push((GROUP_ID, "Album", "Artist"));
    let page = |groups: &[(&str, &str, &str)]| {
        let mut body: serde_json::Value = serde_json::from_str(&search(groups)).unwrap();
        body["count"] = 101.into();
        body.to_string()
    };
    let (first_body, second_body) = (page(&first), page(&[("dddd", "Album", "Artist")]));
    let pages = [("0", first_body), ("100", second_body)];
    for (offset, body) in &pages {
        server
            .mock_async(|when, then| {
                when.path("/ws/2/release-group/")
                    .query_param("limit", "100")
                    .query_param("offset", *offset);
                then.status(200).body(body);
            })
            .await;
    }
    let (root, target) = library("Album");
    let gate = gate(&server);
    let result = artwork::lookup(&gate, root.path(), &target, &gate.job_token()).await;
    assert_eq!(result, Ok(Lookup::NoMatch));
}

/// A match on the title alone is not a match: the artist credit must match too.
#[tokio::test]
async fn the_artist_credit_must_match() {
    let server = MockServer::start_async().await;
    services(
        &server,
        &[(GROUP_ID, "Album", "Someone Else")],
        200,
        "image/jpeg",
        image(ImageFormat::Jpeg),
    )
    .await;
    let (root, target) = library("Album");
    let gate = gate(&server);
    let result = artwork::lookup(&gate, root.path(), &target, &gate.job_token()).await;
    assert_eq!(result, Ok(Lookup::NoMatch));
}

/// P14-AC4, P14-AC13: a 503, a 429 or no network writes no marker and no file.
#[tokio::test]
async fn a_service_or_network_error_writes_nothing() {
    for status in [503, 429] {
        let server = MockServer::start_async().await;
        server
            .mock_async(|when, then| {
                when.path("/ws/2/release-group/");
                then.status(status);
            })
            .await;
        let (root, target) = library("Album");
        let gate = gate(&server);
        let result = artwork::lookup(&gate, root.path(), &target, &gate.job_token()).await;
        assert_eq!(result, Err(LookupError::Net(NetError::Status(status))));
        assert_eq!(
            std::fs::read_dir(folder(&root, &target)).unwrap().count(),
            1
        );
    }
    let server = MockServer::start_async().await;
    let mut config = config(&server);
    // A port with no listener stands for no network.
    let closed = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = closed.local_addr().unwrap().port();
    drop(closed);
    config.musicbrainz = Url::parse(&format!("http://127.0.0.1:{port}/")).unwrap();
    let gate = OnlineGate::new(config, true).unwrap();
    let (root, target) = library("Album");
    let result = artwork::lookup(&gate, root.path(), &target, &gate.job_token()).await;
    assert!(
        matches!(result, Err(LookupError::Net(NetError::Network(_)))),
        "{result:?}"
    );
    assert_eq!(
        std::fs::read_dir(folder(&root, &target)).unwrap().count(),
        1
    );
}

/// P14.5 step 5: a 404 for the image after a unique match writes the no-art marker.
#[tokio::test]
async fn no_front_image_writes_the_no_art_marker() {
    let server = MockServer::start_async().await;
    services(
        &server,
        &[(GROUP_ID, "Album", "Artist")],
        404,
        "text/plain",
        b"none".to_vec(),
    )
    .await;
    let (root, target) = library("Album");
    let gate = gate(&server);
    let result = artwork::lookup(&gate, root.path(), &target, &gate.job_token()).await;
    assert_eq!(result, Ok(Lookup::NoArt));
    let sidecar = sidecar::read(&folder(&root, &target));
    assert_eq!(sidecar.marker(), Some(ArtworkMarker::NoArt));
}

/// P14-AC9: a body that is not an image, or is over 10 MB, saves nothing.
#[tokio::test]
async fn a_bad_or_large_body_saves_nothing() {
    let cases: [(&str, Vec<u8>, LookupError); 3] = [
        ("text/html", b"<html>".to_vec(), LookupError::NotAnImage),
        (
            "image/jpeg",
            b"\xff\xd8\xffnot really".to_vec(),
            LookupError::NotAnImage,
        ),
        (
            "image/jpeg",
            vec![0xff; MAX_BODY as usize + 1],
            LookupError::Net(NetError::TooLarge),
        ),
    ];
    for (content_type, body, error) in cases {
        let server = MockServer::start_async().await;
        services(
            &server,
            &[(GROUP_ID, "Album", "Artist")],
            200,
            content_type,
            body,
        )
        .await;
        let (root, target) = library("Album");
        let gate = gate(&server);
        let result = artwork::lookup(&gate, root.path(), &target, &gate.job_token()).await;
        assert_eq!(result, Err(error));
        assert_eq!(
            std::fs::read_dir(folder(&root, &target)).unwrap().count(),
            1
        );
    }
}

#[tokio::test]
async fn a_png_is_saved_as_jpeg() {
    let server = MockServer::start_async().await;
    services(
        &server,
        &[(GROUP_ID, "Album", "Artist")],
        200,
        "image/png",
        image(ImageFormat::Png),
    )
    .await;
    let (root, target) = library("Album");
    let gate = gate(&server);
    let result = artwork::lookup(&gate, root.path(), &target, &gate.job_token()).await;
    assert_eq!(result, Ok(Lookup::Saved));
    let saved = std::fs::read(folder(&root, &target).join("cover.jpg")).unwrap();
    assert!(saved.starts_with(&[0xff, 0xd8, 0xff]));
    image::load_from_memory_with_format(&saved, ImageFormat::Jpeg).unwrap();
}

/// P14-AC1 (core part): with the switch off no request starts.
#[tokio::test]
async fn the_switch_off_makes_zero_requests() {
    let server = MockServer::start_async().await;
    let (search, cover) = services(
        &server,
        &[(GROUP_ID, "Album", "Artist")],
        200,
        "image/jpeg",
        image(ImageFormat::Jpeg),
    )
    .await;
    let (root, target) = library("Album");
    let gate = OnlineGate::new(config(&server), false).unwrap();
    let result = artwork::lookup(&gate, root.path(), &target, &gate.job_token()).await;
    assert_eq!(result, Err(LookupError::Net(NetError::Off)));
    assert_eq!(gate.request_count(), 0);
    assert_eq!(search.calls_async().await + cover.calls_async().await, 0);
}

/// P14-AC2: Cancel or the switch turned off during a slow download ends it within 1 s, and
/// no file is written.
#[tokio::test]
async fn cancel_or_switch_off_aborts_a_slow_download() {
    for switch_off in [false, true] {
        let server = MockServer::start_async().await;
        server
            .mock_async(|when, then| {
                when.path("/ws/2/release-group/");
                then.status(200)
                    .body(search(&[(GROUP_ID, "Album", "Artist")]));
            })
            .await;
        server
            .mock_async(|when, then| {
                when.path(IMAGE_PATH);
                then.status(200)
                    .header("content-type", "image/jpeg")
                    .body(image(ImageFormat::Jpeg))
                    .delay(Duration::from_secs(10));
            })
            .await;
        let (root, target) = library("Album");
        let gate = std::sync::Arc::new(gate(&server));
        let token = gate.job_token();
        let job = {
            let (gate, token, root, target) = (
                gate.clone(),
                token.clone(),
                root.path().to_owned(),
                target.clone(),
            );
            tokio::spawn(async move { artwork::lookup(&gate, &root, &target, &token).await })
        };
        tokio::time::sleep(Duration::from_millis(300)).await;
        let start = Instant::now();
        if switch_off {
            gate.set_on(false);
        } else {
            token.cancel();
        }
        let result = job.await.unwrap();
        assert!(start.elapsed() < Duration::from_secs(1));
        let expected = if switch_off {
            NetError::Off
        } else {
            NetError::Canceled
        };
        assert_eq!(result, Err(LookupError::Net(expected)));
        assert_eq!(
            std::fs::read_dir(folder(&root, &target)).unwrap().count(),
            1
        );
    }
}

/// A turned-off switch stops later jobs too; turning it on again gives new jobs a live token.
#[tokio::test]
async fn switching_off_cancels_tokens_and_on_gives_new_ones() {
    let server = MockServer::start_async().await;
    let gate = gate(&server);
    let old = gate.job_token();
    gate.set_on(false);
    assert!(old.is_cancelled());
    gate.set_on(true);
    assert!(!gate.job_token().is_cancelled());
}

/// P14.6: a final write that passed its token check ends before Cancel returns, and a write
/// after Cancel does not run.
#[tokio::test]
async fn cancel_waits_for_a_running_write_and_blocks_later_ones() {
    use std::sync::atomic::{AtomicBool, Ordering};
    let server = MockServer::start_async().await;
    let gate = gate(&server);
    let token = gate.job_token();
    let written = Arc::new(AtomicBool::new(false));
    let (started_tx, started_rx) = std::sync::mpsc::channel();
    let writer = {
        let (commits, token, written) = (gate.commit_lock(), token.clone(), written.clone());
        std::thread::spawn(move || {
            commits.run(&token, || {
                started_tx.send(()).unwrap();
                std::thread::sleep(Duration::from_millis(200));
                written.store(true, Ordering::SeqCst);
            })
        })
    };
    started_rx.recv().unwrap();
    token.cancel();
    gate.wait_commits();
    assert!(
        written.load(Ordering::SeqCst),
        "Cancel returned during the write"
    );
    assert!(writer.join().unwrap().is_ok());
    let later = gate
        .commit_lock()
        .run(&token, || panic!("wrote after Cancel"));
    assert_eq!(later, Err(NetError::Canceled));
}

/// P14-AC6: MusicBrainz requests start at least 1 s apart, also from two callers, and carry
/// the User-Agent.
#[tokio::test]
async fn musicbrainz_requests_start_one_second_apart() {
    let server = MockServer::start_async().await;
    let hits = server
        .mock_async(|when, then| {
            when.path("/ws/2/release-group/")
                .header("user-agent", USER_AGENT);
            then.status(200).body(search(&[]));
        })
        .await;
    let mut config = config(&server);
    config.musicbrainz_gap = Duration::from_secs(1);
    let gate = std::sync::Arc::new(OnlineGate::new(config, true).unwrap());
    let url = gate
        .config()
        .musicbrainz
        .join("ws/2/release-group/")
        .unwrap();
    let start = Instant::now();
    let calls: Vec<_> = (0..3)
        .map(|_| {
            let (gate, url) = (gate.clone(), url.clone());
            tokio::spawn(async move {
                let token = gate.job_token();
                gate.get(Service::MusicBrainz, url, &token).await
            })
        })
        .collect();
    for call in calls {
        assert!(call.await.unwrap().is_ok());
    }
    assert!(
        start.elapsed() >= Duration::from_secs(2),
        "{:?}",
        start.elapsed()
    );
    assert_eq!(hits.calls_async().await, 3);
}

#[tokio::test]
async fn lrclib_requests_carry_the_client_header() {
    let server = MockServer::start_async().await;
    let hits = server
        .mock_async(|when, then| {
            when.path("/api/get").header("lrclib-client", USER_AGENT);
            then.status(200).body("{}");
        })
        .await;
    let gate = gate(&server);
    let url = gate.config().lrclib.join("api/get").unwrap();
    assert!(gate
        .get(Service::Lrclib, url, &gate.job_token())
        .await
        .is_ok());
    assert_eq!(hits.calls_async().await, 1);
}

/// P14-AC11: a redirect to a host outside the allow-list is refused; an allowed one is
/// followed, up to 5 hops.
#[tokio::test]
async fn redirects_follow_the_allow_list_and_the_hop_limit() {
    let server = MockServer::start_async().await;
    let port = server.port();
    let jpeg = image(ImageFormat::Jpeg);
    server
        .mock_async(|when, then| {
            when.path("/outside");
            then.status(307)
                .header("location", format!("http://localhost:{port}/img"));
        })
        .await;
    server
        .mock_async(|when, then| {
            when.path("/inside");
            then.status(307)
                .header("location", format!("http://127.0.0.1:{port}/img"));
        })
        .await;
    for hop in 0..6 {
        let next = if hop == 5 {
            "/img".to_owned()
        } else {
            format!("/hop{}", hop + 1)
        };
        server
            .mock_async(|when, then| {
                when.path(format!("/hop{hop}"));
                then.status(302)
                    .header("location", format!("http://127.0.0.1:{port}{next}"));
            })
            .await;
    }
    let image = server
        .mock_async(|when, then| {
            when.path("/img");
            then.status(200)
                .header("content-type", "image/jpeg")
                .body(jpeg);
        })
        .await;
    let gate = gate(&server);
    let get = |path: &str| {
        let url = gate.config().cover_art.join(path).unwrap();
        let token = gate.job_token();
        let gate = &gate;
        async move { gate.get(Service::CoverArt, url, &token).await }
    };
    assert_eq!(get("outside").await, Err(NetError::NotAllowed));
    assert_eq!(image.calls_async().await, 0);
    assert!(get("inside").await.is_ok());
    assert!(get("hop1").await.is_ok(), "5 redirects");
    assert_eq!(get("hop0").await, Err(NetError::NotAllowed), "6 redirects");
    // The first request itself must be allowed too.
    let outside = Url::parse(&format!("http://localhost:{port}/img")).unwrap();
    assert_eq!(
        gate.get(Service::CoverArt, outside, &gate.job_token())
            .await,
        Err(NetError::NotAllowed)
    );
    assert_eq!(image.calls_async().await, 2);
}

#[test]
fn production_hosts_are_https_and_archive_subdomains() {
    let config = NetConfig::production(USER_AGENT.into());
    let allowed = |url: &str| {
        let url = Url::parse(url).unwrap();
        [
            Service::MusicBrainz,
            Service::CoverArt,
            Service::Lrclib,
            Service::LyricsOvh,
        ]
        .into_iter()
        .any(|service| host_allowed(config.hosts.of(service), true, &url))
    };
    assert!(allowed("https://musicbrainz.org/ws/2/"));
    assert!(allowed("https://api.lyrics.ovh/v1/a/b"));
    assert!(!allowed("https://lyrics.ovh/"));
    assert!(allowed("https://ia800.us.archive.org/x.jpg"));
    assert!(allowed("https://archive.org/x.jpg"));
    assert!(!allowed("http://musicbrainz.org/ws/2/"), "HTTPS only");
    assert!(!allowed("https://evilarchive.org/x.jpg"));
    assert!(!allowed("https://musicbrainz.org.example.com/"));
    assert!(!allowed("https://example.com/"));
    // P24.3: each service keeps to its own hosts.
    let lyrics_ovh = Url::parse("https://api.lyrics.ovh/v1/a/b").unwrap();
    assert!(!host_allowed(
        config.hosts.of(Service::Lrclib),
        true,
        &lyrics_ovh
    ));
    assert!(!host_allowed(
        config.hosts.of(Service::MusicBrainz),
        true,
        &lyrics_ovh
    ));
    let lrclib = Url::parse("https://lrclib.net/api/get").unwrap();
    assert!(!host_allowed(
        config.hosts.of(Service::LyricsOvh),
        true,
        &lrclib
    ));
    assert_eq!(config.lyrics_ovh.as_str(), "https://api.lyrics.ovh/");
    assert_eq!(config.lrclib_gap, Duration::from_millis(500));
}

#[test]
fn lucene_characters_are_escaped() {
    assert_eq!(
        artwork::lucene(r#"AC/DC: "Live" (1992)"#),
        r#"AC\/DC\: \"Live\" \(1992\)"#
    );
}

fn new_track(rel_path: &str, has_picture: bool) -> NewTrack {
    let parts: Vec<&str> = rel_path.split('/').collect();
    let (artist, album) = match parts.len() {
        3.. => (parts[0], parts[1]),
        2 => (parts[0], crate::library::UNKNOWN_ALBUM),
        _ => (
            crate::library::UNKNOWN_ARTIST,
            crate::library::UNKNOWN_ALBUM,
        ),
    };
    NewTrack {
        rel_path: rel_path.into(),
        artist: artist.into(),
        album: album.into(),
        subfolder: None,
        title: "Song".into(),
        tag_artist: None,
        track_no: None,
        disc: None,
        duration_ms: 1000,
        stamp: FileStamp::default(),
        has_picture,
    }
}

/// P14-AC5, P14-AC14 (index part): Unknown groups, songs in the artist folder, embedded art,
/// a valid cover file and a broken `cover.jpg` are not candidates; a broken `folder.jpg` is.
#[test]
fn candidates_come_from_the_scan_flags() {
    let mut index = LibraryIndex::default();
    for (path, picture) in [
        ("A/Plain/01.mp3", false),
        ("A/Embedded/01.mp3", false),
        ("A/Embedded/02.mp3", true),
        ("A/Covered/01.mp3", false),
        ("A/BrokenCover/01.mp3", false),
        ("A/BrokenFolder/01.mp3", false),
        ("A/loose.mp3", false),
        ("root.mp3", false),
        ("Unknown Artist/Album/01.mp3", false),
    ] {
        index.insert(new_track(path, picture));
    }
    let broken = |name: &str| CoverInfo {
        state: crate::library::CoverState::Broken,
        file: Some((name.into(), FileStamp::default())),
    };
    index.set_cover(
        "A",
        "Covered",
        CoverInfo {
            state: crate::library::CoverState::Valid,
            file: Some(("folder.png".into(), FileStamp::default())),
        },
    );
    index.set_cover("A", "BrokenCover", broken("Cover.JPG"));
    index.set_cover("A", "BrokenFolder", broken("folder.jpg"));
    let names: Vec<String> = artwork::candidates(&index)
        .into_iter()
        .map(|target| target.folder)
        .collect();
    assert_eq!(names, ["A/Plain", "A/BrokenFolder"]);
}

/// P14-AC5, P14-AC8, P14-AC10, P14-AC14 (disk part): the check before each request.
#[test]
fn the_folder_check_skips_art_markers_and_corrupt_sidecars() {
    let (root, target) = library("Album");
    let folder = folder(&root, &target);
    assert_eq!(artwork::check(root.path(), &target), Ok(()));
    // A broken folder.jpg is no art.
    std::fs::write(folder.join("folder.jpg"), b"broken").unwrap();
    assert_eq!(artwork::check(root.path(), &target), Ok(()));
    std::fs::write(folder.join("folder.jpg"), image(ImageFormat::Jpeg)).unwrap();
    assert_eq!(artwork::check(root.path(), &target), Err(Skip::HasArt));
    std::fs::remove_file(folder.join("folder.jpg")).unwrap();
    std::fs::write(folder.join("COVER.jpg"), b"broken").unwrap();
    assert_eq!(artwork::check(root.path(), &target), Err(Skip::CoverJpg));
    std::fs::remove_file(folder.join("COVER.jpg")).unwrap();
    sidecar::write_marker(
        &folder,
        ArtworkMarker::NoMatch,
        std::time::SystemTime::now(),
    )
    .unwrap();
    assert_eq!(artwork::check(root.path(), &target), Err(Skip::Marker));
    assert_eq!(sidecar::clear_marker(&folder), Ok(true));
    assert_eq!(artwork::check(root.path(), &target), Ok(()));
    std::fs::write(folder.join(SIDECAR_FILE), "{broken").unwrap();
    assert_eq!(
        artwork::check(root.path(), &target),
        Err(Skip::CorruptSidecar)
    );
    assert_eq!(
        std::fs::read_to_string(folder.join(SIDECAR_FILE)).unwrap(),
        "{broken"
    );
}

/// A song that gained a picture after the scan counts as art (P14.6).
#[test]
fn a_song_changed_since_the_scan_is_read_again() {
    use lofty::config::WriteOptions;
    use lofty::picture::{MimeType, Picture, PictureType};
    use lofty::tag::{Tag, TagExt, TagType};
    let (root, target) = library("Album");
    let song = root.path().join(&target.songs[0].0);
    let mut tag = Tag::new(TagType::Id3v2);
    tag.push_picture(
        Picture::unchecked(image(ImageFormat::Png))
            .pic_type(PictureType::CoverFront)
            .mime_type(MimeType::Png)
            .build(),
    );
    tag.save_to_path(&song, WriteOptions::default()).unwrap();
    assert_eq!(artwork::check(root.path(), &target), Err(Skip::HasArt));
}

#[cfg(unix)]
#[test]
fn a_read_only_folder_is_skipped() {
    use std::os::unix::fs::PermissionsExt;
    let (root, target) = library("Album");
    let folder = folder(&root, &target);
    std::fs::set_permissions(&folder, std::fs::Permissions::from_mode(0o555)).unwrap();
    let writable = tempfile::NamedTempFile::new_in(&folder).is_ok();
    let result = artwork::check(root.path(), &target);
    std::fs::set_permissions(&folder, std::fs::Permissions::from_mode(0o755)).unwrap();
    if writable {
        // Root writes into read-only folders, so this case cannot run here.
        eprintln!("skipped: the test runs with write access to read-only folders");
        return;
    }
    assert_eq!(result, Err(Skip::ReadOnly));
}

/// P14-AC7 (core part): after "Retry lookup" clears the marker, the album is looked up.
/// P14-AC8: with the marker kept (also after a new index), no request is made.
#[tokio::test]
async fn a_marker_blocks_the_lookup_until_retry_clears_it() {
    let server = MockServer::start_async().await;
    let (search, _) = services(
        &server,
        &[(GROUP_ID, "Album", "Artist")],
        200,
        "image/jpeg",
        image(ImageFormat::Jpeg),
    )
    .await;
    let (root, target) = library("Album");
    sidecar::write_marker(
        &folder(&root, &target),
        ArtworkMarker::NoMatch,
        std::time::SystemTime::now(),
    )
    .unwrap();
    let gate = gate(&server);
    let result = artwork::lookup(&gate, root.path(), &target, &gate.job_token()).await;
    assert_eq!(result, Ok(Lookup::Skipped(Skip::Marker)));
    assert_eq!(search.calls_async().await, 0);
    sidecar::clear_marker(&folder(&root, &target)).unwrap();
    let result = artwork::lookup(&gate, root.path(), &target, &gate.job_token()).await;
    assert_eq!(result, Ok(Lookup::Saved));
    assert_eq!(search.calls_async().await, 1);
}

/// P14-AC9: a chunked body with no Content-Length stops at the 10 MB cap while it streams.
#[tokio::test]
async fn a_streamed_body_over_10_mb_stops_at_the_cap() {
    use std::io::{Read, Write};
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut request = [0u8; 4096];
        let _ = stream.read(&mut request);
        let _ = stream.write_all(
            b"HTTP/1.1 200 OK\r\nContent-Type: image/jpeg\r\nTransfer-Encoding: chunked\r\n\r\n",
        );
        let chunk = vec![0xff; 1024 * 1024];
        for _ in 0..12 {
            let head = format!("{:x}\r\n", chunk.len());
            if stream.write_all(head.as_bytes()).is_err()
                || stream.write_all(&chunk).is_err()
                || stream.write_all(b"\r\n").is_err()
            {
                return;
            }
        }
        let _ = stream.write_all(b"0\r\n\r\n");
    });
    let server = MockServer::start_async().await;
    let gate = gate(&server);
    let url = Url::parse(&format!("http://127.0.0.1:{port}/big")).unwrap();
    let result = gate.get(Service::CoverArt, url, &gate.job_token()).await;
    assert_eq!(result, Err(NetError::TooLarge));
}

mod lyrics_fetch {
    use super::*;
    use crate::net::lyrics::{fetch, save, Fetched, LyricsQuery, SaveError};

    fn query(duration_s: u32) -> LyricsQuery {
        LyricsQuery {
            artist: "Artist".into(),
            title: "Title".into(),
            album: "Album".into(),
            duration_ms: duration_s * 1000,
        }
    }

    /// lyrics.ovh knows no song (D62).
    async fn ovh_missing(server: &MockServer) -> httpmock::Mock<'_> {
        server
            .mock_async(|when, then| {
                when.path_includes("/v1/");
                then.status(404).body(r#"{"error":"No lyrics found"}"#);
            })
            .await
    }

    fn record(duration: f64, synced: Option<&str>, plain: Option<&str>) -> serde_json::Value {
        serde_json::json!({
            "id": 1, "trackName": "Title", "artistName": "Artist", "albumName": "Album",
            "duration": duration, "instrumental": false,
            "syncedLyrics": synced, "plainLyrics": plain,
        })
    }

    /// P15-AC1 (AC-5): for "01 - Title.mp3" with no tags, the request carries the cleaned
    /// title, the folder names and the decoded duration in whole seconds.
    #[tokio::test]
    async fn the_get_request_carries_the_cleaned_title_and_duration() {
        use lofty::tag::TagType;
        let root = tempfile::tempdir().unwrap();
        let song = root.path().join("Artist/Album/01 - Title.mp3");
        std::fs::create_dir_all(song.parent().unwrap()).unwrap();
        std::fs::copy(seed(), &song).unwrap();
        let _ = TagType::Id3v2.remove_from_path(&song, lofty::config::WriteOptions::default());
        let _ = TagType::Id3v1.remove_from_path(&song, lofty::config::WriteOptions::default());
        let _ = TagType::Ape.remove_from_path(&song, lofty::config::WriteOptions::default());
        let index = std::sync::RwLock::new(LibraryIndex::default());
        crate::scan::scan(
            root.path(),
            &index,
            None,
            &std::sync::atomic::AtomicBool::new(false),
            |_| {},
        );
        let (query, duration_ms) = {
            let index = index.read().unwrap();
            let track = index.track_at("Artist/Album/01 - Title.mp3").unwrap();
            (LyricsQuery::for_track(track), track.data.duration_ms)
        };
        assert_eq!(query.title, "Title");
        assert_eq!(query.duration_ms, duration_ms);
        assert!(query.duration_s() > 0);
        let server = MockServer::start_async().await;
        let duration = query.duration_s().to_string();
        let get = server
            .mock_async(|when, then| {
                when.method(GET)
                    .path("/api/get")
                    .query_param("track_name", "Title")
                    .query_param("artist_name", "Artist")
                    .query_param("album_name", "Album")
                    .query_param("duration", duration)
                    .header("lrclib-client", USER_AGENT);
                then.status(200).body(
                    record(
                        f64::from(query.duration_ms) / 1000.0,
                        Some("[00:01.00]la"),
                        None,
                    )
                    .to_string(),
                );
            })
            .await;
        let gate = gate(&server);
        let found = fetch(&gate, &query, &gate.job_token()).await;
        assert_eq!(found, Ok(Some(Fetched::Synced("[00:01.00]la".into()))));
        assert_eq!(get.calls_async().await, 1);
    }

    /// P15-AC2: 2 s off is accepted on both endpoints; 3 s off is rejected, and a `/api/get`
    /// result 3 s off leads to the search.
    #[tokio::test]
    async fn two_seconds_off_is_accepted_and_three_is_not() {
        let server = MockServer::start_async().await;
        let get = server
            .mock_async(|when, then| {
                when.path("/api/get");
                then.status(200)
                    .body(record(202.0, None, Some("plain")).to_string());
            })
            .await;
        let gate = gate(&server);
        let found = fetch(&gate, &query(200), &gate.job_token()).await;
        assert_eq!(found, Ok(Some(Fetched::Plain("plain".into()))));
        get.delete_async().await;

        server
            .mock_async(|when, then| {
                when.path("/api/get");
                then.status(200)
                    .body(record(203.0, Some("[00:01.00]x"), None).to_string());
            })
            .await;
        let search = server
            .mock_async(|when, then| {
                when.path("/api/search")
                    .query_param("track_name", "Title")
                    .query_param("artist_name", "Artist");
                then.status(200).body(
                    serde_json::json!([
                        record(197.0, Some("[00:01.00]far"), None),
                        record(198.0, None, Some("near plain")),
                        record(201.5, Some("[00:01.00]near synced"), None),
                    ])
                    .to_string(),
                );
            })
            .await;
        let found = fetch(&gate, &query(200), &gate.job_token()).await;
        assert_eq!(
            found,
            Ok(Some(Fetched::Synced("[00:01.00]near synced".into())))
        );
        assert_eq!(search.calls_async().await, 1);
    }

    /// P15-AC4: a 404 leads to the search; no result within 2 s is no lyrics.
    #[tokio::test]
    async fn no_acceptable_result_is_none() {
        let server = MockServer::start_async().await;
        server
            .mock_async(|when, then| {
                when.path("/api/get");
                then.status(404).body("{}");
            })
            .await;
        let search = server
            .mock_async(|when, then| {
                when.path("/api/search");
                then.status(200).body(
                    serde_json::json!([
                        record(203.0, None, Some("off")),
                        record(200.0, None, Some("  "))
                    ])
                    .to_string(),
                );
            })
            .await;
        ovh_missing(&server).await;
        let gate = gate(&server);
        assert_eq!(fetch(&gate, &query(200), &gate.job_token()).await, Ok(None));
        assert_eq!(search.calls_async().await, 1);
    }

    /// P15-AC6: with the switch off no request is made.
    #[tokio::test]
    async fn the_switch_off_makes_no_lyrics_request() {
        let server = MockServer::start_async().await;
        let any = server
            .mock_async(|when, then| {
                when.path_includes("/api/");
                then.status(200).body("[]");
            })
            .await;
        let gate = OnlineGate::new(config(&server), false).unwrap();
        assert_eq!(
            fetch(&gate, &query(200), &gate.job_token()).await,
            Err(NetError::Off)
        );
        assert_eq!(any.calls_async().await, 0);
    }

    /// P15-AC3: synced lyrics save as `.lrc`, plain as `.txt`; an existing file stays.
    #[test]
    fn synced_save_as_lrc_and_plain_as_txt() {
        let folder = tempfile::tempdir().unwrap();
        let song = folder.path().join("01 Song.mp3");
        save(&song, &Fetched::Synced("[00:01.00]a".into())).unwrap();
        assert_eq!(
            std::fs::read_to_string(folder.path().join("01 Song.lrc")).unwrap(),
            "[00:01.00]a\n"
        );
        save(&song, &Fetched::Plain("b\n".into())).unwrap();
        assert_eq!(
            std::fs::read_to_string(folder.path().join("01 Song.txt")).unwrap(),
            "b\n"
        );
        assert_eq!(
            save(&song, &Fetched::Plain("c".into())),
            Err(SaveError::Exists)
        );
        assert_eq!(
            std::fs::read_to_string(folder.path().join("01 Song.txt")).unwrap(),
            "b\n"
        );
    }

    /// P15-AC5: a read-only folder is found before any request.
    #[cfg(unix)]
    #[test]
    fn a_read_only_folder_is_found_first() {
        use crate::net::lyrics::check_writable;
        use std::os::unix::fs::PermissionsExt;
        let folder = tempfile::tempdir().unwrap();
        let song = folder.path().join("01 Song.mp3");
        assert_eq!(check_writable(&song), Ok(()));
        std::fs::set_permissions(folder.path(), std::fs::Permissions::from_mode(0o555)).unwrap();
        let writable = tempfile::NamedTempFile::new_in(folder.path()).is_ok();
        let result = check_writable(&song);
        std::fs::set_permissions(folder.path(), std::fs::Permissions::from_mode(0o755)).unwrap();
        if writable {
            eprintln!("skipped: the test runs with write access to read-only folders");
            return;
        }
        assert_eq!(result, Err(SaveError::ReadOnly));
    }

    /// A `/api/get` answer with no lyrics leads to the search.
    #[tokio::test]
    async fn a_get_answer_without_lyrics_leads_to_the_search() {
        let server = MockServer::start_async().await;
        server
            .mock_async(|when, then| {
                when.path("/api/get");
                then.status(200)
                    .body(record(200.0, None, Some(" ")).to_string());
            })
            .await;
        let search = server
            .mock_async(|when, then| {
                when.path("/api/search");
                then.status(200)
                    .body(serde_json::json!([record(200.0, None, Some("found"))]).to_string());
            })
            .await;
        let gate = gate(&server);
        let found = fetch(&gate, &query(200), &gate.job_token()).await;
        assert_eq!(found, Ok(Some(Fetched::Plain("found".into()))));
        assert_eq!(search.calls_async().await, 1);
    }

    /// The 2 s rule on the search alone, in milliseconds: a 200.4 s song takes a 202.4 s
    /// result and not a 202.5 s one; the closest synced result wins.
    #[tokio::test]
    async fn the_search_takes_the_closest_result_within_two_seconds() {
        for (records, expected) in [
            (
                vec![record(202.4, None, Some("edge"))],
                Some(Fetched::Plain("edge".into())),
            ),
            (vec![record(202.5, None, Some("over"))], None),
            (
                vec![
                    record(202.0, Some("[00:01.00]far"), None),
                    record(200.5, None, Some("plain")),
                    record(200.3, Some("[00:01.00]near"), None),
                ],
                Some(Fetched::Synced("[00:01.00]near".into())),
            ),
        ] {
            let server = MockServer::start_async().await;
            server
                .mock_async(|when, then| {
                    when.path("/api/get");
                    then.status(404);
                })
                .await;
            server
                .mock_async(|when, then| {
                    when.path("/api/search");
                    then.status(200)
                        .body(serde_json::Value::from(records).to_string());
                })
                .await;
            ovh_missing(&server).await;
            let gate = gate(&server);
            let mut song = query(200);
            song.duration_ms = 200_400;
            assert_eq!(fetch(&gate, &song, &gate.job_token()).await, Ok(expected));
        }
    }

    /// A search answer that is not JSON is an error, not "No lyrics found".
    #[tokio::test]
    async fn a_bad_search_answer_is_an_error() {
        let server = MockServer::start_async().await;
        server
            .mock_async(|when, then| {
                when.path("/api/get");
                then.status(404);
            })
            .await;
        server
            .mock_async(|when, then| {
                when.path("/api/search");
                then.status(200).body("<html>busy</html>");
            })
            .await;
        let gate = gate(&server);
        assert_eq!(
            fetch(&gate, &query(200), &gate.job_token()).await,
            Err(NetError::BadAnswer)
        );
    }

    /// LRCLIB gets one request at a time (section 6.11).
    #[tokio::test]
    async fn lrclib_requests_run_one_at_a_time() {
        let server = MockServer::start_async().await;
        server
            .mock_async(|when, then| {
                when.path("/api/get");
                then.status(200)
                    .body("{}")
                    .delay(Duration::from_millis(400));
            })
            .await;
        let gate = std::sync::Arc::new(gate(&server));
        let url = gate.config().lrclib.join("api/get").unwrap();
        let start = Instant::now();
        let calls: Vec<_> = (0..3)
            .map(|_| {
                let (gate, url) = (gate.clone(), url.clone());
                tokio::spawn(async move { gate.get(Service::Lrclib, url, &gate.job_token()).await })
            })
            .collect();
        for call in calls {
            assert!(call.await.unwrap().is_ok());
        }
        assert!(
            start.elapsed() >= Duration::from_millis(1200),
            "{:?}",
            start.elapsed()
        );
    }

    /// A blank lyrics file holds no lyrics (P13), so a fetch replaces it.
    #[test]
    fn a_blank_lyrics_file_is_replaced() {
        let folder = tempfile::tempdir().unwrap();
        let song = folder.path().join("01 Song.mp3");
        std::fs::write(folder.path().join("01 Song.lrc"), " \n").unwrap();
        save(&song, &Fetched::Synced("[00:01.00]a".into())).unwrap();
        assert_eq!(
            std::fs::read_to_string(folder.path().join("01 Song.lrc")).unwrap(),
            "[00:01.00]a\n"
        );
    }
}

mod metadata_fill {
    use super::*;
    use crate::net::metadata::{propose, read_song, SongInfo};
    use crate::sidecar::TrackEntry;

    const RELEASE_A: &str = "aaaaaaaa-0000-4000-8000-000000000001";
    const RELEASE_B: &str = "bbbbbbbb-0000-4000-8000-000000000002";
    const GROUP: &str = "cccccccc-0000-4000-8000-000000000003";

    fn song(key: &str) -> SongInfo {
        SongInfo {
            key: key.into(),
            ..SongInfo::default()
        }
    }

    fn summary(
        id: &str,
        title: &str,
        artist: &str,
        group: &str,
        date: &str,
        count: u32,
    ) -> serde_json::Value {
        serde_json::json!({
            "id": id, "title": title, "date": date, "track-count": count,
            "artist-credit": [{ "name": artist }], "release-group": { "id": group },
        })
    }

    fn release(id: &str, date: &str, media: &[&[&str]]) -> String {
        let media: Vec<_> = media
            .iter()
            .enumerate()
            .map(|(index, titles)| {
                let tracks: Vec<_> = titles
                    .iter()
                    .enumerate()
                    .map(|(n, title)| serde_json::json!({ "position": n + 1, "number": (n + 1).to_string(), "title": title }))
                    .collect();
                serde_json::json!({ "position": index + 1, "tracks": tracks })
            })
            .collect();
        serde_json::json!({ "id": id, "title": "Album", "date": date, "media": media }).to_string()
    }

    async fn search_mock<'a>(
        server: &'a MockServer,
        album: &str,
        releases: Vec<serde_json::Value>,
    ) -> httpmock::Mock<'a> {
        let query = format!("release:\"{album}\"");
        server
            .mock_async(|when, then| {
                when.path("/ws/2/release/")
                    .query_param_includes("query", query);
                then.status(200)
                    .body(serde_json::json!({ "releases": releases }).to_string());
            })
            .await
    }

    async fn release_mock<'a>(
        server: &'a MockServer,
        id: &str,
        body: String,
    ) -> httpmock::Mock<'a> {
        server
            .mock_async(|when, then| {
                when.path(format!("/ws/2/release/{id}"))
                    .query_param("inc", "recordings");
                then.status(200).body(body);
            })
            .await
    }

    /// P16-AC1: only fields the tags lack are proposed; songs map by track number, else by
    /// title.
    #[tokio::test]
    async fn only_missing_fields_are_proposed() {
        let server = MockServer::start_async().await;
        search_mock(
            &server,
            "album",
            vec![summary(
                RELEASE_A,
                "Album",
                "Artist",
                GROUP,
                "1973-05-01",
                3,
            )],
        )
        .await;
        release_mock(
            &server,
            RELEASE_A,
            release(RELEASE_A, "1973-05-01", &[&["One", "Two", "Three"]]),
        )
        .await;
        let songs = [
            song("01 One.mp3"),
            SongInfo {
                key: "x.mp3".into(),
                tag_title: Some("Two".into()),
                tag_year: Some(2001),
                ..SongInfo::default()
            },
            SongInfo {
                key: "Bonus/three.mp3".into(),
                tag_track: Some(3),
                tag_title: Some("Three".into()),
                tag_year: Some(1973),
                ..SongInfo::default()
            },
        ];
        let gate = gate(&server);
        let found = propose(&gate, "Artist", "Album", &songs, &gate.job_token())
            .await
            .unwrap();
        assert_eq!(
            found,
            [
                (
                    "01 One.mp3".to_owned(),
                    TrackEntry {
                        title: Some("One".into()),
                        track: Some(1),
                        year: Some(1973),
                    }
                ),
                (
                    "x.mp3".to_owned(),
                    TrackEntry {
                        title: None,
                        track: Some(2),
                        year: None,
                    }
                ),
            ]
        );
    }

    /// P16-AC9: a folder name that finds no release, with an album tag that does, gives a
    /// proposal.
    #[tokio::test]
    async fn the_album_tag_finds_what_the_folder_name_does_not() {
        let server = MockServer::start_async().await;
        search_mock(&server, "folder name", vec![]).await;
        search_mock(
            &server,
            "real album",
            vec![summary(
                RELEASE_A,
                "Real Album",
                "Real Artist",
                GROUP,
                "1990",
                2,
            )],
        )
        .await;
        release_mock(
            &server,
            RELEASE_A,
            release(RELEASE_A, "1990", &[&["One", "Two"]]),
        )
        .await;
        let tagged = |key: &str| SongInfo {
            key: key.into(),
            tag_album: Some("Real Album".into()),
            tag_artist: Some("Real Artist".into()),
            ..SongInfo::default()
        };
        let songs = [tagged("01 One.mp3"), tagged("02 Two.mp3")];
        let gate = gate(&server);
        let found = propose(
            &gate,
            "Folder Artist",
            "Folder Name",
            &songs,
            &gate.job_token(),
        )
        .await
        .unwrap();
        assert_eq!(found.len(), 2);
        assert_eq!(found[0].1.year, Some(1990));
    }

    /// P16-AC9: two releases with the same best score give no proposal; fewer than half the
    /// songs matched gives none.
    #[tokio::test]
    async fn a_tie_or_a_weak_match_gives_no_proposal() {
        let server = MockServer::start_async().await;
        search_mock(
            &server,
            "album",
            vec![
                summary(RELEASE_A, "Album", "Artist", GROUP, "1973", 2),
                summary(RELEASE_B, "Album", "Artist", GROUP, "1974", 2),
            ],
        )
        .await;
        release_mock(
            &server,
            RELEASE_A,
            release(RELEASE_A, "1973", &[&["One", "Two"]]),
        )
        .await;
        release_mock(
            &server,
            RELEASE_B,
            release(RELEASE_B, "1974", &[&["One", "Two"]]),
        )
        .await;
        let gate = gate(&server);
        let songs = [song("01 One.mp3"), song("02 Two.mp3")];
        assert_eq!(
            propose(&gate, "Artist", "Album", &songs, &gate.job_token()).await,
            Ok(Vec::new())
        );

        let server = MockServer::start_async().await;
        search_mock(
            &server,
            "album",
            vec![summary(RELEASE_A, "Album", "Artist", GROUP, "1973", 3)],
        )
        .await;
        release_mock(
            &server,
            RELEASE_A,
            release(RELEASE_A, "1973", &[&["One", "Other", "Else"]]),
        )
        .await;
        let gate = super::gate(&server);
        let songs = [song("01 One.mp3"), song("02 Two.mp3"), song("03 Three.mp3")];
        assert_eq!(
            propose(&gate, "Artist", "Album", &songs, &gate.job_token()).await,
            Ok(Vec::new())
        );
    }

    /// Two release groups from the folder names give no candidate (D42 step 1).
    #[tokio::test]
    async fn two_release_groups_give_no_proposal() {
        let server = MockServer::start_async().await;
        search_mock(
            &server,
            "album",
            vec![
                summary(RELEASE_A, "Album", "Artist", GROUP, "1973", 1),
                summary(
                    RELEASE_B,
                    "Album",
                    "Artist",
                    "dddddddd-0000-4000-8000-000000000004",
                    "1980",
                    1,
                ),
            ],
        )
        .await;
        let scored =
            release_mock(&server, RELEASE_A, release(RELEASE_A, "1973", &[&["One"]])).await;
        let gate = gate(&server);
        let found = propose(
            &gate,
            "Artist",
            "Album",
            &[song("01 One.mp3")],
            &gate.job_token(),
        )
        .await;
        assert_eq!(found, Ok(Vec::new()));
        assert_eq!(scored.calls_async().await, 0);
    }

    /// P16.3: disc and track number map a song on a two-disc release; with no disc tag the
    /// title maps it.
    #[tokio::test]
    async fn songs_map_by_disc_and_track_then_by_title() {
        let server = MockServer::start_async().await;
        search_mock(
            &server,
            "album",
            vec![summary(RELEASE_A, "Album", "Artist", GROUP, "2000", 4)],
        )
        .await;
        release_mock(
            &server,
            RELEASE_A,
            release(RELEASE_A, "2000", &[&["One", "Two"], &["Three", "Four"]]),
        )
        .await;
        let songs = [
            SongInfo {
                key: "CD2/01 a.mp3".into(),
                tag_disc: Some(2),
                tag_title: Some("Three".into()),
                ..SongInfo::default()
            },
            SongInfo {
                key: "CD2/02 Four.mp3".into(),
                ..SongInfo::default()
            },
        ];
        let gate = gate(&server);
        let found = propose(&gate, "Artist", "Album", &songs, &gate.job_token())
            .await
            .unwrap();
        assert_eq!(found[0].1.track, Some(1), "disc 2, track 1");
        assert_eq!(found[0].1.title, None, "the tag title stays");
        assert_eq!(found[1].1.title.as_deref(), Some("Four"));
        assert_eq!(
            found[1].1.track,
            Some(2),
            "by title: Four is track 2 on disc 2"
        );
    }

    /// With the switch off no request is made.
    #[tokio::test]
    async fn the_switch_off_makes_no_fill_request() {
        let server = MockServer::start_async().await;
        let any = search_mock(&server, "album", vec![]).await;
        let gate = OnlineGate::new(config(&server), false).unwrap();
        let found = propose(
            &gate,
            "Artist",
            "Album",
            &[song("01 One.mp3")],
            &gate.job_token(),
        )
        .await;
        assert_eq!(found, Err(LookupError::Net(NetError::Off)));
        assert_eq!(any.calls_async().await, 0);
    }

    /// Tags are read for the missing check: title, track, disc, year, album and artist.
    #[test]
    fn song_tags_are_read() {
        use lofty::config::WriteOptions;
        use lofty::prelude::*;
        use lofty::tag::{Tag, TagType};
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("01 x.mp3");
        std::fs::copy(seed(), &path).unwrap();
        assert_eq!(read_song(&path, "01 x.mp3".into()).tag_title, None);
        let mut tag = Tag::new(TagType::Id3v2);
        tag.set_title("T".into());
        tag.set_track(4);
        tag.set_disk(2);
        tag.set_album("Al".into());
        tag.set_artist("Ar".into());
        tag.insert_text(lofty::tag::ItemKey::RecordingDate, "1999-02-03".into());
        tag.save_to_path(&path, WriteOptions::default()).unwrap();
        assert_eq!(
            read_song(&path, "01 x.mp3".into()),
            SongInfo {
                key: "01 x.mp3".into(),
                tag_title: Some("T".into()),
                tag_track: Some(4),
                tag_disc: Some(2),
                tag_year: Some(1999),
                tag_album: Some("Al".into()),
                tag_artist: Some("Ar".into()),
            }
        );
    }
}

/// The R9.2 chain (P24.2, P24.3) against a mock server.
mod lyrics_chain {
    use super::*;
    use crate::net::lyrics::{fetch, looser_title, save, Fetched, LyricsQuery};

    fn query(title: &str) -> LyricsQuery {
        LyricsQuery {
            artist: "Artist".into(),
            title: title.into(),
            album: "Album".into(),
            duration_ms: 200_000,
        }
    }

    fn record(duration: f64, plain: &str) -> String {
        serde_json::json!({ "duration": duration, "plainLyrics": plain }).to_string()
    }

    /// Mocks for the five steps, each answering `answer` (status, body) unless set.
    struct Steps<'a> {
        get: httpmock::Mock<'a>,
        search: httpmock::Mock<'a>,
        get_no_album: httpmock::Mock<'a>,
        search_looser: httpmock::Mock<'a>,
        ovh: httpmock::Mock<'a>,
    }

    impl Steps<'_> {
        async fn calls(&self) -> [usize; 5] {
            [
                self.get.calls_async().await,
                self.search.calls_async().await,
                self.get_no_album.calls_async().await,
                self.search_looser.calls_async().await,
                self.ovh.calls_async().await,
            ]
        }
    }

    type Answer = (u16, String);

    fn missing() -> Answer {
        (404, "{}".into())
    }

    fn ovh_missing() -> Answer {
        (404, r#"{"error":"No lyrics found"}"#.into())
    }

    /// The steps for the title "Song (Live)", whose looser title is "Song".
    async fn steps(server: &MockServer, answers: [Answer; 5]) -> Steps<'_> {
        let [get, search, get_no_album, search_looser, ovh] = answers;
        Steps {
            get: server
                .mock_async(|when, then| {
                    when.path("/api/get").query_param_exists("album_name");
                    then.status(get.0).body(get.1);
                })
                .await,
            search: server
                .mock_async(|when, then| {
                    when.path("/api/search")
                        .query_param("track_name", "Song (Live)");
                    then.status(search.0).body(search.1);
                })
                .await,
            get_no_album: server
                .mock_async(|when, then| {
                    when.path("/api/get")
                        .query_param_missing("album_name")
                        .query_param("track_name", "Song (Live)");
                    then.status(get_no_album.0).body(get_no_album.1);
                })
                .await,
            search_looser: server
                .mock_async(|when, then| {
                    when.path("/api/search").query_param("track_name", "Song");
                    then.status(search_looser.0).body(search_looser.1);
                })
                .await,
            ovh: server
                .mock_async(|when, then| {
                    when.path("/v1/Artist/Song%20(Live)");
                    then.status(ovh.0).body(ovh.1);
                })
                .await,
        }
    }

    #[test]
    fn the_looser_title_drops_bracket_text() {
        assert_eq!(looser_title("Song (Live) [2011 Remaster]"), "Song");
        assert_eq!(looser_title("Song"), "Song");
        assert_eq!(looser_title("(Intro)"), "");
        assert_eq!(looser_title("A (b (c)) d"), "A d");
    }

    /// P24-AC2: each step runs only after the steps before gave no result, and the chain
    /// stops at the first result.
    #[tokio::test]
    async fn each_step_runs_after_no_result_and_the_first_result_wins() {
        let found = || (200, record(200.0, "found"));
        let empty = || (200, "[]".to_owned());
        let cases: [([Answer; 5], [usize; 5]); 5] = [
            (
                [found(), empty(), missing(), empty(), ovh_missing()],
                [1, 0, 0, 0, 0],
            ),
            (
                [
                    missing(),
                    (200, format!("[{}]", record(200.0, "found"))),
                    missing(),
                    empty(),
                    ovh_missing(),
                ],
                [1, 1, 0, 0, 0],
            ),
            (
                [missing(), empty(), found(), empty(), ovh_missing()],
                [1, 1, 1, 0, 0],
            ),
            (
                [
                    missing(),
                    empty(),
                    missing(),
                    (200, format!("[{}]", record(200.0, "found"))),
                    ovh_missing(),
                ],
                [1, 1, 1, 1, 0],
            ),
            (
                [
                    missing(),
                    empty(),
                    missing(),
                    empty(),
                    (200, r#"{"lyrics":"found"}"#.into()),
                ],
                [1, 1, 1, 1, 1],
            ),
        ];
        for (answers, calls) in cases {
            let server = MockServer::start_async().await;
            let steps = steps(&server, answers).await;
            let gate = gate(&server);
            let result = fetch(&gate, &query("Song (Live)"), &gate.job_token()).await;
            assert_eq!(
                result,
                Ok(Some(Fetched::Plain("found".into()))),
                "{calls:?}"
            );
            assert_eq!(steps.calls().await, calls);
        }
    }

    /// P24-AC2: no result from every step is "no match"; an LRCLIB result 3 s off is
    /// rejected on every LRCLIB step.
    #[tokio::test]
    async fn three_seconds_off_is_rejected_on_every_lrclib_step() {
        let server = MockServer::start_async().await;
        let off = record(203.0, "off");
        let steps = steps(
            &server,
            [
                (200, off.clone()),
                (200, format!("[{off}]")),
                (200, off.clone()),
                (200, format!("[{off}]")),
                ovh_missing(),
            ],
        )
        .await;
        let gate = gate(&server);
        assert_eq!(
            fetch(&gate, &query("Song (Live)"), &gate.job_token()).await,
            Ok(None)
        );
        assert_eq!(steps.calls().await, [1, 1, 1, 1, 1]);
    }

    /// P24-AC2: a lyrics.ovh result saves as `.txt`; the artist and title are path segments.
    #[tokio::test]
    async fn a_lyrics_ovh_result_saves_as_text() {
        let server = MockServer::start_async().await;
        server
            .mock_async(|when, then| {
                when.path_includes("/api/");
                then.status(404);
            })
            .await;
        let ovh = server
            .mock_async(|when, then| {
                when.path("/v1/AC%2FDC/T%C3%A9st%20%3F");
                then.status(200)
                    .body(r#"{"lyrics":"line one\r\nline two"}"#);
            })
            .await;
        let gate = gate(&server);
        let mut song = query("Tést ?");
        song.artist = "AC/DC".into();
        let found = fetch(&gate, &song, &gate.job_token()).await;
        assert_eq!(
            found,
            Ok(Some(Fetched::Plain("line one\r\nline two".into())))
        );
        assert_eq!(ovh.calls_async().await, 1);
        let folder = tempfile::tempdir().unwrap();
        save(&folder.path().join("01 Song.mp3"), &found.unwrap().unwrap()).unwrap();
        assert!(folder.path().join("01 Song.txt").is_file());
    }

    /// P24-AC2: "Song" and "(Intro)" skip the looser-title step.
    #[tokio::test]
    async fn titles_without_a_looser_form_skip_that_step() {
        for title in ["Song", "(Intro)"] {
            let server = MockServer::start_async().await;
            let get = server
                .mock_async(|when, then| {
                    when.path("/api/get");
                    then.status(404);
                })
                .await;
            let search = server
                .mock_async(|when, then| {
                    when.path("/api/search");
                    then.status(200).body("[]");
                })
                .await;
            let ovh = server
                .mock_async(|when, then| {
                    when.path_includes("/v1/");
                    then.status(404).body(r#"{"error":"No lyrics found"}"#);
                })
                .await;
            let gate = gate(&server);
            assert_eq!(
                fetch(&gate, &query(title), &gate.job_token()).await,
                Ok(None)
            );
            assert_eq!(get.calls_async().await, 2, "{title}");
            assert_eq!(search.calls_async().await, 1, "{title}");
            assert_eq!(ovh.calls_async().await, 1, "{title}");
        }
    }

    /// P24-AC2: two LRCLIB requests start at least 500 ms apart.
    #[tokio::test]
    async fn lrclib_requests_are_500_ms_apart() {
        let server = MockServer::start_async().await;
        server
            .mock_async(|when, then| {
                when.path_includes("/api/");
                then.status(404);
            })
            .await;
        let mut config = config(&server);
        config.lrclib_gap = Duration::from_millis(500);
        let gate = OnlineGate::new(config, true).unwrap();
        let url = gate.config().lrclib.join("api/get").unwrap();
        let start = Instant::now();
        for _ in 0..3 {
            let _ = gate
                .get(Service::Lrclib, url.clone(), &gate.job_token())
                .await;
        }
        assert!(
            start.elapsed() >= Duration::from_millis(1000),
            "{:?}",
            start.elapsed()
        );
    }

    /// P24-AC4: each error moves to the next step; with no result the chain is an error.
    #[tokio::test]
    async fn an_error_moves_on_and_makes_the_chain_an_error() {
        let ovh_missing = ovh_missing;
        let cases: [([Answer; 5], [usize; 5], NetError); 6] = [
            (
                [
                    (500, String::new()),
                    (200, "[]".into()),
                    missing(),
                    (200, "[]".into()),
                    ovh_missing(),
                ],
                [1, 1, 1, 1, 1],
                NetError::Status(500),
            ),
            (
                [
                    (200, "<html>".into()),
                    (200, "not json".into()),
                    missing(),
                    (200, "[]".into()),
                    ovh_missing(),
                ],
                [1, 1, 1, 1, 1],
                NetError::BadAnswer,
            ),
            (
                [
                    missing(),
                    (200, "[]".into()),
                    missing(),
                    (200, "[]".into()),
                    (200, r#"{"text":"x"}"#.into()),
                ],
                [1, 1, 1, 1, 1],
                NetError::BadAnswer,
            ),
            (
                [
                    missing(),
                    (200, "[]".into()),
                    missing(),
                    (200, "[]".into()),
                    (200, r#"{"lyrics":"  "}"#.into()),
                ],
                [1, 1, 1, 1, 1],
                NetError::BadAnswer,
            ),
            (
                [
                    missing(),
                    (200, "[]".into()),
                    missing(),
                    (200, "[]".into()),
                    (404, "Not Found".into()),
                ],
                [1, 1, 1, 1, 1],
                NetError::BadAnswer,
            ),
            (
                [
                    missing(),
                    (200, "[]".into()),
                    missing(),
                    (200, "[]".into()),
                    (500, r#"{"error":"No lyrics found"}"#.into()),
                ],
                [1, 1, 1, 1, 1],
                NetError::Status(500),
            ),
        ];
        for (answers, calls, error) in cases {
            let server = MockServer::start_async().await;
            let steps = steps(&server, answers).await;
            let gate = gate(&server);
            assert_eq!(
                fetch(&gate, &query("Song (Live)"), &gate.job_token()).await,
                Err(error.clone()),
                "{error}"
            );
            assert_eq!(steps.calls().await, calls, "{error}");
        }
    }

    /// P24-AC4: a lyrics.ovh result after an LRCLIB error is still a result.
    #[tokio::test]
    async fn a_later_result_wins_over_an_earlier_error() {
        let server = MockServer::start_async().await;
        let steps = steps(
            &server,
            [
                (500, String::new()),
                (200, "[]".into()),
                missing(),
                (200, "[]".into()),
                (200, r#"{"lyrics":"ok"}"#.into()),
            ],
        )
        .await;
        let gate = gate(&server);
        assert_eq!(
            fetch(&gate, &query("Song (Live)"), &gate.job_token()).await,
            Ok(Some(Fetched::Plain("ok".into())))
        );
        assert_eq!(steps.calls().await, [1, 1, 1, 1, 1]);
    }

    /// P24-AC4: a timeout is an error and the chain moves on.
    #[tokio::test]
    async fn a_timeout_moves_to_the_next_step() {
        let server = MockServer::start_async().await;
        let get = server
            .mock_async(|when, then| {
                when.path("/api/get").query_param_exists("album_name");
                then.status(200).delay(Duration::from_secs(5)).body("{}");
            })
            .await;
        let search = server
            .mock_async(|when, then| {
                when.path("/api/search");
                then.status(200)
                    .body(format!("[{}]", record(200.0, "found")));
            })
            .await;
        let mut config = config(&server);
        config.request_timeout = Duration::from_millis(300);
        let gate = OnlineGate::new(config, true).unwrap();
        assert_eq!(
            fetch(&gate, &query("Song"), &gate.job_token()).await,
            Ok(Some(Fetched::Plain("found".into())))
        );
        assert_eq!(get.calls_async().await, 1);
        assert_eq!(search.calls_async().await, 1);
    }

    /// P24-AC4: an LRCLIB 429 or 503 with `Retry-After: 2` skips the other LRCLIB steps, goes on
    /// to lyrics.ovh, and no LRCLIB request goes out for 2 s.
    #[tokio::test]
    async fn retry_after_skips_lrclib_and_blocks_it() {
        for status in [429, 503] {
            let server = MockServer::start_async().await;
            let lrclib = server
                .mock_async(|when, then| {
                    when.path_includes("/api/");
                    then.status(status).header("retry-after", "2");
                })
                .await;
            let ovh = server
                .mock_async(|when, then| {
                    when.path_includes("/v1/");
                    then.status(404).body(r#"{"error":"No lyrics found"}"#);
                })
                .await;
            let gate = gate(&server);
            let started = Instant::now();
            assert_eq!(
                fetch(&gate, &query("Song (Live)"), &gate.job_token()).await,
                Err(NetError::Status(status)),
                "an error, not no match"
            );
            assert_eq!(lrclib.calls_async().await, 1);
            assert_eq!(ovh.calls_async().await, 1);
            // A second chain inside the 2 s sends no LRCLIB request.
            assert_eq!(
                fetch(&gate, &query("Song (Live)"), &gate.job_token()).await,
                Err(NetError::Wait)
            );
            assert!(started.elapsed() < Duration::from_secs(2));
            assert_eq!(lrclib.calls_async().await, 1);
            assert_eq!(ovh.calls_async().await, 2);
            tokio::time::sleep_until(started + Duration::from_millis(2100)).await;
            let _ = fetch(&gate, &query("Song (Live)"), &gate.job_token()).await;
            assert_eq!(
                lrclib.calls_async().await,
                2,
                "after 2 s LRCLIB gets requests again"
            );
        }
    }

    /// D64: until the user answers the updated notice, lyrics.ovh gets no request and the
    /// chain that reaches it ends as an error, so no marker is written.
    #[tokio::test]
    async fn lyrics_ovh_waits_for_the_notice_answer() {
        let server = MockServer::start_async().await;
        server
            .mock_async(|when, then| {
                when.path_includes("/api/");
                then.status(404);
            })
            .await;
        let ovh = server
            .mock_async(|when, then| {
                when.path_includes("/v1/");
                then.status(200).body(r#"{"lyrics":"ok"}"#);
            })
            .await;
        let gate = OnlineGate::new(config(&server), true).unwrap();
        assert_eq!(
            fetch(&gate, &query("Song"), &gate.job_token()).await,
            Err(NetError::NoticePending)
        );
        assert_eq!(ovh.calls_async().await, 0);
        gate.set_lyrics_ovh_allowed(true);
        assert_eq!(
            fetch(&gate, &query("Song"), &gate.job_token()).await,
            Ok(Some(Fetched::Plain("ok".into())))
        );
    }

    /// P24-AC3, P24.3: an LRCLIB redirect to the lyrics.ovh host is refused; a lyrics.ovh
    /// redirect stays on its own host too.
    #[tokio::test]
    async fn a_redirect_stays_on_the_service_host() {
        let server = MockServer::start_async().await;
        let port = server.port();
        server
            .mock_async(|when, then| {
                when.path("/api/get");
                then.status(302)
                    .header("location", format!("http://localhost:{port}/v1/x/y"));
            })
            .await;
        let target = server
            .mock_async(|when, then| {
                when.path("/v1/x/y");
                then.status(200).body(r#"{"lyrics":"ok"}"#);
            })
            .await;
        let mut config = config(&server);
        config.hosts.lyrics_ovh = vec!["localhost".into()];
        let gate = OnlineGate::new(config, true).unwrap();
        gate.set_lyrics_ovh_allowed(true);
        let url = gate.config().lrclib.join("api/get").unwrap();
        assert_eq!(
            gate.get(Service::Lrclib, url, &gate.job_token()).await,
            Err(NetError::NotAllowed)
        );
        assert_eq!(target.calls_async().await, 0);
        let direct = Url::parse(&format!("http://localhost:{port}/v1/x/y")).unwrap();
        assert!(gate
            .get(Service::LyricsOvh, direct, &gate.job_token())
            .await
            .is_ok());
    }

    /// D62: the answer path keeps the status and the body of an answer that is not a success.
    #[tokio::test]
    async fn the_answer_keeps_the_status_and_body() {
        let server = MockServer::start_async().await;
        server
            .mock_async(|when, then| {
                when.path("/v1/a/b");
                then.status(404).body(r#"{"error":"No lyrics found"}"#);
            })
            .await;
        let gate = gate(&server);
        let url = gate.config().lyrics_ovh.join("v1/a/b").unwrap();
        let answer = gate
            .answer(Service::LyricsOvh, url.clone(), &gate.job_token())
            .await
            .unwrap();
        assert_eq!(answer.status, 404);
        assert_eq!(answer.body.bytes, br#"{"error":"No lyrics found"}"#);
        assert_eq!(
            gate.get(Service::LyricsOvh, url, &gate.job_token()).await,
            Err(NetError::Status(404))
        );
    }
}
