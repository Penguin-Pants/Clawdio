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
import { type SlotId, bandZones, layoutSlots } from "./transport/slots";
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
 * set (TR-10) apply first. With slots before the play controls, the band has three zones and the
 * play controls sit in the middle (owner decision after U7). `data-widget` makes it an F6 region
 * (P2.12).
 */
export function TransportBand() {
  const ref = useRef<HTMLElement>(null);
  const size = useSizeClass(ref);
  const position = useUiStore((state) => state.transportPosition);
  const slots = useUiStore((state) => state.transportSlots);
  const mini = useUiStore((state) => state.mini);
  // The user's order and hidden set first, then the size class rule (UD20, UD4). In the mini
  // player Now playing always shows: its art is the exit (UD19).
  const hidden = mini ? slots.hidden.filter((id) => id !== "nowPlaying") : slots.hidden;
  const { band, overflow } = layoutSlots(size, slots.order, hidden);
  const compact = !atLeast(size, "md");
  const zones = bandZones(band);
  const centered = zones.left.length > 0;
  const slot = (id: SlotId) => <Slot key={id} id={id} size={size} mini={mini} />;
  const more = overflow.length > 0 && <OverflowMenu slots={overflow} />;
  return (
    <section
      ref={ref}
      aria-label="Transport controls"
      data-widget="transport"
      data-size={size}
      tabIndex={-1}
      className={cn(
        "relative min-w-0 items-center gap-2 overflow-hidden bg-bg-surface px-2 whitespace-nowrap text-text-primary [grid-area:transport] focus-visible:-outline-offset-2",
        // Equal side zones put the play controls in the middle of the band.
        centered ? "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] content-center" : "flex",
        compact ? "h-(--size-transport-bar-compact) py-1" : "h-(--size-transport-bar) py-2",
        // An inset line, not a border, so the token height holds the content exactly (TH-1).
        position === "top"
          ? "shadow-[inset_0_-1px_0_var(--color-border)]"
          : "shadow-[inset_0_1px_0_var(--color-border)]",
      )}
    >
      {centered ? (
        <>
          <div data-zone="left" className="flex min-w-0 items-center gap-2">
            {zones.left.map(slot)}
          </div>
          <div data-zone="center" className="flex items-center gap-2">
            {zones.center.map(slot)}
          </div>
          <div data-zone="right" className="flex min-w-0 items-center justify-end gap-2">
            {zones.right.map(slot)}
            {more}
          </div>
        </>
      ) : (
        <>
          {band.map(slot)}
          {!band.includes("seek") && <div className="flex-1" />}
          {more}
        </>
      )}
      {compact && <ProgressLine />}
    </section>
  );
}
