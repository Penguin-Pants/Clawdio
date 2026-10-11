import { describe, expect, it } from "vitest";
import { WIDGETS, WIDGET_IDS, isWidgetId } from "./widgets";

describe("widget registry (P2.2)", () => {
  it("holds the six R5 widgets in a fixed order", () => {
    expect(WIDGET_IDS).toEqual(["library", "transport", "nowPlaying", "playlists", "queue", "lyrics"]);
    expect(Object.keys(WIDGETS).sort()).toEqual([...WIDGET_IDS].sort());
  });

  it("makes only Library not hideable (R28)", () => {
    expect(WIDGET_IDS.filter((id) => !WIDGETS[id].hideable)).toEqual(["library"]);
  });

  it("uses the D33 minimum sizes", () => {
    expect(WIDGET_IDS.map((id) => [id, WIDGETS[id].minWidth, WIDGETS[id].minHeight])).toEqual([
      ["library", 320, 240],
      ["transport", 320, 88],
      ["nowPlaying", 240, 88],
      ["playlists", 200, 160],
      ["queue", 200, 160],
      ["lyrics", 200, 160],
    ]);
  });

  it("titles each widget", () => {
    expect(WIDGET_IDS.map((id) => WIDGETS[id].title)).toEqual([
      "Library",
      "Transport controls",
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
