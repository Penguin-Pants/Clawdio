// P23-AC1 and P23-AC2: bar drop rules (D58) and the repair of saved arrangements (R29.1).
import { afterEach, describe, expect, it } from "vitest";
import {
  BAR_HEADER_HEIGHT,
  type DropTarget,
  allowDrop,
  barHeight,
  barViolations,
  onBarHeightChange,
  resetBarHeights,
  setBarContentHeight,
  sharesRow,
} from "./bar-rules";
import type { DockNode } from "./clamp";

const leaf = (id: string, ...widgets: string[]): DockNode => ({ kind: "group", id, widgets });
const split = (...children: DockNode[]): DockNode => ({ kind: "split", children });
const group = (widgets: string[], paired = false): DropTarget => ({ widgets, paired });
const SIDES = ["left", "right"] as const;
const ENDS = ["top", "bottom"] as const;

afterEach(() => resetBarHeights());

describe("allowDrop (D58, P23-AC1)", () => {
  for (const bar of ["transport", "nowPlaying"] as const) {
    const other = bar === "transport" ? "nowPlaying" : "transport";

    it(`${bar} docks on the top and bottom of any group and of the window`, () => {
      for (const position of ENDS) {
        expect(allowDrop(bar, group(["library"]), position)).toBe(true);
        expect(allowDrop(bar, group([other]), position)).toBe(true);
        expect(allowDrop(bar, "window", position)).toBe(true);
      }
    });

    it(`${bar} docks on the left and right of the other bar widget only`, () => {
      for (const position of SIDES) {
        expect(allowDrop(bar, group([other]), position)).toBe(true);
        expect(allowDrop(bar, group(["library"]), position)).toBe(false);
        expect(allowDrop(bar, group(["queue", "lyrics"]), position)).toBe(false);
        expect(allowDrop(bar, "window", position)).toBe(false);
      }
    });

    it(`${bar} never joins a tab group`, () => {
      expect(allowDrop(bar, group(["library"]), "center")).toBe(false);
      expect(allowDrop(bar, group([other]), "center")).toBe(false);
    });
  }

  it("a non-bar widget never joins a bar group or docks beside it", () => {
    for (const position of ["center", ...SIDES] as const) {
      expect(allowDrop("queue", group(["transport"]), position)).toBe(false);
      expect(allowDrop("library", group(["nowPlaying"]), position)).toBe(false);
    }
  });

  it("a non-bar widget docks above or below a bar group in its own row, not inside a shared row", () => {
    for (const position of ENDS) {
      expect(allowDrop("queue", group(["transport"]), position)).toBe(true);
      expect(allowDrop("queue", group(["transport"], true), position)).toBe(false);
    }
  });

  it("keeps every other drop as it was", () => {
    for (const position of ["center", ...SIDES, ...ENDS] as const) {
      expect(allowDrop("queue", group(["library"]), position)).toBe(true);
      expect(allowDrop("lyrics", group(["queue", "playlists"]), position)).toBe(true);
    }
    for (const position of [...SIDES, ...ENDS] as const) expect(allowDrop("queue", "window", position)).toBe(true);
  });
});

describe("barViolations (R29.1, P23-AC2)", () => {
  it("finds a bar widget in a tab group", () => {
    const root = split(leaf("g1", "library", "transport"), leaf("g2", "nowPlaying"));
    expect(barViolations(root, "VERTICAL")).toEqual(["transport"]);
  });

  it("finds a bar widget beside a non-bar widget", () => {
    const root = split(split(leaf("g1", "library"), leaf("g2", "transport")), leaf("g3", "nowPlaying"));
    expect(barViolations(root, "VERTICAL")).toEqual(["transport"]);
  });

  it("finds Now playing in the Play queue tab group", () => {
    const root = split(leaf("g1", "library"), leaf("g2", "nowPlaying", "queue"), leaf("g3", "transport"));
    expect(barViolations(root, "VERTICAL")).toEqual(["nowPlaying"]);
  });

  it("accepts a top bar, the default bottom row and a bar on top of one column", () => {
    const top = split(leaf("g1", "transport"), leaf("g2", "library"), leaf("g3", "nowPlaying"));
    const bottom = split(leaf("g1", "library"), split(leaf("g2", "nowPlaying"), leaf("g3", "transport")));
    const column = split(leaf("g1", "library"), split(leaf("g2", "transport"), leaf("g3", "queue")));
    expect(barViolations(top, "VERTICAL")).toEqual([]);
    expect(barViolations(bottom, "VERTICAL")).toEqual([]);
    expect(barViolations(column, "HORIZONTAL")).toEqual([]);
  });
});

describe("bar heights (D57)", () => {
  it("is the measured content height plus the header", () => {
    setBarContentHeight("transport", 72.4);
    expect(barHeight("transport")).toBe(73 + BAR_HEADER_HEIGHT);
  });

  it("tells listeners about a change only", () => {
    let calls = 0;
    const stop = onBarHeightChange(() => (calls += 1));
    setBarContentHeight("nowPlaying", 90);
    setBarContentHeight("nowPlaying", 90);
    setBarContentHeight("nowPlaying", 0);
    stop();
    setBarContentHeight("nowPlaying", 100);
    expect(calls).toBe(1);
  });
});

describe("sharesRow", () => {
  it("is true for the default bottom row and false for a bar alone in its row", () => {
    const bottom = split(leaf("g1", "library"), split(leaf("g2", "nowPlaying"), leaf("g3", "transport")));
    const top = split(leaf("g1", "transport"), leaf("g2", "library"));
    expect(sharesRow(bottom, "VERTICAL", "g3")).toBe(true);
    expect(sharesRow(top, "VERTICAL", "g1")).toBe(false);
    expect(sharesRow(top, "VERTICAL", "missing")).toBe(false);
  });
});
