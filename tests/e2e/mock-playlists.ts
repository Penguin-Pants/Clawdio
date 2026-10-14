// Editable mock playlists for the e2e build (P11, P19): the same commands and events as Rust.
// "Read only" stands for a playlist in a read-only folder (P11-AC10). `data-cancel-scan` on the
// body stands for a canceled prerequisite scan (R33.1).
import { emit } from "@tauri-apps/api/event";
import type { PlaylistEntry } from "../../src/lib/ipc/bindings/PlaylistEntry";
import type { PlaylistRow } from "../../src/lib/ipc/bindings/PlaylistRow";
import type { RepairReport } from "../../src/lib/ipc/bindings/RepairReport";

type Args = Record<string, unknown>;

const FAVORITES = "Favorites";
const READ_ONLY = "Read only";
const WRITE_ERROR = { code: "playlist", message: "The playlist file cannot be written. The folder may be read-only" };

export function createPlaylists(start: [PlaylistRow, PlaylistEntry[]][]) {
  const lists = start.map(([row, entries]) => ({ id: row.id, name: row.name, entries: [...entries] }));
  let nextId = Math.max(0, ...lists.map((list) => list.id)) + 1;
  const changed = () => void emit("playlists-changed", null);
  const find = (id: unknown) => {
    const list = lists.find((candidate) => candidate.id === id);
    if (!list) throw { code: "unknown_id", message: `unknown playlist id ${String(id)}` };
    return list;
  };
  const writable = (list: { name: string }) => {
    if (list.name === READ_ONLY) throw WRITE_ERROR;
  };
  const nameProblem = (name: string): string | null => {
    if (name === "") return "Enter a name";
    if (/[/\\]/.test(name)) return "A name cannot contain / or \\";
    if (name.toLowerCase() === FAVORITES.toLowerCase()) return "Favorites is the heart's playlist";
    if (lists.some((list) => list.name.toLowerCase() === name.toLowerCase())) return "A playlist with this name exists";
    return null;
  };
  const favorites = () => lists.find((list) => list.name === FAVORITES);
  const sorted = () =>
    [...lists].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  const canceled = () => document.body.dataset.cancelScan === "1";
  const missingCount = (list: { entries: PlaylistEntry[] }) => list.entries.filter((e) => e.track === null).length;
  /** Every missing entry whose label names "Song" is found as track 0; the others stay. */
  const repair = (list: (typeof lists)[number]): RepairReport => {
    try {
      writable(list);
    } catch {
      return { playlist: list.name, fixed: 0, missing: [], error: WRITE_ERROR.message };
    }
    let fixed = 0;
    const missing: RepairReport["missing"] = [];
    list.entries = list.entries.map((entry) => {
      if (entry.track !== null) return entry;
      if (entry.label.includes("Song")) {
        fixed += 1;
        return { track: 0, label: "" };
      }
      missing.push({ label: entry.label, reason: "ambiguous" });
      return entry;
    });
    return { playlist: list.name, fixed, missing, error: null };
  };
  const add = (name: string, entries: PlaylistEntry[]) => {
    lists.push({ id: nextId, name, entries });
    nextId += 1;
  };
  const commands: Record<string, (args: Args) => unknown> = {
    playlists_list: () =>
      sorted().map((list) => ({
        id: list.id,
        name: list.name,
        fileName: `${list.name}.m3u8`,
        entryCount: list.entries.length,
        isFavorites: list.name === FAVORITES,
        missingCount: missingCount(list),
      })),
    playlist_entries: ({ id }) => {
      if (window.e2eFailEntries) throw { code: "playlist", message: "Cannot read the playlist" };
      const entries = [...find(id).entries];
      return window.e2eSlowEntries ? new Promise((resolve) => setTimeout(() => resolve(entries), 800)) : entries;
    },
    playlist_name_check: ({ name }) => nameProblem(name as string),
    playlist_create: ({ name }) => {
      const problem = nameProblem(name as string);
      if (problem) throw { code: "playlist", message: problem };
      const add = () => {
        lists.push({ id: nextId, name: name as string, entries: [] });
        nextId += 1;
        changed();
        return nextId - 1;
      };
      // "Slow" holds the answer, so a test can submit again while the first create runs.
      return name === "Slow" ? new Promise((resolve) => setTimeout(() => resolve(add()), 300)) : add();
    },
    playlist_add: ({ id, tracks }) => {
      const list = find(id);
      writable(list);
      list.entries.push(...(tracks as number[]).map((track) => ({ track, label: "" })));
      changed();
      return null;
    },
    playlist_remove_entry: ({ id, index }) => {
      const list = find(id);
      writable(list);
      list.entries.splice(index as number, 1);
      changed();
      return null;
    },
    playlist_delete: ({ id }) => {
      lists.splice(lists.indexOf(find(id)), 1);
      changed();
      return null;
    },
    favorite_toggle: ({ track }) => {
      let list = favorites();
      if (!list) {
        list = { id: nextId, name: FAVORITES, entries: [] };
        nextId += 1;
        lists.push(list);
      }
      const had = list.entries.some((entry) => entry.track === track);
      list.entries = had
        ? list.entries.filter((entry) => entry.track !== track)
        : [...list.entries, { track: track as number, label: "" }];
      changed();
      return !had;
    },
    favorites_add: ({ tracks }) => {
      let list = favorites();
      if (!list) {
        list = { id: nextId, name: FAVORITES, entries: [] };
        nextId += 1;
        lists.push(list);
      }
      const fresh = (tracks as number[]).filter(
        (track, at, all) => all.indexOf(track) === at && !list.entries.some((entry) => entry.track === track),
      );
      list.entries = [...list.entries, ...fresh.map((track) => ({ track, label: "" }))];
      if (fresh.length > 0) changed();
      return fresh.length;
    },
    favorites: () => {
      const tracks = favorites()?.entries.flatMap((entry) => (entry.track === null ? [] : [entry.track])) ?? [];
      // A slow reload, so a test can drop again before the hearts update (TB-12).
      return window.e2eSlowFavorites ? new Promise((resolve) => setTimeout(() => resolve(tracks), 1500)) : tracks;
    },
    // The Rust pickers are not in the browser: the mock imports fixed playlists (P12.5, R32).
    playlist_import: () => {
      if (canceled()) return { canceled: true, reports: [] };
      add("Road Trip_ 2026", [
        { track: 0, label: "" },
        { track: null, label: "Lost Song" },
      ]);
      changed();
      return {
        canceled: false,
        reports: [
          {
            playlist: "Road Trip_ 2026",
            status: "imported",
            matched: 1,
            missing: [
              { label: "Cloud Band - Streaming Song", reason: "noLocation" },
              { label: "Lost Song", reason: "notFound" },
            ],
            error: null,
          },
          { playlist: "Mix 1", status: "skipped", matched: 0, missing: [], error: null },
          {
            playlist: "Too long",
            status: "failed",
            matched: 0,
            missing: [],
            error: "The playlist file cannot be written. The folder may be read-only",
          },
        ],
      };
    },
    // Slow, so a test sees the busy state.
    playlist_import_folder: () =>
      new Promise((resolve) =>
        setTimeout(() => {
          if (canceled()) return resolve({ canceled: true, reports: [] });
          add("Evening", [{ track: 1, label: "" }]);
          add("Evening (2)", [{ track: 2, label: "" }]);
          changed();
          resolve({
            canceled: false,
            reports: [
              { playlist: "Evening", status: "imported", matched: 1, missing: [], error: null },
              { playlist: "Evening (2)", status: "imported", matched: 1, missing: [], error: null },
              {
                playlist: "notes.xml",
                status: "failed",
                matched: 0,
                missing: [],
                error: "The file is not an Apple Music or iTunes playlist export",
              },
            ],
          });
        }, 300),
      ),
    playlist_find_missing: ({ id }) => {
      const list = find(id);
      if (canceled()) return { canceled: true, reports: [] };
      const report = repair(list);
      changed();
      return { canceled: false, reports: [report] };
    },
    playlist_find_missing_all: () => {
      if (canceled()) return { canceled: true, reports: [] };
      const reports = sorted()
        .filter((list) => missingCount(list) > 0)
        .map(repair);
      changed();
      return { canceled: false, reports };
    },
  };
  /** Handles a playlist command, or returns undefined for other commands. */
  return (command: string, args: Args): unknown => {
    const run = commands[command];
    if (!run) return undefined;
    // Tests read the last playlist command from the page.
    document.body.dataset.playlistCall = command;
    // Every call's arguments, for the "no path in IPC" check (D13).
    const calls = JSON.parse(document.body.dataset.playlistCalls ?? "[]") as [string, Args][];
    document.body.dataset.playlistCalls = JSON.stringify([...calls, [command, args ?? {}]]);
    return run(args) ?? null;
  };
}
