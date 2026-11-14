import { commands } from "@/lib/ipc/commands";
import * as log from "@/lib/log";
import { useUiStore } from "@/store/ui";
import { type Layout, type Rect, isValidLayout, show } from "./grid/engine";
import { resetLayout, useGridStore } from "./layouts";
import { type TransportSlots, parseSlots } from "./transport/slots";
import { WIDGET_IDS, type WidgetId, isWidgetId, minOf } from "./widgets";

/**
 * The `layout.json` version (R38.11). Version 2 (P23 to P28) held a Dockview arrangement, the
 * Library mode and frame sizes; version 1 held a transport dock panel. Neither is migrated.
 */
export const LAYOUT_VERSION = 3;
/** A layout change is saved this long after it (P9.3). */
export const SAVE_DELAY_MS = 500;

/** The saved object: no window size (P9-AC8). */
export interface SavedLayout {
  version: number;
  /** The band slot order and hidden set (UD20). Optional in the file: none gives the defaults. */
  transportSlots: TransportSlots;
  /** The shown widgets and their cells, 0-based from the top left (R38.2). */
  widgets: Layout;
}

/** Widgets that are always in the grid (R38.7). */
const REQUIRED: readonly WidgetId[] = ["songs", "transport"];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRect(value: unknown): value is Rect {
  return (
    isObject(value) &&
    Object.keys(value).length === 4 &&
    ["x", "y", "w", "h"].every((key) => typeof value[key] === "number")
  );
}

/** Why a saved layout was not used, with the file's version when it had a number. */
export type Rejected = { reason: string; version?: number };

/**
 * Checks a saved layout (R38.11): it must parse, have version 3 and a `widgets` object whose
 * rectangles are whole cells inside the grid, at least the widget minimum and without overlap.
 * Unknown widget ids are ignored with a warning. A missing Songs or Transport controls is added
 * where it fits; when it does not fit the file is rejected. A `locked` key (Lock layout, removed by
 * owner answer Q13) is ignored. A bad `transportSlots`
 * value takes its default with a warning.
 */
export function parseLayout(text: string): { layout: SavedLayout; warnings: string[] } | Rejected {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { reason: "the layout file is not valid JSON" };
  }
  if (!isObject(value)) return { reason: "the layout file is not an object" };
  if (value.version !== LAYOUT_VERSION) {
    const reason = `unknown layout version ${String(value.version)}`;
    return typeof value.version === "number" ? { reason, version: value.version } : { reason };
  }
  if (!isObject(value.widgets)) return { reason: "the layout has no widgets" };
  const warnings: string[] = [];
  let widgets: Layout = {};
  for (const [id, rect] of Object.entries(value.widgets)) {
    if (!isWidgetId(id)) {
      warnings.push(`unknown widget ${id} ignored`);
      continue;
    }
    if (!isRect(rect)) return { reason: `the ${id} widget has no valid cells` };
    widgets = { ...widgets, [id]: { x: rect.x, y: rect.y, w: rect.w, h: rect.h } };
  }
  if (!isValidLayout(widgets, minOf)) return { reason: "the widgets leave the grid, overlap or are too small" };
  for (const id of REQUIRED) {
    if (widgets[id]) continue;
    const next = show(widgets, id, minOf);
    if (!next) return { reason: `the layout has no ${id} widget and no room for it` };
    warnings.push(`the ${id} widget was missing; added`);
    widgets = next;
  }
  const slots = parseSlots(value.transportSlots);
  warnings.push(...slots.warnings);
  return { layout: { version: LAYOUT_VERSION, transportSlots: slots.slots, widgets }, warnings };
}

/**
 * Applies a saved layout (R38.11). A file that fails is backed up as `layout.json.bak` with one
 * log line, and Reset layout loads the Default preset. Returns true when the saved layout was
 * used. No file keeps the Default preset.
 */
export function restoreLayout(
  text: string | null,
  backup: () => Promise<void> = () => commands.layoutBackup(),
): boolean {
  if (text === null) return false;
  const parsed = parseLayout(text);
  if ("reason" in parsed) {
    log.warn(`layout: ${parsed.reason}; backed up as layout.json.bak; using the Default preset`);
    backup().catch((error: unknown) => log.warn(`layout: cannot back up: ${String(error)}`));
    resetLayout();
    return false;
  }
  for (const warning of parsed.warnings) log.warn(`layout: ${warning}`);
  const { layout } = parsed;
  useGridStore.setState({ layout: layout.widgets });
  useUiStore.getState().setTransportSlots(layout.transportSlots);
  return true;
}

/** The object to save now, with the widgets in registry order. */
export function currentLayout(): SavedLayout {
  const ui = useUiStore.getState();
  const { layout } = useGridStore.getState();
  const widgets: Record<string, Rect> = {};
  for (const id of WIDGET_IDS) if (layout[id]) widgets[id] = layout[id];
  return { version: LAYOUT_VERSION, transportSlots: ui.transportSlots, widgets };
}

/**
 * Saves the layout 500 ms after each change of the widgets or the band slots (P9.3).
 * `flush` writes the current layout at once, for the window close request.
 */
export function watchLayout(save: (json: string) => Promise<void> = (json) => commands.layoutSave(json)): {
  flush: () => Promise<void>;
  dispose: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending = false;
  const write = async (force: boolean) => {
    clearTimeout(timer);
    timer = undefined;
    if (!pending && !force) return;
    pending = false;
    try {
      await save(JSON.stringify(currentLayout()));
    } catch (error) {
      log.warn(`layout: cannot save: ${String(error)}`);
    }
  };
  const schedule = () => {
    pending = true;
    clearTimeout(timer);
    timer = setTimeout(() => void write(false), SAVE_DELAY_MS);
  };
  const gridChange = useGridStore.subscribe((state, previous) => {
    if (state.layout !== previous.layout) schedule();
  });
  const uiChange = useUiStore.subscribe((state, previous) => {
    if (state.transportSlots !== previous.transportSlots) schedule();
  });
  return {
    flush: () => write(true),
    dispose: () => {
      clearTimeout(timer);
      gridChange();
      uiChange();
    },
  };
}
