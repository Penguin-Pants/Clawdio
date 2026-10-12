// P6-AC1 to P6-AC5, P6-AC7, P6-AC9 and P6-AC10: the Library widget on the mocked library.
import type { Locator, Page } from "@playwright/test";
import { grayProfile } from "./gray";
import { expect, test, widget } from "./test-base";

async function openLibrary(page: Page) {
  await page.goto("/?data=library");
  await expect(widget(page, "library").getByRole("option", { name: "Artist 00", exact: true })).toBeVisible();
}

const list = (page: Page, name: string) => widget(page, "library").getByRole("listbox", { name });
const tree = (page: Page) => widget(page, "library").getByRole("tree", { name: "Library" });
const mode = (page: Page, name: string) => widget(page, "library").getByRole("button", { name }).click();

/** The last queue request the app sent (`player_play_list`). */
async function lastPlay(page: Page): Promise<{ ids: number[]; start: number }> {
  const text = await page.locator("body").getAttribute("data-play-list");
  return JSON.parse(text ?? "null");
}

async function search(page: Page, text: string) {
  await widget(page, "library").getByRole("searchbox", { name: "Search" }).fill(text);
}

test("P6-AC1: each mode shows the library with All rows and filters", async ({ page }) => {
  await openLibrary(page);
  await expect(list(page, "Artists").getByRole("option").first()).toHaveText("All");
  await expect(list(page, "Albums").getByRole("option").first()).toHaveText("All");
  await expect(list(page, "Songs").getByRole("option").first()).toContainText("Song 1 of Album A0");
  await list(page, "Artists").getByRole("option", { name: "Artist 01", exact: true }).click();
  await expect(list(page, "Albums").getByRole("option")).toHaveCount(4);
  await list(page, "Albums")
    .getByRole("option", { name: /Album B1/ })
    .click();
  await expect(list(page, "Songs").getByRole("option")).toHaveCount(10);
  await expect(list(page, "Songs").getByRole("option").first()).toContainText("Song 1 of Album B1");

  await mode(page, "Top/bottom");
  await expect(list(page, "Songs").getByRole("option")).toHaveCount(10);
  await mode(page, "Tree");
  await expect(tree(page).getByRole("treeitem", { name: "Artist 00", exact: true })).toHaveAttribute("aria-level", "1");
});

test("P6-AC2: a mode switch keeps the selection and the search", async ({ page }) => {
  await openLibrary(page);
  await search(page, "Album C");
  await list(page, "Artists").getByRole("option", { name: "Artist 02", exact: true }).click();
  await list(page, "Albums")
    .getByRole("option", { name: /Album C2/ })
    .click();
  await list(page, "Songs")
    .getByRole("option", { name: /Song 4 of Album C2/ })
    .click();
  await mode(page, "Tree");
  await mode(page, "Columns");
  await expect(widget(page, "library").getByRole("searchbox", { name: "Search" })).toHaveValue("Album C");
  await expect(list(page, "Artists").getByRole("option", { name: "Artist 02", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(list(page, "Albums").getByRole("option", { name: /Album C2/ })).toHaveAttribute("aria-selected", "true");
  await expect(list(page, "Songs").getByRole("option", { name: /Song 4 of Album C2/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("P6-AC3: search folds accents, and the Tree rule shows whole albums on a name match", async ({ page }) => {
  await openLibrary(page);
  await search(page, "beyonce");
  await expect(list(page, "Artists").getByRole("option", { name: "Beyoncé", exact: true })).toBeVisible();
  await expect(list(page, "Artists").getByRole("option")).toHaveCount(2);

  await mode(page, "Tree");
  await search(page, "Lemonade");
  await tree(page).getByRole("treeitem", { name: "Beyoncé", exact: true }).click();
  await tree(page).getByRole("treeitem", { name: "Lemonade", exact: true }).click();
  await expect(tree(page).getByRole("treeitem", { level: 3 })).toHaveCount(3);
  await search(page, "hold");
  await expect(tree(page).getByRole("treeitem", { level: 3 })).toHaveCount(1);
  await expect(tree(page).getByRole("treeitem", { level: 3 })).toContainText("Hold Up");
});

test("P6-AC4: double-click and Enter play by the queue rule in each mode", async ({ page }) => {
  await openLibrary(page);
  await list(page, "Artists").getByRole("option", { name: "Artist 01", exact: true }).click();
  const songs = list(page, "Songs");
  await songs.getByRole("option", { name: /Song 3 of Album A1/ }).dblclick();
  let play = await lastPlay(page);
  expect(play.ids).toHaveLength(30);
  expect(play.ids[play.start]).toBe(32);

  await songs.getByRole("option", { name: /Song 5 of Album A1/ }).click();
  await songs.press("Enter");
  play = await lastPlay(page);
  expect(play.ids[play.start]).toBe(34);

  // An album row plays the album from its first song.
  await list(page, "Albums")
    .getByRole("option", { name: /Album B1/ })
    .dblclick();
  play = await lastPlay(page);
  expect(play).toEqual({ ids: [40, 41, 42, 43, 44, 45, 46, 47, 48, 49], start: 0 });

  // In Tree mode a song plays its album.
  await mode(page, "Tree");
  await tree(page).getByRole("treeitem", { name: "Artist 02", exact: true }).click();
  await tree(page).getByRole("treeitem", { name: "Album A2", exact: true }).click();
  await tree(page)
    .getByRole("treeitem", { name: /Song 2 of Album A2/ })
    .click();
  await tree(page).press("Enter");
  play = await lastPlay(page);
  expect(play).toEqual({ ids: [60, 61, 62, 63, 64, 65, 66, 67, 68, 69], start: 1 });
});

async function outlineOf(row: Locator): Promise<string> {
  return row.evaluate((element) => {
    const style = getComputedStyle(element);
    return `${style.outlineStyle} ${style.outlineWidth} ${style.outlineOffset}`;
  });
}

test("P6-AC5: arrow keys, Enter, Ctrl+F and Esc, with the active row outlined", async ({ page }) => {
  await openLibrary(page);
  const songs = list(page, "Songs");
  await songs.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  const active = songs.locator("[data-active]");
  await expect(active).toContainText("Song 2 of Album A0");
  await expect(active).toHaveAttribute("aria-selected", "true");
  expect(await outlineOf(active)).toBe("solid 2px -2px");
  await expect(songs).toHaveAttribute("aria-activedescendant", (await active.getAttribute("id")) ?? "missing");
  await page.keyboard.press("Enter");
  expect((await lastPlay(page)).start).toBe(1);

  // Scrolled away with the wheel, the active row stays the starting point.
  await songs.hover();
  await page.mouse.wheel(0, 3_000);
  await expect(songs.getByRole("option", { name: /Song 1 of Album A0/ })).toBeHidden();
  await page.keyboard.press("ArrowDown");
  await expect(songs.locator("[data-active]")).toContainText("Song 3 of Album A0");

  await page.keyboard.press("Control+f");
  const field = widget(page, "library").getByRole("searchbox", { name: "Search" });
  await expect(field).toBeFocused();
  await field.fill("Album B");
  await page.keyboard.press("Escape");
  await expect(field).toHaveValue("");
  await expect(list(page, "Artists")).toBeFocused();

  await mode(page, "Tree");
  const library = tree(page);
  // The tree opens the album of the song selected in Columns (P6-AC2).
  await expect(library.getByRole("treeitem", { name: /Song 3 of Album A0/ })).toHaveAttribute("aria-selected", "true");
  await library.focus();
  await page.keyboard.press("Home");
  const first = library.getByRole("treeitem", { name: "Artist 00", exact: true });
  await expect(first).toHaveAttribute("aria-selected", "true");
  // The earlier song selection opened this artist (P6-AC2); Left closes it.
  await expect(first).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(first).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("ArrowRight");
  await expect(first).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowRight");
  const album = library.getByRole("treeitem", { name: "Album A0", exact: true });
  await expect(album).toHaveAttribute("aria-selected", "true");
  await expect(album).toHaveAttribute("aria-level", "2");
  // Left closes an open album first, then moves to its artist.
  await expect(album).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(album).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("ArrowLeft");
  await expect(first).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(first).toHaveAttribute("aria-expanded", "false");
});

test("P6-AC7: a song with another tag artist shows both names", async ({ page }) => {
  await openLibrary(page);
  const row = list(page, "Songs").getByRole("option", { name: /Song 3 of Album A0/ });
  await expect(row).toContainText("Artist 00 feat. Guest");
  await expect(row).toContainText("Album A0");
});

test("P6-AC9: the selected row is identifiable in grayscale", async ({ page }) => {
  await openLibrary(page);
  await page.evaluate(() => {
    document.documentElement.style.filter = "grayscale(1)";
  });
  const songs = list(page, "Songs");
  await songs.getByRole("option", { name: /Song 2 of Album A0/ }).click();
  await page.mouse.move(0, 0);
  const selected = await grayProfile(page, songs.getByRole("option", { name: /Song 2 of Album A0/ }));
  const plain = await grayProfile(page, songs.getByRole("option", { name: /Song 4 of Album A0/ }));
  expect(selected.left - plain.left).toBeGreaterThan(100);
});

test("P6-AC10: Shift+F10 and the ContextMenu key open the menu of the active row", async ({ page }) => {
  await openLibrary(page);
  const songs = list(page, "Songs");
  await songs.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Shift+F10");
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Play", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(songs).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ContextMenu");
  await menu.getByRole("menuitem", { name: "Play", exact: true }).click();
  expect((await lastPlay(page)).start).toBe(1);
});

test("P6.4: the playing song shows the playing icon and label", async ({ page }) => {
  await openLibrary(page);
  const songs = list(page, "Songs");
  await expect(songs.getByRole("option", { name: /Playing.*Song 4 of Album A0/ })).toBeVisible();
  await expect(songs.getByRole("option", { name: /Song 5 of Album A0/ })).not.toContainText("Playing");
});

test("P6-AC2: a song selected under All shows selected in Tree", async ({ page }) => {
  await openLibrary(page);
  await list(page, "Songs")
    .getByRole("option", { name: /Song 2 of Album B0/ })
    .click();
  await mode(page, "Tree");
  const song = tree(page).getByRole("treeitem", { name: /Song 2 of Album B0/ });
  await expect(song).toHaveAttribute("aria-selected", "true");
  await tree(page).focus();
  await page.keyboard.press("ArrowDown");
  await expect(tree(page).getByRole("treeitem", { name: /Song 3 of Album B0/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("P6-AC4: in Tree a song plays its whole album, and Enter on an album row plays it", async ({ page }) => {
  await openLibrary(page);
  const albumIds = (album: number) => Array.from({ length: 10 }, (_, s) => album * 10 + s);
  // Columns: Enter on an album row plays the album from its first song.
  const albums = list(page, "Albums");
  await albums.getByRole("option", { name: /Album C0/ }).click();
  await albums.press("Enter");
  expect(await lastPlay(page)).toEqual({ ids: albumIds(2), start: 0 });

  // A search narrows the Tree, not the queue: the album plays whole (R6).
  await mode(page, "Tree");
  await search(page, "Song 7 of Album A1");
  // The search is debounced: wait for the filtered tree before a click opens a row.
  await expect(tree(page).getByRole("treeitem", { name: "Artist 00", exact: true })).toHaveCount(0);
  await tree(page).getByRole("treeitem", { name: "Artist 01", exact: true }).click();
  await tree(page).getByRole("treeitem", { name: "Album A1", exact: true }).click();
  await expect(tree(page).getByRole("treeitem", { level: 3 })).toHaveCount(1);
  await tree(page).getByRole("treeitem", { level: 3 }).dblclick();
  expect(await lastPlay(page)).toEqual({ ids: albumIds(3), start: 6 });
});

test("P6: a search that hides the selected artist selects All", async ({ page }) => {
  await openLibrary(page);
  await list(page, "Artists").getByRole("option", { name: "Artist 02", exact: true }).click();
  await search(page, "beyonce");
  await expect(list(page, "Artists").getByRole("option", { name: "All", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(list(page, "Songs").getByRole("option")).toHaveCount(3);
});

test("P6: right-click on a Tree row opens the menu without opening or closing the row", async ({ page }) => {
  await openLibrary(page);
  await mode(page, "Tree");
  await tree(page).getByRole("treeitem", { name: "Artist 00", exact: true }).click();
  const album = tree(page).getByRole("treeitem", { name: "Album A0", exact: true });
  await album.click({ button: "right" });
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(album).toHaveAttribute("aria-expanded", "false");
  await expect(album).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
});

test("P6-AC5: Ctrl+F reaches the search field when Library is a hidden tab", async ({ page }) => {
  await openLibrary(page);
  await page.evaluate(() => window.e2e.addAsTab("queue", "library"));
  await expect(widget(page, "library")).toBeHidden();
  await page.keyboard.press("Control+f");
  const field = widget(page, "library").getByRole("searchbox", { name: "Search" });
  await expect(field).toBeFocused();
});
