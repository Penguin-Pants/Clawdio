// R38.9 (DK-5): Lock layout stops moves and resizes; scrolling and show or hide still work; the
// lock survives a reload.
import type { Page } from "@playwright/test";
import { PRESETS } from "../../src/shell/presets";
import { center, closeMenu, drag, expect, header, layoutOf, openMenu, setWidgetShown, test, widget } from "./test-base";

async function setLocked(page: Page, locked: boolean) {
  await openMenu(page);
  const item = page.getByRole("menuitemcheckbox", { name: "Lock layout" });
  if ((await item.getAttribute("aria-checked")) !== String(locked)) await item.click();
  if (await page.getByRole("menu").count()) await closeMenu(page);
}

test("DK-5: with Lock layout on, drags change nothing; scrolling and show or hide still work", async ({ page }) => {
  await page.goto("/?data=library");
  await expect(widget(page, "artist").getByRole("option", { name: "Artist 00", exact: true })).toBeVisible();
  await setLocked(page, true);
  const from = await center(header(page, "nowPlaying"));
  await drag(page, from, { x: from.x - 300, y: from.y + 200 });
  expect(await layoutOf(page)).toEqual(PRESETS.default.layout);
  await expect(page.locator("[data-resize]")).toHaveCount(0);
  const songs = widget(page, "songs").getByRole("grid", { name: "Songs" });
  await songs.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await expect.poll(() => songs.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await setWidgetShown(page, "Playlists", false);
  await expect(widget(page, "playlists")).toHaveCount(0);
  await setWidgetShown(page, "Playlists", true);
  await expect(widget(page, "playlists")).toBeVisible();
});

test("DK-5: the lock state survives a reload, and unlocking restores drag", async ({ page }) => {
  await page.goto("/?data=library");
  await expect(widget(page, "songs")).toBeVisible();
  await setLocked(page, true);
  await expect
    .poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("e2e-layout") ?? "{}").locked))
    .toBe(true);
  await page.reload();
  await expect(widget(page, "songs")).toBeVisible();
  await openMenu(page);
  await expect(page.getByRole("menuitemcheckbox", { name: "Lock layout" })).toHaveAttribute("aria-checked", "true");
  await closeMenu(page);
  await setLocked(page, false);
  const from = await center(header(page, "nowPlaying"));
  await drag(page, from, { x: from.x, y: from.y + 150 });
  await expect.poll(async () => (await layoutOf(page)).nowPlaying.y).toBeGreaterThan(1);
});
