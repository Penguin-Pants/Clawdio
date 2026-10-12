import { describe, expect, it } from "vitest";
import { CLAMP_FLOOR, type DockNode, clampMinimums, groupMinimum, nodeMinimum } from "./clamp";

const leaf = (id: string, ...widgets: string[]): DockNode => ({ kind: "group", id, widgets });
const split = (...children: DockNode[]): DockNode => ({ kind: "split", children });

/** The default arrangement: Library above a row of Now playing and Transport controls. */
const DEFAULT = split(leaf("g1", "library"), split(leaf("g2", "nowPlaying"), leaf("g3", "transport")));
const STACK = split(
  leaf("a", "library"),
  leaf("b", "transport"),
  leaf("c", "nowPlaying"),
  leaf("d", "playlists"),
  leaf("e", "queue"),
  leaf("f", "lyrics"),
);

describe("groupMinimum", () => {
  it("takes the largest minimum of the widgets in a tabbed group", () => {
    expect(groupMinimum(["nowPlaying", "queue"])).toEqual({ width: 240, height: 160 });
  });

  it("ignores unknown widgets and never goes below the floor", () => {
    expect(groupMinimum(["unknown"])).toEqual({ width: CLAMP_FLOOR, height: CLAMP_FLOOR });
  });
});

describe("nodeMinimum", () => {
  it("adds heights in a vertical split and widths in a horizontal split", () => {
    expect(nodeMinimum(DEFAULT, "VERTICAL")).toEqual({ width: 560, height: 352 });
  });

  it("adds widths at the root of a horizontal grid", () => {
    expect(nodeMinimum(split(DEFAULT, leaf("q", "queue")), "HORIZONTAL")).toEqual({ width: 760, height: 352 });
  });
});

describe("clampMinimums (D45)", () => {
  it("keeps the D33 minimums when the dock is large enough", () => {
    const result = clampMinimums(DEFAULT, "VERTICAL", { width: 800, height: 504 });
    expect(result.get("g1")).toEqual({ width: 320, height: 240 });
    expect(result.get("g3")).toEqual({ width: 320, height: 112 });
  });

  it("lowers minimums in proportion so six stacked widgets fit an 800 x 560 window", () => {
    const dock = { width: 800, height: 504 };
    const result = clampMinimums(STACK, "VERTICAL", dock);
    const total = [...result.values()].reduce((sum, size) => sum + size.height, 0);
    expect(total).toBeLessThanOrEqual(dock.height);
    expect(result.get("a")?.height).toBe(Math.floor((240 * 504) / 944));
    for (const size of result.values()) expect(size.height).toBeGreaterThanOrEqual(CLAMP_FLOOR);
  });

  it("never goes below the 32 px header", () => {
    const result = clampMinimums(STACK, "VERTICAL", { width: 800, height: 100 });
    for (const size of result.values()) expect(size.height).toBe(CLAMP_FLOOR);
  });

  it("clamps each axis on its own", () => {
    const wide = split(leaf("x", "library"), leaf("y", "transport"), leaf("z", "queue"));
    const result = clampMinimums(wide, "HORIZONTAL", { width: 420, height: 600 });
    expect(result.get("x")).toEqual({ width: Math.floor((320 * 420) / 840), height: 240 });
  });
});
