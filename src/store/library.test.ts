import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_FRAMES, EMPTY_SELECTION, useLibraryStore } from "./library";

beforeEach(() => useLibraryStore.setState({ mode: "columns", search: "", selection: EMPTY_SELECTION }));

describe("library store (P2.8, R28)", () => {
  it("starts in Columns mode with no search and no selection", () => {
    const state = useLibraryStore.getState();
    expect([state.mode, state.search, state.selection]).toEqual(["columns", "", EMPTY_SELECTION]);
  });

  it("keeps search text and selection across a mode switch (P2-AC5)", () => {
    const store = useLibraryStore.getState();
    store.setSearch("abba");
    store.setSelection({ artist: 4, album: 9 });
    store.setMode("tree");
    store.setMode("topBottom");
    const state = useLibraryStore.getState();
    expect(state.mode).toBe("topBottom");
    expect(state.search).toBe("abba");
    expect(state.selection).toEqual({ artist: 4, album: 9, song: null });
  });

  it("merges a partial selection", () => {
    useLibraryStore.getState().setSelection({ song: 7 });
    useLibraryStore.getState().setSelection({ artist: 1 });
    expect(useLibraryStore.getState().selection).toEqual({ artist: 1, album: null, song: 7 });
  });
});

describe("Library frame sizes (P22.2, R28.1)", () => {
  beforeEach(() => useLibraryStore.getState().resetFrames());

  it("keeps each mode's fractions across a mode switch (P22-AC1)", () => {
    const store = useLibraryStore.getState();
    store.setFrames("columns", [0.2, 0.3, 0.5]);
    store.setFrames("top", [0.6, 0.4]);
    store.setFrames("rows", [0.3, 0.7]);
    store.setMode("tree");
    store.setMode("columns");
    expect(useLibraryStore.getState().frames).toEqual({
      columns: [0.2, 0.3, 0.5],
      topBottom: { top: [0.6, 0.4], rows: [0.3, 0.7] },
    });
  });

  it("resetFrames restores the defaults of all modes", () => {
    const store = useLibraryStore.getState();
    store.setFrames("columns", [0.1, 0.1, 0.8]);
    store.setFrames("rows", [0.9, 0.1]);
    store.resetFrames();
    expect(useLibraryStore.getState().frames).toEqual(DEFAULT_FRAMES);
  });
});
