// P2-AC1, P2-AC2, P2-AC3, P2-AC17 and U1-AC6 (DK-8): the default preset, drag docking,
// splitters and the Library guard.
import type { Page } from "@playwright/test";
import { band, center, drag, expect, group, openApp, openMenu, tab, test, tokenRgb, widget } from "./test-base";

const DOCK_SASHES = ".dv-split-view-container.dv-horizontal > .dv-sash-container > .dv-sash:not([data-frame-group] *)";

/** The dock splitter at the right edge of Library (not a Library frame splitter). */
async function dockSash(page: Page) {
  const library = await widget(page, "library").boundingBox();
  if (!library) throw new Error("no library");
  const edge = library.x + library.width;
  const sashes = page.locator(DOCK_SASHES);
  for (let index = 0; index < (await sashes.count()); index += 1) {
    const box = await sashes.nth(index).boundingBox();
    if (box && box.width > 0 && Math.abs(box.x + box.width / 2 - edge) < 6) return sashes.nth(index);
  }
  throw new Error("no splitter right of Library");
}

/** A point on that splitter, away from its ends. */
async function sashPoint(page: Page): Promise<{ x: number; y: number }> {
  const box = await (await dockSash(page)).boundingBox();
  if (!box) throw new Error("no splitter");
  return { x: box.x + box.width / 2, y: box.y + 100 };
}

test("U1-AC6, DK-8: first start shows Playlists left, Library center, Play queue and Lyrics tabbed right", async ({
  page,
}) => {
  await openApp(page);
  const playlists = await widget(page, "playlists").boundingBox();
  const library = await widget(page, "library").boundingBox();
  const queue = await widget(page, "queue").boundingBox();
  if (!playlists || !library || !queue) throw new Error("missing widget");
  expect(playlists.x + playlists.width).toBeLessThanOrEqual(library.x + 1);
  expect(library.x + library.width).toBeLessThanOrEqual(queue.x + 1);
  expect(Math.abs(playlists.y - library.y)).toBeLessThan(1);
  expect(Math.abs(queue.y - library.y)).toBeLessThan(1);
  // Lyrics is the inactive tab of the Play queue group; Now playing is hidden.
  const tabs = page.locator(".dv-tabs-container", { has: tab(page, "Play queue") }).locator(".dv-tab");
  await expect(tabs).toHaveText(["Play queue", "Lyrics"]);
  await expect(widget(page, "lyrics")).toBeHidden();
  await expect(widget(page, "nowPlaying")).toHaveCount(0);
  // The band is outside the dock (SH-2).
  await expect(page.locator(".dv-dockview [data-widget='transport']")).toHaveCount(0);
  await expect(band(page)).toBeVisible();
  await openMenu(page);
  for (const name of ["Library", "Playlists", "Play queue", "Lyrics"]) {
    await expect(page.getByRole("menuitemcheckbox", { name })).toHaveAttribute("aria-checked", "true");
  }
  await expect(page.getByRole("menuitemcheckbox", { name: "Now playing" })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("menuitemcheckbox", { name: "Transport controls" })).toHaveCount(0);
});

test("P2-AC2: a header dragged to a widget edge docks there", async ({ page }) => {
  await openApp(page);
  const target = await widget(page, "library").boundingBox();
  if (!target) throw new Error("no library");
  await drag(page, await center(tab(page, "Play queue")), { x: target.x + 15, y: target.y + target.height / 2 });
  const library = await widget(page, "library").boundingBox();
  const queue = await widget(page, "queue").boundingBox();
  if (!library || !queue) throw new Error("missing widget");
  expect(queue.x + queue.width).toBeLessThanOrEqual(library.x + 1);
  expect(Math.abs(queue.y - library.y)).toBeLessThan(1);
});

test("DK-3: Play queue docks on each window edge and on each edge of Library", async ({ page }) => {
  await openApp(page);
  const dock = await page.locator(".dv-dockview").first().boundingBox();
  if (!dock) throw new Error("no dock");
  // Window edges: the Dockview root drop target, a band along the dock edge.
  const edges: [string, { x: number; y: number }, (q: Box, d: Box) => boolean][] = [
    ["left", { x: dock.x + 4, y: dock.y + dock.height / 2 }, (q) => q.x <= dock.x + 1],
    [
      "right",
      { x: dock.x + dock.width - 4, y: dock.y + dock.height / 2 },
      (q) => q.x + q.width >= dock.x + dock.width - 1,
    ],
    ["top", { x: dock.x + dock.width / 2, y: dock.y + 4 }, (q) => q.y <= dock.y + 40],
    [
      "bottom",
      { x: dock.x + dock.width / 2, y: dock.y + dock.height - 4 },
      (q) => q.y + q.height >= dock.y + dock.height - 1,
    ],
  ];
  for (const [name, point, check] of edges) {
    await page.keyboard.press("Control+Shift+L");
    await drag(page, await center(tab(page, "Play queue")), point);
    const queue = await widget(page, "queue").boundingBox();
    if (!queue) throw new Error("no queue");
    expect(check(queue, dock), `window ${name}`).toBe(true);
  }
  // Library edges.
  for (const side of ["left", "right", "top", "bottom"] as const) {
    await page.keyboard.press("Control+Shift+L");
    const library = await widget(page, "library").boundingBox();
    if (!library) throw new Error("no library");
    const point = {
      left: { x: library.x + 20, y: library.y + library.height / 2 },
      right: { x: library.x + library.width - 20, y: library.y + library.height / 2 },
      top: { x: library.x + library.width / 2, y: library.y + 20 },
      bottom: { x: library.x + library.width / 2, y: library.y + library.height - 20 },
    }[side];
    await drag(page, await center(tab(page, "Play queue")), point);
    const queue = await widget(page, "queue").boundingBox();
    const after = await widget(page, "library").boundingBox();
    if (!queue || !after) throw new Error("missing widget");
    const ok = {
      left: queue.x + queue.width <= after.x + 1,
      right: queue.x >= after.x + after.width - 1,
      top: queue.y + queue.height <= after.y + 1,
      bottom: queue.y >= after.y + after.height - 1,
    }[side];
    expect(ok, `Library ${side}`).toBe(true);
  }
});

type Box = { x: number; y: number; width: number; height: number };

test("P2-AC2: a header dropped on another tab bar forms a tabbed group", async ({ page }) => {
  await openApp(page);
  const bar = await group(page, "queue").locator(".dv-tabs-and-actions-container").boundingBox();
  if (!bar) throw new Error("no tab bar");
  await drag(page, await center(tab(page, "Playlists")), { x: bar.x + bar.width - 20, y: bar.y + bar.height / 2 });
  const tabs = page.locator(".dv-tabs-container", { has: tab(page, "Play queue") }).locator(".dv-tab");
  await expect(tabs).toHaveCount(3);
  await expect(tabs.filter({ hasText: "Playlists" })).toHaveCount(1);
});

test("P2-AC2, DK-10: splitters resize and no pop-out command exists", async ({ page }) => {
  await openApp(page);
  const before = await widget(page, "library").boundingBox();
  const point = await sashPoint(page);
  await drag(page, point, { x: point.x - 120, y: point.y });
  const after = await widget(page, "library").boundingBox();
  if (!before || !after) throw new Error("no library");
  expect(after.width).toBeLessThan(before.width - 100);

  await tab(page, "Library").click({ button: "right" });
  await expect(page.locator(".dv-context-menu")).toHaveCount(0);
  await openMenu(page);
  await expect(page.getByRole("menuitem", { name: /pop/i })).toHaveCount(0);
  await expect(page.getByRole("menuitemcheckbox", { name: /pop/i })).toHaveCount(0);
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
  await expect(page.locator(".dv-tabs-container", { has: tab(page, "Play queue") }).locator(".dv-tab")).toHaveCount(3);
  await page.waitForTimeout(100);
  await expect(tab(page, "Library")).toHaveCount(1);
});

test("P2-AC17: splitter line on hover and drag, drop overlay with a red border on the active target", async ({
  page,
}) => {
  await openApp(page);
  const strong = await tokenRgb(page, "--color-border-strong");
  const red = await tokenRgb(page, "--color-brand-red");
  const sash = await dockSash(page);
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
