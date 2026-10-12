//! Artwork lookup (P14.5, R8): a MusicBrainz release group by artist and album folder name,
//! then the Cover Art Archive front image at 500 px, saved as `cover.jpg`.

use std::path::Path;
use std::time::SystemTime;

use image::ImageFormat;
use lofty::file::TaggedFileExt;
use serde::Deserialize;

use super::normalize::normalize;
use super::{CancellationToken, NetError, OnlineGate, Service};
use crate::artwork::{self, album_folder, COVER_FILE, COVER_QUALITY};
use crate::atomic::write_new;
use crate::library::{AlbumId, CoverState, FileStamp, LibraryIndex, UNKNOWN_ALBUM, UNKNOWN_ARTIST};
use crate::sidecar::{self, ArtworkMarker, Sidecar};

/// An album that may get art online: its folder, names and songs as the scan saw them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AlbumTarget {
    pub album: AlbumId,
    pub artist: String,
    pub name: String,
    /// The album folder relative to the music folder ("Artist/Album").
    pub folder: String,
    /// Each song: path relative to the music folder and the stamp the scan saw.
    pub songs: Vec<(String, FileStamp)>,
}

/// Why an album is not looked up.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Skip {
    /// A valid cover file or an embedded picture exists now.
    HasArt,
    /// A `cover.jpg` exists (in any letter case), even a broken one: no save is possible.
    CoverJpg,
    Marker,
    CorruptSidecar,
    ReadOnly,
}

/// The lookup result of one album.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Lookup {
    Saved,
    NoMatch,
    NoArt,
    Skipped(Skip),
}

/// Why a lookup ended without a result. No marker is written: the album is tried again at
/// the next startup.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum LookupError {
    #[error("{0}")]
    Net(#[from] NetError),
    #[error("The download is not a JPEG or PNG image")]
    NotAnImage,
    #[error("The service answer cannot be read")]
    BadAnswer,
    #[error("The album folder cannot be written")]
    Write,
}

/// Albums the index marks as candidates (D44), with no file read: a real album folder with
/// songs, no valid cover file, no broken `cover.jpg` and no song with an embedded picture.
pub fn candidates(index: &LibraryIndex) -> Vec<AlbumTarget> {
    let mut found = Vec::new();
    for id in 0..index.album_count() as AlbumId {
        let Some(album) = index.album(id) else {
            continue;
        };
        let Some(artist) = index.artist(album.artist) else {
            continue;
        };
        if album.tracks.is_empty() || artist.name == UNKNOWN_ARTIST || album.name == UNKNOWN_ALBUM {
            continue;
        }
        match (&album.cover.state, &album.cover.file) {
            (CoverState::Valid, _) => continue,
            (CoverState::Broken, Some((name, _))) if name.eq_ignore_ascii_case(COVER_FILE) => {
                log::warn!(
                    "art: {}/{}: a broken {COVER_FILE} blocks the lookup",
                    artist.name,
                    album.name
                );
                continue;
            }
            _ => {}
        }
        let tracks: Vec<_> = album
            .tracks
            .iter()
            .filter_map(|track| index.track(*track))
            .collect();
        if tracks.iter().any(|track| track.data.has_picture) {
            continue;
        }
        // Songs directly in the artist folder have no album folder (R8).
        let Some(folder) = tracks
            .first()
            .and_then(|track| album_folder(track.rel_path()))
        else {
            continue;
        };
        found.push(AlbumTarget {
            album: id,
            artist: artist.name.clone(),
            name: album.name.clone(),
            folder,
            songs: tracks
                .iter()
                .map(|track| (track.rel_path().to_owned(), track.data.stamp))
                .collect(),
        });
    }
    found
}

fn has_picture(path: &Path) -> bool {
    lofty::read_from_path(path)
        .map(|file| file.tags().iter().any(|tag| !tag.pictures().is_empty()))
        .unwrap_or(false)
}

/// Checks the album folder on disk before a request (P14.6): cover files, songs that
/// changed since the scan, the sidecar and the write access. A reason to skip is logged.
pub fn check(root: &Path, target: &AlbumTarget) -> Result<(), Skip> {
    let folder = root.join(&target.folder);
    let label = || format!("{}/{}", target.artist, target.name);
    if !artwork::existing_covers(&folder).is_empty() {
        return Err(Skip::CoverJpg);
    }
    let cover_decodes = artwork::cover_files(&folder).iter().any(|(path, _)| {
        image::ImageReader::open(path)
            .and_then(|reader| reader.with_guessed_format())
            .is_ok_and(|reader| reader.decode().is_ok())
    });
    let picture = || {
        target.songs.iter().any(|(rel_path, stamp)| {
            let path = root.join(rel_path);
            artwork::stamp(&path).is_some_and(|now| now != *stamp) && has_picture(&path)
        })
    };
    if cover_decodes || picture() {
        return Err(Skip::HasArt);
    }
    match sidecar::read(&folder) {
        Sidecar::Corrupt => {
            log::warn!("art: {}: the sidecar is corrupt; no lookup", label());
            return Err(Skip::CorruptSidecar);
        }
        sidecar if sidecar.marker().is_some() => return Err(Skip::Marker),
        _ => {}
    }
    if artwork::check_writable(&folder).is_err() {
        log::warn!("art: {}: the album folder is read-only; no lookup", label());
        return Err(Skip::ReadOnly);
    }
    Ok(())
}

#[derive(Deserialize)]
struct Search {
    #[serde(rename = "release-groups", default)]
    groups: Vec<Group>,
}

#[derive(Deserialize)]
struct Group {
    id: String,
    #[serde(default)]
    title: String,
    #[serde(rename = "artist-credit", default)]
    credit: Vec<Credit>,
}

#[derive(Deserialize)]
struct Credit {
    #[serde(default)]
    name: String,
    #[serde(default)]
    joinphrase: String,
}

/// Escapes the Lucene query characters (P14.5).
pub fn lucene(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        if "+-&|!(){}[]^\"~*?:\\/".contains(c) {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

/// A MusicBrainz id: hex digits and dashes only, so it is safe in a URL path.
fn is_mbid(id: &str) -> bool {
    !id.is_empty() && id.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
}

/// The release groups whose normalized title and artist credit equal the folder names.
async fn matching_groups(
    gate: &OnlineGate,
    target: &AlbumTarget,
    cancel: &CancellationToken,
) -> Result<Vec<String>, LookupError> {
    let album = normalize(&target.name);
    let artist = normalize(&target.artist);
    let mut url = gate
        .config()
        .musicbrainz
        .join("ws/2/release-group/")
        .map_err(|_| LookupError::BadAnswer)?;
    url.query_pairs_mut()
        .append_pair(
            "query",
            &format!(
                "releasegroup:\"{}\" AND artist:\"{}\"",
                lucene(&album),
                lucene(&artist)
            ),
        )
        .append_pair("fmt", "json");
    let body = gate.get(Service::MusicBrainz, url, cancel).await?;
    let search: Search = serde_json::from_slice(&body.bytes).map_err(|_| LookupError::BadAnswer)?;
    Ok(search
        .groups
        .into_iter()
        .filter(|group| is_mbid(&group.id) && normalize(&group.title) == album)
        .filter(|group| {
            let credit: String = group
                .credit
                .iter()
                .map(|part| format!("{}{}", part.name, part.joinphrase))
                .collect();
            normalize(&credit) == artist
        })
        .map(|group| group.id)
        .collect())
}

/// Checks a downloaded cover (P14.5 step 3): JPEG or PNG by content type and magic bytes,
/// and it decodes. Returns the `cover.jpg` bytes; a PNG becomes a JPEG.
pub fn cover_bytes(content_type: Option<&str>, bytes: Vec<u8>) -> Result<Vec<u8>, LookupError> {
    let kind = content_type.map(|text| {
        text.split(';')
            .next()
            .unwrap_or("")
            .trim()
            .to_ascii_lowercase()
    });
    let format = match kind.as_deref() {
        Some("image/jpeg") if bytes.starts_with(&[0xff, 0xd8, 0xff]) => ImageFormat::Jpeg,
        Some("image/png") if bytes.starts_with(b"\x89PNG\r\n\x1a\n") => ImageFormat::Png,
        _ => return Err(LookupError::NotAnImage),
    };
    let image =
        image::load_from_memory_with_format(&bytes, format).map_err(|_| LookupError::NotAnImage)?;
    match format {
        ImageFormat::Png => {
            artwork::jpeg(&image, COVER_QUALITY).map_err(|_| LookupError::NotAnImage)
        }
        _ => Ok(bytes),
    }
}

/// Writes a marker unless the job was canceled: no file is written after Cancel.
fn mark(
    folder: &Path,
    marker: ArtworkMarker,
    cancel: &CancellationToken,
) -> Result<(), LookupError> {
    if cancel.is_cancelled() {
        return Err(NetError::Canceled.into());
    }
    sidecar::write_marker(folder, marker, SystemTime::now()).map_err(|_| LookupError::Write)
}

/// Runs file work (folder checks, image decoding, the write) off the async threads, so a
/// slow disk never stalls the runtime.
async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> T + Send + 'static,
) -> Result<T, LookupError> {
    tokio::task::spawn_blocking(work)
        .await
        .map_err(|_| LookupError::Write)
}

/// The folder check off the async threads.
async fn checked(root: &Path, target: &AlbumTarget) -> Result<Result<(), Skip>, LookupError> {
    let (root, target) = (root.to_owned(), target.clone());
    blocking(move || check(&root, &target)).await
}

/// Looks up one album (P14.5): the folder is checked again before each request, exactly
/// one matching release group gives the cover, zero or more than one gives a no-match marker,
/// and a 404 for the image gives a no-art marker.
pub async fn lookup(
    gate: &OnlineGate,
    root: &Path,
    target: &AlbumTarget,
    cancel: &CancellationToken,
) -> Result<Lookup, LookupError> {
    let folder = root.join(&target.folder);
    if let Err(skip) = checked(root, target).await? {
        return Ok(Lookup::Skipped(skip));
    }
    let groups = matching_groups(gate, target, cancel).await?;
    let [id] = groups.as_slice() else {
        mark(&folder, ArtworkMarker::NoMatch, cancel)?;
        return Ok(Lookup::NoMatch);
    };
    if let Err(skip) = checked(root, target).await? {
        return Ok(Lookup::Skipped(skip));
    }
    let url = gate
        .config()
        .cover_art
        .join(&format!("release-group/{id}/front-500"))
        .map_err(|_| LookupError::BadAnswer)?;
    let body = match gate.get(Service::CoverArt, url, cancel).await {
        Err(NetError::Status(404)) => {
            mark(&folder, ArtworkMarker::NoArt, cancel)?;
            return Ok(Lookup::NoArt);
        }
        result => result?,
    };
    let jpeg = blocking(move || cover_bytes(body.content_type.as_deref(), body.bytes)).await??;
    if cancel.is_cancelled() {
        return Err(NetError::Canceled.into());
    }
    blocking(move || {
        if !artwork::existing_covers(&folder).is_empty() {
            return Ok(Lookup::Skipped(Skip::CoverJpg));
        }
        match write_new(&folder.join(COVER_FILE), &jpeg) {
            Ok(true) => Ok(Lookup::Saved),
            Ok(false) => Ok(Lookup::Skipped(Skip::CoverJpg)),
            Err(error) => {
                log::warn!(
                    "art: cannot write the cover in {}: {error}",
                    folder.display()
                );
                Err(LookupError::Write)
            }
        }
    })
    .await?
}
