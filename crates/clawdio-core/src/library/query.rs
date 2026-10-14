//! Index queries behind the library commands (section 6.7). P6.1 finishes them.
//! A query matches folded text (D4) against artist, album and song title (R6).

use std::cmp::Ordering;
use std::collections::BTreeSet;

use super::group::group_cmp;
use super::{Album, AlbumId, Artist, ArtistId, LibraryIndex, Track, TrackId};
use crate::api::{
    AlbumRow, ArtistRow, SongRow, SongScope, SortColumn, SortKey, TreeAlbum, TreeArtist,
};
use crate::error::CoreError;
use crate::fold::{fold, natural_cmp};

/// At most a primary and a secondary sort key (TB-13).
const MAX_SORT_KEYS: usize = 2;

/// A sort value of one track: folded text or a number. A song with no number sorts last, also in
/// a descending sort.
enum SortValue {
    Text(String),
    Number(Option<u32>),
}

impl SortValue {
    fn cmp_value(&self, other: &SortValue) -> Ordering {
        match (self, other) {
            (SortValue::Text(a), SortValue::Text(b)) => natural_cmp(a, b),
            (SortValue::Number(a), SortValue::Number(b)) => match (a, b) {
                (Some(a), Some(b)) => a.cmp(b),
                (Some(_), None) => Ordering::Less,
                (None, Some(_)) => Ordering::Greater,
                (None, None) => Ordering::Equal,
            },
            _ => Ordering::Equal,
        }
    }
}

/// A folded search query. Empty matches everything.
struct Query(String);

impl Query {
    fn new(text: &str) -> Self {
        Query(fold(text.trim()))
    }

    fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    fn hits(&self, key: &str) -> bool {
        key.contains(&self.0)
    }
}

impl LibraryIndex {
    fn live_tracks<'a>(&'a self, album: &'a Album) -> impl Iterator<Item = &'a Track> + 'a {
        album.tracks.iter().filter_map(|id| self.track(*id))
    }

    /// Songs of an album in R4 order: disc order, track number, file name (case ignored).
    /// Disc order is the disc tag, else the natural-order position of the song's sub-folder,
    /// else 0 for files directly in the album folder.
    fn album_songs<'a>(&'a self, album: &'a Album) -> Vec<&'a Track> {
        let mut songs: Vec<&Track> = self.live_tracks(album).collect();
        let mut folders: Vec<&str> = songs
            .iter()
            .filter_map(|song| song.data.subfolder.as_deref())
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect();
        folders.sort_by(|a, b| natural_cmp(a, b));
        let disc_order = |song: &Track| {
            song.data.disc.unwrap_or_else(|| {
                song.data.subfolder.as_deref().map_or(0, |folder| {
                    folders
                        .iter()
                        .position(|f| *f == folder)
                        .map_or(0, |i| i as u32 + 1)
                })
            })
        };
        songs.sort_by_cached_key(|song| {
            (
                disc_order(song),
                song.data.track_no.unwrap_or(u32::MAX),
                song.file_key.clone(),
                song.data.rel_path.clone(),
            )
        });
        songs
    }

    fn has_songs(&self, album: &Album) -> bool {
        self.live_tracks(album).next().is_some()
    }

    fn sorted_albums(&self, artist: &Artist) -> Vec<&Album> {
        let mut albums: Vec<&Album> = artist
            .albums
            .iter()
            .filter_map(|id| self.album(*id))
            .filter(|album| self.has_songs(album))
            .collect();
        albums.sort_by(|a, b| group_cmp(&a.name, &b.name));
        albums
    }

    fn sorted_artists(&self) -> Vec<&Artist> {
        let mut artists: Vec<&Artist> = self
            .artists
            .iter()
            .filter(|artist| {
                artist
                    .albums
                    .iter()
                    .filter_map(|id| self.album(*id))
                    .any(|album| self.has_songs(album))
            })
            .collect();
        artists.sort_by(|a, b| group_cmp(&a.name, &b.name));
        artists
    }

    /// The songs of an album that a query selects. A match on the artist or album name selects
    /// all songs; otherwise only songs whose title matches.
    fn matching_songs<'a>(
        &'a self,
        artist: &Artist,
        album: &'a Album,
        query: &Query,
    ) -> Vec<&'a Track> {
        let songs = self.album_songs(album);
        if query.is_empty() || query.hits(&artist.key) || query.hits(&album.key) {
            songs
        } else {
            songs
                .into_iter()
                .filter(|song| query.hits(&song.key))
                .collect()
        }
    }

    /// Ids of the artists with at least one matching song, in folder name order.
    pub fn artist_ids(&self, query: &str) -> Vec<ArtistId> {
        let query = Query::new(query);
        self.sorted_artists()
            .into_iter()
            .filter(|artist| {
                self.sorted_albums(artist)
                    .into_iter()
                    .any(|album| !self.matching_songs(artist, album, &query).is_empty())
            })
            .map(|artist| artist.id)
            .collect()
    }

    /// Row data for the given artist ids, in the same order (D14).
    pub fn artist_rows(&self, ids: &[ArtistId]) -> Result<Vec<ArtistRow>, CoreError> {
        ids.iter()
            .map(|id| {
                let artist = self.artist(*id).ok_or(CoreError::UnknownId {
                    kind: "artist",
                    id: *id,
                })?;
                Ok(ArtistRow {
                    id: artist.id,
                    name: artist.name.clone(),
                })
            })
            .collect()
    }

    /// Ids of the albums of one artist, or of all artists, with at least one matching song.
    pub fn album_ids(
        &self,
        artist: Option<ArtistId>,
        query: &str,
    ) -> Result<Vec<AlbumId>, CoreError> {
        let query = Query::new(query);
        let artists = match artist {
            Some(id) => vec![self
                .artist(id)
                .ok_or(CoreError::UnknownId { kind: "artist", id })?],
            None => self.sorted_artists(),
        };
        let mut ids = Vec::new();
        for artist in artists {
            for album in self.sorted_albums(artist) {
                if !self.matching_songs(artist, album, &query).is_empty() {
                    ids.push(album.id);
                }
            }
        }
        Ok(ids)
    }

    /// Row data for the given album ids, in the same order (D14).
    pub fn album_rows(&self, ids: &[AlbumId]) -> Result<Vec<AlbumRow>, CoreError> {
        ids.iter()
            .map(|id| {
                let album = self.album(*id).ok_or(CoreError::UnknownId {
                    kind: "album",
                    id: *id,
                })?;
                let artist = self.artist(album.artist).ok_or(CoreError::UnknownId {
                    kind: "artist",
                    id: album.artist,
                })?;
                Ok(AlbumRow {
                    id: album.id,
                    artist_id: artist.id,
                    name: album.name.clone(),
                    artist_name: artist.name.clone(),
                })
            })
            .collect()
    }

    /// Ids of the matching songs in a scope. With no sort keys: artist, album and song order
    /// (R4). With one or two keys (UD11, TB-8, TB-13): sorted by them, ties in the R4 order.
    pub fn song_ids(
        &self,
        scope: SongScope,
        query: &str,
        sort: &[SortKey],
    ) -> Result<Vec<TrackId>, CoreError> {
        if sort.len() > MAX_SORT_KEYS {
            return Err(CoreError::Invalid("at most two sort keys".into()));
        }
        let ids = self.r4_song_ids(scope, query)?;
        Ok(if sort.is_empty() {
            ids
        } else {
            self.sorted(ids, sort)
        })
    }

    /// The value of one sort column for a track: text is folded (D4), numbers stay numbers.
    fn sort_value(&self, track: &Track, column: SortColumn) -> SortValue {
        match column {
            SortColumn::Track => SortValue::Number(track.data.track_no),
            SortColumn::Duration => SortValue::Number(Some(track.data.duration_ms)),
            SortColumn::Title => SortValue::Text(track.key.clone()),
            SortColumn::Album => SortValue::Text(
                self.album(track.album)
                    .map(|album| album.key.clone())
                    .unwrap_or_default(),
            ),
            // The Artist column shows the tag artist when there is one, else the folder artist.
            SortColumn::Artist => SortValue::Text(match &track.data.tag_artist {
                Some(tag) => fold(tag),
                None => self
                    .artist(track.artist)
                    .map(|artist| artist.key.clone())
                    .unwrap_or_default(),
            }),
        }
    }

    /// A stable sort by the keys: equal values keep their R4 order (UK4: each value is made once).
    fn sorted(&self, ids: Vec<TrackId>, sort: &[SortKey]) -> Vec<TrackId> {
        let mut rows: Vec<(TrackId, Vec<SortValue>)> = ids
            .into_iter()
            .map(|id| {
                let values = match self.track(id) {
                    Some(track) => sort
                        .iter()
                        .map(|key| self.sort_value(track, key.column))
                        .collect(),
                    None => Vec::new(),
                };
                (id, values)
            })
            .collect();
        rows.sort_by(|(_, a), (_, b)| {
            for (index, key) in sort.iter().enumerate() {
                let (Some(left), Some(right)) = (a.get(index), b.get(index)) else {
                    continue;
                };
                let order = match (left, right) {
                    // A song with no number sorts last in both directions.
                    (SortValue::Number(None), SortValue::Number(Some(_))) => Ordering::Greater,
                    (SortValue::Number(Some(_)), SortValue::Number(None)) => Ordering::Less,
                    _ if key.descending => left.cmp_value(right).reverse(),
                    _ => left.cmp_value(right),
                };
                if order != Ordering::Equal {
                    return order;
                }
            }
            Ordering::Equal
        });
        rows.into_iter().map(|(id, _)| id).collect()
    }

    /// Ids of the matching songs in a scope, in artist, album and song order (R4).
    fn r4_song_ids(&self, scope: SongScope, query: &str) -> Result<Vec<TrackId>, CoreError> {
        let query = Query::new(query);
        if let Some(id) = scope.album {
            let album = self
                .album(id)
                .ok_or(CoreError::UnknownId { kind: "album", id })?;
            let artist = self.artist(album.artist).ok_or(CoreError::UnknownId {
                kind: "artist",
                id: album.artist,
            })?;
            return Ok(self
                .matching_songs(artist, album, &query)
                .iter()
                .map(|t| t.id)
                .collect());
        }
        let artists = match scope.artist {
            Some(id) => vec![self
                .artist(id)
                .ok_or(CoreError::UnknownId { kind: "artist", id })?],
            None => self.sorted_artists(),
        };
        let mut ids = Vec::new();
        for artist in artists {
            for album in self.sorted_albums(artist) {
                ids.extend(
                    self.matching_songs(artist, album, &query)
                        .iter()
                        .map(|t| t.id),
                );
            }
        }
        Ok(ids)
    }

    /// Row data for the given song ids, in the same order. An unknown or removed id is an error.
    pub fn rows(&self, ids: &[TrackId]) -> Result<Vec<SongRow>, CoreError> {
        ids.iter()
            .map(|id| {
                let track = self.track(*id).ok_or(CoreError::UnknownId {
                    kind: "track",
                    id: *id,
                })?;
                let artist = self.artist(track.artist);
                let album = self.album(track.album);
                let artist_name = artist.map(|a| a.name.clone()).unwrap_or_default();
                Ok(SongRow {
                    id: track.id,
                    artist_id: track.artist,
                    album_id: track.album,
                    title: track.data.title.clone(),
                    tag_artist: track
                        .data
                        .tag_artist
                        .clone()
                        .filter(|tag| *tag != artist_name),
                    artist_name,
                    album_name: album.map(|a| a.name.clone()).unwrap_or_default(),
                    duration_ms: track.data.duration_ms,
                    track_no: track.data.track_no,
                    disc: track.data.disc,
                })
            })
            .collect()
    }

    /// The Tree view: matching artists, their matching albums and the matching songs (R6).
    pub fn tree(&self, query: &str) -> Vec<TreeArtist> {
        let query = Query::new(query);
        self.sorted_artists()
            .into_iter()
            .filter_map(|artist| {
                let albums: Vec<TreeAlbum> = self
                    .sorted_albums(artist)
                    .into_iter()
                    .filter_map(|album| {
                        let songs: Vec<TrackId> = self
                            .matching_songs(artist, album, &query)
                            .iter()
                            .map(|t| t.id)
                            .collect();
                        (!songs.is_empty()).then(|| TreeAlbum {
                            id: album.id,
                            name: album.name.clone(),
                            songs,
                        })
                    })
                    .collect();
                (!albums.is_empty()).then(|| TreeArtist {
                    id: artist.id,
                    name: artist.name.clone(),
                    albums,
                })
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::library::NewTrack;

    fn track(artist: &str, album: &str, title: &str, no: u32) -> NewTrack {
        NewTrack {
            rel_path: format!("{artist}/{album}/{no:02} {title}.mp3"),
            artist: artist.into(),
            album: album.into(),
            title: title.into(),
            track_no: Some(no),
            duration_ms: 1000 * no,
            ..NewTrack::default()
        }
    }

    fn sample() -> LibraryIndex {
        let mut index = LibraryIndex::new();
        index.insert(track("Beyoncé", "Lemonade", "Hold Up", 2));
        index.insert(track("Beyoncé", "Lemonade", "Pray You Catch Me", 1));
        index.insert(track("ABBA", "Arrival", "Dancing Queen", 2));
        index.insert(track("ABBA", "Arrival", "When I Kissed the Teacher", 1));
        index.insert(track("ABBA", "Gold", "Waterloo", 1));
        index
    }

    fn names(index: &LibraryIndex, query: &str) -> Vec<String> {
        let ids = index.artist_ids(query);
        index
            .artist_rows(&ids)
            .unwrap()
            .into_iter()
            .map(|row| row.name)
            .collect()
    }

    fn album_names(index: &LibraryIndex, artist: Option<u32>, query: &str) -> Vec<String> {
        let ids = index.album_ids(artist, query).unwrap();
        index
            .album_rows(&ids)
            .unwrap()
            .into_iter()
            .map(|row| row.name)
            .collect()
    }

    #[test]
    fn lists_artists_in_folded_order() {
        assert_eq!(names(&sample(), ""), ["ABBA", "Beyoncé"]);
    }

    #[test]
    fn search_ignores_case_and_accents() {
        let index = sample();
        assert_eq!(names(&index, "beyonce"), ["Beyoncé"]);
        assert_eq!(names(&index, "WATERLOO"), ["ABBA"]);
        assert!(index.artist_ids("nothing like this").is_empty());
    }

    #[test]
    fn albums_filter_by_artist_and_query() {
        let index = sample();
        assert_eq!(
            album_names(&index, None, ""),
            ["Arrival", "Gold", "Lemonade"]
        );
        let abba = index.artist_ids("")[0];
        assert_eq!(album_names(&index, Some(abba), "water"), ["Gold"]);
        let unknown = |kind, id| Some(CoreError::UnknownId { kind, id });
        assert_eq!(index.album_ids(Some(99), "").err(), unknown("artist", 99));
        assert_eq!(index.album_rows(&[99]).err(), unknown("album", 99));
        assert_eq!(index.artist_rows(&[99]).err(), unknown("artist", 99));
    }

    #[test]
    fn songs_follow_album_order_and_scope() {
        let index = sample();
        let titles = |ids: Vec<TrackId>| -> Vec<String> {
            index
                .rows(&ids)
                .unwrap()
                .into_iter()
                .map(|row| row.title)
                .collect()
        };
        assert_eq!(
            titles(index.song_ids(SongScope::default(), "", &[]).unwrap()),
            [
                "When I Kissed the Teacher",
                "Dancing Queen",
                "Waterloo",
                "Pray You Catch Me",
                "Hold Up"
            ]
        );
        let lemonade = index.album_ids(None, "lemon").unwrap()[0];
        let scope = SongScope {
            artist: None,
            album: Some(lemonade),
        };
        assert_eq!(
            titles(index.song_ids(scope, "", &[]).unwrap()),
            ["Pray You Catch Me", "Hold Up"]
        );
        assert_eq!(
            titles(index.song_ids(SongScope::default(), "queen", &[]).unwrap()),
            ["Dancing Queen"]
        );
    }

    #[test]
    fn an_album_name_match_selects_all_its_songs() {
        let index = sample();
        let tree = index.tree("arrival");
        assert_eq!(tree.len(), 1);
        assert_eq!(tree[0].albums.len(), 1);
        assert_eq!(tree[0].albums[0].songs.len(), 2);
        let tree = index.tree("hold");
        assert_eq!(tree[0].name, "Beyoncé");
        assert_eq!(tree[0].albums[0].songs.len(), 1);
    }

    #[test]
    fn removed_ids_stay_unknown_and_are_not_reused() {
        let mut index = sample();
        assert!(index.remove(0));
        assert!(!index.remove(0));
        assert_eq!(
            index.rows(&[0]),
            Err(CoreError::UnknownId {
                kind: "track",
                id: 0
            })
        );
        let id = index.insert(track("New", "Album", "Song", 1));
        assert_eq!(id, 5);
        assert_eq!(index.len(), 5);
    }

    #[test]
    fn rows_show_the_tag_artist_only_when_it_differs() {
        let mut index = LibraryIndex::new();
        let mut same = track("Queen", "Jazz", "Mustapha", 1);
        same.tag_artist = Some("Queen".into());
        let mut other = track("Queen", "Jazz", "Bicycle", 2);
        other.tag_artist = Some("Freddie Mercury".into());
        let ids = [index.insert(same), index.insert(other)];
        let rows = index.rows(&ids).unwrap();
        assert_eq!(rows[0].tag_artist, None);
        assert_eq!(rows[1].tag_artist.as_deref(), Some("Freddie Mercury"));
    }

    fn disc_track(path: &str, sub: Option<&str>, disc: Option<u32>, no: Option<u32>) -> NewTrack {
        NewTrack {
            rel_path: path.into(),
            artist: "A".into(),
            album: "B".into(),
            subfolder: sub.map(str::to_owned),
            title: path.rsplit('/').next().unwrap().into(),
            disc,
            track_no: no,
            ..NewTrack::default()
        }
    }

    fn album_titles(index: &LibraryIndex) -> Vec<String> {
        let ids = index.song_ids(SongScope::default(), "", &[]).unwrap();
        index
            .rows(&ids)
            .unwrap()
            .into_iter()
            .map(|row| row.title)
            .collect()
    }

    #[test]
    fn songs_order_by_disc_then_track_then_file_name() {
        // No disc tags: the sub-folders give the disc order (natural order: 2 before 10).
        let mut index = LibraryIndex::new();
        index.insert(disc_track(
            "A/B/Disc 10/1.mp3",
            Some("Disc 10"),
            None,
            Some(1),
        ));
        index.insert(disc_track(
            "A/B/Disc 2/2.mp3",
            Some("Disc 2"),
            None,
            Some(2),
        ));
        index.insert(disc_track(
            "A/B/Disc 2/1.mp3",
            Some("Disc 2"),
            None,
            Some(1),
        ));
        index.insert(disc_track("A/B/intro.mp3", None, None, None));
        index.insert(disc_track("A/B/b.mp3", None, None, Some(1)));
        index.insert(disc_track("A/B/A.mp3", None, None, Some(1)));
        assert_eq!(
            album_titles(&index),
            ["A.mp3", "b.mp3", "intro.mp3", "1.mp3", "2.mp3", "1.mp3"]
        );
        let ids = index.song_ids(SongScope::default(), "", &[]).unwrap();
        let paths: Vec<&str> = ids.iter().map(|id| index.rel_path(*id).unwrap()).collect();
        assert_eq!(
            &paths[3..],
            ["A/B/Disc 2/1.mp3", "A/B/Disc 2/2.mp3", "A/B/Disc 10/1.mp3"]
        );

        // Disc tags win over the folders.
        let mut index = LibraryIndex::new();
        index.insert(disc_track("A/B/x/1.mp3", Some("x"), Some(2), Some(1)));
        index.insert(disc_track("A/B/y/2.mp3", Some("y"), Some(1), Some(2)));
        index.insert(disc_track("A/B/y/1.mp3", Some("y"), Some(1), Some(1)));
        let ids = index.song_ids(SongScope::default(), "", &[]).unwrap();
        let paths: Vec<&str> = ids.iter().map(|id| index.rel_path(*id).unwrap()).collect();
        assert_eq!(paths, ["A/B/y/1.mp3", "A/B/y/2.mp3", "A/B/x/1.mp3"]);
    }

    #[test]
    fn a_path_inserted_again_keeps_its_id_and_takes_the_new_data() {
        let mut index = LibraryIndex::new();
        let first = index.insert(disc_track("A/B/1.mp3", None, None, Some(1)));
        let second = index.insert(disc_track("A/B/1.mp3", None, None, Some(7)));
        assert_eq!(first, second, "a rescan does not shift ids (D46)");
        assert_eq!(index.len(), 1);
        assert_eq!(index.track(first).unwrap().data.track_no, Some(7));
        assert!(index.remove_path("A/B/1.mp3"));
        assert!(index.is_empty());
    }

    fn sorted_titles(index: &LibraryIndex, sort: &[SortKey]) -> Vec<String> {
        let ids = index.song_ids(SongScope::default(), "", sort).unwrap();
        index
            .rows(&ids)
            .unwrap()
            .into_iter()
            .map(|row| row.title)
            .collect()
    }

    fn key(column: SortColumn, descending: bool) -> SortKey {
        SortKey { column, descending }
    }

    #[test]
    fn sorts_by_each_column_in_both_directions() {
        let index = sample();
        assert_eq!(
            sorted_titles(&index, &[key(SortColumn::Title, false)]),
            [
                "Dancing Queen",
                "Hold Up",
                "Pray You Catch Me",
                "Waterloo",
                "When I Kissed the Teacher"
            ]
        );
        assert_eq!(
            sorted_titles(&index, &[key(SortColumn::Title, true)]),
            [
                "When I Kissed the Teacher",
                "Waterloo",
                "Pray You Catch Me",
                "Hold Up",
                "Dancing Queen"
            ]
        );
        // Ties keep the R4 order: ABBA before Beyoncé, then album and track order.
        assert_eq!(
            sorted_titles(&index, &[key(SortColumn::Track, false)]),
            [
                "When I Kissed the Teacher",
                "Waterloo",
                "Pray You Catch Me",
                "Dancing Queen",
                "Hold Up"
            ]
        );
        assert_eq!(
            sorted_titles(&index, &[key(SortColumn::Duration, true)])[..2],
            ["Dancing Queen", "Hold Up"]
        );
        assert_eq!(
            sorted_titles(&index, &[key(SortColumn::Artist, true)])[..2],
            ["Pray You Catch Me", "Hold Up"]
        );
        assert_eq!(
            sorted_titles(&index, &[key(SortColumn::Album, false)])[..3],
            ["When I Kissed the Teacher", "Dancing Queen", "Waterloo"]
        );
    }

    #[test]
    fn a_song_with_no_track_number_sorts_last_in_both_directions() {
        let mut index = LibraryIndex::new();
        index.insert(NewTrack {
            track_no: None,
            ..track("A", "X", "Loose", 9)
        });
        index.insert(track("A", "X", "One", 1));
        index.insert(track("A", "X", "Two", 2));
        assert_eq!(
            sorted_titles(&index, &[key(SortColumn::Track, false)]),
            ["One", "Two", "Loose"]
        );
        assert_eq!(
            sorted_titles(&index, &[key(SortColumn::Track, true)]),
            ["Two", "One", "Loose"]
        );
    }

    #[test]
    fn text_sorts_fold_accents_and_numbers_sort_naturally() {
        let mut index = LibraryIndex::new();
        index.insert(track("A", "X", "Song 10", 1));
        index.insert(track("A", "X", "Émile", 2));
        index.insert(track("A", "X", "Song 2", 3));
        index.insert(track("A", "X", "emile", 4));
        index.insert(track("A", "X", "Zed", 5));
        assert_eq!(
            sorted_titles(&index, &[key(SortColumn::Title, false)]),
            ["Émile", "emile", "Song 2", "Song 10", "Zed"]
        );
    }

    #[test]
    fn a_second_key_breaks_ties_of_the_first() {
        let index = sample();
        assert_eq!(
            sorted_titles(
                &index,
                &[key(SortColumn::Artist, false), key(SortColumn::Title, true)]
            ),
            [
                "When I Kissed the Teacher",
                "Waterloo",
                "Dancing Queen",
                "Pray You Catch Me",
                "Hold Up"
            ]
        );
    }

    #[test]
    fn more_than_two_sort_keys_are_refused() {
        let index = sample();
        let three = [key(SortColumn::Title, false); 3];
        assert!(index.song_ids(SongScope::default(), "", &three).is_err());
    }

    #[test]
    fn rows_carry_the_track_and_disc_numbers() {
        let mut index = LibraryIndex::new();
        index.insert(NewTrack {
            disc: Some(2),
            ..track("A", "X", "One", 7)
        });
        let ids = index.song_ids(SongScope::default(), "", &[]).unwrap();
        let row = &index.rows(&ids).unwrap()[0];
        assert_eq!((row.track_no, row.disc), (Some(7), Some(2)));
    }
}
