import type { DockviewApi } from "dockview-react";
import { type CollapseSizes, useCollapseStore } from "@/store/collapse";
import { DEFAULT_FRAMES, type FrameGroup, frameFractions, useLibraryStore } from "@/store/library";
import { useUiStore } from "@/store/ui";
import { getDock } from "./layouts";
import { RIGHT_WIDTH, SIDEBAR_WIDTH } from "./presets";

/** Arrow keys move a separator 16 px, Shift+Arrow 64 px (UD7). */
export const STEP = 16;
export const BIG_STEP = 64;
/** Home and End move a separator this far; the splitview stops it at the minimum or maximum. */
const FAR = 100_000;

/** What a key does on a separator, or null for other keys (W3C window splitter pattern). */
export type SashAction = { move: number } | { edge: "start" | "end" } | { toggle: true } | null;

export function sashAction(key: string, shift: boolean): SashAction {
  const step = shift ? BIG_STEP : STEP;
  switch (key) {
    case "ArrowLeft":
    case "ArrowUp":
      return { move: -step };
    case "ArrowRight":
    case "ArrowDown":
      return { move: step };
    case "Home":
      return { edge: "start" };
    case "End":
      return { edge: "end" };
    case "Enter":
      return { toggle: true };
    default:
      return null;
  }
}

/** The accessible name of a separator from the names on both sides (UD7). */
export function separatorLabel(before: string[], after: string[]): string {
  const side = (names: string[]) => (names.length > 0 ? names.join(", ") : "pane");
  return `Resize ${side(before)} and ${side(after)}`;
}

/** The share of the first neighbor in percent (`aria-valuenow`). */
export function share(before: number, after: number): number {
  const total = before + after;
  return total > 0 ? Math.round((before / total) * 100) : 0;
}

/**
 * The size the first neighbor gets back on a double-click (SP-2): a side with a preset width
 * gets that width; with none, both sides take an equal share.
 */
export function resetSize(before: { size: number; preset?: number }, after: { size: number; preset?: number }): number {
  const total = before.size + after.size;
  if (before.preset !== undefined) return before.preset;
  if (after.preset !== undefined) return total - after.preset;
  return total / 2;
}

/** The preset width of a view that holds exactly one dock group with a preset width (UD6). */
function presetWidth(view: Element): number | undefined {
  const groups = view.querySelectorAll(".dv-groupview");
  if (groups.length !== 1) return undefined;
  const titles = [...groups[0].querySelectorAll(".dv-tab")].map((tab) => tab.textContent?.trim() ?? "");
  if (titles.includes("Playlists")) return SIDEBAR_WIDTH;
  if (titles.includes("Play queue") || titles.includes("Lyrics")) return RIGHT_WIDTH;
  return undefined;
}

interface SashPlace {
  sash: HTMLElement;
  horizontal: boolean;
  before: HTMLElement;
  after: HTMLElement;
  /** The Library frame group of a frame sash, else null (a dock sash). */
  frames: FrameGroup | null;
}

/** The splitview around a sash: its direction and the views on both sides. */
function placeOf(sash: HTMLElement): SashPlace | null {
  const container = sash.parentElement?.parentElement;
  if (!container?.classList.contains("dv-split-view-container")) return null;
  const sashes = [...(sash.parentElement?.children ?? [])];
  const views = [...(container.querySelector(":scope > .dv-view-container")?.children ?? [])] as HTMLElement[];
  const index = sashes.indexOf(sash);
  const before = views[index];
  const after = views[index + 1];
  if (!before || !after) return null;
  const frames = (sash.closest("[data-frame-group]")?.getAttribute("data-frame-group") ?? null) as FrameGroup | null;
  return { sash, horizontal: container.classList.contains("dv-horizontal"), before, after, frames };
}

function sizeOf(element: Element, horizontal: boolean): number {
  const box = element.getBoundingClientRect();
  return horizontal ? box.width : box.height;
}

/** The names on one side: frame labels for Library frames, else the dock tab titles. */
function namesIn(view: Element, frames: boolean): string[] {
  const selector = frames ? "[data-frame-label]" : ".dv-tab";
  const names = [...view.querySelectorAll(selector)].map((element) => element.textContent?.trim() ?? "");
  return [...new Set(names.filter(Boolean))];
}

/**
 * Moves a sash by `delta` px through its own pointer handlers, so the splitview applies its
 * constraints, nesting and the frame save path (UD7).
 */
export function moveSash(sash: HTMLElement, horizontal: boolean, delta: number): void {
  const doc = sash.ownerDocument;
  const point = (offset: number) => ({
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    isPrimary: true,
    button: 0,
    buttons: 1,
    clientX: horizontal ? offset : 0,
    clientY: horizontal ? 0 : offset,
  });
  sash.dispatchEvent(new PointerEvent("pointerdown", point(0)));
  doc.dispatchEvent(new PointerEvent("pointermove", point(delta)));
  doc.dispatchEvent(new PointerEvent("pointerup", { ...point(delta), buttons: 0 }));
}

/** The axis a group resizes on: width beside a neighbor in a row, else height. */
function groupAxis(element: HTMLElement): "width" | "height" {
  const container = element.closest(".dv-view")?.parentElement?.parentElement;
  return container?.classList.contains("dv-vertical") ? "height" : "width";
}

/** Collapses the group of a widget to its minimum and keeps its size for Restore (UD25). */
export function collapseGroup(widget: string, api: DockviewApi | null = getDock()): void {
  const group = api?.getPanel(widget)?.group;
  if (!group || group.api.location.type !== "grid" || useCollapseStore.getState().sizes[group.id]) return;
  const axis = groupAxis(group.element);
  const size = axis === "width" ? group.width : group.height;
  useCollapseStore.setState((state) => ({ sizes: { ...state.sizes, [group.id]: { axis, size } } }));
  group.api.setSize(axis === "width" ? { width: group.minimumWidth } : { height: group.minimumHeight });
}

/** Puts a collapsed group back to its size before the collapse (UD25). */
export function restoreGroup(widget: string, api: DockviewApi | null = getDock()): void {
  const group = api?.getPanel(widget)?.group;
  const saved = group ? useCollapseStore.getState().sizes[group.id] : undefined;
  if (!group || !saved || group.api.location.type !== "grid") return;
  useCollapseStore.setState((state) => {
    const sizes = { ...state.sizes };
    delete sizes[group.id];
    return { sizes };
  });
  group.api.setSize(saved.axis === "width" ? { width: saved.size } : { height: saved.size });
}

/** The collapse sizes to save in `layout.json` (PS-5): group id to axis and size. */
export function collapsedSizes(): CollapseSizes {
  return useCollapseStore.getState().sizes;
}

function isCollapseEntry(value: unknown): value is { axis: "width" | "height"; size: number } {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    (entry.axis === "width" || entry.axis === "height") &&
    typeof entry.size === "number" &&
    Number.isFinite(entry.size) &&
    entry.size > 0
  );
}

/**
 * Loads the saved collapse sizes after the dock loads (PS-5), so Restore works after a restart.
 * Entries of groups that no longer exist are dropped; a bad entry is ignored with a warning.
 * Returns the warnings.
 */
export function restoreCollapsed(value: unknown, api: DockviewApi | null = getDock()): string[] {
  const sizes: CollapseSizes = {};
  const warnings: string[] = [];
  if (value !== undefined && (typeof value !== "object" || value === null || Array.isArray(value))) {
    warnings.push("invalid collapsed; nothing restored");
  } else if (value !== undefined) {
    for (const [id, entry] of Object.entries(value)) {
      if (!isCollapseEntry(entry)) warnings.push(`invalid collapse entry ${id} ignored`);
      else if (api?.getGroup(id)?.api.location.type === "grid") sizes[id] = { axis: entry.axis, size: entry.size };
    }
  }
  useCollapseStore.setState({ sizes });
  return warnings;
}

/** True while the group of a widget is collapsed. */
export function isCollapsed(widget: string, api: DockviewApi | null = getDock()): boolean {
  const group = api?.getPanel(widget)?.group;
  // A floating group is not collapsed: its dock size does not apply (UD17).
  return (
    group !== undefined &&
    group.api.location.type === "grid" &&
    useCollapseStore.getState().sizes[group.id] !== undefined
  );
}

/** The one dock widget in a view, when the view is exactly one group, else null. */
function singleGroupWidget(view: Element): string | null {
  const groups = view.querySelectorAll(".dv-groupview");
  if (groups.length !== 1) return null;
  return groups[0].querySelector("[data-widget]")?.getAttribute("data-widget") ?? null;
}

/** Sash sizes before Enter collapsed them, for frames and multi-group views. */
const sashMemory = new WeakMap<HTMLElement, number>();

/** Runs a key on a separator. Returns true when it handled the key. */
export function sashKey(sash: HTMLElement, key: string, shift: boolean): boolean {
  const place = placeOf(sash);
  const action = sashAction(key, shift);
  if (!place || !action) return false;
  if (place.frames === null && useUiStore.getState().locked) return true;
  const { horizontal, before } = place;
  if ("move" in action) moveSash(sash, horizontal, action.move);
  else if ("edge" in action) moveSash(sash, horizontal, action.edge === "start" ? -FAR : FAR);
  else {
    const widget = place.frames === null ? singleGroupWidget(before) : null;
    if (widget !== null) {
      if (isCollapsed(widget)) restoreGroup(widget);
      else collapseGroup(widget);
    } else {
      const saved = sashMemory.get(sash);
      if (saved === undefined) {
        sashMemory.set(sash, sizeOf(before, horizontal));
        moveSash(sash, horizontal, -FAR);
      } else {
        sashMemory.delete(sash);
        moveSash(sash, horizontal, saved - sizeOf(before, horizontal));
      }
    }
  }
  scheduleSashRefresh();
  return true;
}

/** Double-click (SP-2): a dock sash goes back to the preset size, a frame sash to the default fractions. */
export function resetSash(sash: HTMLElement): boolean {
  const place = placeOf(sash);
  if (!place) return false;
  if (place.frames !== null) {
    useLibraryStore.getState().setFrames(place.frames, frameFractions(DEFAULT_FRAMES, place.frames));
    return true;
  }
  if (useUiStore.getState().locked) return true;
  const { horizontal, before, after } = place;
  const current = sizeOf(before, horizontal);
  const target = resetSize(
    { size: current, preset: horizontal ? presetWidth(before) : undefined },
    { size: sizeOf(after, horizontal), preset: horizontal ? presetWidth(after) : undefined },
  );
  moveSash(sash, horizontal, target - current);
  scheduleSashRefresh();
  return true;
}

/**
 * Gives every visible splitter the W3C separator semantics (UD7): role, Tab stop, orientation,
 * value and name. A locked dock separator is `aria-disabled`; frame separators stay enabled.
 */
export function decorateSashes(root: ParentNode = document): void {
  const locked = useUiStore.getState().locked;
  for (const sash of root.querySelectorAll<HTMLElement>(".dv-split-view-container > .dv-sash-container > .dv-sash")) {
    const place = placeOf(sash);
    const box = sash.getBoundingClientRect();
    if (!place || box.width === 0 || box.height === 0) {
      sash.removeAttribute("role");
      sash.tabIndex = -1;
      continue;
    }
    const frames = place.frames !== null;
    sash.setAttribute("role", "separator");
    sash.tabIndex = 0;
    sash.setAttribute("aria-orientation", place.horizontal ? "vertical" : "horizontal");
    sash.setAttribute("aria-valuemin", "0");
    sash.setAttribute("aria-valuemax", "100");
    const now = String(share(sizeOf(place.before, place.horizontal), sizeOf(place.after, place.horizontal)));
    if (sash.getAttribute("aria-valuenow") !== now) sash.setAttribute("aria-valuenow", now);
    sash.setAttribute("aria-label", separatorLabel(namesIn(place.before, frames), namesIn(place.after, frames)));
    if (!frames && locked) sash.setAttribute("aria-disabled", "true");
    else sash.removeAttribute("aria-disabled");
  }
}

let refreshFrame = 0;

/** Decorates the separators on the next frame; repeated calls in one frame run once (UD24). */
export function scheduleSashRefresh(): void {
  if (refreshFrame !== 0) return;
  refreshFrame = requestAnimationFrame(() => {
    refreshFrame = 0;
    decorateSashes();
  });
}

/** Installs the separator keys and double-click on the document (one delegated handler). */
export function installSplitters(doc: Document = document): () => void {
  const isSash = (target: EventTarget | null): target is HTMLElement =>
    target instanceof HTMLElement && target.matches(".dv-sash[role='separator']");
  const onKey = (event: KeyboardEvent) => {
    if (!isSash(event.target) || event.ctrlKey || event.altKey || event.metaKey) return;
    if (sashKey(event.target, event.key, event.shiftKey)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  const onDoubleClick = (event: MouseEvent) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.matches(".dv-sash") && resetSash(target)) event.preventDefault();
  };
  const stopLock = useUiStore.subscribe((state, previous) => {
    if (state.locked !== previous.locked) scheduleSashRefresh();
  });
  doc.addEventListener("keydown", onKey, true);
  doc.addEventListener("dblclick", onDoubleClick);
  scheduleSashRefresh();
  return () => {
    doc.removeEventListener("keydown", onKey, true);
    doc.removeEventListener("dblclick", onDoubleClick);
    stopLock();
  };
}
