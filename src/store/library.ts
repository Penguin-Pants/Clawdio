import { create } from "zustand";

/** The selected row in each Library list. Ids are session ids (D46); null means "All" or nothing. */
export interface LibrarySelection {
  artist: number | null;
  album: number | null;
  song: number | null;
}

export const EMPTY_SELECTION: LibrarySelection = { artist: null, album: null, song: null };

/** The Songs table selection (UD12): the selected ids and the anchor of Shift ranges. */
export interface SongSelection {
  selected: ReadonlySet<number>;
  anchor: number | null;
}

/**
 * The selection after a click or a key on `target` (UD12, TB-10): "single" selects one,
 * "toggle" (Ctrl) adds or removes one, "range" (Shift) selects from the anchor to the target in
 * list order. Toggle and single move the anchor; a range keeps it.
 */
export function selectSongs(
  ids: readonly number[],
  current: SongSelection,
  target: number,
  mode: "single" | "toggle" | "range",
): { selected: Set<number>; anchor: number } {
  if (mode === "toggle") {
    const selected = new Set(current.selected);
    if (selected.has(target)) selected.delete(target);
    else selected.add(target);
    return { selected, anchor: target };
  }
  const from = current.anchor === null ? -1 : ids.indexOf(current.anchor);
  const to = ids.indexOf(target);
  if (mode === "single" || from < 0 || to < 0) return { selected: new Set([target]), anchor: target };
  const [low, high] = from <= to ? [from, to] : [to, from];
  return { selected: new Set(ids.slice(low, high + 1)), anchor: ids[from] };
}

interface LibraryState {
  /** Goes up on every `library-changed` event, so lists load again. */
  version: number;
  search: string;
  selection: LibrarySelection;
  /** The selected songs of the Songs table; `selection.song` is the active row (UD12). */
  selectedSongs: ReadonlySet<number>;
  anchor: number | null;
  /** Goes up each time a saved selection restores (R37), so the shown lists reveal it. */
  restoreSeq: number;
  /** Applies the restored selection (R37.3): the song is the only selected song and the anchor. */
  restoreSelection: (selection: LibrarySelection) => void;
  bumpVersion: () => void;
  setSearch: (search: string) => void;
  setSelection: (selection: Partial<LibrarySelection>) => void;
  /** Sets the Songs selection, its anchor and the active row together (UD12). */
  setSongSelection: (selected: ReadonlySet<number>, anchor: number | null, active: number | null) => void;
  /** The playlist the Songs widget shows in place of the table (R12 v1.9), or null for the library. */
  playlist: number | null;
  showPlaylist: (id: number | null) => void;
}

/** The Library state that Search, Artist, Album, Songs and Tree share (R38.3). */
export const useLibraryStore = create<LibraryState>()((set) => ({
  version: 0,
  bumpVersion: () => set((state) => ({ version: state.version + 1 })),
  search: "",
  selection: EMPTY_SELECTION,
  restoreSeq: 0,
  restoreSelection: (selection) =>
    set((state) => ({
      selection,
      selectedSongs: new Set(selection.song === null ? [] : [selection.song]),
      anchor: selection.song,
      restoreSeq: state.restoreSeq + 1,
    })),
  setSearch: (search) => set({ search }),
  // A selection change that names the song selects just that song (Artist, Album, Tree, keys).
  setSelection: (selection) =>
    set((state) => ({
      selection: { ...state.selection, ...selection },
      ...("song" in selection
        ? { selectedSongs: new Set(selection.song == null ? [] : [selection.song]), anchor: selection.song ?? null }
        : {}),
    })),
  selectedSongs: new Set<number>(),
  anchor: null,
  playlist: null,
  showPlaylist: (playlist) => set({ playlist }),
  setSongSelection: (selectedSongs, anchor, active) =>
    set((state) => ({ selectedSongs, anchor, selection: { ...state.selection, song: active } })),
}));
