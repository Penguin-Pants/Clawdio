// P9-AC2, P9-AC5, P9-AC9, P9-AC11 and R38.11 (P29-AC3): the arrangement survives a restart, an
// older or broken file is backed up. The mock keeps `layout.json` in session storage, so a
// reload is the restart.
import type { Page } from "@playwright/test";
import { PRESETS } from "../../src/shell/presets";
import { closeMenu, expect, layoutOf, openApp, openMenu, setWidgetShown, test, widget } from "./test-base";

async function saves(page: Page): Promise<number> {
  return Number((await page.locator("body").getAttribute("data-layout-saves")) ?? 0);
}

/** The widgets in the mock's saved `layout.json`. */
async function savedWidgets(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem("e2e-layout") ?? "{}").widgets ?? {});
}

async function preset(page: Page, name: string) {
  await openMenu(page);
  await page.getByRole("menuitem", { name, exact: true }).click();
  if (await page.getByRole("menu").count()) await closeMenu(page);
}

test("P9-AC2: a changed arrangement survives a restart", async ({ page }) => {
  await openApp(page);
  await expect.poll(() => page.evaluate(() => Boolean(window.e2e))).toBe(true);
  await preset(page, "Tree");
  await setWidgetShown(page, "Playlists", false);
  await setWidgetShown(page, "Lyrics", true);
  const layout = await layoutOf(page);
  await expect.poll(() => savedWidgets(page)).toEqual(layout);
  await page.reload();
  await expect(widget(page, "tree")).toBeVisible();
  expect(await layoutOf(page)).toEqual(layout);
  await expect(widget(page, "playlists")).toHaveCount(0);
});

test("P9-AC5: Reset layout restores Default after a restart with a saved layout", async ({ page }) => {
  await openApp(page);
  await preset(page, "Columns");
  await expect.poll(() => savedWidgets(page)).toEqual(PRESETS.columns.layout);
  await page.reload();
  await expect(widget(page, "songs")).toBeVisible();
  expect(await layoutOf(page)).toEqual(PRESETS.columns.layout);
  await page.keyboard.press("Control+Shift+L");
  expect(await layoutOf(page)).toEqual(PRESETS.default.layout);
});

test("P9-AC9: a layout saved at 1600 x 1000 fits an 800 x 560 window with the same cells", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page);
  await preset(page, "Columns");
  await expect.poll(() => savedWidgets(page)).toEqual(PRESETS.columns.layout);
  await page.setViewportSize({ width: 800, height: 560 });
  await page.reload();
  await expect(widget(page, "songs")).toBeVisible();
  expect(await layoutOf(page)).toEqual(PRESETS.columns.layout);
  for (const item of await page.locator("[data-grid-item]").all()) await expect(item).toBeInViewport({ ratio: 1 });
});

test("P9-AC11: a change and a close within 100 ms is saved before the window closes", async ({ page }) => {
  await openApp(page);
  await expect.poll(() => page.evaluate(() => Boolean(window.e2e))).toBe(true);
  const before = await saves(page);
  await page.evaluate(async () => {
    window.e2e.show("lyrics");
    await window.e2e.closeRequest();
  });
  await expect(page.locator("body")).toHaveAttribute("data-destroyed", "true");
  expect(await saves(page)).toBeGreaterThan(before);
  expect(await savedWidgets(page)).toHaveProperty("lyrics");
});

for (const [name, text] of [
  ["a version 2 file", JSON.stringify({ version: 2, libraryMode: "tree", dock: { panels: {} } })],
  ["a hand-corrupted file", '{"version": 3, "widgets": {'],
]) {
  test(`R38.11: ${name} starts with Default and is backed up once`, async ({ page }) => {
    await page.addInitScript((saved) => {
      if (sessionStorage.getItem("e2e-old-done")) return;
      sessionStorage.setItem("e2e-old-done", "1");
      sessionStorage.setItem("e2e-layout", saved);
    }, text);
    await openApp(page);
    expect(await layoutOf(page)).toEqual(PRESETS.default.layout);
    await expect(page.locator("body")).toHaveAttribute("data-layout-backups", "1");
    expect(await page.evaluate(() => sessionStorage.getItem("e2e-layout.bak"))).toBe(text);
    await expect
      .poll(() =>
        page.evaluate(() => (window.e2eLog ?? []).some((line) => line.includes("backed up as layout.json.bak"))),
      )
      .toBe(true);
  });
}
