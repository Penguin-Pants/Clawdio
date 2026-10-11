//! The library index (D14, D46). It lives in memory; SQLite (P5) is a rebuildable cache.
//! Ids are session ids: monotonic, never reused. A removed track stays as a tombstone.

mod group;
mod query;
mod title;

use std::collections::HashMap;

use crate::fold::fold;

pub use group::{group, group_cmp, Grouping, UNKNOWN_ALBUM, UNKNOWN_ARTIST};
pub use title::{strip_number_prefix, title_and_track};

pub type ArtistId = u32;
pub type AlbumId = u32;
pub type TrackId = u32;

/// Size and modified time of a file: the incremental scan compares them (R2).
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct FileStamp {
    pub size: u64,
    /// Milliseconds since the Unix epoch.
    pub modified_ms: i64,
}

/// A track to add. Artist and album are folder group names (R3). Title and track number are
/// already computed (R4).
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct NewTrack {
    pub rel_path: String,
    pub artist: String,
    pub album: String,
    /// The first folder below the album folder, for disc order (R4).
    pub subfolder: Option<String>,
    pub title: String,
    pub tag_artist: Option<String>,
    pub track_no: Option<u32>,
    /// The disc number tag.
    pub disc: Option<u32>,
    pub duration_ms: u32,
    pub stamp: FileStamp,
    /// The file has an embedded picture (D44).
    pub has_picture: bool,
}

#[derive(Debug, Clone)]
pub struct Track {
    pub id: TrackId,
    pub artist: ArtistId,
    pub album: AlbumId,
    pub data: NewTrack,
    /// Folded title (D4).
    pub key: String,
    /// Lowercase file name, the last sort key (R4).
    pub file_key: String,
}

impl Track {
    pub fn rel_path(&self) -> &str {
        &self.data.rel_path
    }

    pub fn title(&self) -> &str {
        &self.data.title
    }
}

/// The cover file state of an album folder (D44).
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub enum CoverState {
    #[default]
    None,
    Valid,
    Broken,
}

/// The cover file of an album folder and its state (D44). A file decodes again only when its
/// name or stamp changes.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct CoverInfo {
    pub state: CoverState,
    /// File name and stamp of the cover file, when one exists.
    pub file: Option<(String, FileStamp)>,
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
    pub cover: CoverInfo,
}

#[derive(Debug, Default)]
pub struct LibraryIndex {
    artists: Vec<Artist>,
    albums: Vec<Album>,
    tracks: Vec<Option<Track>>,
    artist_ids: HashMap<String, ArtistId>,
    album_ids: HashMap<(ArtistId, String), AlbumId>,
    paths: HashMap<String, TrackId>,
    /// Files the scan skipped, with their stamp and reason, so an unchanged one is not read
    /// again (P5-AC7).
    skipped: HashMap<String, (FileStamp, String)>,
}

impl LibraryIndex {
    pub fn new() -> Self {
        Self::default()
    }

    /// Adds a track and returns its id. Its artist and album groups are created on first use.
    /// A track with the same path keeps its id and gets the new data, so a rescan does not
    /// shift ids under the queue or the selection (D46).
    pub fn insert(&mut self, track: NewTrack) -> TrackId {
        self.skipped.remove(&track.rel_path);
        if let Some(&id) = self.paths.get(&track.rel_path) {
            if let Some(existing) = self.tracks.get_mut(id as usize).and_then(Option::as_mut) {
                existing.key = fold(&track.title);
                existing.data = track;
                return id;
            }
        }
        let artist = self.artist_id(&track.artist);
        let album = self.album_id(artist, &track.album);
        let id = self.tracks.len() as TrackId;
        let file_key = track
            .rel_path
            .rsplit('/')
            .next()
            .unwrap_or_default()
            .to_lowercase();
        self.paths.insert(track.rel_path.clone(), id);
        self.tracks.push(Some(Track {
            id,
            key: fold(&track.title),
            file_key,
            artist,
            album,
            data: track,
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
        self.paths.remove(&track.data.rel_path);
        self.albums[track.album as usize]
            .tracks
            .retain(|t| *t != id);
        true
    }

    /// Removes the track with this relative path, if there is one.
    pub fn remove_path(&mut self, rel_path: &str) -> bool {
        match self.paths.get(rel_path) {
            Some(id) => self.remove(*id),
            None => false,
        }
    }

    /// The live track with this relative path.
    pub fn track_at(&self, rel_path: &str) -> Option<&Track> {
        self.paths.get(rel_path).and_then(|id| self.track(*id))
    }

    /// Relative paths of all live tracks.
    pub fn paths(&self) -> impl Iterator<Item = &str> {
        self.paths.keys().map(String::as_str)
    }

    /// Removes every track, for a new music folder. Ids stay unique (D46).
    pub fn clear_tracks(&mut self) {
        for slot in &mut self.tracks {
            if let Some(track) = slot.take() {
                self.albums[track.album as usize].tracks.clear();
            }
        }
        self.paths.clear();
        self.skipped.clear();
        for album in &mut self.albums {
            album.cover = CoverInfo::default();
            album.thumb = None;
        }
    }

    /// The stamp and reason of a skipped file.
    pub fn skipped(&self, rel_path: &str) -> Option<&(FileStamp, String)> {
        self.skipped.get(rel_path)
    }

    /// Records a skipped file. A track with the same path is removed.
    pub fn set_skipped(&mut self, rel_path: &str, stamp: FileStamp, reason: &str) {
        self.remove_path(rel_path);
        self.skipped
            .insert(rel_path.to_owned(), (stamp, reason.to_owned()));
    }

    /// Forgets a skipped file (it is gone).
    pub fn remove_skipped(&mut self, rel_path: &str) -> bool {
        self.skipped.remove(rel_path).is_some()
    }

    /// Relative paths of all skipped files.
    pub fn skipped_paths(&self) -> impl Iterator<Item = &str> {
        self.skipped.keys().map(String::as_str)
    }

    /// The relative path of a track, for playback.
    pub fn rel_path(&self, id: TrackId) -> Option<&str> {
        self.track(id).map(Track::rel_path)
    }

    /// The cover information of an album folder, if the album exists.
    pub fn cover(&self, artist: &str, album: &str) -> Option<&CoverInfo> {
        let artist = self.artist_ids.get(artist)?;
        let album = self.album_ids.get(&(*artist, album.to_owned()))?;
        self.albums.get(*album as usize).map(|album| &album.cover)
    }

    /// Sets the cover information of an album folder. The album is created when needed.
    pub fn set_cover(&mut self, artist: &str, album: &str, cover: CoverInfo) {
        let artist = self.artist_id(artist);
        let album = self.album_id(artist, album);
        self.albums[album as usize].cover = cover;
    }

    /// Albums with tracks: artist name, album name and cover information.
    pub fn album_covers(&self) -> impl Iterator<Item = (&str, &str, &CoverInfo)> {
        self.albums
            .iter()
            .filter(|album| !album.tracks.is_empty())
            .map(|album| {
                (
                    self.artists[album.artist as usize].name.as_str(),
                    album.name.as_str(),
                    &album.cover,
                )
            })
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
        self.paths.len()
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
            cover: CoverInfo::default(),
        });
        self.artists[artist as usize].albums.push(id);
        self.album_ids.insert((artist, name.to_owned()), id);
        id
    }
}
