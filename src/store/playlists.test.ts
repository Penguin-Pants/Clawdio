import { beforeEach, describe, expect, it } from "vitest";
import { PLAYLIST_TASK_JOB, playlistTask, usePlaylistsStore } from "./playlists";
import { useUiStore } from "./ui";

beforeEach(() => {
  usePlaylistsStore.setState({ busy: false });
  useUiStore.setState({ jobs: [], job: null, dialog: null });
});

describe("playlistTask (R32 busy state)", () => {
  it("shows the job while it runs, then the report", async () => {
    let finish: (value: boolean) => void = () => {};
    const run = playlistTask(
      "Importing playlists",
      () => new Promise<boolean>((resolve) => (finish = resolve)),
      () => ({ kind: "importReport", batch: { canceled: true, reports: [] } }),
      "Cannot import",
    );
    expect(usePlaylistsStore.getState().busy).toBe(true);
    expect(useUiStore.getState().job).toEqual({ id: PLAYLIST_TASK_JOB, text: "Importing playlists" });
    finish(true);
    await run;
    expect(usePlaylistsStore.getState().busy).toBe(false);
    expect(useUiStore.getState().job).toBeNull();
    expect(useUiStore.getState().dialog).toEqual({ kind: "importReport", batch: { canceled: true, reports: [] } });
  });

  it("runs one task at a time", async () => {
    usePlaylistsStore.setState({ busy: true });
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
    expect(usePlaylistsStore.getState().busy).toBe(false);
  });
});
