import { describe, expect, it } from "vitest";
import { contrastRatio, luminance, rgb } from "./contrast.mjs";

describe("contrast", () => {
  it("reads #RGB and #RRGGBB colors", () => {
    expect(rgb("#fff")).toEqual([255, 255, 255]);
    expect(rgb("#E10606")).toEqual([225, 6, 6]);
    expect(() => rgb("#E1060680")).toThrow("use #RGB or #RRGGBB");
  });

  it("gives luminance 0 for black and 1 for white", () => {
    expect(luminance([0, 0, 0])).toBe(0);
    expect(luminance([255, 255, 255])).toBeCloseTo(1, 10);
  });

  it("gives 21 for black on white, 1 for equal colors and the same value in both orders", () => {
    expect(contrastRatio("#000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777")).toBe(1);
    expect(contrastRatio("#E10606", "#0B0B0B")).toBeCloseTo(contrastRatio("#0B0B0B", "#E10606"), 10);
  });
});
