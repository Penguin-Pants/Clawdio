import { type SizeClass, atLeast } from "../use-size-class";

/** The transport band slots in their default order (UD4). */
export const SLOT_IDS = [
  "previous",
  "playPause",
  "next",
  "nowPlaying",
  "seek",
  "stop",
  "shuffle",
  "repeat",
  "volume",
  "queue",
  "search",
] as const;
export type SlotId = (typeof SLOT_IDS)[number];

export const DEFAULT_ORDER: readonly SlotId[] = SLOT_IDS;
/** The search button is hidden by default; Ctrl+F and the Library header reach search (UC9). */
export const DEFAULT_HIDDEN: readonly SlotId[] = ["search"];

/**
 * The smallest size class that shows each slot in the band (UD4 drop order, rework 6.2). Below
 * it the slot moves to the overflow menu. Play or pause and the now-playing display never drop.
 * The volume slider becomes an icon with a popover at MD; below MD the seek bar is a thin line
 * in the band and "Seek" in the overflow menu.
 */
const MIN_CLASS: Record<SlotId, SizeClass> = {
  previous: "sm",
  playPause: "xs",
  next: "sm",
  nowPlaying: "xs",
  seek: "md",
  stop: "lg",
  shuffle: "lg",
  repeat: "lg",
  volume: "md",
  queue: "lg",
  search: "xl",
};

/**
 * Where each visible slot renders at a size class: in the band or in the overflow menu, in the
 * given order. Hidden slots render nowhere; play or pause is never hidden (TR-3).
 */
export function layoutSlots(
  size: SizeClass,
  order: readonly SlotId[] = DEFAULT_ORDER,
  hidden: readonly SlotId[] = DEFAULT_HIDDEN,
): { band: SlotId[]; overflow: SlotId[] } {
  const band: SlotId[] = [];
  const overflow: SlotId[] = [];
  for (const id of order) {
    if (id !== "playPause" && hidden.includes(id)) continue;
    (atLeast(size, MIN_CLASS[id]) ? band : overflow).push(id);
  }
  return { band, overflow };
}
