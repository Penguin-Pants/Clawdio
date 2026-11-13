// P29-AC3 and P29-AC4 (R38.1 to R38.10, AC-34): drag and resize snap to cells, push, refuse,
// scale with the window, restore after a restart, and the keyboard path.
import type { Page } from "@playwright/test";
import { PRESETS } from "../../src/shell/presets";
import { center, expect, gridItem, header, layoutOf, openApp, openMenu, closeMenu, test } from "./test-base";

const DEFAULT = PRESETS.default.layout;

/** The pixel size of one grid cell. */
async function cell(page: Page): Promise<{ x: number; y: number; w: number; h: number }> {
  const box = await page.locator("[data-grid]").boundingBox();
  if (!box) throw new Error("no grid");
  return { x: box.x, y: box.y, w: box.width / 12, h: box.height / 12 };
}

/** Starts a pointer drag at `from`, moves to `to` and leaves the button down. */
async function dragTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 });
  await page.mouse.move(to.x, to.y, { steps: 10 });
}

/** Drags a widget's header so its top left cell moves by (dx, dy) cells. */
async function moveBy(page: Page, id: string, dx: number, dy: number) {
  const size = await cell(page);
  const from = await center(header(page, id));
  await dragTo(page, from, { x: from.x + dx * size.w, y: from.y + dy * size.h });
  await page.mouse.up();
}

/** True when no two widgets overlap and every widget is inside the 12 x 12 grid. */
function valid(layout: Record<string, { x: number; y: number; w: number; h: number }>): boolean {
  const rects = Object.values(layout);
  const inside = rects.every((r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= 12 && r.y + r.h <= 12);
  const apart = rects.every((a, i) =>
    rects.slice(i + 1).every((b) => a.x >= b.x + b.w || b.x >= a.x + a.w || a.y >= b.y + b.h || b.y >= a.y + a.h),
  );
  return inside && apart;
}

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await expect.poll(() => page.evaluate(() => Boolean(window.e2e))).toBe(true);
});

test("R38.1: the grid fills the area between the header and the status line, and the page does not scroll", async ({
  page,
}) => {
  const grid = await page.locator("[data-grid]").boundingBox();
  const status = await page.locator("footer").boundingBox();
  expect(grid && status && Math.abs(grid.y + grid.height - status.y)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.scrollingElement?.scrollHeight === window.innerHeight)).toBe(true);
  // Each widget takes its cells: Songs is 10 x 6 cells.
  const size = await cell(page);
  const songs = await gridItem(page, "songs").boundingBox();
  expect(Math.abs((songs?.width ?? 0) - 10 * size.w)).toBeLessThanOrEqual(2);
  expect(Math.abs((songs?.height ?? 0) - 6 * size.h)).toBeLessThanOrEqual(2);
});

test("R38.4: a header drag shows the target cells and snaps the widget to them", async ({ page }) => {
  const size = await cell(page);
  const from = await center(header(page, "artist"));
  await dragTo(page, from, { x: from.x + 1.2 * size.w, y: from.y });
  const preview = page.locator("[data-grid-preview]");
  await expect(preview).toHaveAttribute("data-grid-preview", "allowed");
  const target = await preview.boundingBox();
  expect(Math.abs((target?.x ?? 0) - (size.x + 3 * size.w))).toBeLessThanOrEqual(2);
  await page.mouse.up();
  await expect(preview).toHaveCount(0);
  const layout = await layoutOf(page);
  expect(layout.artist).toEqual({ x: 3, y: 2, w: 3, h: 4 });
  // Album was under the target cells: it moved down, Songs made room, nothing passes row 12.
  expect(layout.album.y).toBeGreaterThanOrEqual(6);
  expect(valid(layout)).toBe(true);
});

test("R38.5: a corner drag resizes in whole cells and stops at the minimum", async ({ page }) => {
  const size = await cell(page);
  const corner = gridItem(page, "nowPlaying").locator("[data-resize='se']");
  const from = await center(corner);
  await dragTo(page, from, { x: from.x - 0.9 * size.w, y: from.y - 1.1 * size.h });
  await page.mouse.up();
  expect((await layoutOf(page)).nowPlaying).toEqual({ x: 9, y: 1, w: 2, h: 4 });
  // Past the 2 x 3 minimum, the size stops at the minimum.
  const again = await center(corner);
  await dragTo(page, again, { x: again.x - 5 * size.w, y: again.y - 5 * size.h });
  await page.mouse.up();
  expect((await layoutOf(page)).nowPlaying).toEqual({ x: 9, y: 1, w: 2, h: 3 });
});

test("R38.4: a drop that does not fit shows a red preview and changes nothing", async ({ page }) => {
  // Two full-height columns of widgets at their minimum height leave no room to push.
  await page.evaluate(() =>
    window.e2e.setLayout({
      transport: { x: 0, y: 0, w: 4, h: 1 },
      songs: { x: 4, y: 0, w: 3, h: 2 },
      artist: { x: 4, y: 2, w: 3, h: 10 },
      album: { x: 0, y: 1, w: 2, h: 11 },
    }),
  );
  const before = await layoutOf(page);
  const size = await cell(page);
  const from = await center(header(page, "album"));
  // Album (2 x 11) onto Songs: Songs and Artist would pass row 12.
  await dragTo(page, from, { x: from.x + 4 * size.w, y: from.y });
  await expect(page.locator("[data-grid-preview]")).toHaveAttribute("data-grid-preview", "refused");
  const color = await page.locator("[data-grid-preview]").evaluate((element) => getComputedStyle(element).borderColor);
  await page.mouse.up();
  expect(await layoutOf(page)).toEqual(before);
  const red = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.color = "var(--color-brand-red)";
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  });
  expect(color).toBe(red);
});

test("AC-34: art top right, Songs full width below, Album onto Artist, then resize and restart", async ({ page }) => {
  // Songs full width below Now playing (Default has Now playing at the top right).
  await moveBy(page, "songs", -2, 0);
  let layout = await layoutOf(page);
  expect(layout.songs).toEqual({ x: 0, y: 6, w: 10, h: 6 });
  const corner = await center(gridItem(page, "songs").locator("[data-resize='e']"));
  const size = await cell(page);
  await dragTo(page, corner, { x: corner.x + 2 * size.w, y: corner.y });
  await page.mouse.up();
  layout = await layoutOf(page);
  expect(layout.songs).toEqual({ x: 0, y: 6, w: 12, h: 6 });
  expect(layout.nowPlaying).toEqual(DEFAULT.nowPlaying);
  expect(valid(layout)).toBe(true);
  // Album onto Artist: Artist moves down and nothing passes row 12.
  await moveBy(page, "album", -3, 0);
  layout = await layoutOf(page);
  expect(layout.album).toMatchObject({ x: 2, y: 2 });
  expect(layout.artist.y).toBeGreaterThanOrEqual(6);
  expect(valid(layout)).toBe(true);
  // The window resize keeps the shape: the same cells, scaled.
  await page.setViewportSize({ width: 900, height: 600 });
  expect(await layoutOf(page)).toEqual(layout);
  const small = await cell(page);
  const songs = await gridItem(page, "songs").boundingBox();
  expect(Math.abs((songs?.width ?? 0) - 12 * small.w)).toBeLessThanOrEqual(2);
  // A restart restores the arrangement once it is saved.
  await expect
    .poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("e2e-layout") ?? "{}").widgets))
    .toEqual(layout);
  await page.reload();
  await expect(gridItem(page, "songs")).toBeVisible();
  expect(await layoutOf(page)).toEqual(layout);
});

test("R38.10: Alt+arrow keys move and Alt+Shift+arrow keys resize the focused widget by one cell", async ({ page }) => {
  const nowPlaying = header(page, "nowPlaying");
  await nowPlaying.focus();
  await page.keyboard.press("Alt+ArrowDown");
  expect((await layoutOf(page)).nowPlaying).toEqual({ x: 9, y: 2, w: 3, h: 5 });
  await page.keyboard.press("Alt+Shift+ArrowUp");
  expect((await layoutOf(page)).nowPlaying).toEqual({ x: 9, y: 2, w: 3, h: 4 });
  await page.keyboard.press("Alt+ArrowLeft");
  expect((await layoutOf(page)).nowPlaying).toMatchObject({ x: 8, y: 2 });
  expect(valid(await layoutOf(page))).toBe(true);
  // The header keeps the focus and shows it.
  await expect(nowPlaying).toBeFocused();
  const outline = await nowPlaying.evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(outline).not.toBe("none");
});

test("R38.10: the menu moves and resizes the active widget", async ({ page }) => {
  await gridItem(page, "nowPlaying").click({ position: { x: 20, y: 40 } });
  await openMenu(page);
  await page.getByRole("menuitem", { name: "Arrange Now playing" }).click();
  await page.getByRole("menuitem", { name: "Move down" }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  expect((await layoutOf(page)).nowPlaying).toEqual({ x: 9, y: 2, w: 3, h: 5 });
  await openMenu(page);
  await page.getByRole("menuitem", { name: "Arrange Now playing" }).click();
  await page.getByRole("menuitem", { name: "Shorter" }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  expect((await layoutOf(page)).nowPlaying).toEqual({ x: 9, y: 2, w: 3, h: 4 });
});

test("R38.9: Lock layout stops header drags, resize handles and the keyboard path", async ({ page }) => {
  await openMenu(page);
  await page.getByRole("menuitemcheckbox", { name: "Lock layout" }).click();
  await closeMenu(page);
  await expect(page.locator("[data-resize]")).toHaveCount(0);
  await moveBy(page, "nowPlaying", -2, 0);
  await header(page, "nowPlaying").focus();
  await page.keyboard.press("Alt+ArrowDown");
  await page.keyboard.press("Alt+Shift+ArrowUp");
  expect(await layoutOf(page)).toEqual(DEFAULT);
  // Lists still scroll.
  const songs = gridItem(page, "songs").getByRole("grid", { name: "Songs" });
  await expect(songs).toBeVisible();
  await expect(header(page, "nowPlaying")).toBeFocused();
});
