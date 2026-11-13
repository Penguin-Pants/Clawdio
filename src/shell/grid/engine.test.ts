import { describe, expect, it } from "vitest";
import { PRESETS, PRESET_IDS } from "../presets";
import {
  GRID,
  type Layout,
  type MinSize,
  type Rect,
  clampRect,
  firstFree,
  hide,
  isValidLayout,
  moveTo,
  overlaps,
  place,
  resizeTo,
  show,
} from "./engine";

/** The R38.6 minimum sizes, as the registry holds them (widgets.test.ts checks the registry). */
const MIN: Record<string, MinSize> = {
  transport: { w: 4, h: 1 },
  search: { w: 2, h: 1 },
  songs: { w: 3, h: 2 },
  nowPlaying: { w: 2, h: 3 },
};
const minOf = (id: string): MinSize => MIN[id] ?? { w: 2, h: 2 };
const DEFAULT = PRESETS.default.layout;

const cells = (layout: Layout) => Object.values(layout).reduce((sum, rect) => sum + rect.w * rect.h, 0);

describe("snap grid engine (R38.4 to R38.7, P29-AC1)", () => {
  it("presets are valid and fill the 12 x 12 grid (R38.8)", () => {
    for (const id of PRESET_IDS) {
      expect(isValidLayout(PRESETS[id].layout, minOf)).toBe(true);
      expect(cells(PRESETS[id].layout)).toBe(GRID * GRID);
    }
  });

  it("places a widget in free cells and leaves the others", () => {
    const layout = { a: { x: 0, y: 0, w: 2, h: 2 } };
    expect(place(layout, "b", { x: 4, y: 4, w: 3, h: 3 }, minOf)).toEqual({ ...layout, b: { x: 4, y: 4, w: 3, h: 3 } });
  });

  it("pushes a covered widget down below the drop", () => {
    const layout = { a: { x: 0, y: 0, w: 4, h: 3 }, b: { x: 6, y: 0, w: 2, h: 2 } };
    const next = place(layout, "b", { x: 0, y: 0, w: 2, h: 2 }, minOf);
    expect(next?.a).toEqual({ x: 0, y: 2, w: 4, h: 3 });
  });

  it("shrinks a widget that starts above the drop from its bottom (owner answer)", () => {
    const layout = { a: { x: 0, y: 0, w: 2, h: 10 }, b: { x: 4, y: 8, w: 4, h: 4 } };
    const next = place(layout, "b", { x: 0, y: 6, w: 6, h: 6 }, minOf);
    expect(next?.a).toEqual({ x: 0, y: 0, w: 2, h: 6 });
  });

  it("shrinks pushed widgets toward their minimum so nothing passes row 12 (AC-34)", () => {
    // Drag Album onto Artist in Default: Artist moves down; Songs makes room.
    const next = place(DEFAULT, "album", { x: 2, y: 2, w: 4, h: 4 }, minOf);
    expect(next).not.toBeNull();
    expect(isValidLayout(next as Layout, minOf)).toBe(true);
    expect(next?.artist.y).toBeGreaterThanOrEqual(6);
    expect(next?.album).toEqual({ x: 2, y: 2, w: 4, h: 4 });
  });

  it("refuses a drop when the pushed widgets do not fit at their minimum", () => {
    const layout = { a: { x: 0, y: 0, w: 2, h: 6 }, b: { x: 0, y: 6, w: 2, h: 6 } };
    expect(place(layout, "c", { x: 0, y: 0, w: 2, h: 10 }, minOf)).toBeNull();
  });

  it("refuses a target outside the grid or under the minimum", () => {
    expect(place({}, "songs", { x: 11, y: 0, w: 3, h: 2 }, minOf)).toBeNull();
    expect(place({}, "songs", { x: 0, y: 0, w: 2, h: 2 }, minOf)).toBeNull();
  });

  it("does the AC-34 arrangement: Songs full width below Now playing", () => {
    const next = place(DEFAULT, "songs", { x: 0, y: 6, w: 12, h: 6 }, minOf) as Layout;
    expect(next.songs).toEqual({ x: 0, y: 6, w: 12, h: 6 });
    expect(next.playlists).toEqual({ x: 0, y: 1, w: 2, h: 5 });
    expect(next.nowPlaying).toEqual(DEFAULT.nowPlaying);
    expect(isValidLayout(next, minOf)).toBe(true);
  });

  it("moves by one cell with the size kept, and stops at the grid edge", () => {
    const layout = { a: { x: 10, y: 0, w: 2, h: 2 } };
    expect(moveTo(layout, "a", 9, 0, minOf)?.a).toEqual({ x: 9, y: 0, w: 2, h: 2 });
    expect(moveTo(layout, "a", 11, 0, minOf)?.a).toEqual({ x: 10, y: 0, w: 2, h: 2 });
  });

  it("resizes in cells, stopping at the minimum and the grid edge, and pushes (R38.5)", () => {
    const layout = { songs: { x: 8, y: 0, w: 3, h: 2 }, b: { x: 8, y: 2, w: 2, h: 2 } };
    expect(resizeTo(layout, "songs", 1, 1, minOf)?.songs).toEqual({ x: 8, y: 0, w: 3, h: 2 });
    expect(resizeTo(layout, "songs", 9, 2, minOf)?.songs).toEqual({ x: 8, y: 0, w: 4, h: 2 });
    const taller = resizeTo(layout, "songs", 3, 3, minOf) as Layout;
    expect(taller.b).toEqual({ x: 8, y: 3, w: 2, h: 2 });
  });

  it("clamps a dragged rectangle into the grid", () => {
    expect(clampRect({ x: -2, y: 11, w: 3, h: 2 }, { w: 2, h: 2 })).toEqual({ x: 0, y: 10, w: 3, h: 2 });
  });

  it("shows a widget in the first free area and grows it into the free cells (R38.7)", () => {
    const layout = { a: { x: 0, y: 0, w: 12, h: 1 }, b: { x: 4, y: 1, w: 8, h: 11 } };
    expect(firstFree(layout, { w: 2, h: 2 })).toEqual({ x: 0, y: 1, w: 2, h: 2 });
    expect(show(layout, "queue", minOf)?.queue).toEqual({ x: 0, y: 1, w: 4, h: 11 });
    // A hidden widget shows again in the cells it left.
    expect(show(hide(DEFAULT, "artist"), "artist", minOf)?.artist).toEqual(DEFAULT.artist);
  });

  it("shows a widget in a full grid by cutting the bottom or right of others (owner answer)", () => {
    const next = show(DEFAULT, "queue", minOf) as Layout;
    expect(next.queue.w).toBeGreaterThanOrEqual(2);
    expect(next.queue.h).toBeGreaterThanOrEqual(2);
    expect(isValidLayout(next, minOf)).toBe(true);
    expect(cells(next)).toBe(GRID * GRID);
    // No widget's top left cell moves: the band and the others keep their place.
    for (const [id, rect] of Object.entries(DEFAULT)) expect(next[id]).toMatchObject({ x: rect.x, y: rect.y });
  });

  it("refuses a show when no widget can shrink", () => {
    const full: Record<string, Rect> = {};
    for (let i = 0; i < 6; i += 1) full[`w${i}`] = { x: i * 2, y: 0, w: 2, h: 12 };
    const tight = (id: string) => (id === "queue" ? { w: 2, h: 2 } : { w: 2, h: 12 });
    expect(show(full, "queue", tight)).toBeNull();
  });

  it("hides a widget and leaves its cells empty", () => {
    expect(hide(DEFAULT, "artist").artist).toBeUndefined();
  });

  it("never overlaps or leaves the grid over many random moves and resizes", () => {
    let seed = 7;
    const random = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    let layout: Layout = DEFAULT;
    const ids = Object.keys(DEFAULT);
    for (let step = 0; step < 2000; step += 1) {
      const id = ids[random(ids.length)];
      const next =
        random(2) === 0
          ? moveTo(layout, id, random(GRID), random(GRID), minOf)
          : resizeTo(layout, id, 1 + random(GRID), 1 + random(GRID), minOf);
      if (next) layout = next;
      expect(isValidLayout(layout, minOf)).toBe(true);
    }
    const rects = Object.values(layout);
    expect(rects.every((a, i) => rects.slice(i + 1).every((b) => !overlaps(a, b)))).toBe(true);
  });
});
