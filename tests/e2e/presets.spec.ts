// R38.8 (P29-AC3): Default at first start, the Tree and Columns presets, and Reset layout after
// a drag.
import type { Page } from "@playwright/test";
import { PRESETS } from "../../src/shell/presets";
import {
  closeMenu,
  drag,
  center,
  expect,
  cover,
  layoutOf,
  openApp,
  openMenu,
  test,
  widget,
  startArranging,
} from "./test-base";

async function menuItem(page: Page, name: string) {
  await openMenu(page);
  await page.getByRole("menuitem", { name, exact: true }).click();
  if (await page.getByRole("menu").count()) await closeMenu(page);
}

test("R38.8: first start shows Default with the band at the top and Now playing at the right", async ({ page }) => {
  await openApp(page);
  expect(await layoutOf(page)).toEqual(PRESETS.default.layout);
  const band = await widget(page, "transport").boundingBox();
  const songs = await widget(page, "songs").boundingBox();
  const art = await widget(page, "nowPlaying").boundingBox();
  expect(band && songs && band.y + band.height).toBeLessThanOrEqual(songs?.y ?? 0);
  expect(art && songs && art.y + art.height).toBeLessThanOrEqual((songs?.y ?? 0) + 1);
  await expect(widget(page, "tree")).toHaveCount(0);
});

test("R38.8: each preset applies its cells", async ({ page }) => {
  await openApp(page);
  await menuItem(page, "Tree");
  expect(await layoutOf(page)).toEqual(PRESETS.tree.layout);
  await expect(widget(page, "tree").getByRole("tree")).toBeVisible();
  await expect(widget(page, "artist")).toHaveCount(0);
  await menuItem(page, "Columns");
  expect(await layoutOf(page)).toEqual(PRESETS.columns.layout);
  const artist = await widget(page, "artist").boundingBox();
  const album = await widget(page, "album").boundingBox();
  const songs = await widget(page, "songs").boundingBox();
  expect(artist && album && artist.x < album.x).toBe(true);
  expect(album && songs && album.x < songs.x).toBe(true);
  await menuItem(page, "Default");
  expect(await layoutOf(page)).toEqual(PRESETS.default.layout);
});

test("R38.8: Reset layout after a drag restores Default", async ({ page }) => {
  await openApp(page);
  await startArranging(page);
  const from = await center(cover(page, "nowPlaying"));
  await drag(page, from, { x: from.x - 300, y: from.y + 150 });
  expect(await layoutOf(page)).not.toEqual(PRESETS.default.layout);
  await menuItem(page, "Reset layout Ctrl+Shift+L");
  expect(await layoutOf(page)).toEqual(PRESETS.default.layout);
});
