//! Matching (P12.2, P12.3, R14): normalized paths, then four stages. A stage must yield one
//! track; more than one narrows the next stage to those; still more than one after the last
//! stage is "ambiguous".

use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};

use unicode_normalization::UnicodeNormalization;

use super::parse::SourceEntry;
use crate::fold::fold;
use crate::library::{LibraryIndex, TrackId};

/// The result for one source entry.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    Matched(TrackId),
    NotFound,
    Ambiguous,
    /// No file location (Apple XML): the entry goes to the report only.
    NoLocation,
}

/// A path for comparison (R14): backslashes become slashes, a drive letter or UNC prefix
/// goes, the text is NFC normalized and lowercase. Used for matching only.
pub fn normalize(path: &str) -> String {
    let mut text = path.replace('\\', "/");
    if let Some(unc) = text.strip_prefix("//") {
        // "//server/share/rest" keeps "rest".
        text = unc.splitn(3, '/').nth(2).unwrap_or("").to_owned();
    } else if text.len() >= 2
        && text.as_bytes()[1] == b':'
        && text.as_bytes()[0].is_ascii_alphabetic()
    {
        text = text[2..].to_owned();
    }
    let parts: Vec<&str> = text
        .split('/')
        .filter(|part| !part.is_empty() && *part != ".")
        .collect();
    parts.join("/").nfc().flat_map(char::to_lowercase).collect()
}

/// The last part of a normalized path.
fn file_of(normalized: &str) -> &str {
    normalized.rsplit('/').next().unwrap_or(normalized)
}

/// The candidates a stage may return: all tracks (`None`) or the hits of an earlier stage.
/// Both lists are in ascending order.
type Set<'s> = Option<&'s [usize]>;

/// One matching stage: the hits among the candidates it gets.
type Stage<'a> = dyn Fn(Set) -> Vec<usize> + 'a;

struct Candidate {
    id: TrackId,
    rel: String,
    title: String,
    artist: String,
    album: String,
}

/// The library as match candidates. Each stage looks only at the tracks with the same file
/// name or title, so an import of thousands of entries stays fast on a large library.
pub struct Matcher {
    tracks: Vec<Candidate>,
    by_file: HashMap<String, Vec<usize>>,
    by_title: HashMap<String, Vec<usize>>,
}

/// Lexical clean-up of an absolute path: "." and ".." parts are resolved.
fn clean(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for part in path.components() {
        match part {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// The tracks in `bucket` that are also in `set`.
fn within(bucket: Option<&Vec<usize>>, set: Set) -> Vec<usize> {
    let Some(bucket) = bucket else {
        return Vec::new();
    };
    bucket
        .iter()
        .copied()
        .filter(|i| set.is_none_or(|set| set.binary_search(i).is_ok()))
        .collect()
}

impl Matcher {
    pub fn new(index: &LibraryIndex) -> Self {
        let tracks: Vec<Candidate> = index
            .paths()
            .filter_map(|path| index.track_at(path))
            .map(|track| Candidate {
                id: track.id,
                rel: normalize(track.rel_path()),
                title: fold(track.title()),
                artist: fold(
                    track
                        .data
                        .tag_artist
                        .as_deref()
                        .unwrap_or(&track.data.artist),
                ),
                album: fold(&track.data.album),
            })
            .collect();
        let mut by_file: HashMap<String, Vec<usize>> = HashMap::new();
        let mut by_title: HashMap<String, Vec<usize>> = HashMap::new();
        for (i, track) in tracks.iter().enumerate() {
            by_file
                .entry(file_of(&track.rel).to_owned())
                .or_default()
                .push(i);
            by_title.entry(track.title.clone()).or_default().push(i);
        }
        Matcher {
            tracks,
            by_file,
            by_title,
        }
    }

    /// Stage 1 (M3U family): the entry relative to the playlist file, inside the music folder.
    fn relative(&self, set: Set, entry: &str, root: &Path, source_dir: &Path) -> Vec<usize> {
        let entry_path = entry.replace('\\', "/");
        let absolute = entry_path.starts_with('/') || entry_path.as_bytes().get(1) == Some(&b':');
        if absolute {
            return Vec::new();
        }
        let target = clean(&source_dir.join(&entry_path));
        let Ok(rel) = target.strip_prefix(clean(root)) else {
            return Vec::new();
        };
        let wanted = normalize(&rel.to_string_lossy());
        let mut hits = within(self.by_file.get(file_of(&wanted)), set);
        hits.retain(|&i| self.tracks[i].rel == wanted);
        hits
    }

    /// Stage 2: the tracks that share the longest path end with the entry, at least a folder
    /// and the file name. Such a track always has the same file name.
    fn suffix(&self, set: Set, normalized: &str) -> Vec<usize> {
        let candidates = within(self.by_file.get(file_of(normalized)), set);
        let shared = |i: usize| {
            self.tracks[i]
                .rel
                .rsplit('/')
                .zip(normalized.rsplit('/'))
                .take_while(|(a, b)| a == b)
                .count()
        };
        let best = candidates.iter().map(|&i| shared(i)).max().unwrap_or(0);
        if best < 2 {
            return Vec::new();
        }
        candidates
            .into_iter()
            .filter(|&i| shared(i) == best)
            .collect()
    }

    /// Stage 3: the same file name.
    fn file_name(&self, set: Set, normalized: &str) -> Vec<usize> {
        within(self.by_file.get(file_of(normalized)), set)
    }

    /// Stage 4: the title plus the artist and album the source has (folded, D4).
    fn names(&self, set: Set, entry: &SourceEntry) -> Vec<usize> {
        let Some(title) = entry.title.as_deref().map(fold) else {
            return Vec::new();
        };
        let artist = entry.artist.as_deref().map(fold);
        let album = entry.album.as_deref().map(fold);
        let mut hits = within(self.by_title.get(&title), set);
        hits.retain(|&i| {
            let track = &self.tracks[i];
            artist.as_ref().is_none_or(|a| *a == track.artist)
                && album.as_ref().is_none_or(|a| *a == track.album)
        });
        hits
    }

    /// Runs the stages for one entry. `source` is the playlist file for stage 1 (M3U family);
    /// `root` the music folder.
    pub fn find(&self, entry: &SourceEntry, source: Option<&Path>, root: &Path) -> Outcome {
        if !entry.has_location() {
            return Outcome::NoLocation;
        }
        let normalized = normalize(&entry.path);
        let mut set: Option<Vec<usize>> = None;
        let stages: [&Stage; 4] = [
            &|set| match source.and_then(Path::parent) {
                Some(dir) => self.relative(set, &entry.path, root, dir),
                None => Vec::new(),
            },
            &|set| self.suffix(set, &normalized),
            &|set| self.file_name(set, &normalized),
            &|set| self.names(set, entry),
        ];
        for stage in stages {
            let hits = stage(set.as_deref());
            match hits.len() {
                0 => {}
                1 => return Outcome::Matched(self.tracks[hits[0]].id),
                _ => set = Some(hits),
            }
        }
        if set.is_some() {
            Outcome::Ambiguous
        } else {
            Outcome::NotFound
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::library::{FileStamp, NewTrack};

    fn track(rel_path: &str, title: &str) -> NewTrack {
        let parts: Vec<&str> = rel_path.split('/').collect();
        NewTrack {
            rel_path: rel_path.into(),
            artist: parts[0].into(),
            album: parts[1].into(),
            subfolder: None,
            title: title.into(),
            tag_artist: None,
            track_no: None,
            disc: None,
            duration_ms: 1000,
            stamp: FileStamp::default(),
            has_picture: false,
        }
    }

    /// Ids: 0 Björk/Debut/01 Human.mp3, 1 Björk/Post/01 Army.mp3, 2 Other/Debut/01 Human.mp3,
    /// 3 Nina/Live/Intro.mp3, 4 Nina/Studio/Intro.mp3, 5 A/Album/01 X.mp3, 6 B/Album/01 X.mp3,
    /// 7 Other/Live/Human (live).mp3.
    fn index() -> LibraryIndex {
        let mut index = LibraryIndex::default();
        index.insert(track("Björk/Debut/01 Human.mp3", "Human Behaviour"));
        index.insert(track("Björk/Post/01 Army.mp3", "Army of Me"));
        index.insert(track("Other/Debut/01 Human.mp3", "Human Behaviour"));
        index.insert(track("Nina/Live/Intro.mp3", "Intro"));
        index.insert(track("Nina/Studio/Intro.mp3", "Intro"));
        index.insert(track("A/Album/01 X.mp3", "X"));
        index.insert(track("B/Album/01 X.mp3", "X"));
        index.insert(track("Other/Live/Human (live).mp3", "Human Behaviour"));
        index
    }

    fn entry(path: &str) -> SourceEntry {
        SourceEntry {
            path: path.into(),
            ..SourceEntry::default()
        }
    }

    const ROOT: &str = "/m";

    #[test]
    fn normalization_removes_prefixes_slashes_case_and_nfd() {
        assert_eq!(normalize("C:\\Music\\Björk\\A.MP3"), "music/björk/a.mp3");
        assert_eq!(normalize("\\\\nas\\share\\Music\\a.mp3"), "music/a.mp3");
        assert_eq!(
            normalize("Bjo\u{308}rk/a.mp3"),
            "björk/a.mp3",
            "NFD becomes NFC"
        );
        assert_eq!(normalize("./A//b.mp3"), "a/b.mp3");
    }

    /// A bare file name finds both "Album/01 X.mp3" tracks in later stages; stage 1 picks the
    /// one next to the playlist file.
    #[test]
    fn stage_1_matches_relative_to_the_playlist_file() {
        let matcher = Matcher::new(&index());
        for (source, id) in [("/m/B/Album/x.m3u", 6), ("/m/A/Album/x.m3u", 5)] {
            assert_eq!(
                matcher.find(&entry("01 x.mp3"), Some(Path::new(source)), Path::new(ROOT)),
                Outcome::Matched(id),
                "{source}"
            );
        }
        assert_eq!(
            matcher.find(&entry("01 x.mp3"), None, Path::new(ROOT)),
            Outcome::Ambiguous,
            "without stage 1"
        );
        assert_eq!(
            matcher.find(
                &entry("../björk/debut/01 human.mp3"),
                Some(Path::new("/m/Playlists/x.m3u")),
                Path::new(ROOT)
            ),
            Outcome::Matched(0),
            "a parent folder"
        );
    }

    #[test]
    fn stage_2_takes_the_longest_path_suffix() {
        let matcher = Matcher::new(&index());
        let found = matcher.find(
            &entry("C:\\Users\\Me\\Music\\Björk\\Debut\\01 Human.mp3"),
            None,
            Path::new(ROOT),
        );
        assert_eq!(found, Outcome::Matched(0), "Björk/Debut beats Other/Debut");
    }

    #[test]
    fn stage_3_matches_a_unique_file_name() {
        let matcher = Matcher::new(&index());
        assert_eq!(
            matcher.find(&entry("D:\\Elsewhere\\01 Army.mp3"), None, Path::new(ROOT)),
            Outcome::Matched(1)
        );
    }

    /// The file name gives two tracks; the names stage picks among those only. The whole
    /// library has two "Human Behaviour" tracks by Other (2 and 7).
    #[test]
    fn stage_4_narrows_the_candidates_of_an_earlier_stage() {
        let matcher = Matcher::new(&index());
        let mut human = entry("E:\\x\\01 Human.mp3");
        human.title = Some("Human Behaviour".into());
        human.artist = Some("Other".into());
        assert_eq!(
            matcher.find(&human, None, Path::new(ROOT)),
            Outcome::Matched(2)
        );
    }

    #[test]
    fn more_than_one_after_the_last_stage_is_ambiguous() {
        let matcher = Matcher::new(&index());
        let mut intro = entry("E:\\x\\Intro.mp3");
        intro.title = Some("Intro".into());
        assert_eq!(
            matcher.find(&intro, None, Path::new(ROOT)),
            Outcome::Ambiguous
        );
    }

    #[test]
    fn no_hit_at_any_stage_is_not_found_and_no_location_is_its_own_case() {
        let matcher = Matcher::new(&index());
        assert_eq!(
            matcher.find(&entry("E:\\x\\unknown.mp3"), None, Path::new(ROOT)),
            Outcome::NotFound
        );
        assert_eq!(
            matcher.find(&SourceEntry::default(), None, Path::new(ROOT)),
            Outcome::NoLocation
        );
    }
}
