// P2-AC1, P2-AC2, P2-AC3, P2-AC17: default arrangement, drag docking, splitters, Library guard.
// The bar widgets keep a fixed height and refuse side and tab drops (R29.1), so these tests
// drag Play queue and Playlists.
import type { Page } from "@playwright/test";
import { center, closeMenu, drag, expect, group, openApp, openMenu, tab, test, tokenRgb, widget } from "./test-base";

/** The dock splitter between Library and the widget to its right (not a Library frame splitter). */
const dockSash = (page: Page) =>
  page
    .locator(".dv-split-view-container.dv-horizontal > .dv-sash-container > .dv-sash:not([data-frame-group] *)")
    .first();

/** A point on that splitter, away from its ends. */
async function sashPoint(page: Page): Promise<{ x: number; y: number }> {
  const box = await dockSash(page).boundingBox();
  if (!box) throw new Error("no splitter");
  return { x: box.x + box.width / 2, y: box.y + 100 };
}

async function showWidget(page: Page, name: string): Promise<void> {
  await openMenu(page);
  await page.getByRole("menuitemcheckbox", { name, exact: true }).click();
  if (await page.getByRole("menu").isVisible()) await closeMenu(page);
}

test("P2-AC1: first start shows Library above Now playing beside Transport controls", async ({ page }) => {
  await openApp(page);
  const library = await widget(page, "library").boundingBox();
  const nowPlaying = await widget(page, "nowPlaying").boundingBox();
  const transport = await widget(page, "transport").boundingBox();
  if (!library || !nowPlaying || !transport) throw new Error("missing widget");
  expect(nowPlaying.y).toBeGreaterThan(library.y + library.height - 1);
  expect(Math.abs(nowPlaying.y - transport.y)).toBeLessThan(1);
  expect(transport.x).toBeGreaterThan(nowPlaying.x);
  for (const id of ["playlists", "queue", "lyrics"]) await expect(widget(page, id)).toHaveCount(0);
  await openMenu(page);
  for (const name of ["Playlists", "Play queue", "Lyrics"]) {
    await expect(page.getByRole("menuitemcheckbox", { name })).toHaveAttribute("aria-checked", "false");
  }
  for (const name of ["Library", "Now playing", "Transport controls"]) {
    await expect(page.getByRole("menuitemcheckbox", { name })).toHaveAttribute("aria-checked", "true");
  }
});

test("P2-AC2: a header dragged to a widget edge docks there", async ({ page }) => {
  await openApp(page);
  await showWidget(page, "Play queue");
  const target = await widget(page, "library").boundingBox();
  if (!target) throw new Error("no library");
  await drag(page, await center(tab(page, "Play queue")), { x: target.x + 15, y: target.y + target.height / 2 });
  const library = await widget(page, "library").boundingBox();
  const queue = await widget(page, "queue").boundingBox();
  if (!library || !queue) throw new Error("missing widget");
  expect(queue.x + queue.width).toBeLessThanOrEqual(library.x + 1);
  expect(Math.abs(queue.y - library.y)).toBeLessThan(1);
});

test("P2-AC2: a header dropped on another tab bar forms a tabbed group", async ({ page }) => {
  await openApp(page);
  await showWidget(page, "Play queue");
  await showWidget(page, "Playlists");
  const bar = await group(page, "queue").locator(".dv-tabs-and-actions-container").boundingBox();
  if (!bar) throw new Error("no tab bar");
  await drag(page, await center(tab(page, "Playlists")), { x: bar.x + bar.width - 20, y: bar.y + bar.height / 2 });
  const tabs = page.locator(".dv-tabs-container", { has: tab(page, "Play queue") }).locator(".dv-tab");
  await expect(tabs).toHaveCount(2);
  await expect(tabs.filter({ hasText: "Playlists" })).toHaveCount(1);
});

test("P2-AC2: splitters resize and no float or pop-out command exists", async ({ page }) => {
  await openApp(page);
  await showWidget(page, "Play queue");
  const before = await widget(page, "library").boundingBox();
  const point = await sashPoint(page);
  await drag(page, point, { x: point.x - 120, y: point.y });
  const after = await widget(page, "library").boundingBox();
  if (!before || !after) throw new Error("no library");
  expect(after.width).toBeLessThan(before.width - 100);

  await tab(page, "Library").click({ button: "right" });
  await expect(page.locator(".dv-context-menu")).toHaveCount(0);
  await openMenu(page);
  await expect(page.getByRole("menuitem", { name: /float|pop/i })).toHaveCount(0);
  await expect(page.getByRole("menuitemcheckbox", { name: /float|pop/i })).toHaveCount(0);
});

test("P2-AC3: Library cannot be closed or hidden", async ({ page }) => {
  await openApp(page);
  const libraryTab = tab(page, "Library");
  await expect(libraryTab.getByRole("button")).toHaveCount(0);
  await libraryTab.focus();
  await page.keyboard.press("Delete");
  await page.keyboard.press("Backspace");
  await expect(widget(page, "library")).toHaveCount(1);
  await openMenu(page);
  const item = page.getByRole("menuitemcheckbox", { name: "Library" });
  await expect(item).toHaveAttribute("aria-disabled", "true");
  await item.click({ force: true });
  await expect(widget(page, "library")).toHaveCount(1);
});

test("P2-AC3: moving Library to an edge or into a tabbed group keeps exactly one Library", async ({ page }) => {
  await openApp(page);
  await showWidget(page, "Play queue");
  const queue = await widget(page, "queue").boundingBox();
  if (!queue) throw new Error("no queue");
  await drag(page, await center(tab(page, "Library")), {
    x: queue.x + queue.width - 15,
    y: queue.y + queue.height / 2,
  });
  await expect(widget(page, "library")).toHaveCount(1);
  const bar = await group(page, "queue").locator(".dv-tabs-and-actions-container").boundingBox();
  if (!bar) throw new Error("no tab bar");
  await drag(page, await center(tab(page, "Library")), { x: bar.x + bar.width - 20, y: bar.y + bar.height / 2 });
  await expect(tab(page, "Library")).toHaveCount(1);
  await expect(page.locator(".dv-tabs-container", { has: tab(page, "Play queue") }).locator(".dv-tab")).toHaveCount(2);
  await page.waitForTimeout(100);
  await expect(tab(page, "Library")).toHaveCount(1);
});

test("P2-AC17: splitter line on hover and drag, drop overlay with a red border on the active target", async ({
  page,
}) => {
  await openApp(page);
  await showWidget(page, "Play queue");
  const strong = await tokenRgb(page, "--color-border-strong");
  const red = await tokenRgb(page, "--color-brand-red");
  const sash = dockSash(page);
  const line = (property: string) =>
    sash.evaluate((element, name) => getComputedStyle(element, "::after").getPropertyValue(name), property);
  // "e-resize" or "w-resize" when a neighbor is at its minimum and the splitter moves one way.
  expect(["ew-resize", "e-resize", "w-resize"]).toContain(
    await sash.evaluate((element) => getComputedStyle(element).cursor),
  );
  const point = await sashPoint(page);
  await page.mouse.move(point.x, point.y);
  expect(await line("background-color")).toBe(strong);
  expect(await line("width")).toBe("1px");
  await page.mouse.down();
  await page.mouse.move(point.x - 5, point.y, { steps: 2 });
  expect(await line("width")).toBe("2px");
  expect(await line("background-color")).toBe(strong);
  await page.mouse.up();

  const from = await center(tab(page, "Play queue"));
  const target = await widget(page, "library").boundingBox();
  if (!target) throw new Error("no library");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 10, from.y + 10, { steps: 5 });
  await page.mouse.move(target.x + target.width - 15, target.y + target.height / 2, { steps: 20 });
  const overlays = page.locator(".dv-drop-target-selection, .dv-drop-target-anchor");
  await expect(overlays.first()).toBeVisible();
  const styles = await overlays.evaluateAll((elements) =>
    elements
      .filter((element) => element.getBoundingClientRect().width > 0)
      .map((element) => {
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, border: style.borderTopColor, width: style.borderTopWidth };
      }),
  );
  expect(styles.length).toBeGreaterThan(0);
  for (const style of styles) {
    expect(style.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(style.border).toBe(red);
    expect(style.width).toBe("2px");
  }
  await page.mouse.up();
});
