import { create } from "zustand";

/** Library widget modes (R28). Each built-in layout sets one of them (R29). */
export const LIBRARY_MODES = ["tree", "columns", "topBottom"] as const;
export type LibraryMode = (typeof LIBRARY_MODES)[number];

/** The selected row in each Library list. Ids are session ids (D46); null means "All" or nothing. */
export interface LibrarySelection {
  artist: number | null;
  album: number | null;
  song: number | null;
}

export const EMPTY_SELECTION: LibrarySelection = { artist: null, album: null, song: null };

/**
 * Library frame sizes as fractions per mode (R28.1, D55). Columns: Artist, Album, Songs.
 * Top/bottom: `top` is Artist and Album, `rows` is the top row and Songs.
 */
export interface LibraryFrames {
  columns: number[];
  topBottom: { top: number[]; rows: number[] };
}

/** One splitter group: Columns, the Top/bottom top row, or the Top/bottom rows. */
export type FrameGroup = "columns" | "top" | "rows";

/** The old fixed ratios (D55): Columns 1:1:2, Top/bottom 1:1 and 1:1. */
export const DEFAULT_FRAMES: LibraryFrames = {
  columns: [0.25, 0.25, 0.5],
  topBottom: { top: [0.5, 0.5], rows: [0.5, 0.5] },
};

/** The fractions of one splitter group. */
export function frameFractions(frames: LibraryFrames, group: FrameGroup): number[] {
  return group === "columns" ? frames.columns : frames.topBottom[group];
}

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
  mode: LibraryMode;
  search: string;
  selection: LibrarySelection;
  /** The selected songs of the Songs table; `selection.song` is the active row (UD12). */
  selectedSongs: ReadonlySet<number>;
  anchor: number | null;
  frames: LibraryFrames;
  bumpVersion: () => void;
  setMode: (mode: LibraryMode) => void;
  setSearch: (search: string) => void;
  setSelection: (selection: Partial<LibrarySelection>) => void;
  /** Sets the Songs selection, its anchor and the active row together (UD12). */
  setSongSelection: (selected: ReadonlySet<number>, anchor: number | null, active: number | null) => void;
  setFrames: (group: FrameGroup, fractions: number[]) => void;
  setAllFrames: (frames: LibraryFrames) => void;
  resetFrames: () => void;
}

/**
 * Library widget state. Mode, search text, selection and frame sizes are separate, so a mode
 * switch keeps the others (R28, R28.1).
 */
export const useLibraryStore = create<LibraryState>()((set) => ({
  version: 0,
  bumpVersion: () => set((state) => ({ version: state.version + 1 })),
  mode: "columns",
  search: "",
  selection: EMPTY_SELECTION,
  setMode: (mode) => set({ mode }),
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
  setSongSelection: (selectedSongs, anchor, active) =>
    set((state) => ({ selectedSongs, anchor, selection: { ...state.selection, song: active } })),
  frames: DEFAULT_FRAMES,
  setFrames: (group, fractions) =>
    set((state) => ({
      frames:
        group === "columns"
          ? { ...state.frames, columns: fractions }
          : { ...state.frames, topBottom: { ...state.frames.topBottom, [group]: fractions } },
    })),
  setAllFrames: (frames) => set({ frames }),
  resetFrames: () => set({ frames: DEFAULT_FRAMES }),
}));
