// Test helpers: a ResizeObserver and animation frames that tests drive by hand (jsdom has no layout).
import { vi } from "vitest";

type Callback = ResizeObserverCallback;

const observers = new Set<ControlledResizeObserver>();

class ControlledResizeObserver {
  readonly targets = new Set<Element>();
  constructor(readonly callback: Callback) {
    observers.add(this);
  }
  observe(target: Element) {
    this.targets.add(target);
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
    observers.delete(this);
  }
}

let frames = new Map<number, FrameRequestCallback>();
let nextFrame = 1;

/** Installs the controlled observer and frame queue. Call in `beforeEach`; `vi.unstubAllGlobals` removes them. */
export function installControlledLayout(): void {
  observers.clear();
  frames = new Map();
  vi.stubGlobal("ResizeObserver", ControlledResizeObserver);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = nextFrame++;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
}

/** Reports a new size of `target` to every observer that watches it, like one layout pass. */
export function resize(target: Element, width: number, height: number): void {
  for (const observer of [...observers]) {
    if (!observer.targets.has(target)) continue;
    const entry = { target, contentRect: { width, height } as DOMRectReadOnly } as ResizeObserverEntry;
    observer.callback([entry], observer as unknown as ResizeObserver);
  }
}

/** Runs the animation frames that are pending now. Returns how many ran. */
export function flushFrames(): number {
  const pending = [...frames.values()];
  frames = new Map();
  for (const callback of pending) callback(performance.now());
  return pending.length;
}

/** Animation frames waiting to run. */
export function pendingFrames(): number {
  return frames.size;
}
