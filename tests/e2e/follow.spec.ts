// P24-AC10 and P24-AC11 (R35, D63): the Songs list, the Tree song rows, the playlist view and
// the Play queue follow the playing song. The player moves through the mocked IPC, so no click
// moves the focus; the page clock passes the 5 s input rule (R35.5).
import type { Locator, Page } from "@playwright/test";
import { expect, openMenu, songsGrid, test, widget } from "./test-base";

const queue = (page: Page) => widget(page, "queue").getByRole("listbox", { name: "Play queue" });
const selectedRows = (list: Locator) => list.locator("[aria-selected='true']");
/** The first 50 songs: the queue of the test library. */
const FIFTY = Array.from({ length: 50 }, (_, id) => id);

function send(page: Page, command: string, args: Record<string, unknown> = {}) {
  return page.evaluate(([name, values]) => window.e2e.invoke(name, values), [command, args] as const);
}

/** Passes the 5 s after the last input in a list (R35.5). */
const idle = (page: Page) => page.clock.fastForward(5_100);

async function open(page: Page) {
  await page.clock.install();
  await page.goto("/?data=library");
  await expect(widget(page, "library").getByRole("option", { name: "Artist 00", exact: true })).toBeVisible();
  await expect(widget(page, "transport")).toContainText("Song 4 of Album A0");
}

const focused = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? null);

test("P24-AC10: Next moves both selections to the playing song, scrolls to it and keeps the focus", async ({
  page,
}) => {
  await open(page);
  await songsGrid(page)
    .getByRole("row", { name: /Song 2 of Album A0/ })
    .click();
  await queue(page).getByRole("option").nth(1).click();
  const before = await focused(page);
  expect(before).toBe("Play queue");
  await idle(page);
  // Song 46 is far down in both lists.
  await send(page, "player_play_list", { ids: FIFTY, start: 45 });
  for (const list of [songsGrid(page), queue(page)]) {
    await expect(selectedRows(list)).toHaveCount(1);
    await expect(selectedRows(list)).toContainText("Song 6 of Album B1");
    await expect(selectedRows(list)).toBeInViewport();
  }
  expect(await focused(page)).toBe(before);
  // R35.4: the focused list's active row is the playing row.
  const activeId = await queue(page).getAttribute("aria-activedescendant");
  await expect(selectedRows(queue(page))).toHaveAttribute("id", activeId ?? "none");
  await send(page, "player_next");
  await expect(selectedRows(songsGrid(page))).toContainText("Song 7 of Album B1");
  await expect(selectedRows(queue(page))).toContainText("Song 7 of Album B1");
  expect(await focused(page)).toBe(before);
});

test("P24-AC10: a multi-selection becomes the playing row; a list with no selection stays without one", async ({
  page,
}) => {
  await open(page);
  await send(page, "player_next");
  await expect(widget(page, "transport")).toContainText("Song 5 of Album A0");
  await expect(selectedRows(songsGrid(page))).toHaveCount(0);
  await expect(selectedRows(queue(page))).toHaveCount(0);
  await songsGrid(page)
    .getByRole("row", { name: /Song 2 of Album A0/ })
    .click();
  await songsGrid(page)
    .getByRole("row", { name: /Song 3 of Album A0/ })
    .click({ modifiers: ["ControlOrMeta"] });
  await expect(selectedRows(songsGrid(page))).toHaveCount(2);
  await idle(page);
  await send(page, "player_next");
  await expect(selectedRows(songsGrid(page))).toHaveCount(1);
  await expect(selectedRows(songsGrid(page))).toContainText("Song 6 of Album A0");
  await expect(selectedRows(queue(page))).toHaveCount(0);
});

test("P24-AC10: the queue follows the entry that plays, and a queue edit while stopped moves nothing", async ({
  page,
}) => {
  await open(page);
  await send(page, "player_play_list", { ids: [5, 5, 6], start: 0 });
  await queue(page).getByRole("option").nth(2).click();
  await idle(page);
  await send(page, "player_next");
  await expect(selectedRows(queue(page))).toHaveCount(1);
  await expect(queue(page).getByRole("option").nth(1)).toHaveAttribute("aria-selected", "true");
  await send(page, "player_stop");
  await send(page, "queue_remove", { index: 0 });
  await expect(queue(page).getByRole("option")).toHaveCount(2);
  await expect(queue(page).getByRole("option").nth(1)).toHaveAttribute("aria-selected", "true");
});

test("P24-AC10: Tree mode follows a song in another open album; Columns then shows its album", async ({ page }) => {
  await open(page);
  const library = widget(page, "library");
  await library.getByRole("button", { name: "Tree" }).click();
  const tree = library.getByRole("tree", { name: "Library" });
  await tree.getByRole("treeitem", { name: "Artist 00", exact: true }).click();
  await tree.getByRole("treeitem", { name: "Album A0", exact: true }).click();
  await tree.getByRole("treeitem", { name: "Album B0", exact: true }).click();
  await tree.getByRole("treeitem", { name: /Song 2 of Album A0/ }).click();
  await idle(page);
  await send(page, "player_play_list", { ids: FIFTY, start: 15 });
  // The song row and, as after a click on it, its album row.
  const songRows = tree.locator("[aria-level='3'][aria-selected='true']");
  await expect(songRows).toHaveCount(1);
  await expect(songRows).toContainText("Song 6 of Album B0");
  await expect(tree.getByRole("treeitem", { name: "Album B0", exact: true })).toHaveAttribute("aria-selected", "true");
  await library.getByRole("button", { name: "Columns" }).click();
  await expect(library.getByRole("listbox", { name: "Albums" }).getByRole("option", { selected: true })).toContainText(
    "Album B0",
  );
  await expect(selectedRows(songsGrid(page))).toContainText("Song 6 of Album B0");
});

/** Shows playlist `name` in the Library with the given entries (track ids). */
async function playlistWith(page: Page, id: number, name: string, tracks: number[]) {
  for (let entry = 0; entry < 6; entry += 1) await send(page, "playlist_remove_entry", { id, index: 0 });
  await send(page, "playlist_add", { id, tracks });
  await page.evaluate(() => window.e2e.show("playlists"));
  await widget(page, "playlists")
    .getByRole("option", { name: new RegExp(name) })
    .click();
  return widget(page, "library").getByRole("listbox", { name: `Songs in ${name}` });
}

test("P24-AC10: the playlist view follows the row that plays, also with a missing entry before it", async ({
  page,
}) => {
  await open(page);
  // [missing, A, A]: Mix 1 keeps its missing entry, then gets A twice.
  for (let entry = 0; entry < 5; entry += 1) await send(page, "playlist_remove_entry", { id: 0, index: 0 });
  await send(page, "playlist_add", { id: 0, tracks: [7, 7] });
  await page.evaluate(() => window.e2e.show("playlists"));
  await widget(page, "playlists").getByRole("option", { name: /Mix 1/ }).click();
  const view = widget(page, "library").getByRole("listbox", { name: "Songs in Mix 1" });
  await expect(view.getByRole("option")).toHaveCount(3);
  await view.getByRole("option").nth(1).dblclick();
  await view.getByRole("option").nth(0).click();
  await idle(page);
  await send(page, "player_next");
  await expect(view.getByRole("option").nth(2)).toHaveAttribute("aria-selected", "true");
  // A queue edit ends the follow by index, also when it restores the same sequence.
  await send(page, "player_previous");
  await expect(view.getByRole("option").nth(1)).toHaveAttribute("aria-selected", "true");
  await send(page, "queue_remove", { index: 1 });
  await send(page, "queue_append", { ids: [7] });
  await send(page, "player_next");
  await expect(widget(page, "transport")).toContainText("Song 8 of Album A0");
  await expect(view.getByRole("option").nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(view.getByRole("option").nth(2)).toHaveAttribute("aria-selected", "false");
});

test("P24-AC10: removing a row from the source playlist stops the view from following that queue", async ({ page }) => {
  await open(page);
  const view = await playlistWith(page, 1, "Mix 2", [20, 21, 21]);
  await expect(view.getByRole("option")).toHaveCount(3);
  await view.getByRole("option").nth(0).dblclick();
  await page.keyboard.press("Delete");
  await expect(view.getByRole("option")).toHaveCount(2);
  await expect(view.getByRole("option").nth(0)).toHaveAttribute("aria-selected", "true");
  await idle(page);
  await send(page, "player_next");
  await expect(widget(page, "transport")).toContainText("Song 2 of Album C0");
  await expect(view.getByRole("option").nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(view.getByRole("option").nth(1)).toHaveAttribute("aria-selected", "false");
});

test("P24-AC11: an open row menu, a dialog or a drag stops the follow; it follows at the next change", async ({
  page,
}) => {
  await open(page);
  const songs = songsGrid(page);
  await songs.getByRole("row", { name: /Song 2 of Album A0/ }).click();
  await queue(page).getByRole("option").nth(1).click();
  await idle(page);
  // Row menu.
  await queue(page).getByRole("option").nth(1).click({ button: "right" });
  await expect(page.getByRole("menu")).toBeVisible();
  await send(page, "player_next");
  await expect(selectedRows(songs)).toContainText("Song 2 of Album A0");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await idle(page);
  await send(page, "player_next");
  await expect(selectedRows(songs)).toContainText("Song 6 of Album A0");
  await expect(selectedRows(queue(page))).toContainText("Song 6 of Album A0");
  // Settings dialog.
  await openMenu(page);
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await send(page, "player_next");
  await expect(widget(page, "transport")).toContainText("Song 7 of Album A0");
  // The modal dialog hides the lists from role queries: check after it closes.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(selectedRows(songs)).toContainText("Song 6 of Album A0");
  // A row drag.
  const row = songs.getByRole("row", { name: /Song 6 of Album A0/ });
  const box = await row.boundingBox();
  if (!box) throw new Error("the row has no box");
  await page.mouse.move(box.x + 40, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + box.height * 3);
  await expect(page.locator("[data-slot='drag-ghost']")).toBeVisible();
  await idle(page);
  await send(page, "player_next");
  await expect(selectedRows(songs)).toContainText("Song 6 of Album A0");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await idle(page);
  await send(page, "player_next");
  await expect(selectedRows(songs)).toContainText("Song 9 of Album A0");
});

test("P24-AC11: a click, an arrow key or a wheel in the list holds the follow for 5 s", async ({ page }) => {
  await open(page);
  const songs = songsGrid(page);
  await songs.getByRole("row", { name: /Song 2 of Album A0/ }).click();
  await send(page, "player_next");
  await expect(widget(page, "transport")).toContainText("Song 5 of Album A0");
  await expect(selectedRows(songs)).toContainText("Song 2 of Album A0");
  await page.keyboard.press("ArrowDown");
  await idle(page);
  await songs.hover();
  await page.mouse.wheel(0, 40);
  // The wheel is input once it has scrolled the list.
  await expect.poll(() => songs.evaluate((list) => list.scrollTop)).toBeGreaterThan(0);
  await send(page, "player_next");
  await expect(widget(page, "transport")).toContainText("Song 6 of Album A0");
  await expect(selectedRows(songs)).toContainText("Song 3 of Album A0");
  await idle(page);
  await send(page, "player_next");
  await expect(selectedRows(songs)).toContainText("Song 7 of Album A0");
});

test("P24-AC11: a hidden song or a hidden selection leaves the Songs list as it is; Artist and Album never change", async ({
  page,
}) => {
  await open(page);
  const library = widget(page, "library");
  const songs = songsGrid(page);
  const artists = library.getByRole("listbox", { name: "Artists" });
  const albums = library.getByRole("listbox", { name: "Albums" });
  // Another artist: the playing song is not in the list.
  await artists.getByRole("option", { name: "Artist 05", exact: true }).click();
  await songs.getByRole("row", { name: /Song 2 of Album A5/ }).click();
  await idle(page);
  await send(page, "player_next");
  await expect(widget(page, "transport")).toContainText("Song 5 of Album A0");
  await expect(selectedRows(songs)).toContainText("Song 2 of Album A5");
  await expect(artists.getByRole("option", { selected: true })).toHaveText("Artist 05");
  // A search that hides the new song.
  await artists.getByRole("option", { name: "All", exact: true }).click();
  await songs.getByRole("row", { name: /Song 2 of Album A0/ }).click();
  await library.getByRole("searchbox", { name: "Search" }).fill("Song 2 of");
  await idle(page);
  await send(page, "player_next");
  await expect(widget(page, "transport")).toContainText("Song 6 of Album A0");
  await expect(selectedRows(songs).first()).toContainText("Song 2 of Album A0");
  // A search that hides the selected row but shows the new song: no change.
  await library.getByRole("searchbox", { name: "Search" }).fill("Song 7 of Album A0");
  await idle(page);
  await send(page, "player_next");
  await expect(widget(page, "transport")).toContainText("Song 7 of Album A0");
  await expect(selectedRows(songs)).toHaveCount(0);
  await expect(artists.getByRole("option", { selected: true })).toHaveText("All");
  await expect(albums.getByRole("option", { selected: true })).toHaveText("All");
});
