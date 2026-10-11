//! `state.json` (P9.1, R27, D25): the queue as paths relative to the music folder, the
//! current entry, the position and the volume. Shuffle and repeat are not saved.

use std::path::Path;

use serde::{Deserialize, Serialize};

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
/// out, and the current index follows.
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
