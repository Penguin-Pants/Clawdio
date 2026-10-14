import { commands, type SongRow } from "@/lib/ipc/commands";
import { useCommand } from "@/lib/ipc/hooks";
import { useLibraryStore } from "@/store/library";
import { currentTrack, usePlayerStore } from "@/store/player";
import { useSettingsStore } from "@/store/settings";

/** The row of the current queue entry, or null. One player state feeds the band and the card. */
export function useCurrentSong(): SongRow | null {
  const track = usePlayerStore((state) => currentTrack(state.queue));
  // A rescan keeps the id but can change the tags or the duration (R4).
  const libraryVersion = useLibraryStore((state) => state.version);
  return useCommand<SongRow | null>(
    () => (track === null ? Promise.resolve(null) : commands.libraryRows([track]).then((rows) => rows[0] ?? null)),
    null,
    [track, libraryVersion],
  );
}

/** The play buttons work with a music folder and a queue (P7.7). */
export function usePlaybackEnabled(): boolean {
  const ready = useSettingsStore((state) => state.view.folderState !== "none");
  const queued = usePlayerStore((state) => state.queue.entries.length > 0);
  return ready && queued;
}

/** Runs a player command. A failure leaves the player as it was; events show the real state. */
export function send(run: () => Promise<void>): void {
  void run().catch(() => {});
}
