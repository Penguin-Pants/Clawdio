//! The scan (R1, R2, D44): an incremental sync of the music folder into the index and the cache.
//! Unchanged files (path, size, modified time) are not read again. Missing files are removed
//! only after a complete traversal. A canceled or failed scan removes nothing.

pub mod probe;
pub mod walk;

use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::sync::RwLock;
use std::time::UNIX_EPOCH;

use crate::cache::Cache;
use crate::library::{
    group, title_and_track, CoverInfo, CoverState, FileStamp, LibraryIndex, NewTrack,
};
use probe::{Kind, Skip};
use walk::{walk, WalkedFile};

/// Tracks per cache transaction and index update (section 6.9).
pub const BATCH: usize = 500;

/// Cover file names in the album folder, in order of preference (R7).
const COVER_NAMES: [&str; 4] = ["cover", "folder", "front", "albumart"];
const COVER_EXTENSIONS: [&str; 3] = ["jpg", "jpeg", "png"];

/// What a scan did.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct ScanReport {
    /// New tracks.
    pub added: u64,
    /// Tracks removed after a complete traversal.
    pub removed: u64,
    /// Files skipped with a reason in the log.
    pub skipped: u64,
    /// Audio files seen so far.
    pub files: u64,
    /// Files whose tags were read (unchanged files are not read, P5-AC7).
    pub read: u64,
    /// Cover files decoded (only new or changed ones, P5-AC16).
    pub covers_decoded: u64,
    /// Changed files that could not be opened. The scan is then incomplete.
    pub unreadable: u64,
    pub canceled: bool,
    /// The root could not be read, or a part of it could not: nothing was removed.
    pub failed: bool,
    /// `.m3u8` files found, relative to the music folder (P11.2). The scan never writes them.
    pub playlists: Vec<String>,
}

/// A `.m3u8` playlist file name, in any letter case (P11.2). `.m3u` and `.pls` are not listed.
pub fn is_playlist(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("m3u8"))
}

/// `.mp3`, `.ogg` and `.wav`, in any letter case (R1).
pub fn is_audio(path: &Path) -> bool {
    Kind::of(path).is_some()
}

fn stamp_of(metadata: &std::fs::Metadata) -> FileStamp {
    FileStamp {
        size: metadata.len(),
        modified_ms: metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map_or(0, |since| since.as_millis().min(i64::MAX as u128) as i64),
    }
}

/// The rank of a cover file name (lower is preferred), or None for other files.
pub(crate) fn cover_rank(file_name: &str) -> Option<usize> {
    let (stem, ext) = file_name.rsplit_once('.')?;
    let name = COVER_NAMES
        .iter()
        .position(|n| stem.eq_ignore_ascii_case(n))?;
    let ext = COVER_EXTENSIONS
        .iter()
        .position(|e| ext.eq_ignore_ascii_case(e))?;
    Some(name * COVER_EXTENSIONS.len() + ext)
}

/// Reads one audio file into a track (R3, R4, D44), or the reason to skip it.
pub fn read_track(file: &WalkedFile, kind: Kind) -> Result<NewTrack, Skip> {
    let info = probe::probe(&file.path, kind)?;
    let grouping = group(Path::new(&file.rel_path));
    let file_name = file.rel_path.rsplit('/').next().unwrap_or_default();
    let stem = file_name
        .rsplit_once('.')
        .map_or(file_name, |(stem, _)| stem);
    let (title, track_no) = title_and_track(info.title, info.track, stem);
    Ok(NewTrack {
        rel_path: file.rel_path.clone(),
        artist: grouping.artist,
        album: grouping.album,
        subfolder: grouping.subfolder,
        title,
        tag_artist: info.artist,
        track_no,
        disc: info.disc,
        duration_ms: info.duration_ms,
        stamp: stamp_of(&file.metadata),
        has_picture: info.has_picture,
    })
}

/// Fills the index from the cache before the startup scan (R2, R19).
pub fn load(index: &RwLock<LibraryIndex>, cache: &Cache) -> rusqlite::Result<usize> {
    let tracks = cache.tracks()?;
    let albums = cache.albums()?;
    let skipped = cache.skipped()?;
    let count = tracks.len();
    if let Ok(mut index) = index.write() {
        for track in tracks {
            index.insert(track);
        }
        for (path, stamp, reason) in skipped {
            index.set_skipped(&path, stamp, &reason);
        }
        for (artist, album, cover) in albums {
            if index.cover(&artist, &album).is_some() {
                index.set_cover(&artist, &album, cover);
            }
        }
    }
    Ok(count)
}

/// A cover file found in an album folder.
struct CoverFile {
    rank: usize,
    name: String,
    stamp: FileStamp,
    path: std::path::PathBuf,
}

/// Scans `root` into the index and, when there is one, the cache. Without a cache the index
/// still fills (D14). `on_progress` runs after each batch of [`BATCH`] files. Setting `cancel`
/// stops the scan after the current file; what it added stays and nothing is removed.
pub fn scan(
    root: &Path,
    index: &RwLock<LibraryIndex>,
    mut cache: Option<&mut Cache>,
    cancel: &AtomicBool,
    mut on_progress: impl FnMut(&ScanReport),
) -> ScanReport {
    let mut report = ScanReport::default();
    if let Err(error) = std::fs::read_dir(root) {
        log::warn!("scan: cannot read the music folder: {error}; nothing removed");
        report.failed = true;
        return report;
    }
    let (known, known_skipped): (
        HashMap<String, FileStamp>,
        HashMap<String, (FileStamp, String)>,
    ) = match index.read() {
        Ok(index) => (
            index
                .paths()
                .filter_map(|path| Some((path.to_owned(), index.track_at(path)?.data.stamp)))
                .collect(),
            index
                .skipped_paths()
                .filter_map(|path| Some((path.to_owned(), index.skipped(path)?.clone())))
                .collect(),
        ),
        Err(_) => return report,
    };
    let mut new_skipped: Vec<(String, FileStamp, String)> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let mut staged: Vec<String> = Vec::new();
    let mut batch: Vec<NewTrack> = Vec::with_capacity(BATCH);
    let mut covers: HashMap<(String, String), CoverFile> = HashMap::new();

    let flush = |batch: &mut Vec<NewTrack>, cache: &mut Option<&mut Cache>| {
        if batch.is_empty() {
            return;
        }
        if let Some(Err(error)) = cache.as_deref_mut().map(|cache| cache.put_batch(batch)) {
            log::warn!("cache: cannot write {} rows: {error}", batch.len());
        }
        if let Ok(mut index) = index.write() {
            for track in batch.drain(..) {
                index.insert(track);
            }
        }
    };

    let wanted = |path: &Path| {
        is_audio(path)
            || is_playlist(path)
            || path
                .file_name()
                .and_then(|name| name.to_str())
                .and_then(cover_rank)
                .is_some()
    };
    let end = walk(root, cancel, wanted, |file| {
        if is_playlist(&file.path) {
            report.playlists.push(file.rel_path.clone());
            return;
        }
        let parts: Vec<&str> = file.rel_path.split('/').collect();
        let Some(kind) = Kind::of(&file.path) else {
            // A cover candidate directly in an album folder.
            if let ([artist, album, name], Some(rank)) =
                (parts.as_slice(), cover_rank(parts[parts.len() - 1]))
            {
                let key = ((*artist).to_owned(), (*album).to_owned());
                if covers.get(&key).is_none_or(|found| rank < found.rank) {
                    covers.insert(
                        key,
                        CoverFile {
                            rank,
                            name: (*name).to_owned(),
                            stamp: stamp_of(&file.metadata),
                            path: file.path.clone(),
                        },
                    );
                }
            }
            return;
        };
        report.files += 1;
        seen.insert(file.rel_path.clone());
        let stamp = stamp_of(&file.metadata);
        if known.get(&file.rel_path) == Some(&stamp) {
            // Unchanged track: not read again (R2).
        } else if let Some((_, reason)) = known_skipped
            .get(&file.rel_path)
            .filter(|(old, _)| *old == stamp)
        {
            // Unchanged skipped file: counted and logged again, not read again (P5-AC7).
            report.skipped += 1;
            log::warn!("scan: skipped ({reason}): {}", file.rel_path);
        } else if let Err(error) = std::fs::File::open(&file.path) {
            // A file that cannot be opened now (locked, permissions) is not corrupt. Its old
            // row stays and the scan removes nothing.
            report.unreadable += 1;
            log::warn!("scan: cannot open {}: {error}", file.rel_path);
        } else {
            report.read += 1;
            match read_track(&file, kind) {
                Ok(track) => {
                    if !known.contains_key(&track.rel_path) {
                        report.added += 1;
                    }
                    batch.push(track);
                }
                Err(skip) => {
                    report.skipped += 1;
                    log::warn!("scan: skipped ({skip}): {}", file.rel_path);
                    if known.contains_key(&file.rel_path) {
                        staged.push(file.rel_path.clone());
                    }
                    new_skipped.push((file.rel_path.clone(), stamp, skip.to_string()));
                }
            }
            if batch.len() >= BATCH {
                flush(&mut batch, &mut cache);
            }
        }
        if report.files % BATCH as u64 == 0 {
            on_progress(&report);
        }
    });
    flush(&mut batch, &mut cache);
    report.skipped += end.bad_names;
    report.canceled = end.canceled;

    let complete = end.complete() && report.unreadable == 0;
    if complete {
        let removals: Vec<String> = known
            .keys()
            .filter(|path| !seen.contains(*path))
            .cloned()
            .chain(staged)
            .collect();
        if let Ok(mut index) = index.write() {
            for path in &removals {
                if index.remove_path(path) {
                    report.removed += 1;
                }
            }
        }
        if let Some(Err(error)) = cache
            .as_deref_mut()
            .map(|cache| cache.remove_paths(&removals))
        {
            log::warn!("cache: cannot remove {} rows: {error}", removals.len());
        }
        update_covers(index, cache.as_deref_mut(), covers, &mut report);
    } else if !end.canceled {
        report.failed = true;
        log::warn!(
            "scan: {} part(s) of the music folder could not be read; nothing removed",
            end.errors + report.unreadable
        );
    }
    // Skipped files are remembered. A track that became a skipped file leaves only after a
    // complete traversal (R2).
    if let Ok(mut index) = index.write() {
        for (path, stamp, reason) in &new_skipped {
            if complete || !known.contains_key(path) {
                index.set_skipped(path, *stamp, reason);
            }
        }
        if complete {
            for path in known_skipped.keys().filter(|path| !seen.contains(*path)) {
                index.remove_skipped(path);
            }
        }
    }
    let skipped_rows: Vec<(String, FileStamp, String)> = index
        .read()
        .map(|index| {
            index
                .skipped_paths()
                .filter_map(|path| {
                    let (stamp, reason) = index.skipped(path)?;
                    Some((path.to_owned(), *stamp, reason.clone()))
                })
                .collect()
        })
        .unwrap_or_default();
    if let Some(Err(error)) = cache.map(|cache| cache.put_skipped(&skipped_rows)) {
        log::warn!("cache: cannot write the skipped files: {error}");
    }
    on_progress(&report);
    report
}

/// Updates the cover state of each album folder (D44). A cover file is decoded only when its
/// name or stamp changed. Broken covers are logged once per scan.
fn update_covers(
    index: &RwLock<LibraryIndex>,
    cache: Option<&mut Cache>,
    mut covers: HashMap<(String, String), CoverFile>,
    report: &mut ScanReport,
) {
    let Ok(albums) = index.read().map(|index| {
        index
            .album_covers()
            .map(|(artist, album, cover)| (artist.to_owned(), album.to_owned(), cover.clone()))
            .collect::<Vec<_>>()
    }) else {
        return;
    };
    // Decoding runs without the index lock, so queries are not blocked (D14).
    let mut entries = Vec::with_capacity(albums.len());
    for (artist, album, old) in albums {
        let found = covers.remove(&(artist.clone(), album.clone()));
        let cover = match found {
            None => CoverInfo::default(),
            Some(file) => {
                let same = old
                    .file
                    .as_ref()
                    .is_some_and(|(name, stamp)| *name == file.name && *stamp == file.stamp);
                let state = if same {
                    old.state
                } else {
                    report.covers_decoded += 1;
                    match image::open(&file.path) {
                        Ok(_) => CoverState::Valid,
                        Err(_) => CoverState::Broken,
                    }
                };
                CoverInfo {
                    state,
                    file: Some((file.name, file.stamp)),
                }
            }
        };
        if cover.state == CoverState::Broken {
            if let Some((name, _)) = &cover.file {
                log::warn!("cover: cannot decode {artist}/{album}/{name}");
            }
        }
        entries.push((artist, album, cover));
    }
    if let Ok(mut index) = index.write() {
        for (artist, album, cover) in &entries {
            index.set_cover(artist, album, cover.clone());
        }
    }
    if let Some(Err(error)) = cache.map(|cache| cache.put_albums(&entries)) {
        log::warn!("cache: cannot write album rows: {error}");
    }
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
    fn ranks_cover_file_names() {
        assert_eq!(cover_rank("cover.jpg"), Some(0));
        assert_eq!(cover_rank("Cover.PNG"), Some(2));
        assert!(cover_rank("folder.jpeg") > cover_rank("cover.png"));
        assert!(cover_rank("albumart.jpg") > cover_rank("front.png"));
        assert_eq!(cover_rank("cover.gif"), None);
        assert_eq!(cover_rank("back.jpg"), None);
        assert_eq!(cover_rank("cover"), None);
    }
}
