// P2-AC1, P2-AC2, P2-AC3, P2-AC17: default arrangement, drag docking, splitters, Library guard.
import type { Page } from "@playwright/test";
import { center, drag, expect, group, openApp, openMenu, tab, test, tokenRgb, widget } from "./test-base";

/** A point on the splitter above the bottom row, away from the bottom row's own splitter. */
async function sashPoint(page: Page): Promise<{ x: number; y: number }> {
  const box = await page
    .locator(".dv-split-view-container.dv-vertical > .dv-sash-container > .dv-sash")
    .first()
    .boundingBox();
  if (!box) throw new Error("no splitter");
  return { x: box.x + 100, y: box.y + box.height / 2 };
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
  const target = await widget(page, "library").boundingBox();
  if (!target) throw new Error("no library");
  await drag(page, await center(tab(page, "Transport controls")), {
    x: target.x + target.width - 15,
    y: target.y + target.height / 2,
  });
  const library = await widget(page, "library").boundingBox();
  const transport = await widget(page, "transport").boundingBox();
  if (!library || !transport) throw new Error("missing widget");
  expect(transport.x).toBeGreaterThanOrEqual(library.x + library.width - 1);
  expect(Math.abs(transport.y - library.y)).toBeLessThan(1);
});

test("P2-AC2: a header dropped on another tab bar forms a tabbed group", async ({ page }) => {
  await openApp(page);
  const bar = await group(page, "transport").locator(".dv-tabs-and-actions-container").boundingBox();
  if (!bar) throw new Error("no tab bar");
  await drag(page, await center(tab(page, "Now playing")), { x: bar.x + bar.width - 20, y: bar.y + bar.height / 2 });
  const tabs = page.locator(".dv-tabs-container", { has: tab(page, "Transport controls") }).locator(".dv-tab");
  await expect(tabs).toHaveCount(2);
  await expect(tabs.filter({ hasText: "Now playing" })).toHaveCount(1);
});

test("P2-AC2: splitters resize and no float or pop-out command exists", async ({ page }) => {
  await openApp(page);
  const before = await widget(page, "library").boundingBox();
  const point = await sashPoint(page);
  await drag(page, point, { x: point.x, y: point.y - 120 });
  const after = await widget(page, "library").boundingBox();
  if (!before || !after) throw new Error("no library");
  expect(after.height).toBeLessThan(before.height - 100);

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
  const transport = await widget(page, "transport").boundingBox();
  if (!transport) throw new Error("no transport");
  await drag(page, await center(tab(page, "Library")), {
    x: transport.x + transport.width - 15,
    y: transport.y + transport.height / 2,
  });
  await expect(widget(page, "library")).toHaveCount(1);
  const bar = await group(page, "nowPlaying").locator(".dv-tabs-and-actions-container").boundingBox();
  if (!bar) throw new Error("no tab bar");
  await drag(page, await center(tab(page, "Library")), { x: bar.x + bar.width - 20, y: bar.y + bar.height / 2 });
  await expect(tab(page, "Library")).toHaveCount(1);
  await expect(page.locator(".dv-tabs-container", { has: tab(page, "Now playing") }).locator(".dv-tab")).toHaveCount(2);
  await page.waitForTimeout(100);
  await expect(tab(page, "Library")).toHaveCount(1);
});

test("P2-AC17: splitter line on hover and drag, drop overlay with a red border on the active target", async ({
  page,
}) => {
  await openApp(page);
  const strong = await tokenRgb(page, "--color-border-strong");
  const red = await tokenRgb(page, "--color-brand-red");
  const sash = page.locator(".dv-split-view-container.dv-vertical > .dv-sash-container > .dv-sash").first();
  const line = (property: string) =>
    sash.evaluate((element, name) => getComputedStyle(element, "::after").getPropertyValue(name), property);
  // "n-resize" when the row below is at its minimum and the splitter can only move up.
  expect(["ns-resize", "n-resize"]).toContain(await sash.evaluate((element) => getComputedStyle(element).cursor));
  const point = await sashPoint(page);
  await page.mouse.move(point.x, point.y);
  expect(await line("background-color")).toBe(strong);
  expect(await line("height")).toBe("1px");
  await page.mouse.down();
  await page.mouse.move(point.x, point.y - 5, { steps: 2 });
  expect(await line("height")).toBe("2px");
  expect(await line("background-color")).toBe(strong);
  await page.mouse.up();

  const from = await center(tab(page, "Transport controls"));
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
