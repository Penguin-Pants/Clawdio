import type { DockviewApi } from "dockview-react";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_FRAMES, useLibraryStore } from "@/store/library";
import { useCollapseStore } from "@/store/collapse";
import { useUiStore } from "@/store/ui";
import {
  applyMeasureLayout,
  applyPreset,
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
  initialWidth?: number;
  inactive?: boolean;
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
    getPanel: (id: string) => {
      const panel = panels.find((added) => added.id === id);
      return panel && { ...panel, api: { setActive: () => {} } };
    },
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

describe("defaultArrangement: the default preset (DK-8, UD6)", () => {
  it("adds Library, Playlists left at 240 px, Play queue right at 280 px and Lyrics as its inactive tab", () => {
    const { api, panels } = dockStandIn();
    defaultArrangement(api);
    expect(panels.map((panel) => [panel.id, panel.position, panel.initialWidth, panel.inactive])).toEqual([
      ["library", undefined, undefined, undefined],
      ["playlists", { referencePanel: "library", direction: "left" }, 240, undefined],
      ["queue", { referencePanel: "library", direction: "right" }, 280, undefined],
      ["lyrics", { referencePanel: "queue", direction: "within" }, undefined, true],
    ]);
    expect(api.getPanel("nowPlaying")).toBeUndefined();
  });

  it("gives each panel its registry minimum and the Library tab variant (D33, P2.3)", () => {
    const { api, panels } = dockStandIn();
    defaultArrangement(api);
    expect(panels.map((panel) => [panel.id, panel.tabComponent, panel.minimumWidth, panel.minimumHeight])).toEqual([
      ["library", "library", 320, 240],
      ["playlists", "widget", 56, 160],
      ["queue", "widget", 200, 160],
      ["lyrics", "widget", 200, 160],
    ]);
  });
});

describe("applyPreset and resetLayout (P2.4, UD6)", () => {
  it("a preset replaces the arrangement and keeps the Library mode", () => {
    const { api } = dockStandIn();
    defaultArrangement(api);
    useLibraryStore.setState({ mode: "tree" });
    useCollapseStore.setState({ sizes: { g1: { axis: "width", size: 320 } } });
    applyPreset("compact", api);
    expect(visibleWidgets(api)).toEqual(["library"]);
    expect(useLibraryStore.getState().mode).toBe("tree");
    // New groups can reuse ids: the old collapse sizes go with the old arrangement.
    expect(useCollapseStore.getState().sizes).toEqual({});
  });

  it("reset applies the default preset, Columns, the band at the top and unlocked (UD6)", () => {
    const { api } = dockStandIn();
    useLibraryStore.setState({ mode: "tree" });
    useUiStore.setState({ transportPosition: "bottom", locked: true });
    resetLayout(api);
    expect(useUiStore.getState()).toMatchObject({ transportPosition: "top", locked: false });
    expect(useLibraryStore.getState().mode).toBe("columns");
    expect(visibleWidgets(api)).toEqual(["library", "playlists", "queue", "lyrics"]);
  });

  it("keeps exactly one Library over 20 applications with the guard on", async () => {
    const { api, panels } = dockStandIn();
    guardLibrary(api);
    defaultArrangement(api);
    const presets = ["appleMusicClassic", "musicBee", "compact"] as const;
    for (let index = 0; index < 20; index += 1) applyPreset(presets[index % 3], api);
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
    expect(() => applyPreset("compact", failing)).toThrow("boom");
    expect(isReplacing()).toBe(false);
  });

  it("does nothing without a dock", () => {
    expect(() => resetLayout()).not.toThrow();
  });

  it("a preset restores the frame sizes of all modes (R28.1 v1.8)", () => {
    const { api } = dockStandIn();
    useLibraryStore.getState().setFrames("columns", [0.6, 0.2, 0.2]);
    applyPreset("musicBee", api);
    expect(useLibraryStore.getState().frames).toEqual(DEFAULT_FRAMES);
  });

  it("reset restores the frame sizes of all modes (P22-AC1)", () => {
    const { api } = dockStandIn();
    useLibraryStore.getState().setFrames("top", [0.9, 0.1]);
    resetLayout(api);
    expect(useLibraryStore.getState().frames).toEqual(DEFAULT_FRAMES);
  });
});

describe("applyMeasureLayout (P3.1)", () => {
  it("shows all five dock widgets in the given mode, Lyrics in its own group", () => {
    const { api, panels } = dockStandIn();
    guardLibrary(api);
    defaultArrangement(api);
    applyMeasureLayout("topBottom", api);
    expect(visibleWidgets(api)).toEqual(["library", "nowPlaying", "playlists", "queue", "lyrics"]);
    expect(panels.find((panel) => panel.id === "lyrics")?.position).toEqual({
      referencePanel: "queue",
      direction: "below",
    });
    expect(useLibraryStore.getState().mode).toBe("topBottom");
  });
});

describe("setWidgetVisible (R29 non-drag path)", () => {
  it("puts each widget back where the default preset has it, and hides it again", () => {
    const { api, panels } = dockStandIn();
    defaultArrangement(api);
    const cases = [
      ["queue", { referencePanel: "lyrics", direction: "within" }],
      ["lyrics", { referencePanel: "queue", direction: "within" }],
      ["playlists", { referencePanel: "library", direction: "left" }],
      ["nowPlaying", { referencePanel: "playlists", direction: "below" }],
    ] as const;
    for (const [id, position] of cases) {
      setWidgetVisible(id, false, api);
      setWidgetVisible(id, true, api);
      expect(panels.at(-1)).toMatchObject({ id, position });
    }
    for (const id of ["nowPlaying", "playlists", "queue", "lyrics"] as const) setWidgetVisible(id, false, api);
    setWidgetVisible("queue", true, api);
    expect(panels.at(-1)?.position).toEqual({ referencePanel: "library", direction: "right" });
    setWidgetVisible("nowPlaying", true, api);
    expect(panels.at(-1)?.position).toEqual({ referencePanel: "library", direction: "left" });
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
    applyPreset("musicBee", api);
    expect(tasks).toEqual([]);
  });
});
