// R38.7 to R38.10: show, hide, presets, lock and the keyboard path on the grid store.
import { beforeEach, describe, expect, it } from "vitest";
import { useUiStore } from "@/store/ui";
import { isValidLayout } from "./grid/engine";
import {
  NO_ROOM,
  activateWidget,
  activeWidget,
  applyMeasureLayout,
  applyPreset,
  commitRect,
  moveWidgetBy,
  resetLayout,
  resizeWidgetBy,
  setWidgetVisible,
  useGridStore,
} from "./layouts";
import { PRESETS } from "./presets";
import { DEFAULT_SLOTS } from "./transport/slots";
import { WIDGET_IDS, minOf } from "./widgets";

const layout = () => useGridStore.getState().layout;

beforeEach(() => {
  resetLayout();
  useUiStore.setState({ message: null });
});

describe("grid layout operations (R38.7 to R38.10)", () => {
  it("applies presets and Reset layout applies Default, unlocked, with the default band slots", () => {
    applyPreset("tree");
    expect(layout()).toEqual(PRESETS.tree.layout);
    useUiStore.getState().setLocked(true);
    useUiStore.getState().setTransportSlots({ order: [...DEFAULT_SLOTS.order].reverse(), hidden: [] });
    resetLayout();
    expect(layout()).toEqual(PRESETS.default.layout);
    expect(useUiStore.getState().locked).toBe(false);
    expect(useUiStore.getState().transportSlots).toEqual(DEFAULT_SLOTS);
  });

  it("hides and shows a widget; Songs and Transport controls cannot hide", () => {
    setWidgetVisible("artist", false);
    expect(layout().artist).toBeUndefined();
    expect(setWidgetVisible("artist", true)).toBe(true);
    expect(layout().artist).toEqual(PRESETS.default.layout.artist);
    setWidgetVisible("songs", false);
    setWidgetVisible("transport", false);
    expect(layout().songs).toBeDefined();
    expect(layout().transport).toBeDefined();
  });

  it("shows Play queue in the full Default grid by shrinking others", () => {
    expect(setWidgetVisible("queue", true)).toBe(true);
    expect(isValidLayout(layout(), minOf)).toBe(true);
  });

  it("moves and resizes by one cell (R38.10) and refuses with a message", () => {
    expect(moveWidgetBy("nowPlaying", 0, 1)).toBe(true);
    expect(layout().nowPlaying).toEqual({ x: 9, y: 2, w: 3, h: 5 });
    expect(resizeWidgetBy("nowPlaying", 0, -1)).toBe(true);
    expect(layout().nowPlaying.h).toBe(4);
    // At the minimum, a smaller size changes nothing.
    resizeWidgetBy("nowPlaying", 0, -1);
    expect(resizeWidgetBy("nowPlaying", 0, -1)).toBe(false);
    // A widget at the grid edge does not move past it.
    expect(moveWidgetBy("transport", 0, -1)).toBe(false);
    useGridStore.setState({ layout: { songs: { x: 0, y: 0, w: 3, h: 12 }, transport: { x: 3, y: 0, w: 9, h: 12 } } });
    expect(moveWidgetBy("songs", 1, 0)).toBe(false);
    expect(useUiStore.getState().message).toBe(NO_ROOM);
  });

  it("Lock layout stops moves, resizes and drops (R38.9)", () => {
    useUiStore.getState().setLocked(true);
    expect(moveWidgetBy("nowPlaying", 0, 1)).toBe(false);
    expect(resizeWidgetBy("nowPlaying", 0, -1)).toBe(false);
    expect(commitRect("nowPlaying", { x: 9, y: 2, w: 3, h: 5 })).toBe(false);
    expect(layout()).toEqual(PRESETS.default.layout);
  });

  it("tracks the active widget for the menu while it is in the grid", () => {
    activateWidget("album");
    expect(activeWidget()).toBe("album");
    setWidgetVisible("album", false);
    expect(activeWidget()).toBeNull();
    activateWidget("unknown");
    expect(useGridStore.getState().active).toBe("album");
  });

  it.each(["tree", "columns", "topBottom"] as const)("the %s measurement layout shows every widget (P3.1)", (mode) => {
    applyMeasureLayout(mode);
    expect(Object.keys(layout()).sort()).toEqual([...WIDGET_IDS].sort());
    expect(isValidLayout(layout(), minOf)).toBe(true);
  });
});
