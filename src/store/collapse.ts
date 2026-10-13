import { create } from "zustand";

/** A collapsed group's axis and its size before the collapse (SP-6, UD25), by group id. */
export type CollapseSizes = Record<string, { axis: "width" | "height"; size: number }>;

interface CollapseState {
  sizes: CollapseSizes;
}

/** Collapsed groups (UD25). A new arrangement clears them; `layout.json` keeps them (PS-5). */
export const useCollapseStore = create<CollapseState>()(() => ({ sizes: {} }));
