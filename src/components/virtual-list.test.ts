import { describe, expect, it } from "vitest";
import { moveTarget } from "./virtual-list";

describe("moveTarget (R25)", () => {
  it("moves by one, to the ends and by a page, inside the list", () => {
    expect(moveTarget("ArrowDown", null, 10, 4)).toBe(0);
    expect(moveTarget("ArrowUp", null, 10, 4)).toBe(0);
    expect(moveTarget("ArrowDown", 3, 10, 4)).toBe(4);
    expect(moveTarget("ArrowDown", 9, 10, 4)).toBe(9);
    expect(moveTarget("ArrowUp", 0, 10, 4)).toBe(0);
    expect(moveTarget("Home", 5, 10, 4)).toBe(0);
    expect(moveTarget("End", 5, 10, 4)).toBe(9);
    expect(moveTarget("PageDown", 2, 10, 4)).toBe(6);
    expect(moveTarget("PageDown", 8, 10, 4)).toBe(9);
    expect(moveTarget("PageUp", 6, 10, 4)).toBe(2);
    expect(moveTarget("PageUp", 1, 10, 4)).toBe(0);
  });

  it("ignores other keys and empty lists", () => {
    expect(moveTarget("Enter", 1, 10, 4)).toBeNull();
    expect(moveTarget("ArrowDown", null, 0, 4)).toBeNull();
  });
});
