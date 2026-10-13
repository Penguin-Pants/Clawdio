import { afterEach, describe, expect, it, vi } from "vitest";
import { measurementPopulated, waitForPopulated } from "./measure";

const POPULATED_HTML = `
  <section data-widget="library">
    <div role="listbox"><div role="presentation"><div role="option">All</div></div></div>
    <div role="grid"><div role="presentation"><div role="row" aria-selected="false">Song</div></div></div>
  </section>
  <section data-widget="transport"></section>
  <section data-widget="nowPlaying"></section>
  <section data-widget="playlists"></section>
  <section data-widget="queue"></section>
  <section data-widget="lyrics"></section>`;

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("measurementPopulated (P3.5, P6.7)", () => {
  it("is true when the band and the five dock widgets are in the page and the Library shows rows", () => {
    document.body.innerHTML = POPULATED_HTML;
    expect(measurementPopulated()).toBe(true);
    document.querySelector('[data-widget="queue"]')?.remove();
    expect(measurementPopulated()).toBe(false);
    document.body.innerHTML = POPULATED_HTML;
    document.querySelector('[data-widget="transport"]')?.remove();
    expect(measurementPopulated()).toBe(false);
  });

  it("does not count the Library 'All' row alone", () => {
    document.body.innerHTML = POPULATED_HTML;
    document.querySelector('[data-widget="library"] [role="row"]')?.remove();
    expect(measurementPopulated()).toBe(false);
  });
});

describe("waitForPopulated", () => {
  it("waits for the scan to end, and rejects after the timeout", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = POPULATED_HTML;
    let scanning = true;
    let done = false;
    const ready = waitForPopulated(async () => !scanning, 5_000).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(done).toBe(false);
    scanning = false;
    await vi.advanceTimersByTimeAsync(300);
    await ready;
    expect(done).toBe(true);

    const never = waitForPopulated(async () => false, 1_000);
    const outcome = never.catch((error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(await outcome).toMatch(/did not load/);
  });
});
