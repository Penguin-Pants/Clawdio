/**
 * The snap grid engine (R38.1 to R38.7, P29.0): pure functions on widget rectangles in whole
 * cells. Coordinates start at 0; the grid is GRID columns by GRID rows. No function returns a
 * layout with an overlap or a widget outside the grid.
 */

/** Columns and rows of the grid (R38.1). */
export const GRID = 12;

/** A rectangle of whole cells: column `x`, row `y`, width `w` and height `h`. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The minimum width and height of a widget in cells (R38.6). */
export interface MinSize {
  w: number;
  h: number;
}

/** Widget rectangles by widget id. A widget that is not in the map is hidden. */
export type Layout = Readonly<Record<string, Rect>>;

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** True when the rectangle has whole cells, is inside the grid and is at least `min`. */
export function isValidRect(rect: Rect, min: MinSize): boolean {
  return (
    [rect.x, rect.y, rect.w, rect.h].every(Number.isInteger) &&
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.w >= min.w &&
    rect.h >= min.h &&
    rect.x + rect.w <= GRID &&
    rect.y + rect.h <= GRID
  );
}

/** True when every widget is valid and no two widgets overlap. */
export function isValidLayout(layout: Layout, minOf: (id: string) => MinSize): boolean {
  const entries = Object.entries(layout);
  return entries.every(
    ([id, rect], index) =>
      isValidRect(rect, minOf(id)) && entries.slice(index + 1).every(([, other]) => !overlaps(rect, other)),
  );
}

/**
 * Keeps a rectangle inside the grid and at least `min`, with its size kept where it fits (a
 * drag past the grid edge stops at the edge).
 */
export function clampRect(rect: Rect, min: MinSize): Rect {
  const w = Math.min(GRID, Math.max(min.w, Math.round(rect.w)));
  const h = Math.min(GRID, Math.max(min.h, Math.round(rect.h)));
  const x = Math.min(GRID - w, Math.max(0, Math.round(rect.x)));
  const y = Math.min(GRID - h, Math.max(0, Math.round(rect.y)));
  return { x, y, w, h };
}

/**
 * One push pass: `id` takes `target`, and every widget it covers gives way (R38.4, owner answer
 * November 13, 2026). A widget that starts above the blocker keeps its top and ends above it
 * when its minimum height allows; any other widget moves down below the blocker, with the
 * height in `heights` when one is set. Moved widgets push in turn. Returns the layout, which can
 * pass row GRID, and the widgets that moved down.
 */
function pushPass(
  layout: Layout,
  id: string,
  target: Rect,
  minOf: (id: string) => MinSize,
  heights: ReadonlyMap<string, number>,
): { layout: Record<string, Rect>; moved: Set<string>; overflow: boolean } {
  const next: Record<string, Rect> = { ...layout, [id]: target };
  const moved = new Set<string>();
  const work = [id];
  while (work.length > 0) {
    const blockerId = work.shift() as string;
    const blocker = next[blockerId];
    for (const other of Object.keys(next)) {
      if (other === id || other === blockerId || !overlaps(blocker, next[other])) continue;
      const rect = next[other];
      const above = blocker.y - rect.y;
      if (rect.y < blocker.y && above >= minOf(other).h) {
        next[other] = { ...rect, h: above };
        continue;
      }
      const y = blocker.y + blocker.h;
      const h = Math.min(rect.h, heights.get(other) ?? rect.h);
      next[other] = { ...rect, y, h };
      moved.add(other);
      // A widget past the last row stops the pass: the caller shrinks or refuses.
      if (y + h > GRID) return { layout: next, moved, overflow: true };
      work.push(other);
    }
  }
  return { layout: next, moved, overflow: false };
}

/**
 * Puts widget `id` at `target` (a move, a resize or a show) and pushes the widgets it covers
 * down (R38.4, R38.5). A push never passes row GRID: the moved widgets shrink toward their
 * minimum height, the one with the most room first. Returns null when they still do not fit
 * (the drop is refused) or when `target` itself is not valid.
 */
export function place(layout: Layout, id: string, target: Rect, minOf: (id: string) => MinSize): Layout | null {
  if (!isValidRect(target, minOf(id))) return null;
  const base: Record<string, Rect> = { ...layout };
  delete base[id];
  const heights = new Map<string, number>();
  for (;;) {
    const result = pushPass(base, id, target, minOf, heights);
    if (!result.overflow) return result.layout;
    // The moved widget with the most rows above its minimum gives one row.
    let pick: string | null = null;
    let room = 0;
    for (const other of result.moved) {
      const h = heights.get(other) ?? result.layout[other].h;
      const spare = h - minOf(other).h;
      if (spare > room) {
        pick = other;
        room = spare;
      }
    }
    if (pick === null) return null;
    heights.set(pick, (heights.get(pick) ?? result.layout[pick].h) - 1);
  }
}

/** Moves a widget so its top left cell is (x, y), with its size kept. */
export function moveTo(
  layout: Layout,
  id: string,
  x: number,
  y: number,
  minOf: (id: string) => MinSize,
): Layout | null {
  const rect = layout[id];
  if (!rect) return null;
  return place(layout, id, clampRect({ ...rect, x, y }, minOf(id)), minOf);
}

/**
 * Resizes a widget to `w` by `h` from its top left cell. The size stops at the minimum and at
 * the grid edge (R38.5).
 */
export function resizeTo(
  layout: Layout,
  id: string,
  w: number,
  h: number,
  minOf: (id: string) => MinSize,
): Layout | null {
  const rect = layout[id];
  if (!rect) return null;
  const size = {
    w: Math.min(GRID - rect.x, Math.max(minOf(id).w, w)),
    h: Math.min(GRID - rect.y, Math.max(minOf(id).h, h)),
  };
  return place(layout, id, { ...rect, ...size }, minOf);
}

/** A move, or a resize by one of the four edges or four corners (owner answer Q14). */
export type Handle = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/** The cells after a drag of `handle` by (dx, dy) cells: a resize stops at the minimum and the grid edge. */
export function draggedRect(start: Rect, handle: Handle, dx: number, dy: number, min: MinSize): Rect {
  if (handle === "move") return clampRect({ ...start, x: start.x + dx, y: start.y + dy }, min);
  let { x, y, w, h } = start;
  if (handle.includes("e")) w = Math.min(GRID - start.x, Math.max(min.w, start.w + dx));
  if (handle.includes("w")) {
    x = Math.max(0, Math.min(start.x + start.w - min.w, start.x + dx));
    w = start.x + start.w - x;
  }
  if (handle.includes("s")) h = Math.min(GRID - start.y, Math.max(min.h, start.h + dy));
  if (handle.includes("n")) {
    y = Math.max(0, Math.min(start.y + start.h - min.h, start.y + dy));
    h = start.y + start.h - y;
  }
  return { x, y, w, h };
}

/** The first rectangle of size `min` with no widget in it, top row first, then left column. */
export function firstFree(layout: Layout, min: MinSize): Rect | null {
  const rects = Object.values(layout);
  for (let y = 0; y + min.h <= GRID; y += 1) {
    for (let x = 0; x + min.w <= GRID; x += 1) {
      const rect = { x, y, w: min.w, h: min.h };
      if (!rects.some((other) => overlaps(rect, other))) return rect;
    }
  }
  return null;
}

/**
 * The part of `rect` that keeps clear of `hole` by cutting its bottom or its right side, so its
 * top left cell stays, at least `min`; the larger part when both work. Null when neither works.
 */
function cutAway(rect: Rect, hole: Rect, min: MinSize): Rect | null {
  const options: Rect[] = [
    { ...rect, h: hole.y - rect.y },
    { ...rect, w: hole.x - rect.x },
  ].filter((option) => option.w >= min.w && option.h >= min.h);
  if (options.length === 0) return null;
  return options.reduce((best, option) => (option.w * option.h > best.w * best.h ? option : best));
}

/** True when no widget but `id` covers a cell of `rect`. */
function isFree(layout: Layout, id: string, rect: Rect): boolean {
  return Object.entries(layout).every(([other, cells]) => other === id || !overlaps(rect, cells));
}

/** Widens a widget, then makes it taller, while the new cells are free and inside the grid. */
function grow(layout: Layout, id: string): Layout {
  let rect = layout[id];
  while (rect.x + rect.w < GRID && isFree(layout, id, { x: rect.x + rect.w, y: rect.y, w: 1, h: rect.h })) {
    rect = { ...rect, w: rect.w + 1 };
  }
  while (rect.y + rect.h < GRID && isFree(layout, id, { x: rect.x, y: rect.y + rect.h, w: rect.w, h: 1 })) {
    rect = { ...rect, h: rect.h + 1 };
  }
  return { ...layout, [id]: rect };
}

/**
 * Shows a hidden widget (R38.7): at its minimum size in the first free area, else where the
 * widgets it covers can give up their bottom or right cells with the fewest cells lost (owner
 * answer November 13, 2026). The widget then grows into the free cells beside and below it.
 * Returns null when no place works (the show is refused).
 */
export function show(layout: Layout, id: string, minOf: (id: string) => MinSize): Layout | null {
  if (layout[id]) return layout;
  const min = minOf(id);
  const free = firstFree(layout, min);
  if (free) return grow({ ...layout, [id]: free }, id);
  let best: { layout: Layout; lost: number } | null = null;
  for (let y = 0; y + min.h <= GRID; y += 1) {
    for (let x = 0; x + min.w <= GRID; x += 1) {
      const hole = { x, y, w: min.w, h: min.h };
      const next: Record<string, Rect> = { ...layout };
      let lost = 0;
      let fits = true;
      for (const [other, rect] of Object.entries(layout)) {
        if (!overlaps(rect, hole)) continue;
        const cut = cutAway(rect, hole, minOf(other));
        if (!cut) {
          fits = false;
          break;
        }
        lost += rect.w * rect.h - cut.w * cut.h;
        next[other] = cut;
      }
      if (fits && (best === null || lost < best.lost)) best = { layout: { ...next, [id]: hole }, lost };
    }
  }
  return best ? grow(best.layout, id) : null;
}

/** Removes a widget from the grid; its cells stay empty (R38.2). */
export function hide(layout: Layout, id: string): Layout {
  const next: Record<string, Rect> = { ...layout };
  delete next[id];
  return next;
}
