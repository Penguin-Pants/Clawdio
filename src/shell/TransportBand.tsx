import { useRef } from "react";
import { IconButton } from "@/components/icon-button";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui";
import { focusLibrarySearch, setWidgetVisible } from "./layouts";
import { NowPlayingDisplay } from "./transport/NowPlayingDisplay";
import { OverflowMenu } from "./transport/OverflowMenu";
import {
  NextButton,
  PlayPauseButton,
  PreviousButton,
  RepeatButton,
  ShuffleButton,
  StopButton,
} from "./transport/PlayControls";
import { ProgressLine, SeekBar } from "./transport/SeekBar";
import { type SlotId, layoutSlots } from "./transport/slots";
import { VolumePopover, VolumeSlider } from "./transport/VolumeControl";
import { type SizeClass, atLeast, useSizeClass } from "./use-size-class";

function QueueToggle() {
  const shown = useUiStore((state) => state.visibleWidgets.includes("queue"));
  return (
    <IconButton
      icon="queue"
      label="Play queue"
      size="icon"
      aria-pressed={shown}
      iconClassName={cn(shown && "text-brand-red")}
      onClick={() => setWidgetVisible("queue", !shown)}
    />
  );
}

function Slot({ id, size, mini }: { id: SlotId; size: SizeClass; mini: boolean }) {
  switch (id) {
    case "previous":
      return <PreviousButton />;
    case "playPause":
      return <PlayPauseButton compact={!atLeast(size, "md")} />;
    case "next":
      return <NextButton />;
    case "nowPlaying":
      // In the mini player the art is the exit button: a menu does not fit a band-high window (UD19).
      return <NowPlayingDisplay art={mini || atLeast(size, "md")} className="max-w-64 min-w-0 shrink" />;
    case "seek":
      return <SeekBar className="min-w-32 flex-1" />;
    case "stop":
      return <StopButton />;
    case "shuffle":
      return <ShuffleButton />;
    case "repeat":
      return <RepeatButton />;
    case "volume":
      return atLeast(size, "lg") ? <VolumeSlider className="shrink-0" /> : <VolumePopover />;
    case "queue":
      return <QueueToggle />;
    case "search":
      return (
        <IconButton
          icon="search"
          label="Search"
          tooltip="Search (Ctrl+F)"
          size="icon"
          onClick={() => focusLibrarySearch()}
        />
      );
  }
}

/**
 * The transport band (SH-2, TR-1 to TR-8): a fixed band outside the dock, full width, with a
 * height from the size tokens (UD1, UD3). Its content follows its own width (UD4): slots that do
 * not fit move to the More menu, and play or pause always shows. The user's slot order and hidden
 * set (TR-10) apply first. `data-widget` makes it an F6
 * region (P2.12).
 */
export function TransportBand() {
  const ref = useRef<HTMLElement>(null);
  const size = useSizeClass(ref);
  const position = useUiStore((state) => state.transportPosition);
  const slots = useUiStore((state) => state.transportSlots);
  const mini = useUiStore((state) => state.mini);
  // The user's order and hidden set first, then the size class rule (UD20, UD4).
  const { band, overflow } = layoutSlots(size, slots.order, slots.hidden);
  const compact = !atLeast(size, "md");
  return (
    <section
      ref={ref}
      aria-label="Transport controls"
      data-widget="transport"
      data-size={size}
      tabIndex={-1}
      className={cn(
        "relative flex min-w-0 items-center gap-2 overflow-hidden bg-bg-surface px-2 whitespace-nowrap text-text-primary [grid-area:transport] focus-visible:-outline-offset-2",
        compact ? "h-(--size-transport-bar-compact) py-1" : "h-(--size-transport-bar) py-2",
        // An inset line, not a border, so the token height holds the content exactly (TH-1).
        position === "top"
          ? "shadow-[inset_0_-1px_0_var(--color-border)]"
          : "shadow-[inset_0_1px_0_var(--color-border)]",
      )}
    >
      {band.map((id) => (
        <Slot key={id} id={id} size={size} mini={mini} />
      ))}
      {!band.includes("seek") && <div className="flex-1" />}
      {overflow.length > 0 && <OverflowMenu slots={overflow} />}
      {compact && <ProgressLine />}
    </section>
  );
}
