// P2-AC4, P2-AC5, P2-AC6, P2-AC12: menu path, layouts, Library header, minimum sizes and hints.
import type { Page } from "@playwright/test";
import { closeMenu, expect, group, openApp, openMenu, test, widget } from "./test-base";

const MINIMUMS: Record<string, { width: number; height: number }> = {
  library: { width: 320, height: 240 },
  transport: { width: 320, height: 88 },
  nowPlaying: { width: 240, height: 88 },
  playlists: { width: 200, height: 160 },
  queue: { width: 200, height: 160 },
  lyrics: { width: 200, height: 160 },
};

async function menuItem(page: Page, role: "menuitem" | "menuitemcheckbox" | "menuitemradio", name: string) {
  await openMenu(page);
  await page.getByRole(role, { name, exact: true }).click();
  if (await page.getByRole("menu").isVisible()) await closeMenu(page);
}

async function expectDefaultArrangement(page: Page) {
  await expect(widget(page, "library")).toHaveCount(1);
  await expect(widget(page, "nowPlaying")).toBeVisible();
  await expect(widget(page, "transport")).toBeVisible();
  for (const id of ["playlists", "queue", "lyrics"]) await expect(widget(page, id)).toHaveCount(0);
  const library = await widget(page, "library").boundingBox();
  const nowPlaying = await widget(page, "nowPlaying").boundingBox();
  const transport = await widget(page, "transport").boundingBox();
  if (!library || !nowPlaying || !transport) throw new Error("missing widget");
  expect(nowPlaying.y).toBeGreaterThan(library.y);
  expect(Math.abs(nowPlaying.y - transport.y)).toBeLessThan(1);
  expect(transport.x).toBeGreaterThan(nowPlaying.x);
}

test("P2-AC4: the menu shows and hides each hideable widget", async ({ page }) => {
  await openApp(page);
  const widgets: [string, string][] = [
    ["transport", "Transport controls"],
    ["nowPlaying", "Now playing"],
    ["playlists", "Playlists"],
    ["queue", "Play queue"],
    ["lyrics", "Lyrics"],
  ];
  for (const [id, name] of widgets) {
    const shown = (await widget(page, id).count()) > 0;
    await menuItem(page, "menuitemcheckbox", name);
    await expect(widget(page, id)).toHaveCount(shown ? 0 : 1);
    await menuItem(page, "menuitemcheckbox", name);
    await expect(widget(page, id)).toHaveCount(shown ? 1 : 0);
  }
});

test("P2-AC4: the menu switches the Library mode and applies each layout", async ({ page }) => {
  await openApp(page);
  const body = page.locator("[data-library-body]");
  await expect(body).toHaveAttribute("data-library-body", "columns");
  await menuItem(page, "menuitemradio", "Tree");
  await expect(body).toHaveAttribute("data-library-body", "tree");
  await menuItem(page, "menuitemradio", "Top/bottom");
  await expect(body).toHaveAttribute("data-library-body", "topBottom");

  const layouts: [string, string][] = [
    ["Tree", "tree"],
    ["Top/bottom", "topBottom"],
    ["Columns", "columns"],
  ];
  for (const [name, mode] of layouts) {
    await menuItem(page, "menuitemcheckbox", "Play queue");
    await menuItem(page, "menuitem", name);
    await expect(body).toHaveAttribute("data-library-body", mode);
    await expectDefaultArrangement(page);
  }
});

test("P2-AC4: Reset layout from the menu and from Ctrl+Shift+L restores the default", async ({ page }) => {
  await openApp(page);
  await menuItem(page, "menuitemcheckbox", "Lyrics");
  await menuItem(page, "menuitemcheckbox", "Transport controls");
  await menuItem(page, "menuitemradio", "Tree");
  await menuItem(page, "menuitem", "Reset layout Ctrl+Shift+L");
  await expectDefaultArrangement(page);
  await expect(page.locator("[data-library-body]")).toHaveAttribute("data-library-body", "columns");

  await menuItem(page, "menuitemcheckbox", "Playlists");
  await menuItem(page, "menuitemcheckbox", "Now playing");
  await menuItem(page, "menuitemradio", "Top/bottom");
  await page.locator("body").press("Control+Shift+L");
  await expectDefaultArrangement(page);
  await expect(page.locator("[data-library-body]")).toHaveAttribute("data-library-body", "columns");
});

test("P2-AC4: applying layouts 20 times leaves one Library panel", async ({ page }) => {
  await openApp(page);
  const names = ["Columns", "Tree", "Top/bottom"];
  for (let index = 0; index < 20; index += 1) await menuItem(page, "menuitem", names[index % 3]);
  await expect(widget(page, "library")).toHaveCount(1);
  await expect(page.locator(".dv-tab", { hasText: "Library" })).toHaveCount(1);
  await expectDefaultArrangement(page);
});

test("P2-AC5: the Library header holds the search field and the mode switch", async ({ page }) => {
  await openApp(page);
  const library = widget(page, "library");
  await expect(library.getByRole("searchbox", { name: "Search" })).toBeVisible();
  const toolbar = library.getByRole("group", { name: "Library mode" });
  await expect(toolbar.getByRole("button", { name: "Columns" })).toHaveAttribute("aria-pressed", "true");
  await library.getByRole("searchbox", { name: "Search" }).fill("abc");
  await toolbar.getByRole("button", { name: "Tree" }).click();
  await expect(page.locator("[data-library-body]")).toHaveAttribute("data-library-body", "tree");
  await expect(library.getByRole("searchbox", { name: "Search" })).toHaveValue("abc");
});

test("P2-AC5: below 360 px the mode switch is a dropdown that shows the current mode", async ({ page }) => {
  await page.setViewportSize({ width: 350, height: 700 });
  await openApp(page);
  const library = widget(page, "library");
  await expect(library.getByRole("group", { name: "Library mode" })).toHaveCount(0);
  const select = library.getByRole("combobox", { name: "Library mode" });
  await expect(select).toContainText("Columns");
  await library.getByRole("searchbox", { name: "Search" }).fill("xyz");
  await select.click();
  await page.getByRole("option", { name: "Top/bottom" }).click();
  await expect(select).toContainText("Top/bottom");
  await expect(page.locator("[data-library-body]")).toHaveAttribute("data-library-body", "topBottom");
  await expect(library.getByRole("searchbox", { name: "Search" })).toHaveValue("xyz");
  await page.setViewportSize({ width: 1200, height: 800 });
  await expect(
    library.getByRole("group", { name: "Library mode" }).getByRole("button", { name: "Top/bottom" }),
  ).toHaveAttribute("aria-pressed", "true");
});

async function expectMinimums(page: Page, ids: string[]) {
  for (const id of ids) {
    const box = await group(page, id).boundingBox();
    if (!box) throw new Error(`no group for ${id}`);
    expect(box.width, `${id} width`).toBeGreaterThanOrEqual(MINIMUMS[id].width - 1);
    expect(box.height, `${id} height`).toBeGreaterThanOrEqual(MINIMUMS[id].height - 1);
  }
}

async function expectFixedChrome(page: Page) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("no viewport");
  for (const locator of [page.locator("header"), page.getByRole("button", { name: "Menu" }), page.locator("footer")]) {
    await expect(locator).toBeInViewport({ ratio: 1 });
  }
}

test("P2-AC6: at 800 x 560 every visible widget keeps its minimum size", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 560 });
  await openApp(page);
  await expectMinimums(page, ["library", "nowPlaying", "transport"]);
  await expectFixedChrome(page);
  await menuItem(page, "menuitemcheckbox", "Play queue");
  await expectMinimums(page, ["library", "nowPlaying", "transport", "queue"]);
  await expectFixedChrome(page);
});

test("P2-AC6: six stacked widgets clamp: every header shows and the dock does not scroll", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 560 });
  await openApp(page);
  await page.evaluate(() => window.e2e.stackAll());
  const headers = page.locator(".dv-tabs-and-actions-container");
  await expect(headers).toHaveCount(6);
  for (const header of await headers.all()) await expect(header).toBeInViewport({ ratio: 1 });
  const dock = page.locator(".dv-dockview").first();
  const overflow = await dock.evaluate((element) => {
    const container = element.parentElement as HTMLElement;
    return {
      dockBottom: element.getBoundingClientRect().bottom,
      containerBottom: container.getBoundingClientRect().bottom,
      scroll: container.scrollHeight - container.clientHeight,
    };
  });
  expect(overflow.scroll).toBeLessThanOrEqual(0);
  expect(overflow.dockBottom).toBeLessThanOrEqual(overflow.containerBottom + 1);
  await expectFixedChrome(page);
});

test("P2-AC12: empty widgets show hints and Now playing shows the placeholder", async ({ page }) => {
  await openApp(page);
  for (const name of ["Playlists", "Play queue", "Lyrics"]) await menuItem(page, "menuitemcheckbox", name);
  await expect(widget(page, "queue")).toContainText("The queue is empty. Double-click a song to play it.");
  await expect(widget(page, "playlists")).toContainText("No playlists yet.");
  await expect(widget(page, "lyrics")).toContainText("No lyrics for this song.");
  await expect(widget(page, "nowPlaying")).toContainText("Nothing playing");
  await expect(widget(page, "nowPlaying").locator("[data-slot='art-placeholder-mark']")).toBeVisible();
  for (const button of await widget(page, "transport").getByRole("button").all()) await expect(button).toBeDisabled();
});
