// Mocked IPC for the e2e build (P2.15). All mock code and data stay in tests/e2e/ (AGENTS.md Edits rule 9).
// The page URL picks the data: "?data=library" serves a small library, else the app starts empty.
import { mockConvertFileSrc, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import app from "./data/app.json";
import { library } from "./library-data";
import { createPlayer } from "./mock-player";

const params = new URLSearchParams(window.location.search);
const withLibrary = params.get("data") === "library";

/**
 * Mock settings. "?first=1" starts like a fresh profile and "?missing=1" with the music folder
 * missing (D30). The state persists over reloads.
 */
const SETTINGS_KEY = "e2e-settings";
const LAST_SCAN = { added: 12, removed: 1, skipped: 2 };
const settings = JSON.parse(
  sessionStorage.getItem(SETTINGS_KEY) ??
    JSON.stringify(
      params.get("first") === "1"
        ? {
            folderName: null,
            folderState: "none",
            onlineLookups: false,
            noticePending: true,
            portable: false,
            lastScan: null,
          }
        : {
            folderName: "music",
            folderState: params.get("missing") === "1" ? "missing" : "ready",
            onlineLookups: false,
            noticePending: false,
            portable: false,
            lastScan: LAST_SCAN,
          },
    ),
);

/** The saved layout persists over reloads like `layout.json` (P9). */
const LAYOUT_KEY = "e2e-layout";

function saveSettings(change: Record<string, unknown>) {
  Object.assign(settings, change);
  sessionStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  return settings;
}

function settingsCommand(command: string, args: Args): unknown {
  switch (command) {
    case "settings_get":
      return settings;
    case "set_online_lookups":
      return saveSettings({ onlineLookups: args.on });
    case "first_run_notice_done":
      return saveSettings({ noticePending: false });
    case "choose_music_folder":
      return saveSettings({ folderName: "music", folderState: "ready" });
    case "rescan":
      document.body.dataset.rescans = String(Number(document.body.dataset.rescans ?? 0) + 1);
      return null;
    case "layout_load":
      return sessionStorage.getItem(LAYOUT_KEY);
    case "layout_save":
      // Tests read the saves from the page and the next load restores the last one (P9).
      sessionStorage.setItem(LAYOUT_KEY, args.json as string);
      document.body.dataset.layoutSaves = String(Number(document.body.dataset.layoutSaves ?? 0) + 1);
      return null;
    case "plugin:window|destroy":
      document.body.dataset.destroyed = "true";
      return null;
    case "cancel_job":
    case "open_log_folder":
    case "open_notice":
      return null;
  }
  return undefined;
}

type Args = Record<string, unknown>;

const player = withLibrary
  ? createPlayer(structuredClone(library.queue), structuredClone(library.player))
  : createPlayer(
      { entries: [], current: null },
      { status: "stopped", positionMs: 0, volume: 100, shuffle: false, repeat: "off" },
    );

function libraryCommand(command: string, args: Args): unknown {
  if (!withLibrary) {
    switch (command) {
      case "library_artists":
      case "library_artist_rows":
      case "library_albums":
      case "library_album_rows":
      case "library_song_ids":
      case "library_tree":
      case "library_rows":
      case "playlists_list":
        return [];
      case "lyrics_get":
      case "album_art":
        return null;
    }
  }
  switch (command) {
    case "library_artists":
      return library.artists(args.query as string).map((artist) => artist.id);
    case "library_artist_rows":
      return library.artistRows(args.ids as number[]);
    case "library_albums":
      return library.albums(args.artist as number | null, args.query as string).map((album) => album.id);
    case "library_album_rows":
      return library.albumRows(args.ids as number[]);
    case "library_song_ids":
      return library.songIds(args.scope as { artist: number | null; album: number | null }, args.query as string);
    case "library_rows":
      return library.rows(args.ids as number[]);
    case "library_tree":
      return library.tree(args.query as string);
    case "album_art":
      return "album.jpg";
    case "playlists_list":
      return library.playlists.map(([row]) => row);
    case "playlist_entries":
      return library.playlists[args.id as number]?.[1] ?? [];
    case "lyrics_get":
      return library.lyrics;
  }
  throw new Error(`e2e: no mock for command ${command}`);
}

mockWindows("main");
mockConvertFileSrc("linux");
// The browser cannot load thumb:// URLs, so they map to the test thumbnails in tests/e2e/public/.
(
  window as unknown as { __TAURI_INTERNALS__: { convertFileSrc: (path: string, protocol?: string) => string } }
).__TAURI_INTERNALS__.convertFileSrc = (path, protocol = "asset") => `/${protocol}/${path}`;
mockIPC(
  (command, args) => {
    switch (command) {
      case "plugin:app|name":
        return app.name;
      case "plugin:app|version":
        return app.version;
      case "measure_mode":
        return new URLSearchParams(window.location.search).get("measure");
      case "scan_running":
      case "perf_mode":
        return false;
      case "measure_ready":
        document.body.dataset.measureReady = "true";
        return null;
      case "plugin:log|log":
        return 0;
      default: {
        // A settings command that returns null is handled; only undefined falls through.
        const input = (args ?? {}) as Args;
        const setting = settingsCommand(command, input);
        if (setting !== undefined) return setting;
        const played = player(command, input);
        return played !== undefined ? played : libraryCommand(command, input);
      }
    }
  },
  { shouldMockEvents: true },
);
