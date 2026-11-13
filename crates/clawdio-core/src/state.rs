//! `state.json` (P9.1, R27, D25): the queue as paths relative to the music folder, the
//! current entry, the position and the volume. From P27 (R27 v1.13) also the shuffle and
//! repeat modes. From P26 (R37, D66) also the Library selection.

use std::path::Path;

use serde::de::DeserializeOwned;
use serde::{Deserialize, Deserializer, Serialize};

use crate::api::{LibrarySelectionIds, RepeatMode};
use crate::atomic::write_atomic;
use crate::library::{LibraryIndex, TrackId};

pub const STATE_FILE: &str = "state.json";
pub const STATE_VERSION: u32 = 1;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackState {
    pub version: u32,
    /// Queue entries as paths relative to the music folder, in queue order.
    pub queue: Vec<String>,
    /// The current entry, an index into `queue`.
    pub current: Option<usize>,
    pub position_ms: u32,
    /// From 0 to 100.
    pub volume: u8,
    /// R27 (v1.13). A file without it, or with a value that cannot be read, gives off.
    #[serde(default, deserialize_with = "lenient")]
    pub shuffle: bool,
    /// R27 (v1.13). A file without it, or with a value that cannot be read, gives off.
    #[serde(default, deserialize_with = "lenient")]
    pub repeat: RepeatMode,
    /// R37 (D66). A file without it, or with a value that cannot be read, gives no selection.
    #[serde(default, deserialize_with = "lenient")]
    pub library_selection: Option<SavedSelection>,
}

/// The Library selection on disk (R37, D66): exact names and a relative path, never session
/// ids. `None` is "All" (Artist, Album) or no song.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedSelection {
    pub artist: Option<String>,
    pub album: Option<SavedAlbum>,
    /// The song as a path relative to the music folder (the R27 path form).
    pub song: Option<String>,
}

/// An album by its artist name and its album name, as the index keys it (D66).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SavedAlbum {
    pub artist: String,
    pub name: String,
}

/// The selection to save: the three ids as names and a path. An id with no live group or
/// track is saved as `None`.
pub fn capture_selection(selection: LibrarySelectionIds, index: &LibraryIndex) -> SavedSelection {
    let artist = selection
        .artist
        .and_then(|id| index.artist(id))
        .map(|artist| artist.name.clone());
    let album = selection
        .album
        .and_then(|id| index.album(id))
        .and_then(|album| {
            Some(SavedAlbum {
                artist: index.artist(album.artist)?.name.clone(),
                name: album.name.clone(),
            })
        });
    let song = selection
        .song
        .and_then(|id| index.rel_path(id))
        .map(str::to_owned);
    SavedSelection {
        artist,
        album,
        song,
    }
}

/// The saved selection against the index (R37.6, R37.7). Before a complete traversal
/// (`complete` false) a missing level waits: the result is None. After it a missing level and
/// the levels below it become "All" or no song. A song that is not under the restored artist
/// and album is dropped.
pub fn resolve_selection(
    saved: &SavedSelection,
    index: &LibraryIndex,
    complete: bool,
) -> Option<LibrarySelectionIds> {
    let mut ids = LibrarySelectionIds::default();
    if let Some(name) = &saved.artist {
        match index.live_artist(name) {
            Some(id) => ids.artist = Some(id),
            None if complete => return Some(ids),
            None => return None,
        }
    }
    if let Some(album) = &saved.album {
        match index.live_album(&album.artist, &album.name) {
            // An album of another artist than the restored one is not under it.
            Some(id)
                if ids
                    .artist
                    .is_none_or(|artist| index.album(id).is_some_and(|a| a.artist == artist)) =>
            {
                ids.album = Some(id);
            }
            Some(_) => return Some(ids),
            None if complete => return Some(ids),
            None => return None,
        }
    }
    if let Some(path) = &saved.song {
        match index.track_at(path) {
            Some(track) => {
                let under_artist = ids.artist.is_none_or(|artist| track.artist == artist);
                let under_album = ids.album.is_none_or(|album| track.album == album);
                if under_artist && under_album {
                    ids.song = Some(track.id);
                }
            }
            None if !complete => return None,
            None => {}
        }
    }
    Some(ids)
}

/// The selection of the restored current song (R37 v1.14): its artist, its album and the
/// song. None when the track is gone.
pub fn playing_selection(track: TrackId, index: &LibraryIndex) -> Option<LibrarySelectionIds> {
    let track = index.track(track)?;
    Some(LibrarySelectionIds {
        artist: Some(track.artist),
        album: Some(track.album),
        song: Some(track.id),
    })
}

/// Reads an optional field. A value that cannot be read gives the default and a log line,
/// so one bad field does not drop the saved queue.
fn lenient<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
    D: Deserializer<'de>,
    T: DeserializeOwned + Default,
{
    let value = serde_json::Value::deserialize(deserializer)?;
    Ok(serde_json::from_value(value).unwrap_or_else(|error| {
        log::warn!("state: a field cannot be read: {error}; using the default");
        T::default()
    }))
}

/// Reads `state.json`. A missing file gives None; a corrupt file or another version gives
/// None and a log line.
pub fn load(config_dir: &Path) -> Option<PlaybackState> {
    let path = config_dir.join(STATE_FILE);
    let text = match std::fs::read_to_string(&path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return None,
        Err(error) => {
            log::warn!("state: cannot read {}: {error}", path.display());
            return None;
        }
    };
    match serde_json::from_str::<PlaybackState>(&text) {
        Ok(state) if state.version == STATE_VERSION => Some(state),
        Ok(state) => {
            log::warn!("state: unknown version {}; starting empty", state.version);
            None
        }
        Err(error) => {
            log::warn!("state: corrupt file: {error}; starting empty");
            None
        }
    }
}

/// Writes `state.json` atomically.
pub fn save(config_dir: &Path, state: &PlaybackState) -> std::io::Result<()> {
    // Compact: a large queue is thousands of lines when pretty.
    let bytes = serde_json::to_vec(state).map_err(std::io::Error::other)?;
    write_atomic(&config_dir.join(STATE_FILE), &bytes)
}

/// The saved state in track ids, ready for the player.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Restored {
    pub ids: Vec<TrackId>,
    /// The current entry in `ids`; None for an empty queue.
    pub current: Option<usize>,
    /// The position, kept only when the current entry is the saved one.
    pub position_ms: u32,
    pub volume: u8,
}

/// The saved queue against the index (P9.1). Entries not in the index wait for a complete
/// traversal: before it (`complete` false) the result is None while any entry is missing.
/// After it the missing entries are dropped with no message. When the current entry went,
/// the next remaining entry is current at position 0.
pub fn resolve(state: &PlaybackState, index: &LibraryIndex, complete: bool) -> Option<Restored> {
    let found: Vec<Option<TrackId>> = state
        .queue
        .iter()
        .map(|path| index.track_at(path).map(|track| track.id))
        .collect();
    if !complete && found.iter().any(Option::is_none) {
        return None;
    }
    let mut ids = Vec::with_capacity(found.len());
    let mut current = None;
    let mut position_ms = 0;
    for (index, id) in found.into_iter().enumerate() {
        let Some(id) = id else { continue };
        if current.is_none() && state.current.is_some_and(|saved| index >= saved) {
            current = Some(ids.len());
            if state.current == Some(index) {
                position_ms = state.position_ms;
            }
        }
        ids.push(id);
    }
    if current.is_none() && !ids.is_empty() && state.current.is_some() {
        // The current entry and all after it went: the last one left is current.
        current = Some(ids.len() - 1);
    }
    Some(Restored {
        ids,
        current,
        position_ms,
        volume: state.volume.min(100),
    })
}

/// The state to save: queue ids as paths. An id with no track (removed by a rescan) is left
/// out, and the current index follows. The modes are off; the caller sets them.
pub fn capture(
    ids: &[TrackId],
    current: Option<usize>,
    position_ms: u32,
    volume: u8,
    index: &LibraryIndex,
) -> PlaybackState {
    let mut queue = Vec::with_capacity(ids.len());
    let mut saved_current = None;
    for (position, id) in ids.iter().enumerate() {
        let Some(path) = index.rel_path(*id) else {
            continue;
        };
        if current == Some(position) {
            saved_current = Some(queue.len());
        }
        queue.push(path.to_owned());
    }
    PlaybackState {
        version: STATE_VERSION,
        queue,
        current: saved_current,
        position_ms: if saved_current.is_some() {
            position_ms
        } else {
            0
        },
        volume,
        shuffle: false,
        repeat: RepeatMode::Off,
        library_selection: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::library::{FileStamp, NewTrack};

    fn track(rel_path: &str) -> NewTrack {
        NewTrack {
            rel_path: rel_path.into(),
            artist: "Artist".into(),
            album: "Album".into(),
            subfolder: None,
            title: rel_path.into(),
            tag_artist: None,
            track_no: None,
            disc: None,
            duration_ms: 1000,
            stamp: FileStamp::default(),
            has_picture: false,
        }
    }

    fn index(paths: &[&str]) -> LibraryIndex {
        let mut index = LibraryIndex::default();
        for path in paths {
            index.insert(track(path));
        }
        index
    }

    fn state(queue: &[&str], current: Option<usize>, position_ms: u32) -> PlaybackState {
        PlaybackState {
            version: STATE_VERSION,
            queue: queue.iter().map(|path| path.to_string()).collect(),
            current,
            position_ms,
            volume: 60,
            shuffle: false,
            repeat: RepeatMode::Off,
            library_selection: None,
        }
    }

    fn id(index: &LibraryIndex, path: &str) -> TrackId {
        index.track_at(path).unwrap().id
    }

    #[test]
    fn the_state_round_trips_through_the_file() {
        let dir = tempfile::tempdir().unwrap();
        let saved = state(&["A/a.mp3", "B/b.ogg"], Some(1), 42_000);
        save(dir.path(), &saved).unwrap();
        assert_eq!(load(dir.path()), Some(saved));
    }

    #[test]
    fn the_shuffle_and_repeat_modes_round_trip_through_the_file() {
        let dir = tempfile::tempdir().unwrap();
        for (shuffle, repeat) in [(true, RepeatMode::One), (false, RepeatMode::All)] {
            let saved = PlaybackState {
                shuffle,
                repeat,
                ..state(&["A/a.mp3"], Some(0), 1_000)
            };
            save(dir.path(), &saved).unwrap();
            let loaded = load(dir.path()).unwrap();
            assert_eq!(loaded.shuffle, shuffle);
            assert_eq!(loaded.repeat, repeat);
        }
    }

    #[test]
    fn a_file_without_the_modes_keeps_its_queue_and_starts_with_the_modes_off() {
        let dir = tempfile::tempdir().unwrap();
        let old = r#"{"version":1,"queue":["A/a.mp3"],"current":0,"positionMs":7,"volume":40}"#;
        std::fs::write(dir.path().join(STATE_FILE), old).unwrap();
        let loaded = load(dir.path()).unwrap();
        assert_eq!(loaded.queue, ["A/a.mp3"]);
        assert!(!loaded.shuffle);
        assert_eq!(loaded.repeat, RepeatMode::Off);
    }

    #[test]
    fn a_mode_that_cannot_be_read_is_off_and_the_queue_stays() {
        let dir = tempfile::tempdir().unwrap();
        let bad = r#"{"version":1,"queue":["A/a.mp3"],"current":0,"positionMs":7,"volume":40,"shuffle":"yes","repeat":"twice"}"#;
        std::fs::write(dir.path().join(STATE_FILE), bad).unwrap();
        let loaded = load(dir.path()).unwrap();
        assert_eq!(loaded.queue, ["A/a.mp3"]);
        assert!(!loaded.shuffle);
        assert_eq!(loaded.repeat, RepeatMode::Off);
    }

    /// An index of (path, artist, album) tracks.
    fn grouped(tracks: &[(&str, &str, &str)]) -> LibraryIndex {
        let mut index = LibraryIndex::default();
        for (path, artist, album) in tracks {
            index.insert(NewTrack {
                artist: (*artist).into(),
                album: (*album).into(),
                ..track(path)
            });
        }
        index
    }

    fn library() -> LibraryIndex {
        grouped(&[
            ("X/A/1.mp3", "X", "A"),
            ("X/A/2.mp3", "X", "A"),
            ("X/B/1.mp3", "X", "B"),
            ("Y/C/1.mp3", "Y", "C"),
        ])
    }

    fn ids(artist: Option<u32>, album: Option<u32>, song: Option<u32>) -> LibrarySelectionIds {
        LibrarySelectionIds {
            artist,
            album,
            song,
        }
    }

    /// The ids of artist `artist`, album (artist, album) and song `path` in `index`.
    fn named(
        index: &LibraryIndex,
        artist: &str,
        album: Option<(&str, &str)>,
        path: Option<&str>,
    ) -> LibrarySelectionIds {
        ids(
            index.live_artist(artist),
            album.and_then(|(a, n)| index.live_album(a, n)),
            path.map(|path| id(index, path)),
        )
    }

    #[test]
    fn the_selection_round_trips_as_names_and_a_relative_path() {
        let index = library();
        let selected = named(&index, "X", Some(("X", "A")), Some("X/A/2.mp3"));
        let saved = capture_selection(selected, &index);
        assert_eq!(
            saved,
            SavedSelection {
                artist: Some("X".into()),
                album: Some(SavedAlbum {
                    artist: "X".into(),
                    name: "A".into()
                }),
                song: Some("X/A/2.mp3".into()),
            }
        );
        let dir = tempfile::tempdir().unwrap();
        let file = PlaybackState {
            library_selection: Some(saved),
            ..state(&["X/A/1.mp3"], Some(0), 0)
        };
        save(dir.path(), &file).unwrap();
        let text = std::fs::read_to_string(dir.path().join(STATE_FILE)).unwrap();
        assert!(text.contains(r#""librarySelection":{"artist":"X","album":{"artist":"X","name":"A"},"song":"X/A/2.mp3"}"#), "{text}");
        let loaded = load(dir.path()).unwrap();
        assert_eq!(
            resolve_selection(loaded.library_selection.as_ref().unwrap(), &index, false),
            Some(selected)
        );
    }

    #[test]
    fn a_file_without_the_selection_or_with_a_bad_one_keeps_its_queue_and_has_no_selection() {
        let dir = tempfile::tempdir().unwrap();
        for extra in [
            "",
            r#","librarySelection":{"artist":7}"#,
            r#","librarySelection":"x""#,
        ] {
            let text = format!(
                r#"{{"version":1,"queue":["A/a.mp3"],"current":0,"positionMs":7,"volume":40{extra}}}"#
            );
            std::fs::write(dir.path().join(STATE_FILE), text).unwrap();
            let loaded = load(dir.path()).unwrap();
            assert_eq!(loaded.queue, ["A/a.mp3"], "{extra}");
            assert_eq!(loaded.library_selection, None, "{extra}");
        }
    }

    /// The saved selection X, A, X/A/2.mp3 after `change` and a complete traversal.
    fn after(
        change: impl FnOnce(&mut LibraryIndex),
    ) -> (LibraryIndex, Option<LibrarySelectionIds>) {
        let mut index = library();
        let saved = capture_selection(
            named(&index, "X", Some(("X", "A")), Some("X/A/2.mp3")),
            &index,
        );
        change(&mut index);
        let resolved = resolve_selection(&saved, &index, true);
        (index, resolved)
    }

    #[test]
    fn a_missing_level_clears_it_and_the_levels_below() {
        // The song went: the artist and the album stay.
        let (index, resolved) = after(|index| {
            index.remove_path("X/A/2.mp3");
        });
        assert_eq!(resolved, Some(named(&index, "X", Some(("X", "A")), None)));
        // The album went (its last tracks removed, a tombstoned group): the artist stays.
        let (index, resolved) = after(|index| {
            index.remove_path("X/A/1.mp3");
            index.remove_path("X/A/2.mp3");
        });
        assert_eq!(resolved, Some(named(&index, "X", None, None)));
        // The artist went: nothing is selected.
        let (_, resolved) = after(|index| {
            for path in ["X/A/1.mp3", "X/A/2.mp3", "X/B/1.mp3"] {
                index.remove_path(path);
            }
        });
        assert_eq!(resolved, Some(ids(None, None, None)));
    }

    #[test]
    fn missing_levels_in_an_index_without_the_groups_also_clear() {
        let index = grouped(&[("Y/C/1.mp3", "Y", "C")]);
        let saved = SavedSelection {
            artist: Some("X".into()),
            album: Some(SavedAlbum {
                artist: "X".into(),
                name: "A".into(),
            }),
            song: Some("X/A/2.mp3".into()),
        };
        assert_eq!(
            resolve_selection(&saved, &index, true),
            Some(ids(None, None, None))
        );
    }

    #[test]
    fn before_a_complete_traversal_a_missing_level_waits() {
        let index = grouped(&[("X/A/1.mp3", "X", "A")]);
        let song = SavedSelection {
            artist: Some("X".into()),
            album: Some(SavedAlbum {
                artist: "X".into(),
                name: "A".into(),
            }),
            song: Some("X/A/2.mp3".into()),
        };
        assert_eq!(
            resolve_selection(&song, &index, false),
            None,
            "the song waits"
        );
        let album = SavedSelection {
            album: Some(SavedAlbum {
                artist: "X".into(),
                name: "B".into(),
            }),
            song: None,
            ..song.clone()
        };
        assert_eq!(
            resolve_selection(&album, &index, false),
            None,
            "the album waits"
        );
        let artist = SavedSelection {
            artist: Some("Z".into()),
            album: None,
            song: None,
        };
        assert_eq!(
            resolve_selection(&artist, &index, false),
            None,
            "the artist waits"
        );
        let all = SavedSelection::default();
        assert_eq!(
            resolve_selection(&all, &index, false),
            Some(ids(None, None, None))
        );
    }

    #[test]
    fn a_song_under_another_album_is_dropped() {
        let index = grouped(&[("X/A/1.mp3", "X", "A"), ("X/B/2.mp3", "X", "B")]);
        let saved = SavedSelection {
            artist: Some("X".into()),
            album: Some(SavedAlbum {
                artist: "X".into(),
                name: "A".into(),
            }),
            song: Some("X/B/2.mp3".into()),
        };
        assert_eq!(
            resolve_selection(&saved, &index, true),
            Some(named(&index, "X", Some(("X", "A")), None))
        );
        assert_eq!(
            resolve_selection(&saved, &index, false),
            Some(named(&index, "X", Some(("X", "A")), None))
        );
    }

    #[test]
    fn a_song_under_all_restores_in_each_shape() {
        let index = library();
        let song = id(&index, "X/A/2.mp3");
        let shapes = [(None, None), (Some("X"), None), (None, Some(("X", "A")))];
        for (artist, album) in shapes {
            let saved = SavedSelection {
                artist: artist.map(str::to_owned),
                album: album.map(|(a, n)| SavedAlbum {
                    artist: a.into(),
                    name: n.into(),
                }),
                song: Some("X/A/2.mp3".into()),
            };
            let resolved = resolve_selection(&saved, &index, true).unwrap();
            assert_eq!(
                resolved.artist,
                artist.and_then(|name| index.live_artist(name))
            );
            assert_eq!(
                resolved.album,
                album.and_then(|(a, n)| index.live_album(a, n))
            );
            assert_eq!(resolved.song, Some(song), "{artist:?} {album:?}");
        }
    }

    #[test]
    fn the_playing_selection_names_the_song_its_artist_and_its_album() {
        let mut index = library();
        let song = id(&index, "Y/C/1.mp3");
        assert_eq!(
            playing_selection(song, &index),
            Some(named(&index, "Y", Some(("Y", "C")), Some("Y/C/1.mp3")))
        );
        index.remove(song);
        assert_eq!(playing_selection(song, &index), None);
    }

    #[test]
    fn a_missing_corrupt_or_newer_file_starts_empty() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(load(dir.path()), None);
        std::fs::write(dir.path().join(STATE_FILE), "{ not json").unwrap();
        assert_eq!(load(dir.path()), None);
        let mut newer = state(&[], None, 0);
        newer.version = 2;
        save(dir.path(), &newer).unwrap();
        assert_eq!(load(dir.path()), None);
    }

    #[test]
    fn capture_and_resolve_give_back_the_queue_position_and_volume() {
        let index = index(&["A/a.mp3", "B/b.ogg", "C/c.wav"]);
        let ids = vec![id(&index, "C/c.wav"), id(&index, "A/a.mp3")];
        let saved = capture(&ids, Some(1), 5_000, 60, &index);
        assert_eq!(saved.queue, ["C/c.wav", "A/a.mp3"]);
        let restored = resolve(&saved, &index, false).unwrap();
        assert_eq!(restored.ids, ids);
        assert_eq!(restored.current, Some(1));
        assert_eq!(restored.position_ms, 5_000);
        assert_eq!(restored.volume, 60);
    }

    #[test]
    fn missing_entries_wait_for_a_complete_traversal_then_go() {
        let index = index(&["A/a.mp3", "C/c.wav"]);
        let saved = state(&["A/a.mp3", "B/gone.ogg", "C/c.wav"], Some(2), 9_000);
        assert_eq!(resolve(&saved, &index, false), None, "pending");
        let restored = resolve(&saved, &index, true).unwrap();
        assert_eq!(restored.ids, [id(&index, "A/a.mp3"), id(&index, "C/c.wav")]);
        assert_eq!(restored.current, Some(1));
        assert_eq!(restored.position_ms, 9_000, "the current entry stayed");
    }

    #[test]
    fn a_missing_current_entry_moves_to_the_next_at_position_0() {
        let index = index(&["A/a.mp3", "C/c.wav"]);
        let saved = state(&["A/a.mp3", "B/gone.ogg", "C/c.wav"], Some(1), 9_000);
        let restored = resolve(&saved, &index, true).unwrap();
        assert_eq!(restored.current, Some(1));
        assert_eq!(restored.ids[1], id(&index, "C/c.wav"));
        assert_eq!(restored.position_ms, 0);
        let last = state(&["A/a.mp3", "B/gone.ogg"], Some(1), 9_000);
        assert_eq!(resolve(&last, &index, true).unwrap().current, Some(0));
        let none = state(&["B/gone.ogg"], Some(0), 9_000);
        let empty = resolve(&none, &index, true).unwrap();
        assert!(empty.ids.is_empty());
        assert_eq!(empty.current, None);
    }

    #[test]
    fn capture_leaves_out_removed_tracks() {
        let mut index = index(&["A/a.mp3", "B/b.ogg"]);
        let a = id(&index, "A/a.mp3");
        let b = id(&index, "B/b.ogg");
        index.remove(a);
        let saved = capture(&[a, b], Some(0), 3_000, 80, &index);
        assert_eq!(saved.queue, ["B/b.ogg"]);
        assert_eq!(saved.current, None);
        assert_eq!(saved.position_ms, 0);
    }
}
