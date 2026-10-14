import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaylistEntry } from "@/lib/ipc/commands";
import { usePlaylistsStore } from "@/store/playlists";

/** The reply of the next `playlist_entries` call. */
let reply: () => Promise<PlaylistEntry[]> = async () => [];

vi.mock("@/lib/ipc/commands", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/ipc/commands")>();
  return {
    ...real,
    commands: { ...real.commands, playlistEntries: () => reply(), libraryRows: async () => [] },
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
    reply = () => new Promise(() => {});
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
    reply = async () => [];
    render(<PlaylistView id={1} />);
    expect(await screen.findByText(EMPTY_TEXT)).toBeTruthy();
  });
});
