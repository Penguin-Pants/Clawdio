//! Lyrics fetch from LRCLIB (P15.1, R9): `/api/get` by artist, title, album and duration,
//! then `/api/search` by title and artist. Only a result within 2 s of the song's duration
//! that has lyrics counts.

use std::path::Path;

use serde::Deserialize;

use super::{CancellationToken, NetError, OnlineGate, Service};
use crate::atomic::{write_atomic, write_new};
use crate::library::Track;

/// Largest duration difference a result may have (R9).
const MAX_OFFSET_MS: f64 = 2000.0;

/// What the request sends (R9): folder artist, cleaned title (R4), folder album and the
/// duration. The request carries whole seconds; the 2 s rule uses milliseconds.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LyricsQuery {
    pub artist: String,
    pub title: String,
    pub album: String,
    pub duration_ms: u32,
}

impl LyricsQuery {
    /// The query for a library song: the folder names, its title (tag, else the file name
    /// without its number prefix, R4) and its duration.
    pub fn for_track(track: &Track) -> Self {
        LyricsQuery {
            artist: track.data.artist.clone(),
            title: track.title().to_owned(),
            album: track.data.album.clone(),
            duration_ms: track.data.duration_ms,
        }
    }

    /// The duration the request sends, in whole seconds.
    pub fn duration_s(&self) -> u32 {
        self.duration_ms.saturating_add(500) / 1000
    }
}

/// Lyrics found online: synced (LRC text) or plain.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Fetched {
    Synced(String),
    Plain(String),
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Record {
    #[serde(default)]
    duration: Option<f64>,
    #[serde(default)]
    synced_lyrics: Option<String>,
    #[serde(default)]
    plain_lyrics: Option<String>,
}

fn text(lyrics: Option<String>) -> Option<String> {
    lyrics.filter(|text| !text.trim().is_empty())
}

impl Record {
    /// The lyrics of a result within 2 s that has any, with its offset in milliseconds;
    /// synced lyrics win over plain ones of the same result.
    fn accept(self, duration_ms: u32) -> Option<(f64, Fetched)> {
        let offset = (self.duration? * 1000.0 - f64::from(duration_ms)).abs();
        if offset > MAX_OFFSET_MS {
            return None;
        }
        let lyrics = text(self.synced_lyrics)
            .map(Fetched::Synced)
            .or_else(|| text(self.plain_lyrics).map(Fetched::Plain))?;
        Some((offset, lyrics))
    }
}

/// Asks LRCLIB (P15.1). None means no acceptable result. A network or service error is an
/// error; a 404 from `/api/get` leads to the search, and one from the search is no result.
pub async fn fetch(
    gate: &OnlineGate,
    query: &LyricsQuery,
    cancel: &CancellationToken,
) -> Result<Option<Fetched>, NetError> {
    let mut url = gate
        .config()
        .lrclib
        .join("api/get")
        .map_err(|_| NetError::NotAllowed)?;
    url.query_pairs_mut()
        .append_pair("artist_name", &query.artist)
        .append_pair("track_name", &query.title)
        .append_pair("album_name", &query.album)
        .append_pair("duration", &query.duration_s().to_string());
    match gate.get(Service::Lrclib, url, cancel).await {
        Ok(body) => {
            let found = serde_json::from_slice::<Record>(&body.bytes)
                .ok()
                .and_then(|record| record.accept(query.duration_ms));
            if let Some((_, lyrics)) = found {
                return Ok(Some(lyrics));
            }
        }
        Err(NetError::Status(404)) => {}
        Err(error) => return Err(error),
    }
    let mut url = gate
        .config()
        .lrclib
        .join("api/search")
        .map_err(|_| NetError::NotAllowed)?;
    url.query_pairs_mut()
        .append_pair("track_name", &query.title)
        .append_pair("artist_name", &query.artist);
    let body = match gate.get(Service::Lrclib, url, cancel).await {
        Err(NetError::Status(404)) => return Ok(None),
        result => result?,
    };
    let records: Vec<Record> =
        serde_json::from_slice(&body.bytes).map_err(|_| NetError::BadAnswer)?;
    // Synced lyrics first, then the result closest to the song's duration.
    let best = records
        .into_iter()
        .filter_map(|record| record.accept(query.duration_ms))
        .min_by(|(a_offset, a), (b_offset, b)| {
            let plain = |found: &Fetched| matches!(found, Fetched::Plain(_));
            plain(a).cmp(&plain(b)).then(a_offset.total_cmp(b_offset))
        });
    Ok(best.map(|(_, lyrics)| lyrics))
}

/// Why fetched lyrics were not saved. The messages hold no path (D13).
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum SaveError {
    #[error("The song's folder is read-only")]
    ReadOnly,
    #[error("A lyrics file for this song exists")]
    Exists,
    #[error("The lyrics file cannot be written")]
    Write,
}

/// Saves next to the song (P15.2): `<base name>.lrc` for synced lyrics, else `.txt`.
/// Create new and atomic: an existing file is never replaced, except one with only blank
/// text, which holds no lyrics (P13) and would else block "Fetch lyrics" for good.
pub fn save(song: &Path, fetched: &Fetched) -> Result<(), SaveError> {
    let (extension, text) = match fetched {
        Fetched::Synced(text) => ("lrc", text),
        Fetched::Plain(text) => ("txt", text),
    };
    let mut bytes = text.clone().into_bytes();
    if !text.ends_with('\n') {
        bytes.push(b'\n');
    }
    let target = song.with_extension(extension);
    match write_new(&target, &bytes) {
        Ok(true) => Ok(()),
        Ok(false) => {
            let blank = std::fs::read(&target)
                .is_ok_and(|old| crate::import::parse::decode_m3u(&old).trim().is_empty());
            if !blank {
                return Err(SaveError::Exists);
            }
            write_atomic(&target, &bytes).map_err(|error| {
                log::warn!("lyrics: cannot write next to {}: {error}", song.display());
                SaveError::Write
            })
        }
        Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {
            Err(SaveError::ReadOnly)
        }
        Err(error) => {
            log::warn!("lyrics: cannot write next to {}: {error}", song.display());
            Err(SaveError::Write)
        }
    }
}

/// Whether a file can be made next to the song: checked before any request, so a read-only
/// folder costs no lookup (P15-AC5).
pub fn check_writable(song: &Path) -> Result<(), SaveError> {
    let folder = song.parent().ok_or(SaveError::Write)?;
    tempfile::NamedTempFile::new_in(folder)
        .map(drop)
        .map_err(|_| SaveError::ReadOnly)
}
