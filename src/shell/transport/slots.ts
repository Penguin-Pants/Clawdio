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

/** The user's slot order and hidden set (UD20), saved as `transportSlots` in `layout.json`. */
export interface TransportSlots {
  order: SlotId[];
  hidden: SlotId[];
}

export const DEFAULT_SLOTS: TransportSlots = { order: [...DEFAULT_ORDER], hidden: [...DEFAULT_HIDDEN] };

/** Previous, play or pause and next stay first and in this order (UD20). */
const FIXED: readonly SlotId[] = ["previous", "playPause", "next"];

/** Previous, play or pause and next do not move; the other slots do (UD20). */
export function canMove(id: SlotId): boolean {
  return !FIXED.includes(id);
}

/** Every slot can hide but play or pause (TR-3). */
export function canHide(id: SlotId): boolean {
  return id !== "playPause";
}

/** Moves a slot to `index` in the order; the fixed group stays first. */
export function moveSlotTo(slots: TransportSlots, id: SlotId, index: number): TransportSlots {
  if (FIXED.includes(id)) return slots;
  const rest = slots.order.filter((other) => other !== id);
  const target = Math.min(rest.length, Math.max(FIXED.length, index));
  if (slots.order.indexOf(id) === target) return slots;
  return { ...slots, order: [...rest.slice(0, target), id, ...rest.slice(target)] };
}

/** Moves a slot one place up (-1) or down (+1): Move up and Move down (AX-1). */
export function moveSlot(slots: TransportSlots, id: SlotId, step: -1 | 1): TransportSlots {
  const target = slots.order.indexOf(id) + step;
  if (FIXED.includes(id) || target < FIXED.length || target >= slots.order.length) return slots;
  return moveSlotTo(slots, id, target);
}

export function setSlotHidden(slots: TransportSlots, id: SlotId, hidden: boolean): TransportSlots {
  if (!canHide(id) || slots.hidden.includes(id) === hidden) return slots;
  return { ...slots, hidden: hidden ? [...slots.hidden, id] : slots.hidden.filter((other) => other !== id) };
}

const isSlot = (value: unknown): value is SlotId => (SLOT_IDS as readonly unknown[]).includes(value);

/**
 * Reads `transportSlots` (UD20). No value gives the defaults. An unknown slot id is dropped with
 * one warning; a missing slot goes at the end. A hidden play or pause, or a value that is not
 * an object with arrays, gives the defaults with a warning.
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
  const saved = [...new Set(object.order.filter(isSlot))].filter((id) => !FIXED.includes(id));
  const order = [...FIXED, ...saved, ...DEFAULT_ORDER.filter((id) => !FIXED.includes(id) && !saved.includes(id))];
  const hidden = [...new Set(object.hidden.filter(isSlot))];
  return { slots: { order, hidden }, warnings: [...unknown].map((id) => `unknown transport slot ${id} dropped`) };
}
