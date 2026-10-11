import { describe, expect, it } from "vitest";
import { currentTrack } from "./player";

describe("currentTrack", () => {
  it("returns the track of the current entry, or null", () => {
    expect(currentTrack({ entries: [7, 9, 11], current: 1 })).toBe(9);
    expect(currentTrack({ entries: [7], current: null })).toBeNull();
    expect(currentTrack({ entries: [], current: 0 })).toBeNull();
  });
});
