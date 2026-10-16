import { create } from "zustand";
import { commands, type PlayerSnapshot, type QueueSnapshot } from "@/lib/ipc/commands";

/** The playlist view the queue came from (D63). */
export interface PlaylistSource {
  id: number;
}

interface PlayerState {
  queue: QueueSnapshot;
  player: PlayerSnapshot;
  /**
   * Goes up each time the player starts another entry while playing or paused (R35, D63),
   * also the same track at another entry, or Play from stopped. A restart of the same entry
   * (Repeat one, Previous) and a queue edit that keeps the playing entry do not count.
   */
  follow: number;
  /** The playlist view that started the queue, until any queue edit or playlist change (D63). */
  playlistSource: PlaylistSource | null;
  /** A playlist view started playback; the next queue with these ids came from it. */
  pending: { source: PlaylistSource; ids: number[] } | null;
  /** The playlist view starts playback of `ids` (D63). */
  expectPlaylist: (id: number, ids: number[]) => void;
  clearPlaylistSource: () => void;
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
  started: 0,
};

/** Set once a player event arrives: a later start read is older, so it is dropped. */
let stateSeen = false;
let queueSeen = false;

const sameEntries = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((id, index) => id === b[index]);

export const usePlayerStore = create<PlayerState>()((set) => ({
  queue: EMPTY_QUEUE,
  player: STOPPED,
  follow: 0,
  playlistSource: null,
  pending: null,
  expectPlaylist: (id, ids) => set({ pending: { source: { id }, ids } }),
  // A playlist change ends a source and one that a view's play has not confirmed yet (D63).
  clearPlaylistSource: () => set({ playlistSource: null, pending: null }),
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
    // A new count is an entry the player started (the engine sends the queue first).
    set((state) => ({
      player,
      follow: state.follow + (player.status !== "stopped" && player.started !== state.player.started ? 1 : 0),
    }));
  },
  applyQueue: (queue) => {
    queueSeen = true;
    set((state) => {
      const same = sameEntries(state.queue.entries, queue.entries);
      // Any queue edit ends the playlist source; the queue a playlist view started sets it.
      const pending = state.pending;
      const started = pending !== null && sameEntries(pending.ids, queue.entries);
      return {
        queue,
        playlistSource: started ? pending.source : same ? state.playlistSource : null,
        pending: started ? null : pending,
      };
    });
  },
  setPosition: (positionMs) => set((state) => ({ player: { ...state.player, positionMs } })),
}));

/** The track id of the current queue entry, or null. */
export function currentTrack(queue: QueueSnapshot): number | null {
  return queue.current === null ? null : (queue.entries[queue.current] ?? null);
}
