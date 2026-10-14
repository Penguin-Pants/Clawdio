// U2 (DK-7, DK-8, DK-9): the default preset at first start, the other presets and Reset layout.
import type { Page } from "@playwright/test";
import { band, closeMenu, drag, center, expect, openApp, openMenu, tab, test, widget } from "./test-base";

async function menuItem(page: Page, name: string) {
  await openMenu(page);
  await page.getByRole("menuitem", { name, exact: true }).click();
  if (await page.getByRole("menu").isVisible()) await closeMenu(page);
}

async function box(page: Page, id: string) {
  const value = await widget(page, id).boundingBox();
  if (!value) throw new Error(`no ${id}`);
  return value;
}

/** The default preset: Playlists left, Library center, Play queue and Lyrics tabbed right, band at top. */
async function expectDefaultPreset(page: Page) {
  const playlists = await box(page, "playlists");
  const library = await box(page, "library");
  const queue = await box(page, "queue");
  expect(playlists.x + playlists.width).toBeLessThanOrEqual(library.x + 1);
  expect(library.x + library.width).toBeLessThanOrEqual(queue.x + 1);
  await expect(page.locator(".dv-tabs-container", { has: tab(page, "Play queue") }).locator(".dv-tab")).toHaveText([
    "Play queue",
    "Lyrics",
  ]);
  await expect(widget(page, "nowPlaying")).toHaveCount(0);
  const bandBox = await band(page).boundingBox();
  expect(bandBox && bandBox.y + bandBox.height).toBeLessThanOrEqual(library.y);
}

test("DK-8: first start shows the default preset with the band at the top", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await expectDefaultPreset(page);
  expect((await box(page, "playlists")).width).toBeCloseTo(240 - 0, -1);
});

test("DK-9: each preset applies and keeps the Library mode", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await widget(page, "library").getByRole("button", { name: "Tree" }).click();
  await menuItem(page, "MusicBee style");
  const playlists = await box(page, "playlists");
  const nowPlaying = await box(page, "nowPlaying");
  const queue = await box(page, "queue");
  const library = await box(page, "library");
  expect(Math.abs(nowPlaying.x - playlists.x)).toBeLessThan(1);
  expect(nowPlaying.y).toBeGreaterThan(playlists.y);
  expect(queue.x).toBeGreaterThan(library.x);
  await expect(widget(page, "lyrics")).toHaveCount(0);
  await expect(page.locator("[data-library-body]")).toHaveAttribute("data-library-body", "tree");

  await menuItem(page, "Compact");
  for (const id of ["playlists", "queue", "lyrics", "nowPlaying"]) await expect(widget(page, id)).toHaveCount(0);
  await expect(widget(page, "library")).toBeVisible();
  await menuItem(page, "Apple Music classic");
  await expectDefaultPreset(page);
  await expect(page.locator("[data-library-body]")).toHaveAttribute("data-library-body", "tree");
});

test("DK-7: Reset layout after a drag restores the default preset", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  const library = await box(page, "library");
  await drag(page, await center(tab(page, "Playlists")), { x: library.x + library.width - 15, y: library.y + 200 });
  await expect.poll(async () => (await box(page, "playlists")).x).toBeGreaterThan(library.x);
  await menuItem(page, "Reset layout Ctrl+Shift+L");
  await expectDefaultPreset(page);
});
