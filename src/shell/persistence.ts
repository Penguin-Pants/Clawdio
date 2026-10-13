import type { DockviewApi, SerializedDockview } from "dockview-react";
import { commands } from "@/lib/ipc/commands";
import * as log from "@/lib/log";
import { DEFAULT_FRAMES, LIBRARY_MODES, type LibraryFrames, type LibraryMode, useLibraryStore } from "@/store/library";
import { useCollapseStore } from "@/store/collapse";
import { type TransportPosition, useUiStore } from "@/store/ui";
import { applyClamp } from "./clamp";
import { replaceArrangement, resetLayout } from "./layouts";
import { collapsedSizes, restoreCollapsed } from "./splitters";
import { type TransportSlots, parseSlots } from "./transport/slots";
import { isWidgetId } from "./widgets";

/** The `layout.json` version (UD5). Version 1 (P9 to P23) held a `transport` dock panel. */
export const LAYOUT_VERSION = 2;
/** A layout or mode change is saved this long after it (P9.3). */
export const SAVE_DELAY_MS = 500;
/** The placeholder component for widget ids this version does not know (P9.4). */
export const UNKNOWN_COMPONENT = "unknown";

/** The saved object: no window size (P9-AC8). */
export interface SavedLayout {
  version: number;
  /** The transport band position (SH-6, UD5). */
  transport: TransportPosition;
  /** Lock layout (DK-5, UD5). */
  locked: boolean;
  /** The band slot order and hidden set (UD20). Optional in the file: none gives the defaults. */
  transportSlots: TransportSlots;
  libraryMode: LibraryMode;
  /** Optional in the file (D55): a file without it loads with the default sizes. */
  libraryFrames: LibraryFrames;
  /**
   * Collapsed groups and their sizes before the collapse (PS-5, UD25). Optional in the file;
   * `restoreCollapsed` checks a loaded value.
   */
  collapsed: unknown;
  dock: SerializedDockview;
}

/** A sum of fractions this close to 1 is accepted (D55). */
const FRACTION_SUM_TOLERANCE = 0.01;
/** Floating-point slack, so a sum exactly at the tolerance (0.33 + 0.33 + 0.33) passes. */
const FLOAT_EPSILON = 1e-9;

/** True for `length` finite positive numbers that add up to 1 (D55). */
function isFractions(value: unknown, length: number): value is number[] {
  if (!Array.isArray(value) || value.length !== length) return false;
  if (!value.every((item) => typeof item === "number" && Number.isFinite(item) && item > 0)) return false;
  const sum = (value as number[]).reduce((total, item) => total + item, 0);
  return Math.abs(sum - 1) <= FRACTION_SUM_TOLERANCE + FLOAT_EPSILON;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads `libraryFrames` (D55). An invalid mode entry, or one with an unknown property, gives that
 * mode its defaults; an unknown mode key is ignored. Each case adds one warning.
 */
export function parseFrames(value: unknown): { frames: LibraryFrames; warnings: string[] } {
  if (value === undefined) return { frames: DEFAULT_FRAMES, warnings: [] };
  if (!isObject(value)) return { frames: DEFAULT_FRAMES, warnings: ["libraryFrames is not an object"] };
  const warnings: string[] = [];
  for (const key of Object.keys(value)) {
    if (key !== "columns" && key !== "topBottom") warnings.push(`unknown libraryFrames mode ${key} ignored`);
  }
  let columns = DEFAULT_FRAMES.columns;
  if (value.columns !== undefined) {
    if (isFractions(value.columns, 3)) columns = value.columns;
    else warnings.push("invalid libraryFrames.columns; using the default sizes");
  }
  let topBottom = DEFAULT_FRAMES.topBottom;
  const entry = value.topBottom;
  if (entry !== undefined) {
    const valid =
      isObject(entry) &&
      Object.keys(entry).every((key) => key === "top" || key === "rows") &&
      isFractions(entry.top, 2) &&
      isFractions(entry.rows, 2);
    if (valid) topBottom = { top: entry.top as number[], rows: entry.rows as number[] };
    else warnings.push("invalid libraryFrames.topBottom; using the default sizes");
  }
  return { frames: { columns, topBottom }, warnings };
}

/** Why a saved layout was not used, with the file's version when it had a number. */
export type Rejected = { reason: string; version?: number };

/**
 * Checks a saved layout (P9.4 step 1, UD5): it must parse, have version 2, a `dock` object and
 * a known `libraryMode`. A bad `transport` or `locked` value takes its default with a warning.
 * Unknown widget ids become the placeholder; their ids are returned.
 */
export function parseLayout(
  text: string,
): { layout: SavedLayout; unknown: string[]; frameWarnings: string[] } | Rejected {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { reason: "the layout file is not valid JSON" };
  }
  if (typeof value !== "object" || value === null) return { reason: "the layout file is not an object" };
  const object = value as Record<string, unknown>;
  if (object.version !== LAYOUT_VERSION) {
    const reason = `unknown layout version ${String(object.version)}`;
    return typeof object.version === "number" ? { reason, version: object.version } : { reason };
  }
  const dock = object.dock;
  if (typeof dock !== "object" || dock === null || Array.isArray(dock)) return { reason: "the layout has no dock" };
  const mode = object.libraryMode;
  if (typeof mode !== "string" || !(LIBRARY_MODES as readonly string[]).includes(mode)) {
    return { reason: `unknown Library mode ${String(mode)}` };
  }
  const serialized = dock as SerializedDockview;
  const unknown: string[] = [];
  for (const [id, panel] of Object.entries(serialized.panels ?? {})) {
    const component = panel.contentComponent ?? id;
    if (!isWidgetId(component) || !isWidgetId(id)) {
      unknown.push(id);
      panel.contentComponent = UNKNOWN_COMPONENT;
    }
  }
  const { frames, warnings } = parseFrames(object.libraryFrames);
  let transport: TransportPosition = "top";
  if (object.transport === "top" || object.transport === "bottom") transport = object.transport;
  else warnings.push(`invalid transport ${JSON.stringify(object.transport)}; using top`);
  let locked = false;
  if (typeof object.locked === "boolean") locked = object.locked;
  else warnings.push(`invalid locked ${JSON.stringify(object.locked)}; using unlocked`);
  const slots = parseSlots(object.transportSlots);
  warnings.push(...slots.warnings);
  return {
    layout: {
      version: LAYOUT_VERSION,
      transport,
      locked,
      transportSlots: slots.slots,
      libraryMode: mode as LibraryMode,
      libraryFrames: frames,
      collapsed: object.collapsed,
      dock: serialized,
    },
    unknown,
    frameWarnings: warnings,
  };
}

/**
 * Applies a saved layout by the P9.4 order. A file that fails (PS-4, UD5) is backed up as
 * `layout.json.bak` with one log line, and the default preset loads (Reset layout). Returns
 * true when the saved layout was used.
 */
export function restoreLayout(
  api: DockviewApi,
  text: string | null,
  size: { width: number; height: number },
  backup: () => Promise<void> = () => commands.layoutBackup(),
): boolean {
  if (text === null) return false;
  const reset = (line: string) => {
    log.warn(line);
    backup().catch((error: unknown) => log.warn(`layout: cannot back up: ${String(error)}`));
    resetLayout(api);
    return false;
  };
  const fallback = (reason: string) =>
    reset(`layout: ${reason}; backed up as layout.json.bak; using the default preset`);
  const parsed = parseLayout(text);
  if ("reason" in parsed) {
    // A P9 to P23 file holds a transport dock panel; it is not migrated (UD5).
    return parsed.version === 1 ? reset("layout: version 1 backed up as layout.json.bak") : fallback(parsed.reason);
  }
  const { layout, unknown, frameWarnings } = parsed;
  try {
    replaceArrangement(api, (target) => {
      target.fromJSON(layout.dock);
      // Panels of unknown widgets go after the load (step 2).
      for (const id of unknown) {
        const panel = target.getPanel(id);
        if (panel) target.removePanel(panel);
      }
    });
  } catch (error) {
    return fallback(`the dock cannot load: ${String(error)}`);
  }
  if (unknown.length > 0) log.warn(`layout: unknown widget ids removed: ${unknown.join(", ")}`);
  if (!api.getPanel("library")) return fallback("the layout has no Library widget");
  useUiStore.getState().setTransportPosition(layout.transport);
  useUiStore.getState().setLocked(layout.locked);
  useUiStore.getState().setTransportSlots(layout.transportSlots);
  useLibraryStore.getState().setMode(layout.libraryMode);
  for (const warning of frameWarnings) log.warn(`layout: ${warning}`);
  useLibraryStore.getState().setAllFrames(layout.libraryFrames);
  // After the dock load: the entries name its group ids, and the load cleared the old ones.
  for (const warning of restoreCollapsed(layout.collapsed, api)) log.warn(`layout: ${warning}`);
  // Step 5: fit the saved layout to this window; the clamp uses the saved minimums.
  api.layout(size.width, size.height, true);
  applyClamp(api);
  return true;
}

/** The object to save now. */
export function currentLayout(api: DockviewApi): SavedLayout {
  const library = useLibraryStore.getState();
  const ui = useUiStore.getState();
  return {
    version: LAYOUT_VERSION,
    transport: ui.transportPosition,
    locked: ui.locked,
    transportSlots: ui.transportSlots,
    libraryMode: library.mode,
    libraryFrames: library.frames,
    collapsed: collapsedSizes(),
    dock: api.toJSON(),
  };
}

/**
 * Saves the layout 500 ms after each layout, mode or frame size change (P9.3, P22.3). `flush`
 * writes the current layout at once, for the window close request: Dockview can report a change
 * after the request, so it does not wait for one. Returns the stop function too.
 */
export function watchLayout(
  api: DockviewApi,
  save: (json: string) => Promise<void> = (json) => commands.layoutSave(json),
): { flush: () => Promise<void>; dispose: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending = false;
  const write = async (force: boolean) => {
    clearTimeout(timer);
    timer = undefined;
    if (!pending && !force) return;
    pending = false;
    try {
      await save(JSON.stringify(currentLayout(api)));
    } catch (error) {
      log.warn(`layout: cannot save: ${String(error)}`);
    }
  };
  const schedule = () => {
    pending = true;
    clearTimeout(timer);
    timer = setTimeout(() => void write(false), SAVE_DELAY_MS);
  };
  const layoutChange = api.onDidLayoutChange(schedule);
  const modeChange = useLibraryStore.subscribe((state, previous) => {
    if (state.mode !== previous.mode || state.frames !== previous.frames) schedule();
  });
  const uiChange = useUiStore.subscribe((state, previous) => {
    if (
      state.transportPosition !== previous.transportPosition ||
      state.locked !== previous.locked ||
      state.transportSlots !== previous.transportSlots
    )
      schedule();
  });
  const collapseChange = useCollapseStore.subscribe(schedule);
  return {
    flush: () => write(true),
    dispose: () => {
      clearTimeout(timer);
      layoutChange.dispose();
      collapseChange();
      modeChange();
      uiChange();
    },
  };
}
