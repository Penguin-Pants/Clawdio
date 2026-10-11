import { IconButton } from "@/components/icon-button";
import type { IconName } from "@/components/icons";
import { commands, type SongRow } from "@/lib/ipc/commands";
import { useCommand } from "@/lib/ipc/hooks";
import { formatDuration } from "@/lib/format";
import { currentTrack, usePlayerStore } from "@/store/player";

/** Transport controls. The buttons stay disabled until P4 and P7 wire them. */
export function TransportWidget() {
  const player = usePlayerStore((state) => state.player);
  const track = usePlayerStore((state) => currentTrack(state.queue));
  const song = useCommand<SongRow | null>(
    () => (track === null ? Promise.resolve(null) : commands.libraryRows([track]).then((rows) => rows[0] ?? null)),
    null,
    [track],
  );
  const playing = player.status === "playing";
  const buttons: { icon: IconName; label: string }[] = [
    { icon: "shuffle", label: "Shuffle" },
    { icon: "previous", label: "Previous" },
    { icon: playing ? "pause" : "play", label: playing ? "Pause" : "Play" },
    { icon: "stop", label: "Stop" },
    { icon: "next", label: "Next" },
    { icon: "repeat", label: "Repeat" },
  ];
  return (
    <div className="flex h-full flex-col justify-center gap-1 px-2">
      <div className="flex items-center justify-center gap-1">
        {buttons.map(({ icon, label }) => (
          <IconButton key={label} icon={icon} label={label} disabled />
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <span data-slot="time" className="tabular">
          {formatDuration(song ? player.positionMs : 0)}
        </span>
        <div data-slot="seek-track" aria-hidden="true" className="h-1 flex-1 rounded-full bg-brand-steel" />
        <span data-slot="time" className="tabular">
          {formatDuration(song?.durationMs ?? 0)}
        </span>
      </div>
    </div>
  );
}
