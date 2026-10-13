import { describe, expect, it } from "vitest";
import { SIZE_CLASSES } from "../use-size-class";
import { DEFAULT_HIDDEN, DEFAULT_ORDER, SLOT_IDS, layoutSlots } from "./slots";

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
