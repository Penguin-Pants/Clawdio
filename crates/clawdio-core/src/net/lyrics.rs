//! Lyrics fetch (P15.1, R9, R9.2): the source chain. LRCLIB `/api/get` by artist, title,
//! album and duration, `/api/search` by title and artist, `/api/get` without the album,
//! `/api/search` with a looser title, then lyrics.ovh (D62). An LRCLIB result counts only
//! within 2 s of the song's duration; a lyrics.ovh result has no duration and saves as text.

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

/// The cleaned title without text in brackets or parentheses, for the looser LRCLIB query
/// (R9.2 step 3): "Song (Live) [2011]" gives "Song".
/// Only text inside a matching pair goes; an unmatched or mismatched delimiter stays.
pub fn looser_title(title: &str) -> String {
    let mut out = String::with_capacity(title.len());
    // Where each open delimiter starts in `out`, and which close it needs.
    let mut open: Vec<(usize, char)> = Vec::new();
    for c in title.chars() {
        match c {
            '(' | '[' => {
                open.push((out.len(), if c == '(' { ')' } else { ']' }));
                out.push(c);
            }
            ')' | ']' if open.last().is_some_and(|(_, close)| *close == c) => {
                if let Some((start, _)) = open.pop() {
                    out.truncate(start);
                }
            }
            _ => out.push(c),
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// LRCLIB `/api/get`. A 404 is no result; a body that is not valid JSON is an error (P24.2).
async fn lrclib_get(
    gate: &OnlineGate,
    query: &LyricsQuery,
    with_album: bool,
    cancel: &CancellationToken,
) -> Result<Option<Fetched>, NetError> {
    let mut url = gate
        .config()
        .lrclib
        .join("api/get")
        .map_err(|_| NetError::NotAllowed)?;
    {
        let mut pairs = url.query_pairs_mut();
        pairs
            .append_pair("artist_name", &query.artist)
            .append_pair("track_name", &query.title);
        if with_album {
            pairs.append_pair("album_name", &query.album);
        }
        pairs.append_pair("duration", &query.duration_s().to_string());
    }
    let body = match gate.get(Service::Lrclib, url, cancel).await {
        Err(NetError::Status(404)) => return Ok(None),
        result => result?,
    };
    let record: Record = serde_json::from_slice(&body.bytes).map_err(|_| NetError::BadAnswer)?;
    Ok(record.accept(query.duration_ms).map(|(_, lyrics)| lyrics))
}

/// LRCLIB `/api/search` by `title` and the artist. Synced lyrics first, then the result
/// closest to the song's duration. A 404 is no result.
async fn lrclib_search(
    gate: &OnlineGate,
    query: &LyricsQuery,
    title: &str,
    cancel: &CancellationToken,
) -> Result<Option<Fetched>, NetError> {
    let mut url = gate
        .config()
        .lrclib
        .join("api/search")
        .map_err(|_| NetError::NotAllowed)?;
    url.query_pairs_mut()
        .append_pair("track_name", title)
        .append_pair("artist_name", &query.artist);
    let body = match gate.get(Service::Lrclib, url, cancel).await {
        Err(NetError::Status(404)) => return Ok(None),
        result => result?,
    };
    let records: Vec<Record> =
        serde_json::from_slice(&body.bytes).map_err(|_| NetError::BadAnswer)?;
    let best = records
        .into_iter()
        .filter_map(|record| record.accept(query.duration_ms))
        .min_by(|(a_offset, a), (b_offset, b)| {
            let plain = |found: &Fetched| matches!(found, Fetched::Plain(_));
            plain(a).cmp(&plain(b)).then(a_offset.total_cmp(b_offset))
        });
    Ok(best.map(|(_, lyrics)| lyrics))
}

#[derive(Deserialize)]
struct OvhFound {
    lyrics: String,
}

#[derive(Deserialize)]
struct OvhMissing {
    error: String,
}

/// lyrics.ovh (D62): `GET /v1/<artist>/<title>`. HTTP 200 with lyrics text that is not blank
/// is a plain result; HTTP 404 with `{"error":"No lyrics found"}` is no result; any other
/// answer is an error (R9.3, K24).
async fn lyrics_ovh(
    gate: &OnlineGate,
    query: &LyricsQuery,
    cancel: &CancellationToken,
) -> Result<Option<Fetched>, NetError> {
    let mut url = gate
        .config()
        .lyrics_ovh
        .join("v1/")
        .map_err(|_| NetError::NotAllowed)?;
    url.path_segments_mut()
        .map_err(|_| NetError::NotAllowed)?
        .pop_if_empty()
        .push(&query.artist)
        .push(&query.title);
    let answer = gate.answer(Service::LyricsOvh, url, cancel).await?;
    match answer.status {
        200 => serde_json::from_slice::<OvhFound>(&answer.body.bytes)
            .ok()
            .and_then(|found| text(Some(found.lyrics)))
            .map(|text| Some(Fetched::Plain(text)))
            .ok_or(NetError::BadAnswer),
        404 => match serde_json::from_slice::<OvhMissing>(&answer.body.bytes) {
            Ok(missing) if missing.error == "No lyrics found" => Ok(None),
            _ => Err(NetError::BadAnswer),
        },
        status => Err(NetError::Status(status)),
    }
}

/// The R9.2 chain. Each step runs only after the step before gave no result or an error, and
/// the first result wins. `Ok(None)` means every step gave no result; one error in any step
/// makes the result that error (R9.3: no marker). A 429 or 503 from LRCLIB skips the other
/// LRCLIB steps (section 6.11). Off and Cancel stop the chain at once.
pub async fn fetch(
    gate: &OnlineGate,
    query: &LyricsQuery,
    cancel: &CancellationToken,
) -> Result<Option<Fetched>, NetError> {
    let looser = looser_title(&query.title);
    let looser = (!looser.is_empty() && looser != query.title).then_some(looser);
    let mut error = None;
    let mut lrclib_waits = false;
    for step in 0..5 {
        if step < 4 && lrclib_waits {
            continue;
        }
        let result = match step {
            0 => lrclib_get(gate, query, true, cancel).await,
            1 => lrclib_search(gate, query, &query.title, cancel).await,
            2 => lrclib_get(gate, query, false, cancel).await,
            3 => match &looser {
                Some(title) => lrclib_search(gate, query, title, cancel).await,
                None => continue,
            },
            _ => lyrics_ovh(gate, query, cancel).await,
        };
        match result {
            Ok(Some(found)) => return Ok(Some(found)),
            Ok(None) => {}
            Err(stop @ (NetError::Off | NetError::Canceled)) => return Err(stop),
            Err(failed) => {
                log::info!("lyrics: step {} gave an error: {failed}", step + 1);
                if step < 4 && matches!(failed, NetError::Status(429 | 503) | NetError::Wait) {
                    lrclib_waits = true;
                }
                error.get_or_insert(failed);
            }
        }
    }
    error.map_or(Ok(None), Err)
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
