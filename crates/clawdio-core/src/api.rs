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
    pub shuffle: bool,
    pub repeat: RepeatMode,
}

/// Repeat modes (R6).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum RepeatMode {
    #[default]
    Off,
    All,
    One,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PlaylistRow {
    pub id: u32,
    pub name: String,
    /// The file name, for the delete confirmation. Not a path (D13).
    pub file_name: String,
    pub entry_count: u32,
    /// `Playlists/Favorites.m3u8`, which Add to playlist leaves out (D20).
    pub is_favorites: bool,
}

/// Why an imported entry is missing (P12.5).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum MissingReason {
    NotFound,
    Ambiguous,
    /// A track with no file location (Apple XML): in the report only, not in the file.
    NoLocation,
}

/// A missing entry in an import report. The label is a title or a file name, not a path (D13).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MissingImport {
    pub label: String,
    pub reason: MissingReason,
}

/// The report of one imported playlist (P12.5).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ImportReport {
    /// The name of the new playlist.
    pub playlist: String,
    pub matched: u32,
    pub missing: Vec<MissingImport>,
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

/// The music folder state for the Library body and Settings (R1.1, section 5).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum FolderState {
    /// No folder chosen yet (R1.1).
    None,
    Ready,
    /// The stored folder does not exist (section 5, D30).
    Missing,
}

/// What Settings and the first-run flow show.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SettingsView {
    /// The music folder's own name for display, never its path (D13).
    pub folder_name: Option<String>,
    pub folder_state: FolderState,
    pub online_lookups: bool,
    /// The first-run notice is still to be answered (R7).
    pub notice_pending: bool,
    pub portable: bool,
    /// Counts of the last scan (R2), shown in Settings.
    pub last_scan: Option<ScanCounts>,
}

/// The counts of a finished scan (R2): the status line and Settings show them.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ScanCounts {
    pub added: u32,
    pub removed: u32,
    pub skipped: u32,
}

/// A running job for the status line (R5).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct JobProgress {
    pub id: String,
    /// Progress text, or null when the job ended.
    pub text: Option<String>,
    pub cancelable: bool,
}
