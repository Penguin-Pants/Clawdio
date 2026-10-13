import { describe, expect, it } from "vitest";
import { CLAMP_FLOOR, type DockNode, clampMinimums, groupMinimum, nodeMinimum } from "./clamp";

const leaf = (id: string, ...widgets: string[]): DockNode => ({ kind: "group", id, widgets });
const split = (...children: DockNode[]): DockNode => ({ kind: "split", children });

/** The default preset (UD6): Playlists, Library and the Play queue and Lyrics tab group side by side. */
const DEFAULT = split(leaf("g1", "playlists"), leaf("g2", "library"), leaf("g3", "queue", "lyrics"));
/** All five dock widgets stacked in one column (P2-AC6 clamp case). */
const STACK = split(
  leaf("a", "library"),
  leaf("b", "nowPlaying"),
  leaf("c", "playlists"),
  leaf("d", "queue"),
  leaf("e", "lyrics"),
);

describe("groupMinimum", () => {
  it("takes the largest minimum of the widgets in a tabbed group", () => {
    expect(groupMinimum(["nowPlaying", "queue"])).toEqual({ width: 220, height: 240 });
  });

  it("ignores unknown widgets and never goes below the floor", () => {
    expect(groupMinimum(["unknown"])).toEqual({ width: CLAMP_FLOOR, height: CLAMP_FLOOR });
  });
});

describe("nodeMinimum", () => {
  it("adds widths in a horizontal split and takes the largest height", () => {
    expect(nodeMinimum(DEFAULT, "HORIZONTAL")).toEqual({ width: 720, height: 240 });
  });

  it("adds heights in a vertical split", () => {
    expect(nodeMinimum(STACK, "VERTICAL")).toEqual({ width: 320, height: 960 });
  });
});

describe("clampMinimums (D45)", () => {
  it("keeps the D33 minimums when the dock is large enough", () => {
    const result = clampMinimums(DEFAULT, "HORIZONTAL", { width: 1200, height: 600 });
    expect(result.get("g1")).toEqual({ width: 200, height: 160 });
    expect(result.get("g2")).toEqual({ width: 320, height: 240 });
  });

  it("lowers the minimums so five stacked widgets fit an 800 x 560 window", () => {
    // 560 less the header (32), the band (56), the status line (24) and the dock border.
    const dock = { width: 800, height: 446 };
    const result = clampMinimums(STACK, "VERTICAL", dock);
    const total = [...result.values()].reduce((sum, size) => sum + size.height, 0);
    expect(total).toBeLessThanOrEqual(dock.height);
    expect(Math.abs((result.get("a")?.height ?? 0) - (240 * 446) / 960)).toBeLessThanOrEqual(1);
    for (const size of result.values()) expect(size.height).toBeGreaterThanOrEqual(CLAMP_FLOOR);
  });

  it("never goes below the 32 px header", () => {
    const result = clampMinimums(STACK, "VERTICAL", { width: 800, height: 100 });
    for (const size of result.values()) expect(size.height).toBe(CLAMP_FLOOR);
  });

  it("clamps each axis on its own", () => {
    const result = clampMinimums(DEFAULT, "HORIZONTAL", { width: 360, height: 600 });
    expect(result.get("g2")).toEqual({ width: Math.floor((320 * 360) / 720), height: 240 });
  });
});
