//! Index queries behind the library commands (section 6.7). P6.1 finishes them.
//! A query matches folded text (D4) against artist, album and song title (R6).

use std::cmp::Ordering;

use super::{Album, AlbumId, Artist, LibraryIndex, Track, TrackId};
use crate::api::{AlbumRow, ArtistRow, SongRow, SongScope, TreeAlbum, TreeArtist};
use crate::error::CoreError;
use crate::fold::fold;

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

fn by_key(a: (&str, &str), b: (&str, &str)) -> Ordering {
    a.0.cmp(b.0).then_with(|| a.1.cmp(b.1))
}

impl LibraryIndex {
    fn live_tracks<'a>(&'a self, album: &'a Album) -> impl Iterator<Item = &'a Track> + 'a {
        album.tracks.iter().filter_map(|id| self.track(*id))
    }

    /// Songs of an album in album order: disc, track number, file path.
    fn album_songs<'a>(&'a self, album: &'a Album) -> Vec<&'a Track> {
        let mut songs: Vec<&Track> = self.live_tracks(album).collect();
        songs.sort_by(|a, b| {
            (a.disc, a.track_no.unwrap_or(u32::MAX), &a.rel_path).cmp(&(
                b.disc,
                b.track_no.unwrap_or(u32::MAX),
                &b.rel_path,
            ))
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
        albums.sort_by(|a, b| by_key((&a.key, &a.name), (&b.key, &b.name)));
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
        artists.sort_by(|a, b| by_key((&a.key, &a.name), (&b.key, &b.name)));
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

    /// Artists with at least one matching song, in folder name order.
    pub fn artists(&self, query: &str) -> Vec<ArtistRow> {
        let query = Query::new(query);
        self.sorted_artists()
            .into_iter()
            .filter(|artist| {
                self.sorted_albums(artist)
                    .into_iter()
                    .any(|album| !self.matching_songs(artist, album, &query).is_empty())
            })
            .map(|artist| ArtistRow {
                id: artist.id,
                name: artist.name.clone(),
            })
            .collect()
    }

    /// Albums of one artist, or of all artists, with at least one matching song.
    pub fn albums(&self, artist: Option<u32>, query: &str) -> Result<Vec<AlbumRow>, CoreError> {
        let query = Query::new(query);
        let artists = match artist {
            Some(id) => vec![self
                .artist(id)
                .ok_or(CoreError::UnknownId { kind: "artist", id })?],
            None => self.sorted_artists(),
        };
        let mut rows = Vec::new();
        for artist in artists {
            for album in self.sorted_albums(artist) {
                if !self.matching_songs(artist, album, &query).is_empty() {
                    rows.push(AlbumRow {
                        id: album.id,
                        artist_id: artist.id,
                        name: album.name.clone(),
                        artist_name: artist.name.clone(),
                        thumb: album.thumb.clone(),
                    });
                }
            }
        }
        Ok(rows)
    }

    /// Ids of the matching songs in a scope, in artist, album and song order.
    pub fn song_ids(&self, scope: SongScope, query: &str) -> Result<Vec<TrackId>, CoreError> {
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
                    title: track.title.clone(),
                    tag_artist: track.tag_artist.clone().filter(|tag| *tag != artist_name),
                    artist_name,
                    album_name: album.map(|a| a.name.clone()).unwrap_or_default(),
                    duration_ms: track.duration_ms,
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

    /// The album id of a track, for the Now playing art.
    pub fn album_of(&self, id: TrackId) -> Option<AlbumId> {
        self.track(id).map(|track| track.album)
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
            tag_artist: None,
            track_no: Some(no),
            disc: 0,
            duration_ms: 1000 * no,
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

    fn names(rows: &[ArtistRow]) -> Vec<&str> {
        rows.iter().map(|row| row.name.as_str()).collect()
    }

    #[test]
    fn lists_artists_in_folded_order() {
        assert_eq!(names(&sample().artists("")), ["ABBA", "Beyoncé"]);
    }

    #[test]
    fn search_ignores_case_and_accents() {
        let index = sample();
        assert_eq!(names(&index.artists("beyonce")), ["Beyoncé"]);
        assert_eq!(names(&index.artists("WATERLOO")), ["ABBA"]);
        assert!(index.artists("nothing like this").is_empty());
    }

    #[test]
    fn albums_filter_by_artist_and_query() {
        let index = sample();
        let all: Vec<String> = index
            .albums(None, "")
            .unwrap()
            .into_iter()
            .map(|a| a.name)
            .collect();
        assert_eq!(all, ["Arrival", "Gold", "Lemonade"]);
        let abba = index.artists("")[0].id;
        let gold: Vec<String> = index
            .albums(Some(abba), "water")
            .unwrap()
            .into_iter()
            .map(|a| a.name)
            .collect();
        assert_eq!(gold, ["Gold"]);
        assert_eq!(
            index.albums(Some(99), ""),
            Err(CoreError::UnknownId {
                kind: "artist",
                id: 99
            })
        );
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
            titles(index.song_ids(SongScope::default(), "").unwrap()),
            [
                "When I Kissed the Teacher",
                "Dancing Queen",
                "Waterloo",
                "Pray You Catch Me",
                "Hold Up"
            ]
        );
        let lemonade = index.albums(None, "lemon").unwrap()[0].id;
        let scope = SongScope {
            artist: None,
            album: Some(lemonade),
        };
        assert_eq!(
            titles(index.song_ids(scope, "").unwrap()),
            ["Pray You Catch Me", "Hold Up"]
        );
        assert_eq!(
            titles(index.song_ids(SongScope::default(), "queen").unwrap()),
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
}
