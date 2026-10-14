import { describe, expect, it } from "vitest";
import { WIDGETS, WIDGET_IDS, isWidgetId } from "./widgets";

describe("widget registry (P2.2)", () => {
  it("holds the five dock widgets in a fixed order; Transport controls is not one (SH-2)", () => {
    expect(WIDGET_IDS).toEqual(["library", "nowPlaying", "playlists", "queue", "lyrics"]);
    expect(isWidgetId("transport")).toBe(false);
    expect(Object.keys(WIDGETS).sort()).toEqual([...WIDGET_IDS].sort());
  });

  it("makes only Library not hideable (R28)", () => {
    expect(WIDGET_IDS.filter((id) => !WIDGETS[id].hideable)).toEqual(["library"]);
  });

  it("uses the D33 minimum sizes (DK-2)", () => {
    expect(WIDGET_IDS.map((id) => [id, WIDGETS[id].minWidth, WIDGETS[id].minHeight])).toEqual([
      ["library", 320, 240],
      ["nowPlaying", 220, 240],
      ["playlists", 56, 160],
      ["queue", 200, 160],
      ["lyrics", 200, 160],
    ]);
  });

  it("titles each widget", () => {
    expect(WIDGET_IDS.map((id) => WIDGETS[id].title)).toEqual([
      "Library",
      "Now playing",
      "Playlists",
      "Play queue",
      "Lyrics",
    ]);
  });

  it("recognizes widget ids", () => {
    expect(isWidgetId("queue")).toBe(true);
    expect(isWidgetId("search")).toBe(false);
  });
});
