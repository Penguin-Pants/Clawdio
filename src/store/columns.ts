import { create } from "zustand";
import { type ColumnState, DEFAULT_COLUMNS, type ViewId } from "@/widgets/library/columns";

/** Row density (TB-14): regular rows by default; View, Compact rows switches it. */
export type Density = "regular" | "compact";

interface ColumnsState {
  density: Density;
  /** The column state per Songs view (TB-9, UD8). */
  views: Record<ViewId, ColumnState>;
  update: (view: ViewId, change: (state: ColumnState) => ColumnState) => void;
  /** "Reset columns" in the header menu: the view's defaults (PS-6 keeps it apart from Reset layout). */
  resetView: (view: ViewId) => void;
  setAll: (file: { density: Density; views: Record<ViewId, ColumnState> }) => void;
  setDensity: (density: Density) => void;
}

export const useColumnsStore = create<ColumnsState>()((set) => ({
  density: "regular",
  views: DEFAULT_COLUMNS,
  update: (view, change) =>
    set((state) => {
      const next = change(state.views[view]);
      return next === state.views[view] ? state : { views: { ...state.views, [view]: next } };
    }),
  resetView: (view) => set((state) => ({ views: { ...state.views, [view]: DEFAULT_COLUMNS[view] } })),
  setAll: ({ density, views }) => set({ density, views }),
  setDensity: (density) => set({ density }),
}));
