//! The scan (R1, R2). P4 builds the skeleton: walk, accept `.mp3`, `.ogg` and `.wav`, read
//! tags and write the cache and the index in batches of 500. P5 adds every R1 to R4 rule.

use std::path::{Component, Path};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::RwLock;

use lofty::prelude::*;
use walkdir::WalkDir;

use crate::cache::Cache;
use crate::library::{LibraryIndex, NewTrack};

/// Tracks per cache transaction and index update (section 6.9).
pub const BATCH: usize = 500;
pub const UNKNOWN_ARTIST: &str = "Unknown Artist";
pub const UNKNOWN_ALBUM: &str = "Unknown Album";

/// What a scan did.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct ScanReport {
    pub added: u64,
    pub skipped: u64,
    pub canceled: bool,
}

/// `.mp3`, `.ogg` and `.wav`, in any letter case (R1).
pub fn is_audio(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ["mp3", "ogg", "wav"].contains(&ext.to_ascii_lowercase().as_str()))
}

/// The relative path with "/" separators.
fn relative_string(relative: &Path) -> String {
    relative
        .components()
        .filter_map(|part| match part {
            Component::Normal(name) => Some(name.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

/// Artist and album from the folders (R3): the first folder is the artist, the second the
/// album. Files higher up go to "Unknown Album" and "Unknown Artist".
pub fn group(relative: &Path) -> (String, String) {
    let folders: Vec<String> = relative
        .parent()
        .map(|parent| {
            parent
                .components()
                .filter_map(|part| match part {
                    Component::Normal(name) => Some(name.to_string_lossy().into_owned()),
                    _ => None,
                })
                .collect()
        })
        .unwrap_or_default();
    let artist = folders
        .first()
        .cloned()
        .unwrap_or_else(|| UNKNOWN_ARTIST.to_owned());
    let album = folders
        .get(1)
        .cloned()
        .unwrap_or_else(|| UNKNOWN_ALBUM.to_owned());
    (artist, album)
}

/// Reads one file's tags into a track. The title falls back to the file name (R4; P5 removes
/// track-number prefixes).
pub fn read_track(root: &Path, path: &Path) -> Result<NewTrack, String> {
    let relative = path.strip_prefix(root).map_err(|error| error.to_string())?;
    let tagged = lofty::read_from_path(path).map_err(|error| error.to_string())?;
    let tag = tagged.primary_tag().or_else(|| tagged.first_tag());
    let text = |value: Option<std::borrow::Cow<'_, str>>| {
        value.map(|v| v.trim().to_owned()).filter(|v| !v.is_empty())
    };
    let (artist, album) = group(relative);
    let stem = path
        .file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_default();
    Ok(NewTrack {
        rel_path: relative_string(relative),
        title: tag.and_then(|t| text(t.title())).unwrap_or(stem),
        tag_artist: tag.and_then(|t| text(t.artist())),
        track_no: tag.and_then(|t| t.track()),
        disc: tag.and_then(|t| t.disk()).unwrap_or(0),
        duration_ms: tagged
            .properties()
            .duration()
            .as_millis()
            .min(u32::MAX as u128) as u32,
        artist,
        album,
    })
}

/// Scans `root`: every accepted file goes to the cache and the index in batches of
/// [`BATCH`]. Without a cache the index still fills (D14: the cache is rebuildable). `on_batch` runs after each batch with the number added so far. Setting `cancel`
/// stops the scan after the current file; what it added stays.
pub fn scan(
    root: &Path,
    index: &RwLock<LibraryIndex>,
    mut cache: Option<&mut Cache>,
    cancel: &AtomicBool,
    mut on_batch: impl FnMut(u64),
) -> ScanReport {
    let mut report = ScanReport::default();
    let mut batch = Vec::with_capacity(BATCH);
    let mut flush = |batch: &mut Vec<NewTrack>, report: &mut ScanReport| {
        if batch.is_empty() {
            return;
        }
        if let Some(Err(error)) = cache.as_deref_mut().map(|cache| cache.put_batch(batch)) {
            log::warn!("cache: cannot write {} rows: {error}", batch.len());
        }
        if let Ok(mut index) = index.write() {
            for track in batch.drain(..) {
                index.insert(track);
                report.added += 1;
            }
        }
        on_batch(report.added);
    };
    for entry in WalkDir::new(root).follow_links(false).sort_by_file_name() {
        if cancel.load(Ordering::Relaxed) {
            report.canceled = true;
            break;
        }
        let Ok(entry) = entry else { continue };
        if !entry.file_type().is_file() || !is_audio(entry.path()) {
            continue;
        }
        match read_track(root, entry.path()) {
            Ok(track) => batch.push(track),
            Err(error) => {
                report.skipped += 1;
                log::warn!(
                    "scan: skipped {}: {error}",
                    entry
                        .path()
                        .strip_prefix(root)
                        .unwrap_or(entry.path())
                        .display()
                );
            }
        }
        if batch.len() >= BATCH {
            flush(&mut batch, &mut report);
        }
    }
    flush(&mut batch, &mut report);
    report
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_three_extensions_in_any_case() {
        for name in ["a.mp3", "b.OGG", "c.Wav"] {
            assert!(is_audio(Path::new(name)), "{name}");
        }
        for name in ["a.flac", "b.txt", "mp3", "c.mp3.bak"] {
            assert!(!is_audio(Path::new(name)), "{name}");
        }
    }

    #[test]
    fn groups_by_the_first_two_folders() {
        let g = |path: &str| group(Path::new(path));
        assert_eq!(
            g("Artist/Album/01 Song.mp3"),
            ("Artist".into(), "Album".into())
        );
        assert_eq!(
            g("Artist/Album/Disc 1/01 Song.mp3"),
            ("Artist".into(), "Album".into())
        );
        assert_eq!(
            g("Artist/Song.mp3"),
            ("Artist".into(), UNKNOWN_ALBUM.into())
        );
        assert_eq!(g("Song.mp3"), (UNKNOWN_ARTIST.into(), UNKNOWN_ALBUM.into()));
    }
}
