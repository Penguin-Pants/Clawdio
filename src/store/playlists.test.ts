import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands } from "@/lib/ipc/commands";
import { usePlayerStore } from "./player";
import { playPlaylist, playlistQueue, playlistTask, usePlaylistsStore } from "./playlists";
import { useUiStore } from "./ui";

beforeEach(() => {
  usePlaylistsStore.setState({ busy: null });
  useUiStore.setState({ jobs: [], job: null, dialog: null });
});

describe("playlistTask (R32 busy state)", () => {
  it("shows the busy text while it runs, then the report", async () => {
    let finish: (value: boolean) => void = () => {};
    const run = playlistTask(
      "Importing playlists",
      () => new Promise<boolean>((resolve) => (finish = resolve)),
      () => ({ kind: "importReport", batch: { canceled: true, reports: [] } }),
      "Cannot import",
    );
    expect(usePlaylistsStore.getState().busy).toBe("Importing playlists");
    expect(useUiStore.getState().job).toBeNull();
    finish(true);
    await run;
    expect(usePlaylistsStore.getState().busy).toBeNull();
    expect(useUiStore.getState().dialog).toEqual({ kind: "importReport", batch: { canceled: true, reports: [] } });
  });

  it("runs one task at a time", async () => {
    usePlaylistsStore.setState({ busy: "x" });
    let ran = false;
    await playlistTask(
      "x",
      async () => (ran = true),
      () => null,
      "x",
    );
    expect(ran).toBe(false);
  });

  it("opens no dialog when the picker was canceled", async () => {
    await playlistTask(
      "x",
      async () => null,
      () => null,
      "x",
    );
    expect(useUiStore.getState().dialog).toBeNull();
  });

  it("shows a failure in the error dialog", async () => {
    await playlistTask(
      "x",
      () => Promise.reject({ code: "playlist", message: "Choose a music folder first" }),
      () => null,
      "Cannot import",
    );
    expect(useUiStore.getState().dialog).toEqual({ kind: "error", text: "Choose a music folder first" });
    expect(usePlaylistsStore.getState().busy).toBeNull();
  });
});

describe("playlistQueue (R6 queue rule)", () => {
  const entries = [
    { track: 4, label: "" },
    { track: null, label: "../Missing.mp3" },
    { track: 7, label: "" },
  ];

  it("queues the library tracks in order and skips missing entries", () => {
    expect(playlistQueue(entries)).toEqual({ ids: [4, 7], start: 0 });
  });

  it("starts at the entry, or the next one that is not missing", () => {
    expect(playlistQueue(entries, 2)).toEqual({ ids: [4, 7], start: 1 });
    expect(playlistQueue(entries, 1)).toEqual({ ids: [4, 7], start: 1 });
  });

  it("gives null when nothing from the entry on can play", () => {
    expect(playlistQueue([{ track: null, label: "x" }])).toBeNull();
    expect(playlistQueue(entries, 3)).toBeNull();
  });
});

describe("playPlaylist (R12)", () => {
  afterEach(() => vi.restoreAllMocks());
  const shown = [
    { track: 7, label: "a" },
    { track: 8, label: "b" },
  ];

  it("plays the entries the caller shows, with no second read", async () => {
    const read = vi.spyOn(commands, "playlistEntries").mockResolvedValue([{ track: 9, label: "c" }]);
    const play = vi.spyOn(commands, "playerPlayList").mockResolvedValue();
    await playPlaylist(1, 1, shown);
    expect(read).not.toHaveBeenCalled();
    expect(play).toHaveBeenCalledWith([7, 8], 1);
    // D63: the view that shows the entries becomes the source of the queue.
    expect(usePlayerStore.getState().pending).toEqual({ source: { id: 1, signature: "[7,8]" }, ids: [7, 8] });
  });

  it("forgets the view as the queue source when the play fails (D63)", async () => {
    vi.spyOn(commands, "playerPlayList").mockRejectedValue(new Error("no"));
    await expect(playPlaylist(1, 0, shown)).rejects.toThrow("no");
    expect(usePlayerStore.getState().pending).toBeNull();
  });

  it("ends the view's source when the Playlists widget plays the same ids (D63)", async () => {
    vi.spyOn(commands, "playlistEntries").mockResolvedValue(shown);
    vi.spyOn(commands, "playerPlayList").mockResolvedValue();
    usePlayerStore.setState({ playlistSource: { id: 3, signature: "[7,8]" } });
    await playPlaylist(1);
    expect(usePlayerStore.getState().playlistSource).toBeNull();
  });

  it("reads the entries when the caller has none", async () => {
    vi.spyOn(commands, "playlistEntries").mockResolvedValue(shown);
    const play = vi.spyOn(commands, "playerPlayList").mockResolvedValue();
    await playPlaylist(1);
    expect(play).toHaveBeenCalledWith([7, 8], 0);
  });
});

describe("usePlaylistsStore.load (R25 stale indices)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("counts a load in flight from its start until both reads land", async () => {
    let finish: (rows: never[]) => void = () => undefined;
    vi.spyOn(commands, "playlistsList").mockReturnValue(new Promise((resolve) => (finish = resolve)));
    vi.spyOn(commands, "favorites").mockResolvedValue([]);
    const before = usePlaylistsStore.getState().version;
    const run = usePlaylistsStore.getState().load();
    expect(usePlaylistsStore.getState().reloading).toBe(1);
    expect(usePlaylistsStore.getState().version).toBe(before);
    finish([]);
    await run;
    expect(usePlaylistsStore.getState().reloading).toBe(0);
    expect(usePlaylistsStore.getState().version).toBe(before + 1);
  });
});
