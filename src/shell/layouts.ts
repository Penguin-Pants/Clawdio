import { create } from "zustand";
import type { LibraryMode } from "@/lib/ipc/commands";
import { useLibraryStore } from "@/store/library";
import { useUiStore } from "@/store/ui";
import { GRID, type Layout, type Rect, hide, moveTo, place, resizeTo, show } from "./grid/engine";
import { DEFAULT_PRESET, PRESETS, type PresetId } from "./presets";
import { DEFAULT_SLOTS } from "./transport/slots";
import { WIDGETS, type WidgetId, isWidgetId, minOf } from "./widgets";

interface GridState {
  /** The widget rectangles in cells (R38.2). A widget that is not in it is hidden. */
  layout: Layout;
  /** The widget the menu's move and resize act on: the last one clicked or focused (R38.10). */
  active: WidgetId | null;
}

export const useGridStore = create<GridState>()(() => ({
  layout: PRESETS[DEFAULT_PRESET].layout,
  active: null,
}));

/** The status line text of a refused show, move or resize (R38.4, R38.7). */
export const NO_ROOM = "Not enough room in the grid";

function setLayout(layout: Layout): void {
  useGridStore.setState({ layout });
}

/** True when the widget is in the grid. */
export function isShown(id: WidgetId, layout: Layout = useGridStore.getState().layout): boolean {
  return layout[id] !== undefined;
}

/** Replaces the arrangement with a preset (R38.8). The lock and the band slots stay. */
export function applyPreset(id: PresetId): void {
  setLayout(PRESETS[id].layout);
}

/** Reset layout (R38.8, R29): the Default preset and the default band slots (UD20). */
export function resetLayout(): void {
  applyPreset(DEFAULT_PRESET);
  useUiStore.getState().setTransportSlots(DEFAULT_SLOTS);
}

/** The status line text when Arrange mode starts. */
export const ARRANGE_MESSAGE = "Arrange layout: drag a widget to move it, drag an edge to resize. Esc to finish";

/** True while Arrange mode is on: only then can widgets move or resize (owner answer Q13). */
function arranging(): boolean {
  return useUiStore.getState().arranging;
}

/** Turns Arrange mode on or off (menu and Ctrl+Shift+A). Starting it says how it works. */
export function toggleArrange(): void {
  const on = !arranging();
  useUiStore.getState().setArranging(on);
  if (on) useUiStore.getState().showMessage(ARRANGE_MESSAGE);
}

/**
 * Shows or hides a widget (R38.7). Songs and Transport controls cannot be hidden. A show that
 * finds no room is refused with a status line message. Returns true when the widget shows now.
 */
export function setWidgetVisible(id: WidgetId, visible: boolean): boolean {
  const { layout } = useGridStore.getState();
  if (!visible) {
    if (WIDGETS[id].hideable && layout[id]) setLayout(hide(layout, id));
    return layout[id] !== undefined && !WIDGETS[id].hideable;
  }
  if (layout[id]) return true;
  const next = show(layout, id, minOf);
  if (!next) {
    useUiStore.getState().showMessage(`${NO_ROOM}: ${WIDGETS[id].title} is hidden`);
    return false;
  }
  setLayout(next);
  return true;
}

/**
 * Puts a widget at `rect` after a drag (R38.4, R38.5). A refused drop changes nothing. Outside
 * Arrange mode every change is refused. Returns true when the layout changed.
 */
export function commitRect(id: WidgetId, rect: Rect): boolean {
  if (!arranging()) return false;
  const next = place(useGridStore.getState().layout, id, rect, minOf);
  if (next) setLayout(next);
  return next !== null;
}

/** The layout a drop would give, for the preview (R38.4); null shows the refused preview. */
export function previewRect(id: WidgetId, rect: Rect): Layout | null {
  return place(useGridStore.getState().layout, id, rect, minOf);
}

/** Moves a widget one or more cells (R38.10). A refused move says so in the status line. */
export function moveWidgetBy(id: WidgetId, dx: number, dy: number): boolean {
  const { layout } = useGridStore.getState();
  const rect = layout[id];
  if (!rect || !arranging()) return false;
  const x = Math.min(GRID - rect.w, Math.max(0, rect.x + dx));
  const y = Math.min(GRID - rect.h, Math.max(0, rect.y + dy));
  if (x === rect.x && y === rect.y) return false;
  const next = moveTo(layout, id, x, y, minOf);
  if (!next) useUiStore.getState().showMessage(NO_ROOM);
  else setLayout(next);
  return next !== null;
}

/** Resizes a widget by one or more cells from its top left cell (R38.10). */
export function resizeWidgetBy(id: WidgetId, dw: number, dh: number): boolean {
  const { layout } = useGridStore.getState();
  const rect = layout[id];
  if (!rect || !arranging()) return false;
  const next = resizeTo(layout, id, rect.w + dw, rect.h + dh, minOf);
  const same = next?.[id].w === rect.w && next?.[id].h === rect.h;
  if (!next) useUiStore.getState().showMessage(NO_ROOM);
  else if (!same) setLayout(next);
  return next !== null && !same;
}

/** The widget the menu acts on, when it is still in the grid. */
export function activeWidget(): WidgetId | null {
  const { active, layout } = useGridStore.getState();
  return active !== null && layout[active] ? active : null;
}

/** Makes a widget the active one (a click, a focus or F6). */
export function activateWidget(id: string): void {
  if (isWidgetId(id) && useGridStore.getState().active !== id) useGridStore.setState({ active: id });
}

/**
 * The measurement arrangement (P3.1): a preset by the measured mode name, then every hidden
 * widget shown where it fits, so the measured app mounts every widget it can. It is not saved.
 */
export function applyMeasureLayout(mode: LibraryMode): void {
  const preset: PresetId = mode === "tree" ? "tree" : mode === "columns" ? "columns" : "default";
  let layout = PRESETS[preset].layout;
  for (const id of Object.keys(WIDGETS) as WidgetId[]) layout = show(layout, id, minOf) ?? layout;
  setLayout(layout);
}

/**
 * Ctrl+F (R25): shows the Search widget when it is hidden, leaves a shown playlist for the
 * library (R12 v1.9), then focuses the search field. A widget that mounts now gets its field a
 * few frames later. Returns false when the Search widget cannot show.
 */
export function focusLibrarySearch(doc: Document = document): boolean {
  if (!setWidgetVisible("search", true)) return false;
  useLibraryStore.getState().showPlaylist(null);
  activateWidget("search");
  const focusField = (framesLeft: number) => {
    const field = doc.querySelector<HTMLInputElement>('[data-widget="search"] input[type="search"]');
    if (field) {
      field.focus();
      field.select();
    } else if (framesLeft > 0) {
      requestAnimationFrame(() => focusField(framesLeft - 1));
    }
  };
  focusField(10);
  return true;
}
