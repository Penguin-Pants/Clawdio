// Typed command wrappers (section 6.7). Types come from the Rust structs (D15).
import { invoke } from "@tauri-apps/api/core";
import type { AlbumRow } from "./bindings/AlbumRow";
import type { ArtistRow } from "./bindings/ArtistRow";
import type { FolderState } from "./bindings/FolderState";
import type { JobProgress } from "./bindings/JobProgress";
import type { LibraryMode } from "./bindings/LibraryMode";
import type { Lyrics } from "./bindings/Lyrics";
import type { MetadataPreview } from "./bindings/MetadataPreview";
import type { MicDucking } from "./bindings/MicDucking";
import type { PlayerSnapshot } from "./bindings/PlayerSnapshot";
import type { PlaylistEntry } from "./bindings/PlaylistEntry";
import type { PlaylistRow } from "./bindings/PlaylistRow";
import type { QueueSnapshot } from "./bindings/QueueSnapshot";
import type { ImportBatch } from "./bindings/ImportBatch";
import type { ImportReport } from "./bindings/ImportReport";
import type { RepairBatch } from "./bindings/RepairBatch";
import type { RepairReport } from "./bindings/RepairReport";
import type { RepeatMode } from "./bindings/RepeatMode";
import type { SettingsView } from "./bindings/SettingsView";
import type { SongRow } from "./bindings/SongRow";
import type { SongScope } from "./bindings/SongScope";
import type { SortColumn } from "./bindings/SortColumn";
import type { SortKey } from "./bindings/SortKey";
import type { TreeArtist } from "./bindings/TreeArtist";

export type { AlbumRow, ArtistRow, ImportReport, LibraryMode, Lyrics, PlayerSnapshot, PlaylistEntry, PlaylistRow };
export type { FolderState, JobProgress, QueueSnapshot, RepeatMode, SettingsView, SongRow, SongScope, TreeArtist };
export type { ImportBatch, MetadataPreview, MicDucking, RepairBatch, RepairReport, SortColumn, SortKey };

export const commands = {
  libraryArtists: (query: string) => invoke<number[]>("library_artists", { query }),
  libraryArtistRows: (ids: number[]) => invoke<ArtistRow[]>("library_artist_rows", { ids }),
  libraryAlbums: (artist: number | null, query: string) => invoke<number[]>("library_albums", { artist, query }),
  libraryAlbumRows: (ids: number[]) => invoke<AlbumRow[]>("library_album_rows", { ids }),
  /** Song ids in the R4 order, or sorted by up to two keys in Rust (UD11, D14). */
  librarySongIds: (scope: SongScope, query: string, sort: SortKey[] = []) =>
    invoke<number[]>("library_song_ids", { scope, query, sort }),
  libraryRows: (ids: number[]) => invoke<SongRow[]>("library_rows", { ids }),
  libraryTree: (query: string) => invoke<TreeArtist[]>("library_tree", { query }),
  /** The art file name of an album at 96 or 512 px, or null while it is made (P10.2). */
  albumArt: (album: number, size: 96 | 512) => invoke<string | null>("album_art", { album, size }),
  /** "Set cover" (P10.4): false when the user cancels. */
  setCover: (album: number) => invoke<boolean>("set_cover", { album }),
  /** "Fill missing metadata" (P16): the preview, or null when nothing was found. Writes nothing. */
  metadataPreview: (album: number) => invoke<MetadataPreview | null>("metadata_preview", { album }),
  /** Confirm of the metadata preview (P16.5): writes the album's sidecar. */
  metadataApply: (album: number) => invoke<null>("metadata_apply", { album }),
  /** "Retry lookup" (P14.7): clears the marker and looks the album up; the result is a status message. */
  albumRetryLookup: (album: number) => invoke<null>("album_retry_lookup", { album }),
  queueGet: () => invoke<QueueSnapshot>("queue_get"),
  /** The saved `layout.json` text, or null (P9.2). */
  layoutLoad: () => invoke<string | null>("layout_load"),
  layoutSave: (json: string) => invoke<void>("layout_save", { json }),
  /** Backs up a `layout.json` that failed validation as `layout.json.bak` (PS-4, UD5). */
  layoutBackup: () => invoke<void>("layout_backup"),
  /** The saved `columns.json` text, or null (PS-6, UD13). */
  columnsLoad: () => invoke<string | null>("columns_load"),
  columnsSave: (json: string) => invoke<void>("columns_save", { json }),
  /** Backs up a `columns.json` that failed validation as `columns.json.bak`. */
  columnsBackup: () => invoke<void>("columns_backup"),
  playerState: () => invoke<PlayerSnapshot>("player_state"),
  playlistsList: () => invoke<PlaylistRow[]>("playlists_list"),
  playlistEntries: (id: number) => invoke<PlaylistEntry[]>("playlist_entries", { id }),
  /** The message for a new playlist name, or null when it is valid (R12, D21). */
  playlistNameCheck: (name: string) => invoke<string | null>("playlist_name_check", { name }),
  playlistCreate: (name: string) => invoke<number>("playlist_create", { name }),
  playlistAdd: (id: number, tracks: number[]) => invoke<void>("playlist_add", { id, tracks }),
  playlistRemoveEntry: (id: number, index: number) => invoke<void>("playlist_remove_entry", { id, index }),
  playlistDelete: (id: number) => invoke<void>("playlist_delete", { id }),
  /** The heart (R26): true when the track is a favorite now. */
  favoriteToggle: (track: number) => invoke<boolean>("favorite_toggle", { track }),
  favorites: () => invoke<number[]>("favorites"),
  /** "Import playlist" (P12.6, R32): Rust opens a multi-file picker. Null when the user cancels. */
  playlistImport: () => invoke<ImportBatch | null>("playlist_import"),
  /** "Import folder" (R32): Rust opens a folder picker. Null when the user cancels. */
  playlistImportFolder: () => invoke<ImportBatch | null>("playlist_import_folder"),
  /** "Find missing songs" on one playlist (R33.3). */
  playlistFindMissing: (id: number) => invoke<RepairBatch>("playlist_find_missing", { id }),
  /** "Find missing songs in all playlists" (R33.3). */
  playlistFindMissingAll: () => invoke<RepairBatch>("playlist_find_missing_all"),
  lyricsGet: (track: number) => invoke<Lyrics | null>("lyrics_get", { track }),
  /** "Fetch lyrics" (P15): true when lyrics were saved; they arrive by `lyrics-changed`. */
  lyricsFetch: (track: number) => invoke<boolean>("lyrics_fetch", { track }),
  playerPlayList: (ids: number[], start: number) => invoke<void>("player_play_list", { ids, start }),
  playerToggle: () => invoke<void>("player_toggle"),
  playerStop: () => invoke<void>("player_stop"),
  playerNext: () => invoke<void>("player_next"),
  playerPrevious: () => invoke<void>("player_previous"),
  playerSeek: (ms: number) => invoke<void>("player_seek", { ms }),
  playerSetVolume: (volume: number) => invoke<void>("player_set_volume", { volume }),
  playerSetShuffle: (on: boolean) => invoke<void>("player_set_shuffle", { on }),
  playerSetRepeat: (mode: RepeatMode) => invoke<void>("player_set_repeat", { mode }),
  queueAppend: (ids: number[]) => invoke<void>("queue_append", { ids }),
  queueRemove: (index: number) => invoke<void>("queue_remove", { index }),
  queueClear: () => invoke<void>("queue_clear"),
  settingsGet: () => invoke<SettingsView>("settings_get"),
  setOnlineLookups: (on: boolean) => invoke<SettingsView>("set_online_lookups", { on }),
  /** "When the microphone is in use" (R34.1). */
  setMicDucking: (mode: MicDucking) => invoke<SettingsView>("set_mic_ducking", { mode }),
  /** The ducked volume, 5 to 90 in steps of 5 (R34.3). */
  setMicDuckPercent: (percent: number) => invoke<SettingsView>("set_mic_duck_percent", { percent }),
  firstRunNoticeDone: () => invoke<SettingsView>("first_run_notice_done"),
  chooseMusicFolder: () => invoke<SettingsView>("choose_music_folder"),
  rescan: () => invoke<void>("rescan"),
  cancelJob: (id: string) => invoke<void>("cancel_job", { id }),
  openLogFolder: () => invoke<void>("open_log_folder"),
  openNotice: () => invoke<void>("open_notice"),
  measureMode: () => invoke<LibraryMode | null>("measure_mode"),
  measureReady: () => invoke<void>("measure_ready"),
  scanRunning: () => invoke<boolean>("scan_running"),
  perfMode: () => invoke<boolean>("perf_mode"),
  /** Enters or leaves the mini player with the compact band height in logical px (UD19). */
  windowSetMini: (on: boolean, height: number) => invoke<void>("window_set_mini", { on, height }),
};
