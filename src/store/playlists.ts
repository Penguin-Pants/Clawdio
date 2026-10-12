import { create } from "zustand";
import { commands, type PlaylistRow } from "@/lib/ipc/commands";
import { useUiStore } from "@/store/ui";

interface PlaylistsState {
  rows: PlaylistRow[];
  /** Tracks in Favorites, for the hearts (R26). */
  favorites: Set<number>;
  /** Goes up on each `playlists-changed`, so open playlists load their entries again. */
  version: number;
  load: () => Promise<void>;
}

export const usePlaylistsStore = create<PlaylistsState>()((set) => ({
  rows: [],
  favorites: new Set(),
  version: 0,
  load: async () => {
    const [rows, favorites] = await Promise.all([
      commands.playlistsList().catch(() => [] as PlaylistRow[]),
      commands.favorites().catch(() => [] as number[]),
    ]);
    set((state) => ({ rows, favorites: new Set(favorites), version: state.version + 1 }));
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

/** Add to playlist (R12): appends; duplicates are allowed. */
export function addToPlaylist(id: number, tracks: number[]): void {
  if (tracks.length === 0) return;
  void playlistEdit(() => commands.playlistAdd(id, tracks), "Cannot add to the playlist").then((done) => {
    if (done) useUiStore.getState().showMessage("Added to playlist");
  });
}
