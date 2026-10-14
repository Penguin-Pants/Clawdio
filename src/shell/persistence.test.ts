// P9-AC4, P9-AC8 and U1 (UD5, PS-4): restore rules with fixture files, the backup and the saved object.
import type { DockviewApi, SerializedDockview } from "dockview-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as log from "@/lib/log";
import { DEFAULT_FRAMES, useLibraryStore } from "@/store/library";
import { useCollapseStore } from "@/store/collapse";
import { useUiStore } from "@/store/ui";
import {
  SAVE_DELAY_MS,
  UNKNOWN_COMPONENT,
  currentLayout,
  parseLayout,
  restoreLayout,
  restoreSideWidths,
  watchLayout,
} from "./persistence";
import { DEFAULT_SLOTS } from "./transport/slots";
import { WIDGET_IDS } from "./widgets";

vi.mock("@/lib/log", () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));

const FIXTURES = import.meta.glob<string>("./layout-fixtures/*.json", {
  eager: true,
  query: "?raw",
  import: "default",
});

function fixture(name: string): string {
  const text = FIXTURES[`./layout-fixtures/${name}`];
  if (text === undefined) throw new Error(`no fixture ${name}`);
  return text;
}

/**
 * A dock stand-in for the calls persistence.ts and layouts.ts make. Like Dockview, `fromJSON`
 * throws on a component that is not registered and on a dock without a grid.
 */
function dockStandIn() {
  const panels: string[] = [];
  // The grid of the last load; else one group per panel, stacked.
  let loaded: SerializedDockview | null = null;
  const layoutListeners: (() => void)[] = [];
  const registered = new Set<string>([...WIDGET_IDS, UNKNOWN_COMPONENT]);
  const added: { id: string; position?: unknown }[] = [];
  const api = {
    width: 1200,
    height: 800,
    // No groups: the D45 clamp has its own tests (clamp.test.ts).
    groups: [],
    addPanel: ({ id, position }: { id: string; position?: unknown }) => {
      panels.push(id);
      added.push({ id, position });
    },
    getPanel: (id: string) =>
      panels.includes(id) ? { id, api: { setActive: () => {} }, group: { api: { setSize: () => {} } } } : undefined,
    // One grid group, "g1", for the collapse sizes (PS-5).
    getGroup: (id: string) => (id === "g1" ? { id, api: { location: { type: "grid" } } } : undefined),
    removePanel: ({ id }: { id: string }) => panels.splice(panels.indexOf(id), 1),
    clear: () => panels.splice(0),
    fromJSON: (dock: SerializedDockview) => {
      if (!dock.grid) throw new Error("no grid");
      loaded = dock;
      for (const [id, panel] of Object.entries(dock.panels)) {
        if (!registered.has(panel.contentComponent ?? id)) throw new Error(`unknown component ${id}`);
        panels.push(id);
      }
    },
    toJSON: () => ({
      grid: loaded?.grid ?? {
        root: {
          type: "branch",
          data: panels.map((id, index) => ({ type: "leaf", data: { views: [id], id: String(index) } })),
        },
        orientation: "VERTICAL",
      },
      panels: Object.fromEntries(panels.map((id) => [id, { id }])),
    }),
    layout: vi.fn(),
    onDidLayoutChange: (listener: () => void) => {
      layoutListeners.push(listener);
      return { dispose: () => layoutListeners.splice(layoutListeners.indexOf(listener), 1) };
    },
    onDidRemovePanel: () => ({ dispose: () => {} }),
    getGroupPanels: () => [],
  };
  const fireLayoutChange = () => layoutListeners.forEach((listener) => listener());
  return { api: api as unknown as DockviewApi, panels, added, layout: api.layout, fireLayoutChange };
}

/** The default preset (UD6): Library, Playlists, Play queue and Lyrics. */
const PRESET_DEFAULT = ["library", "playlists", "queue", "lyrics"];
const SIZE = { width: 800, height: 560 };

beforeEach(() => {
  vi.mocked(log.warn).mockClear();
  useLibraryStore.setState({ mode: "columns", frames: DEFAULT_FRAMES });
  useUiStore.setState({ transportPosition: "top", locked: false, transportSlots: DEFAULT_SLOTS });
});

const noBackup = () => Promise.resolve();

afterEach(() => {
  vi.useRealTimers();
});

describe("restoreLayout (P9.4, P9-AC4)", () => {
  it("applies a valid layout, its Library mode, band position and lock, and fits it to the window", () => {
    const dock = dockStandIn();
    const backup = vi.fn(noBackup);
    expect(restoreLayout(dock.api, fixture("valid.json"), SIZE, backup)).toBe(true);
    expect(dock.panels).toEqual(["library", "queue"]);
    expect(useLibraryStore.getState().mode).toBe("tree");
    expect(useUiStore.getState()).toMatchObject({ transportPosition: "bottom", locked: true });
    expect(backup).not.toHaveBeenCalled();
    expect(dock.layout).toHaveBeenCalledWith(800, 560, true);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("keeps the default when there is no saved layout", () => {
    const dock = dockStandIn();
    expect(restoreLayout(dock.api, null, SIZE)).toBe(false);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it.each([
    ["corrupt.json", "not valid JSON"],
    ["version-3.json", "unknown layout version 3"],
    ["unknown-mode.json", "unknown Library mode grid"],
    ["missing-mode.json", "unknown Library mode undefined"],
    ["no-library.json", "no Library widget"],
    ["broken-dock.json", "the dock cannot load"],
  ])("%s is backed up and the default preset loads, with one log line (PS-4)", (name, reason) => {
    useLibraryStore.setState({ mode: "tree" });
    useUiStore.setState({ transportPosition: "bottom", locked: true });
    const dock = dockStandIn();
    const backup = vi.fn(noBackup);
    expect(restoreLayout(dock.api, fixture(name), SIZE, backup)).toBe(false);
    expect(dock.panels).toEqual(PRESET_DEFAULT);
    expect(useLibraryStore.getState().mode).toBe("columns");
    expect(useUiStore.getState()).toMatchObject({ transportPosition: "top", locked: false });
    expect(backup).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(log.warn).mock.calls[0][0]).toContain(reason);
    expect(vi.mocked(log.warn).mock.calls[0][0]).toContain("backed up as layout.json.bak");
  });

  it("backs up a version 1 file and loads the default preset, with one log line (UD5)", () => {
    const dock = dockStandIn();
    const backup = vi.fn(noBackup);
    expect(restoreLayout(dock.api, fixture("version-1.json"), SIZE, backup)).toBe(false);
    expect(dock.panels).toEqual(PRESET_DEFAULT);
    expect(backup).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(log.warn).mock.calls[0][0]).toBe("layout: version 1 backed up as layout.json.bak");
  });

  it.each([
    ["transport", "left", { transportPosition: "top" }],
    ["locked", "yes", { locked: false }],
  ])("a bad %s value takes its default with one log line", (key, value, expected) => {
    const text = JSON.stringify({ ...JSON.parse(fixture("valid.json")), [key]: value });
    expect(restoreLayout(dockStandIn().api, text, SIZE, noBackup)).toBe(true);
    expect(useUiStore.getState()).toMatchObject(expected);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(log.warn).mock.calls[0][0]).toContain(key);
  });

  it("removes a panel of an unknown widget and keeps the rest, with one log line", () => {
    const dock = dockStandIn();
    expect(restoreLayout(dock.api, fixture("unknown-widget.json"), SIZE)).toBe(true);
    expect(dock.panels).toEqual(["library"]);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(log.warn).mock.calls[0][0]).toContain("visualizer");
  });

  it("keeps a floating group and removes an unknown widget in floatingGroups (DK-3, UD17)", () => {
    const dock = dockStandIn();
    expect(restoreLayout(dock.api, fixture("floating.json"), SIZE, noBackup)).toBe(true);
    expect(dock.panels).toEqual(["library", "queue", "nowPlaying"]);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(log.warn).mock.calls[0][0]).toContain("visualizer");
    const saved = JSON.parse(fixture("floating.json"));
    expect(parseLayout(JSON.stringify(saved))).toMatchObject({ unknown: ["visualizer"] });
  });

  it("marks unknown widget ids before the dock sees them", () => {
    const parsed = parseLayout(fixture("unknown-widget.json"));
    expect("layout" in parsed && parsed.unknown).toEqual(["visualizer"]);
    expect("layout" in parsed && parsed.layout.dock.panels.visualizer.contentComponent).toBe(UNKNOWN_COMPONENT);
  });
});

/** valid.json with a `libraryFrames` value. */
function withFrames(frames: unknown): string {
  return JSON.stringify({ ...JSON.parse(fixture("valid.json")), libraryFrames: frames });
}

describe("frame sizes in layout.json (P22.3, D55, P22-AC2)", () => {
  const CUSTOM = { columns: [0.2, 0.3, 0.5], topBottom: { top: [0.6, 0.4], rows: [0.3, 0.7] } };

  it("loads a file without libraryFrames with the default sizes", () => {
    useLibraryStore.getState().setFrames("columns", [0.1, 0.1, 0.8]);
    expect(restoreLayout(dockStandIn().api, fixture("valid.json"), SIZE, noBackup)).toBe(true);
    expect(useLibraryStore.getState().frames).toEqual(DEFAULT_FRAMES);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("keeps both modes' sizes over a save and a load", () => {
    const dock = dockStandIn();
    dock.api.addPanel({ id: "library", component: "library" });
    useLibraryStore.getState().setAllFrames(CUSTOM);
    const text = JSON.stringify(currentLayout(dock.api));
    useLibraryStore.getState().resetFrames();
    expect(restoreLayout(dockStandIn().api, text, SIZE)).toBe(true);
    expect(useLibraryStore.getState().frames).toEqual(CUSTOM);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it.each([
    ["a wrong length", [0.5, 0.5]],
    ["a sum that is not 1", [0.2, 0.2, 0.2]],
    ["a zero value", [0, 0.5, 0.5]],
    ["a value that is not a number", ["a", 0.5, 0.5]],
  ])("an invalid columns entry (%s) gives Columns defaults and one log line", (_case, columns) => {
    const dock = dockStandIn();
    expect(restoreLayout(dock.api, withFrames({ ...CUSTOM, columns }), SIZE)).toBe(true);
    expect(useLibraryStore.getState().frames).toEqual({ columns: DEFAULT_FRAMES.columns, topBottom: CUSTOM.topBottom });
    expect(dock.panels).toEqual(["library", "queue"]);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(log.warn).mock.calls[0][0]).toContain("columns");
  });

  it("accepts a sum exactly at the 0.01 tolerance (0.33 + 0.33 + 0.33)", () => {
    const columns = [0.33, 0.33, 0.33];
    expect(restoreLayout(dockStandIn().api, withFrames({ ...CUSTOM, columns }), SIZE)).toBe(true);
    expect(useLibraryStore.getState().frames.columns).toEqual(columns);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("an unknown property inside topBottom gives Top/bottom defaults and one log line", () => {
    const text = withFrames({ ...CUSTOM, topBottom: { ...CUSTOM.topBottom, middle: [1] } });
    expect(restoreLayout(dockStandIn().api, text, SIZE)).toBe(true);
    expect(useLibraryStore.getState().frames).toEqual({ columns: CUSTOM.columns, topBottom: DEFAULT_FRAMES.topBottom });
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(log.warn).mock.calls[0][0]).toContain("topBottom");
  });

  it("an unknown mode key is ignored with one log line, and both modes load", () => {
    expect(restoreLayout(dockStandIn().api, withFrames({ ...CUSTOM, grid: [1] }), SIZE)).toBe(true);
    expect(useLibraryStore.getState().frames).toEqual(CUSTOM);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(log.warn).mock.calls[0][0]).toContain("grid");
  });

  it("libraryFrames that is not an object gives the defaults of all modes and one log line", () => {
    expect(restoreLayout(dockStandIn().api, withFrames([1, 2]), SIZE)).toBe(true);
    expect(useLibraryStore.getState().frames).toEqual(DEFAULT_FRAMES);
    expect(log.warn).toHaveBeenCalledTimes(1);
  });
});

describe("saving (P9.3, P9-AC8)", () => {
  it("saves the version, band position, lock, Library mode and dock, and no window size", () => {
    const dock = dockStandIn();
    dock.api.addPanel({ id: "library", component: "library" });
    const saved = currentLayout(dock.api);
    expect(Object.keys(saved).sort()).toEqual([
      "collapsed",
      "dock",
      "libraryFrames",
      "libraryMode",
      "locked",
      "transport",
      "transportSlots",
      "version",
    ]);
    expect(saved.version).toBe(2);
  });

  it("round-trips transport and locked through version 2", () => {
    const dock = dockStandIn();
    dock.api.addPanel({ id: "library", component: "library" });
    useUiStore.setState({ transportPosition: "bottom", locked: true });
    const text = JSON.stringify(currentLayout(dock.api));
    useUiStore.setState({ transportPosition: "top", locked: false });
    expect(restoreLayout(dockStandIn().api, text, SIZE, noBackup)).toBe(true);
    expect(useUiStore.getState()).toMatchObject({ transportPosition: "bottom", locked: true });
  });

  it("round-trips the collapse sizes, and a file without them loads none (PS-5)", () => {
    const dock = dockStandIn();
    dock.api.addPanel({ id: "library", component: "library" });
    useCollapseStore.setState({ sizes: { g1: { axis: "width", size: 320 } } });
    const saved = currentLayout(dock.api);
    useCollapseStore.setState({ sizes: {} });
    expect(restoreLayout(dockStandIn().api, JSON.stringify(saved), SIZE, noBackup)).toBe(true);
    expect(useCollapseStore.getState().sizes).toEqual({ g1: { axis: "width", size: 320 } });
    const without: Partial<typeof saved> = { ...saved };
    delete without.collapsed;
    expect(restoreLayout(dockStandIn().api, JSON.stringify(without), SIZE, noBackup)).toBe(true);
    expect(useCollapseStore.getState().sizes).toEqual({});
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("saves 500 ms after a collapse change", async () => {
    vi.useFakeTimers();
    const save = vi.fn<(json: string) => Promise<void>>(() => Promise.resolve());
    const watcher = watchLayout(dockStandIn().api, save);
    useCollapseStore.setState({ sizes: { g1: { axis: "height", size: 200 } } });
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(save).toHaveBeenCalledTimes(1);
    watcher.dispose();
  });

  it("round-trips transportSlots and loads a file without it with the defaults (UD20)", () => {
    const dock = dockStandIn();
    dock.api.addPanel({ id: "library", component: "library" });
    const custom = { order: [...DEFAULT_SLOTS.order].reverse(), hidden: ["stop" as const] };
    useUiStore.setState({ transportSlots: custom });
    const saved = currentLayout(dock.api);
    useUiStore.setState({ transportSlots: DEFAULT_SLOTS });
    expect(restoreLayout(dockStandIn().api, JSON.stringify(saved), SIZE, noBackup)).toBe(true);
    const restored = useUiStore.getState().transportSlots;
    expect(restored.hidden).toEqual(["stop"]);
    // The reversed order keeps its place; the play group joins in its own order.
    expect(restored.order).toEqual([
      "search",
      "queue",
      "volume",
      "repeat",
      "shuffle",
      "stop",
      "previous",
      "playPause",
      "next",
      "seek",
      "nowPlaying",
    ]);

    const without: Partial<typeof saved> = { ...saved };
    delete without.transportSlots;
    useUiStore.setState({ transportSlots: custom });
    expect(restoreLayout(dockStandIn().api, JSON.stringify(without), SIZE, noBackup)).toBe(true);
    expect(useUiStore.getState().transportSlots).toEqual(DEFAULT_SLOTS);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("a hidden play or pause in transportSlots gives the default slots with one log line", () => {
    const dock = dockStandIn();
    dock.api.addPanel({ id: "library", component: "library" });
    const saved = { ...currentLayout(dock.api), transportSlots: { order: DEFAULT_SLOTS.order, hidden: ["playPause"] } };
    expect(restoreLayout(dockStandIn().api, JSON.stringify(saved), SIZE, noBackup)).toBe(true);
    expect(useUiStore.getState().transportSlots).toEqual(DEFAULT_SLOTS);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(log.warn).mock.calls[0][0]).toContain("hide play or pause");
  });

  it("saves 500 ms after a transport slots change", async () => {
    vi.useFakeTimers();
    const save = vi.fn<(json: string) => Promise<void>>(() => Promise.resolve());
    const watcher = watchLayout(dockStandIn().api, save);
    useUiStore.setState({ transportSlots: { ...DEFAULT_SLOTS, hidden: [] } });
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(save).toHaveBeenCalledTimes(1);
    watcher.dispose();
  });

  it("saves 500 ms after a layout or mode change, and flush writes at once", async () => {
    vi.useFakeTimers();
    const dock = dockStandIn();
    const save = vi.fn<(json: string) => Promise<void>>(async () => {});
    const watcher = watchLayout(dock.api, save);
    dock.fireLayoutChange();
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS - 1);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);

    useLibraryStore.getState().setMode("topBottom");
    await watcher.flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(JSON.parse(save.mock.calls[1][0]).libraryMode).toBe("topBottom");
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    // The flushed change is not saved again.
    expect(save).toHaveBeenCalledTimes(2);
    await watcher.flush();
    // A close request writes even with nothing pending.
    expect(save).toHaveBeenCalledTimes(3);
    watcher.dispose();
  });

  it("saves 500 ms after a frame size change (P22.3)", async () => {
    vi.useFakeTimers();
    const save = vi.fn<(json: string) => Promise<void>>(() => Promise.resolve());
    const watcher = watchLayout(dockStandIn().api, save);
    useLibraryStore.getState().setFrames("columns", [0.3, 0.3, 0.4]);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(save).toHaveBeenCalledTimes(1);
    expect(JSON.parse(save.mock.calls[0][0]).libraryFrames.columns).toEqual([0.3, 0.3, 0.4]);
    watcher.dispose();
  });
});

describe("restoreSideWidths (SP-4)", () => {
  const leaf = (id: string, views: string[], size: number) => ({ type: "leaf", data: { id, views }, size });
  function dockWith(root: unknown, width = 1200) {
    return {
      grid: { root, width, height: 700, orientation: "HORIZONTAL" },
      panels: {},
    } as unknown as SerializedDockview;
  }
  function groups() {
    const sizes = new Map<string, unknown>();
    const api = {
      getGroup: (id: string) => ({ api: { setSize: (size: unknown) => sizes.set(id, size) } }),
    } as unknown as DockviewApi;
    return { api, sizes };
  }

  it("gives the columns beside the Library their saved widths, not the Library column", () => {
    const { api, sizes } = groups();
    const root = {
      type: "branch",
      size: 700,
      data: [
        leaf("1", ["playlists"], 240),
        leaf("2", ["library"], 680),
        { type: "branch", size: 280, data: [leaf("3", ["queue"], 400), leaf("4", ["lyrics"], 300)] },
      ],
    };
    restoreSideWidths(api, dockWith(root));
    expect(Object.fromEntries(sizes)).toEqual({ "1": { width: 240 }, "3": { width: 280 } });
  });

  it("does nothing for a root split into rows", () => {
    const { api, sizes } = groups();
    const root = { type: "branch", size: 1200, data: [leaf("1", ["library"], 500), leaf("2", ["queue"], 200)] };
    restoreSideWidths(api, dockWith(root));
    expect(sizes.size).toBe(0);
  });
});
