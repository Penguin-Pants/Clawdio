//! "Find missing songs" (P19.5, R33.3 to R33.5): each missing entry of a playlist goes through
//! the import matcher with the playlist file as the stage 1 base. A unique match replaces the
//! path line and the `#EXTINF` line at the same position; every other line stays byte for
//! byte. A playlist with no match is not written.

use std::path::Path;

use super::{label, m3u, Entry, PlaylistError, PlaylistSet};
use crate::api::{MissingImport, MissingReason, RepairReport};
use crate::atomic::write_atomic;
use crate::import::matching::{Matcher, Outcome};
use crate::import::parse::{extinf_names, SourceEntry};
use crate::library::LibraryIndex;

/// The line end of `line`: "\r\n", "\n" or none (the last line).
fn ending(line: &str) -> &str {
    if line.ends_with("\r\n") {
        "\r\n"
    } else if line.ends_with('\n') {
        "\n"
    } else {
        ""
    }
}

/// The new text of a playlist file and the repair counts, or None when nothing matched.
fn repaired(
    text: &str,
    rel_path: &str,
    root: &Path,
    index: &LibraryIndex,
    matcher: &Matcher,
    report: &mut RepairReport,
) -> Option<String> {
    let lines: Vec<&str> = text.split_inclusive('\n').collect();
    let mut out: Vec<String> = lines.iter().map(|line| (*line).to_owned()).collect();
    // A new `#EXTINF` line for a matched entry that had none goes before its path line.
    let mut inserts: Vec<(usize, String)> = Vec::new();
    let new_line = if text.contains("\r\n") { "\r\n" } else { "\n" };
    let source = root.join(rel_path);
    let playlist = super::Playlist {
        id: 0,
        rel_path: rel_path.to_owned(),
        name: String::new(),
        entries: Vec::new(),
    };
    let mut info: Option<(usize, String)> = None;
    for (number, raw) in lines.iter().enumerate() {
        // The same reading as `m3u::parse`: a BOM, then trimmed lines.
        let bom = if number == 0 && raw.starts_with('\u{feff}') {
            "\u{feff}"
        } else {
            ""
        };
        let line = raw[bom.len()..].trim();
        if line.is_empty() {
            continue;
        }
        if let Some(rest) = line.strip_prefix("#EXTINF:") {
            info = Some((number, rest.to_owned()));
            continue;
        }
        if line.starts_with('#') {
            continue;
        }
        let info = info.take();
        let entry = Entry {
            path: line.to_owned(),
            info: info.as_ref().map(|(_, text)| text.clone()),
        };
        if playlist.track(&entry, index).is_some() {
            continue;
        }
        let (artist, title) = entry.info.as_deref().map(extinf_names).unwrap_or_default();
        let wanted = SourceEntry {
            path: entry.path.clone(),
            info: entry.info.clone(),
            title,
            artist,
            album: None,
        };
        let reason = match matcher.find(&wanted, Some(&source), root) {
            Outcome::Matched(track) => {
                let Some(new) = PlaylistSet::entry_for(&playlist, track, index) else {
                    continue;
                };
                report.fixed += 1;
                out[number] = format!("{bom}{}{}", new.path, ending(raw));
                let extinf = format!("#EXTINF:{}", new.info.unwrap_or_default());
                match info {
                    Some((at, _)) => {
                        let bom = if at == 0 && lines[0].starts_with('\u{feff}') {
                            "\u{feff}"
                        } else {
                            ""
                        };
                        out[at] = format!("{bom}{extinf}{}", ending(lines[at]));
                    }
                    None => {
                        // The path line's own line end; the last line has none.
                        let end = match ending(raw) {
                            "" => new_line,
                            end => end,
                        };
                        inserts.push((number, format!("{extinf}{end}")));
                    }
                }
                continue;
            }
            Outcome::Ambiguous => MissingReason::Ambiguous,
            Outcome::NotFound | Outcome::NoLocation => MissingReason::NotFound,
        };
        report.missing.push(MissingImport {
            label: label(&entry),
            reason,
        });
    }
    if report.fixed == 0 {
        return None;
    }
    for (at, line) in inserts.into_iter().rev() {
        // A BOM stays at the start of the file.
        if at == 0 && out[0].starts_with('\u{feff}') {
            out[0] = out[0]['\u{feff}'.len_utf8()..].to_owned();
            out.insert(0, format!("\u{feff}{line}"));
        } else {
            out.insert(at, line);
        }
    }
    Some(out.concat())
}

impl PlaylistSet {
    /// The playlists with missing entries, in name order (R33.3).
    pub fn with_missing(&self, index: &LibraryIndex) -> Vec<u32> {
        self.rows(index)
            .into_iter()
            .filter(|row| row.missing_count > 0)
            .map(|row| row.id)
            .collect()
    }

    /// "Find missing songs" (R33.4) on each playlist of `ids`, in that order; unknown ids are
    /// left out. See [`PlaylistSet::repair_one`].
    pub fn repair(&mut self, root: &Path, ids: &[u32], index: &LibraryIndex) -> Vec<RepairReport> {
        let matcher = Matcher::new(index);
        ids.iter()
            .filter_map(|&id| self.repair_one(root, id, index, &matcher))
            .collect()
    }

    /// Reads the file, replaces each uniquely matched missing entry in place and writes the
    /// file atomically when something changed. None for an unknown id. A read or write
    /// failure is in the report; the file stays as it was.
    fn repair_one(
        &mut self,
        root: &Path,
        id: u32,
        index: &LibraryIndex,
        matcher: &Matcher,
    ) -> Option<RepairReport> {
        let rel_path = self.get(id)?.rel_path.clone();
        let mut report = RepairReport {
            playlist: self.get(id)?.name.clone(),
            fixed: 0,
            missing: Vec::new(),
            error: None,
        };
        let text = match std::fs::read(root.join(&rel_path)).map(String::from_utf8) {
            Ok(Ok(text)) => text,
            _ => {
                log::warn!("repair: cannot read {rel_path}");
                report.error = Some(PlaylistError::Unreadable.to_string());
                return Some(report);
            }
        };
        let Some(text) = repaired(&text, &rel_path, root, index, matcher, &mut report) else {
            return Some(report);
        };
        if let Err(error) = write_atomic(&root.join(&rel_path), text.as_bytes()) {
            log::warn!("repair: cannot write {rel_path}: {error}");
            report.fixed = 0;
            report.missing.clear();
            report.error = Some(PlaylistError::Write.to_string());
            return Some(report);
        }
        if let Some(playlist) = self.playlists.iter_mut().find(|p| p.id == id) {
            playlist.entries = m3u::parse(&text);
        }
        Some(report)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::library::{FileStamp, NewTrack};

    fn index() -> LibraryIndex {
        let mut index = LibraryIndex::default();
        for (path, title) in [("A/B/Song.mp3", "Song"), ("A/B/Two.mp3", "Two")] {
            index.insert(NewTrack {
                rel_path: path.into(),
                artist: "A".into(),
                album: "B".into(),
                subfolder: None,
                title: title.into(),
                tag_artist: None,
                track_no: None,
                disc: None,
                duration_ms: 61_000,
                stamp: FileStamp::default(),
                has_picture: false,
            });
        }
        index
    }

    fn run(text: &str) -> (Option<String>, RepairReport) {
        let index = index();
        let matcher = Matcher::new(&index);
        let mut report = RepairReport {
            playlist: String::new(),
            fixed: 0,
            missing: Vec::new(),
            error: None,
        };
        let out = repaired(
            text,
            "Playlists/x.m3u8",
            Path::new("/m"),
            &index,
            &matcher,
            &mut report,
        );
        (out, report)
    }

    #[test]
    fn crlf_comments_and_a_bom_stay_byte_for_byte() {
        let text = "\u{feff}#EXTM3U\r\n#PLAYLIST:Mix\r\n#EXTINF:5,Old - Song\r\n#EXTVLCOPT:x\r\n../A/B/Song.m4a\r\n  \r\n../A/B/Two.mp3";
        let (out, report) = run(text);
        assert_eq!(report.fixed, 1);
        assert_eq!(
            out.as_deref(),
            Some("\u{feff}#EXTM3U\r\n#PLAYLIST:Mix\r\n#EXTINF:61,A - Song\r\n#EXTVLCOPT:x\r\n../A/B/Song.mp3\r\n  \r\n../A/B/Two.mp3")
        );
    }

    #[test]
    fn a_match_with_no_extinf_line_gets_one_before_its_path() {
        let (out, _) = run("\u{feff}../A/B/Song.m4a\n../Gone/x.mp3");
        assert_eq!(
            out.as_deref(),
            Some("\u{feff}#EXTINF:61,A - Song\n../A/B/Song.mp3\n../Gone/x.mp3")
        );
    }

    #[test]
    fn no_match_gives_no_text_and_the_reasons() {
        let (out, report) = run("#EXTM3U\n#EXTINF:1,Gone\n../Gone/x.mp3\n");
        assert_eq!(out, None);
        assert_eq!(
            report.missing,
            [MissingImport {
                label: "Gone".into(),
                reason: MissingReason::NotFound
            }]
        );
    }
}
