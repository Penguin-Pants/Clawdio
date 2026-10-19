//! Type-to-find (R36, D65): the first row of a list as shown whose name starts with the typed
//! text. Names and text are folded as for the R3 sort (D4), so case and accents do not count.

use std::borrow::Cow;

use super::{LibraryIndex, Track, TrackId};
use crate::api::{FindHit, FindList, SortColumn, TreeRowKind};
use crate::error::CoreError;
use crate::fold::fold;

/// The first row from the top whose folded name starts with the folded `text` (R36.4).
fn first_match<'a>(rows: impl Iterator<Item = (u32, Cow<'a, str>)>, text: &str) -> Option<FindHit> {
    let text = fold(text);
    if text.is_empty() {
        return None;
    }
    rows.enumerate()
        .find(|(_, (_, name))| name.starts_with(&text))
        .map(|(index, (id, _))| FindHit {
            index: index as u32,
            id,
        })
}

/// A duration as the Time column shows it: m:ss, or h:mm:ss from one hour (`formatDuration`).
fn duration_text(ms: u32) -> String {
    let total = ms / 1000;
    let (hours, minutes, seconds) = (total / 3600, total % 3600 / 60, total % 60);
    if hours > 0 {
        format!("{hours}:{minutes:02}:{seconds:02}")
    } else {
        format!("{minutes}:{seconds:02}")
    }
}

impl LibraryIndex {
    /// The folded name of a song in a Songs table sorted by `column` (R36.5): the text of that
    /// column as shown.
    fn song_name<'a>(&'a self, track: &'a Track, column: SortColumn) -> Cow<'a, str> {
        match column {
            SortColumn::Title => Cow::Borrowed(&track.key),
            SortColumn::Album => self
                .album(track.album)
                .map_or(Cow::Borrowed(""), |album| Cow::Borrowed(&album.key)),
            // The Artist column shows the tag artist when there is one, else the folder artist.
            SortColumn::Artist => match &track.data.tag_artist {
                Some(tag) => Cow::Owned(fold(tag)),
                None => self
                    .artist(track.artist)
                    .map_or(Cow::Borrowed(""), |artist| Cow::Borrowed(&artist.key)),
            },
            SortColumn::Track => Cow::Owned(
                track
                    .data
                    .track_no
                    .map(|no| no.to_string())
                    .unwrap_or_default(),
            ),
            SortColumn::Duration => Cow::Owned(duration_text(track.data.duration_ms)),
        }
    }

    /// Type-to-find in the Artist, Album and Songs lists and in the shown tree rows (D65). The
    /// lists are the ones the same identity gives to the webview. The playlist view and the
    /// queue come as track ids: [`LibraryIndex::find_title`].
    pub fn find(&self, list: &FindList, text: &str) -> Result<Option<FindHit>, CoreError> {
        Ok(match list {
            FindList::Artists { query } => {
                let ids = self.artist_ids(query);
                first_match(
                    ids.iter().filter_map(|id| {
                        self.artist(*id)
                            .map(|artist| (*id, Cow::Borrowed(artist.key.as_str())))
                    }),
                    text,
                )
            }
            FindList::Albums { artist, query } => {
                let ids = self.album_ids(*artist, query)?;
                first_match(
                    ids.iter().filter_map(|id| {
                        self.album(*id)
                            .map(|album| (*id, Cow::Borrowed(album.key.as_str())))
                    }),
                    text,
                )
            }
            FindList::Songs { scope, query, sort } => {
                let ids = self.song_ids(*scope, query, sort)?;
                // The first sort key's column, else Title (R36.5).
                let column = sort.first().map_or(SortColumn::Title, |key| key.column);
                first_match(
                    ids.iter().filter_map(|id| {
                        self.track(*id)
                            .map(|track| (*id, self.song_name(track, column)))
                    }),
                    text,
                )
            }
            // The row label at any level, on the rows shown now (R36.5).
            FindList::Tree { rows } => first_match(
                rows.iter().map(|row| {
                    let name = match row.kind {
                        TreeRowKind::Artist => self.artist(row.id).map(|artist| &artist.key),
                        TreeRowKind::Album => self.album(row.id).map(|album| &album.key),
                        TreeRowKind::Song => self.track(row.id).map(|track| &track.key),
                    };
                    // A removed row has no name and never matches.
                    (
                        row.id,
                        name.map_or(Cow::Borrowed(""), |key| Cow::Borrowed(key)),
                    )
                }),
                text,
            ),
            FindList::Playlist { .. } | FindList::Queue => {
                return Err(CoreError::Invalid(
                    "the playlist view and the queue find by track ids".into(),
                ))
            }
        })
    }

    /// Type-to-find on the Title of each entry (R36.5): the playlist view and the queue. A
    /// missing entry (`None`) or a removed track has no title and never matches.
    pub fn find_title(&self, tracks: &[Option<TrackId>], text: &str) -> Option<FindHit> {
        first_match(
            tracks
                .iter()
                .map(|track| match track.and_then(|id| self.track(id)) {
                    Some(track) => (track.id, Cow::Borrowed(track.key.as_str())),
                    None => (track.unwrap_or_default(), Cow::Borrowed("")),
                }),
            text,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::{SongScope, SortKey, TreeRow};
    use crate::library::NewTrack;

    fn track(artist: &str, album: &str, title: &str, no: u32) -> NewTrack {
        NewTrack {
            rel_path: format!("{artist}/{album}/{no:02} {title}.mp3"),
            artist: artist.into(),
            album: album.into(),
            title: title.into(),
            track_no: Some(no),
            duration_ms: 61_000 * no,
            ..NewTrack::default()
        }
    }

    /// Artists in folder order: Chemical Brothers, Émilie, Zapp, ZZ Top.
    fn sample() -> LibraryIndex {
        let mut index = LibraryIndex::new();
        index.insert(track("ZZ Top", "Eliminator", "Gimme All Your Lovin", 1));
        index.insert(track("ZZ Top", "Eliminator", "Sharp Dressed Man", 3));
        index.insert(track("Zapp", "Zapp II", "Dance Floor", 2));
        index.insert(track(
            "Chemical Brothers",
            "Dig Your Own Hole",
            "Setting Sun",
            4,
        ));
        index.insert(NewTrack {
            tag_artist: Some("Ärzte".into()),
            ..track("Émilie", "Été", "Zébulon", 5)
        });
        index
    }

    fn artists(text: &str) -> Option<u32> {
        let list = FindList::Artists { query: "".into() };
        sample().find(&list, text).unwrap().map(|hit| hit.index)
    }

    fn songs(index: &LibraryIndex, sort: Vec<SortKey>, text: &str) -> Option<String> {
        let list = FindList::Songs {
            scope: SongScope::default(),
            query: "".into(),
            sort,
        };
        let hit = index.find(&list, text).unwrap()?;
        Some(index.track(hit.id).unwrap().data.title.clone())
    }

    fn key(column: SortColumn) -> SortKey {
        SortKey {
            column,
            descending: false,
        }
    }

    #[test]
    fn a_prefix_matches_without_case_and_accents() {
        assert_eq!(artists("c"), Some(0));
        assert_eq!(artists("CHEM"), Some(0));
        assert_eq!(artists("emi"), Some(1));
        assert_eq!(artists("É"), Some(1));
        // Only a prefix matches, not text in the middle of a name (R36.4).
        assert_eq!(artists("brothers"), None);
    }

    #[test]
    fn the_first_match_from_the_top_wins() {
        assert_eq!(artists("z"), Some(2));
        assert_eq!(artists("zz"), Some(3));
        assert_eq!(artists("zz top"), Some(3));
        assert_eq!(artists("zzx"), None);
        assert_eq!(artists(""), None);
    }

    #[test]
    fn the_hit_carries_the_row_id() {
        let index = sample();
        let list = FindList::Artists {
            query: "top".into(),
        };
        let hit = index.find(&list, "zz").unwrap().unwrap();
        assert_eq!(hit.index, 0);
        assert_eq!(index.artist_rows(&[hit.id]).unwrap()[0].name, "ZZ Top");
    }

    #[test]
    fn the_album_list_matches_album_names() {
        let index = sample();
        let all = FindList::Albums {
            artist: None,
            query: "".into(),
        };
        // Albums in artist order: Dig Your Own Hole, Été, Zapp II, Eliminator.
        assert_eq!(index.find(&all, "e").unwrap().map(|hit| hit.index), Some(1));
        assert_eq!(
            index.find(&all, "eli").unwrap().map(|hit| hit.index),
            Some(3)
        );
        let zz = index.artist_ids("zz top")[0];
        let one = FindList::Albums {
            artist: Some(zz),
            query: "".into(),
        };
        assert_eq!(index.find(&one, "e").unwrap().map(|hit| hit.index), Some(0));
        assert_eq!(index.find(&one, "d").unwrap(), None);
    }

    #[test]
    fn the_songs_table_uses_the_first_sort_column_else_title() {
        let index = sample();
        // No column sort: Title, in R4 order.
        assert_eq!(songs(&index, vec![], "s").as_deref(), Some("Setting Sun"));
        assert_eq!(songs(&index, vec![], "dig"), None);
        assert_eq!(
            songs(&index, vec![key(SortColumn::Title)], "z").as_deref(),
            Some("Zébulon")
        );
        // The first sort key decides the column; the second does not.
        let album = vec![key(SortColumn::Album), key(SortColumn::Title)];
        assert_eq!(
            songs(&index, album.clone(), "dig").as_deref(),
            Some("Setting Sun")
        );
        assert_eq!(songs(&index, album, "set"), None);
        // The Artist column shows the tag artist when there is one.
        let artist = vec![key(SortColumn::Artist)];
        assert_eq!(
            songs(&index, artist.clone(), "arz").as_deref(),
            Some("Zébulon")
        );
        assert_eq!(songs(&index, artist, "emi"), None);
        // Numbers match as the column shows them.
        let track_no = vec![key(SortColumn::Track)];
        assert_eq!(
            songs(&index, track_no, "3").as_deref(),
            Some("Sharp Dressed Man")
        );
        let time = vec![key(SortColumn::Duration)];
        assert_eq!(
            songs(&index, time.clone(), "4:0").as_deref(),
            Some("Setting Sun")
        );
        assert_eq!(songs(&index, time, "0:"), None);
    }

    #[test]
    fn a_descending_sort_finds_from_the_top_as_shown() {
        let index = sample();
        let down = vec![SortKey {
            column: SortColumn::Title,
            descending: true,
        }];
        // Zébulon, Setting Sun, Sharp Dressed Man, ...: "s" finds the first S row as shown.
        assert_eq!(
            songs(&index, down, "s").as_deref(),
            Some("Sharp Dressed Man")
        );
    }

    #[test]
    fn the_tree_matches_the_given_rows_at_any_level() {
        let index = sample();
        let zz = index.artist_ids("zz top")[0];
        let album = index.album_ids(Some(zz), "").unwrap()[0];
        let song = index.song_ids(SongScope::default(), "sharp", &[]).unwrap()[0];
        let rows = vec![
            TreeRow {
                kind: TreeRowKind::Artist,
                id: zz,
            },
            TreeRow {
                kind: TreeRowKind::Album,
                id: album,
            },
            TreeRow {
                kind: TreeRowKind::Song,
                id: song,
            },
        ];
        let find = |text: &str| {
            index
                .find(&FindList::Tree { rows: rows.clone() }, text)
                .unwrap()
                .map(|hit| (hit.index, hit.id))
        };
        assert_eq!(find("zz"), Some((0, zz)));
        assert_eq!(find("eli"), Some((1, album)));
        assert_eq!(find("sharp"), Some((2, song)));
        // A song that is not a given row does not match: a collapsed node does not open.
        assert_eq!(find("gimme"), None);
    }

    #[test]
    fn titles_match_and_missing_entries_never_do() {
        let index = sample();
        let sharp = index.song_ids(SongScope::default(), "sharp", &[]).unwrap()[0];
        let gimme = index.song_ids(SongScope::default(), "gimme", &[]).unwrap()[0];
        let tracks = [None, Some(gimme), Some(sharp), Some(sharp)];
        let hit = index.find_title(&tracks, "SH").unwrap();
        assert_eq!((hit.index, hit.id), (2, sharp));
        assert_eq!(index.find_title(&tracks, "g").map(|hit| hit.index), Some(1));
        assert_eq!(index.find_title(&tracks, "zz"), None);
        assert_eq!(index.find_title(&[], "s"), None);
    }

    #[test]
    fn the_playlist_and_queue_lists_are_not_library_lists() {
        assert!(sample().find(&FindList::Queue, "a").is_err());
        assert!(sample().find(&FindList::Playlist { id: 0 }, "a").is_err());
    }

    #[test]
    fn durations_read_as_the_time_column() {
        assert_eq!(duration_text(0), "0:00");
        assert_eq!(duration_text(61_999), "1:01");
        assert_eq!(duration_text(3_600_000 + 65_000), "1:01:05");
    }
}
