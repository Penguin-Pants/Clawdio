// Shared e2e setup: every test fails on a CSP violation (P2-AC18) or a page error.
import AxeBuilder from "@axe-core/playwright";
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
  await expect(page.locator('[data-widget="songs"]')).toBeVisible();
}

/** The widget body region. */
export function widget(page: Page, id: string): Locator {
  return page.locator(`[data-widget="${id}"]`);
}

/** The grid item of a widget: its header, body and resize handles (R38.2). */
export function gridItem(page: Page, id: string): Locator {
  return page.locator(`[data-grid-item="${id}"]`);
}

/** The header of a widget: the drag handle and the keyboard path (R38.4, R38.10). */
export function header(page: Page, id: string): Locator {
  return page.locator(`[data-widget-header="${id}"]`);
}

/** The cells of each widget in the grid, from the app's grid store. */
export function layoutOf(page: Page): Promise<Record<string, { x: number; y: number; w: number; h: number }>> {
  return page.evaluate(() => window.e2e.layout());
}

export async function openMenu(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
}

/** Waits until the open and close animations in the page have finished. */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(() => Promise.allSettled(document.getAnimations().map((animation) => animation.finished)));
}

/** Closes the open menu; Escape closes one level, so an open submenu takes a second press. */
export async function closeMenu(page: Page): Promise<void> {
  const menus = page.getByRole("menu");
  for (let open = await menus.count(); open > 0; open = await menus.count()) {
    await page.keyboard.press("Escape");
    await expect(menus).toHaveCount(open - 1);
  }
}

/** Opens the View submenu of the menu button (R38.7). */
export async function openViewMenu(page: Page): Promise<void> {
  await openMenu(page);
  await page.getByRole("menuitem", { name: "View" }).click();
  await expect(page.getByRole("menu")).toHaveCount(2);
}

/** Shows or hides a widget from the menu; does nothing when it already is that way. */
export async function setWidgetShown(page: Page, name: string, shown: boolean): Promise<void> {
  await openViewMenu(page);
  const item = page.getByRole("menuitemcheckbox", { name, exact: true });
  if ((await item.getAttribute("aria-checked")) !== String(shown)) await item.click();
  await closeMenu(page);
}

/** The body rows of the Songs table (UD8): the header row has no `aria-selected`. */
export const SONG_ROWS = "[role='row'][aria-selected]";

/** The Songs table of the Songs widget (a grid since U4). */
export function songsGrid(page: Page): Locator {
  return page.locator('[data-widget="songs"]').getByRole("grid", { name: "Songs" });
}

/** The transport band: the Transport controls widget, or the mini player (R38.2, UD19). */
export function band(page: Page): Locator {
  return page.locator("[data-band]");
}

/** Drags with the pointer from one point to another in small steps (the grid uses pointer events). */
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

/** No element has a non-zero transition or animation duration (reduced motion, P2-AC8, P17-AC3). */
export async function expectNoMotion(page: Page): Promise<void> {
  const moving = await page.evaluate(() =>
    [...document.querySelectorAll("*")]
      .filter((element) => {
        const style = getComputedStyle(element);
        const durations = `${style.transitionDuration},${style.animationDuration}`.split(",");
        return durations.some((value) => value.trim() !== "0s");
      })
      .map((element) => element.outerHTML.slice(0, 80)),
  );
  expect(moving).toEqual([]);
}

/** axe finds no serious or critical violation (P2-AC9, P17-AC1). */
export async function expectNoSeriousViolations(page: Page): Promise<void> {
  await settle(page);
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`);
  expect(serious).toEqual([]);
}

/**
 * The grid that holds the Library widgets (Search, Artist, Album, Songs, Tree; R38.3). The list
 * names are unique in it, so tests find a list without naming its widget.
 */
export function libraryArea(page: Page): Locator {
  return page.locator("[data-grid]");
}

/** Applies a preset from the menu: Default, Tree or Columns (R38.8). */
export async function preset(page: Page, name: "Default" | "Tree" | "Columns"): Promise<void> {
  await openMenu(page);
  await page.getByRole("menuitem", { name, exact: true }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
}
