// P9-AC4 and P9-AC8: restore rules with fixture files, and the saved object.
import type { DockviewApi, SerializedDockview } from "dockview-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as log from "@/lib/log";
import { DEFAULT_FRAMES, useLibraryStore } from "@/store/library";
import {
  SAVE_DELAY_MS,
  UNKNOWN_COMPONENT,
  currentLayout,
  parseLayout,
  restoreLayout,
  watchLayout,
} from "./persistence";
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
    getPanel: (id: string) => (panels.includes(id) ? { id } : undefined),
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

/** The Columns default: Library, Now playing and Transport controls (R29). */
const COLUMNS_DEFAULT = ["library", "nowPlaying", "transport"];
const SIZE = { width: 800, height: 560 };

beforeEach(() => {
  vi.mocked(log.warn).mockClear();
  useLibraryStore.setState({ mode: "columns", frames: DEFAULT_FRAMES });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("restoreLayout (P9.4, P9-AC4)", () => {
  it("applies a valid layout, its Library mode and fits it to the window", () => {
    const dock = dockStandIn();
    expect(restoreLayout(dock.api, fixture("valid.json"), SIZE)).toBe(true);
    expect(dock.panels).toEqual(["library", "queue"]);
    expect(useLibraryStore.getState().mode).toBe("tree");
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
    ["version-2.json", "unknown layout version 2"],
    ["unknown-mode.json", "unknown Library mode grid"],
    ["missing-mode.json", "unknown Library mode undefined"],
    ["no-library.json", "no Library widget"],
    ["broken-dock.json", "the dock cannot load"],
  ])("%s applies Columns with one log line", (name, reason) => {
    useLibraryStore.setState({ mode: "tree" });
    const dock = dockStandIn();
    expect(restoreLayout(dock.api, fixture(name), SIZE)).toBe(false);
    expect(dock.panels).toEqual(COLUMNS_DEFAULT);
    expect(useLibraryStore.getState().mode).toBe("columns");
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(log.warn).mock.calls[0][0]).toContain(reason);
  });

  it("removes a panel of an unknown widget and keeps the rest, with one log line", () => {
    const dock = dockStandIn();
    expect(restoreLayout(dock.api, fixture("unknown-widget.json"), SIZE)).toBe(true);
    expect(dock.panels).toEqual(["library"]);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(log.warn).mock.calls[0][0]).toContain("visualizer");
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

  it("loads a version 1 file without libraryFrames with the default sizes", () => {
    useLibraryStore.getState().setFrames("columns", [0.1, 0.1, 0.8]);
    expect(restoreLayout(dockStandIn().api, fixture("valid.json"), SIZE)).toBe(true);
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

describe("bar repair at start (P23.3, R29.1, P23-AC2)", () => {
  it("moves Transport controls out of the Library tab group to the bottom bar, with one log line", () => {
    const dock = dockStandIn();
    expect(restoreLayout(dock.api, fixture("bar-in-tabs.json"), SIZE)).toBe(true);
    expect(dock.panels).toEqual(["library", "nowPlaying", "transport"]);
    expect(dock.added.at(-1)).toEqual({
      id: "transport",
      position: { referencePanel: "nowPlaying", direction: "right" },
    });
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(log.warn).mock.calls[0][0]).toContain("moved transport to the bottom bar");
  });

  it("moves a misplaced bar to a new bottom row when its partner is in a top row", () => {
    const dock = dockStandIn();
    expect(restoreLayout(dock.api, fixture("bar-partner-top.json"), SIZE)).toBe(true);
    expect(dock.added.at(-1)).toEqual({ id: "transport", position: { direction: "below" } });
    expect(log.warn).toHaveBeenCalledTimes(1);
  });

  it("keeps a valid top bar as saved, with no log line", () => {
    const dock = dockStandIn();
    expect(restoreLayout(dock.api, fixture("bar-top.json"), SIZE)).toBe(true);
    expect(dock.panels).toEqual(["library", "transport"]);
    expect(dock.added).toEqual([]);
    expect(log.warn).not.toHaveBeenCalled();
  });
});

describe("saving (P9.3, P9-AC8)", () => {
  it("saves the version, the Library mode and the dock, and no window size", () => {
    const dock = dockStandIn();
    dock.api.addPanel({ id: "library", component: "library" });
    const saved = currentLayout(dock.api);
    expect(Object.keys(saved).sort()).toEqual(["dock", "libraryFrames", "libraryMode", "version"]);
    expect(saved.version).toBe(1);
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
