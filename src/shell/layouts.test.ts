import type { DockviewApi } from "dockview-react";
import { beforeEach, describe, expect, it } from "vitest";
import { useLibraryStore } from "@/store/library";
import {
  LAYOUTS,
  applyLayout,
  attachDock,
  defaultArrangement,
  guardLibrary,
  isReplacing,
  resetLayout,
  setWidgetVisible,
  visibleWidgets,
} from "./layouts";

interface Added {
  id: string;
  tabComponent?: string;
  minimumWidth?: number;
  minimumHeight?: number;
  position?: unknown;
}

/** A dock stand-in that records panels in order. It implements the calls layouts.ts makes. */
function dockStandIn() {
  const panels: Added[] = [];
  const removeListeners: ((panel: { id: string }) => void)[] = [];
  const remove = (id: string) => {
    const index = panels.findIndex((panel) => panel.id === id);
    if (index === -1) return;
    panels.splice(index, 1);
    for (const listener of removeListeners) listener({ id });
  };
  const api = {
    addPanel: (options: Added) => {
      if (panels.some((panel) => panel.id === options.id)) throw new Error(`duplicate ${options.id}`);
      panels.push(options);
    },
    getPanel: (id: string) => panels.find((panel) => panel.id === id),
    removePanel: (panel: { id: string }) => remove(panel.id),
    clear: () => [...panels].forEach((panel) => remove(panel.id)),
    onDidRemovePanel: (listener: (panel: { id: string }) => void) => {
      removeListeners.push(listener);
      return { dispose: () => removeListeners.splice(removeListeners.indexOf(listener), 1) };
    },
  };
  return { api: api as unknown as DockviewApi, panels, remove };
}

beforeEach(() => {
  useLibraryStore.setState({ mode: "columns" });
  attachDock(null);
});

describe("defaultArrangement (P2.4)", () => {
  it("adds Library, then Now playing below it and Transport controls beside Now playing", () => {
    const { api, panels } = dockStandIn();
    defaultArrangement(api);
    expect(panels.map((panel) => [panel.id, panel.position])).toEqual([
      ["library", undefined],
      ["nowPlaying", { referencePanel: "library", direction: "below" }],
      ["transport", { referencePanel: "nowPlaying", direction: "right" }],
    ]);
  });

  it("gives each panel its registry minimum and the Library tab variant (D33, P2.3)", () => {
    const { api, panels } = dockStandIn();
    defaultArrangement(api);
    expect(panels.map((panel) => [panel.id, panel.tabComponent, panel.minimumWidth, panel.minimumHeight])).toEqual([
      ["library", "library", 320, 240],
      ["nowPlaying", "widget", 240, 88],
      ["transport", "widget", 320, 88],
    ]);
  });
});

describe("applyLayout and resetLayout (P2.4)", () => {
  it.each(LAYOUTS)("applies %s: the default arrangement and its Library mode", (id) => {
    const { api } = dockStandIn();
    defaultArrangement(api);
    setWidgetVisible("queue", true, api);
    applyLayout(id, api);
    expect(visibleWidgets(api)).toEqual(["library", "transport", "nowPlaying"]);
    expect(useLibraryStore.getState().mode).toBe(id);
  });

  it("reset applies Columns", () => {
    const { api } = dockStandIn();
    useLibraryStore.setState({ mode: "tree" });
    resetLayout(api);
    expect(useLibraryStore.getState().mode).toBe("columns");
    expect(visibleWidgets(api)).toEqual(["library", "transport", "nowPlaying"]);
  });

  it("keeps exactly one Library over 20 applications with the guard on", async () => {
    const { api, panels } = dockStandIn();
    guardLibrary(api);
    defaultArrangement(api);
    for (let index = 0; index < 20; index += 1) applyLayout(LAYOUTS[index % 3], api);
    await Promise.resolve();
    expect(panels.filter((panel) => panel.id === "library")).toHaveLength(1);
  });

  it("clears the replacing flag even when building fails", () => {
    const { api } = dockStandIn();
    const failing = {
      ...api,
      addPanel: () => {
        throw new Error("boom");
      },
    } as unknown as DockviewApi;
    expect(() => applyLayout("tree", failing)).toThrow("boom");
    expect(isReplacing()).toBe(false);
  });

  it("does nothing without a dock", () => {
    expect(() => resetLayout()).not.toThrow();
  });
});

describe("setWidgetVisible (R29 non-drag path)", () => {
  it("shows Playlists, Play queue and Lyrics right of Library and hides them again", () => {
    const { api, panels } = dockStandIn();
    defaultArrangement(api);
    for (const id of ["playlists", "queue", "lyrics"] as const) {
      setWidgetVisible(id, true, api);
      expect(panels.at(-1)).toMatchObject({ id, position: { referencePanel: "library", direction: "right" } });
      setWidgetVisible(id, false, api);
      expect(api.getPanel(id)).toBeUndefined();
    }
  });

  it("puts Now playing back left of Transport controls, or below Library alone", () => {
    const { api, panels } = dockStandIn();
    defaultArrangement(api);
    setWidgetVisible("nowPlaying", false, api);
    setWidgetVisible("nowPlaying", true, api);
    expect(panels.at(-1)?.position).toMatchObject({ direction: "left" });
    setWidgetVisible("nowPlaying", false, api);
    setWidgetVisible("transport", false, api);
    setWidgetVisible("transport", true, api);
    expect(panels.at(-1)?.position).toEqual({ referencePanel: "library", direction: "below" });
  });

  it("never hides Library (R28)", () => {
    const { api } = dockStandIn();
    defaultArrangement(api);
    setWidgetVisible("library", false, api);
    expect(api.getPanel("library")).toBeDefined();
  });
});

describe("guardLibrary (P2.3)", () => {
  it("re-adds Library when a user action removes it", () => {
    const { api, remove } = dockStandIn();
    const tasks: (() => void)[] = [];
    guardLibrary(api, (task) => tasks.push(task));
    defaultArrangement(api);
    remove("library");
    expect(api.getPanel("library")).toBeUndefined();
    tasks.forEach((task) => task());
    expect(api.getPanel("library")).toBeDefined();
  });

  it("does not re-add Library after a move put it back", () => {
    const { api, remove, panels } = dockStandIn();
    const tasks: (() => void)[] = [];
    guardLibrary(api, (task) => tasks.push(task));
    defaultArrangement(api);
    remove("library");
    panels.push({ id: "library" });
    tasks.forEach((task) => task());
    expect(panels.filter((panel) => panel.id === "library")).toHaveLength(1);
  });

  it("stays off while a layout replaces the arrangement", () => {
    const { api } = dockStandIn();
    const tasks: (() => void)[] = [];
    guardLibrary(api, (task) => tasks.push(task));
    defaultArrangement(api);
    applyLayout("tree", api);
    expect(tasks).toEqual([]);
  });
});
