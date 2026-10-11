import { describe, expect, it } from "vitest";
import { formatDuration } from "./format";

describe("formatDuration", () => {
  it.each([
    [0, "0:00"],
    [5_400, "0:05"],
    [83_000, "1:23"],
    [3_599_999, "59:59"],
    [3_723_000, "1:02:03"],
    [-10, "0:00"],
  ])("%d ms is %s", (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});
