import type { AddPanelPositionOptions, DockviewApi, IDockviewPanel, Position } from "dockview-react";
import { type LibraryMode, useLibraryStore } from "@/store/library";
import { useCollapseStore } from "@/store/collapse";
import { useUiStore } from "@/store/ui";
import { DEFAULT_PRESET, type PresetId, buildPreset } from "./presets";
import { DEFAULT_SLOTS } from "./transport/slots";
import { WIDGET_IDS, WIDGETS, type WidgetId, isWidgetId } from "./widgets";

/** Reset layout sets this Library mode (UD6). */
export const RESET_MODE: LibraryMode = "columns";

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
  buildPreset(DEFAULT_PRESET, api);
}

/** Clears the dock and builds a new arrangement. The Library guard is off meanwhile (P2.3). */
export function replaceArrangement(api: DockviewApi, build: (api: DockviewApi) => void): void {
  replacing = true;
  // New groups can reuse ids, so the old collapse sizes go with the old arrangement (UD25).
  useCollapseStore.setState({ sizes: {} });
  try {
    api.clear();
    build(api);
  } finally {
    replacing = false;
  }
}

/**
 * Replaces the arrangement with a preset (DK-9, UD6) and restores the default frame sizes of all
 * modes (R28.1 v1.8). The Library mode, the band position and the lock stay.
 */
export function applyPreset(id: PresetId, api: DockviewApi | null = dock): void {
  if (!api) return;
  replaceArrangement(api, (target) => buildPreset(id, target));
  useLibraryStore.getState().resetFrames();
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
 * at the top, unlocked and the default band slots (UD20).
 */
export function resetLayout(api: DockviewApi | null = dock): void {
  if (!api) return;
  applyPreset(DEFAULT_PRESET, api);
  useLibraryStore.getState().setMode(RESET_MODE);
  useUiStore.getState().setTransportPosition("top");
  useUiStore.getState().setLocked(false);
  useUiStore.getState().setTransportSlots(DEFAULT_SLOTS);
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

/** True when the widget's group floats over the dock (DK-3). */
export function isFloating(panel: IDockviewPanel | undefined): boolean {
  return panel?.group.api.location.type === "floating";
}

/** The widget of the active dock panel (a click or F6 sets it), or null. */
export function activeWidget(api: DockviewApi | null = dock): WidgetId | null {
  const id = api?.activePanel?.id;
  return id !== undefined && isWidgetId(id) ? id : null;
}

/** Makes a widget the active dock panel, so the Layout menu acts on it (UD17). */
export function activateWidget(id: string, api: DockviewApi | null = dock): void {
  if (isWidgetId(id)) api?.getPanel(id)?.api.setActive();
}

/** The initial size of a new floating group: the widget minimum, at least 360 x 320. */
const FLOAT_WIDTH = 360;
const FLOAT_HEIGHT = 320;

/** Floats a docked widget in its own group over the dock (DK-3, UD17). */
export function floatWidget(id: WidgetId, api: DockviewApi | null = dock): void {
  const panel = api?.getPanel(id);
  if (!api || !panel || isFloating(panel)) return;
  const width = Math.max(FLOAT_WIDTH, WIDGETS[id].minWidth);
  const height = Math.max(FLOAT_HEIGHT, WIDGETS[id].minHeight);
  api.addFloatingGroup(panel, {
    width,
    height,
    x: Math.max(0, (api.width - width) / 2),
    y: Math.max(0, (api.height - height) / 2),
  });
}

const DIRECTION_TO_POSITION: Record<string, Position> = {
  left: "left",
  right: "right",
  above: "top",
  below: "bottom",
  within: "center",
};

/**
 * Docks a floating widget's group where the default preset puts the widget (UD17), next to a
 * docked reference widget. With no docked reference it goes right of Library, and Library goes
 * left of the first docked group. With nothing docked, the group becomes the grid.
 */
export function dockWidget(id: WidgetId, api: DockviewApi | null = dock): void {
  const panel = api?.getPanel(id);
  if (!api || !panel || !isFloating(panel)) return;
  const docked = (other: IDockviewPanel | undefined) => other !== undefined && other !== panel && !isFloating(other);
  const { referencePanel, direction } = showPosition(api, id) as { referencePanel?: string; direction?: string };
  const reference = referencePanel === undefined ? undefined : api.getPanel(referencePanel);
  const library = api.getPanel("library");
  const firstDocked = api.groups.find((group) => group !== panel.group && group.api.location.type === "grid");
  if (reference && docked(reference)) {
    panel.group.api.moveTo({ group: reference.group, position: DIRECTION_TO_POSITION[direction ?? "right"] });
  } else if (library && docked(library)) {
    panel.group.api.moveTo({ group: library.group, position: "right" });
  } else if (firstDocked) {
    panel.group.api.moveTo({ group: firstDocked, position: id === "library" ? "left" : "right" });
  } else {
    panel.group.api.moveTo({ position: "left" });
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
