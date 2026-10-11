import { useState } from "react";
import { IconButton } from "@/components/icon-button";
import { Icon } from "@/components/icons";
import { Slider } from "@/components/ui/slider";
import { commands, type RepeatMode, type SongRow } from "@/lib/ipc/commands";
import { useCommand } from "@/lib/ipc/hooks";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { currentTrack, usePlayerStore } from "@/store/player";
import { useSettingsStore } from "@/store/settings";

/** The repeat mode after a click: off, all, one, then off again (R6). */
export const NEXT_REPEAT: Record<RepeatMode, RepeatMode> = { off: "all", all: "one", one: "off" };

/** Runs a player command. A failure leaves the player as it was; events show the real state. */
function send(run: () => Promise<void>) {
  void run().catch(() => {});
}

/** The 4 px dot under an active toggle (P7-AC8: on shows in grayscale too). */
const ON_DOT = (
  <span
    aria-hidden="true"
    data-slot="on-dot"
    className="absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-brand-red"
  />
);

/**
 * Transport controls (R5, R6, design.md section 6): Shuffle, Previous, Play or Pause, Stop,
 * Next and Repeat, the seek slider with elapsed and total time, and the volume slider. The
 * buttons are disabled with no music folder or an empty queue (P7.7).
 */
export function TransportWidget() {
  const player = usePlayerStore((state) => state.player);
  const queue = usePlayerStore((state) => state.queue);
  const setPosition = usePlayerStore((state) => state.setPosition);
  const track = currentTrack(queue);
  const song = useCommand<SongRow | null>(
    () => (track === null ? Promise.resolve(null) : commands.libraryRows([track]).then((rows) => rows[0] ?? null)),
    null,
    [track],
  );
  const ready = useSettingsStore((state) => state.view.folderState !== "none");
  const enabled = ready && queue.entries.length > 0;
  const playing = player.status === "playing";
  // While the user drags the seek thumb, it follows the pointer, not the position events.
  const [dragSeconds, setDragSeconds] = useState<number | null>(null);
  const [dragVolume, setDragVolume] = useState<number | null>(null);
  const totalSeconds = Math.max(0, Math.floor((song?.durationMs ?? 0) / 1000));
  const positionSeconds = song && player.status !== "stopped" ? Math.floor(player.positionMs / 1000) : 0;
  const seconds = Math.min(dragSeconds ?? positionSeconds, totalSeconds);
  const canSeek = enabled && player.status !== "stopped" && totalSeconds > 0;
  const seek = (value: number) => {
    setDragSeconds(null);
    setPosition(value * 1000);
    send(() => commands.playerSeek(value * 1000));
  };
  const toggleIcon = (on: boolean) => cn(on && "text-brand-red");
  return (
    <div className="flex h-full flex-col justify-center gap-1 px-2">
      <div className="flex items-center justify-center gap-1">
        <IconButton
          icon="shuffle"
          label="Shuffle"
          aria-pressed={player.shuffle}
          disabled={!enabled}
          className="relative"
          iconClassName={toggleIcon(player.shuffle)}
          mark={player.shuffle && ON_DOT}
          onClick={() => send(() => commands.playerSetShuffle(!player.shuffle))}
        />
        <IconButton
          icon="previous"
          label="Previous"
          disabled={!enabled}
          onClick={() => send(commands.playerPrevious)}
        />
        <IconButton
          icon={playing ? "pause" : "play"}
          label={playing ? "Pause" : "Play"}
          tooltip={playing ? "Pause (Space)" : "Play (Space)"}
          disabled={!enabled}
          size="icon-lg"
          className="size-11 rounded-full border-2 border-brand-red"
          iconClassName="size-5"
          onClick={() => send(commands.playerToggle)}
        />
        <IconButton icon="stop" label="Stop" disabled={!enabled} onClick={() => send(commands.playerStop)} />
        <IconButton icon="next" label="Next" disabled={!enabled} onClick={() => send(commands.playerNext)} />
        <IconButton
          icon={player.repeat === "one" ? "repeatOne" : "repeat"}
          label={player.repeat === "one" ? "Repeat one" : "Repeat"}
          aria-pressed={player.repeat !== "off"}
          disabled={!enabled}
          className="relative"
          iconClassName={toggleIcon(player.repeat !== "off")}
          mark={player.repeat !== "off" && ON_DOT}
          onClick={() => send(() => commands.playerSetRepeat(NEXT_REPEAT[player.repeat]))}
        />
      </div>
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <span data-slot="time" className="tabular">
          {formatDuration(seconds * 1000)}
        </span>
        <Slider
          label="Seek"
          className="flex-1"
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
        <span data-slot="time" className="tabular">
          {formatDuration(totalSeconds * 1000)}
        </span>
        <Icon
          name={(dragVolume ?? player.volume) === 0 ? "volumeMuted" : "volume"}
          className="ml-2 text-text-secondary"
        />
        <Slider
          label="Volume"
          className="w-24"
          min={0}
          max={100}
          step={1}
          largeStep={10}
          value={dragVolume ?? player.volume}
          valueText={(value) => `Volume ${value} percent`}
          onValueChange={(value) => {
            setDragVolume(value);
            send(() => commands.playerSetVolume(value));
          }}
          onValueCommitted={() => setDragVolume(null)}
        />
      </div>
    </div>
  );
}
