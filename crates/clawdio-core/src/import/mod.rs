//! Playlist import (P12, R14): M3U, M3U8 and Apple XML into new `.m3u8` files in
//! `Playlists/`, with a matched and missing report. The source file is only read.

pub mod matching;
pub mod parse;

use std::path::Path;

use crate::api::{ImportReport, MissingImport, MissingReason};
use crate::library::LibraryIndex;
use crate::playlist::m3u::{self, Entry};
use crate::playlist::name::{import_name, NameError};
use crate::playlist::{PlaylistError, PlaylistSet};
use matching::{Matcher, Outcome};
use parse::{Source, SourceEntry};

/// Why an import did not run. The messages hold no path (D13).
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ImportError {
    #[error("The playlist file cannot be read")]
    Unreadable,
    #[error("Import reads .m3u, .m3u8 and Apple Music .xml files")]
    Unsupported,
    #[error("{0}")]
    NotApple(#[from] parse::NotApple),
    #[error("{0}")]
    Playlist(#[from] PlaylistError),
}

/// The sources in a file, by its extension.
pub fn read_sources(file: &Path) -> Result<Vec<Source>, ImportError> {
    let bytes = std::fs::read(file).map_err(|error| {
        log::warn!("import: cannot read {}: {error}", file.display());
        ImportError::Unreadable
    })?;
    let name = file
        .file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_default();
    let extension = file
        .extension()
        .map(|extension| extension.to_string_lossy().to_lowercase());
    match extension.as_deref() {
        Some("m3u") => Ok(vec![parse::m3u(&name, &parse::decode_m3u(&bytes))]),
        Some("m3u8") => Ok(vec![parse::m3u(&name, &parse::decode_m3u8(&bytes))]),
        Some("xml") => Ok(parse::apple_xml(&bytes)?),
        _ => Err(ImportError::Unsupported),
    }
}

/// The report label of an entry: "artist - title", the title, or the file name.
fn label(entry: &SourceEntry) -> String {
    match (&entry.artist, &entry.title) {
        (Some(artist), Some(title)) => format!("{artist} - {title}"),
        (None, Some(title)) => title.clone(),
        _ => entry
            .path
            .rsplit(['/', '\\'])
            .next()
            .unwrap_or(&entry.path)
            .to_owned(),
    }
}

/// Imports one source as a new playlist (P12.4): matched entries become paths relative to the
/// new file; unmatched ones keep their entry text and show as missing; entries with no file
/// location go to the report only.
pub fn import_source(
    set: &mut PlaylistSet,
    root: &Path,
    index: &LibraryIndex,
    matcher: &Matcher,
    source: &Source,
    file: Option<&Path>,
) -> Result<ImportReport, ImportError> {
    let name = import_name(&source.name, |candidate| {
        set.check_name(root, candidate) == Err(NameError::Taken)
    });
    let rel_path = PlaylistSet::new_path(&name);
    let mut entries = Vec::with_capacity(source.entries.len());
    let mut matched = 0;
    let mut missing = Vec::new();
    for entry in &source.entries {
        let stage_source = if source.relative_entries { file } else { None };
        match matcher.find(entry, stage_source, root) {
            Outcome::Matched(id) => {
                let Some(track) = index.track(id) else {
                    continue;
                };
                matched += 1;
                entries.push(Entry {
                    path: m3u::relative_path(&rel_path, track.rel_path()),
                    info: Some(m3u::info(
                        track.data.duration_ms,
                        track
                            .data
                            .tag_artist
                            .as_deref()
                            .unwrap_or(&track.data.artist),
                        track.title(),
                    )),
                });
            }
            outcome => {
                let reason = match outcome {
                    Outcome::Ambiguous => MissingReason::Ambiguous,
                    Outcome::NoLocation => MissingReason::NoLocation,
                    _ => MissingReason::NotFound,
                };
                missing.push(MissingImport {
                    label: label(entry),
                    reason,
                });
                if reason != MissingReason::NoLocation {
                    entries.push(Entry {
                        path: entry.path.clone(),
                        info: entry.info.clone(),
                    });
                }
            }
        }
    }
    set.create_with(root, &name, entries)?;
    Ok(ImportReport {
        playlist: name,
        matched,
        missing,
    })
}

/// Imports every playlist in `file` (one for M3U, each user playlist for Apple XML, D22).
pub fn import_file(
    set: &mut PlaylistSet,
    root: &Path,
    index: &LibraryIndex,
    file: &Path,
) -> Result<Vec<ImportReport>, ImportError> {
    let sources = read_sources(file)?;
    let matcher = Matcher::new(index);
    sources
        .iter()
        .map(|source| import_source(set, root, index, &matcher, source, Some(file)))
        .collect()
}
