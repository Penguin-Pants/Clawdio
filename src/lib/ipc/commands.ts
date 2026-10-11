// Typed command wrappers (section 6.7). Types come from the Rust structs (D15).
import { invoke } from "@tauri-apps/api/core";
import type { AlbumRow } from "./bindings/AlbumRow";
import type { ArtistRow } from "./bindings/ArtistRow";
import type { FolderState } from "./bindings/FolderState";
import type { JobProgress } from "./bindings/JobProgress";
import type { LibraryMode } from "./bindings/LibraryMode";
import type { Lyrics } from "./bindings/Lyrics";
import type { PlayerEvent } from "./bindings/PlayerEvent";
import type { PlayerSnapshot } from "./bindings/PlayerSnapshot";
import type { PlaylistEntry } from "./bindings/PlaylistEntry";
import type { PlaylistRow } from "./bindings/PlaylistRow";
import type { QueueSnapshot } from "./bindings/QueueSnapshot";
import type { SettingsView } from "./bindings/SettingsView";
import type { SongRow } from "./bindings/SongRow";
import type { SongScope } from "./bindings/SongScope";
import type { TreeArtist } from "./bindings/TreeArtist";

export type { AlbumRow, ArtistRow, LibraryMode, Lyrics, PlayerSnapshot, PlaylistEntry, PlaylistRow };
export type { FolderState, JobProgress, PlayerEvent, QueueSnapshot, SettingsView, SongRow, SongScope, TreeArtist };

export const commands = {
  libraryArtists: (query: string) => invoke<number[]>("library_artists", { query }),
  libraryArtistRows: (ids: number[]) => invoke<ArtistRow[]>("library_artist_rows", { ids }),
  libraryAlbums: (artist: number | null, query: string) => invoke<number[]>("library_albums", { artist, query }),
  libraryAlbumRows: (ids: number[]) => invoke<AlbumRow[]>("library_album_rows", { ids }),
  librarySongIds: (scope: SongScope, query: string) => invoke<number[]>("library_song_ids", { scope, query }),
  libraryRows: (ids: number[]) => invoke<SongRow[]>("library_rows", { ids }),
  libraryTree: (query: string) => invoke<TreeArtist[]>("library_tree", { query }),
  albumArt: (track: number) => invoke<string | null>("album_art", { track }),
  queueGet: () => invoke<QueueSnapshot>("queue_get"),
  playerState: () => invoke<PlayerSnapshot>("player_state"),
  playlistsList: () => invoke<PlaylistRow[]>("playlists_list"),
  playlistEntries: (id: number) => invoke<PlaylistEntry[]>("playlist_entries", { id }),
  lyricsGet: (track: number) => invoke<Lyrics | null>("lyrics_get", { track }),
  playerPlayList: (ids: number[], start: number) => invoke<void>("player_play_list", { ids, start }),
  playerToggle: () => invoke<void>("player_toggle"),
  playerStop: () => invoke<void>("player_stop"),
  settingsGet: () => invoke<SettingsView>("settings_get"),
  setOnlineLookups: (on: boolean) => invoke<SettingsView>("set_online_lookups", { on }),
  firstRunNoticeDone: () => invoke<SettingsView>("first_run_notice_done"),
  chooseMusicFolder: () => invoke<SettingsView>("choose_music_folder"),
  cancelJob: (id: string) => invoke<void>("cancel_job", { id }),
  openLogFolder: () => invoke<void>("open_log_folder"),
  openNotice: () => invoke<void>("open_notice"),
  measureMode: () => invoke<LibraryMode | null>("measure_mode"),
  measureReady: () => invoke<void>("measure_ready"),
};
