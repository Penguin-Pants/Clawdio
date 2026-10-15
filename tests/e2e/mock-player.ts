// A mock player for the e2e build (P7): it keeps the queue and the player state like the
// engine's command side and sends the same events. Tests read the calls from the page.
import { emit } from "@tauri-apps/api/event";

type Status = "stopped" | "playing" | "paused";
type Repeat = "off" | "all" | "one";

interface Queue {
  entries: number[];
  current: number | null;
}

interface Player {
  status: Status;
  positionMs: number;
  volume: number;
  shuffle: boolean;
  repeat: Repeat;
}

export function createPlayer(queue: Queue, player: Player) {
  const announce = () => {
    void emit("queue-changed", { ...queue, entries: [...queue.entries] });
    void emit("player-state", { ...player });
  };
  /** Each command name in order, for tests: `document.body.dataset.playerCalls`. */
  const record = (command: string) => {
    const calls = JSON.parse(document.body.dataset.playerCalls ?? "[]") as string[];
    calls.push(command);
    document.body.dataset.playerCalls = JSON.stringify(calls);
  };
  const start = (index: number) => {
    queue.current = index;
    player.status = "playing";
    player.positionMs = 0;
  };
  const commands: Record<string, (args: Record<string, unknown>) => unknown> = {
    // Copies, like the real IPC: the store must not hold the object this mock changes.
    queue_get: () => ({ ...queue, entries: [...queue.entries] }),
    player_state: () => ({ ...player }),
    player_play_list: ({ ids, start: from }) => {
      // Tests read the last queue request from the page (P6-AC4).
      document.body.dataset.playList = JSON.stringify({ ids, start: from });
      queue.entries = [...(ids as number[])];
      start(from as number);
    },
    player_play: () => {
      if (queue.entries.length > 0) player.status = "playing";
    },
    player_pause: () => {
      if (player.status === "playing") player.status = "paused";
    },
    player_toggle: () => {
      if (player.status === "playing") player.status = "paused";
      else if (queue.entries.length > 0) player.status = "playing";
    },
    player_stop: () => {
      player.status = "stopped";
      player.positionMs = 0;
    },
    player_next: () => {
      if (queue.current !== null && queue.current + 1 < queue.entries.length) start(queue.current + 1);
    },
    player_previous: () => {
      if (queue.current !== null) start(Math.max(0, queue.current - 1));
    },
    player_seek: ({ ms }) => {
      player.positionMs = ms as number;
      document.body.dataset.seek = String(ms);
    },
    player_set_volume: ({ volume }) => {
      player.volume = Math.min(100, volume as number);
    },
    player_set_shuffle: ({ on }) => {
      player.shuffle = on as boolean;
    },
    player_set_repeat: ({ mode }) => {
      player.repeat = mode as Repeat;
    },
    queue_append: ({ ids }) => {
      queue.entries.push(...(ids as number[]));
    },
    queue_remove: ({ index }) => {
      const at = index as number;
      queue.entries.splice(at, 1);
      if (queue.current === null) return;
      if (at < queue.current) queue.current -= 1;
      else if (at === queue.current && queue.current >= queue.entries.length) {
        queue.current = queue.entries.length > 0 ? queue.entries.length - 1 : null;
        player.status = "stopped";
      }
    },
    queue_clear: () => {
      queue.entries = [];
      queue.current = null;
      player.status = "stopped";
      player.positionMs = 0;
    },
  };
  /** Handles a player or queue command, or returns undefined for other commands. */
  return (command: string, args: Record<string, unknown>): unknown => {
    const run = commands[command];
    if (!run) return undefined;
    const result = run(args);
    if (command !== "queue_get" && command !== "player_state") {
      record(command);
      announce();
    }
    return result ?? null;
  };
}
