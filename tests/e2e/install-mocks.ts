// Mocked IPC for the e2e build (P2.15). All mock code and data stay in tests/e2e/ (AGENTS.md Edits rule 9).
// The page URL picks the data: "?data=library" serves a small library, else the app starts empty.
import { mockConvertFileSrc, mockIPC } from "@tauri-apps/api/mocks";
import app from "./data/app.json";
import { library } from "./library-data";

const withLibrary = new URLSearchParams(window.location.search).get("data") === "library";

type Args = Record<string, unknown>;

function libraryCommand(command: string, args: Args): unknown {
  if (!withLibrary) {
    switch (command) {
      case "library_artists":
      case "library_albums":
      case "library_song_ids":
      case "library_tree":
      case "library_rows":
      case "playlists_list":
        return [];
      case "queue_get":
        return { entries: [], current: null };
      case "player_state":
        return { status: "stopped", positionMs: 0, volume: 100 };
      case "lyrics_get":
      case "album_art":
        return null;
    }
  }
  switch (command) {
    case "library_artists":
      return library.artists(args.query as string);
    case "library_albums":
      return library.albums(args.artist as number | null, args.query as string);
    case "library_song_ids":
      return library.songIds(args.scope as { artist: number | null; album: number | null }, args.query as string);
    case "library_rows":
      return library.rows(args.ids as number[]);
    case "library_tree":
      return library.tree(args.query as string);
    case "album_art":
      return null;
    case "queue_get":
      return library.queue;
    case "player_state":
      return library.player;
    case "playlists_list":
      return library.playlists.map(([row]) => row);
    case "playlist_entries":
      return library.playlists[args.id as number]?.[1] ?? [];
    case "lyrics_get":
      return library.lyrics;
  }
  throw new Error(`e2e: no mock for command ${command}`);
}

mockConvertFileSrc("linux");
mockIPC((command, args) => {
  switch (command) {
    case "plugin:app|name":
      return app.name;
    case "plugin:app|version":
      return app.version;
    case "measure_mode":
      return new URLSearchParams(window.location.search).get("measure");
    default:
      return libraryCommand(command, (args ?? {}) as Args);
  }
});
