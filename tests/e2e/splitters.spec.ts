// U3 (SP-1, SP-2, SP-3, SP-6, UD7, UD25): splitter hit area, double-click reset, the keyboard
// separator pattern and Collapse and Restore.
import type { Locator, Page } from "@playwright/test";
import { closeMenu, drag, expect, groupAction, openMenu, test, widget } from "./test-base";

async function open(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?data=library");
  await expect(widget(page, "library").getByRole("option", { name: "Artist 00", exact: true })).toBeVisible();
}

const width = async (locator: Locator) => (await locator.boundingBox())?.width ?? 0;
const separator = (page: Page, name: string) => page.getByRole("separator", { name, exact: true });

test("SP-1: a separator has a 6 px hit area, a 1 px line and a resize cursor", async ({ page }) => {
  await open(page);
  const sash = separator(page, "Resize Playlists and Library");
  const box = await sash.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(6);
  expect(["ew-resize", "e-resize", "w-resize", "col-resize"]).toContain(
    await sash.evaluate((element) => getComputedStyle(element).cursor),
  );
  await sash.hover();
  expect(await sash.evaluate((element) => getComputedStyle(element, "::after").width)).toBe("1px");
});

test("SP-2: a double-click after a drag puts Playlists back to 240 px", async ({ page }) => {
  await open(page);
  const playlists = widget(page, "playlists");
  const sash = separator(page, "Resize Playlists and Library");
  const box = await sash.boundingBox();
  if (!box) throw new Error("no separator");
  await drag(page, { x: box.x + box.width / 2, y: box.y + 200 }, { x: box.x + 160, y: box.y + 200 });
  await expect.poll(() => width(playlists)).toBeGreaterThan(300);
  const moved = await sash.boundingBox();
  if (!moved) throw new Error("no separator");
  await page.mouse.dblclick(moved.x + moved.width / 2, moved.y + 200);
  await expect.poll(async () => Math.abs((await width(playlists)) - 240)).toBeLessThanOrEqual(1);
});

test("SP-3: Tab reaches a separator; arrows, Shift+arrows, Home, End and Enter follow the W3C pattern", async ({
  page,
}) => {
  await open(page);
  const sash = separator(page, "Resize Library and Play queue, Lyrics");
  await expect(sash).toHaveAttribute("aria-orientation", "vertical");
  await expect(sash).toHaveAttribute("aria-valuemin", "0");
  await expect(sash).toHaveAttribute("aria-valuemax", "100");
  const now = Number(await sash.getAttribute("aria-valuenow"));
  expect(now).toBeGreaterThan(50);
  // Tab from the page start reaches a separator.
  let reached = false;
  for (let step = 0; step < 80 && !reached; step += 1) {
    await page.keyboard.press("Tab");
    reached = await page.evaluate(() => document.activeElement?.getAttribute("role") === "separator");
  }
  expect(reached).toBe(true);

  const library = widget(page, "library");
  await sash.focus();
  const start = await width(library);
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => width(library)).toBeCloseTo(start + 16, 0);
  await page.keyboard.press("Shift+ArrowLeft");
  await expect.poll(() => width(library)).toBeCloseTo(start - 48, 0);
  await expect(sash).not.toHaveAttribute("aria-valuenow", String(now));
  await page.keyboard.press("End");
  await expect.poll(async () => width(widget(page, "queue"))).toBeCloseTo(200, -1);
  await page.keyboard.press("Home");
  await expect.poll(() => width(library)).toBeCloseTo(320, -1);
  // Enter collapses the first neighbor to its minimum and Enter again restores it.
  await page.keyboard.press("End");
  const wide = await width(library);
  await page.keyboard.press("Enter");
  await expect.poll(() => width(library)).toBeCloseTo(320, -1);
  await page.keyboard.press("Enter");
  await expect.poll(() => width(library)).toBeCloseTo(wide, -1);
});

test("SP-3: a Library frame separator works with the keyboard too", async ({ page }) => {
  await open(page);
  const sash = separator(page, "Resize Artist and Album");
  const artists = widget(page, "library").getByRole("listbox", { name: "Artists" });
  const start = await width(artists);
  await sash.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => width(artists)).toBeCloseTo(start + 16, 0);
  await page.mouse.dblclick(...(Object.values(await center(sash)) as [number, number]));
  await expect.poll(() => width(artists)).toBeCloseTo(start, 0);
});

async function center(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("no box");
  return { x: box.x + box.width / 2, y: box.y + Math.min(200, box.height / 2) };
}

test("SP-6: Collapse sets Play queue to its minimum and Restore puts it back, by pointer and by menu", async ({
  page,
}) => {
  await open(page);
  const queue = widget(page, "queue");
  const start = await width(queue);
  await groupAction(page, "queue", "Play queue", "Collapse widget");
  await expect.poll(() => width(queue)).toBeCloseTo(200, -1);
  await groupAction(page, "queue", "Play queue", "Restore widget");
  await expect.poll(() => width(queue)).toBeCloseTo(start, 0);

  // Keyboard: F6 to Play queue (band, Playlists, Library, Play queue), then the Layout menu.
  for (let step = 0; step < 4; step += 1) await page.keyboard.press("F6");
  await expect(page.locator(":focus")).toHaveAttribute("data-widget", "queue");
  await openMenu(page);
  await page.getByRole("menuitem", { name: "Collapse widget" }).click();
  await expect.poll(() => width(queue)).toBeCloseTo(200, -1);
  await openMenu(page);
  await page.getByRole("menuitem", { name: "Restore widget" }).click();
  await expect.poll(() => width(queue)).toBeCloseTo(start, 0);

  // Locked: both paths are off.
  await openMenu(page);
  await page.getByRole("menuitemcheckbox", { name: "Lock layout" }).click();
  await closeMenu(page);
  await expect(page.locator("[data-slot='group-options']")).toHaveCount(0);
  await openMenu(page);
  await expect(page.getByRole("menuitem", { name: "Collapse widget" })).toHaveAttribute("aria-disabled", "true");
  await closeMenu(page);
  await expect(separator(page, "Resize Library and Play queue, Lyrics")).toHaveAttribute("aria-disabled", "true");
});

test("PS-5, UD25: a collapsed widget stays collapsed over a restart and Restore still works", async ({ page }) => {
  await open(page);
  const queue = widget(page, "queue");
  const start = await width(queue);
  const saves = Number((await page.locator("body").getAttribute("data-layout-saves")) ?? 0);
  await groupAction(page, "queue", "Play queue", "Collapse widget");
  await expect.poll(() => width(queue)).toBeCloseTo(200, -1);
  await expect.poll(() => page.evaluate(() => Number(document.body.dataset.layoutSaves ?? 0))).toBeGreaterThan(saves);
  await page.reload();
  await expect.poll(() => width(widget(page, "queue"))).toBeCloseTo(200, -1);
  await groupAction(page, "queue", "Play queue", "Restore widget");
  await expect.poll(() => width(widget(page, "queue"))).toBeCloseTo(start, 0);
});
