//! IPC structs. `cargo test` exports them as TypeScript types (D15).

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Name and version of the running app.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
}

/// The error shape of every command (section 6.14).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
pub struct IpcError {
    pub code: String,
    pub message: String,
}

impl From<crate::error::CoreError> for IpcError {
    fn from(error: crate::error::CoreError) -> Self {
        IpcError {
            code: error.code().to_owned(),
            message: error.to_string(),
        }
    }
}

/// Library widget modes (R28).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum LibraryMode {
    Tree,
    Columns,
    TopBottom,
}

impl LibraryMode {
    /// Parses the mode names the frontend uses (`tree`, `columns`, `topBottom`).
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "tree" => Some(Self::Tree),
            "columns" => Some(Self::Columns),
            "topBottom" => Some(Self::TopBottom),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ArtistRow {
    pub id: u32,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AlbumRow {
    pub id: u32,
    pub artist_id: u32,
    pub name: String,
    pub artist_name: String,
    /// Thumbnail file name, loaded through the `thumb://` scheme (D41). Null when none exists.
    pub thumb: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SongRow {
    pub id: u32,
    pub artist_id: u32,
    pub album_id: u32,
    pub title: String,
    pub artist_name: String,
    pub album_name: String,
    /// The tag artist, when it differs from the folder artist (R5).
    pub tag_artist: Option<String>,
    pub duration_ms: u32,
}

/// The Songs list scope: a selected artist and album, or none for "All" (R28).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SongScope {
    pub artist: Option<u32>,
    pub album: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TreeAlbum {
    pub id: u32,
    pub name: String,
    pub songs: Vec<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TreeArtist {
    pub id: u32,
    pub name: String,
    pub albums: Vec<TreeAlbum>,
}

/// The play queue: track ids in queue order and the index of the current entry.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct QueueSnapshot {
    pub entries: Vec<u32>,
    pub current: Option<u32>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum PlayerStatus {
    #[default]
    Stopped,
    Playing,
    Paused,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PlayerSnapshot {
    pub status: PlayerStatus,
    pub position_ms: u32,
    /// Volume from 0 to 100.
    pub volume: u8,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PlaylistRow {
    pub id: u32,
    pub name: String,
    pub entry_count: u32,
}

/// A playlist entry: a library track, or a missing file shown by its label (R13).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PlaylistEntry {
    pub track: Option<u32>,
    pub label: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Lyrics {
    pub text: String,
}
