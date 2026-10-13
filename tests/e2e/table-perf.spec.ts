// U4: the Songs table with 50,000 rows (TB-1, PF-3, rework Phase 3 accept). The DOM holds the
// rows in view plus the overscan, and no frame gap goes over the 100 ms AC-2 budget while the
// table scrolls, sorts, resizes a column and the dock resizes. The mock stands in for the Rust
// index: it sorts once per key set, so the gaps measure the webview, not the mock (UK4).
import type { Page } from "@playwright/test";
import { center, drag, expect, SONG_ROWS, songsGrid, test, widget } from "./test-base";

const SIZE = 50_000;
/** The AC-2 frame budget. */
const MAX_GAP_MS = 100;
/** `VirtualList` overscan on each side, plus the kept active row. */
const OVERSCAN_ROWS = 2 * 8 + 1;
const DOCK_SASH = ".dv-split-view-container.dv-horizontal > .dv-sash-container > .dv-sash:not([data-frame-group] *)";

declare global {
  interface Window {
    frameGap?: { max: number; frames: number; stop: boolean };
  }
}

/** Records the longest gap between animation frames until `stopFrames`. */
async function startFrames(page: Page) {
  await page.evaluate(() => {
    const state = { max: 0, frames: 0, stop: false };
    window.frameGap = state;
    let last = performance.now();
    const tick = (now: number) => {
      state.max = Math.max(state.max, now - last);
      state.frames += 1;
      last = now;
      if (!state.stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function stopFrames(page: Page): Promise<{ max: number; frames: number }> {
  return page.evaluate(() => {
    const state = window.frameGap ?? { max: Number.POSITIVE_INFINITY, frames: 0, stop: true };
    state.stop = true;
    return { max: state.max, frames: state.frames };
  });
}

test("TB-1 and PF-3: 50,000 rows scroll, sort and resize without a long frame", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(`/?data=library&size=${SIZE}`);
  await expect(widget(page, "library").getByRole("option", { name: "Artist 00", exact: true })).toBeVisible();
  await widget(page, "library").getByRole("button", { name: "Top/bottom" }).click();
  const grid = songsGrid(page);
  await expect(grid.locator(SONG_ROWS).first()).toBeVisible();
  await expect(grid).toHaveAttribute("aria-rowcount", String(SIZE + 1));
  const title = grid.getByRole("columnheader", { name: "Title", exact: true });
  // Inside the measured window the locators are plain CSS: role queries run in the page and
  // would put the test's own work into the frame gaps.
  const titleCss = grid.locator("[data-col-header='title']");
  // Warm the mock's sort for Title up and down, then go back to the default order.
  for (const sort of ["ascending", "descending", "none"]) {
    await title.click();
    await expect(title).toHaveAttribute("aria-sort", sort);
  }
  await expect(grid.locator(SONG_ROWS).first()).toContainText("Song 1 of Album A0");

  await startFrames(page);
  const middle = await center(grid);
  await page.mouse.move(middle.x, middle.y);
  const end = Date.now() + 3_000;
  while (Date.now() < end) {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(16);
  }
  expect(await grid.evaluate((element) => element.scrollTop)).toBeGreaterThan(10_000);
  await titleCss.click();
  await expect(titleCss).toHaveAttribute("aria-sort", "ascending");
  const divider = grid.locator("[data-col-header='artist'] [data-slot='column-divider']");
  const from = await center(divider);
  await drag(page, from, { x: from.x + 60, y: from.y });
  const sash = page.locator(DOCK_SASH).first();
  const at = await center(sash);
  await drag(page, at, { x: at.x - 80, y: at.y });
  await page.waitForTimeout(200);
  const frames = await stopFrames(page);

  expect(frames.frames).toBeGreaterThan(60);
  expect(frames.max).toBeLessThanOrEqual(MAX_GAP_MS);
  // Only the rows in view and the overscan are in the DOM.
  const { height, row } = await grid.evaluate((element) => ({
    height: element.clientHeight,
    row: element.querySelector<HTMLElement>("[role='row'][aria-selected]")?.getBoundingClientRect().height ?? 1,
  }));
  expect(await grid.locator(SONG_ROWS).count()).toBeLessThanOrEqual(Math.ceil(height / row) + OVERSCAN_ROWS);
  console.log(`PF-3: longest frame gap ${frames.max.toFixed(1)} ms over ${frames.frames} frames`);
});
