import { create } from "zustand";
import { commands, type PlaylistEntry, type PlaylistRow } from "@/lib/ipc/commands";
import { usePlayerStore } from "@/store/player";
import { type AppDialog, useUiStore } from "@/store/ui";

interface PlaylistsState {
  rows: PlaylistRow[];
  /** The text of the running import or repair, or null (R32 busy state). */
  busy: string | null;
  /** Tracks in Favorites, for the hearts (R26). */
  favorites: Set<number>;
  /** Goes up on each `playlists-changed`, so open playlists load their entries again. */
  version: number;
  /** Loads in flight. Above 0 a change has landed that `version` does not show yet. */
  reloading: number;
  load: () => Promise<void>;
}

export const usePlaylistsStore = create<PlaylistsState>()((set) => ({
  rows: [],
  busy: null,
  favorites: new Set(),
  version: 0,
  reloading: 0,
  load: async () => {
    // Synchronous on `playlists-changed`: open views stop index edits before the reads finish.
    set((state) => ({ reloading: state.reloading + 1 }));
    const [rows, favorites] = await Promise.all([
      commands.playlistsList().catch(() => [] as PlaylistRow[]),
      commands.favorites().catch(() => [] as number[]),
    ]);
    set((state) => ({
      rows,
      favorites: new Set(favorites),
      version: state.version + 1,
      reloading: state.reloading - 1,
    }));
  },
}));

/** The text of a command error, for the error dialog (P11.8). */
export function errorText(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = String(error.message);
    if (message) return message;
  }
  return fallback;
}

/** Runs a playlist edit. A failure shows a dialog; the file stays as it was (P11.8). */
export async function playlistEdit(run: () => Promise<unknown>, fallback: string): Promise<boolean> {
  try {
    await run();
    return true;
  } catch (error) {
    useUiStore.getState().openDialog({ kind: "error", text: errorText(error, fallback) });
    return false;
  }
}

/** The heart (R26, P11.7): adds the song to Favorites or removes every copy. */
export function toggleFavorite(track: number): void {
  void playlistEdit(() => commands.favoriteToggle(track), "Cannot change Favorites");
}

/** A row drop on Favorites (TB-12, UD21): adds the songs that are not favorites yet, never removes. */
export function addFavorites(tracks: number[]): void {
  if (tracks.length === 0) return;
  void playlistEdit(() => commands.favoritesAdd(tracks), "Cannot change Favorites");
}

/**
 * The queue for a playlist (R6 queue rule): its library tracks in order, from entry `from`
 * (the next entry that is not missing). Missing entries are skipped.
 */
export function playlistQueue(entries: PlaylistEntry[], from = 0): { ids: number[]; start: number } | null {
  const ids: number[] = [];
  let start = -1;
  entries.forEach((entry, index) => {
    if (entry.track === null) return;
    if (start < 0 && index >= from) start = ids.length;
    ids.push(entry.track);
  });
  return start < 0 ? null : { ids, start };
}

/** The entries of a playlist as a view shows them; an edit of the playlist changes it (D63). */
export function playlistSignature(entries: readonly PlaylistEntry[]): string {
  return JSON.stringify(entries.map((entry) => entry.track));
}

/**
 * Plays a playlist from entry `from` (R12: double-click or Enter plays). A caller that shows the
 * entries (the playlist view) passes them, so `from` points into the list the user saw, and the
 * view becomes the source of the queue for the selection follow (D63).
 */
export async function playPlaylist(id: number, from = 0, entries?: PlaylistEntry[]): Promise<void> {
  const queue = playlistQueue(entries ?? (await commands.playlistEntries(id)), from);
  if (!queue) return;
  if (entries) usePlayerStore.getState().expectPlaylist(id, queue.ids, playlistSignature(entries));
  try {
    await commands.playerPlayList(queue.ids, queue.start);
  } catch (error) {
    // No queue came from the view, so a later queue with the same ids is not its queue.
    usePlayerStore.setState({ pending: null });
    throw error;
  }
}

/**
 * "Remove from playlist" and the Delete key (R12, R25): removes the entry at `index`. Resolves
 * false when the write fails.
 */
export function removePlaylistEntry(id: number, index: number): Promise<boolean> {
  return playlistEdit(() => commands.playlistRemoveEntry(id, index), "Cannot remove the entry");
}

/** Add to playlist (R12): appends; duplicates are allowed. */
export function addToPlaylist(id: number, tracks: number[]): void {
  if (tracks.length === 0) return;
  void playlistEdit(() => commands.playlistAdd(id, tracks), "Cannot add to the playlist").then((done) => {
    if (done) useUiStore.getState().showMessage("Added to playlist");
  });
}

/**
 * Runs an import or a repair (R32, R33): one at a time, with a busy state in the Playlists
 * widget. The status line keeps the scan's job and its Cancel, the only cancel (R32). The
 * result opens its report; an error opens the error dialog.
 */
export async function playlistTask<T>(
  text: string,
  run: () => Promise<T>,
  report: (result: T) => AppDialog | null,
  fallback: string,
): Promise<void> {
  const store = usePlaylistsStore;
  if (store.getState().busy) return;
  store.setState({ busy: text });
  try {
    const dialog = report(await run());
    if (dialog) useUiStore.getState().openDialog(dialog);
  } catch (error) {
    useUiStore.getState().openDialog({ kind: "error", text: errorText(error, fallback) });
  } finally {
    store.setState({ busy: null });
  }
}
