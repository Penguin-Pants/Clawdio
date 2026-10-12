import { create } from "zustand";
import { commands, type PlayerSnapshot, type QueueSnapshot } from "@/lib/ipc/commands";

interface PlayerState {
  queue: QueueSnapshot;
  player: PlayerSnapshot;
  /** Reads the queue and the player state at start. Events keep them current. */
  load: () => Promise<void>;
  /** The `player-state` event. */
  applyState: (player: PlayerSnapshot) => void;
  /** The `queue-changed` event. */
  applyQueue: (queue: QueueSnapshot) => void;
  /** The `player-position` event (4 per second while playing). */
  setPosition: (positionMs: number) => void;
}

export const EMPTY_QUEUE: QueueSnapshot = { entries: [], current: null };
export const STOPPED: PlayerSnapshot = {
  status: "stopped",
  positionMs: 0,
  volume: 100,
  shuffle: false,
  repeat: "off",
};

/** Set once a player event arrives: a later start read is older, so it is dropped. */
let stateSeen = false;
let queueSeen = false;

export const usePlayerStore = create<PlayerState>()((set) => ({
  queue: EMPTY_QUEUE,
  player: STOPPED,
  load: async () => {
    stateSeen = false;
    queueSeen = false;
    const [queue, player] = await Promise.all([
      commands.queueGet().catch(() => EMPTY_QUEUE),
      commands.playerState().catch(() => STOPPED),
    ]);
    if (!queueSeen) set({ queue });
    if (!stateSeen) set({ player });
  },
  applyState: (player) => {
    stateSeen = true;
    set({ player });
  },
  applyQueue: (queue) => {
    queueSeen = true;
    set({ queue });
  },
  setPosition: (positionMs) => set((state) => ({ player: { ...state.player, positionMs } })),
}));

/** The track id of the current queue entry, or null. */
export function currentTrack(queue: QueueSnapshot): number | null {
  return queue.current === null ? null : (queue.entries[queue.current] ?? null);
}
