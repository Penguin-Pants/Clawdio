import { create } from "zustand";
import { commands, type PlayerSnapshot, type QueueSnapshot } from "@/lib/ipc/commands";

/** The playlist the queue came from (D63): its id and its entries as the view showed them. */
export interface PlaylistSource {
  id: number;
  signature: string;
}

interface PlayerState {
  queue: QueueSnapshot;
  player: PlayerSnapshot;
  /**
   * Goes up each time the playing song changes while playing or paused (R35, D63): another
   * entry plays, or Play starts from stopped. A queue edit that keeps the playing song does not
   * count.
   */
  follow: number;
  /** The playlist view that started the queue, until any queue edit (D63). */
  playlistSource: PlaylistSource | null;
  /** A playlist view started playback; the next queue with these ids came from it. */
  pending: { source: PlaylistSource; ids: number[] } | null;
  /** The playlist view starts playback of `ids` (D63). */
  expectPlaylist: (id: number, ids: number[], signature: string) => void;
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
  expectPlaylist: (id, ids, signature) => set({ pending: { source: { id, signature }, ids } }),
  clearPlaylistSource: () => set({ playlistSource: null }),
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
    set((state) => ({
      player,
      follow: state.follow + (state.player.status === "stopped" && player.status !== "stopped" ? 1 : 0),
    }));
  },
  applyQueue: (queue) => {
    queueSeen = true;
    set((state) => {
      const old = state.queue;
      const same = sameEntries(old.entries, queue.entries);
      const changed =
        state.player.status !== "stopped" &&
        currentTrack(queue) !== null &&
        (currentTrack(queue) !== currentTrack(old) || (same && queue.current !== old.current));
      // Any queue edit ends the playlist source; the queue a playlist view started sets it.
      const pending = state.pending;
      const started = pending !== null && sameEntries(pending.ids, queue.entries);
      return {
        queue,
        follow: state.follow + (changed ? 1 : 0),
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
