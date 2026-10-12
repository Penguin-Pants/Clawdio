// Typed event listeners (section 6.7). Payload types come from the Rust structs (D15).
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { JobProgress, PlayerSnapshot, QueueSnapshot, SettingsView } from "./commands";

interface EventPayloads {
  "library-changed": null;
  /** An album's art file exists now: the album id (P10.2). */
  "art-ready": number;
  /** The playlists or an entry changed (P11.4). */
  "playlists-changed": null;
  "job-progress": JobProgress;
  "status-message": string;
  "player-state": PlayerSnapshot;
  "queue-changed": QueueSnapshot;
  "player-position": number;
  "settings-changed": SettingsView;
}

export type EventName = keyof EventPayloads;

/** Listens to an app event. Outside the app shell it does nothing. */
export async function on<K extends EventName>(
  name: K,
  handler: (payload: EventPayloads[K]) => void,
): Promise<UnlistenFn> {
  try {
    return await listen<EventPayloads[K]>(name, (event) => handler(event.payload));
  } catch {
    return () => {};
  }
}
