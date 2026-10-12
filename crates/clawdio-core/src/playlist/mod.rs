//! Playlists (P11, R12, R13, R26): `.m3u8` files in the music folder. The scan finds them;
//! this set reads them, resolves entries against the index and writes edits atomically. A
//! rescan never writes a playlist (P11-AC7).

pub mod m3u;
pub mod name;

use std::cmp::Ordering;
use std::path::Path;

use crate::api::{PlaylistEntry, PlaylistRow};
use crate::atomic::write_atomic;
use crate::fold::natural_cmp;
use crate::library::{LibraryIndex, TrackId};
use m3u::Entry;
use name::{NameError, FAVORITES};

/// The folder for new playlists and Favorites (R13).
pub const PLAYLISTS_FOLDER: &str = "Playlists";

/// Why a playlist edit failed. The messages hold no path (D13).
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum PlaylistError {
    #[error("{0}")]
    Name(#[from] NameError),
    #[error("The playlist file cannot be written. The folder may be read-only")]
    Write,
    #[error("The playlist file cannot be deleted")]
    Delete,
    #[error("The playlist no longer exists")]
    Unknown,
}

/// One playlist file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Playlist {
    /// Session id; the same file keeps it across rescans (like D46).
    pub id: u32,
    /// Path relative to the music folder, with forward slashes.
    pub rel_path: String,
    /// The file name without `.m3u8` (R13).
    pub name: String,
    pub entries: Vec<Entry>,
}

impl Playlist {
    fn track(&self, entry: &Entry, index: &LibraryIndex) -> Option<TrackId> {
        let rel = m3u::resolve(&self.rel_path, &entry.path)?;
        index.track_at(&rel).map(|track| track.id)
    }

    /// The entry's track id, or None for a missing file (R13).
    pub fn tracks(&self, index: &LibraryIndex) -> Vec<Option<TrackId>> {
        self.entries
            .iter()
            .map(|entry| self.track(entry, index))
            .collect()
    }
}

fn name_of(rel_path: &str) -> String {
    let file = rel_path.rsplit('/').next().unwrap_or(rel_path);
    match file.rsplit_once('.') {
        Some((stem, _)) => stem.to_owned(),
        None => file.to_owned(),
    }
}

/// The playlists of the music folder.
#[derive(Debug, Default)]
pub struct PlaylistSet {
    playlists: Vec<Playlist>,
    next_id: u32,
}

impl PlaylistSet {
    /// Reads the files the scan found (P11.2). A file that cannot be read as UTF-8 text is
    /// skipped and logged. A known file keeps its id.
    pub fn load(&mut self, root: &Path, rel_paths: &[String]) {
        let mut playlists = Vec::with_capacity(rel_paths.len());
        for rel_path in rel_paths {
            let text = match std::fs::read(root.join(rel_path)).map(String::from_utf8) {
                Ok(Ok(text)) => text,
                Ok(Err(_)) => {
                    log::warn!("playlist: {rel_path} is not UTF-8 text; skipped");
                    continue;
                }
                Err(error) => {
                    log::warn!("playlist: cannot read {rel_path}: {error}; skipped");
                    continue;
                }
            };
            let id = match self.playlists.iter().find(|p| p.rel_path == *rel_path) {
                Some(known) => known.id,
                None => {
                    self.next_id += 1;
                    self.next_id - 1
                }
            };
            playlists.push(Playlist {
                id,
                rel_path: rel_path.clone(),
                name: name_of(rel_path),
                entries: m3u::parse(&text),
            });
        }
        self.playlists = playlists;
    }

    /// Forgets every playlist (a new music folder, P11.10). Ids stay unique.
    pub fn clear(&mut self) {
        self.playlists.clear();
    }

    pub fn get(&self, id: u32) -> Option<&Playlist> {
        self.playlists.iter().find(|p| p.id == id)
    }

    fn sorted(&self) -> Vec<&Playlist> {
        let mut sorted: Vec<&Playlist> = self.playlists.iter().collect();
        sorted.sort_by(|a, b| match natural_cmp(&a.name, &b.name) {
            Ordering::Equal => a.rel_path.cmp(&b.rel_path),
            other => other,
        });
        sorted
    }

    /// Playlist rows in natural name order (P11.5).
    pub fn rows(&self) -> Vec<PlaylistRow> {
        self.sorted()
            .into_iter()
            .map(|p| PlaylistRow {
                id: p.id,
                name: p.name.clone(),
                entry_count: p.entries.len() as u32,
            })
            .collect()
    }

    /// The entries of a playlist: a library track, or a missing file by its path.
    pub fn entries(&self, id: u32, index: &LibraryIndex) -> Option<Vec<PlaylistEntry>> {
        let playlist = self.get(id)?;
        Some(
            playlist
                .entries
                .iter()
                .zip(playlist.tracks(index))
                .map(|(entry, track)| PlaylistEntry {
                    track,
                    label: if track.is_some() {
                        String::new()
                    } else {
                        entry.path.clone()
                    },
                })
                .collect(),
        )
    }

    /// Names of the playlists in the folder for new ones, for the D21 rule.
    fn names_in_playlists_folder(&self) -> impl Iterator<Item = &str> {
        self.playlists
            .iter()
            .filter(|p| p.rel_path.starts_with(&format!("{PLAYLISTS_FOLDER}/")))
            .map(|p| p.name.as_str())
    }

    fn write(root: &Path, playlist: &Playlist) -> Result<(), PlaylistError> {
        write_atomic(
            &root.join(&playlist.rel_path),
            m3u::write(&playlist.entries).as_bytes(),
        )
        .map_err(|error| {
            log::warn!("playlist: cannot write {}: {error}", playlist.rel_path);
            PlaylistError::Write
        })
    }

    /// Writes `changed` and keeps it only when the write worked, so a failure leaves both the
    /// file and the set as they were (P11.8).
    fn commit(&mut self, root: &Path, changed: Playlist) -> Result<(), PlaylistError> {
        Self::write(root, &changed)?;
        match self.playlists.iter_mut().find(|p| p.id == changed.id) {
            Some(slot) => *slot = changed,
            None => self.playlists.push(changed),
        }
        Ok(())
    }

    fn new_playlist(&mut self, name: &str) -> Playlist {
        self.next_id += 1;
        Playlist {
            id: self.next_id - 1,
            rel_path: format!("{PLAYLISTS_FOLDER}/{name}.m3u8"),
            name: name.to_owned(),
            entries: Vec::new(),
        }
    }

    /// Creates `Playlists/<name>.m3u8` (R12, R13). The name follows R12 and D21.
    pub fn create(&mut self, root: &Path, name: &str) -> Result<u32, PlaylistError> {
        name::check(name, self.names_in_playlists_folder())?;
        let playlist = self.new_playlist(name);
        let id = playlist.id;
        self.commit(root, playlist)?;
        Ok(id)
    }

    fn entry_for(playlist: &Playlist, track: TrackId, index: &LibraryIndex) -> Option<Entry> {
        let track = index.track(track)?;
        Some(Entry {
            path: m3u::relative_path(&playlist.rel_path, track.rel_path()),
            info: Some(m3u::info(
                track.data.duration_ms,
                track
                    .data
                    .tag_artist
                    .as_deref()
                    .unwrap_or(&track.data.artist),
                track.title(),
            )),
        })
    }

    /// Appends tracks (R12: duplicates are allowed). Unknown ids are left out.
    pub fn add(
        &mut self,
        root: &Path,
        id: u32,
        tracks: &[TrackId],
        index: &LibraryIndex,
    ) -> Result<(), PlaylistError> {
        let mut changed = self.get(id).ok_or(PlaylistError::Unknown)?.clone();
        for track in tracks {
            if let Some(entry) = Self::entry_for(&changed, *track, index) {
                changed.entries.push(entry);
            }
        }
        self.commit(root, changed)
    }

    /// Removes the entry at `position` (R12, R25). Missing entries can be removed too.
    pub fn remove_entry(
        &mut self,
        root: &Path,
        id: u32,
        position: usize,
    ) -> Result<(), PlaylistError> {
        let mut changed = self.get(id).ok_or(PlaylistError::Unknown)?.clone();
        if position >= changed.entries.len() {
            return Ok(());
        }
        changed.entries.remove(position);
        self.commit(root, changed)
    }

    /// Deletes the playlist file (R12, after the confirmation in the UI).
    pub fn delete(&mut self, root: &Path, id: u32) -> Result<(), PlaylistError> {
        let playlist = self.get(id).ok_or(PlaylistError::Unknown)?;
        match std::fs::remove_file(root.join(&playlist.rel_path)) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                log::warn!("playlist: cannot delete {}: {error}", playlist.rel_path);
                return Err(PlaylistError::Delete);
            }
        }
        self.playlists.retain(|p| p.id != id);
        Ok(())
    }

    fn favorites(&self) -> Option<&Playlist> {
        let path = format!("{PLAYLISTS_FOLDER}/{FAVORITES}.m3u8");
        self.playlists
            .iter()
            .find(|p| p.rel_path.eq_ignore_ascii_case(&path))
    }

    /// The tracks in Favorites, for the hearts (R26).
    pub fn favorite_tracks(&self, index: &LibraryIndex) -> Vec<TrackId> {
        self.favorites()
            .map(|p| p.tracks(index).into_iter().flatten().collect())
            .unwrap_or_default()
    }

    /// The heart (R26, P11.7): adds the track, or removes every copy of it. The first use
    /// creates `Playlists/Favorites.m3u8`. Returns whether the track is a favorite now.
    pub fn toggle_favorite(
        &mut self,
        root: &Path,
        track: TrackId,
        index: &LibraryIndex,
    ) -> Result<bool, PlaylistError> {
        let mut changed = match self.favorites() {
            Some(favorites) => favorites.clone(),
            None => self.new_playlist(FAVORITES),
        };
        let tracks = changed.tracks(index);
        let before = changed.entries.len();
        let mut keep = tracks.iter().map(|t| *t != Some(track));
        changed.entries.retain(|_| keep.next().unwrap_or(true));
        let now_favorite = changed.entries.len() == before;
        if now_favorite {
            let entry = Self::entry_for(&changed, track, index).ok_or(PlaylistError::Unknown)?;
            changed.entries.push(entry);
        }
        self.commit(root, changed)?;
        Ok(now_favorite)
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
            duration_ms: 183_500,
            stamp: FileStamp::default(),
            has_picture: false,
        }
    }

    /// Two songs in two artist folders (AC-3 shape).
    fn index() -> LibraryIndex {
        let mut index = LibraryIndex::default();
        index.insert(track(
            "Björk/Debut/01 Human Behaviour.mp3",
            "Human Behaviour",
        ));
        index.insert(track(
            "Nina Simone/Pastel Blues/02 Sinnerman.ogg",
            "Sinnerman",
        ));
        index
    }

    fn read(root: &Path, rel: &str) -> String {
        std::fs::read_to_string(root.join(rel)).unwrap()
    }

    /// P11-AC2: create, add with a duplicate, remove and delete, against golden text.
    #[test]
    fn edits_give_golden_files() {
        let dir = tempfile::tempdir().unwrap();
        let index = index();
        let mut set = PlaylistSet::default();
        let id = set.create(dir.path(), "Road trip").unwrap();
        assert_eq!(read(dir.path(), "Playlists/Road trip.m3u8"), "#EXTM3U\n");
        set.add(dir.path(), id, &[0, 1, 0], &index).unwrap();
        assert_eq!(
            read(dir.path(), "Playlists/Road trip.m3u8"),
            "#EXTM3U\n\
             #EXTINF:183,Björk - Human Behaviour\n\
             ../Björk/Debut/01 Human Behaviour.mp3\n\
             #EXTINF:183,Nina Simone - Sinnerman\n\
             ../Nina Simone/Pastel Blues/02 Sinnerman.ogg\n\
             #EXTINF:183,Björk - Human Behaviour\n\
             ../Björk/Debut/01 Human Behaviour.mp3\n"
        );
        set.remove_entry(dir.path(), id, 0).unwrap();
        assert_eq!(
            read(dir.path(), "Playlists/Road trip.m3u8"),
            "#EXTM3U\n\
             #EXTINF:183,Nina Simone - Sinnerman\n\
             ../Nina Simone/Pastel Blues/02 Sinnerman.ogg\n\
             #EXTINF:183,Björk - Human Behaviour\n\
             ../Björk/Debut/01 Human Behaviour.mp3\n"
        );
        set.delete(dir.path(), id).unwrap();
        assert!(!dir.path().join("Playlists/Road trip.m3u8").exists());
        assert!(set.rows().is_empty());
    }

    /// P11-AC4: missing entries show by path and stay in the file after edits.
    #[test]
    fn missing_entries_stay_after_every_edit() {
        let dir = tempfile::tempdir().unwrap();
        let index = index();
        std::fs::create_dir_all(dir.path().join("Playlists")).unwrap();
        std::fs::write(
            dir.path().join("Playlists/Old.m3u8"),
            "#EXTM3U\n#EXTINF:-1,Gone\n../Gone/x.mp3\n../Björk/Debut/01 Human Behaviour.mp3\n",
        )
        .unwrap();
        let mut set = PlaylistSet::default();
        set.load(dir.path(), &["Playlists/Old.m3u8".into()]);
        let id = set.rows()[0].id;
        let entries = set.entries(id, &index).unwrap();
        assert_eq!(
            entries[0],
            PlaylistEntry {
                track: None,
                label: "../Gone/x.mp3".into()
            }
        );
        assert_eq!(entries[1].track, Some(0));
        set.add(dir.path(), id, &[1], &index).unwrap();
        set.remove_entry(dir.path(), id, 1).unwrap();
        assert_eq!(
            read(dir.path(), "Playlists/Old.m3u8"),
            "#EXTM3U\n#EXTINF:-1,Gone\n../Gone/x.mp3\n#EXTINF:183,Nina Simone - Sinnerman\n../Nina Simone/Pastel Blues/02 Sinnerman.ogg\n"
        );
    }

    /// P11-AC3: a failed write shows the error and leaves the old file.
    #[test]
    fn a_failed_write_keeps_the_old_file_and_the_set() {
        let dir = tempfile::tempdir().unwrap();
        let index = index();
        let mut set = PlaylistSet::default();
        let id = set.create(dir.path(), "Mix").unwrap();
        let before = read(dir.path(), "Playlists/Mix.m3u8");
        // A folder in place of the file makes the rename fail for any user, root included.
        let file = dir.path().join("Playlists/Mix.m3u8");
        std::fs::remove_file(&file).unwrap();
        std::fs::create_dir(&file).unwrap();
        assert_eq!(
            set.add(dir.path(), id, &[0], &index),
            Err(PlaylistError::Write)
        );
        std::fs::remove_dir(&file).unwrap();
        std::fs::write(&file, &before).unwrap();
        assert_eq!(
            set.get(id).unwrap().entries.len(),
            0,
            "the set did not change"
        );
        assert_eq!(read(dir.path(), "Playlists/Mix.m3u8"), before);
    }

    /// P11-AC5: the heart adds and removes every copy, creating Favorites on first use.
    #[test]
    fn the_heart_toggles_favorites_and_creates_the_file() {
        let dir = tempfile::tempdir().unwrap();
        let index = index();
        let mut set = PlaylistSet::default();
        assert!(set.toggle_favorite(dir.path(), 1, &index).unwrap());
        assert_eq!(set.favorite_tracks(&index), [1]);
        assert!(read(dir.path(), "Playlists/Favorites.m3u8").contains("Sinnerman.ogg"));
        assert_eq!(set.rows()[0].name, "Favorites");
        // A copy added by hand: the heart removes every copy.
        let favorites = set.rows()[0].id;
        set.add(dir.path(), favorites, &[1], &index).unwrap();
        assert!(!set.toggle_favorite(dir.path(), 1, &index).unwrap());
        assert!(set.favorite_tracks(&index).is_empty());
        assert_eq!(read(dir.path(), "Playlists/Favorites.m3u8"), "#EXTM3U\n");
    }

    #[test]
    fn create_refuses_bad_and_taken_names() {
        let dir = tempfile::tempdir().unwrap();
        let mut set = PlaylistSet::default();
        set.create(dir.path(), "Mix").unwrap();
        assert_eq!(
            set.create(dir.path(), "mix"),
            Err(PlaylistError::Name(NameError::Taken))
        );
        assert_eq!(
            set.create(dir.path(), "Favorites"),
            Err(PlaylistError::Name(NameError::Favorites))
        );
    }

    /// P11-AC6 (reading): an unreadable file is skipped; known files keep their ids.
    #[test]
    fn load_skips_unreadable_files_and_keeps_ids() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.m3u8"), "#EXTM3U\n").unwrap();
        std::fs::write(dir.path().join("bad.m3u8"), [0xff, 0xfe, 0x00]).unwrap();
        let mut set = PlaylistSet::default();
        let paths: Vec<String> = vec!["a.m3u8".into(), "bad.m3u8".into(), "gone.m3u8".into()];
        set.load(dir.path(), &paths);
        let rows = set.rows();
        assert_eq!(rows.len(), 1);
        set.load(dir.path(), &paths);
        assert_eq!(set.rows()[0].id, rows[0].id);
    }

    #[test]
    fn rows_are_in_natural_name_order() {
        let dir = tempfile::tempdir().unwrap();
        let mut set = PlaylistSet::default();
        for name in ["Mix 10", "mix 2", "Favorite songs"] {
            set.create(dir.path(), name).unwrap();
        }
        let names: Vec<String> = set.rows().into_iter().map(|row| row.name).collect();
        assert_eq!(names, ["Favorite songs", "mix 2", "Mix 10"]);
    }
}
