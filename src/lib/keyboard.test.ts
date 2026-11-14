import { afterEach, describe, expect, it, vi } from "vitest";
import * as layouts from "@/shell/layouts";
import { useUiStore } from "@/store/ui";
import {
  handleGlobalKey,
  handleSpace,
  isArrangeShortcut,
  isResetShortcut,
  isSearchShortcut,
  nextRegion,
  widgetRegions,
} from "./keyboard";

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

describe("isArrangeShortcut (owner answer Q13)", () => {
  it("matches Ctrl+Shift+A by the typed letter", () => {
    expect(isArrangeShortcut(key({ ctrlKey: true, shiftKey: true, code: "KeyA", key: "A" }))).toBe(true);
    expect(isArrangeShortcut(key({ ctrlKey: true, code: "KeyA", key: "a" }))).toBe(false);
    expect(isArrangeShortcut(key({ ctrlKey: true, shiftKey: true, altKey: true, code: "KeyA", key: "A" }))).toBe(false);
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

  it("skips widgets inside an inert container: the mini player has one region, the band (UD19)", () => {
    const [transport, library] = regions([
      ["transport", 0, 0],
      ["library", 50, 0],
    ]);
    const dock = document.createElement("main");
    dock.setAttribute("inert", "");
    dock.append(library);
    document.body.append(dock);
    expect(widgetRegions()).toEqual([transport]);
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
  it("counts a focused widget header as its widget's region (R38.10)", () => {
    const items = ["a", "b", "c"].map((id) => {
      const item = document.createElement("div");
      item.dataset.gridItem = id;
      const header = document.createElement("div");
      header.tabIndex = 0;
      const region = document.createElement("section");
      region.dataset.widget = id;
      item.append(header, region);
      document.body.append(item);
      return { header, region };
    });
    const list = items.map((item) => item.region);
    expect(nextRegion(list, items[1].header, false)).toBe(items[2].region);
    expect(nextRegion(list, items[1].header, true)).toBe(items[0].region);
    items.forEach(({ region }) => region.parentElement?.remove());
  });
});

describe("handleGlobalKey", () => {
  it("runs Reset layout on Ctrl+Shift+L", () => {
    const reset = vi.spyOn(layouts, "resetLayout").mockImplementation(() => {});
    expect(handleGlobalKey(key({ ctrlKey: true, shiftKey: true, code: "KeyL", key: "L" }))).toBe(true);
    expect(reset).toHaveBeenCalledOnce();
  });

  it("toggles Arrange mode on Ctrl+Shift+A, and Esc leaves it", () => {
    useUiStore.setState({ arranging: false });
    expect(handleGlobalKey(key({ ctrlKey: true, shiftKey: true, code: "KeyA", key: "A" }))).toBe(true);
    expect(useUiStore.getState().arranging).toBe(true);
    expect(handleGlobalKey(key({ key: "Escape" }))).toBe(true);
    expect(useUiStore.getState().arranging).toBe(false);
    // Outside Arrange mode Esc belongs to the focused control.
    expect(handleGlobalKey(key({ key: "Escape" }))).toBe(false);
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

describe("handleSpace (D17, P7.11)", () => {
  function space(target: Element, type = "keydown", repeat = false) {
    document.body.append(target);
    const event = new KeyboardEvent(type, { key: " ", bubbles: true, cancelable: true, repeat });
    Object.defineProperty(event, "target", { value: target });
    return event;
  }

  it("toggles playback on a focused button and keeps the button from being pressed", () => {
    const toggle = vi.fn();
    const down = space(document.createElement("button"));
    expect(handleSpace(down, toggle)).toBe(true);
    expect(down.defaultPrevented).toBe(true);
    const up = space(document.createElement("button"), "keyup");
    expect(handleSpace(up, toggle)).toBe(true);
    expect(up.defaultPrevented).toBe(true);
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("toggles once while the key repeats", () => {
    const toggle = vi.fn();
    handleSpace(space(document.createElement("div")), toggle);
    handleSpace(space(document.createElement("div"), "keydown", true), toggle);
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("leaves Space to text fields", () => {
    const toggle = vi.fn();
    const search = document.createElement("input");
    search.type = "search";
    const event = space(search);
    expect(handleSpace(event, toggle)).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    expect(handleSpace(space(document.createElement("textarea")), toggle)).toBe(false);
    expect(toggle).not.toHaveBeenCalled();
  });

  it("leaves Space to a focused column header, which sorts (AX-1)", () => {
    const toggle = vi.fn();
    const header = document.createElement("div");
    header.setAttribute("role", "columnheader");
    const event = space(header);
    expect(handleSpace(event, toggle)).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    expect(toggle).not.toHaveBeenCalled();
  });

  it("toggles on a slider thumb, which is a range input", () => {
    const toggle = vi.fn();
    const range = document.createElement("input");
    range.type = "range";
    expect(handleSpace(space(range), toggle)).toBe(true);
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("leaves Space to open menus and dialogs", () => {
    const toggle = vi.fn();
    for (const role of ["menu", "dialog"]) {
      const popup = document.createElement("div");
      popup.setAttribute("role", role);
      const button = document.createElement("button");
      popup.append(button);
      document.body.append(popup);
      const event = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
      Object.defineProperty(event, "target", { value: button });
      expect(handleSpace(event, toggle)).toBe(false);
    }
    expect(toggle).not.toHaveBeenCalled();
  });
});
