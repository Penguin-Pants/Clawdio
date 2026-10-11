import { create } from "zustand";
import { commands, type PlayerSnapshot, type QueueSnapshot } from "@/lib/ipc/commands";

interface PlayerState {
  queue: QueueSnapshot;
  player: PlayerSnapshot;
  /** Reads the queue and the player state. P4 and P7 add the events that keep them current. */
  load: () => Promise<void>;
}

export const EMPTY_QUEUE: QueueSnapshot = { entries: [], current: null };
export const STOPPED: PlayerSnapshot = { status: "stopped", positionMs: 0, volume: 100 };

export const usePlayerStore = create<PlayerState>()((set) => ({
  queue: EMPTY_QUEUE,
  player: STOPPED,
  load: async () => {
    const [queue, player] = await Promise.all([
      commands.queueGet().catch(() => EMPTY_QUEUE),
      commands.playerState().catch(() => STOPPED),
    ]);
    set({ queue, player });
  },
}));

/** The track id of the current queue entry, or null. */
export function currentTrack(queue: QueueSnapshot): number | null {
  return queue.current === null ? null : (queue.entries[queue.current] ?? null);
}
