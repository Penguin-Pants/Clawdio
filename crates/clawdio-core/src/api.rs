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
    /// Entries with no library track, for "Find missing songs" (R33.3).
    pub missing_count: u32,
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

/// A missing entry in an import or repair report. The label is a title or a file name, not a path (D13).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MissingImport {
    pub label: String,
    pub reason: MissingReason,
}

/// What an import did with one source playlist (R32, D51).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ImportStatus {
    Imported,
    /// A playlist with this name exists: nothing was written.
    Skipped,
    /// The source cannot be read or the playlist cannot be written.
    Failed,
}

/// The report of one source playlist (P12.5, R32).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ImportReport {
    /// The name of the new playlist; for a skipped or failed playlist the cleaned source name;
    /// for a file that cannot be read the file name. Never a path (D13).
    pub playlist: String,
    pub status: ImportStatus,
    pub matched: u32,
    pub missing: Vec<MissingImport>,
    /// Why the source failed (no file was written), or null.
    pub error: Option<String>,
}

/// The combined report of one import action (R32): each source in path order.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ImportBatch {
    /// The prerequisite scan was canceled or failed: nothing changed (R33.1).
    pub canceled: bool,
    pub reports: Vec<ImportReport>,
}

/// The repair report of one playlist (R33.5).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RepairReport {
    pub playlist: String,
    /// Entries replaced by a unique match.
    pub fixed: u32,
    /// Entries still missing, with the reason (not found or more than one match).
    pub missing: Vec<MissingImport>,
    /// Why the playlist was not changed (read or write failure), or null.
    pub error: Option<String>,
}

/// The combined report of "Find missing songs" (R33.3, R33.5).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RepairBatch {
    /// The prerequisite scan was canceled or failed: nothing changed (R33.1).
    pub canceled: bool,
    pub reports: Vec<RepairReport>,
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

/// A field that "Fill missing metadata" can propose (P16.4, R10).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum MetadataField {
    Title,
    Track,
    Year,
}

/// One proposed value: the song (its name inside the album folder), the field and the value.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MetadataRow {
    pub song: String,
    pub field: MetadataField,
    pub value: String,
}

/// The preview of "Fill missing metadata" (P16.4). Nothing is written before Confirm.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MetadataPreview {
    /// The album folder name, for the dialog title.
    pub album: String,
    pub rows: Vec<MetadataRow>,
    /// The album's `sidecar.json` is corrupt and Confirm replaces it.
    pub corrupt_sidecar: bool,
}
