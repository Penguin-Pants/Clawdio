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

interface LibraryState {
  mode: LibraryMode;
  search: string;
  selection: LibrarySelection;
  setMode: (mode: LibraryMode) => void;
  setSearch: (search: string) => void;
  setSelection: (selection: Partial<LibrarySelection>) => void;
}

/** Library widget state. Mode, search text and selection are separate, so a mode switch keeps the other two (R28). */
export const useLibraryStore = create<LibraryState>()((set) => ({
  mode: "columns",
  search: "",
  selection: EMPTY_SELECTION,
  setMode: (mode) => set({ mode }),
  setSearch: (search) => set({ search }),
  setSelection: (selection) => set((state) => ({ selection: { ...state.selection, ...selection } })),
}));
