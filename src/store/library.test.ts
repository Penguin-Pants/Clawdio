import { beforeEach, describe, expect, it } from "vitest";
import { EMPTY_SELECTION, selectSongs, useLibraryStore } from "./library";

beforeEach(() => useLibraryStore.setState({ search: "", selection: EMPTY_SELECTION }));

describe("library store (R38.3)", () => {
  it("starts with no search and no selection", () => {
    const state = useLibraryStore.getState();
    expect([state.search, state.selection]).toEqual(["", EMPTY_SELECTION]);
  });

  it("merges a partial selection", () => {
    useLibraryStore.getState().setSelection({ song: 7 });
    useLibraryStore.getState().setSelection({ artist: 1 });
    expect(useLibraryStore.getState().selection).toEqual({ artist: 1, album: null, song: 7 });
  });
});

describe("Songs multi-select (UD12, TB-10)", () => {
  const ids = [10, 11, 12, 13, 14];
  const none = { selected: new Set<number>(), anchor: null };

  it("a click selects one and sets the anchor", () => {
    expect(selectSongs(ids, none, 12, "single")).toEqual({ selected: new Set([12]), anchor: 12 });
  });

  it("Ctrl+click toggles one and moves the anchor", () => {
    const one = selectSongs(ids, none, 12, "single");
    const two = selectSongs(ids, one, 14, "toggle");
    expect(two).toEqual({ selected: new Set([12, 14]), anchor: 14 });
    expect(selectSongs(ids, two, 12, "toggle")).toEqual({ selected: new Set([14]), anchor: 12 });
  });

  it("Shift+click and Shift+arrow extend from the anchor in list order", () => {
    const one = selectSongs(ids, none, 11, "single");
    expect(selectSongs(ids, one, 13, "range")).toEqual({ selected: new Set([11, 12, 13]), anchor: 11 });
    expect(selectSongs(ids, one, 10, "range")).toEqual({ selected: new Set([10, 11]), anchor: 11 });
    // With no anchor in the list, a range starts at the target.
    expect(selectSongs(ids, none, 13, "range")).toEqual({ selected: new Set([13]), anchor: 13 });
  });

  it("the store keeps the selection, the anchor and the active row together", () => {
    useLibraryStore.getState().setSongSelection(new Set([1, 2]), 1, 2);
    expect(useLibraryStore.getState()).toMatchObject({ anchor: 1, selection: { song: 2 } });
    expect([...useLibraryStore.getState().selectedSongs]).toEqual([1, 2]);
    // A new artist or album selection clears the song selection.
    useLibraryStore.getState().setSelection({ artist: 3, album: null, song: null });
    expect(useLibraryStore.getState().selectedSongs.size).toBe(0);
  });
});

describe("playlist view (R12 v1.9)", () => {
  it("shows a playlist in place of the song table and goes back, keeping the selection", () => {
    useLibraryStore.setState({ playlist: null });
    useLibraryStore.getState().setSelection({ artist: 3 });
    useLibraryStore.getState().showPlaylist(5);
    expect(useLibraryStore.getState().playlist).toBe(5);
    useLibraryStore.getState().showPlaylist(null);
    expect(useLibraryStore.getState().playlist).toBeNull();
    expect(useLibraryStore.getState().selection.artist).toBe(3);
  });
});
