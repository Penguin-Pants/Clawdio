//! Grouping by folder (R3): the first folder under the root is the artist, the second the album.
//! Deeper folders fold into the album. Tags never change grouping.

use std::cmp::Ordering;
use std::path::{Component, Path};

use crate::fold::natural_cmp;

pub const UNKNOWN_ARTIST: &str = "Unknown Artist";
pub const UNKNOWN_ALBUM: &str = "Unknown Album";

/// The groups of one file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Grouping {
    pub artist: String,
    pub album: String,
    /// The first folder below the album folder, for disc order (R4). None for files directly
    /// in the album folder.
    pub subfolder: Option<String>,
}

/// The groups of a file from its path relative to the music folder.
pub fn group(relative: &Path) -> Grouping {
    let mut folders = relative
        .parent()
        .into_iter()
        .flat_map(Path::components)
        .filter_map(|part| match part {
            Component::Normal(name) => Some(name.to_string_lossy().into_owned()),
            _ => None,
        });
    Grouping {
        artist: folders.next().unwrap_or_else(|| UNKNOWN_ARTIST.to_owned()),
        album: folders.next().unwrap_or_else(|| UNKNOWN_ALBUM.to_owned()),
        subfolder: folders.next(),
    }
}

/// Artist and album order (R3): natural order of folder names, "Unknown Artist" and
/// "Unknown Album" last.
pub fn group_cmp(a: &str, b: &str) -> Ordering {
    let unknown = |name: &str| name == UNKNOWN_ARTIST || name == UNKNOWN_ALBUM;
    unknown(a).cmp(&unknown(b)).then_with(|| natural_cmp(a, b))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn g(path: &str) -> (String, String, Option<String>) {
        let grouping = group(Path::new(path));
        (grouping.artist, grouping.album, grouping.subfolder)
    }

    #[test]
    fn groups_by_the_first_two_folders() {
        let some = |s: &str| Some(s.to_string());
        assert_eq!(
            g("Artist/Album/01 Song.mp3"),
            ("Artist".into(), "Album".into(), None)
        );
        assert_eq!(
            g("Artist/Album/Disc 1/01 Song.mp3"),
            ("Artist".into(), "Album".into(), some("Disc 1"))
        );
        assert_eq!(
            g("Artist/Album/CD 2/extra/01 Song.mp3"),
            ("Artist".into(), "Album".into(), some("CD 2"))
        );
        assert_eq!(
            g("Artist/Song.mp3"),
            ("Artist".into(), UNKNOWN_ALBUM.into(), None)
        );
        assert_eq!(
            g("Song.mp3"),
            (UNKNOWN_ARTIST.into(), UNKNOWN_ALBUM.into(), None)
        );
        assert_eq!(
            g("Björk/Début/x.mp3"),
            ("Björk".into(), "Début".into(), None)
        );
    }

    #[test]
    fn unknown_groups_sort_last() {
        let mut names = vec![UNKNOWN_ARTIST, "Zappa", "abba", "2Pac", "10cc"];
        names.sort_by(|a, b| group_cmp(a, b));
        assert_eq!(names, ["2Pac", "10cc", "abba", "Zappa", UNKNOWN_ARTIST]);
        let mut albums = vec![UNKNOWN_ALBUM, "Album 10", "Album 2"];
        albums.sort_by(|a, b| group_cmp(a, b));
        assert_eq!(albums, ["Album 2", "Album 10", UNKNOWN_ALBUM]);
    }
}
