import type { DockviewApi, SerializedDockview } from "dockview-react";
import { commands } from "@/lib/ipc/commands";
import * as log from "@/lib/log";
import { LIBRARY_MODES, type LibraryMode, useLibraryStore } from "@/store/library";
import { applyClamp } from "./clamp";
import { RESET_LAYOUT, applyLayout, replaceArrangement } from "./layouts";
import { isWidgetId } from "./widgets";

/** The `layout.json` version (P9.3, R29). */
export const LAYOUT_VERSION = 1;
/** A layout or mode change is saved this long after it (P9.3). */
export const SAVE_DELAY_MS = 500;
/** The placeholder component for widget ids this version does not know (P9.4). */
export const UNKNOWN_COMPONENT = "unknown";

/** The saved object: no window size (P9-AC8). */
export interface SavedLayout {
  version: number;
  libraryMode: LibraryMode;
  dock: SerializedDockview;
}

/** Why a saved layout was not used. */
export type Rejected = { reason: string };

/**
 * Checks a saved layout (P9.4 step 1): it must parse, have version 1, a `dock` object and a
 * known `libraryMode`. Unknown widget ids become the placeholder; their ids are returned.
 */
export function parseLayout(text: string): { layout: SavedLayout; unknown: string[] } | Rejected {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { reason: "the layout file is not valid JSON" };
  }
  if (typeof value !== "object" || value === null) return { reason: "the layout file is not an object" };
  const object = value as Record<string, unknown>;
  if (object.version !== LAYOUT_VERSION) return { reason: `unknown layout version ${String(object.version)}` };
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
  return { layout: { version: LAYOUT_VERSION, libraryMode: mode as LibraryMode, dock: serialized }, unknown };
}

/**
 * Applies a saved layout by the P9.4 order. Any failure logs one line and applies the
 * Columns layout. Returns true when the saved layout was used.
 */
export function restoreLayout(api: DockviewApi, text: string | null, size: { width: number; height: number }): boolean {
  if (text === null) return false;
  const fallback = (reason: string) => {
    log.warn(`layout: ${reason}; using Columns`);
    applyLayout(RESET_LAYOUT, api);
    return false;
  };
  const parsed = parseLayout(text);
  if ("reason" in parsed) return fallback(parsed.reason);
  const { layout, unknown } = parsed;
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
  useLibraryStore.getState().setMode(layout.libraryMode);
  // Step 5: fit the saved layout to this window; the clamp uses the saved minimums.
  api.layout(size.width, size.height, true);
  applyClamp(api);
  return true;
}

/** The object to save now. */
export function currentLayout(api: DockviewApi): SavedLayout {
  return { version: LAYOUT_VERSION, libraryMode: useLibraryStore.getState().mode, dock: api.toJSON() };
}

/**
 * Saves the layout 500 ms after each layout or mode change (P9.3). `flush` writes the
 * current layout at once, for the window close request: Dockview can report a change after
 * the request, so it does not wait for one. Returns the stop function too.
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
    if (state.mode !== previous.mode) schedule();
  });
  return {
    flush: () => write(true),
    dispose: () => {
      clearTimeout(timer);
      layoutChange.dispose();
      modeChange();
    },
  };
}
