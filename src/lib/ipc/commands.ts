// Typed command wrappers (section 6.7). Types come from the Rust structs (D15).
import { invoke } from "@tauri-apps/api/core";
import type { AlbumRow } from "./bindings/AlbumRow";
import type { ArtistRow } from "./bindings/ArtistRow";
import type { FolderState } from "./bindings/FolderState";
import type { JobProgress } from "./bindings/JobProgress";
import type { LibraryMode } from "./bindings/LibraryMode";
import type { Lyrics } from "./bindings/Lyrics";
import type { PlayerSnapshot } from "./bindings/PlayerSnapshot";
import type { PlaylistEntry } from "./bindings/PlaylistEntry";
import type { PlaylistRow } from "./bindings/PlaylistRow";
import type { QueueSnapshot } from "./bindings/QueueSnapshot";
import type { RepeatMode } from "./bindings/RepeatMode";
import type { SettingsView } from "./bindings/SettingsView";
import type { SongRow } from "./bindings/SongRow";
import type { SongScope } from "./bindings/SongScope";
import type { TreeArtist } from "./bindings/TreeArtist";

export type { AlbumRow, ArtistRow, LibraryMode, Lyrics, PlayerSnapshot, PlaylistEntry, PlaylistRow };
export type { FolderState, JobProgress, QueueSnapshot, RepeatMode, SettingsView, SongRow, SongScope, TreeArtist };

export const commands = {
  libraryArtists: (query: string) => invoke<number[]>("library_artists", { query }),
  libraryArtistRows: (ids: number[]) => invoke<ArtistRow[]>("library_artist_rows", { ids }),
  libraryAlbums: (artist: number | null, query: string) => invoke<number[]>("library_albums", { artist, query }),
  libraryAlbumRows: (ids: number[]) => invoke<AlbumRow[]>("library_album_rows", { ids }),
  librarySongIds: (scope: SongScope, query: string) => invoke<number[]>("library_song_ids", { scope, query }),
  libraryRows: (ids: number[]) => invoke<SongRow[]>("library_rows", { ids }),
  libraryTree: (query: string) => invoke<TreeArtist[]>("library_tree", { query }),
  /** The art file name of an album at 96 or 512 px, or null while it is made (P10.2). */
  albumArt: (album: number, size: 96 | 512) => invoke<string | null>("album_art", { album, size }),
  /** "Set cover" (P10.4): false when the user cancels. */
  setCover: (album: number) => invoke<boolean>("set_cover", { album }),
  queueGet: () => invoke<QueueSnapshot>("queue_get"),
  /** The saved `layout.json` text, or null (P9.2). */
  layoutLoad: () => invoke<string | null>("layout_load"),
  layoutSave: (json: string) => invoke<void>("layout_save", { json }),
  playerState: () => invoke<PlayerSnapshot>("player_state"),
  playlistsList: () => invoke<PlaylistRow[]>("playlists_list"),
  playlistEntries: (id: number) => invoke<PlaylistEntry[]>("playlist_entries", { id }),
  lyricsGet: (track: number) => invoke<Lyrics | null>("lyrics_get", { track }),
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
};
