// @vitest-environment node
// Contrast of the color role pairs in build plan section 6.12, by WCAG 2.2 (P0.15, D10).
// "Pass" pairs must reach their threshold. "Excluded" pairs must stay below it, so a token
// change that makes them pass is reviewed before D10 changes. The state.redActive row is one
// role on four surfaces (3.16 to 2.70:1): it stays excluded while its worst surface fails.
// Decorative and "bar required" pairs have no threshold: D10 gives them a second cue instead.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Tokens = { colors: Record<string, Record<string, string>> };

const tokens: Tokens = JSON.parse(readFileSync(new URL("../../theme/tokens.json", import.meta.url), "utf8"));

const TEXT = 4.5;
const NON_TEXT = 3;

/** RGB channels (0 to 255) of a token color, by token path such as "bg.canvas". */
function color(path: string): number[] {
  const [group, name] = path.split(".");
  const value = tokens.colors[group]?.[name];
  if (!value) throw new Error(`no token colors.${path}`);
  const digits = value.slice(1);
  const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join("") : digits;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`colors.${path}: use #RGB or #RRGGBB, got ${value}`);
  return [0, 2, 4].map((start) => parseInt(full.slice(start, start + 2), 16));
}

/** WCAG 2.2 relative luminance. */
function luminance(channels: number[]): number {
  const [r, g, b] = channels.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, from 1 to 21. */
function contrast(a: number[], b: number[]): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
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

describe("contrast helper", () => {
  it("gives 21 for black on white and 1 for equal colors", () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrast([119, 119, 119], [119, 119, 119])).toBe(1);
  });
});

describe("color role pairs (section 6.12)", () => {
  it.each(passPairs)("%s on %s reaches %s:1", (fg, bg, threshold) => {
    expect(contrast(color(fg), color(bg))).toBeGreaterThanOrEqual(threshold);
  });

  it.each(excludedPairs)("%s on %s stays below %s:1 (excluded by D10)", (fg, bg, threshold) => {
    expect(contrast(color(fg), color(bg))).toBeLessThan(threshold);
  });

  it("state.redActive as an indicator stays below 3:1 on its worst surface (excluded by D10)", () => {
    const worst = Math.min(...SURFACES.map((bg) => contrast(color("state.redActive"), color(bg))));
    expect(worst).toBeLessThan(NON_TEXT);
  });
});
