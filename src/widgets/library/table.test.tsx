// PF-1 on the real path (U4): a Songs table container resize renders no row again, and a new
// active row renders only the two rows whose props changed.
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { createElement, memo } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SongRow } from "@/lib/ipc/commands";
import { EMPTY_SELECTION, useLibraryStore } from "@/store/library";
import { usePlayerStore } from "@/store/player";
import { flushFrames, installControlledLayout, resize } from "@/test/resize";

const renders = vi.hoisted(() => ({ rows: 0 }));
const IDS = Array.from({ length: 200 }, (_, index) => index);

vi.mock("@/lib/ipc/commands", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/ipc/commands")>();
  const song = (id: number): SongRow => ({
    id,
    artistId: 0,
    albumId: 0,
    title: `Song ${id}`,
    artistName: "Artist",
    albumName: "Album",
    tagArtist: null,
    durationMs: 1000,
    trackNo: id + 1,
    disc: null,
  });
  return {
    ...real,
    commands: {
      ...real.commands,
      librarySongIds: async () => IDS,
      libraryRows: async (ids: number[]) => ids.map(song),
      playerPlayList: () => Promise.resolve(),
    },
  };
});

// The production memo row, wrapped with the same default prop compare so its renders count.
vi.mock("./rows", async (importOriginal) => {
  const real = await importOriginal<typeof import("./rows")>();
  const inner = (real.SongTableRow as unknown as { type: (props: object) => unknown }).type;
  return {
    ...real,
    SongTableRow: memo((props: object) => {
      renders.rows += 1;
      return createElement(inner as never, props);
    }),
  };
});

const { SongTable } = await import("./lists");

beforeEach(() => {
  installControlledLayout();
  useLibraryStore.setState({ mode: "topBottom", search: "", selection: EMPTY_SELECTION });
});
afterEach(() => vi.unstubAllGlobals());

describe("Songs table rows (PF-1)", () => {
  it("a container resize renders no row again; a new active row renders two", async () => {
    const { container } = render(<SongTable view="songs.topBottom" />);
    const grid = container.querySelector<HTMLElement>("[role='grid']");
    if (!grid) throw new Error("no grid");
    await act(async () => {
      resize(grid, 600, 400);
      flushFrames();
    });
    await waitFor(() => expect(container.querySelectorAll("[role='row'][aria-rowindex]").length).toBeGreaterThan(5));
    renders.rows = 0;
    await act(async () => {
      resize(grid, 420, 400);
      flushFrames();
      resize(grid, 900, 400);
      flushFrames();
    });
    expect(renders.rows).toBe(0);
    act(() => useLibraryStore.getState().setSongSelection(new Set([0]), 0, 0));
    renders.rows = 0;
    act(() => useLibraryStore.getState().setSongSelection(new Set([1]), 1, 1));
    expect(renders.rows).toBe(2);
  });
});

describe("Library playback (P24.8)", () => {
  it("a library play ends a pending playlist source, so the same ids do not claim it", async () => {
    usePlayerStore.getState().expectPlaylist(3, IDS);
    const { container } = render(<SongTable view="songs.topBottom" />);
    const grid = container.querySelector<HTMLElement>("[role='grid']");
    if (!grid) throw new Error("no grid");
    act(() => {
      resize(grid, 600, 400);
      flushFrames();
    });
    await waitFor(() => expect(container.querySelector("[role='row'][data-row]")).not.toBeNull());
    const row = container.querySelector<HTMLElement>("[role='row'][data-row]");
    if (!row) throw new Error("no row");
    fireEvent.doubleClick(row);
    expect(usePlayerStore.getState().pending).toBeNull();
    expect(usePlayerStore.getState().playlistSource).toBeNull();
  });
});
