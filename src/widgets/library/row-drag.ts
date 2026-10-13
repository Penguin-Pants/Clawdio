/**
 * Row drag (TB-12, UD21): the selected songs go to a playlist row or to the Play queue by pointer
 * drag. Pointer events on the document, never HTML5 drag events (UD10, TA-1). A drop target is any
 * element with `data-drop-target="queue"` or `"playlist:<id>"`; the one under the pointer gets
 * `data-drop-active`. The keyboard path is the row menu (Add to queue, Add to playlist).
 */

/** A drag starts after the pointer moves this many px, so a plain click still selects. */
export const DRAG_THRESHOLD = 4;
/** The ghost sits this far right of and below the pointer. */
const GHOST_OFFSET = 12;

export type DropTarget = { kind: "queue" } | { kind: "playlist"; id: number };

/** Reads a `data-drop-target` value. */
export function parseDropTarget(value: string | undefined | null): DropTarget | null {
  if (value === "queue") return { kind: "queue" };
  const match = /^playlist:(\d+)$/.exec(value ?? "");
  return match ? { kind: "playlist", id: Number(match[1]) } : null;
}

/** The drop target element under a point, or null. */
function targetAt(x: number, y: number): HTMLElement | null {
  return document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop-target]") ?? null;
}

/** True once after a drag ended: the click that follows the pointer up is not a row click. */
let dragClick = false;

/**
 * Takes the "a drag just ended" mark; the row click handler calls it first. The next pointer down
 * clears it, so a drag that ends off the row leaves no stale mark.
 */
export function takeDragClick(): boolean {
  const taken = dragClick;
  dragClick = false;
  return taken;
}

/**
 * Follows a pointer from `down` on a row. Past the threshold it shows a ghost ("N songs") and
 * marks the target under the pointer; a pointer up on a target calls `drop`. Escape or a
 * pointer cancel ends the drag with no drop. `onStart` runs once when the drag starts (a drag from
 * an unselected row selects it then, so a Shift or Ctrl click still works).
 */
export function startRowDrag(
  down: PointerEvent,
  ids: number[],
  drop: (target: DropTarget, ids: number[]) => void,
  onStart?: () => void,
): void {
  dragClick = false;
  if (down.button !== 0 || ids.length === 0) return;
  let ghost: HTMLElement | null = null;
  let active: HTMLElement | null = null;

  const mark = (element: HTMLElement | null) => {
    if (element === active) return;
    if (active) delete active.dataset.dropActive;
    active = element;
    if (active) active.dataset.dropActive = "";
  };
  const end = () => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    document.removeEventListener("pointercancel", end);
    document.removeEventListener("keydown", key, true);
    document.removeEventListener("selectstart", noSelect, true);
    ghost?.remove();
    mark(null);
  };
  const move = (event: PointerEvent) => {
    if (!ghost) {
      if (Math.hypot(event.clientX - down.clientX, event.clientY - down.clientY) < DRAG_THRESHOLD) return;
      ghost = document.createElement("div");
      ghost.dataset.slot = "drag-ghost";
      ghost.setAttribute("aria-hidden", "true");
      ghost.textContent = ids.length === 1 ? "1 song" : `${ids.length} songs`;
      ghost.className =
        "pointer-events-none fixed z-(--z-popup) rounded-md bg-popover px-2 py-1 text-sm text-popover-foreground shadow-md ring-1 ring-border-strong";
      document.body.append(ghost);
      onStart?.();
    }
    ghost.style.left = `${event.clientX + GHOST_OFFSET}px`;
    ghost.style.top = `${event.clientY + GHOST_OFFSET}px`;
    mark(targetAt(event.clientX, event.clientY));
  };
  const up = (event: PointerEvent) => {
    const dragged = ghost !== null;
    const target = dragged ? parseDropTarget(targetAt(event.clientX, event.clientY)?.dataset.dropTarget) : null;
    end();
    if (!dragged) return;
    dragClick = true;
    if (target) drop(target, ids);
  };
  // A pointer that moves over text would start a text selection, and WebKit then ends the pointer
  // gesture with no pointer up on the target. No selection starts while a row drag can start.
  const noSelect = (event: Event) => event.preventDefault();
  const key = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    end();
  };
  // The document follows the pointer: no pointer capture, so a click inside the row (the heart)
  // still reaches its own target.
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
  document.addEventListener("pointercancel", end);
  document.addEventListener("keydown", key, true);
  document.addEventListener("selectstart", noSelect, true);
}
