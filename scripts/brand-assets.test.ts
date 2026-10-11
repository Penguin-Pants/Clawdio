// Measurable parts of the brand asset rules (P1.1 to P1.4, P1-AC3, P1-AC4).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast.mjs";
import { REPO_ROOT } from "./test-helpers";

const RED = "#E10606";
const SILVER = "#B7B7B7";
const STEEL = "#4A4A4A";
const ICON_SQUARE = "#171717";

function load(path: string): Document {
  const { DOMParser } = new JSDOM().window;
  return new DOMParser().parseFromString(
    readFileSync(join(REPO_ROOT, "assets/branding", path), "utf8"),
    "image/svg+xml",
  );
}

/** Fill of each top-level group, in document order. */
const groupFills = (doc: Document) => [...doc.documentElement.children].map((group) => group.getAttribute("fill"));

/** Horizontal extent of a path made of M and L commands. */
function pathWidth(d: string): number {
  const xs = [...d.matchAll(/[ML]\s*(-?[\d.]+)\s+-?[\d.]+/g)].map((match) => Number(match[1]));
  return Math.max(...xs) - Math.min(...xs);
}

describe("wordmark", () => {
  it("has red Claw, silver dio and five red bars in the o (P1-AC4)", () => {
    const doc = load("export/clawdio-wordmark-primary.svg");
    expect(groupFills(doc)).toEqual([RED, SILVER, RED]);
    expect(doc.documentElement.children[2].children).toHaveLength(5);
  });

  it("has the same shapes in the source and the primary export", () => {
    expect(readFileSync(join(REPO_ROOT, "assets/branding/source/clawdio-wordmark.svg"), "utf8")).toBe(
      readFileSync(join(REPO_ROOT, "assets/branding/export/clawdio-wordmark-primary.svg"), "utf8"),
    );
  });

  it("has bars at least 1 px wide at the 20 px header height (P1.1)", () => {
    const doc = load("export/clawdio-wordmark-primary.svg");
    const viewHeight = Number(doc.documentElement.getAttribute("viewBox")?.split(/\s+/)[3]);
    const widths = [...doc.documentElement.children[2].children].map((bar) => pathWidth(bar.getAttribute("d") ?? ""));
    expect(Math.min(...widths) * (20 / viewHeight)).toBeGreaterThanOrEqual(1);
  });

  it("uses steel dio in the light variant, and both colors reach 3:1 on white (P1-AC4)", () => {
    const fills = groupFills(load("export/clawdio-wordmark-light.svg"));
    expect(fills).toEqual([RED, STEEL, RED]);
    for (const fill of new Set(fills)) expect(contrastRatio(fill ?? "", "#FFFFFF")).toBeGreaterThanOrEqual(3);
  });

  it("uses one fill, currentColor, in the mono variant", () => {
    expect(new Set(groupFills(load("export/clawdio-wordmark-mono.svg")))).toEqual(new Set(["currentColor"]));
  });
});

describe("app icon", () => {
  const icon = load("export/clawdio-icon-full.svg");
  const rim = icon.querySelector("[stroke-width='96']");

  it("is a 1024 square with corner radius 192 on the icon color (P1.4)", () => {
    const square = icon.querySelector("rect");
    expect([square?.getAttribute("width"), square?.getAttribute("rx"), square?.getAttribute("fill")]).toEqual([
      "1024",
      "192",
      ICON_SQUARE,
    ]);
  });

  it("scales the cat to 70 percent, so the rim is at least 1 px at 16 px (P1.2, P1-AC3)", () => {
    const scale = Number(
      rim
        ?.closest("g[transform]")
        ?.getAttribute("transform")
        ?.match(/matrix\(([\d.]+)/)?.[1],
    );
    expect(scale).toBe(0.7);
    expect(96 * scale * (16 / 1024)).toBeGreaterThanOrEqual(1);
  });

  it("has a rim with at least 3:1 contrast on the icon square (P1-AC3)", () => {
    expect(rim?.getAttribute("stroke")).toBe(SILVER);
    expect(contrastRatio(SILVER, ICON_SQUARE)).toBeGreaterThanOrEqual(3);
  });

  it("has a faint red arc and five red bars (P1.4)", () => {
    const arc = icon.querySelector("path[stroke-opacity]");
    expect([arc?.getAttribute("stroke"), arc?.getAttribute("stroke-opacity")]).toEqual([RED, "0.35"]);
    const bars = [...icon.documentElement.children].at(-1);
    expect([bars?.getAttribute("fill"), bars?.children.length]).toEqual([RED, 5]);
  });
});
