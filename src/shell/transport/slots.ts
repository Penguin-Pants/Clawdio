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

/**
 * The default band order (owner decision after U7): Now playing and the seek bar on the left, the
 * play controls in the middle, the rest on the right.
 */
export const DEFAULT_ORDER: readonly SlotId[] = [
  "nowPlaying",
  "seek",
  "previous",
  "playPause",
  "next",
  "stop",
  "shuffle",
  "repeat",
  "volume",
  "queue",
  "search",
];
/** The default order before the centered band: a saved copy of it moves to `DEFAULT_ORDER`. */
const LEFT_ALIGNED_ORDER: readonly SlotId[] = SLOT_IDS;
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

/** Previous, play or pause and next: one group that moves together and keeps this order. */
const GROUP: readonly SlotId[] = ["previous", "playPause", "next"];

/** The band split around the play controls: the middle zone is centered when a left zone exists. */
export function bandZones(band: readonly SlotId[]): { left: SlotId[]; center: SlotId[]; right: SlotId[] } {
  const first = band.findIndex((id) => GROUP.includes(id));
  const last = band.findLastIndex((id) => GROUP.includes(id));
  return { left: band.slice(0, first), center: band.slice(first, last + 1), right: band.slice(last + 1) };
}

/** The user's slot order and hidden set (UD20), saved as `transportSlots` in `layout.json`. */
export interface TransportSlots {
  order: SlotId[];
  hidden: SlotId[];
}

export const DEFAULT_SLOTS: TransportSlots = { order: [...DEFAULT_ORDER], hidden: [...DEFAULT_HIDDEN] };

/** Every slot can hide but play or pause (TR-3). */
export function canHide(id: SlotId): boolean {
  return id !== "playPause";
}

/** An order with the play group joined at its first slot, in its own order. */
function joinGroup(order: readonly SlotId[]): SlotId[] {
  const at = order.findIndex((id) => GROUP.includes(id));
  const rest = order.filter((id) => !GROUP.includes(id));
  if (at === -1) return [...rest, ...GROUP];
  const before = order.slice(0, at).filter((id) => !GROUP.includes(id)).length;
  return [...rest.slice(0, before), ...GROUP, ...rest.slice(before)];
}

/**
 * Moves a slot to `index`, its index in the result. A play control moves the whole group, which
 * then starts at `index`. Another slot never lands inside the group: it goes just before it.
 */
export function moveSlotTo(slots: TransportSlots, id: SlotId, index: number): TransportSlots {
  const moving = GROUP.includes(id) ? GROUP : [id];
  const rest = slots.order.filter((other) => !moving.includes(other));
  let target = Math.min(rest.length, Math.max(0, index));
  if (moving.length === 1) {
    const start = rest.indexOf(GROUP[0]);
    if (target > start && target < start + GROUP.length) target = start;
  }
  const order = [...rest.slice(0, target), ...moving, ...rest.slice(target)];
  return order.every((other, at) => other === slots.order[at]) ? slots : { ...slots, order };
}

/**
 * Moves a slot to just before the slot at `before` in the current order (`order.length` for the
 * end): the drop line of a pointer drag (UD20).
 */
export function moveSlotBefore(slots: TransportSlots, id: SlotId, before: number): TransportSlots {
  const moving = GROUP.includes(id) ? GROUP : [id];
  // The moved slots leave their places first: count only the others before the drop line.
  const others = slots.order.slice(0, before).filter((other) => !moving.includes(other)).length;
  return moveSlotTo(slots, id, others);
}

/**
 * Moves a slot one place up (-1) or down (+1): Move up and Move down (AX-1). The play group moves
 * past one neighbor; a neighbor moves past the whole group.
 */
export function moveSlot(slots: TransportSlots, id: SlotId, step: -1 | 1): TransportSlots {
  const moving = GROUP.includes(id) ? GROUP : [id];
  const rest = slots.order.filter((other) => !moving.includes(other));
  const at = slots.order.indexOf(moving[0]);
  let target = at + step;
  if (moving.length === 1 && step === 1 && GROUP.includes(slots.order[at + 1])) {
    target = at + GROUP.length;
  }
  if (moving.length === 1 && step === -1 && GROUP.includes(slots.order[at - 1])) {
    target = at - GROUP.length;
  }
  if (target < 0 || target > rest.length) return slots;
  return moveSlotTo(slots, id, target);
}

export function setSlotHidden(slots: TransportSlots, id: SlotId, hidden: boolean): TransportSlots {
  if (!canHide(id) || slots.hidden.includes(id) === hidden) return slots;
  return { ...slots, hidden: hidden ? [...slots.hidden, id] : slots.hidden.filter((other) => other !== id) };
}

const isSlot = (value: unknown): value is SlotId => (SLOT_IDS as readonly unknown[]).includes(value);

/**
 * Reads `transportSlots` (UD20). No value gives the defaults. An unknown slot id is dropped with
 * one warning; a missing slot goes at the end. A split play group joins at its first slot. The
 * untouched default from before the centered band gives the new default. A hidden play or pause,
 * or a value that is not an object with arrays, gives the defaults with a warning.
 */
export function parseSlots(value: unknown): { slots: TransportSlots; warnings: string[] } {
  if (value === undefined) return { slots: DEFAULT_SLOTS, warnings: [] };
  const object = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
  if (!object || !Array.isArray(object.order) || !Array.isArray(object.hidden)) {
    return { slots: DEFAULT_SLOTS, warnings: ["invalid transport slots; using the defaults"] };
  }
  if (object.hidden.includes("playPause")) {
    return { slots: DEFAULT_SLOTS, warnings: ["transport slots hide play or pause; using the defaults"] };
  }
  const unknown = new Set([...object.order, ...object.hidden].filter((id) => !isSlot(id)).map(String));
  const saved = [...new Set(object.order.filter(isSlot))];
  const untouched =
    saved.length === LEFT_ALIGNED_ORDER.length && saved.every((id, at) => id === LEFT_ALIGNED_ORDER[at]);
  const order = untouched
    ? [...DEFAULT_ORDER]
    : joinGroup([...saved, ...DEFAULT_ORDER.filter((id) => !saved.includes(id))]);
  const hidden = [...new Set(object.hidden.filter(isSlot))];
  return { slots: { order, hidden }, warnings: [...unknown].map((id) => `unknown transport slot ${id} dropped`) };
}
