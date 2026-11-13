// P2-AC10 and U1: F6 and Shift+F6 cycle focus through the visible widgets in grid order, and skip hidden ones.
import type { Page } from "@playwright/test";
import { expect, openApp, setWidgetShown, test, tokenRgb } from "./test-base";

async function focusedWidget(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.closest("[data-widget]")?.getAttribute("data-widget") ?? null);
}

test("P2-AC10: F6 visits the widgets top to bottom, then left to right; Shift+F6 runs back", async ({ page }) => {
  await openApp(page);
  const red = await tokenRgb(page, "--color-brand-red");
  const order = ["transport", "playlists", "search", "nowPlaying", "artist", "album", "songs"];
  for (const expected of [...order, order[0]]) {
    await page.keyboard.press("F6");
    expect(await focusedWidget(page)).toBe(expected);
    const ring = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement as Element);
      return { style: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor };
    });
    expect(ring).toEqual({ style: "solid", width: "2px", color: red });
  }
  for (const expected of ["songs", "album", "artist", "nowPlaying", "search", "playlists", "transport"]) {
    await page.keyboard.press("Shift+F6");
    expect(await focusedWidget(page)).toBe(expected);
  }
});

test("P2-AC10: a hidden widget is skipped and a shown one joins", async ({ page }) => {
  await openApp(page);
  const visit = async () => {
    const seen = new Set<string | null>();
    for (let index = 0; index < 9; index += 1) {
      await page.keyboard.press("F6");
      seen.add(await focusedWidget(page));
    }
    return [...seen].sort();
  };
  await setWidgetShown(page, "Artist", false);
  expect(await visit()).toEqual(["album", "nowPlaying", "playlists", "search", "songs", "transport"]);
  await setWidgetShown(page, "Lyrics", true);
  expect(await visit()).toContain("lyrics");
});

test("icon-only buttons show their tooltip on keyboard focus", async ({ page }) => {
  await openApp(page);
  await page.keyboard.press("Tab");
  const menu = page.getByRole("button", { name: "Menu" });
  await menu.focus();
  await expect(page.getByText("Menu", { exact: true }).last()).toBeVisible();
  // Keyboard only: WebKit shows focus-visible on a scripted focus only after keyboard input.
  await menu.press("Enter");
  const settings = page.getByRole("menuitem", { name: "Settings" });
  await expect(settings).toBeVisible();
  // The Menu tooltip would cover the open menu.
  await expect(page.getByText("Menu", { exact: true })).toHaveCount(0);
  for (let step = 0; step < 20 && (await settings.getAttribute("data-highlighted")) === null; step += 1) {
    await page.keyboard.press("ArrowDown");
  }
  await page.keyboard.press("Enter");
  const close = page.getByRole("dialog").getByRole("button", { name: "Close" });
  await close.focus();
  await expect(page.getByText("Close", { exact: true }).last()).toBeVisible();
});
