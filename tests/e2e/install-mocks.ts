// Mocked IPC for the e2e build (P2.15). All mock code and data stay in tests/e2e/ (AGENTS.md Edits rule 9).
// The page URL picks the data: "?data=library" serves a small library, else the app starts empty.
import { emit } from "@tauri-apps/api/event";
import { mockConvertFileSrc, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import app from "./data/app.json";
import { library } from "./library-data";
import { createPlayer } from "./mock-player";
import { createPlaylists } from "./mock-playlists";

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
            micDucking: "off",
            micDuckPercent: 20,
            micDuckingSupported: params.get("linux") !== "1",
          }
        : {
            folderName: "music",
            folderState: params.get("missing") === "1" ? "missing" : "ready",
            onlineLookups: false,
            noticePending: false,
            portable: false,
            lastScan: LAST_SCAN,
            micDucking: "off",
            micDuckPercent: 20,
            micDuckingSupported: params.get("linux") !== "1",
          },
    ),
);

const playlists = createPlaylists(withLibrary ? structuredClone(library.playlists) : []);

/** The album whose art is made after the first request (Album B5). */
const PENDING_ART = 16;
let pendingArtMade = false;

/** The lyrics every song has: the test text, or null for "no source" (P13-AC5). */
let lyrics: typeof library.lyrics | null = library.lyrics;
/** Changes the lyrics of every song and sends `lyrics-changed`, like a Rescan (P13.3). */
export function setLyrics(value: typeof library.lyrics | null): Promise<void> {
  lyrics = value;
  return emit("lyrics-changed");
}

/** Changes the tags of one song and sends `library-changed`, like a Rescan (R4). */
export function retagSong(title: string, change: { title?: string; durationMs?: number }): Promise<void> {
  if (!library.retag(title, change)) throw new Error(`no song ${title}`);
  return emit("library-changed");
}

/** The saved layout persists over reloads like `layout.json` (P9). */
const LAYOUT_KEY = "e2e-layout";

function saveSettings(change: Record<string, unknown>) {
  Object.assign(settings, change);
  sessionStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  // The real IPC gives a new object each time; the stores see a change only then.
  return { ...settings };
}

function settingsCommand(command: string, args: Args): unknown {
  switch (command) {
    case "settings_get":
      return { ...settings };
    case "set_online_lookups":
      return saveSettings({ onlineLookups: args.on });
    case "set_mic_ducking":
      return saveSettings({ micDucking: args.mode });
    case "set_mic_duck_percent":
      return saveSettings({ micDuckPercent: args.percent });
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
    case "layout_backup": {
      // Like the Rust rename (UD5): the bad file moves to the backup key.
      const text = sessionStorage.getItem(LAYOUT_KEY);
      if (text !== null) sessionStorage.setItem(`${LAYOUT_KEY}.bak`, text);
      sessionStorage.removeItem(LAYOUT_KEY);
      document.body.dataset.layoutBackups = String(Number(document.body.dataset.layoutBackups ?? 0) + 1);
      return null;
    }
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
    case "album_art": {
      // Tests count the art requests (P10-AC7).
      const calls = JSON.parse(document.body.dataset.artRequests ?? "[]") as number[];
      calls.push(args.album as number);
      document.body.dataset.artRequests = JSON.stringify(calls);
      // Album B5 is not made yet on the first request: art-ready follows (P10.2).
      if (args.album === PENDING_ART && !pendingArtMade) {
        setTimeout(() => {
          pendingArtMade = true;
          void emit("art-ready", PENDING_ART);
        }, 300);
        return null;
      }
      return library.art(args.album as number);
    }
    case "set_cover":
      document.body.dataset.setCover = String(args.album);
      // Album C0 stands for a read-only album folder (P10-AC5).
      if (args.album === 2) throw { code: "set_cover", message: "The album folder is read-only" };
      return true;
    case "lyrics_get":
      return lyrics;
    case "lyrics_fetch":
      if (!settings.onlineLookups) throw { code: "lyrics_fetch", message: "Online lookups are off" };
      document.body.dataset.lyricsFetch = String(args.track);
      void setLyrics({ text: "Fetched line one\nFetched line two" });
      void emit("status-message", "Lyrics saved");
      return true;
    case "metadata_preview":
      if (!settings.onlineLookups) throw { code: "metadata", message: "Online lookups are off" };
      return {
        album: "Album B0",
        corruptSidecar: args.album === 2,
        rows: [
          { song: "01 Song.mp3", field: "title", value: "Real Title" },
          { song: "01 Song.mp3", field: "year", value: "1973" },
        ],
      };
    case "metadata_apply":
      document.body.dataset.metadataApply = String(args.album);
      void emit("status-message", "Metadata saved");
      return null;
    case "album_retry_lookup":
      document.body.dataset.retryLookup = String(args.album);
      return null;
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
        // Kept for the checks that read the app log (P23-AC5).
        (window.e2eLog ??= []).push(String((args as { message?: unknown } | undefined)?.message ?? ""));
        return 0;
      default: {
        // A settings command that returns null is handled; only undefined falls through.
        const input = (args ?? {}) as Args;
        const setting = settingsCommand(command, input);
        if (setting !== undefined) return setting;
        const played = player(command, input);
        if (played !== undefined) return played;
        const listed = playlists(command, input);
        return listed !== undefined ? listed : libraryCommand(command, input);
      }
    }
  },
  { shouldMockEvents: true },
);
