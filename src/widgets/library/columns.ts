import type { SortColumn, SortKey } from "@/lib/ipc/commands";

/** A Songs table column (UD8). The ids are the Rust sort columns (UD11). */
export type ColumnId = SortColumn;

export interface ColumnDef {
  id: ColumnId;
  label: string;
  /** Minimum width in px (TB-2). */
  min: number;
  /** Default width in px; for Title the width under the spare space (TB-6). */
  width: number;
  /** Numeric columns align right (TB-6). */
  align: "left" | "right";
  /** `#` cannot move or hide, so the playing indicator stays in the first column (TB-11). */
  fixed: boolean;
  hideable: boolean;
}

export const COLUMNS: Record<ColumnId, ColumnDef> = {
  track: { id: "track", label: "#", min: 40, width: 48, align: "right", fixed: true, hideable: false },
  title: { id: "title", label: "Title", min: 120, width: 240, align: "left", fixed: false, hideable: false },
  artist: { id: "artist", label: "Artist", min: 80, width: 160, align: "left", fixed: false, hideable: true },
  album: { id: "album", label: "Album", min: 80, width: 160, align: "left", fixed: false, hideable: true },
  duration: { id: "duration", label: "Time", min: 56, width: 64, align: "right", fixed: false, hideable: true },
};

export const COLUMN_IDS: readonly ColumnId[] = ["track", "title", "artist", "album", "duration"];

/** The heart cell after the columns: a pointer target, not a user column (UD8, D23). */
export const HEART_WIDTH = 28;
/** Auto size never makes a column wider than this (UK5: the rows in view decide). */
export const AUTO_SIZE_MAX = 600;

/** The column state of one view (TB-9, UD13). */
export interface ColumnState {
  order: ColumnId[];
  widths: Record<ColumnId, number>;
  hidden: ColumnId[];
  sort: SortKey[];
}

/** The two Songs views (UD8): the table of Columns mode and of Top/bottom mode. */
export type ViewId = "songs.columns" | "songs.topBottom";
export const VIEW_IDS: readonly ViewId[] = ["songs.columns", "songs.topBottom"];

const defaultWidths = Object.fromEntries(COLUMN_IDS.map((id) => [id, COLUMNS[id].width])) as Record<ColumnId, number>;

export const DEFAULT_COLUMNS: Record<ViewId, ColumnState> = {
  // Columns mode shows the Album list beside the table, so Album starts hidden there.
  "songs.columns": { order: [...COLUMN_IDS], widths: defaultWidths, hidden: ["album"], sort: [] },
  "songs.topBottom": { order: [...COLUMN_IDS], widths: defaultWidths, hidden: [], sort: [] },
};

/** The visible columns in order. */
export function visibleColumns(state: ColumnState): ColumnId[] {
  return state.order.filter((id) => !state.hidden.includes(id));
}

function clampWidth(id: ColumnId, width: number, max = Number.POSITIVE_INFINITY): number {
  return Math.round(Math.min(max, Math.max(COLUMNS[id].min, width)));
}

/** A new width, never below the column minimum (TB-2). */
export function resizeColumn(state: ColumnState, id: ColumnId, width: number): ColumnState {
  return { ...state, widths: { ...state.widths, [id]: clampWidth(id, width) } };
}

/** The measured content width, between the minimum and AUTO_SIZE_MAX (TB-3). */
export function autoSizeColumn(state: ColumnState, id: ColumnId, measured: number): ColumnState {
  return { ...state, widths: { ...state.widths, [id]: clampWidth(id, measured, AUTO_SIZE_MAX) } };
}

/** Moves a column to `index` in the order; `#` stays first (TB-4, UD8). */
export function moveColumn(state: ColumnState, id: ColumnId, index: number): ColumnState {
  if (COLUMNS[id].fixed) return state;
  const rest = state.order.filter((other) => other !== id);
  const target = Math.min(rest.length, Math.max(1, index));
  if (state.order.indexOf(id) === target) return state;
  return { ...state, order: [...rest.slice(0, target), id, ...rest.slice(target)] };
}

/** Moves a column one visible place left (-1) or right (+1): Shift+arrows and the menu (AX-1). */
export function shiftColumn(state: ColumnState, id: ColumnId, step: -1 | 1): ColumnState {
  const visible = visibleColumns(state);
  const position = visible.indexOf(id);
  const neighbor = visible[position + step];
  if (position < 0 || neighbor === undefined || COLUMNS[neighbor].fixed) return state;
  // The place in the order without the moved column: before the left neighbor, after the right one.
  const rest = state.order.filter((other) => other !== id);
  return moveColumn(state, id, rest.indexOf(neighbor) + (step === 1 ? 1 : 0));
}

/** Hides or shows a column; `#` and Title always show (TB-5, UD8). */
export function setColumnHidden(state: ColumnState, id: ColumnId, hidden: boolean): ColumnState {
  if (!COLUMNS[id].hideable || state.hidden.includes(id) === hidden) return state;
  return { ...state, hidden: hidden ? [...state.hidden, id] : state.hidden.filter((other) => other !== id) };
}

/**
 * A header click (TB-8): ascending, then descending, then the R4 default order. With Shift
 * (TB-13): a click on a sort key flips it; a click on another column makes it the second key.
 */
export function toggleSort(state: ColumnState, id: ColumnId, secondary = false): ColumnState {
  const [first, second] = state.sort;
  if (secondary && first) {
    const flip = (key: SortKey) => ({ column: key.column, descending: !key.descending });
    if (first.column === id) return { ...state, sort: second ? [flip(first), second] : [flip(first)] };
    if (second?.column === id) return { ...state, sort: [first, flip(second)] };
    return { ...state, sort: [first, { column: id, descending: false }] };
  }
  if (first?.column !== id) return { ...state, sort: [{ column: id, descending: false }] };
  if (!first.descending) return { ...state, sort: [{ column: id, descending: true }] };
  return { ...state, sort: [] };
}

/** The CSS grid columns of the header and every row: Title takes the spare width (TB-6). */
export function gridTemplate(state: ColumnState): string {
  const columns = visibleColumns(state).map((id) =>
    id === "title" ? `minmax(${state.widths[id]}px, 1fr)` : `${state.widths[id]}px`,
  );
  return [...columns, `${HEART_WIDTH}px`].join(" ");
}

/** The table's minimum content width; a narrower container scrolls horizontally (TB-7). */
export function contentWidth(state: ColumnState): number {
  return visibleColumns(state).reduce((sum, id) => sum + state.widths[id], HEART_WIDTH);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isColumn(value: unknown): value is ColumnId {
  return typeof value === "string" && (COLUMN_IDS as readonly string[]).includes(value);
}

/**
 * Reads one saved view (UD13). Bad parts take their defaults with a warning each; an unknown
 * column is ignored and a missing one goes at the end. Null when the value is not an object.
 */
export function parseColumnState(
  value: unknown,
  defaults: ColumnState = DEFAULT_COLUMNS["songs.topBottom"],
): { state: ColumnState; warnings: string[] } | null {
  if (!isObject(value)) return null;
  const warnings: string[] = [];
  const order: ColumnId[] = [];
  if (Array.isArray(value.order)) {
    for (const id of value.order) {
      if (!isColumn(id)) warnings.push(`unknown column ${String(id)} ignored`);
      else if (!order.includes(id)) order.push(id);
    }
  } else if (value.order !== undefined) {
    warnings.push("invalid column order; using the default order");
  }
  for (const id of defaults.order) if (!order.includes(id)) order.push(id);
  const fixed = order.filter((id) => COLUMNS[id].fixed);
  const ordered = [...fixed, ...order.filter((id) => !COLUMNS[id].fixed)];
  const widths = { ...defaults.widths };
  const savedWidths = isObject(value.widths) ? value.widths : {};
  for (const id of COLUMN_IDS) {
    const width = savedWidths[id];
    if (width === undefined) continue;
    if (typeof width === "number" && Number.isFinite(width) && width >= COLUMNS[id].min) widths[id] = Math.round(width);
    else warnings.push(`invalid width of ${id}; using the default`);
  }
  const hidden = Array.isArray(value.hidden)
    ? value.hidden.filter((id): id is ColumnId => isColumn(id) && COLUMNS[id].hideable)
    : defaults.hidden;
  const sort = Array.isArray(value.sort)
    ? value.sort
        .filter((key): key is SortKey => isObject(key) && isColumn(key.column) && typeof key.descending === "boolean")
        .slice(0, 2)
        .map((key) => ({ column: key.column, descending: key.descending }))
    : [];
  return { state: { order: ordered, widths, hidden: [...new Set(hidden)], sort }, warnings };
}
