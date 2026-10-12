//! Playlist import (P12, R14, R32): M3U, M3U8 and Apple XML into new `.m3u8` files in
//! `Playlists/`, with one combined report. The source files are only read.

pub mod matching;
pub mod parse;

use std::path::{Path, PathBuf};

use crate::api::{ImportReport, ImportStatus, MissingImport, MissingReason};
use crate::library::LibraryIndex;
use crate::playlist::m3u::{self, Entry};
use crate::playlist::name::import_name;
use crate::playlist::{PlaylistError, PlaylistSet};
use matching::{inside_root, Matcher, Outcome};
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

/// Rescan first (R33.1): `scan` runs the incremental scan, or waits for the running one, and
/// says whether it completed. Only then does `work` match and write. None means canceled or
/// failed: nothing changed.
pub fn after_scan<T>(scan: impl FnOnce() -> bool, work: impl FnOnce() -> T) -> Option<T> {
    scan().then(work)
}

/// The playlist files of a folder and all its subfolders (R32): `.m3u`, `.m3u8` and `.xml`
/// in any letter case, in path order. A folder that cannot be read is logged and skipped.
pub fn playlist_files(folder: &Path) -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = walkdir::WalkDir::new(folder)
        .into_iter()
        .filter_map(|entry| {
            entry
                .inspect_err(|error| log::warn!("import: cannot read a folder entry: {error}"))
                .ok()
        })
        .filter(|entry| !entry.file_type().is_dir())
        .map(walkdir::DirEntry::into_path)
        .filter(|path| {
            path.extension()
                .map(|extension| extension.to_string_lossy().to_lowercase())
                .is_some_and(|extension| ["m3u", "m3u8", "xml"].contains(&extension.as_str()))
        })
        .collect();
    files.sort();
    files
}

/// The name rule of one import (D51): a name that a playlist has (ignoring case) is skipped;
/// a name that an earlier source of the same import took gets " (2)", " (3)" and so on.
#[derive(Default)]
struct Names {
    /// The names this import wrote, lowercase.
    used: Vec<String>,
}

impl Names {
    /// The name for a source, or None to skip it.
    fn pick(&self, set: &PlaylistSet, root: &Path, name: &str) -> Option<String> {
        if !self.used.contains(&name.to_lowercase()) {
            return (!set.name_known(root, name)).then(|| name.to_owned());
        }
        (2..)
            .map(|number| format!("{name} ({number})"))
            .find(|candidate| {
                !self.used.contains(&candidate.to_lowercase()) && !set.name_known(root, candidate)
            })
    }
}

fn failed(playlist: String, error: impl ToString) -> ImportReport {
    ImportReport {
        playlist,
        status: ImportStatus::Failed,
        matched: 0,
        missing: Vec::new(),
        error: Some(error.to_string()),
    }
}

/// Imports one source as the new playlist `name` (P12.4): matched entries become paths
/// relative to the new file; unmatched ones show as missing. An unmatched relative entry of
/// the M3U family that resolves inside the music folder is written relative to the new file
/// (R32); other unmatched entries keep their text. Entries with no file location go to the
/// report only.
fn import_source(
    set: &mut PlaylistSet,
    root: &Path,
    index: &LibraryIndex,
    matcher: &Matcher,
    source: &Source,
    file: Option<&Path>,
    name: &str,
) -> Result<ImportReport, ImportError> {
    let rel_path = PlaylistSet::new_path(name);
    let stage_source = if source.relative_entries { file } else { None };
    let mut entries = Vec::with_capacity(source.entries.len());
    let mut matched = 0;
    let mut missing = Vec::new();
    for entry in &source.entries {
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
                    let path = stage_source
                        .and_then(|file| inside_root(&entry.path, file, root))
                        .map(|rel| m3u::relative_path(&rel_path, &rel))
                        .unwrap_or_else(|| entry.path.clone());
                    entries.push(Entry {
                        path,
                        info: entry.info.clone(),
                    });
                }
            }
        }
    }
    set.create_with(root, name, entries)?;
    Ok(ImportReport {
        playlist: name.to_owned(),
        status: ImportStatus::Imported,
        matched,
        missing,
        error: None,
    })
}

/// One import action (R32): every playlist in `files` (one for M3U, each user playlist for
/// Apple XML, D22), files in path order. Each playlist is written when it is ready, then
/// `done` gets its report. A file that cannot be read and a playlist that cannot be written
/// are failed; the others still import.
pub fn import_files(
    set: &mut PlaylistSet,
    root: &Path,
    index: &LibraryIndex,
    files: &[PathBuf],
    mut done: impl FnMut(&ImportReport),
) -> Vec<ImportReport> {
    let mut files = files.to_vec();
    files.sort();
    let matcher = Matcher::new(index);
    let mut names = Names::default();
    let mut reports = Vec::new();
    let mut add = |report: ImportReport, reports: &mut Vec<ImportReport>| {
        done(&report);
        reports.push(report);
    };
    for file in &files {
        let sources = match read_sources(file) {
            Ok(sources) => sources,
            Err(error) => {
                let name = file
                    .file_name()
                    .map(|name| name.to_string_lossy().into_owned())
                    .unwrap_or_default();
                add(failed(name, error), &mut reports);
                continue;
            }
        };
        for source in &sources {
            let cleaned = import_name(&source.name);
            let Some(name) = names.pick(set, root, &cleaned) else {
                add(
                    ImportReport {
                        playlist: cleaned,
                        status: ImportStatus::Skipped,
                        matched: 0,
                        missing: Vec::new(),
                        error: None,
                    },
                    &mut reports,
                );
                continue;
            };
            let report = import_source(set, root, index, &matcher, source, Some(file), &name)
                .unwrap_or_else(|error| failed(cleaned.clone(), error));
            if report.status == ImportStatus::Imported {
                names.used.push(name.to_lowercase());
            }
            add(report, &mut reports);
        }
    }
    reports
}
