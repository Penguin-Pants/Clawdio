// UD21, TB-12: pointer drag of the selected songs to a playlist or the Play queue.
import { afterEach, describe, expect, it, vi } from "vitest";
import { DRAG_THRESHOLD, parseDropTarget, startRowDrag, takeDragClick } from "./row-drag";

function target(value: string) {
  const element = document.createElement("div");
  element.dataset.dropTarget = value;
  const child = document.createElement("span");
  element.append(child);
  document.body.append(element);
  return { element, child };
}

/** Points `elementFromPoint` at `element` (jsdom has no layout). */
function pointAt(element: Element | null) {
  document.elementFromPoint = () => element;
}

function pointer(type: string, x: number, y: number) {
  return new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, button: 0, pointerId: 1 });
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("parseDropTarget", () => {
  it("reads the queue and a playlist id, and nothing else", () => {
    expect(parseDropTarget("queue")).toEqual({ kind: "queue" });
    expect(parseDropTarget("playlist:3")).toEqual({ kind: "playlist", id: 3 });
    expect(parseDropTarget("playlist:x")).toBeNull();
    expect(parseDropTarget(undefined)).toBeNull();
  });
});

describe("startRowDrag (UD21)", () => {
  it("starts after the threshold, shows the ghost, and drops on the target under the pointer", () => {
    const row = document.createElement("div");
    document.body.append(row);
    const { element, child } = target("playlist:2");
    const drop = vi.fn();
    startRowDrag(pointer("pointerdown", 10, 10), [5, 6], drop);
    row.dispatchEvent(pointer("pointermove", 10 + DRAG_THRESHOLD - 1, 10));
    expect(document.querySelector("[data-slot='drag-ghost']")).toBeNull();
    pointAt(child);
    row.dispatchEvent(pointer("pointermove", 200, 120));
    expect(document.querySelector("[data-slot='drag-ghost']")?.textContent).toBe("2 songs");
    expect(element.dataset.dropActive).toBe("");
    row.dispatchEvent(pointer("pointerup", 200, 120));
    expect(drop).toHaveBeenCalledWith({ kind: "playlist", id: 2 }, [5, 6]);
    expect(document.querySelector("[data-slot='drag-ghost']")).toBeNull();
    expect(element.dataset.dropActive).toBeUndefined();
    // The click after a drag is not a row click.
    expect(takeDragClick()).toBe(true);
    expect(takeDragClick()).toBe(false);
  });

  it("no text selection starts while a row drag can start", () => {
    const row = document.createElement("div");
    document.body.append(row);
    startRowDrag(pointer("pointerdown", 0, 0), [1], vi.fn());
    const select = new Event("selectstart", { bubbles: true, cancelable: true });
    document.body.dispatchEvent(select);
    expect(select.defaultPrevented).toBe(true);
    row.dispatchEvent(pointer("pointerup", 0, 0));
    const later = new Event("selectstart", { bubbles: true, cancelable: true });
    document.body.dispatchEvent(later);
    expect(later.defaultPrevented).toBe(false);
  });

  it("a small move is a click, not a drag", () => {
    const row = document.createElement("div");
    document.body.append(row);
    const drop = vi.fn();
    startRowDrag(pointer("pointerdown", 10, 10), [5], drop);
    row.dispatchEvent(pointer("pointermove", 12, 11));
    row.dispatchEvent(pointer("pointerup", 12, 11));
    expect(drop).not.toHaveBeenCalled();
    expect(takeDragClick()).toBe(false);
  });

  it("Escape cancels; a drop outside a target adds nothing", () => {
    const row = document.createElement("div");
    document.body.append(row);
    const { child } = target("queue");
    const drop = vi.fn();
    startRowDrag(pointer("pointerdown", 0, 0), [1], drop);
    pointAt(child);
    row.dispatchEvent(pointer("pointermove", 50, 50));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector("[data-slot='drag-ghost']")).toBeNull();
    row.dispatchEvent(pointer("pointerup", 50, 50));
    expect(drop).not.toHaveBeenCalled();

    startRowDrag(pointer("pointerdown", 0, 0), [1], drop);
    pointAt(document.body);
    row.dispatchEvent(pointer("pointermove", 50, 50));
    row.dispatchEvent(pointer("pointerup", 50, 50));
    expect(drop).not.toHaveBeenCalled();
    expect(document.querySelector("[data-slot='drag-ghost']")?.textContent).toBe(undefined);
  });
});
