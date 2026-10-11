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
