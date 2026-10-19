import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FindHit, PlaylistEntry } from "@/lib/ipc/commands";
import { usePlaylistsStore } from "@/store/playlists";

/** The reply of the next `playlist_entries` call. */
let reply: () => Promise<PlaylistEntry[]> = () => Promise.resolve([]);
/** Settles the pending `library_find` call (R36). */
let findReply: (hit: FindHit | null) => void = () => {
  throw new Error("no find request");
};

vi.mock("@/lib/ipc/commands", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/ipc/commands")>();
  return {
    ...real,
    commands: {
      ...real.commands,
      playlistEntries: () => reply(),
      libraryRows: () => Promise.resolve([]),
      libraryFind: () => new Promise<FindHit | null>((resolve) => (findReply = resolve)),
    },
  };
});

const { PlaylistView } = await import("./PlaylistView");

const EMPTY_TEXT = "This playlist is empty. Add songs from the Library.";

beforeEach(() => {
  usePlaylistsStore.setState({
    rows: [{ id: 1, name: "Mix", fileName: "Mix.m3u8", entryCount: 2, isFavorites: false, missingCount: 0 }],
    version: 1,
  });
});

describe("PlaylistView (R12 v1.9)", () => {
  it("shows no empty hint while the entries load", () => {
    reply = () =>
      new Promise(() => {
        // Never settles: the read is still running.
      });
    render(<PlaylistView id={1} />);
    expect(screen.queryByText(EMPTY_TEXT)).toBeNull();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("says the playlist cannot be read when the read fails, not that it is empty", async () => {
    reply = () => Promise.reject(new Error("io"));
    render(<PlaylistView id={1} />);
    expect(await screen.findByText("Cannot read this playlist.")).toBeTruthy();
    expect(screen.queryByText(EMPTY_TEXT)).toBeNull();
  });

  it("shows the empty hint for a playlist with no entries", async () => {
    reply = () => Promise.resolve([]);
    render(<PlaylistView id={1} />);
    expect(await screen.findByText(EMPTY_TEXT)).toBeTruthy();
  });

  /** Renders two entries, types one key and lands its hit; `between` runs before the reply. */
  async function typeAndLand(between: () => void) {
    reply = () =>
      Promise.resolve([
        { track: 7, label: "" },
        { track: 8, label: "" },
      ]);
    render(<PlaylistView id={1} />);
    const list = await screen.findByRole("listbox");
    fireEvent.keyDown(list, { key: "b" });
    act(between);
    await act(async () => {
      findReply({ index: 1, id: 8 });
      await Promise.resolve();
    });
    return list;
  }

  it("a type-to-find hit moves the active row (R36.7)", async () => {
    const list = await typeAndLand(() => {
      // No playlist change.
    });
    expect(list.getAttribute("aria-activedescendant")).toMatch(/-row-1$/);
  });

  it("drops a type-to-find reply when a playlist edit starts before it lands (D65)", async () => {
    // A playlist change is on its way: the shown indices may be old.
    const list = await typeAndLand(() => usePlaylistsStore.setState({ reloading: 1 }));
    expect(list.getAttribute("aria-activedescendant")).toBeNull();
    usePlaylistsStore.setState({ reloading: 0 });
  });
});
