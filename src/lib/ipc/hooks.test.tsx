import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { commands, type SongRow } from "./commands";
import { ROW_CACHE_LIMIT, useCommand, useSongRows } from "./hooks";

const song = (id: number): SongRow => ({
  id,
  artistId: 0,
  albumId: 0,
  title: `Song ${id}`,
  artistName: "A",
  albumName: "B",
  tagArtist: null,
  durationMs: 1000,
});

describe("useCommand", () => {
  it("returns the result, and the fallback when the call fails", async () => {
    const ok = renderHook(() => useCommand(() => Promise.resolve(5), 0, []));
    await waitFor(() => expect(ok.result.current).toBe(5));
    const failed = renderHook(() => useCommand(() => Promise.reject(new Error("no shell")), 7, []));
    await waitFor(() => expect(failed.result.current).toBe(7));
  });
});

describe("useSongRows (D14)", () => {
  it("fetches only ids that are not cached and keeps at most the limit", async () => {
    const libraryRows = vi.spyOn(commands, "libraryRows").mockImplementation((ids) => Promise.resolve(ids.map(song)));
    const { result } = renderHook(() => useSongRows());
    act(() => result.current.request([1, 2, 3]));
    await waitFor(() => expect(result.current.row(3)?.title).toBe("Song 3"));
    act(() => result.current.request([2, 3, 4]));
    await waitFor(() => expect(result.current.row(4)).toBeDefined());
    expect(libraryRows.mock.calls).toEqual([[[1, 2, 3]], [[4]]]);

    const many = Array.from({ length: ROW_CACHE_LIMIT + 10 }, (_, index) => 100 + index);
    act(() => result.current.request(many));
    await waitFor(() => expect(result.current.row(many.at(-1) as number)).toBeDefined());
    expect(result.current.row(1)).toBeUndefined();
    libraryRows.mockRestore();
  });
});
