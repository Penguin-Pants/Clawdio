// P23-AC4 to P23-AC6: bar widgets (R29.1, AC-26, AC-27, D57, D58). The mock keeps `layout.json`
// in session storage, so a reload is the restart.
import type { Page } from "@playwright/test";
import { center, closeMenu, drag, expect, group, openApp, openMenu, tab, test, widget } from "./test-base";

const HEADER = 32;

async function box(page: Page, id: string) {
  const value = await group(page, id).boundingBox();
  if (!value) throw new Error(`no group for ${id}`);
  return value;
}

/** The bar content's natural height (D57). */
function contentHeight(page: Page, id: string): Promise<number> {
  return page.locator(`[data-bar-content="${id}"]`).evaluate((element) => element.getBoundingClientRect().height);
}

/** The top drop zone of Library's content, just below its tab bar. */
async function libraryTop(page: Page): Promise<{ x: number; y: number }> {
  const body = await widget(page, "library").boundingBox();
  if (!body) throw new Error("no library");
  return { x: body.x + body.width / 2, y: body.y + 10 };
}

async function showWidget(page: Page, name: string): Promise<void> {
  await openMenu(page);
  await page.getByRole("menuitemcheckbox", { name, exact: true }).click();
  if (await page.getByRole("menu").isVisible()) await closeMenu(page);
}

/** Drags a header to a point and reports whether a drop overlay showed before the release. */
async function dragWithOverlay(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 10, from.y + 10, { steps: 5 });
  await page.mouse.move(to.x, to.y, { steps: 20 });
  const overlay = await page
    .locator(".dv-drop-target-selection, .dv-drop-target-anchor")
    .evaluateAll((elements) => elements.some((element) => element.getBoundingClientRect().width > 0));
  await page.mouse.up();
  return overlay;
}

test("P23-AC4: Transport controls dropped on the top of Library is a full-width bar; side and tab drops are refused (AC-26)", async ({
  page,
}) => {
  await openApp(page);
  const dock = await page.locator(".dv-dockview").first().boundingBox();
  if (!dock) throw new Error("no dock");
  await drag(page, await center(tab(page, "Transport controls")), await libraryTop(page));
  const transport = await box(page, "transport");
  const library = await box(page, "library");
  expect(Math.abs(transport.y - dock.y)).toBeLessThan(1);
  expect(Math.abs(transport.width - dock.width)).toBeLessThan(2);
  expect(Math.abs(transport.height - ((await contentHeight(page, "transport")) + HEADER))).toBeLessThanOrEqual(1);
  expect(library.y).toBeGreaterThanOrEqual(transport.y + transport.height - 1);

  // The bar's splitter does not change its height.
  const sash = page
    .locator(".dv-split-view-container.dv-vertical > .dv-sash-container > .dv-sash:not([data-frame-group] *)")
    .first();
  const sashBox = await sash.boundingBox();
  if (!sashBox) throw new Error("no splitter");
  await drag(page, { x: sashBox.x + 200, y: sashBox.y + 2 }, { x: sashBox.x + 200, y: sashBox.y + 120 });
  expect(Math.abs((await box(page, "transport")).height - transport.height)).toBeLessThan(1);

  // A drop on the left of Library shows no overlay and moves nothing.
  const left = { x: library.x + 15, y: library.y + library.height / 2 };
  expect(await dragWithOverlay(page, await center(tab(page, "Transport controls")), left)).toBe(false);
  expect(await box(page, "transport")).toEqual(transport);

  // A drop into the Library tab bar is refused.
  const libraryTabs = await group(page, "library").locator(".dv-tabs-and-actions-container").boundingBox();
  if (!libraryTabs) throw new Error("no tab bar");
  await drag(page, await center(tab(page, "Transport controls")), {
    x: libraryTabs.x + libraryTabs.width - 20,
    y: libraryTabs.y + libraryTabs.height / 2,
  });
  await expect(page.locator(".dv-tabs-container", { has: tab(page, "Library") }).locator(".dv-tab")).toHaveCount(1);
  expect(await box(page, "transport")).toEqual(transport);
});

test("P23-AC4: Transport controls dropped on the window top edge spans a side-by-side layout (D58)", async ({
  page,
}) => {
  await openApp(page);
  await showWidget(page, "Play queue");
  const queue = await box(page, "queue");
  const library = await box(page, "library");
  // Library and Play queue sit side by side, so no group top spans the dock.
  expect(Math.abs(queue.y - library.y)).toBeLessThan(1);
  const dock = await page.locator(".dv-dockview").first().boundingBox();
  if (!dock) throw new Error("no dock");
  await drag(page, await center(tab(page, "Transport controls")), { x: dock.x + dock.width / 2, y: dock.y + 3 });
  const transport = await box(page, "transport");
  expect(Math.abs(transport.y - dock.y)).toBeLessThan(1);
  expect(Math.abs(transport.width - dock.width)).toBeLessThan(2);
  expect(Math.abs(transport.height - ((await contentHeight(page, "transport")) + HEADER))).toBeLessThanOrEqual(1);
  expect((await box(page, "library")).y).toBeGreaterThanOrEqual(transport.y + transport.height - 1);
  expect((await box(page, "queue")).y).toBeGreaterThanOrEqual(transport.y + transport.height - 1);
});

test("P23-AC4: the two bar widgets share a row at the larger height; Play queue cannot join a bar group", async ({
  page,
}) => {
  await openApp(page);
  const nowPlaying = await box(page, "nowPlaying");
  const transport = await box(page, "transport");
  expect(Math.abs(nowPlaying.y - transport.y)).toBeLessThan(1);
  const tallest = Math.max(await contentHeight(page, "nowPlaying"), await contentHeight(page, "transport")) + HEADER;
  expect(Math.abs(nowPlaying.height - tallest)).toBeLessThanOrEqual(1);
  expect(Math.abs(transport.height - tallest)).toBeLessThanOrEqual(1);

  await showWidget(page, "Play queue");
  const bar = await group(page, "transport").locator(".dv-tabs-and-actions-container").boundingBox();
  if (!bar) throw new Error("no tab bar");
  await drag(page, await center(tab(page, "Play queue")), { x: bar.x + bar.width - 20, y: bar.y + bar.height / 2 });
  await expect(
    page.locator(".dv-tabs-container", { has: tab(page, "Transport controls") }).locator(".dv-tab"),
  ).toHaveCount(1);
  // Play queue beside Transport controls would split the bar row.
  const right = { x: transport.x + transport.width - 15, y: transport.y + transport.height / 2 };
  expect(await dragWithOverlay(page, await center(tab(page, "Play queue")), right)).toBe(false);
  expect(Math.abs((await box(page, "transport")).height - tallest)).toBeLessThanOrEqual(1);
});

test("P23-AC5: a saved layout with Transport controls in the Library tab group is repaired at start (AC-27)", async ({
  page,
}) => {
  await openApp(page);
  await showWidget(page, "Transport controls");
  await page.evaluate(() => window.e2e.addAsTab("transport", "library"));
  await expect
    .poll(async () => {
      const saved = JSON.parse((await page.evaluate(() => sessionStorage.getItem("e2e-layout"))) ?? "{}");
      return JSON.stringify(saved.dock?.grid ?? {}).includes('"library","transport"');
    })
    .toBe(true);
  await page.reload();
  await expect(widget(page, "library")).toBeVisible();
  await expect(page.locator(".dv-tabs-container", { has: tab(page, "Library") }).locator(".dv-tab")).toHaveCount(1);
  const nowPlaying = await box(page, "nowPlaying");
  const transport = await box(page, "transport");
  expect(Math.abs(transport.y - nowPlaying.y)).toBeLessThan(1);
  expect(transport.x).toBeGreaterThan(nowPlaying.x);
  expect(await page.evaluate(() => window.e2eLog ?? [])).toContainEqual(
    expect.stringContaining("moved transport to the bottom bar"),
  );
});

test("P23-AC5: a top bar survives a restart", async ({ page }) => {
  await openApp(page);
  const dock = await page.locator(".dv-dockview").first().boundingBox();
  if (!dock) throw new Error("no dock");
  await drag(page, await center(tab(page, "Transport controls")), await libraryTop(page));
  const before = await box(page, "transport");
  await expect
    .poll(async () => {
      const text = (await page.evaluate(() => sessionStorage.getItem("e2e-layout"))) ?? "";
      return text.indexOf('"transport"') < text.indexOf('"library"');
    })
    .toBe(true);
  await page.reload();
  await expect(widget(page, "transport")).toBeVisible();
  const after = await box(page, "transport");
  expect(Math.abs(after.y - before.y)).toBeLessThan(1);
  expect(Math.abs(after.height - before.height)).toBeLessThan(1);
  expect(await page.evaluate(() => window.e2eLog ?? [])).not.toContainEqual(expect.stringContaining("moved"));
});

for (const scale of ["100%", "125%", "140%"]) {
  test(`P23-AC6: bar content fits its bar at root font size ${scale} (D57)`, async ({ page }) => {
    await openApp(page);
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = size;
    }, scale);
    // The two bars share the default row, so both take the taller content (D57).
    await expect
      .poll(async () => {
        const tallest = Math.max(await contentHeight(page, "transport"), await contentHeight(page, "nowPlaying"));
        for (const id of ["transport", "nowPlaying"]) {
          const body = (await widget(page, id).boundingBox())?.height ?? 0;
          const empty = body - tallest;
          // The content does not overflow and leaves at most 4 px empty.
          if (empty < 0 || empty > 4 || (await contentHeight(page, id)) > body) return false;
        }
        return true;
      })
      .toBe(true);
  });
}
