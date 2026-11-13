import type { Layout } from "./grid/engine";

/**
 * The fixed presets (R38.8, owner answer November 13, 2026 for Columns), in cells from the top
 * left (0-based). Each fills the 12 x 12 grid. Presets cannot be changed.
 */
const SHARED: Layout = {
  transport: { x: 0, y: 0, w: 12, h: 1 },
  playlists: { x: 0, y: 1, w: 2, h: 11 },
  search: { x: 2, y: 1, w: 7, h: 1 },
  nowPlaying: { x: 9, y: 1, w: 3, h: 5 },
};

/** Default: Artist and Album under Search, Now playing at the right, Songs full width below. */
const DEFAULT: Layout = {
  ...SHARED,
  artist: { x: 2, y: 2, w: 3, h: 4 },
  album: { x: 5, y: 2, w: 4, h: 4 },
  songs: { x: 2, y: 6, w: 10, h: 6 },
};

/** Tree: Default with Tree in place of Artist and Album. */
const TREE: Layout = {
  ...SHARED,
  tree: { x: 2, y: 2, w: 7, h: 4 },
  songs: { x: 2, y: 6, w: 10, h: 6 },
};

/** Columns: Artist, Album and Songs side by side under Search; Play queue under Now playing. */
const COLUMNS: Layout = {
  ...SHARED,
  artist: { x: 2, y: 2, w: 2, h: 10 },
  album: { x: 4, y: 2, w: 2, h: 10 },
  songs: { x: 6, y: 2, w: 3, h: 10 },
  queue: { x: 9, y: 6, w: 3, h: 6 },
};

export const PRESET_IDS = ["default", "tree", "columns"] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export const PRESETS: Record<PresetId, { title: string; layout: Layout }> = {
  default: { title: "Default", layout: DEFAULT },
  tree: { title: "Tree", layout: TREE },
  columns: { title: "Columns", layout: COLUMNS },
};

/** First run and Reset layout apply it (R38.8). */
export const DEFAULT_PRESET: PresetId = "default";
