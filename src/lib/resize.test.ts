import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushFrames, installControlledLayout, pendingFrames, resize } from "@/test/resize";
import { observeSize } from "./resize";

describe("observeSize (UD24, PF-2)", () => {
  beforeEach(installControlledLayout);
  afterEach(() => vi.unstubAllGlobals());

  it("runs the callback once per frame with the latest size", () => {
    const element = document.createElement("div");
    const seen: number[] = [];
    observeSize(element, (entry) => seen.push(entry.contentRect.width));
    resize(element, 100, 10);
    resize(element, 200, 10);
    expect(seen).toEqual([]);
    expect(flushFrames()).toBe(1);
    expect(seen).toEqual([200]);
    resize(element, 300, 10);
    flushFrames();
    expect(seen).toEqual([200, 300]);
  });

  it("cancels a pending frame on disconnect", () => {
    const element = document.createElement("div");
    const callback = vi.fn();
    const stop = observeSize(element, callback);
    resize(element, 100, 10);
    expect(pendingFrames()).toBe(1);
    stop();
    expect(pendingFrames()).toBe(0);
    resize(element, 200, 10);
    flushFrames();
    expect(callback).not.toHaveBeenCalled();
  });
});
