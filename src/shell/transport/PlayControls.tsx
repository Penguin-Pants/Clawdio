import { IconButton } from "@/components/icon-button";
import { commands, type RepeatMode } from "@/lib/ipc/commands";
import { cn } from "@/lib/utils";
import { usePlayerStore } from "@/store/player";
import { send, usePlaybackEnabled } from "./use-current-song";

/** The repeat mode after a click: off, all, one, then off again (R6). */
export const NEXT_REPEAT: Record<RepeatMode, RepeatMode> = { off: "all", all: "one", one: "off" };

export const REPEAT_LABELS: Record<RepeatMode, string> = { off: "Off", all: "All", one: "One" };

/** The 4 px dot under an active toggle (P7-AC8: on shows in grayscale too). */
const ON_DOT = (
  <span
    aria-hidden="true"
    data-slot="on-dot"
    className="absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-brand-red"
  />
);

const toggleIcon = (on: boolean) => cn(on && "text-brand-red");

/** Band buttons have a 32 px hit area (TR-8, UD22): the `icon` size of Button. */
const SIZE = "icon";

export function PreviousButton() {
  const enabled = usePlaybackEnabled();
  return (
    <IconButton
      icon="previous"
      label="Previous"
      size={SIZE}
      disabled={!enabled}
      onClick={() => send(commands.playerPrevious)}
    />
  );
}

export function NextButton() {
  const enabled = usePlaybackEnabled();
  return (
    <IconButton icon="next" label="Next" size={SIZE} disabled={!enabled} onClick={() => send(commands.playerNext)} />
  );
}

export function StopButton() {
  const enabled = usePlaybackEnabled();
  return (
    <IconButton icon="stop" label="Stop" size={SIZE} disabled={!enabled} onClick={() => send(commands.playerStop)} />
  );
}

/** Play or pause: the large ringed button. `compact` fits the 40 px band (UD3). */
export function PlayPauseButton({ compact = false }: { compact?: boolean }) {
  const enabled = usePlaybackEnabled();
  const playing = usePlayerStore((state) => state.player.status === "playing");
  return (
    <IconButton
      icon={playing ? "pause" : "play"}
      label={playing ? "Pause" : "Play"}
      tooltip={playing ? "Pause (Space)" : "Play (Space)"}
      disabled={!enabled}
      size={SIZE}
      className={cn("rounded-full border-2 border-brand-red", compact ? "size-8" : "size-10")}
      iconClassName={compact ? undefined : "size-5"}
      onClick={() => send(commands.playerToggle)}
    />
  );
}

export function ShuffleButton() {
  const enabled = usePlaybackEnabled();
  const shuffle = usePlayerStore((state) => state.player.shuffle);
  return (
    <IconButton
      icon="shuffle"
      label="Shuffle"
      size={SIZE}
      aria-pressed={shuffle}
      disabled={!enabled}
      className="relative"
      iconClassName={toggleIcon(shuffle)}
      mark={shuffle && ON_DOT}
      onClick={() => send(() => commands.playerSetShuffle(!shuffle))}
    />
  );
}

export function RepeatButton() {
  const enabled = usePlaybackEnabled();
  const repeat = usePlayerStore((state) => state.player.repeat);
  return (
    <IconButton
      icon={repeat === "one" ? "repeatOne" : "repeat"}
      label={repeat === "one" ? "Repeat one" : "Repeat"}
      size={SIZE}
      aria-pressed={repeat !== "off"}
      disabled={!enabled}
      className="relative"
      iconClassName={toggleIcon(repeat !== "off")}
      mark={repeat !== "off" && ON_DOT}
      onClick={() => send(() => commands.playerSetRepeat(NEXT_REPEAT[repeat]))}
    />
  );
}
