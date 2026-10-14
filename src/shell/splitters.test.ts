import type { DockviewApi } from "dockview-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCollapseStore } from "@/store/collapse";
import { useUiStore } from "@/store/ui";
import {
  BIG_STEP,
  STEP,
  collapseGroup,
  decorateSashes,
  isCollapsed,
  resetSize,
  restoreGroup,
  sashAction,
  sashKey,
  separatorLabel,
  share,
  collapsedSizes,
  restoreCollapsed,
} from "./splitters";

/** A splitview with one sash between two views, as Dockview builds it. */
function splitview(before: string, after: string, { frames = false, width = 300 } = {}) {
  const view = (inner: string) => `<div class="dv-view" data-width="${width}">${inner}</div>`;
  const side = (names: string) =>
    frames
      ? names
          .split(",")
          .map((name) => `<div data-frame-label>${name}</div>`)
          .join("")
      : `<div class="dv-groupview">${names
          .split(",")
          .map((name) => `<div class="dv-tab">${name}</div>`)
          .join("")}<section data-widget="${names.split(",")[0].toLowerCase()}"></section></div>`;
  document.body.innerHTML = `
    <div ${frames ? 'data-frame-group="columns"' : ""}>
      <div class="dv-split-view-container dv-horizontal">
        <div class="dv-sash-container"><div class="dv-sash"></div></div>
        <div class="dv-view-container">${view(side(before))}${view(side(after))}</div>
      </div>
    </div>`;
  return document.querySelector<HTMLElement>(".dv-sash") as HTMLElement;
}

beforeEach(() => {
  useUiStore.setState({ locked: false });
  useCollapseStore.setState({ sizes: {} });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const width = Number(this.getAttribute("data-width") ?? 4);
    return { width, height: 400, top: 0, left: 0, right: width, bottom: 400, x: 0, y: 0 } as DOMRect;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

/** The pointer moves a sash receives, as clientX offsets from its pointer down. */
function recordMoves(sash: HTMLElement): number[] {
  const moves: number[] = [];
  let start = 0;
  sash.addEventListener("pointerdown", (event) => (start = event.clientX));
  document.addEventListener("pointermove", (event) => moves.push(event.clientX - start));
  return moves;
}

describe("separator keys (SP-3, UD7)", () => {
  it("maps the arrows to 16 px, Shift+Arrow to 64 px, Home, End and Enter", () => {
    expect(sashAction("ArrowRight", false)).toEqual({ move: STEP });
    expect(sashAction("ArrowLeft", false)).toEqual({ move: -STEP });
    expect(sashAction("ArrowDown", true)).toEqual({ move: BIG_STEP });
    expect(sashAction("ArrowUp", true)).toEqual({ move: -BIG_STEP });
    expect(sashAction("Home", false)).toEqual({ edge: "start" });
    expect(sashAction("End", false)).toEqual({ edge: "end" });
    expect(sashAction("Enter", false)).toEqual({ toggle: true });
    expect(sashAction("a", false)).toBeNull();
  });

  it("moves the sash through its pointer handlers; Home and End go far to the minimum and maximum", () => {
    const sash = splitview("Library", "Play queue");
    const moves = recordMoves(sash);
    expect(sashKey(sash, "ArrowRight", false)).toBe(true);
    expect(sashKey(sash, "ArrowLeft", true)).toBe(true);
    sashKey(sash, "Home", false);
    sashKey(sash, "End", false);
    expect(moves.slice(0, 2)).toEqual([16, -64]);
    expect(moves[2]).toBeLessThan(-10_000);
    expect(moves[3]).toBeGreaterThan(10_000);
  });

  it("a locked dock separator ignores keys; a frame separator still moves", () => {
    useUiStore.setState({ locked: true });
    const dock = splitview("Library", "Play queue");
    const moves = recordMoves(dock);
    expect(sashKey(dock, "ArrowRight", false)).toBe(true);
    expect(moves).toEqual([]);
    const frame = splitview("Artist", "Album", { frames: true });
    const frameMoves = recordMoves(frame);
    sashKey(frame, "ArrowRight", false);
    expect(frameMoves).toEqual([16]);
  });

  it("Enter collapses a frame to its minimum and Enter again moves it back", () => {
    const sash = splitview("Artist", "Album", { frames: true, width: 200 });
    const moves = recordMoves(sash);
    sashKey(sash, "Enter", false);
    expect(moves[0]).toBeLessThan(-10_000);
    sashKey(sash, "Enter", false);
    // jsdom does not lay out, so the view is still 200 px: the move back is 0 here.
    expect(moves[1]).toBe(0);
  });
});

describe("separator semantics (SP-3)", () => {
  it("names the widgets on both sides and the frames on both sides", () => {
    expect(separatorLabel(["Playlists"], ["Library"])).toBe("Resize Playlists and Library");
    expect(separatorLabel(["Library"], ["Play queue", "Lyrics"])).toBe("Resize Library and Play queue, Lyrics");
    decorateSashes();
    splitview("Playlists", "Library");
    decorateSashes();
    const sash = document.querySelector(".dv-sash");
    expect(sash?.getAttribute("role")).toBe("separator");
    expect(sash?.getAttribute("tabindex")).toBe("0");
    expect(sash?.getAttribute("aria-orientation")).toBe("vertical");
    expect(sash?.getAttribute("aria-valuenow")).toBe("50");
    expect(sash?.getAttribute("aria-label")).toBe("Resize Playlists and Library");
    splitview("Artist", "Album", { frames: true });
    decorateSashes();
    expect(document.querySelector(".dv-sash")?.getAttribute("aria-label")).toBe("Resize Artist and Album");
  });

  it("marks a locked dock separator aria-disabled", () => {
    useUiStore.setState({ locked: true });
    splitview("Playlists", "Library");
    decorateSashes();
    expect(document.querySelector(".dv-sash")?.getAttribute("aria-disabled")).toBe("true");
  });

  it("computes the share of the first neighbor", () => {
    expect(share(240, 720)).toBe(25);
    expect(share(0, 0)).toBe(0);
  });
});

describe("reset size on double-click (SP-2)", () => {
  it("gives a side its preset width, else an equal share", () => {
    expect(resetSize({ size: 400, preset: 240 }, { size: 600 })).toBe(240);
    expect(resetSize({ size: 700 }, { size: 300, preset: 280 })).toBe(720);
    expect(resetSize({ size: 700 }, { size: 300 })).toBe(500);
  });
});

describe("collapse and restore (SP-6, UD25)", () => {
  function dockWith(width: number) {
    const sizes: unknown[] = [];
    const element = document.createElement("div");
    const group = {
      id: "g1",
      width,
      height: 500,
      minimumWidth: 200,
      minimumHeight: 160,
      element,
      api: { location: { type: "grid" }, setSize: (size: unknown) => sizes.push(size) },
    };
    const api = {
      getPanel: () => ({ group }),
      getGroup: (id: string) => (id === "g1" ? group : undefined),
    } as unknown as DockviewApi;
    return { api, sizes, group };
  }

  it("a floated collapsed group is not collapsed: Restore is off and does nothing", () => {
    const { api, sizes, group } = dockWith(320);
    collapseGroup("queue", api);
    group.api.location = { type: "floating" };
    expect(isCollapsed("queue", api)).toBe(false);
    restoreGroup("queue", api);
    expect(sizes).toEqual([{ width: 200 }]);
  });

  it("keeps the collapse sizes of groups that exist over a save and a load (PS-5)", () => {
    const { api } = dockWith(320);
    collapseGroup("queue", api);
    const saved = collapsedSizes();
    expect(saved).toEqual({ g1: { axis: "width", size: 320 } });
    useCollapseStore.setState({ sizes: {} });
    expect(restoreCollapsed({ ...saved, gone: { axis: "width", size: 9 }, bad: { axis: "x", size: 1 } }, api)).toEqual([
      "invalid collapse entry bad ignored",
    ]);
    expect(isCollapsed("queue", api)).toBe(true);
    expect(useCollapseStore.getState().sizes).toEqual({ g1: { axis: "width", size: 320 } });
    expect(restoreCollapsed("no", api)).toEqual(["invalid collapsed; nothing restored"]);
    expect(restoreCollapsed(undefined, api)).toEqual([]);
    expect(useCollapseStore.getState().sizes).toEqual({});
  });

  it("collapses a group to its minimum, keeps its size and restores it", () => {
    const { api, sizes } = dockWith(320);
    collapseGroup("queue", api);
    expect(isCollapsed("queue", api)).toBe(true);
    expect(sizes).toEqual([{ width: 200 }]);
    collapseGroup("queue", api);
    expect(sizes).toHaveLength(1);
    restoreGroup("queue", api);
    expect(isCollapsed("queue", api)).toBe(false);
    expect(sizes.at(-1)).toEqual({ width: 320 });
  });
});
