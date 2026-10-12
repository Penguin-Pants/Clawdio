// Editable mock playlists for the e2e build (P11): the same commands and events as Rust.
// "Read only" stands for a playlist in a read-only folder (P11-AC10).
import { emit } from "@tauri-apps/api/event";
import type { PlaylistEntry } from "../../src/lib/ipc/bindings/PlaylistEntry";
import type { PlaylistRow } from "../../src/lib/ipc/bindings/PlaylistRow";

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
  const commands: Record<string, (args: Args) => unknown> = {
    playlists_list: () =>
      [...lists]
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }))
        .map((list) => ({
          id: list.id,
          name: list.name,
          fileName: `${list.name}.m3u8`,
          entryCount: list.entries.length,
          isFavorites: list.name === FAVORITES,
        })),
    playlist_entries: ({ id }) => find(id).entries,
    playlist_name_check: ({ name }) => nameProblem(name as string),
    playlist_create: ({ name }) => {
      const problem = nameProblem(name as string);
      if (problem) throw { code: "playlist", message: problem };
      lists.push({ id: nextId, name: name as string, entries: [] });
      nextId += 1;
      changed();
      return nextId - 1;
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
    favorites: () => favorites()?.entries.flatMap((entry) => (entry.track === null ? [] : [entry.track])) ?? [],
    // The Rust picker is not in the browser: the mock imports one fixed playlist (P12.5).
    playlist_import: () => {
      lists.push({
        id: nextId,
        name: "Road Trip_ 2026",
        entries: [
          { track: 0, label: "" },
          { track: null, label: "Lost Song" },
        ],
      });
      nextId += 1;
      changed();
      return [
        {
          playlist: "Road Trip_ 2026",
          matched: 1,
          missing: [
            { label: "Cloud Band - Streaming Song", reason: "noLocation" },
            { label: "Lost Song", reason: "notFound" },
          ],
        },
      ];
    },
  };
  /** Handles a playlist command, or returns undefined for other commands. */
  return (command: string, args: Args): unknown => {
    const run = commands[command];
    if (!run) return undefined;
    // Tests read the last playlist command from the page.
    document.body.dataset.playlistCall = command;
    return run(args) ?? null;
  };
}
