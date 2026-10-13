import { describe, expect, it } from "vitest";
import { SIZE_CLASSES } from "../use-size-class";
import {
  DEFAULT_HIDDEN,
  DEFAULT_ORDER,
  DEFAULT_SLOTS,
  SLOT_IDS,
  canHide,
  layoutSlots,
  moveSlot,
  moveSlotBefore,
  moveSlotTo,
  parseSlots,
  setSlotHidden,
} from "./slots";

describe("transport slots (UD4)", () => {
  it("lists every slot in the default order, with search hidden", () => {
    expect(DEFAULT_ORDER).toEqual([
      "previous",
      "playPause",
      "next",
      "nowPlaying",
      "seek",
      "stop",
      "shuffle",
      "repeat",
      "volume",
      "queue",
      "search",
    ]);
    expect(DEFAULT_HIDDEN).toEqual(["search"]);
  });

  it.each([
    ["xl", ["previous", "playPause", "next", "nowPlaying", "seek", "stop", "shuffle", "repeat", "volume", "queue"], []],
    ["lg", ["previous", "playPause", "next", "nowPlaying", "seek", "stop", "shuffle", "repeat", "volume", "queue"], []],
    ["md", ["previous", "playPause", "next", "nowPlaying", "seek", "volume"], ["stop", "shuffle", "repeat", "queue"]],
    ["sm", ["previous", "playPause", "next", "nowPlaying"], ["seek", "stop", "shuffle", "repeat", "volume", "queue"]],
    ["xs", ["playPause", "nowPlaying"], ["previous", "next", "seek", "stop", "shuffle", "repeat", "volume", "queue"]],
  ] as const)("%s shows the band slots and moves the rest to the overflow", (size, band, overflow) => {
    expect(layoutSlots(size)).toEqual({ band, overflow });
  });

  it("shows search at XL only, once it is not hidden", () => {
    expect(layoutSlots("xl", DEFAULT_ORDER, []).band).toContain("search");
    expect(layoutSlots("lg", DEFAULT_ORDER, []).overflow).toContain("search");
  });

  it.each(SIZE_CLASSES)("at %s play or pause shows and every slot is reachable", (size) => {
    const { band, overflow } = layoutSlots(size, DEFAULT_ORDER, []);
    expect(band).toContain("playPause");
    expect(new Set([...band, ...overflow])).toEqual(new Set(SLOT_IDS));
  });
});

describe("custom transport slots (UD20, TR-10)", () => {
  it("applies a custom order and hidden set before the class rule", () => {
    const order = moveSlotTo(DEFAULT_SLOTS, "volume", DEFAULT_SLOTS.order.indexOf("shuffle")).order;
    expect(order.indexOf("volume")).toBe(order.indexOf("shuffle") - 1);
    const { band } = layoutSlots("xl", order, ["stop", "search"]);
    expect(band).not.toContain("stop");
    expect(band.slice(5, 8)).toEqual(["volume", "shuffle", "repeat"]);
  });

  it("keeps previous, play or pause and next first and in order", () => {
    expect(moveSlot(DEFAULT_SLOTS, "next", 1)).toBe(DEFAULT_SLOTS);
    expect(moveSlot(DEFAULT_SLOTS, "nowPlaying", -1)).toBe(DEFAULT_SLOTS);
    expect(moveSlotTo(DEFAULT_SLOTS, "seek", 0).order.slice(0, 4)).toEqual(["previous", "playPause", "next", "seek"]);
    expect(moveSlot(DEFAULT_SLOTS, "seek", -1).order.slice(3, 5)).toEqual(["seek", "nowPlaying"]);
    expect(moveSlot(DEFAULT_SLOTS, "search", 1)).toBe(DEFAULT_SLOTS);
  });

  it("drops a dragged slot before the row under the pointer, down and up (UD20)", () => {
    const order = DEFAULT_SLOTS.order;
    const down = moveSlotBefore(DEFAULT_SLOTS, "seek", order.indexOf("shuffle")).order;
    expect(down.indexOf("seek")).toBe(down.indexOf("shuffle") - 1);
    const up = moveSlotBefore(DEFAULT_SLOTS, "volume", order.indexOf("seek")).order;
    expect(up.indexOf("volume")).toBe(up.indexOf("seek") - 1);
    const last = moveSlotBefore(DEFAULT_SLOTS, "seek", order.length).order;
    expect(last.at(-1)).toBe("seek");
    expect(moveSlotBefore(DEFAULT_SLOTS, "seek", order.indexOf("seek") + 1)).toBe(DEFAULT_SLOTS);
  });

  it("hides and shows optional slots, never play or pause", () => {
    const hidden = setSlotHidden(DEFAULT_SLOTS, "stop", true);
    expect(hidden.hidden).toEqual(["search", "stop"]);
    expect(setSlotHidden(hidden, "stop", false).hidden).toEqual(["search"]);
    expect(setSlotHidden(DEFAULT_SLOTS, "playPause", true)).toBe(DEFAULT_SLOTS);
    expect(canHide("playPause")).toBe(false);
    expect(canHide("previous")).toBe(true);
  });

  it("parses a saved value and drops an unknown slot id with one warning", () => {
    expect(parseSlots(undefined)).toEqual({ slots: DEFAULT_SLOTS, warnings: [] });
    const parsed = parseSlots({ order: ["volume", "seek", "warp", "playPause"], hidden: ["stop", "warp"] });
    expect(parsed.slots.order.slice(0, 5)).toEqual(["previous", "playPause", "next", "volume", "seek"]);
    expect(new Set(parsed.slots.order)).toEqual(new Set(SLOT_IDS));
    expect(parsed.slots.hidden).toEqual(["stop"]);
    expect(parsed.warnings).toEqual(["unknown transport slot warp dropped"]);
  });

  it("refuses a hidden play or pause and a value that is not an object", () => {
    expect(parseSlots({ order: [...SLOT_IDS], hidden: ["playPause"] })).toEqual({
      slots: DEFAULT_SLOTS,
      warnings: ["transport slots hide play or pause; using the defaults"],
    });
    expect(parseSlots("all")).toEqual({
      slots: DEFAULT_SLOTS,
      warnings: ["invalid transport slots; using the defaults"],
    });
  });
});
