// UD19, TR-9: the mini player sends the compact band height and leaves with the normal window.
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUiStore } from "@/store/ui";
import { setMiniPlayer, useMiniWindow } from "./mini";

const windowSetMini = vi.fn<(on: boolean, height: number) => Promise<void>>(() => Promise.resolve());
vi.mock("@/lib/ipc/commands", () => ({
  commands: { windowSetMini: (on: boolean, height: number) => windowSetMini(on, height) },
}));
vi.mock("@/lib/log", () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));

beforeEach(() => {
  windowSetMini.mockClear();
  useUiStore.setState({ mini: false });
  document.documentElement.style.fontSize = "16px";
});

afterEach(() => {
  document.documentElement.style.fontSize = "";
});

describe("mini player (UD19)", () => {
  it("enters with the compact band height and leaves with the normal window", () => {
    renderHook(() => useMiniWindow());
    expect(windowSetMini).not.toHaveBeenCalled();
    act(() => setMiniPlayer(true));
    expect(useUiStore.getState().mini).toBe(true);
    // The compact band token is 2.5 rem: 40 px at a 16 px root.
    expect(windowSetMini).toHaveBeenLastCalledWith(true, 40);
    act(() => setMiniPlayer(false));
    expect(useUiStore.getState().mini).toBe(false);
    expect(windowSetMini).toHaveBeenLastCalledWith(false, 40);
    expect(windowSetMini).toHaveBeenCalledTimes(2);
  });

  it("sends the new height when the root font changes while mini (text scaling)", () => {
    const { rerender } = renderHook(() => useMiniWindow());
    act(() => setMiniPlayer(true));
    document.documentElement.style.fontSize = "20px";
    rerender();
    expect(windowSetMini).toHaveBeenLastCalledWith(true, 50);
  });
});
