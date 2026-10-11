import { afterEach, describe, expect, it, vi } from "vitest";
import * as layouts from "@/shell/layouts";
import { handleGlobalKey, isResetShortcut, isSearchShortcut, nextRegion, widgetRegions } from "./keyboard";

function key(init: KeyboardEventInit & { target?: EventTarget }) {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  if (init.target) Object.defineProperty(event, "target", { value: init.target });
  return event;
}

/** Widget regions with fixed layout boxes (jsdom has no layout). */
function regions(boxes: [string, number, number, number?][]) {
  document.body.innerHTML = "";
  return boxes.map(([id, top, left, width = 100]) => {
    const element = document.createElement("section");
    element.dataset.widget = id;
    element.tabIndex = -1;
    element.getBoundingClientRect = () => ({ top, left, width, height: width ? 50 : 0 }) as DOMRect;
    document.body.append(element);
    return element;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("isResetShortcut (D17)", () => {
  it("matches Ctrl+Shift+L only", () => {
    expect(isResetShortcut(key({ ctrlKey: true, shiftKey: true, code: "KeyL", key: "L" }))).toBe(true);
    expect(isResetShortcut(key({ ctrlKey: true, code: "KeyL", key: "l" }))).toBe(false);
    expect(isResetShortcut(key({ ctrlKey: true, shiftKey: true, altKey: true, code: "KeyL", key: "L" }))).toBe(false);
  });

  it("follows the layout: the key that types L counts, not the physical position", () => {
    // Dvorak: the key at the QWERTY "P" position types "L".
    expect(isResetShortcut(key({ ctrlKey: true, shiftKey: true, code: "KeyP", key: "L" }))).toBe(true);
    expect(isResetShortcut(key({ ctrlKey: true, shiftKey: true, code: "KeyL", key: "N" }))).toBe(false);
  });
});

describe("isSearchShortcut (R25)", () => {
  it("matches Ctrl+F by the typed letter", () => {
    expect(isSearchShortcut(key({ ctrlKey: true, code: "KeyF", key: "f" }))).toBe(true);
    expect(isSearchShortcut(key({ ctrlKey: true, code: "KeyY", key: "f" }))).toBe(true);
    expect(isSearchShortcut(key({ ctrlKey: true, shiftKey: true, code: "KeyF", key: "F" }))).toBe(false);
    expect(isSearchShortcut(key({ code: "KeyF", key: "f" }))).toBe(false);
  });
});

describe("widgetRegions (P2.12)", () => {
  it("orders visible widgets top to bottom, then left to right, and skips hidden ones", () => {
    regions([
      ["transport", 500, 600],
      ["library", 30, 0],
      ["nowPlaying", 500, 0],
      ["queue", 500, 600, 0],
    ]);
    expect(widgetRegions().map((element) => element.dataset.widget)).toEqual(["library", "nowPlaying", "transport"]);
  });
});

describe("nextRegion", () => {
  it("starts at the first or last region and wraps at both ends", () => {
    const [a, b, c] = regions([
      ["a", 0, 0],
      ["b", 0, 200],
      ["c", 100, 0],
    ]);
    const list = [a, b, c];
    expect(nextRegion(list, document.body, false)).toBe(a);
    expect(nextRegion(list, document.body, true)).toBe(c);
    expect(nextRegion(list, c, false)).toBe(a);
    expect(nextRegion(list, a, true)).toBe(c);
    const inner = document.createElement("button");
    b.append(inner);
    expect(nextRegion(list, inner, false)).toBe(c);
    expect(nextRegion([], a, false)).toBeUndefined();
  });
});

describe("handleGlobalKey", () => {
  it("runs Reset layout on Ctrl+Shift+L", () => {
    const reset = vi.spyOn(layouts, "resetLayout").mockImplementation(() => {});
    expect(handleGlobalKey(key({ ctrlKey: true, shiftKey: true, code: "KeyL", key: "L" }))).toBe(true);
    expect(reset).toHaveBeenCalledOnce();
  });

  it("moves focus on F6 and back on Shift+F6", () => {
    const [a, b] = regions([
      ["a", 0, 0],
      ["b", 100, 0],
    ]);
    expect(handleGlobalKey(key({ key: "F6" }))).toBe(true);
    expect(document.activeElement).toBe(a);
    handleGlobalKey(key({ key: "F6" }));
    expect(document.activeElement).toBe(b);
    handleGlobalKey(key({ key: "F6", shiftKey: true }));
    expect(document.activeElement).toBe(a);
  });

  it("leaves F6 to open menus and dialogs, and ignores other keys", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.append(dialog);
    expect(handleGlobalKey(key({ key: "F6", target: dialog }))).toBe(false);
    expect(handleGlobalKey(key({ key: "a" }))).toBe(false);
  });
});
