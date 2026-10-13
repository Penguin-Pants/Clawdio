// P9-AC2, P9-AC3, P9-AC5, P9-AC9 and P9-AC11: the arrangement survives a restart. The mock
// keeps `layout.json` in session storage, so a reload is the restart.
import type { Page } from "@playwright/test";
import { closeMenu, expect, group, openApp, openMenu, tab, test, widget } from "./test-base";

const MINIMUMS: Record<string, { width: number; height: number }> = {
  library: { width: 320, height: 240 },
  transport: { width: 320, height: 112 },
  nowPlaying: { width: 240, height: 112 },
  playlists: { width: 200, height: 160 },
  queue: { width: 200, height: 160 },
  lyrics: { width: 200, height: 160 },
};

async function toggleWidget(page: Page, name: string) {
  await openMenu(page);
  await page.getByRole("menuitemcheckbox", { name, exact: true }).click();
  if (await page.getByRole("menu").isVisible()) await closeMenu(page);
}

async function saves(page: Page): Promise<number> {
  return Number((await page.locator("body").getAttribute("data-layout-saves")) ?? 0);
}

/** The saved layout in the mock's `layout.json`. */
async function savedLayout(page: Page): Promise<{ libraryMode?: string; dock?: { panels: Record<string, unknown> } }> {
  return JSON.parse((await page.evaluate(() => sessionStorage.getItem("e2e-layout"))) ?? "{}");
}

/** Waits until the saved layout (500 ms after the last change) has these widgets and mode. */
async function savedWith(page: Page, widgets: string[], absent: string[] = [], mode?: string) {
  await expect
    .poll(async () => {
      const saved = await savedLayout(page);
      const panels = Object.keys(saved.dock?.panels ?? {});
      return (
        widgets.every((id) => panels.includes(id)) &&
        absent.every((id) => !panels.includes(id)) &&
        (mode === undefined || saved.libraryMode === mode)
      );
    })
    .toBe(true);
}

const modeButton = (page: Page, name: string) =>
  widget(page, "library").getByRole("group", { name: "Library mode" }).getByRole("button", { name });

for (const [mode, name] of [
  ["tree", "Tree"],
  ["columns", "Columns"],
  ["topBottom", "Top/bottom"],
] as const) {
  test(`P9-AC2: a changed arrangement in ${name} mode survives a restart`, async ({ page }) => {
    await openApp(page);
    await expect.poll(() => page.evaluate(() => Boolean(window.e2e))).toBe(true);
    await modeButton(page, name).click();
    await toggleWidget(page, "Transport controls");
    await toggleWidget(page, "Play queue");
    await savedWith(page, ["queue"], ["transport"], mode);
    const libraryWidth = (await group(page, "library").boundingBox())?.width;

    await page.reload();
    await expect(widget(page, "queue")).toBeVisible();
    await expect(page.locator("[data-library-body]")).toHaveAttribute("data-library-body", mode);
    await expect(modeButton(page, name)).toHaveAttribute("aria-pressed", "true");
    await expect(widget(page, "transport")).toHaveCount(0);
    expect((await group(page, "library").boundingBox())?.width).toBeCloseTo(libraryWidth ?? 0, -1);
  });
}

test("P9-AC3: a tabbed group survives a restart", async ({ page }) => {
  await openApp(page);
  // Bar widgets never join a tab group (R29.1), so Play queue joins Library.
  await page.evaluate(() => window.e2e.addAsTab("queue", "library"));
  await savedWith(page, ["queue"]);
  await page.reload();
  await expect(tab(page, "Play queue")).toBeVisible();
  // The same group element holds both tabs.
  const sameGroup = await page.evaluate(() => {
    const groupOf = (title: string) =>
      [...document.querySelectorAll(".dv-tab")]
        .find((element) => element.textContent?.includes(title))
        ?.closest(".dv-groupview");
    const queue = groupOf("Play queue");
    return queue !== undefined && queue !== null && queue === groupOf("Library");
  });
  expect(sameGroup).toBe(true);
});

test("P9-AC5: Reset layout restores the default after a restart with a saved layout", async ({ page }) => {
  await openApp(page);
  await toggleWidget(page, "Lyrics");
  await toggleWidget(page, "Transport controls");
  await savedWith(page, ["lyrics"], ["transport"]);
  await page.reload();
  await expect(widget(page, "lyrics")).toBeVisible();
  await page.keyboard.press("Control+Shift+L");
  await expect(widget(page, "lyrics")).toHaveCount(0);
  await expect(widget(page, "transport")).toBeVisible();
  await expect(widget(page, "nowPlaying")).toBeVisible();
});

test("P9-AC9: a layout saved at 1600 x 1000 fits an 800 x 560 window", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page);
  for (const name of ["Playlists", "Play queue", "Lyrics"]) await toggleWidget(page, name);
  await savedWith(page, ["playlists", "queue", "lyrics"]);
  await page.setViewportSize({ width: 800, height: 560 });
  await page.reload();
  await expect(widget(page, "lyrics")).toBeVisible();
  const applied = await page.evaluate(() => window.e2e.groupMinimums());
  for (const id of ["library", "nowPlaying", "transport", "playlists", "queue", "lyrics"]) {
    const box = await group(page, id).boundingBox();
    if (!box) throw new Error(`no group for ${id}`);
    // The dock applies the widget minimum, or the D45 clamp lowers it, never below 32 px.
    const minimum = applied[id];
    expect(minimum.width, `${id} applied width`).toBeGreaterThanOrEqual(32);
    expect(minimum.height, `${id} applied height`).toBeGreaterThanOrEqual(32);
    expect(minimum.width, `${id} applied width`).toBeLessThanOrEqual(MINIMUMS[id].width);
    expect(minimum.height, `${id} applied height`).toBeLessThanOrEqual(MINIMUMS[id].height);
    expect(box.width, `${id} width`).toBeGreaterThanOrEqual(minimum.width - 1);
    expect(box.height, `${id} height`).toBeGreaterThanOrEqual(minimum.height - 1);
    expect(box.x + box.width, `${id} right`).toBeLessThanOrEqual(801);
    expect(box.y + box.height, `${id} bottom`).toBeLessThanOrEqual(561);
  }
});

test("P9-AC11: a change and a close within 100 ms is saved before the window closes", async ({ page }) => {
  await openApp(page);
  await expect.poll(() => page.evaluate(() => Boolean(window.e2e))).toBe(true);
  const before = await saves(page);
  await page.evaluate(async () => {
    window.e2e.addAsTab("lyrics", "nowPlaying");
    await window.e2e.closeRequest();
  });
  await expect(page.locator("body")).toHaveAttribute("data-destroyed", "true");
  expect(await saves(page)).toBeGreaterThan(before);
  expect((await savedLayout(page)).dock?.panels).toHaveProperty("lyrics");
});
