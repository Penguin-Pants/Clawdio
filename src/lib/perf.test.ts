import { afterEach, describe, expect, it, vi } from "vitest";
import { REPORT_MS, startPerfProbe, summary } from "./perf";

afterEach(() => vi.useRealTimers());

describe("summary (P6.8)", () => {
  it("names the maximum and the events over 100 ms", () => {
    expect(summary(4, [12, 150.4, 40, 101])).toBe("perf: 4 input events, max 150 ms, 2 over 100 ms");
    expect(summary(3, [])).toBe("perf: 3 input events, max 0 ms, 0 over 100 ms");
    expect(summary(0, [])).toBeNull();
  });
});

describe("startPerfProbe", () => {
  it("times each key and pointer event to the next paint and logs every 10 s", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "requestAnimationFrame", "performance"] });
    const lines: string[] = [];
    const stop = startPerfProbe({ log: (line) => lines.push(line) });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    window.dispatchEvent(new PointerEvent("pointerdown"));
    await vi.advanceTimersByTimeAsync(50);
    await vi.advanceTimersByTimeAsync(REPORT_MS);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^perf: 2 input events, max \d+ ms, 0 over 100 ms \(next-frame message\)$/);
    await vi.advanceTimersByTimeAsync(REPORT_MS);
    expect(lines).toHaveLength(1);
    stop();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    await vi.advanceTimersByTimeAsync(REPORT_MS * 2);
    expect(lines).toHaveLength(1);
  });
});

describe("startPerfProbe with Event Timing", () => {
  it("takes the durations from Event Timing entries and counts slow events", () => {
    let report: (() => void) | undefined;
    let deliver: ((entries: { name: string; duration: number }[]) => void) | undefined;
    const listeners = new Map<string, () => void>();
    class FakeObserver {
      static supportedEntryTypes = ["event"];
      constructor(callback: (list: { getEntries: () => { name: string; duration: number }[] }) => void) {
        deliver = (entries) => callback({ getEntries: () => entries });
      }
      observe() {}
      disconnect() {}
    }
    const target = {
      PerformanceObserver: FakeObserver,
      performance: { now: () => 0 },
      addEventListener: (name: string, listener: () => void) => listeners.set(name, listener),
      removeEventListener: (name: string) => listeners.delete(name),
      setInterval: (callback: () => void) => {
        report = callback;
        return 1;
      },
      clearInterval: () => {
        report = undefined;
      },
      requestAnimationFrame: () => {
        throw new Error("Event Timing needs no frame callback");
      },
    } as unknown as Window;
    const lines: string[] = [];
    const stop = startPerfProbe({ log: (line) => lines.push(line), target });
    listeners.get("keydown")?.();
    listeners.get("keydown")?.();
    listeners.get("pointerdown")?.();
    deliver?.([
      { name: "keydown", duration: 24 },
      { name: "pointerdown", duration: 152 },
      { name: "scroll", duration: 400 },
    ]);
    report?.();
    expect(lines).toEqual(["perf: 3 input events, max 152 ms, 1 over 100 ms (Event Timing)"]);
    stop();
    expect(listeners.size).toBe(0);
    expect(report).toBeUndefined();
  });
});
