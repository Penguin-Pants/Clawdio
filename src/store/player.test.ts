import { describe, expect, it, vi } from "vitest";
import { commands } from "@/lib/ipc/commands";
import type { QueueSnapshot } from "@/lib/ipc/commands";
import { currentTrack, STOPPED, usePlayerStore } from "./player";

describe("currentTrack", () => {
  it("returns the track of the current entry, or null", () => {
    expect(currentTrack({ entries: [7, 9, 11], current: 1 })).toBe(9);
    expect(currentTrack({ entries: [7], current: null })).toBeNull();
    expect(currentTrack({ entries: [], current: 0 })).toBeNull();
  });
});

describe("load", () => {
  it("keeps a player-state event that arrives before the start read returns", async () => {
    let answer: (value: { entries: number[]; current: number | null }) => void = () => {};
    vi.spyOn(commands, "queueGet").mockReturnValue(new Promise((resolve) => (answer = resolve)));
    vi.spyOn(commands, "playerState").mockResolvedValue(STOPPED);
    const loading = usePlayerStore.getState().load();
    usePlayerStore.getState().applyState({ ...STOPPED, status: "playing" });
    usePlayerStore.getState().applyQueue({ entries: [5], current: 0 });
    answer({ entries: [], current: null });
    await loading;
    expect(usePlayerStore.getState().player.status).toBe("playing");
    expect(usePlayerStore.getState().queue.entries).toEqual([5]);
  });
});

describe("follow (R35, D63)", () => {
  const reset = (
    queue: QueueSnapshot = { entries: [1, 2, 2], current: 0 },
    status: "stopped" | "playing" = "playing",
  ) =>
    usePlayerStore.setState({ queue, player: { ...STOPPED, status }, follow: 0, playlistSource: null, pending: null });
  const follow = () => usePlayerStore.getState().follow;

  it("counts a new playing song, also the same track at the next entry", () => {
    reset();
    usePlayerStore.getState().applyQueue({ entries: [1, 2, 2], current: 1 });
    expect(follow()).toBe(1);
    usePlayerStore.getState().applyQueue({ entries: [1, 2, 2], current: 2 });
    expect(follow()).toBe(2);
  });

  it("does not count a queue edit that keeps the playing song", () => {
    reset({ entries: [1, 2, 3], current: 1 });
    usePlayerStore.getState().applyQueue({ entries: [2, 3], current: 0 });
    usePlayerStore.getState().applyQueue({ entries: [2, 3, 4], current: 0 });
    expect(follow()).toBe(0);
  });

  it("counts nothing while stopped, and Play from stopped once", () => {
    reset({ entries: [1, 2], current: 0 }, "stopped");
    usePlayerStore.getState().applyQueue({ entries: [1, 2], current: 1 });
    expect(follow()).toBe(0);
    usePlayerStore.getState().applyState({ ...STOPPED, status: "playing" });
    expect(follow()).toBe(1);
    usePlayerStore.getState().applyState({ ...STOPPED, status: "paused" });
    usePlayerStore.getState().applyState({ ...STOPPED, status: "playing" });
    expect(follow()).toBe(1);
  });

  it("keeps the source playlist until any queue edit", () => {
    reset({ entries: [], current: null }, "stopped");
    usePlayerStore.getState().expectPlaylist(4, [1, 1], "sig");
    usePlayerStore.getState().applyQueue({ entries: [1, 1], current: 1 });
    expect(usePlayerStore.getState().playlistSource).toEqual({ id: 4, signature: "sig" });
    usePlayerStore.getState().applyQueue({ entries: [1, 1], current: 0 });
    expect(usePlayerStore.getState().playlistSource).not.toBeNull();
    usePlayerStore.getState().applyQueue({ entries: [1], current: 0 });
    usePlayerStore.getState().applyQueue({ entries: [1, 1], current: 0 });
    expect(usePlayerStore.getState().playlistSource).toBeNull();
  });
});
