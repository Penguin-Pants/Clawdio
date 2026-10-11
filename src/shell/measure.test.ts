import { afterEach, describe, expect, it, vi } from "vitest";
import { measurementPopulated, waitForPopulated } from "./measure";

const POPULATED_HTML = `
  <section data-widget="library"><div role="option">All</div><div role="option">Artist</div></section>
  <section data-widget="transport"></section>
  <section data-widget="nowPlaying"><p class="text-lg">Song</p></section>
  <section data-widget="playlists"><div role="treeitem">Mix</div></section>
  <section data-widget="queue"><div role="option">Song</div></section>
  <section data-widget="lyrics"><section>Line</section></section>`;

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("measurementPopulated (P3.5)", () => {
  it("is true only when all six widgets show data", () => {
    document.body.innerHTML = POPULATED_HTML;
    expect(measurementPopulated()).toBe(true);
    document.querySelector('[data-widget="queue"] [role="option"]')?.remove();
    expect(measurementPopulated()).toBe(false);
  });

  it("does not count the Library 'All' row alone", () => {
    document.body.innerHTML = POPULATED_HTML;
    document.querySelectorAll('[data-widget="library"] [role="option"]')[1]?.remove();
    expect(measurementPopulated()).toBe(false);
  });
});

describe("waitForPopulated", () => {
  it("resolves once the widgets fill and rejects after the timeout", async () => {
    vi.useFakeTimers();
    const filled = waitForPopulated(5_000);
    document.body.innerHTML = POPULATED_HTML;
    await vi.advanceTimersByTimeAsync(300);
    await expect(filled).resolves.toBeUndefined();
    document.body.innerHTML = "";
    const empty = waitForPopulated(1_000);
    const result = expect(empty).rejects.toThrow("did not fill");
    await vi.advanceTimersByTimeAsync(1_500);
    await result;
  });
});
