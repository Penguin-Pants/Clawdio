// PF-2 per path (UD24): each size observer that does layout work runs it once per frame of resizes.
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DockShell } from "@/shell/DockShell";
import { EMPTY_SELECTION, useLibraryStore } from "@/store/library";
import { flushFrames, installControlledLayout, resize } from "@/test/resize";
import { LibraryWidget } from "@/widgets/library/LibraryWidget";
import { PlaylistsWidget } from "@/widgets/playlists/PlaylistsWidget";

const runs = vi.hoisted(() => new Map<Element, number>());

vi.mock("@/lib/resize", async (importOriginal) => {
  const real = await importOriginal<typeof import("./resize")>();
  return {
    observeSize: (element: Element, callback: (entry: ResizeObserverEntry) => void) =>
      real.observeSize(element, (entry) => {
        runs.set(element, (runs.get(element) ?? 0) + 1);
        callback(entry);
      }),
  };
});

/** Three observations of `element` in one frame. Returns how often its layout work ran. */
function burst(element: Element): number {
  runs.delete(element);
  act(() => {
    resize(element, 500, 400);
    resize(element, 600, 400);
    resize(element, 700, 400);
    flushFrames();
  });
  return runs.get(element) ?? 0;
}

beforeEach(() => {
  installControlledLayout();
  useLibraryStore.setState({ mode: "columns", search: "", selection: EMPTY_SELECTION });
});
afterEach(() => vi.unstubAllGlobals());

describe("size observers run their layout work once per frame (PF-2)", () => {
  it("DockShell: the D45 clamp", () => {
    const { container } = render(<DockShell />);
    const host = container.firstElementChild;
    if (!host) throw new Error("no dock host");
    expect(burst(host)).toBe(1);
  });

  it("FrameSplit: the frame layout", () => {
    const { container } = render(<LibraryWidget />);
    const frames = container.querySelector("[data-frame-group='columns']");
    if (!frames) throw new Error("no frames");
    expect(burst(frames)).toBe(1);
  });

  it("PlaylistsWidget: the icon rail switch (UD18)", () => {
    const { container } = render(<PlaylistsWidget />);
    const root = container.firstElementChild;
    if (!root) throw new Error("no root");
    expect(burst(root)).toBe(1);
  });

  it("LibraryWidget: the narrow mode switch", () => {
    const { container } = render(<LibraryWidget />);
    const root = container.firstElementChild;
    if (!root) throw new Error("no root");
    expect(burst(root)).toBe(1);
  });
});
