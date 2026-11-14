// P29-AC2 (R38.11): layout.json version 3 round trip, the backup of old and invalid files, and
// the repair of a file without Songs or Transport controls.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as log from "@/lib/log";
import { useUiStore } from "@/store/ui";
import { isValidLayout } from "./grid/engine";
import { resetLayout, useGridStore } from "./layouts";
import { LAYOUT_VERSION, SAVE_DELAY_MS, currentLayout, parseLayout, restoreLayout, watchLayout } from "./persistence";
import { PRESETS } from "./presets";
import { DEFAULT_SLOTS } from "./transport/slots";
import { minOf } from "./widgets";

vi.mock("@/lib/log", () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));

const DEFAULT = PRESETS.default.layout;
const COLUMNS = PRESETS.columns.layout;

const file = (widgets: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ version: LAYOUT_VERSION, widgets, ...extra });

beforeEach(() => {
  resetLayout();
  vi.mocked(log.warn).mockClear();
});

afterEach(() => vi.useRealTimers());

describe("layout.json version 3 (R38.11, P29-AC2)", () => {
  it("round trips the widgets and the band slots", () => {
    useGridStore.setState({ layout: COLUMNS });
    const text = JSON.stringify(currentLayout());
    resetLayout();
    expect(restoreLayout(text, vi.fn())).toBe(true);
    expect(useGridStore.getState().layout).toEqual(COLUMNS);
    expect(useUiStore.getState().transportSlots).toEqual(DEFAULT_SLOTS);
  });

  it("saves the shown widgets only, in registry order, and no window size", () => {
    const saved = currentLayout();
    expect(saved.version).toBe(3);
    expect(Object.keys(saved.widgets)).toEqual([
      "transport",
      "search",
      "artist",
      "album",
      "songs",
      "playlists",
      "nowPlaying",
    ]);
    expect(Object.keys(saved).sort()).toEqual(["transportSlots", "version", "widgets"]);
  });

  it.each([
    ["not JSON", "{"],
    ["version 2", JSON.stringify({ version: 2, dock: {}, libraryMode: "columns" })],
    ["version 1", JSON.stringify({ version: 1 })],
    ["no widgets", JSON.stringify({ version: 3 })],
    ["an overlap", file({ ...DEFAULT, search: { x: 0, y: 0, w: 2, h: 1 } })],
    ["a widget past the grid", file({ ...DEFAULT, songs: { x: 2, y: 7, w: 10, h: 6 } })],
    ["a widget under its minimum", file({ ...DEFAULT, nowPlaying: { x: 9, y: 1, w: 3, h: 2 } })],
    ["a cell that is not whole", file({ ...DEFAULT, songs: { x: 2, y: 6, w: 9.5, h: 6 } })],
    ["a rectangle with a missing field", file({ ...DEFAULT, songs: { x: 2, y: 6, w: 10 } })],
  ])("backs up a file with %s and loads Default", (_, text) => {
    useGridStore.setState({ layout: COLUMNS });
    const backup = vi.fn().mockResolvedValue(undefined);
    expect(restoreLayout(text, backup)).toBe(false);
    expect(backup).toHaveBeenCalledOnce();
    expect(useGridStore.getState().layout).toEqual(DEFAULT);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("backed up as layout.json.bak"));
  });

  it("keeps Default without a backup when there is no file", () => {
    const backup = vi.fn();
    expect(restoreLayout(null, backup)).toBe(false);
    expect(backup).not.toHaveBeenCalled();
  });

  it("ignores unknown widgets with a warning", () => {
    const parsed = parseLayout(file({ ...DEFAULT, equalizer: { x: 0, y: 0, w: 1, h: 1 } }));
    expect("layout" in parsed && parsed.layout.widgets).toEqual(DEFAULT);
    expect("warnings" in parsed && parsed.warnings).toContain("unknown widget equalizer ignored");
  });

  it("adds a missing Songs or Transport controls where it fits", () => {
    const rest = Object.fromEntries(Object.entries(DEFAULT).filter(([id]) => id !== "songs" && id !== "transport"));
    const parsed = parseLayout(file(rest));
    if (!("layout" in parsed)) throw new Error(parsed.reason);
    expect(parsed.layout.widgets.songs).toBeDefined();
    expect(parsed.layout.widgets.transport).toBeDefined();
    expect(isValidLayout(parsed.layout.widgets, minOf)).toBe(true);
  });

  it("ignores the old locked key and takes default band slots for a bad value, with a warning", () => {
    const parsed = parseLayout(file(DEFAULT, { locked: true, transportSlots: 4 }));
    if (!("layout" in parsed)) throw new Error(parsed.reason);
    expect(parsed.layout).not.toHaveProperty("locked");
    expect(parsed.layout.transportSlots).toEqual(DEFAULT_SLOTS);
    expect(parsed.warnings).toHaveLength(1);
  });

  it("saves 500 ms after a change, and at once on flush", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const watcher = watchLayout(save);
    useGridStore.setState({ layout: COLUMNS });
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(save).toHaveBeenCalledOnce();
    expect(JSON.parse(save.mock.calls[0][0] as string).widgets).toEqual(COLUMNS);
    await watcher.flush();
    expect(save).toHaveBeenCalledTimes(2);
    watcher.dispose();
  });
});
