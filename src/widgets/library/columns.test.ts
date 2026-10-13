import { describe, expect, it } from "vitest";
import {
  COLUMNS,
  DEFAULT_COLUMNS,
  autoSizeColumn,
  contentWidth,
  gridTemplate,
  moveColumn,
  parseColumnState,
  resizeColumn,
  setColumnHidden,
  shiftColumn,
  toggleSort,
  visibleColumns,
} from "./columns";

const base = DEFAULT_COLUMNS["songs.topBottom"];

describe("column model (UD9)", () => {
  it("has # first and fixed, Title flexible, and the TB-6 minimums", () => {
    expect(base.order).toEqual(["track", "title", "artist", "album", "duration"]);
    expect(Object.fromEntries(Object.values(COLUMNS).map((column) => [column.id, column.min]))).toEqual({
      track: 40,
      title: 120,
      artist: 80,
      album: 80,
      duration: 56,
    });
    expect(COLUMNS.duration.align).toBe("right");
    expect(COLUMNS.track.align).toBe("right");
    expect(gridTemplate(base)).toMatch(/^48px minmax\(240px, 1fr\) 160px 160px 64px \d+px$/);
  });

  it("hides Album in the Columns view, where the Album list is beside the table", () => {
    expect(visibleColumns(DEFAULT_COLUMNS["songs.columns"])).toEqual(["track", "title", "artist", "duration"]);
  });

  it("resizes with the minimum as the floor", () => {
    expect(resizeColumn(base, "artist", 200).widths.artist).toBe(200);
    expect(resizeColumn(base, "artist", 10).widths.artist).toBe(80);
    expect(resizeColumn(base, "title", 50).widths.title).toBe(120);
  });

  it("auto-sizes to the measured width, between the minimum and the auto-size cap", () => {
    expect(autoSizeColumn(base, "album", 213).widths.album).toBe(213);
    expect(autoSizeColumn(base, "album", 20).widths.album).toBe(80);
    expect(autoSizeColumn(base, "album", 5000).widths.album).toBe(600);
  });

  it("moves one column; # never moves and nothing moves before it", () => {
    expect(moveColumn(base, "duration", 1).order).toEqual(["track", "duration", "title", "artist", "album"]);
    expect(moveColumn(base, "title", 0).order).toEqual(base.order);
    expect(moveColumn(base, "track", 3).order).toEqual(base.order);
    expect(shiftColumn(base, "artist", 1).order).toEqual(["track", "title", "album", "artist", "duration"]);
    expect(shiftColumn(base, "title", -1).order).toEqual(base.order);
  });

  it("shifts past hidden columns to the next visible place", () => {
    const hidden = setColumnHidden(base, "album", true);
    expect(visibleColumns(shiftColumn(hidden, "artist", 1))).toEqual(["track", "title", "duration", "artist"]);
  });

  it("hides and shows a column; # and Title cannot be hidden", () => {
    const hidden = setColumnHidden(base, "album", true);
    expect(visibleColumns(hidden)).toEqual(["track", "title", "artist", "duration"]);
    expect(visibleColumns(setColumnHidden(hidden, "album", false))).toEqual(base.order);
    expect(setColumnHidden(base, "track", true)).toBe(base);
    expect(setColumnHidden(base, "title", true)).toBe(base);
  });

  it("sorts ascending, then descending, then back to the R4 order", () => {
    const first = toggleSort(base, "title");
    expect(first.sort).toEqual([{ column: "title", descending: false }]);
    const second = toggleSort(first, "title");
    expect(second.sort).toEqual([{ column: "title", descending: true }]);
    expect(toggleSort(second, "title").sort).toEqual([]);
    expect(toggleSort(second, "artist").sort).toEqual([{ column: "artist", descending: false }]);
  });

  it("the content width is the sum of the visible columns and the heart", () => {
    expect(contentWidth(base)).toBe(48 + 240 + 160 + 160 + 64 + 28);
  });
});

/** A parse that must give a state. */
function parse(value: unknown) {
  const parsed = parseColumnState(value);
  if (!parsed) throw new Error("rejected");
  return parsed;
}

describe("parseColumnState (UD13)", () => {
  it("accepts a valid view", () => {
    expect(parseColumnState(base)).toEqual({ state: base, warnings: [] });
  });

  it("gives a bad width its default with a warning", () => {
    const { state, warnings } = parse({ ...base, widths: { ...base.widths, artist: "wide" } });
    expect(state.widths.artist).toBe(160);
    expect(warnings).toHaveLength(1);
  });

  it("ignores an unknown column with one warning and appends a missing one", () => {
    const { state, warnings } = parse({ ...base, order: ["track", "title", "rating", "artist", "duration"] });
    expect(state.order).toEqual(["track", "title", "artist", "duration", "album"]);
    expect(warnings).toEqual(["unknown column rating ignored"]);
  });

  it("keeps # first, refuses hiding # or Title and drops a bad sort", () => {
    const { state } = parse({
      ...base,
      order: ["title", "track", "artist", "album", "duration"],
      hidden: ["track", "album"],
      sort: [{ column: "title", descending: "yes" }],
    });
    expect(state.order[0]).toBe("track");
    expect(state.hidden).toEqual(["album"]);
    expect(state.sort).toEqual([]);
  });

  it("rejects a value that is not an object", () => {
    expect(parseColumnState(null)).toBeNull();
    expect(parseColumnState([1])).toBeNull();
  });
});
