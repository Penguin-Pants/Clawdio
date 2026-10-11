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
