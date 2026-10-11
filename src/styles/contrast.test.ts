// @vitest-environment node
// Contrast of the color role pairs in build plan section 6.12, by WCAG 2.2 (P0.15, D10).
// "Pass" pairs must reach their threshold. "Excluded" pairs must stay below it, so a token
// change that makes them pass is reviewed before D10 changes. The state.redActive row is one
// role on four surfaces (3.16 to 2.70:1): it stays excluded while its worst surface fails.
// Decorative and "bar required" pairs have no threshold: D10 gives them a second cue instead.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "../../scripts/contrast.mjs";

type Tokens = { colors: Record<string, Record<string, string>> };

const tokens: Tokens = JSON.parse(readFileSync(new URL("../../theme/tokens.json", import.meta.url), "utf8"));

const TEXT = 4.5;
const NON_TEXT = 3;

/** A token color by path, for example "bg.canvas". */
function color(path: string): string {
  const [group, name] = path.split(".");
  const value = tokens.colors[group]?.[name];
  if (!value) throw new Error(`no token colors.${path}`);
  return value;
}

const SURFACES = ["bg.canvas", "bg.surface", "bg.elevated", "bg.hover"];
const ROW_BACKGROUNDS = [...SURFACES, "state.selected"];

const passPairs: [string, string, number][] = [
  ...ROW_BACKGROUNDS.flatMap((bg) =>
    ["text.primary", "text.secondary", "text.muted"].map((fg): [string, string, number] => [fg, bg, TEXT]),
  ),
  ["text.primary", "state.redActive", TEXT],
  ...SURFACES.map((bg): [string, string, number] => ["brand.red", bg, NON_TEXT]),
  ["text.primary", "state.selected", NON_TEXT],
  ["text.primary", "bg.surface", NON_TEXT],
];

const excludedPairs: [string, string, number][] = [
  ["text.primary", "brand.red", TEXT],
  ["text.primary", "state.redHover", TEXT],
  ["brand.red", "state.selected", NON_TEXT],
];

describe("color role pairs (section 6.12)", () => {
  it.each(passPairs)("%s on %s reaches %s:1", (fg, bg, threshold) => {
    expect(contrastRatio(color(fg), color(bg))).toBeGreaterThanOrEqual(threshold);
  });

  it.each(excludedPairs)("%s on %s stays below %s:1 (excluded by D10)", (fg, bg, threshold) => {
    expect(contrastRatio(color(fg), color(bg))).toBeLessThan(threshold);
  });

  it("state.redActive as an indicator stays below 3:1 on its worst surface (excluded by D10)", () => {
    const worst = Math.min(...SURFACES.map((bg) => contrastRatio(color("state.redActive"), color(bg))));
    expect(worst).toBeLessThan(NON_TEXT);
  });
});
