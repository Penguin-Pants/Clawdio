import { describe, expect, it } from "vitest";
import { WIDGETS, WIDGET_IDS, isWidgetId, minOf } from "./widgets";

describe("widget registry (R38.2, R38.6)", () => {
  it("holds the ten grid widgets in the View menu order", () => {
    expect(WIDGET_IDS).toEqual([
      "transport",
      "search",
      "artist",
      "album",
      "songs",
      "tree",
      "playlists",
      "queue",
      "lyrics",
      "nowPlaying",
    ]);
    expect(Object.keys(WIDGETS).sort()).toEqual([...WIDGET_IDS].sort());
  });

  it("makes only Songs and Transport controls not hideable (R38.7)", () => {
    expect(WIDGET_IDS.filter((id) => !WIDGETS[id].hideable)).toEqual(["transport", "songs"]);
  });

  it("uses the R38.6 minimum sizes in cells", () => {
    expect(Object.fromEntries(WIDGET_IDS.map((id) => [id, `${minOf(id).w}x${minOf(id).h}`]))).toEqual({
      transport: "4x1",
      search: "2x1",
      artist: "2x2",
      album: "2x2",
      songs: "3x2",
      tree: "2x2",
      playlists: "2x2",
      queue: "2x2",
      lyrics: "2x2",
      nowPlaying: "2x3",
    });
  });

  it("gives one-row widgets a side header", () => {
    expect(WIDGET_IDS.filter((id) => WIDGETS[id].sideHeader)).toEqual(["transport", "search"]);
  });

  it("titles each widget", () => {
    expect(WIDGET_IDS.map((id) => WIDGETS[id].title)).toEqual([
      "Transport controls",
      "Search",
      "Artist",
      "Album",
      "Songs",
      "Tree",
      "Playlists",
      "Play queue",
      "Lyrics",
      "Now playing",
    ]);
  });

  it("recognizes widget ids", () => {
    expect(isWidgetId("queue")).toBe(true);
    expect(isWidgetId("library")).toBe(false);
  });
});
