import { type RefObject, useLayoutEffect, useRef, useState } from "react";
import { IconButton } from "@/components/icon-button";
import { observeSize } from "@/lib/resize";
import { useTokenPx } from "@/lib/tokens";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui";
import { focusLibrarySearch, setWidgetVisible, useGridStore } from "./layouts";
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
  const shown = useGridStore((state) => state.layout.queue !== undefined);
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

/**
 * True while the band is shorter than the band token (UD1): a one-row Transport controls widget
 * in a short window (R38.1). Measured once per frame of resizes (PF-2).
 */
function useShortBand(ref: RefObject<HTMLDivElement | null>): boolean {
  const regular = useTokenPx("--size-transport-bar");
  const [short, setShort] = useState(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setShort(element.offsetHeight > 0 && element.offsetHeight < regular);
    return observeSize(element, (entry) =>
      setShort((entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height) < regular),
    );
  }, [ref, regular]);
  return short;
}

function Slot({ id, size, mini, tight }: { id: SlotId; size: SizeClass; mini: boolean; tight: boolean }) {
  switch (id) {
    case "previous":
      return <PreviousButton />;
    case "playPause":
      return <PlayPauseButton compact={tight} />;
    case "next":
      return <NextButton />;
    case "nowPlaying":
      // In the mini player the art is the exit button: a menu does not fit a band-high window (UD19).
      return <NowPlayingDisplay art={mini || atLeast(size, "md")} small={tight} className="max-w-64 min-w-0 shrink" />;
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
 * The transport band (TR-1 to TR-8), the body of the Transport controls grid widget (R38.2) and
 * of the mini player (UD19). It fills its cell height. Its content follows its own width (UD4):
 * slots that do not fit move to the More menu, and play or pause always shows. The user's slot
 * order and hidden set (TR-10) apply first. With slots before the play controls, the band has
 * three zones and the play controls sit in the middle (owner decision after U7). The region and
 * its name come from the grid widget or the mini player.
 */
export function TransportBand() {
  const ref = useRef<HTMLDivElement>(null);
  const size = useSizeClass(ref);
  const slots = useUiStore((state) => state.transportSlots);
  const mini = useUiStore((state) => state.mini);
  // The user's order and hidden set first, then the size class rule (UD20, UD4). In the mini
  // player Now playing always shows: its art is the exit (UD19).
  const hidden = mini ? slots.hidden.filter((id) => id !== "nowPlaying") : slots.hidden;
  const { band, overflow } = layoutSlots(size, slots.order, hidden);
  const compact = !atLeast(size, "md");
  // A grid row shorter than the band token takes the compact padding and play button (R38.1).
  const short = useShortBand(ref);
  const tight = compact || short;
  const zones = bandZones(band);
  const centered = zones.left.length > 0;
  const slot = (id: SlotId) => <Slot key={id} id={id} size={size} mini={mini} tight={tight} />;
  const more = overflow.length > 0 && <OverflowMenu slots={overflow} />;
  return (
    <div
      ref={ref}
      data-band=""
      data-size={size}
      className={cn(
        "relative size-full min-w-0 items-center gap-2 overflow-hidden bg-bg-surface px-2 whitespace-nowrap text-text-primary",
        // Equal side zones put the play controls in the middle of the band. A side zone never
        // gets less than its content, so a long custom side moves the controls off center and
        // clips nothing.
        centered ? "grid grid-cols-[minmax(min-content,1fr)_auto_minmax(min-content,1fr)] content-center" : "flex",
        // A short row centers the content with no padding, so nothing scrolls (R38.1).
        short ? "py-0" : compact ? "py-1" : "py-2",
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
    </div>
  );
}
