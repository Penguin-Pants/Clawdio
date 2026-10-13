// U5 (TR-9, UD19): the mini player. The mock records `window_set_mini`; the test sizes the
// viewport as the Rust side sizes the window.
import type { Page } from "@playwright/test";
import { band, expect, test, widget } from "./test-base";

async function open(page: Page, rootPx = 16) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?data=library");
  await expect(widget(page, "library").getByRole("option", { name: "Artist 00", exact: true })).toBeVisible();
  await page.evaluate((px) => (document.documentElement.style.fontSize = `${px}px`), rootPx);
}

const calls = (page: Page) => page.evaluate(() => window.e2eMini ?? []);

async function enter(page: Page) {
  await band(page).getByRole("button", { name: "Mini player" }).click();
  const last = (await calls(page)).at(-1);
  if (!last?.on) throw new Error("no mini call");
  await page.setViewportSize({ width: 400, height: Math.round(last.height) });
  return last.height;
}

test("TR-9: the art enters the mini player with the compact band height and leaves it", async ({ page }) => {
  await open(page);
  expect(await enter(page)).toBe(40);
  await expect(page.locator("[data-shell]")).toHaveAttribute("data-mini", "");
  // Only the band shows: no header, no status line, the dock is inert and off screen.
  await expect(page.getByRole("button", { name: "Menu" })).toHaveCount(0);
  await expect(page.locator("[data-shell] > footer")).toHaveCount(0);
  await expect(page.locator("main")).toHaveAttribute("inert", "");
  await expect(band(page)).toHaveAttribute("data-size", /^(xs|sm)$/);
  await expect(band(page).getByRole("button", { name: /^(Play|Pause)$/ })).toBeVisible();
  // F6 has one region, the band.
  await page.keyboard.press("F6");
  await expect(page.locator(":focus")).toHaveAttribute("data-widget", "transport");
  await page.keyboard.press("F6");
  await expect(page.locator(":focus")).toHaveAttribute("data-widget", "transport");

  // The art is the exit button and it is inside the band-high window.
  const exit = band(page).getByRole("button", { name: "Exit mini player" });
  await expect(exit).toBeInViewport({ ratio: 1 });
  await exit.click();
  expect((await calls(page)).at(-1)?.on).toBe(false);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator("[data-shell]")).not.toHaveAttribute("data-mini", "");
  await expect(widget(page, "library")).toBeVisible();
  await expect(widget(page, "library").getByRole("option", { name: "Artist 00", exact: true })).toBeVisible();
});

for (const [scale, px] of [
  ["125%", 20],
  ["140%", 22.4],
] as const) {
  test(`TR-9: at ${scale} text the height grows and the band does not clip`, async ({ page }) => {
    await open(page, px);
    const height = await enter(page);
    expect(height).toBeCloseTo(2.5 * px, 1);
    // Every control lies inside the band box: nothing is cut off.
    const outside = await band(page).evaluate((element) => {
      const box = element.getBoundingClientRect();
      return [...element.querySelectorAll("button, [role='slider'], [data-slot='now-playing']")]
        .map((child) => child.getBoundingClientRect())
        .filter((rect) => rect.top < box.top - 0.5 || rect.bottom > box.bottom + 0.5).length;
    });
    expect(outside).toBe(0);
  });
}

test("TR-9: the More menu item also leaves the mini player", async ({ page }) => {
  await open(page);
  await enter(page);
  // The menu item works; in a real band-high window the art is the visible path.
  await page.setViewportSize({ width: 400, height: 400 });
  await band(page).getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Exit mini player" }).click();
  expect((await calls(page)).at(-1)?.on).toBe(false);
});

test("TR-9: the Layout menu also enters the mini player", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("menuitem", { name: "Transport bar" }).click();
  await page.getByRole("menuitem", { name: "Mini player" }).click();
  expect((await calls(page)).at(-1)).toEqual({ on: true, height: 40 });
});
