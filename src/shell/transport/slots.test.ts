import { describe, expect, it } from "vitest";
import { SIZE_CLASSES } from "../use-size-class";
import {
  DEFAULT_HIDDEN,
  DEFAULT_ORDER,
  DEFAULT_SLOTS,
  SLOT_IDS,
  bandZones,
  canHide,
  layoutSlots,
  moveSlot,
  moveSlotBefore,
  moveSlotTo,
  parseSlots,
  setSlotHidden,
} from "./slots";

describe("transport slots (UD4)", () => {
  it("lists every slot in the default order: the play controls after Now playing and the seek bar", () => {
    expect(DEFAULT_ORDER).toEqual([
      "nowPlaying",
      "seek",
      "previous",
      "playPause",
      "next",
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
    ["xl", ["nowPlaying", "seek", "previous", "playPause", "next", "stop", "shuffle", "repeat", "volume", "queue"], []],
    ["lg", ["nowPlaying", "seek", "previous", "playPause", "next", "stop", "shuffle", "repeat", "volume", "queue"], []],
    ["md", ["nowPlaying", "seek", "previous", "playPause", "next", "volume"], ["stop", "shuffle", "repeat", "queue"]],
    ["sm", ["nowPlaying", "previous", "playPause", "next"], ["seek", "stop", "shuffle", "repeat", "volume", "queue"]],
    ["xs", ["nowPlaying", "playPause"], ["seek", "previous", "next", "stop", "shuffle", "repeat", "volume", "queue"]],
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

  it("splits the band around the play controls, which sit in the middle zone", () => {
    expect(bandZones(layoutSlots("xl").band)).toEqual({
      left: ["nowPlaying", "seek"],
      center: ["previous", "playPause", "next"],
      right: ["stop", "shuffle", "repeat", "volume", "queue"],
    });
    expect(bandZones(["nowPlaying", "playPause"])).toEqual({ left: ["nowPlaying"], center: ["playPause"], right: [] });
    // Play controls first: no left zone, so the band is not centered.
    expect(bandZones(["previous", "playPause", "next", "seek"]).left).toEqual([]);
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

  it("moves previous, play or pause and next as one group, in their order", () => {
    expect(moveSlotTo(DEFAULT_SLOTS, "playPause", 0).order.slice(0, 4)).toEqual([
      "previous",
      "playPause",
      "next",
      "nowPlaying",
    ]);
    expect(moveSlot(DEFAULT_SLOTS, "next", 1).order.slice(0, 6)).toEqual([
      "nowPlaying",
      "seek",
      "stop",
      "previous",
      "playPause",
      "next",
    ]);
    expect(moveSlot(DEFAULT_SLOTS, "previous", -1).order.slice(0, 5)).toEqual([
      "nowPlaying",
      "previous",
      "playPause",
      "next",
      "seek",
    ]);
    expect(moveSlot(moveSlotTo(DEFAULT_SLOTS, "playPause", 0), "playPause", -1).order[0]).toBe("previous");
  });

  it("never puts another slot inside the play group: it moves past the whole group", () => {
    expect(moveSlot(DEFAULT_SLOTS, "stop", -1).order.slice(1, 6)).toEqual([
      "seek",
      "stop",
      "previous",
      "playPause",
      "next",
    ]);
    expect(moveSlot(DEFAULT_SLOTS, "seek", 1).order.slice(0, 5)).toEqual([
      "nowPlaying",
      "previous",
      "playPause",
      "next",
      "seek",
    ]);
    const before = moveSlotBefore(DEFAULT_SLOTS, "stop", DEFAULT_SLOTS.order.indexOf("playPause")).order;
    expect(before.slice(2, 6)).toEqual(["stop", "previous", "playPause", "next"]);
    expect(moveSlot(DEFAULT_SLOTS, "search", 1)).toBe(DEFAULT_SLOTS);
    expect(moveSlot(DEFAULT_SLOTS, "nowPlaying", -1)).toBe(DEFAULT_SLOTS);
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
    const group = moveSlotBefore(DEFAULT_SLOTS, "playPause", order.indexOf("volume")).order;
    expect(group.slice(group.indexOf("previous"), group.indexOf("previous") + 4)).toEqual([
      "previous",
      "playPause",
      "next",
      "volume",
    ]);
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
    expect(parsed.slots.order.slice(0, 5)).toEqual(["volume", "seek", "previous", "playPause", "next"]);
    expect(new Set(parsed.slots.order)).toEqual(new Set(SLOT_IDS));
    expect(parsed.slots.hidden).toEqual(["stop"]);
    expect(parsed.warnings).toEqual(["unknown transport slot warp dropped"]);
  });

  it("joins a split play group at its first slot", () => {
    const parsed = parseSlots({ order: ["seek", "next", "nowPlaying", "previous", "playPause"], hidden: [] });
    expect(parsed.slots.order.slice(0, 5)).toEqual(["seek", "previous", "playPause", "next", "nowPlaying"]);
  });

  it("moves an untouched order from before the centered band to the new default; a custom one stays", () => {
    const old = [
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
    ];
    expect(parseSlots({ order: old, hidden: ["search", "stop"] }).slots).toEqual({
      order: [...DEFAULT_ORDER],
      hidden: ["search", "stop"],
    });
    const custom = [
      "previous",
      "playPause",
      "next",
      "seek",
      "nowPlaying",
      "stop",
      "shuffle",
      "repeat",
      "volume",
      "queue",
      "search",
    ];
    expect(parseSlots({ order: custom, hidden: [] }).slots.order).toEqual(custom);
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
