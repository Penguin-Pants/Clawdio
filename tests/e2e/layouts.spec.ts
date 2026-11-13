// P2-AC4, P2-AC6, P2-AC12 on the snap grid (R38.7, R38.8): the menu path, the 800 x 560 window
// and the empty hints.
import type { Page } from "@playwright/test";
import { PRESETS } from "../../src/shell/presets";
import {
  band,
  closeMenu,
  expect,
  layoutOf,
  openApp,
  openMenu,
  openViewMenu,
  setWidgetShown,
  test,
  widget,
} from "./test-base";

async function menuItem(page: Page, name: string) {
  await openMenu(page);
  await page.getByRole("menuitem", { name, exact: true }).click();
  if (await page.getByRole("menu").count()) await closeMenu(page);
}

const HIDEABLE: [string, string][] = [
  ["search", "Search"],
  ["artist", "Artist"],
  ["album", "Album"],
  ["tree", "Tree"],
  ["playlists", "Playlists"],
  ["queue", "Play queue"],
  ["lyrics", "Lyrics"],
  ["nowPlaying", "Now playing"],
];

test("R38.7: the View menu hides and shows each hideable widget; Songs and Transport controls stay", async ({
  page,
}) => {
  await openApp(page);
  for (const [id, name] of HIDEABLE) {
    await setWidgetShown(page, name, false);
    await expect(widget(page, id)).toHaveCount(0);
    await setWidgetShown(page, name, true);
    await expect(widget(page, id)).toBeVisible();
  }
  await openViewMenu(page);
  for (const name of ["Songs", "Transport controls"]) {
    const item = page.getByRole("menuitemcheckbox", { name, exact: true });
    await expect(item).toHaveAttribute("aria-checked", "true");
    await expect(item).toHaveAttribute("aria-disabled", "true");
  }
  await closeMenu(page);
});

test("R38.8: Reset layout from the menu and from Ctrl+Shift+L applies Default", async ({ page }) => {
  await openApp(page);
  await menuItem(page, "Columns");
  expect(await layoutOf(page)).toEqual(PRESETS.columns.layout);
  await menuItem(page, "Reset layout Ctrl+Shift+L");
  expect(await layoutOf(page)).toEqual(PRESETS.default.layout);
  await menuItem(page, "Tree");
  await page.locator("body").press("Control+Shift+L");
  expect(await layoutOf(page)).toEqual(PRESETS.default.layout);
});

test("P2-AC6, R38.1: at 800 x 560 every widget is in view and nothing scrolls the page", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 560 });
  await openApp(page);
  for (const name of ["Play queue", "Lyrics", "Tree"]) await setWidgetShown(page, name, true);
  for (const locator of [
    page.locator("header"),
    page.getByRole("button", { name: "Menu" }),
    band(page),
    page.locator("footer"),
  ]) {
    await expect(locator).toBeInViewport({ ratio: 1 });
  }
  for (const item of await page.locator("[data-grid-item]").all()) await expect(item).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.scrollingElement?.scrollHeight)).toBe(560);
  // Each widget header shows.
  for (const header of await page.locator("[data-widget-header]").all()) await expect(header).toBeVisible();
});

test("P2-AC12: empty widgets show hints and Now playing shows the placeholder", async ({ page }) => {
  await openApp(page);
  await setWidgetShown(page, "Play queue", true);
  await setWidgetShown(page, "Lyrics", true);
  await expect(widget(page, "queue")).toContainText("The queue is empty. Double-click a song to play it.");
  await expect(widget(page, "playlists")).toContainText("No playlists yet.");
  await expect(widget(page, "lyrics")).toContainText("No lyrics for this song.");
  await expect(widget(page, "nowPlaying")).toContainText("Nothing playing");
  await expect(widget(page, "nowPlaying").locator("[data-slot='art-placeholder-mark']")).toBeVisible();
  // P4 enables Play and Stop once a music folder is set; P4-AC2 checks the disabled state without one.
  for (const name of ["Shuffle", "Previous", "Next", "Repeat"]) {
    await expect(band(page).getByRole("button", { name })).toBeDisabled();
  }
});
