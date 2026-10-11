// P2-AC10: F6 and Shift+F6 cycle focus through visible widgets and skip hidden tabs.
import type { Page } from "@playwright/test";
import { expect, openApp, test, tokenRgb } from "./test-base";

async function focusedWidget(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.closest("[data-widget]")?.getAttribute("data-widget") ?? null);
}

test("P2-AC10: F6 and Shift+F6 cycle through visible widgets in reading order", async ({ page }) => {
  await openApp(page);
  const red = await tokenRgb(page, "--color-brand-red");
  const order = ["library", "nowPlaying", "transport"];
  for (const expected of [...order, order[0]]) {
    await page.keyboard.press("F6");
    expect(await focusedWidget(page)).toBe(expected);
    const ring = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement as Element);
      return { style: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor };
    });
    expect(ring).toEqual({ style: "solid", width: "2px", color: red });
  }
  await page.keyboard.press("Shift+F6");
  expect(await focusedWidget(page)).toBe("transport");
  await page.keyboard.press("Shift+F6");
  expect(await focusedWidget(page)).toBe("nowPlaying");
});

test("P2-AC10: a widget in a hidden tab is skipped", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => window.e2e.addAsTab("queue", "transport"));
  await page.locator(".dv-tab", { hasText: "Transport controls" }).click();
  const seen = new Set<string | null>();
  for (let index = 0; index < 6; index += 1) {
    await page.keyboard.press("F6");
    seen.add(await focusedWidget(page));
  }
  expect([...seen].sort()).toEqual(["library", "nowPlaying", "transport"]);
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
