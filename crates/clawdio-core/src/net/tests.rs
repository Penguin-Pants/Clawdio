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
        lrclib: base,
        allowed_hosts: vec!["127.0.0.1".into()],
        https_only: false,
        user_agent: USER_AGENT.into(),
        musicbrainz_gap: Duration::ZERO,
        use_proxy: false,
    }
}

fn gate(server: &MockServer) -> OnlineGate {
    OnlineGate::new(config(server), true).unwrap()
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
    let allowed = |url: &str| host_allowed(&config.allowed_hosts, true, &Url::parse(url).unwrap());
    assert!(allowed("https://musicbrainz.org/ws/2/"));
    assert!(allowed("https://ia800.us.archive.org/x.jpg"));
    assert!(allowed("https://archive.org/x.jpg"));
    assert!(!allowed("http://musicbrainz.org/ws/2/"), "HTTPS only");
    assert!(!allowed("https://evilarchive.org/x.jpg"));
    assert!(!allowed("https://musicbrainz.org.example.com/"));
    assert!(!allowed("https://example.com/"));
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
