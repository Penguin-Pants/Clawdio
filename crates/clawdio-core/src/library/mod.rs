//! The library index (D14, D46). It lives in memory; SQLite (P5) is a rebuildable cache.
//! Ids are session ids: monotonic, never reused. A removed track stays as a tombstone.

mod query;

use std::collections::HashMap;

use crate::fold::fold;

pub type ArtistId = u32;
pub type AlbumId = u32;
pub type TrackId = u32;

/// A track to add. Artist and album are folder group names (R3).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewTrack {
    pub rel_path: String,
    pub artist: String,
    pub album: String,
    pub title: String,
    pub tag_artist: Option<String>,
    pub track_no: Option<u32>,
    pub disc: u32,
    pub duration_ms: u32,
}

#[derive(Debug, Clone)]
pub struct Track {
    pub id: TrackId,
    pub rel_path: String,
    pub artist: ArtistId,
    pub album: AlbumId,
    pub title: String,
    pub tag_artist: Option<String>,
    pub track_no: Option<u32>,
    pub disc: u32,
    pub duration_ms: u32,
    /// Folded title (D4).
    pub key: String,
}

#[derive(Debug, Clone)]
pub struct Artist {
    pub id: ArtistId,
    pub name: String,
    pub key: String,
    pub albums: Vec<AlbumId>,
}

#[derive(Debug, Clone)]
pub struct Album {
    pub id: AlbumId,
    pub artist: ArtistId,
    pub name: String,
    pub key: String,
    pub tracks: Vec<TrackId>,
    /// File name of the album thumbnail in the thumbnail folder, if one exists.
    pub thumb: Option<String>,
}

#[derive(Debug, Default)]
pub struct LibraryIndex {
    artists: Vec<Artist>,
    albums: Vec<Album>,
    tracks: Vec<Option<Track>>,
    artist_ids: HashMap<String, ArtistId>,
    album_ids: HashMap<(ArtistId, String), AlbumId>,
}

impl LibraryIndex {
    pub fn new() -> Self {
        Self::default()
    }

    /// Adds a track and returns its new id. Its artist and album groups are created on first use.
    pub fn insert(&mut self, track: NewTrack) -> TrackId {
        let artist = self.artist_id(&track.artist);
        let album = self.album_id(artist, &track.album);
        let id = self.tracks.len() as TrackId;
        self.tracks.push(Some(Track {
            id,
            key: fold(&track.title),
            rel_path: track.rel_path,
            artist,
            album,
            title: track.title,
            tag_artist: track.tag_artist,
            track_no: track.track_no,
            disc: track.disc,
            duration_ms: track.duration_ms,
        }));
        self.albums[album as usize].tracks.push(id);
        id
    }

    /// Removes a track. Its id stays a tombstone and is never issued again (D46).
    pub fn remove(&mut self, id: TrackId) -> bool {
        let Some(slot) = self.tracks.get_mut(id as usize) else {
            return false;
        };
        let Some(track) = slot.take() else {
            return false;
        };
        self.albums[track.album as usize]
            .tracks
            .retain(|t| *t != id);
        true
    }

    /// Removes every track, for a new music folder. Ids stay unique (D46).
    pub fn clear_tracks(&mut self) {
        for slot in &mut self.tracks {
            if let Some(track) = slot.take() {
                self.albums[track.album as usize].tracks.clear();
            }
        }
    }

    /// The relative path of a track, for playback.
    pub fn rel_path(&self, id: TrackId) -> Option<&str> {
        self.track(id).map(|track| track.rel_path.as_str())
    }

    pub fn set_album_thumb(&mut self, album: AlbumId, thumb: Option<String>) {
        if let Some(entry) = self.albums.get_mut(album as usize) {
            entry.thumb = thumb;
        }
    }

    pub fn track(&self, id: TrackId) -> Option<&Track> {
        self.tracks.get(id as usize).and_then(Option::as_ref)
    }

    pub fn artist(&self, id: ArtistId) -> Option<&Artist> {
        self.artists.get(id as usize)
    }

    pub fn album(&self, id: AlbumId) -> Option<&Album> {
        self.albums.get(id as usize)
    }

    /// Number of live tracks.
    pub fn len(&self) -> usize {
        self.tracks.iter().flatten().count()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn album_count(&self) -> usize {
        self.albums.len()
    }

    fn artist_id(&mut self, name: &str) -> ArtistId {
        if let Some(id) = self.artist_ids.get(name) {
            return *id;
        }
        let id = self.artists.len() as ArtistId;
        self.artists.push(Artist {
            id,
            name: name.to_owned(),
            key: fold(name),
            albums: Vec::new(),
        });
        self.artist_ids.insert(name.to_owned(), id);
        id
    }

    fn album_id(&mut self, artist: ArtistId, name: &str) -> AlbumId {
        if let Some(id) = self.album_ids.get(&(artist, name.to_owned())) {
            return *id;
        }
        let id = self.albums.len() as AlbumId;
        self.albums.push(Album {
            id,
            artist,
            name: name.to_owned(),
            key: fold(name),
            tracks: Vec::new(),
            thumb: None,
        });
        self.artists[artist as usize].albums.push(id);
        self.album_ids.insert((artist, name.to_owned()), id);
        id
    }
}
