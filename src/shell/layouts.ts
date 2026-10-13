import type { AddPanelPositionOptions, DockviewApi } from "dockview-react";
import { LIBRARY_MODES, type LibraryMode, useLibraryStore } from "@/store/library";
import { useUiStore } from "@/store/ui";
import { appleMusicClassic } from "./presets";
import { WIDGET_IDS, WIDGETS, type WidgetId } from "./widgets";

/** Built-in layouts (R29). Each one sets the default arrangement and its Library mode. */
export const LAYOUTS = LIBRARY_MODES;
export type LayoutId = LibraryMode;

export const LAYOUT_TITLES: Record<LayoutId, string> = {
  columns: "Columns",
  tree: "Tree",
  topBottom: "Top/bottom",
};

/** Reset layout sets this Library mode (UD6). */
export const RESET_LAYOUT: LayoutId = "columns";

let dock: DockviewApi | null = null;
let replacing = false;

/** Sets the dock that the menu and the keyboard act on. */
export function attachDock(api: DockviewApi | null): void {
  dock = api;
}

export function getDock(): DockviewApi | null {
  return dock;
}

/** True while a layout replaces the arrangement, so the Library guard stays off (P2.3). */
export function isReplacing(): boolean {
  return replacing;
}

/** Optional initial size and activation of a new panel. */
export interface AddOptions {
  width?: number;
  height?: number;
  /** Add the panel without making it the active tab of its group. */
  inactive?: boolean;
}

/** Adds a widget panel with its registry title, tab and minimum size (D33). */
export function addWidget(
  api: DockviewApi,
  id: WidgetId,
  position?: AddPanelPositionOptions,
  options: AddOptions = {},
): void {
  const widget = WIDGETS[id];
  api.addPanel({
    id,
    component: id,
    title: widget.title,
    tabComponent: widget.hideable ? "widget" : "library",
    minimumWidth: widget.minWidth,
    minimumHeight: widget.minHeight,
    initialWidth: options.width,
    initialHeight: options.height,
    inactive: options.inactive,
    position,
  });
}

/** The default arrangement: the default preset (DK-8, UD6). */
export function defaultArrangement(api: DockviewApi): void {
  appleMusicClassic(api);
}

/** Clears the dock and builds a new arrangement. The Library guard is off meanwhile (P2.3). */
export function replaceArrangement(api: DockviewApi, build: (api: DockviewApi) => void): void {
  replacing = true;
  try {
    api.clear();
    build(api);
  } finally {
    replacing = false;
  }
}

/**
 * Replaces the arrangement with the default preset and sets the layout's Library mode. The frame
 * sizes of all modes go back to their defaults (R28.1).
 */
export function applyLayout(id: LayoutId, api: DockviewApi | null = dock): void {
  if (!api) return;
  replaceArrangement(api, defaultArrangement);
  const library = useLibraryStore.getState();
  library.setMode(id);
  library.resetFrames();
}

/**
 * The measurement arrangement (P3.1): the default preset plus every widget it hides (Now
 * playing), so all five dock widgets and the band are in the page, in the given Library mode.
 * Lyrics leaves the Play queue tab group, so its body mounts too. It is not saved.
 */
export function applyMeasureLayout(mode: LibraryMode, api: DockviewApi | null = dock): void {
  if (!api) return;
  replaceArrangement(api, (target) => {
    defaultArrangement(target);
    setWidgetVisible("lyrics", false, target);
    addWidget(target, "lyrics", { referencePanel: "queue", direction: "below" });
    setWidgetVisible("nowPlaying", true, target);
  });
  useLibraryStore.getState().setMode(mode);
}

/**
 * Reset layout (DK-7, UD6): the default preset, Columns mode, the default frame sizes, the band
 * at the top and unlocked.
 */
export function resetLayout(api: DockviewApi | null = dock): void {
  applyLayout(RESET_LAYOUT, api);
  useUiStore.getState().setTransportPosition("top");
  useUiStore.getState().setLocked(false);
}

/**
 * Where a shown widget goes, by the default preset (UD6): Playlists left of Library; Play queue
 * and Lyrics as tabs together, else right of Library; Now playing below Playlists, else left of
 * Library.
 */
function showPosition(api: DockviewApi, id: WidgetId): AddPanelPositionOptions {
  const partner = id === "queue" ? "lyrics" : id === "lyrics" ? "queue" : null;
  if (partner && api.getPanel(partner)) return { referencePanel: partner, direction: "within" };
  if (id === "nowPlaying" && api.getPanel("playlists")) return { referencePanel: "playlists", direction: "below" };
  if (id === "playlists" || id === "nowPlaying") return { referencePanel: "library", direction: "left" };
  return { referencePanel: "library", direction: "right" };
}

/** Shows or hides a hideable widget (R29 non-drag path). Library cannot be hidden. */
export function setWidgetVisible(id: WidgetId, visible: boolean, api: DockviewApi | null = dock): void {
  if (!api || !WIDGETS[id].hideable) return;
  const panel = api.getPanel(id);
  if (visible && !panel) {
    addWidget(api, id, showPosition(api, id));
  } else if (!visible && panel) {
    api.removePanel(panel);
  }
}

/** The widgets in the dock, in registry order. */
export function visibleWidgets(api: DockviewApi): WidgetId[] {
  return WIDGET_IDS.filter((id) => api.getPanel(id) !== undefined);
}

/**
 * Re-adds Library when any path removes it (P2.3). The check runs after the current task,
 * because a move between groups also fires a remove event. It is off while a layout replaces
 * the arrangement.
 */
export function guardLibrary(
  api: DockviewApi,
  schedule: (task: () => void) => void = queueMicrotask,
): { dispose: () => void } {
  return api.onDidRemovePanel((panel) => {
    if (panel.id !== "library" || replacing) return;
    schedule(() => {
      if (!replacing && !api.getPanel("library")) addWidget(api, "library", { direction: "left" });
    });
  });
}

/**
 * Ctrl+F (R25): activates the Library tab when it shares a group, then focuses the search
 * field. A tab that was hidden mounts its body after the switch, so the focus waits up to a
 * few frames for the field. Returns false when there is no Library.
 */
export function focusLibrarySearch(doc: Document = document): boolean {
  const panel = getDock()?.getPanel("library");
  if (!panel && !doc.querySelector('[data-widget="library"]')) return false;
  panel?.api.setActive();
  const focusField = (framesLeft: number) => {
    const field = doc.querySelector<HTMLInputElement>('[data-widget="library"] input[type="search"]');
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
