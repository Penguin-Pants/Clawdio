// U4: the Songs table (TB-2 to TB-11, PS-6, AX-1) on the mocked library. Top/bottom mode
// shows every column; Columns mode starts with Album hidden (UD8).
import type { Locator, Page } from "@playwright/test";
import { band, drag, expect, openMenu, closeMenu, SONG_ROWS, songsGrid, test, widget } from "./test-base";

async function openTable(page: Page, mode: "Columns" | "Top/bottom" = "Top/bottom") {
  await page.goto("/?data=library");
  await expect(widget(page, "library").getByRole("option", { name: "Artist 00", exact: true })).toBeVisible();
  if (mode !== "Columns") await setMode(page, mode);
  await expect(songsGrid(page).locator(SONG_ROWS).first()).toBeVisible();
}

const setMode = (page: Page, name: string) => widget(page, "library").getByRole("button", { name }).click();
const header = (page: Page, name: string) => songsGrid(page).getByRole("columnheader", { name, exact: true });
const headers = (page: Page) => songsGrid(page).getByRole("columnheader");
const rows = (page: Page) => songsGrid(page).locator(SONG_ROWS);
const divider = (page: Page, name: string) => header(page, name).locator("[data-slot='column-divider']");

async function width(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("no bounding box");
  return Math.round(box.width);
}

/** Drags a divider by `dx` px. */
async function dragDivider(page: Page, name: string, dx: number) {
  const box = await divider(page, name).boundingBox();
  if (!box) throw new Error("no divider");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 10 });
  await page.mouse.up();
}

async function headerMenu(page: Page, name: string): Promise<Locator> {
  await header(page, name).click({ button: "right" });
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  return menu;
}

/** The last queue request the app sent (`player_play_list`). */
async function lastPlay(page: Page): Promise<{ ids: number[]; start: number }> {
  return JSON.parse((await page.locator("body").getAttribute("data-play-list")) ?? "null");
}

test("TB-2: a divider drag resizes a column and never goes below its minimum", async ({ page }) => {
  await openTable(page);
  expect(await width(header(page, "Artist"))).toBe(160);
  await dragDivider(page, "Artist", 40);
  await expect.poll(() => width(header(page, "Artist"))).toBe(200);
  // The rows share the header template.
  expect(await width(rows(page).first().locator("[data-col='artist']"))).toBe(200);
  await dragDivider(page, "Artist", -400);
  await expect.poll(() => width(header(page, "Artist"))).toBe(80);
});

test("TB-3: a divider double-click and the header menu auto-size columns", async ({ page }) => {
  await openTable(page);
  await divider(page, "Album").dblclick();
  // The widest rendered Album name plus the padding, well under the 160 px default.
  await expect.poll(() => width(header(page, "Album"))).toBeLessThan(160);
  expect(await width(header(page, "Album"))).toBeGreaterThanOrEqual(80);
  await dragDivider(page, "Time", 100);
  await expect.poll(() => width(header(page, "Time"))).toBe(164);
  const menu = await headerMenu(page, "Time");
  for (const name of ["Auto size column", "Auto size all columns", "Move left", "Move right", "Reset columns"]) {
    await expect(menu.getByRole("menuitem", { name })).toBeVisible();
  }
  await expect(menu).toContainText("Auto size fits the rows in view");
  await menu.getByRole("menuitem", { name: "Auto size column" }).click();
  await expect.poll(() => width(header(page, "Time"))).toBeLessThan(164);
  await (await headerMenu(page, "Time")).getByRole("menuitem", { name: "Reset columns" }).click();
  await expect.poll(() => width(header(page, "Time"))).toBe(64);
  expect(await width(header(page, "Album"))).toBe(160);
});

test("TB-4: a header drag reorders columns and # never moves", async ({ page }) => {
  await openTable(page);
  await expect(headers(page)).toHaveText(["#", "Title", "Artist", "Album", "Time"]);
  const artist = await header(page, "Artist").boundingBox();
  const album = await header(page, "Album").boundingBox();
  if (!artist || !album) throw new Error("no header");
  await drag(
    page,
    { x: album.x + album.width / 2, y: album.y + album.height / 2 },
    { x: artist.x + 10, y: artist.y + 5 },
  );
  await expect(headers(page)).toHaveText(["#", "Title", "Album", "Artist", "Time"]);
  await expect(rows(page).first().getByRole("gridcell").nth(2)).toHaveAttribute("data-col", "album");
  // A drag of # changes nothing.
  const track = await header(page, "#").boundingBox();
  if (!track) throw new Error("no header");
  await drag(page, { x: track.x + track.width / 2, y: track.y + 5 }, { x: album.x + album.width, y: track.y + 5 });
  await expect(headers(page)).toHaveText(["#", "Title", "Album", "Artist", "Time"]);
  // A plain click after a drag still sorts.
  await header(page, "Album").click();
  await expect(header(page, "Album")).toHaveAttribute("aria-sort", "ascending");
});

test("TB-5: the header menu hides and shows columns; # and Title cannot hide", async ({ page }) => {
  await openTable(page);
  const menu = await headerMenu(page, "Album");
  await expect(menu.getByRole("menuitemcheckbox", { name: "# (track number)" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect(menu.getByRole("menuitemcheckbox", { name: "Title" })).toHaveAttribute("aria-disabled", "true");
  await menu.getByRole("menuitemcheckbox", { name: "Album" }).click();
  await expect(header(page, "Album")).toHaveCount(0);
  await expect(rows(page).first().locator("[data-col='album']")).toHaveCount(0);
  await page.keyboard.press("Escape");
  const again = await headerMenu(page, "Title");
  await expect(again.getByRole("menuitemcheckbox", { name: "Album" })).toHaveAttribute("aria-checked", "false");
  await again.getByRole("menuitemcheckbox", { name: "Album" }).click();
  await expect(header(page, "Album")).toBeVisible();
});

test("TB-6 and TB-7: Title takes the spare width, numbers align right, the header scrolls with the rows", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 800 });
  await openTable(page);
  expect(await width(header(page, "Title"))).toBeGreaterThan(240);
  await expect(header(page, "Time")).toHaveCSS("justify-content", "flex-end");
  await expect(rows(page).first().locator("[data-col='duration']")).toHaveCSS("justify-content", "flex-end");
  await expect(header(page, "Title")).toHaveCSS("justify-content", "normal");

  await page.setViewportSize({ width: 820, height: 700 });
  const grid = songsGrid(page);
  await expect.poll(() => grid.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  expect(await width(header(page, "Title"))).toBe(240);
  await grid.evaluate((element) => element.scrollTo(80, 200));
  const head = await header(page, "Artist").boundingBox();
  const cell = await rows(page).first().locator("[data-col='artist']").boundingBox();
  const box = await grid.boundingBox();
  if (!head || !cell || !box) throw new Error("no box");
  expect(Math.round(head.x)).toBe(Math.round(cell.x));
  // The header stays at the top of the scrolled grid.
  expect(Math.round(head.y)).toBe(Math.round(box.y));
});

test("TB-8: a header click sorts ascending, descending, then the default order", async ({ page }) => {
  await openTable(page);
  const title = header(page, "Title");
  await expect(title).toHaveAttribute("aria-sort", "none");
  await title.click();
  await expect(title).toHaveAttribute("aria-sort", "ascending");
  await expect(title.locator("svg")).toHaveCount(1);
  await expect(rows(page).first()).toContainText("Hold Up");
  await title.click();
  await expect(title).toHaveAttribute("aria-sort", "descending");
  await expect(rows(page).first()).toContainText("Sorry");
  await title.click();
  await expect(title).toHaveAttribute("aria-sort", "none");
  await expect(title.locator("svg")).toHaveCount(0);
  await expect(rows(page).first()).toContainText("Song 1 of Album A0");
  // Numbers sort by value: track 10 comes after track 9.
  await header(page, "#").click();
  await expect(rows(page).nth(1)).toContainText("Song 1 of Album B0");
});

test("TB-13: Shift+click adds a second sort key; the mock gets both keys and the badges show", async ({ page }) => {
  await openTable(page);
  await header(page, "Title").click();
  await songsGrid(page)
    .locator("[data-col-header='artist']")
    .click({ modifiers: ["Shift"] });
  await expect(page.locator("body")).toHaveAttribute(
    "data-last-sort",
    JSON.stringify([
      { column: "title", descending: false },
      { column: "artist", descending: false },
    ]),
  );
  await expect(songsGrid(page).locator("[data-col-header='title'] [data-slot='sort-rank']")).toContainText("1");
  await expect(songsGrid(page).locator("[data-col-header='artist'] [data-slot='sort-rank']")).toContainText("2");
  // aria-sort marks the first key only (one sorted column at a time).
  await expect(songsGrid(page).locator("[data-col-header='artist']")).toHaveAttribute("aria-sort", "none");
  // Shift+Enter on the second key flips it.
  await songsGrid(page).locator("[data-col-header='artist']").focus();
  await page.keyboard.press("Shift+Enter");
  await expect(page.locator("body")).toHaveAttribute("data-last-sort", /"artist","descending":true/);
  // A plain click goes back to one key.
  await songsGrid(page).locator("[data-col-header='album']").click();
  await expect(songsGrid(page).locator("[data-slot='sort-rank']")).toHaveCount(0);
});

test("TB-9 and PS-6: column state is per view, survives a reload and is apart from the layout", async ({ page }) => {
  await openTable(page);
  await dragDivider(page, "Artist", 40);
  await expect.poll(() => width(header(page, "Artist"))).toBe(200);
  await setMode(page, "Columns");
  // The Columns view keeps its own state: Album hidden, Artist at its default.
  await expect(header(page, "Album")).toHaveCount(0);
  expect(await width(header(page, "Artist"))).toBe(160);
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("e2e-columns"))).toContain('"artist":200');

  await page.reload();
  await expect(header(page, "Artist")).toBeVisible();
  await setMode(page, "Top/bottom");
  await expect.poll(() => width(header(page, "Artist"))).toBe(200);
  // Reset layout does not touch column state (PS-6).
  await page.keyboard.press("Control+Shift+L");
  await setMode(page, "Top/bottom");
  await expect.poll(() => width(header(page, "Artist"))).toBe(200);
  const saved = await page.evaluate(() => [
    sessionStorage.getItem("e2e-columns"),
    sessionStorage.getItem("e2e-layout"),
  ]);
  expect(JSON.parse(saved[0] ?? "{}")).toMatchObject({ version: 1, density: "regular" });
  expect(saved[1] ?? "").not.toContain("songs.topBottom");
});

test("PS-6: a bad columns file is backed up and the defaults stay", async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("e2e-columns.bak")) sessionStorage.setItem("e2e-columns", '{"version":9}');
  });
  await openTable(page);
  expect(await width(header(page, "Artist"))).toBe(160);
  await expect(page.locator("body")).toHaveAttribute("data-columns-backups", "1");
  expect(await page.evaluate(() => sessionStorage.getItem("e2e-columns.bak"))).toBe('{"version":9}');
  expect(await page.evaluate(() => window.e2eLog ?? [])).toContainEqual(expect.stringContaining("columns.json.bak"));
});

test("TB-10: click, Shift+click and Ctrl+click select; Enter plays the active row", async ({ page }) => {
  await openTable(page);
  await expect(songsGrid(page)).toHaveAttribute("aria-multiselectable", "true");
  await rows(page).nth(1).click();
  await rows(page)
    .nth(4)
    .click({ modifiers: ["Shift"] });
  await expect(songsGrid(page).locator("[role='row'][aria-selected='true']")).toHaveCount(4);
  await rows(page)
    .nth(7)
    .click({ modifiers: ["ControlOrMeta"] });
  await expect(songsGrid(page).locator("[role='row'][aria-selected='true']")).toHaveCount(5);
  await page.keyboard.press("Shift+ArrowDown");
  await expect(songsGrid(page).locator("[role='row'][aria-selected='true']")).toHaveCount(2);
  await page.keyboard.press("ArrowDown");
  await expect(songsGrid(page).locator("[role='row'][aria-selected='true']")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await lastPlay(page))?.start).toBe(9);
});

test("TB-10 and UD8: Shift+F10 on a row adds the song to Favorites", async ({ page }) => {
  await openTable(page);
  await page.evaluate(() => window.e2e.show("playlists"));
  await rows(page).nth(1).click();
  await page.keyboard.press("Shift+F10");
  await page.getByRole("menuitem", { name: "Add to Favorites" }).click();
  await expect(rows(page).nth(1).locator("[data-slot='row-heart']")).toHaveAttribute("data-favorite", "");
  // The closed menu gives focus back to the grid.
  await expect(songsGrid(page)).toBeFocused();
  await expect(
    widget(page, "playlists")
      .getByRole("tree")
      .getByRole("treeitem", { name: /Favorites/ }),
  ).toContainText("1");
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menuitem", { name: "Remove from Favorites" })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("TB-11: the playing row shows the playing icon in the # column", async ({ page }) => {
  await openTable(page);
  const playing = rows(page).filter({ hasText: "Song 4 of Album A0" });
  await expect(playing.locator("[data-col='track']")).toContainText("Playing");
  await expect(playing.locator("[data-col='track'] svg")).toHaveCount(1);
  await expect(rows(page).first().locator("[data-col='track']")).toHaveText("1");
});

test("AX-1: the header works by keyboard only", async ({ page }) => {
  await openTable(page);
  await songsGrid(page).focus();
  await page.keyboard.press("Tab");
  await expect(header(page, "#")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(header(page, "Artist")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(header(page, "Artist")).toHaveAttribute("aria-sort", "ascending");
  await page.keyboard.press("Shift+ArrowRight");
  await expect(headers(page)).toHaveText(["#", "Title", "Album", "Artist", "Time"]);
  await expect(header(page, "Artist")).toBeFocused();
  await page.keyboard.press("Control+ArrowRight");
  await expect.poll(() => width(header(page, "Artist"))).toBe(168);
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menu")).toContainText("Ctrl+← and Ctrl+→ resize");
  await page.keyboard.press("Escape");
  await expect(header(page, "Artist")).toBeFocused();
  await page.keyboard.press("End");
  await expect(header(page, "Time")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(songsGrid(page)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(songsGrid(page).locator("[role='row'][aria-selected='true']")).toHaveCount(1);
});

test("UD8: Tree mode shows no table header", async ({ page }) => {
  await openTable(page);
  await openMenu(page);
  await page.getByRole("menuitemradio", { name: "Tree" }).click();
  await closeMenu(page);
  await expect(widget(page, "library").getByRole("tree", { name: "Library" })).toBeVisible();
  await expect(widget(page, "library").getByRole("columnheader")).toHaveCount(0);
});

test("AX-1: Space on a header sorts, and Down then selects the first row of the new order", async ({ page }) => {
  await openTable(page);
  await songsGrid(page).focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("ArrowRight");
  await expect(header(page, "Title")).toBeFocused();
  await page.keyboard.press("Space");
  await expect(header(page, "Title")).toHaveAttribute("aria-sort", "ascending");
  await page.keyboard.press("Space");
  await expect(header(page, "Title")).toHaveAttribute("aria-sort", "descending");
  // Space sorted; it did not start playback.
  await expect(band(page).getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(songsGrid(page)).toBeFocused();
  await expect(songsGrid(page).locator(SONG_ROWS).first()).toHaveAttribute("aria-selected", "true");
});
