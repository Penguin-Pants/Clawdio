import type { AddPanelPositionOptions, DockviewApi } from "dockview-react";
import { LIBRARY_MODES, type LibraryMode, useLibraryStore } from "@/store/library";
import { WIDGET_IDS, WIDGETS, type WidgetId } from "./widgets";

/** Built-in layouts (R29). Each one sets the default arrangement and its Library mode. */
export const LAYOUTS = LIBRARY_MODES;
export type LayoutId = LibraryMode;

export const LAYOUT_TITLES: Record<LayoutId, string> = {
  columns: "Columns",
  tree: "Tree",
  topBottom: "Top/bottom",
};

/** Reset layout applies this built-in layout (R29). */
export const RESET_LAYOUT: LayoutId = "columns";

/** Initial height of the bottom row in the default arrangement. */
const BOTTOM_ROW_HEIGHT = 112;

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

/** Adds a widget panel with its registry title, tab and minimum size (D33). */
export function addWidget(
  api: DockviewApi,
  id: WidgetId,
  position?: AddPanelPositionOptions,
  initialHeight?: number,
): void {
  const widget = WIDGETS[id];
  api.addPanel({
    id,
    component: id,
    title: widget.title,
    tabComponent: widget.hideable ? "widget" : "library",
    minimumWidth: widget.minWidth,
    minimumHeight: widget.minHeight,
    initialHeight,
    position,
  });
}

/**
 * The default arrangement (R29): Library in the main area, Now playing beside Transport
 * controls in a bottom row. Playlists, Play queue and Lyrics are not added.
 */
export function defaultArrangement(api: DockviewApi): void {
  addWidget(api, "library");
  addWidget(api, "nowPlaying", { referencePanel: "library", direction: "below" }, BOTTOM_ROW_HEIGHT);
  addWidget(api, "transport", { referencePanel: "nowPlaying", direction: "right" });
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

/** Replaces the arrangement with the default one and sets the layout's Library mode. */
export function applyLayout(id: LayoutId, api: DockviewApi | null = dock): void {
  if (!api) return;
  replaceArrangement(api, defaultArrangement);
  useLibraryStore.getState().setMode(id);
}

/**
 * The measurement arrangement (P3.1): the default arrangement plus Playlists, Play queue and
 * Lyrics, in the given Library mode. It is not saved.
 */
export function applyMeasureLayout(mode: LibraryMode, api: DockviewApi | null = dock): void {
  if (!api) return;
  replaceArrangement(api, (target) => {
    defaultArrangement(target);
    for (const id of ["playlists", "queue", "lyrics"] as const) setWidgetVisible(id, true, target);
  });
  useLibraryStore.getState().setMode(mode);
}

export function resetLayout(api: DockviewApi | null = dock): void {
  applyLayout(RESET_LAYOUT, api);
}

/** Where a shown widget goes: the bottom row for Now playing and Transport, else right of Library. */
function showPosition(api: DockviewApi, id: WidgetId): AddPanelPositionOptions {
  if (id === "nowPlaying" || id === "transport") {
    const partner = api.getPanel(id === "nowPlaying" ? "transport" : "nowPlaying");
    if (partner) return { referencePanel: partner, direction: id === "nowPlaying" ? "left" : "right" };
    return { referencePanel: "library", direction: "below" };
  }
  return { referencePanel: "library", direction: "right" };
}

/** Shows or hides a hideable widget (R29 non-drag path). Library cannot be hidden. */
export function setWidgetVisible(id: WidgetId, visible: boolean, api: DockviewApi | null = dock): void {
  if (!api || !WIDGETS[id].hideable) return;
  const panel = api.getPanel(id);
  if (visible && !panel) {
    const position = showPosition(api, id);
    addWidget(api, id, position, id === "nowPlaying" || id === "transport" ? BOTTOM_ROW_HEIGHT : undefined);
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
