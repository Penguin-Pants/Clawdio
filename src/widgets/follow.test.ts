import { describe, expect, it } from "vitest";
import { FOLLOW_IDLE_MS, playlistFollowRow, shouldFollow } from "./follow";

describe("shouldFollow (R35.2, R35.5, R35.6)", () => {
  const base = { hasSelection: true, target: 3, busy: false, lastInput: null, now: 100_000 };

  it("follows a list with a shown selection and the song in view", () => {
    expect(shouldFollow(base)).toBe(true);
  });

  it("does not follow without a selection, with the song not shown, or while busy", () => {
    expect(shouldFollow({ ...base, hasSelection: false })).toBe(false);
    expect(shouldFollow({ ...base, target: null })).toBe(false);
    expect(shouldFollow({ ...base, busy: true })).toBe(false);
  });

  it("waits 5 s after the last input in the list", () => {
    expect(shouldFollow({ ...base, lastInput: base.now - FOLLOW_IDLE_MS + 1 })).toBe(false);
    expect(shouldFollow({ ...base, lastInput: base.now - FOLLOW_IDLE_MS })).toBe(true);
  });
});

describe("playlistFollowRow (D63)", () => {
  const songA = 7;
  const songB = 8;
  const entries = (tracks: (number | null)[]) => tracks.map((track) => ({ track, label: "x" }));

  it("maps the queue entry to the row when the queue came from this view", () => {
    // [missing, songA, songA] played from the view: the second songA is queue entry 1, row 2.
    expect(playlistFollowRow(entries([null, songA, songA]), { track: songA, current: 1 }, true)).toBe(2);
  });

  it("follows a track that is in the playlist once, and no repeated one from another queue", () => {
    expect(playlistFollowRow(entries([songA, songB, songB]), { track: songA, current: 4 }, false)).toBe(0);
    expect(playlistFollowRow(entries([songA, songB, songB]), { track: songB, current: 1 }, false)).toBeNull();
    expect(playlistFollowRow(entries([songA, songB]), { track: 99, current: 0 }, false)).toBeNull();
  });
});
