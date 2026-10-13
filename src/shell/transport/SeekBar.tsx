import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { commands } from "@/lib/ipc/commands";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePlayerStore } from "@/store/player";
import { send, useCurrentSong, usePlaybackEnabled } from "./use-current-song";

/** Elapsed and total seconds of the current song, and whether seeking works now. */
function useSeekState() {
  const song = useCurrentSong();
  const player = usePlayerStore((state) => state.player);
  const enabled = usePlaybackEnabled();
  const totalSeconds = Math.max(0, Math.floor((song?.durationMs ?? 0) / 1000));
  const positionSeconds = song && player.status !== "stopped" ? Math.floor(player.positionMs / 1000) : 0;
  const canSeek = enabled && player.status !== "stopped" && totalSeconds > 0;
  return { totalSeconds, positionSeconds, canSeek };
}

/**
 * The seek slider (TR-4): click, drag and the keyboard. While the user drags, the thumb follows
 * the pointer, not the position events. `showTimes` adds elapsed and total time beside it.
 */
export function SeekBar({ showTimes = true, className }: { showTimes?: boolean; className?: string }) {
  const setPosition = usePlayerStore((state) => state.setPosition);
  const { totalSeconds, positionSeconds, canSeek } = useSeekState();
  const [dragSeconds, setDragSeconds] = useState<number | null>(null);
  const seconds = Math.min(dragSeconds ?? positionSeconds, totalSeconds);
  const seek = (value: number) => {
    setDragSeconds(null);
    setPosition(value * 1000);
    send(() => commands.playerSeek(value * 1000));
  };
  return (
    <div data-slot="seek" className={cn("flex min-w-0 items-center gap-2 text-xs text-text-muted", className)}>
      {showTimes && (
        <span data-slot="time" className="tabular">
          {formatDuration(seconds * 1000)}
        </span>
      )}
      <Slider
        label="Seek"
        className="min-w-16 flex-1"
        min={0}
        max={Math.max(totalSeconds, 1)}
        step={1}
        largeStep={10}
        value={seconds}
        disabled={!canSeek}
        valueText={(value) => `${formatDuration(value * 1000)} of ${formatDuration(totalSeconds * 1000)}`}
        onValueChange={(value) => setDragSeconds(value)}
        onValueCommitted={(value) => seek(value)}
      />
      {showTimes && (
        <span data-slot="time" className="tabular">
          {formatDuration(totalSeconds * 1000)}
        </span>
      )}
    </div>
  );
}

/** The 2 px progress line along the band's bottom edge at SM and XS (UD4). Seeking is in the overflow menu. */
export function ProgressLine() {
  const { totalSeconds, positionSeconds } = useSeekState();
  const percent = totalSeconds > 0 ? Math.min(100, (positionSeconds / totalSeconds) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-label="Playback position"
      aria-valuemin={0}
      aria-valuemax={totalSeconds}
      aria-valuenow={positionSeconds}
      aria-valuetext={`${formatDuration(positionSeconds * 1000)} of ${formatDuration(totalSeconds * 1000)}`}
      data-slot="progress-line"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-brand-steel"
    >
      <div className="h-full bg-brand-red" style={{ width: `${percent}%` }} />
    </div>
  );
}
