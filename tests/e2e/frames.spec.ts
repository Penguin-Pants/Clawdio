// P22-AC3 and P22-AC4: Library frame splitters (R28.1, AC-25). The mock keeps `layout.json` in
// session storage, so a reload is the restart.
import type { Page } from "@playwright/test";
import { expect, openApp, test, tokenRgb, widget } from "./test-base";

/** The direct splitview of a frame group, not a nested one. */
const splitview = (page: Page, group: string) =>
  page.locator(`[data-frame-group="${group}"] > div > div > .dv-split-view-container`);

const sashes = (page: Page, group: string) => splitview(page, group).locator(":scope > .dv-sash-container > .dv-sash");

type Group = "columns" | "top" | "rows";
const FRAMES: Record<Group, number> = { columns: 3, top: 2, rows: 2 };
const AXIS: Record<Group, "width" | "height"> = { columns: "width", top: "width", rows: "height" };

/**
 * The frame sizes of a group along its axis, in px. A new splitview (mode switch, reload) gets
 * its first layout from a ResizeObserver, so this waits until every frame has a size.
 */
async function sizes(page: Page, group: Group): Promise<number[]> {
  const views = splitview(page, group).locator(":scope > .dv-view-container > .dv-view");
  const read = () =>
    views.evaluateAll(
      (elements, key) => elements.map((view) => view.getBoundingClientRect()[key as "width" | "height"]),
      AXIS[group],
    );
  await expect(views).toHaveCount(FRAMES[group]);
  await expect.poll(async () => (await read()).every((size) => size > 0)).toBe(true);
  return read();
}

/**
 * Drags sash `index` of a group by `dx`, `dy` px, once the group has its layout. The grab point
 * is a quarter along the sash, away from where a nested sash meets it (Top/bottom: the Artist and
 * Album sash ends on the rows sash at its middle). The hover makes Playwright check that this
 * sash receives the pointer there.
 */
async function dragSash(page: Page, group: Group, index: number, dx: number, dy: number): Promise<void> {
  await sizes(page, group);
  const sash = sashes(page, group).nth(index);
  const box = await sash.boundingBox();
  if (!box) throw new Error("no splitter");
  const position = {
    x: box.width > box.height ? box.width / 4 : box.width / 2,
    y: box.height > box.width ? box.height / 4 : box.height / 2,
  };
  await sash.hover({ position, timeout: 5000 });
  const x = box.x + position.x;
  const y = box.y + position.y;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}

const modeButton = (page: Page, name: string) =>
  widget(page, "library").getByRole("group", { name: "Library mode" }).getByRole("button", { name });

/** The saved `libraryFrames`, once the 500 ms save has run. */
async function savedFrames(page: Page): Promise<{ columns: number[]; topBottom: { top: number[]; rows: number[] } }> {
  const text = await page.evaluate(() => sessionStorage.getItem("e2e-layout"));
  return JSON.parse(text ?? "{}").libraryFrames;
}

function expectClose(actual: number[], expected: number[], tolerance = 2): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => expect(Math.abs(value - (expected[index] ?? 0))).toBeLessThanOrEqual(tolerance));
}

test("P22-AC3: frame sizes per mode survive a mode switch and a restart; Reset restores them (AC-25)", async ({
  page,
}) => {
  // The default preset puts side groups beside Library; a wide window keeps the frames above their minimums.
  await page.setViewportSize({ width: 1600, height: 800 });
  await openApp(page);
  await expect.poll(() => page.evaluate(() => Boolean(window.e2e))).toBe(true);
  const before = await sizes(page, "columns");
  await dragSash(page, "columns", 0, 80, 0);
  await dragSash(page, "columns", 1, -40, 0);
  const columns = await sizes(page, "columns");
  expect(columns[0]).toBeGreaterThan((before[0] ?? 0) + 60);
  expect(columns[2]).toBeGreaterThan((before[2] ?? 0) + 20);

  await modeButton(page, "Top/bottom").click();
  await dragSash(page, "rows", 0, 0, 60);
  await dragSash(page, "top", 0, 70, 0);
  const rows = await sizes(page, "rows");
  const top = await sizes(page, "top");
  expect(rows[0]).toBeGreaterThan((rows[1] ?? 0) + 60);
  expect(top[0]).toBeGreaterThan((top[1] ?? 0) + 60);

  await modeButton(page, "Columns").click();
  expectClose(await sizes(page, "columns"), columns);

  await expect.poll(async () => (await savedFrames(page))?.topBottom.top[0] ?? 0).toBeGreaterThan(0.55);
  await page.reload();
  await expect(page.locator("[data-library-body]")).toHaveAttribute("data-library-body", "columns");
  expectClose(await sizes(page, "columns"), columns);
  await modeButton(page, "Top/bottom").click();
  expectClose(await sizes(page, "rows"), rows);
  expectClose(await sizes(page, "top"), top);

  await page.locator("body").press("Control+Shift+L");
  await expect(page.locator("[data-library-body]")).toHaveAttribute("data-library-body", "columns");
  const reset = await sizes(page, "columns");
  const total = reset.reduce((sum, size) => sum + size, 0);
  expectClose(reset, [total * 0.25, total * 0.25, total * 0.5]);
  await modeButton(page, "Top/bottom").click();
  const resetRows = await sizes(page, "rows");
  expectClose(resetRows, [resetRows[1] ?? 0, resetRows[0] ?? 0]);
});

test("P22-AC3: a small splitter drag is saved too", async ({ page }) => {
  await openApp(page);
  await dragSash(page, "columns", 0, 40, 0);
  await expect.poll(async () => (await savedFrames(page))?.columns[0] ?? 0).toBeGreaterThan(0.26);
  const first = (await savedFrames(page)).columns[0] ?? 0;
  // One px of a wide Library is less than 0.2% of the group.
  await dragSash(page, "columns", 0, 1, 0);
  await expect.poll(async () => (await savedFrames(page)).columns[0] ?? 0).toBeGreaterThan(first);
});

test("P22-AC3: Tree mode shows no frame splitter", async ({ page }) => {
  await openApp(page);
  await modeButton(page, "Tree").click();
  await expect(page.locator("[data-library-body]")).toHaveAttribute("data-library-body", "tree");
  await expect(page.locator("[data-frame-group]")).toHaveCount(0);
});

test("P22-AC4: frames keep their minimum, fit a small window and use the dock splitter style", async ({ page }) => {
  await openApp(page);
  await dragSash(page, "columns", 0, -1000, 0);
  expect((await sizes(page, "columns"))[0]).toBeGreaterThanOrEqual(95);

  const sash = sashes(page, "columns").nth(1);
  // The separators are in the Tab order since U3 (SP-3, UD7).
  await expect(sash).toHaveAttribute("role", "separator");
  expect(await sash.evaluate((element) => (element as HTMLElement).tabIndex)).toBe(0);
  const box = await sash.boundingBox();
  if (!box) throw new Error("no splitter");
  await page.mouse.move(box.x + box.width / 2, box.y + 100);
  const strong = await tokenRgb(page, "--color-border-strong");
  expect(await sash.evaluate((element) => getComputedStyle(element, "::after").backgroundColor)).toBe(strong);

  await page.setViewportSize({ width: 800, height: 560 });
  // Every dock widget is in the page (the default preset hides Now playing).
  await page.evaluate(() => window.e2e.show("nowPlaying"));
  // `sizes` waits until every Columns frame has a width; each frame also keeps a height.
  for (const size of await sizes(page, "columns")) expect(size).toBeGreaterThan(0);
  const heights = await splitview(page, "columns")
    .locator(":scope > .dv-view-container > .dv-view")
    .evaluateAll((views) => views.map((view) => view.getBoundingClientRect().height));
  for (const height of heights) expect(height).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("P22.1: building the frames does not move focus (F6 order, mode switch by keyboard)", async ({ page }) => {
  await openApp(page);
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  await modeButton(page, "Top/bottom").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-library-body]")).toHaveAttribute("data-library-body", "topBottom");
  await expect(modeButton(page, "Top/bottom")).toBeFocused();
});
