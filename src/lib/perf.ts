/** Input-to-paint times above this break AC-2 (P6.8). */
export const SLOW_MS = 100;
/** The probe logs a summary this often. */
export const REPORT_MS = 10_000;

/** The input events that AC-2 covers. */
const INPUT_EVENTS = ["keydown", "pointerdown"] as const;
const TIMED_ENTRY_NAMES = new Set(["keydown", "keyup", "pointerdown", "pointerup", "click"]);

export interface PerfProbeOptions {
  log: (line: string) => void;
  target?: Window;
}

/**
 * The summary line for one period, or null when no input arrived. `count` is every input
 * event; `times` holds the measured input-to-paint times (Event Timing reports only events of
 * 16 ms or more, so it can hold fewer).
 */
export function summary(count: number, times: number[]): string | null {
  if (count === 0) return null;
  const max = Math.round(Math.max(0, ...times));
  const slow = times.filter((time) => time > SLOW_MS).length;
  return `perf: ${count} input events, max ${max} ms, ${slow} over ${SLOW_MS} ms`;
}

/** Whether the engine reports input-to-paint times itself (Event Timing API, WebView2). */
function hasEventTiming(target: Window): boolean {
  const observer = (target as Window & typeof globalThis).PerformanceObserver;
  return observer?.supportedEntryTypes?.includes("event") ?? false;
}

/**
 * Starts the responsiveness probe (P6.8, AC-2). With the Event Timing API it records each
 * entry's `duration` (event to next paint). Without it (WebKitGTK) it measures from the event
 * to a `MessageChannel` callback queued from the next animation frame, which runs after that
 * frame paints. Every 10 s it logs the maximum and the number of events over 100 ms.
 * Returns the function that stops it.
 */
export function startPerfProbe({ log, target = window }: PerfProbeOptions): () => void {
  let times: number[] = [];
  let count = 0;
  const stops: (() => void)[] = [];
  const timing = hasEventTiming(target);
  if (timing) {
    const observer = new (target as Window & typeof globalThis).PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (TIMED_ENTRY_NAMES.has(entry.name)) times.push(entry.duration);
    });
    observer.observe({ type: "event", durationThreshold: 16, buffered: false } as PerformanceObserverInit);
    stops.push(() => observer.disconnect());
  }
  const onInput = () => {
    count += 1;
    if (timing) return;
    const start = target.performance.now();
    target.requestAnimationFrame(() => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        times.push(target.performance.now() - start);
        channel.port1.close();
      };
      channel.port2.postMessage(null);
    });
  };
  for (const name of INPUT_EVENTS) {
    target.addEventListener(name, onInput, { capture: true, passive: true });
    stops.push(() => target.removeEventListener(name, onInput, { capture: true }));
  }
  const timer = target.setInterval(() => {
    const line = summary(count, times);
    times = [];
    count = 0;
    if (line) log(`${line} (${timing ? "Event Timing" : "next-frame message"})`);
  }, REPORT_MS);
  stops.push(() => target.clearInterval(timer));
  return () => stops.forEach((stop) => stop());
}
