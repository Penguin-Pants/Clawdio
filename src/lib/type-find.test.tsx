import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleSpace } from "./keyboard";
import {
  FIND_RESET_MS,
  findTextActive,
  firstMatch,
  menuDialogOrDrag,
  shownIndex,
  type TypeFind,
  useTypeFind,
} from "./type-find";

const NAMES = ["Chemical Brothers", "Émilie", "Zapp", "ZZ Top"];

function List(props: TypeFind & { header?: boolean }) {
  const onType = useTypeFind(props);
  return (
    <div role="listbox" aria-label="Artists" tabIndex={0} onKeyDown={(event) => onType(event)}>
      {props.header && <button type="button">Name</button>}
    </div>
  );
}

/** Runs `step`, then lets the pending replies land inside `act`. */
function flush(step?: () => void) {
  return act(() => {
    step?.();
    return Promise.resolve();
  });
}

function setup(find: TypeFind["find"] = (text) => firstMatch(NAMES, text), list: unknown = NAMES) {
  const onMatch = vi.fn<(index: number) => void>();
  const finds = vi.fn(find);
  const view = render(<List list={list} find={finds} onMatch={onMatch} header />);
  const element = view.getByRole("listbox");
  const type = async (keys: string, init: KeyboardEventInit = {}) => {
    for (const key of keys) fireEvent.keyDown(element, { key, ...init });
    await flush();
  };
  return { view, element, onMatch, finds, type };
}

/** Waits out the reset time (R36.3). */
function pause() {
  vi.advanceTimersByTime(FIND_RESET_MS + 1);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  pause();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("useTypeFind (R36, P25-AC2)", () => {
  it("adds characters within 1 s to the typed text and resets after 1 s", async () => {
    const { finds, onMatch, type } = setup();
    await type("z");
    vi.advanceTimersByTime(FIND_RESET_MS - 1);
    await type("z");
    expect(finds.mock.calls.map(([text]) => text)).toEqual(["z", "zz"]);
    expect(onMatch.mock.calls.map(([index]) => index)).toEqual([2, 3]);
    pause();
    await type("c");
    expect(finds).toHaveBeenLastCalledWith("c");
    expect(onMatch).toHaveBeenLastCalledWith(0);
  });

  it("a repeated letter adds to the text; no match changes nothing", async () => {
    const { finds, onMatch, type } = setup();
    await type("zzx");
    expect(finds.mock.calls.map(([text]) => text)).toEqual(["z", "zz", "zzx"]);
    expect(onMatch.mock.calls.map(([index]) => index)).toEqual([2, 3]);
  });

  it("Ctrl, Alt or Meta with a letter does not start a find; Shift does", async () => {
    const { finds, type } = setup();
    await type("z", { ctrlKey: true });
    await type("z", { altKey: true });
    await type("z", { metaKey: true });
    expect(finds).not.toHaveBeenCalled();
    await type("Z", { shiftKey: true });
    expect(finds).toHaveBeenCalledWith("Z");
  });

  it("named keys and keys on a child (a column header) are not typed text", async () => {
    const { finds, type, view } = setup();
    await type("x");
    pause();
    fireEvent.keyDown(view.getByRole("listbox"), { key: "ArrowDown" });
    fireEvent.keyDown(view.getByRole("button"), { key: "z" });
    expect(finds).toHaveBeenCalledTimes(1);
  });

  it("keeps the zz match when the z reply lands after the zz reply", async () => {
    const replies = new Map<string, (index: number | null) => void>();
    const { onMatch, type } = setup((text) => new Promise((resolve) => replies.set(text, resolve)));
    await type("zz");
    await flush(() => replies.get("zz")?.(3));
    await flush(() => replies.get("z")?.(2));
    expect(onMatch.mock.calls).toEqual([[3]]);
  });

  it("drops a reply after a search or sort change", async () => {
    let reply: ((index: number | null) => void) | undefined;
    const onMatch = vi.fn();
    const find = () => new Promise<number | null>((resolve) => (reply = resolve));
    const view = render(<List list={NAMES} find={find} onMatch={onMatch} />);
    fireEvent.keyDown(view.getByRole("listbox"), { key: "z" });
    // A new search gives a new id list.
    view.rerender(<List list={[...NAMES]} find={find} onMatch={onMatch} />);
    await flush(() => reply?.(2));
    expect(onMatch).not.toHaveBeenCalled();
  });

  it("does not find while a menu, a dialog or a row drag is open", async () => {
    const { finds, onMatch, type } = setup();
    const ghost = document.createElement("div");
    ghost.dataset.slot = "drag-ghost";
    document.body.append(ghost);
    expect(menuDialogOrDrag()).toBe(true);
    await type("z");
    expect(finds).not.toHaveBeenCalled();
    ghost.remove();
    // A reply that lands while a menu is open does not move the selection.
    const replies: ((index: number | null) => void)[] = [];
    finds.mockImplementation(() => new Promise((resolve) => replies.push(resolve)));
    await type("z");
    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    document.body.append(menu);
    await flush(() => replies[0](2));
    expect(onMatch).not.toHaveBeenCalled();
  });
});

describe("type-to-find and Space (R36.6, D17, P25-AC3)", () => {
  function withSpace() {
    const toggle = vi.fn();
    const space = (event: KeyboardEvent) => void handleSpace(event, toggle);
    window.addEventListener("keydown", space, true);
    return { toggle, remove: () => window.removeEventListener("keydown", space, true) };
  }

  it("Space adds a space to an active text and does not toggle playback", async () => {
    const { toggle, remove } = withSpace();
    const { element, finds, onMatch, type } = setup();
    await type("zz");
    expect(findTextActive(element)).toBe(true);
    await type(" top");
    expect(toggle).not.toHaveBeenCalled();
    expect(finds).toHaveBeenLastCalledWith("zz top");
    expect(onMatch).toHaveBeenLastCalledWith(3);
    remove();
  });

  it("Space with no typed text toggles playback and starts no find", async () => {
    const { toggle, remove } = withSpace();
    const { element, finds, type } = setup();
    await type(" ");
    expect(toggle).toHaveBeenCalledTimes(1);
    await type("z");
    pause();
    expect(findTextActive(element)).toBe(false);
    await type(" ");
    expect(toggle).toHaveBeenCalledTimes(2);
    expect(finds).toHaveBeenCalledTimes(1);
    remove();
  });

  it("a list without the global handler ignores Space with no text", async () => {
    const { finds, type } = setup();
    await type(" ");
    expect(finds).not.toHaveBeenCalled();
  });

  it("an active text in one list does not hold Space in another element", async () => {
    const { element, type } = setup();
    await type("z");
    expect(findTextActive(element)).toBe(true);
    expect(findTextActive(document.body)).toBe(false);
    expect(findTextActive(null)).toBe(false);
  });
});

describe("firstMatch (R36.4)", () => {
  it("matches a prefix without case and accents; the first from the top wins", () => {
    expect(firstMatch(NAMES, "Z")).toBe(2);
    expect(firstMatch(NAMES, "zz T")).toBe(3);
    expect(firstMatch(NAMES, "emi")).toBe(1);
    expect(firstMatch(NAMES, "brothers")).toBeNull();
    expect(firstMatch(NAMES, "")).toBeNull();
    expect(firstMatch([], "a")).toBeNull();
  });
});

describe("shownIndex (D65)", () => {
  it("adds the offset when the shown row has the hit's id, else gives null", () => {
    const ids = [7, 9, 4];
    expect(shownIndex({ index: 1, id: 9 }, (index) => ids[index], 1)).toBe(2);
    expect(shownIndex({ index: 1, id: 9 }, (index) => ids[index])).toBe(1);
    expect(shownIndex({ index: 1, id: 4 }, (index) => ids[index])).toBeNull();
    expect(shownIndex({ index: 5, id: 4 }, (index) => ids[index])).toBeNull();
    expect(shownIndex(null, (index) => ids[index])).toBeNull();
  });
});
