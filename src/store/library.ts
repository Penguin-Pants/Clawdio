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

interface LibraryState {
  /** Goes up on every `library-changed` event, so lists load again. */
  version: number;
  mode: LibraryMode;
  search: string;
  selection: LibrarySelection;
  frames: LibraryFrames;
  bumpVersion: () => void;
  setMode: (mode: LibraryMode) => void;
  setSearch: (search: string) => void;
  setSelection: (selection: Partial<LibrarySelection>) => void;
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
  setSelection: (selection) => set((state) => ({ selection: { ...state.selection, ...selection } })),
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
