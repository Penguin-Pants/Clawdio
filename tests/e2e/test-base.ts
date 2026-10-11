// Shared e2e setup: every test fails on a CSP violation (P2-AC18) or a page error.
import { test as base, expect, type Locator, type Page } from "@playwright/test";

declare global {
  interface Window {
    cspViolations: string[];
  }
}

export const test = base.extend<{ guard: void }>({
  guard: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.addInitScript(() => {
        window.cspViolations = [];
        document.addEventListener("securitypolicyviolation", (event) => {
          window.cspViolations.push(`${event.violatedDirective} ${event.blockedURI}`);
        });
      });
      await use();
      // A skipped test never loads the app, so the list does not exist there.
      if (!page.isClosed()) expect((await page.evaluate(() => window.cspViolations)) ?? []).toEqual([]);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Opens the app and waits for the default arrangement. */
export async function openApp(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator('[data-widget="library"]')).toBeVisible();
}

/** The widget body region. */
export function widget(page: Page, id: string): Locator {
  return page.locator(`[data-widget="${id}"]`);
}

/** The dock tab of a widget, found by its title. */
export function tab(page: Page, title: string): Locator {
  return page.locator(".dv-tab", { hasText: title });
}

/** The group element that holds a widget. */
export function group(page: Page, id: string): Locator {
  return page.locator(".dv-groupview", { has: page.locator(`[data-widget="${id}"]`) });
}

export async function openMenu(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
}

/** Waits until the open and close animations in the page have finished. */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(() => Promise.allSettled(document.getAnimations().map((animation) => animation.finished)));
}

export async function closeMenu(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
}

/** Drags with the pointer from one point to another in small steps (the dock uses pointer drag). */
export async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 10, from.y + 10, { steps: 5 });
  await page.mouse.move(to.x, to.y, { steps: 20 });
  await page.mouse.up();
}

export async function center(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("no bounding box");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Token value of a CSS variable as an "rgb(r, g, b)" string, the format computed styles use. */
export async function tokenRgb(page: Page, variable: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement("div");
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  }, variable);
}
