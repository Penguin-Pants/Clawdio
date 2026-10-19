// P25-AC3 to P25-AC6 (R36, AC-30, D65): type-to-find in each list, on the mocked IPC with the
// "?find=1" names. The page clock makes the 1 s reset (R36.3) and the 5 s follow rule exact.
import type { Locator, Page } from "@playwright/test";
import { drag, expect, songsGrid, test, widget } from "./test-base";

const library = (page: Page) => widget(page, "library");
const artists = (page: Page) => library(page).getByRole("listbox", { name: "Artists" });
const albums = (page: Page) => library(page).getByRole("listbox", { name: "Albums" });
const queue = (page: Page) => widget(page, "queue").getByRole("listbox", { name: "Play queue" });
const playlists = (page: Page) => widget(page, "playlists").getByRole("listbox", { name: "Playlists" });
const view = (page: Page, name: string) => library(page).getByRole("listbox", { name: `Songs in ${name}` });
const selected = (list: Locator) => list.locator("[aria-selected='true']");

/** More than the 1 s reset (R36.3). */
const pause = (page: Page) => page.clock.fastForward(1_100);

function send(page: Page, command: string, args: Record<string, unknown> = {}) {
  return page.evaluate(([name, values]) => window.e2e.invoke(name, values), [command, args] as const);
}

const status = async (page: Page) => ((await send(page, "player_state")) as { status: string }).status;

async function open(page: Page) {
  await page.clock.install();
  await page.goto("/?data=library&find=1");
  await expect(artists(page).getByRole("option", { name: "Artist 00", exact: true })).toBeVisible();
}

/** A row that is not rendered (virtualized) or not in the viewport. */
async function outOfView(row: Locator) {
  if ((await row.count()) > 0) await expect(row).not.toBeInViewport();
}

/** Types `text` after a pause, so it starts a new typed text. */
async function typeNew(page: Page, text: string) {
  await pause(page);
  await page.keyboard.type(text);
}

/**
 * The AC-30 sequence in one list: "z" selects the first Z row and scrolls it into view, "zz top"
 * selects the ZZ Top row and does not toggle playback, "zzx" changes nothing, focus stays. The
 * Playlists list is short, so its Z row is in view at the start (`fromOutOfView` false).
 */
async function zzTop(page: Page, list: Locator, firstZ: RegExp, zz: RegExp, fromOutOfView = true) {
  await expect(list).toBeFocused();
  if (fromOutOfView) await outOfView(list.locator("[data-row]").filter({ hasText: firstZ }));
  await typeNew(page, "z");
  await expect(selected(list)).toHaveCount(1);
  await expect(selected(list)).toHaveAccessibleName(firstZ);
  await expect(selected(list)).toBeInViewport();
  const before = await status(page);
  await typeNew(page, "zz top");
  await expect(selected(list)).toHaveAccessibleName(zz);
  await expect(selected(list)).toBeInViewport();
  expect(await status(page)).toBe(before);
  await typeNew(page, "zzx");
  await expect(selected(list)).toHaveAccessibleName(zz);
  await expect(list).toBeFocused();
  // R25: the active row is the selected row.
  await expect(selected(list)).toHaveAttribute("id", (await list.getAttribute("aria-activedescendant")) ?? "none");
}

test("P25-AC4, AC-30: the Artist list finds Z and ZZ Top, filters the Album list and never selects All", async ({
  page,
}) => {
  await open(page);
  await artists(page).focus();
  // Down 22 times from All: Chemical Brothers, after Artist 00 to 19 and Beyoncé.
  for (let step = 0; step < 22; step++) await page.keyboard.press("ArrowDown");
  await expect(selected(artists(page))).toHaveAccessibleName("Chemical Brothers");
  await zzTop(page, artists(page), /^Zapp$/, /^ZZ Top$/);
  // The new selection filters the Album list, as Down does (R36.7).
  await expect(albums(page).getByRole("option")).toHaveText(["All", /ZZ Top's First Album/]);
  await typeNew(page, "a");
  await expect(selected(artists(page))).toHaveAccessibleName("Artist 00");
});

test("P25-AC4: the Album list finds Z and ZZ Top and filters the Songs table", async ({ page }) => {
  await open(page);
  await albums(page).focus();
  await zzTop(page, albums(page), /^Zapp II/, /^ZZ Top's First Album/);
  await expect(songsGrid(page).getByRole("row", { name: /Brown Sugar/ })).toBeVisible();
  await typeNew(page, "a");
  await expect(selected(albums(page))).toHaveAccessibleName(/^Album A0/);
});

test("P25-AC4: the Songs table finds by Title, a match leaves one row selected, and a sort column decides", async ({
  page,
}) => {
  await open(page);
  const grid = songsGrid(page);
  await grid.getByRole("row", { name: /Song 1 of Album A0/ }).click();
  await grid.getByRole("row", { name: /Song 3 of Album A0/ }).click({ modifiers: ["Shift"] });
  await expect(selected(grid)).toHaveCount(3);
  await zzTop(page, grid, /Zoom/, /ZZ Top Boogie/);
  // With a column sort, the first sort key's column is the name (R36.5).
  await grid.getByRole("columnheader", { name: "Artist", exact: true }).click();
  await expect(grid.getByRole("columnheader", { name: "Artist", exact: true })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  await grid.focus();
  await typeNew(page, "b");
  await expect(selected(grid)).toHaveAccessibleName(/Pray You Catch Me/);
  await typeNew(page, "zz top");
  await expect(selected(grid)).toHaveAccessibleName(/ZZ Top Boogie/);
  await expect(selected(grid)).toBeInViewport();
  await typeNew(page, "z");
  await expect(selected(grid)).toHaveAccessibleName(/Zoom/);
  await expect(grid).toBeFocused();
});

test("P25-AC4: the playlist view, the Play queue and the Playlists list find Z and ZZ Top", async ({ page }) => {
  await open(page);
  await playlists(page)
    .getByRole("option", { name: /Find mix/ })
    .click();
  await view(page, "Find mix").getByRole("option").nth(1).click();
  // The missing first entry "Zzz" has no title and never matches (R36.5).
  await zzTop(page, view(page, "Find mix"), /Zoom/, /ZZ Top Boogie/);
  await library(page).getByRole("button", { name: "Library" }).click();
  // The button puts the focus in the search field a frame later (AX-1): wait for it.
  await expect(library(page).getByRole("searchbox", { name: "Search" })).toBeFocused();

  await queue(page).focus();
  await zzTop(page, queue(page), /Zoom/, /ZZ Top Boogie/);

  await playlists(page).focus();
  await zzTop(page, playlists(page), /^Zapp jams/, /^ZZ Top hits/, false);
  // A match shows the playlist in the Library, as Down does (R36.7).
  await expect(view(page, "ZZ Top hits")).toBeVisible();
});

test("P25-AC3: Space toggles playback with no typed text, joins an active text and sorts on a column header", async ({
  page,
}) => {
  await open(page);
  await artists(page).focus();
  const before = await status(page);
  await page.keyboard.press("Space");
  await expect.poll(() => status(page)).not.toBe(before);
  await typeNew(page, "zz");
  await page.keyboard.press("Space");
  await page.keyboard.type("top");
  await expect(selected(artists(page))).toHaveAccessibleName("ZZ Top");
  expect(await status(page)).not.toBe(before);
  const title = songsGrid(page).getByRole("columnheader", { name: "Title", exact: true });
  await title.focus();
  await page.keyboard.press("Space");
  await expect(title).toHaveAttribute("aria-sort", "ascending");
});

test("P25-AC5: in Tree mode a find reaches a shown song out of view and does not open a collapsed node", async ({
  page,
}) => {
  await open(page);
  await library(page).getByRole("button", { name: "Tree" }).click();
  const tree = library(page).getByRole("tree", { name: "Library" });
  // The active row: a selected song also marks its album row selected (R28).
  const active = tree.locator("[data-active]");
  await tree.focus();
  await typeNew(page, "zz");
  await expect(active).toHaveAccessibleName(/ZZ Top/);
  // Right opens the artist, Right again goes to its album, Right opens the album.
  for (let step = 0; step < 3; step++) await page.keyboard.press("ArrowRight");
  await expect(tree.getByRole("treeitem", { name: /Brown Sugar/ })).toBeVisible();
  await page.keyboard.press("Home");
  await outOfView(tree.getByRole("treeitem", { name: /Brown Sugar/ }));
  await typeNew(page, "brown");
  await expect(active).toHaveAccessibleName(/Brown Sugar/);
  await expect(active).toBeInViewport();
  // "Setting Sun" is in the collapsed Chemical Brothers node: no find and no node opens
  // (R36.5, R36.8). No shown row starts with "s".
  await typeNew(page, "setting");
  await expect(active).toHaveAccessibleName(/Brown Sugar/);
  await expect(tree.getByRole("treeitem", { name: /Setting Sun/ })).toHaveCount(0);
  await expect(tree.getByRole("treeitem", { name: "Chemical Brothers" })).toHaveAttribute("aria-expanded", "false");
  await expect(tree).toBeFocused();
});

test("P25-AC5: the narrow Playlists icon rail selects nothing on typed keys", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page);
  const sash = page.getByRole("separator", { name: "Resize Playlists and Library" });
  const box = await sash.boundingBox();
  if (!box) throw new Error("no separator");
  await drag(page, { x: box.x + box.width / 2, y: box.y + 200 }, { x: box.x - 120, y: box.y + 200 });
  const rail = widget(page, "playlists").getByRole("navigation", { name: "Playlists" });
  await expect(rail).toBeVisible();
  await rail.getByRole("button", { name: "Find mix" }).focus();
  await typeNew(page, "z");
  await expect(library(page).getByRole("listbox", { name: /^Songs in/ })).toHaveCount(0);
  await expect(rail.getByRole("button", { name: "Find mix" })).toBeFocused();
});

test("P25-AC5: with Playlists a tab of the Library group, a match shows the playlist and focuses it", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => {
    window.e2e.hide("playlists");
    window.e2e.addAsTab("playlists", "library");
  });
  await playlists(page).focus();
  // As for Down, the focus moves to the playlist view (R36.7, R12 v1.9).
  await typeNew(page, "z");
  await expect(view(page, "Zapp jams")).toBeVisible();
  await expect(view(page, "Zapp jams")).toBeFocused();
});

test("P25-AC5: an open row menu or dialog, a row drag and an empty list take no find", async ({ page }) => {
  await open(page);
  // Row menu: the keys go to the menu.
  await artists(page).focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menu")).toBeVisible();
  await typeNew(page, "z");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(selected(artists(page))).toHaveAccessibleName("Artist 00");
  // Dialog: the keys go to the dialog.
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await typeNew(page, "z");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(selected(artists(page))).toHaveAccessibleName("Artist 00");
  // Row drag: the list keeps focus, but typed keys do not move the selection.
  const grid = songsGrid(page);
  const row = grid.getByRole("row", { name: /Song 2 of Album A0/ });
  await row.click();
  const start = await row.boundingBox();
  if (!start) throw new Error("no row");
  await page.mouse.move(start.x + 40, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + 60, start.y + 40, { steps: 6 });
  await expect(page.locator("[data-slot='drag-ghost']")).toBeVisible();
  await typeNew(page, "z");
  await page.mouse.move(start.x + 40, start.y + start.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(selected(grid)).toHaveAccessibleName(/Song 2 of Album A0/);
  // Empty list: a search with no result leaves only All.
  await library(page).getByRole("searchbox", { name: "Search" }).fill("qqqq");
  await expect(artists(page).getByRole("option")).toHaveText(["All"]);
  await artists(page).focus();
  await typeNew(page, "a");
  await expect(selected(artists(page))).toHaveAccessibleName("All");
});

test("P25-AC6: a typed character is input for the selection follow: no follow for 5 s", async ({ page }) => {
  await open(page);
  const grid = songsGrid(page);
  await grid.getByRole("row", { name: /Song 2 of Album A0/ }).click();
  await page.clock.fastForward(5_100);
  await page.keyboard.type("z");
  await expect(selected(grid)).toHaveAccessibleName(/Zoom/);
  // The playing song changes within 5 s of the typed key: the list does not follow (R35.5).
  await page.clock.fastForward(1_000);
  await send(page, "player_play_list", { ids: [45, 46], start: 0 });
  await expect(widget(page, "transport")).toContainText("Song 6 of Album B1");
  await expect(selected(grid)).toHaveAccessibleName(/Zoom/);
  // After 5 s with no input it follows again.
  await page.clock.fastForward(5_100);
  await send(page, "player_next");
  await expect(selected(grid)).toHaveAccessibleName(/Song 7 of Album B1/);
});
