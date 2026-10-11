import { describe, expect, it, vi } from "vitest";
import { commands } from "@/lib/ipc/commands";
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
