//! Metadata fill (P16.2, P16.3, R10, D42): a MusicBrainz release for an album folder, then
//! proposals for the titles, track numbers and years that the songs' tags lack. Nothing is
//! written here; the caller shows a preview and writes the sidecar after Confirm.

use std::collections::HashMap;
use std::path::Path;

use lofty::prelude::*;
use serde::Deserialize;

use super::artwork::{lucene, LookupError};
use super::normalize::normalize;
use super::{CancellationToken, OnlineGate, Service};
use crate::fold::fold;
use crate::library::strip_number_prefix;
use crate::sidecar::TrackEntry;

/// Most candidate releases fetched for scoring (P16.2).
const MAX_SCORED: usize = 5;

/// What the fill knows about one song: its key in the sidecar and its tag values. The file
/// name fallbacks of R4 do not count as filled (R10).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SongInfo {
    /// The path inside the album folder ("01 x.mp3", "CD2/x.mp3").
    pub key: String,
    pub tag_title: Option<String>,
    pub tag_track: Option<u32>,
    pub tag_disc: Option<u32>,
    pub tag_year: Option<i32>,
    pub tag_album: Option<String>,
    pub tag_artist: Option<String>,
}

impl SongInfo {
    fn stem(&self) -> &str {
        let name = self.key.rsplit('/').next().unwrap_or(&self.key);
        name.rsplit_once('.').map_or(name, |(stem, _)| stem)
    }

    /// The title used for scoring and matching: the tag, else the file name (D42).
    fn title(&self) -> String {
        self.tag_title
            .clone()
            .unwrap_or_else(|| strip_number_prefix(self.stem()).0.to_owned())
    }

    /// The track number from the tag, else from the file name prefix.
    fn track(&self) -> Option<u32> {
        self.tag_track.or(strip_number_prefix(self.stem()).1)
    }
}

fn non_empty(text: Option<std::borrow::Cow<'_, str>>) -> Option<String> {
    text.map(|text| text.trim().to_owned())
        .filter(|text| !text.is_empty())
}

/// Reads the tags of one song. A file whose tags cannot be read counts as untagged.
pub fn read_song(path: &Path, key: String) -> SongInfo {
    let file = lofty::read_from_path(path)
        .inspect_err(|error| {
            log::warn!("fill: cannot read the tags of {}: {error}", path.display())
        })
        .ok();
    let Some(tag) = file
        .as_ref()
        .and_then(|file| file.primary_tag().or(file.first_tag()))
    else {
        return SongInfo {
            key,
            ..SongInfo::default()
        };
    };
    SongInfo {
        key,
        tag_title: non_empty(tag.title()),
        // A track or disc tag of 0 is a value, as the scan reads it (R4).
        tag_track: tag.track(),
        tag_disc: tag.disk(),
        tag_year: tag
            .date()
            .map(|date| i32::from(date.year))
            .filter(|year| *year > 0),
        tag_album: non_empty(tag.album()),
        tag_artist: non_empty(tag.artist()),
    }
}

#[derive(Debug, Deserialize)]
struct Search {
    #[serde(default)]
    releases: Vec<Release>,
}

#[derive(Debug, Clone, Deserialize)]
struct Release {
    id: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    date: Option<String>,
    #[serde(rename = "track-count", default)]
    track_count: Option<u32>,
    #[serde(rename = "artist-credit", default)]
    credit: Vec<Credit>,
    #[serde(rename = "release-group", default)]
    group: Option<Group>,
    #[serde(default)]
    media: Vec<Medium>,
}

#[derive(Debug, Clone, Deserialize)]
struct Credit {
    #[serde(default)]
    name: String,
    #[serde(default)]
    joinphrase: String,
}

#[derive(Debug, Clone, Deserialize)]
struct Group {
    id: String,
}

#[derive(Debug, Clone, Deserialize)]
struct Medium {
    #[serde(default)]
    position: u32,
    #[serde(default)]
    tracks: Vec<ReleaseTrack>,
}

#[derive(Debug, Clone, Deserialize)]
struct ReleaseTrack {
    #[serde(default)]
    position: u32,
    #[serde(default)]
    title: String,
}

impl Release {
    fn credit(&self) -> String {
        self.credit
            .iter()
            .map(|part| format!("{}{}", part.name, part.joinphrase))
            .collect()
    }

    fn year(&self) -> Option<i32> {
        let date = self.date.as_deref()?;
        date.get(..4)?.parse().ok().filter(|year| *year > 0)
    }
}

/// A MusicBrainz id: hex digits and dashes only, so it is safe in a URL path.
fn is_mbid(id: &str) -> bool {
    !id.is_empty() && id.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
}

/// Releases whose normalized title and artist credit equal `album` and `artist` (D43).
async fn search(
    gate: &OnlineGate,
    album: &str,
    artist: &str,
    cancel: &CancellationToken,
) -> Result<Vec<Release>, LookupError> {
    let (album, artist) = (normalize(album), normalize(artist));
    let mut url = gate
        .config()
        .musicbrainz
        .join("ws/2/release/")
        .map_err(|_| LookupError::BadAnswer)?;
    url.query_pairs_mut()
        .append_pair(
            "query",
            &format!(
                "release:\"{}\" AND artist:\"{}\"",
                lucene(&album),
                lucene(&artist)
            ),
        )
        .append_pair("fmt", "json");
    let body = gate.get(Service::MusicBrainz, url, cancel).await?;
    let found: Search = serde_json::from_slice(&body.bytes).map_err(|_| LookupError::BadAnswer)?;
    Ok(found
        .releases
        .into_iter()
        .filter(|release| is_mbid(&release.id))
        .filter(|release| {
            normalize(&release.title) == album && normalize(&release.credit()) == artist
        })
        .collect())
}

/// The releases of a search when they all belong to one release group (D42 step 1).
fn single_group(releases: Vec<Release>) -> Option<Vec<Release>> {
    let mut groups: Vec<&str> = releases
        .iter()
        .filter_map(|release| release.group.as_ref().map(|group| group.id.as_str()))
        .collect();
    groups.sort_unstable();
    groups.dedup();
    (groups.len() == 1 && !releases.is_empty()).then_some(releases)
}

/// The most common non-empty value, or None.
fn most_common(values: impl Iterator<Item = String>) -> Option<String> {
    let mut counts: HashMap<String, usize> = HashMap::new();
    for value in values {
        *counts.entry(value).or_default() += 1;
    }
    counts
        .into_iter()
        .max_by(|(a, a_count), (b, b_count)| a_count.cmp(b_count).then(b.cmp(a)))
        .map(|(value, _)| value)
}

/// Songs whose title (tag, else file name) matches a track title after folding (D42 step 2).
fn score(release: &Release, songs: &[SongInfo]) -> usize {
    let titles: Vec<String> = release
        .media
        .iter()
        .flat_map(|medium| medium.tracks.iter().map(|track| fold(&track.title)))
        .collect();
    songs
        .iter()
        .filter(|song| titles.contains(&fold(&song.title())))
        .count()
}

/// The track a song maps to (P16.3): by disc and track number when both are known (a
/// single-medium release has disc 1), else by folded title.
fn map_song<'a>(release: &'a Release, song: &SongInfo) -> Option<&'a ReleaseTrack> {
    let disc = song
        .tag_disc
        .or((release.media.len() == 1).then_some(release.media.first()?.position.max(1)));
    if let (Some(disc), Some(number)) = (disc, song.track()) {
        let found = release
            .media
            .iter()
            .filter(|medium| medium.position.max(1) == disc)
            .flat_map(|medium| medium.tracks.iter())
            .find(|track| track.position == number);
        if found.is_some() {
            return found;
        }
    }
    let title = fold(&song.title());
    release
        .media
        .iter()
        .flat_map(|medium| medium.tracks.iter())
        .find(|track| fold(&track.title) == title)
}

/// The proposed values for each song: only fields its tags lack (R10).
fn proposals(release: &Release, songs: &[SongInfo]) -> Vec<(String, TrackEntry)> {
    songs
        .iter()
        .filter_map(|song| {
            let track = map_song(release, song)?;
            let entry = TrackEntry {
                title: song
                    .tag_title
                    .is_none()
                    .then(|| track.title.trim().to_owned())
                    .filter(|title| !title.is_empty()),
                track: song
                    .tag_track
                    .is_none()
                    .then_some(track.position)
                    .filter(|position| *position > 0),
                year: song.tag_year.is_none().then(|| release.year()).flatten(),
            };
            (!entry.is_empty()).then(|| (song.key.clone(), entry))
        })
        .collect()
}

/// Looks up the album and proposes values (D42). An empty list means no proposal.
pub async fn propose(
    gate: &OnlineGate,
    artist: &str,
    album: &str,
    songs: &[SongInfo],
    cancel: &CancellationToken,
) -> Result<Vec<(String, TrackEntry)>, LookupError> {
    if songs.is_empty() {
        return Ok(Vec::new());
    }
    // Step 1: the folder names, then the most common tags when they differ.
    let mut candidates = single_group(search(gate, album, artist, cancel).await?);
    if candidates.is_none() {
        let tag_album = most_common(songs.iter().filter_map(|song| song.tag_album.clone()));
        let tag_artist = most_common(songs.iter().filter_map(|song| song.tag_artist.clone()));
        if let (Some(tag_album), Some(tag_artist)) = (tag_album, tag_artist) {
            let same = normalize(&tag_album) == normalize(album)
                && normalize(&tag_artist) == normalize(artist);
            if !same {
                candidates = single_group(search(gate, &tag_album, &tag_artist, cancel).await?);
            }
        }
    }
    let Some(mut candidates) = candidates else {
        return Ok(Vec::new());
    };
    // A track count equal to the song count first, then the earliest date (D42).
    let count = songs.len() as u32;
    candidates.sort_by(|a, b| {
        let fits = |release: &Release| release.track_count != Some(count);
        let date = |release: &Release| release.date.clone().filter(|date| !date.is_empty());
        fits(a)
            .cmp(&fits(b))
            .then_with(|| match (date(a), date(b)) {
                (Some(a), Some(b)) => a.cmp(&b),
                (Some(_), None) => std::cmp::Ordering::Less,
                (None, Some(_)) => std::cmp::Ordering::Greater,
                (None, None) => std::cmp::Ordering::Equal,
            })
    });
    // Step 2: score at most five releases by their track titles.
    let mut scored = Vec::new();
    for candidate in candidates.into_iter().take(MAX_SCORED) {
        let mut url = gate
            .config()
            .musicbrainz
            .join(&format!("ws/2/release/{}", candidate.id))
            .map_err(|_| LookupError::BadAnswer)?;
        url.query_pairs_mut()
            .append_pair("inc", "recordings")
            .append_pair("fmt", "json");
        let body = gate.get(Service::MusicBrainz, url, cancel).await?;
        let mut release: Release =
            serde_json::from_slice(&body.bytes).map_err(|_| LookupError::BadAnswer)?;
        if release.date.is_none() {
            release.date = candidate.date.clone();
        }
        scored.push((score(&release, songs), release));
    }
    // Step 3: one best release with at least half the songs matched.
    let best = scored.iter().map(|(score, _)| *score).max().unwrap_or(0);
    let mut top = scored.into_iter().filter(|(score, _)| *score == best);
    let (Some((_, release)), None) = (top.next(), top.next()) else {
        return Ok(Vec::new());
    };
    if best == 0 || best * 2 < songs.len() {
        return Ok(Vec::new());
    }
    Ok(proposals(&release, songs))
}
