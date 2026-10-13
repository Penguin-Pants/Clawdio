// P22-AC3 and P22-AC4: Library frame splitters (R28.1, AC-25). The mock keeps `layout.json` in
// session storage, so a reload is the restart.
import type { Locator, Page } from "@playwright/test";
import { closeMenu, expect, openApp, openMenu, test, tokenRgb, widget } from "./test-base";

/** The direct splitview of a frame group, not a nested one. */
const splitview = (page: Page, group: string) =>
  page.locator(`[data-frame-group="${group}"] > div > div > .dv-split-view-container`);

const sashes = (page: Page, group: string) => splitview(page, group).locator(":scope > .dv-sash-container > .dv-sash");

/** The frame sizes of a group along its axis, in px. */
async function sizes(page: Page, group: string, axis: "width" | "height"): Promise<number[]> {
  return splitview(page, group)
    .locator(":scope > .dv-view-container > .dv-view")
    .evaluateAll((views, key) => views.map((view) => view.getBoundingClientRect()[key as "width" | "height"]), axis);
}

/** Drags a sash by `dx`, `dy` px. */
async function dragSash(page: Page, sash: Locator, dx: number, dy: number): Promise<void> {
  const box = await sash.boundingBox();
  if (!box) throw new Error("no splitter");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
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
  await openApp(page);
  await expect.poll(() => page.evaluate(() => Boolean(window.e2e))).toBe(true);
  const before = await sizes(page, "columns", "width");
  await dragSash(page, sashes(page, "columns").nth(0), 80, 0);
  await dragSash(page, sashes(page, "columns").nth(1), -40, 0);
  const columns = await sizes(page, "columns", "width");
  expect(columns[0]).toBeGreaterThan((before[0] ?? 0) + 60);
  expect(columns[2]).toBeGreaterThan((before[2] ?? 0) + 20);

  await modeButton(page, "Top/bottom").click();
  await dragSash(page, sashes(page, "rows").nth(0), 0, 60);
  await dragSash(page, sashes(page, "top").nth(0), 70, 0);
  const rows = await sizes(page, "rows", "height");
  const top = await sizes(page, "top", "width");
  expect(rows[0]).toBeGreaterThan((rows[1] ?? 0) + 60);
  expect(top[0]).toBeGreaterThan((top[1] ?? 0) + 60);

  await modeButton(page, "Columns").click();
  expectClose(await sizes(page, "columns", "width"), columns);

  await expect.poll(async () => (await savedFrames(page))?.topBottom.top[0] ?? 0).toBeGreaterThan(0.55);
  await page.reload();
  await expect(page.locator("[data-library-body]")).toHaveAttribute("data-library-body", "columns");
  expectClose(await sizes(page, "columns", "width"), columns);
  await modeButton(page, "Top/bottom").click();
  expectClose(await sizes(page, "rows", "height"), rows);
  expectClose(await sizes(page, "top", "width"), top);

  await page.locator("body").press("Control+Shift+L");
  await expect(page.locator("[data-library-body]")).toHaveAttribute("data-library-body", "columns");
  const reset = await sizes(page, "columns", "width");
  const total = reset.reduce((sum, size) => sum + size, 0);
  expectClose(reset, [total * 0.25, total * 0.25, total * 0.5]);
  await modeButton(page, "Top/bottom").click();
  const resetRows = await sizes(page, "rows", "height");
  expectClose(resetRows, [resetRows[1] ?? 0, resetRows[0] ?? 0]);
});

test("P22-AC3: Tree mode shows no frame splitter", async ({ page }) => {
  await openApp(page);
  await modeButton(page, "Tree").click();
  await expect(page.locator("[data-library-body]")).toHaveAttribute("data-library-body", "tree");
  await expect(page.locator("[data-frame-group]")).toHaveCount(0);
});

test("P22-AC4: frames keep their minimum, fit a small window and use the dock splitter style", async ({ page }) => {
  await openApp(page);
  await dragSash(page, sashes(page, "columns").nth(0), -1000, 0);
  expect((await sizes(page, "columns", "width"))[0]).toBeGreaterThanOrEqual(95);

  const sash = sashes(page, "columns").nth(1);
  expect(await sash.evaluate((element) => (element as HTMLElement).tabIndex)).toBeLessThan(0);
  const box = await sash.boundingBox();
  if (!box) throw new Error("no splitter");
  await page.mouse.move(box.x + box.width / 2, box.y + 100);
  const strong = await tokenRgb(page, "--color-border-strong");
  expect(await sash.evaluate((element) => getComputedStyle(element, "::after").backgroundColor)).toBe(strong);

  await page.setViewportSize({ width: 800, height: 560 });
  for (const name of ["Playlists", "Play queue", "Lyrics"]) {
    await openMenu(page);
    await page.getByRole("menuitemcheckbox", { name, exact: true }).click();
    if (await page.getByRole("menu").isVisible()) await closeMenu(page);
  }
  for (const [group, axis] of [
    ["columns", "width"],
    ["columns", "height"],
  ] as const) {
    for (const size of await sizes(page, group, axis)) expect(size).toBeGreaterThan(0);
  }
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
