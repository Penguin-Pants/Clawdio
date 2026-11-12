// P26-AC3 to P26-AC5 (R37, AC-31): the saved Library selection restores at startup. The mocked
// `library_selection_restored` answers from "?restore=artist,album,song" ("-" for "All" or no
// song). Ids in the test library: Artist 15 is 15, its Album B15 is 46, and "Song 7 of Album
// B15" is 466 (album id * 10 + track - 1).
import type { Locator, Page } from "@playwright/test";
import { expect, songsGrid, test, widget } from "./test-base";

const library = (page: Page) => widget(page, "library");
const list = (page: Page, name: string) => library(page).getByRole("listbox", { name });
const option = (page: Page, listName: string, name: string) =>
  list(page, listName).getByRole("option", { name, exact: true });
const selected = (locator: Locator) => locator.locator("[aria-selected='true']");
const tree = (page: Page) => library(page).getByRole("tree", { name: "Library" });

/** Opens the library app with a restore answer, after an optional saved Library mode. */
async function open(page: Page, restore: string | null, mode?: "Tree" | "Top/bottom") {
  if (mode) {
    await page.goto("/?data=library");
    await library(page).getByRole("button", { name: mode }).click();
    const value = mode === "Tree" ? "tree" : "topBottom";
    await expect
      .poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("e2e-layout") ?? "{}").libraryMode))
      .toBe(value);
  }
  await page.goto(`/?data=library${restore === null ? "" : `&restore=${restore}`}`);
}

const focused = (page: Page) =>
  page.evaluate(() => {
    const element = document.activeElement;
    return element ? `${element.tagName}:${element.getAttribute("aria-label") ?? ""}` : null;
  });

test("P26-AC3: a saved artist, album and song restore as selected and in view in Columns mode", async ({ page }) => {
  await open(page, "15,46,466");
  await expect(selected(list(page, "Artists"))).toHaveText("Artist 15");
  await expect(option(page, "Artists", "Artist 15")).toBeInViewport();
  await expect(selected(list(page, "Albums"))).toContainText("Album B15");
  await expect(selected(songsGrid(page))).toHaveCount(1);
  await expect(selected(songsGrid(page))).toContainText("Song 7 of Album B15");
  await expect(selected(songsGrid(page))).toBeInViewport();
  // The restore's own change is saved back as the same ids (R37.2).
  await expect
    .poll(() => page.evaluate(() => document.body.dataset.selectionSave))
    .toBe(JSON.stringify({ artist: 15, album: 46, song: 466 }));
});

test("P26-AC3: a restored album and a restored song out of view scroll into view", async ({ page }) => {
  await open(page, "-,46,-");
  await expect(selected(list(page, "Artists"))).toHaveText("All");
  await expect(selected(list(page, "Albums"))).toContainText("Album B15");
  await expect(selected(list(page, "Albums"))).toBeInViewport();
  // "All" in both lists: the song is far down the full Songs table.
  await open(page, "-,-,466");
  await expect(selected(list(page, "Artists"))).toHaveText("All");
  await expect(selected(list(page, "Albums"))).toHaveText("All");
  await expect(selected(songsGrid(page))).toContainText("Song 7 of Album B15");
  await expect(selected(songsGrid(page))).toBeInViewport();
});

test("P26-AC3: keyboard focus is where it is at a start with no saved selection", async ({ page }) => {
  await open(page, null);
  await expect(option(page, "Artists", "Artist 00")).toBeVisible();
  const plain = await focused(page);
  await open(page, "15,46,466");
  await expect(selected(songsGrid(page))).toContainText("Song 7 of Album B15");
  expect(await focused(page)).toBe(plain);
});

test("P26-AC3: the restore applies when the event follows a pending answer", async ({ page }) => {
  await open(page, "pending");
  await expect(option(page, "Artists", "Artist 00")).toBeVisible();
  await expect(selected(list(page, "Artists"))).toHaveText("All");
  await page.evaluate(() =>
    window.e2e.selectionRestored({ kind: "selection", selection: { artist: 15, album: 46, song: 466 } }),
  );
  await expect(selected(songsGrid(page))).toContainText("Song 7 of Album B15");
});

test("P26-AC3: a user selection while the reply is in flight stays, and a folder change stops the answer", async ({
  page,
}) => {
  await page.addInitScript(() => (window.e2eHoldRestore = true));
  await open(page, "15,46,466");
  await option(page, "Artists", "Artist 01").click();
  await page.evaluate(() => window.e2eReleaseRestore?.());
  await expect(selected(list(page, "Artists"))).toHaveText("Artist 01");
  await expect(selected(songsGrid(page))).toHaveCount(0);
  // A new music folder answers none: a later answer does not apply.
  await open(page, "pending");
  await expect(option(page, "Artists", "Artist 00")).toBeVisible();
  await page.evaluate(async () => {
    await window.e2e.selectionRestored({ kind: "none" });
    await window.e2e.selectionRestored({ kind: "selection", selection: { artist: 15, album: null, song: null } });
  });
  await expect(selected(list(page, "Artists"))).toHaveText("All");
});

test("P26-AC3: with a saved Top/bottom mode the restore applies in that mode", async ({ page }) => {
  await open(page, "15,46,466", "Top/bottom");
  await expect(library(page).getByRole("button", { name: "Top/bottom" })).toHaveAttribute("aria-pressed", "true");
  await expect(selected(list(page, "Artists"))).toHaveText("Artist 15");
  await expect(option(page, "Artists", "Artist 15")).toBeInViewport();
  await expect(selected(songsGrid(page))).toContainText("Song 7 of Album B15");
});

/** The tree rows that are open. */
const expanded = (page: Page) => tree(page).locator("[aria-expanded='true']");

test("P26-AC4: Tree mode opens a restored song's artist and album only, and shows the row", async ({ page }) => {
  await open(page, "15,46,466", "Tree");
  const song = tree(page).getByRole("treeitem", { name: /Song 7 of Album B15/ });
  await expect(song).toHaveAttribute("aria-selected", "true");
  await expect(song).toBeInViewport();
  await expect(expanded(page)).toHaveCount(2);
  await expect(expanded(page).nth(0)).toContainText("Artist 15");
  await expect(expanded(page).nth(1)).toContainText("Album B15");
});

test("P26-AC4: Tree mode opens a restored album and its artist, or a restored artist alone", async ({ page }) => {
  await open(page, "15,46,-", "Tree");
  const album = tree(page).getByRole("treeitem", { name: "Album B15", exact: true });
  await expect(album).toHaveAttribute("aria-selected", "true");
  await expect(album).toBeInViewport();
  await expect(expanded(page)).toHaveCount(2);
  await open(page, "15,-,-");
  const artist = tree(page).getByRole("treeitem", { name: "Artist 15", exact: true });
  await expect(artist).toHaveAttribute("aria-selected", "true");
  await expect(artist).toBeInViewport();
  await expect(expanded(page)).toHaveCount(1);
  await expect(expanded(page)).toContainText("Artist 15");
});

test("P26-AC4: a restore that resolves after the tree has loaded opens the nodes too", async ({ page }) => {
  await open(page, "pending", "Tree");
  await expect(tree(page).getByRole("treeitem", { name: "Artist 00", exact: true })).toBeVisible();
  await expect(expanded(page)).toHaveCount(0);
  await page.evaluate(() =>
    window.e2e.selectionRestored({ kind: "selection", selection: { artist: 15, album: 46, song: 466 } }),
  );
  const song = tree(page).getByRole("treeitem", { name: /Song 7 of Album B15/ });
  await expect(song).toHaveAttribute("aria-selected", "true");
  await expect(song).toBeInViewport();
  await expect(expanded(page)).toHaveCount(2);
});

test("P26-AC5: a restored song follows the next song change at once", async ({ page }) => {
  // The test queue plays "Song 4 of Album A0" (id 3) paused.
  await open(page, "0,0,3");
  await expect(selected(songsGrid(page))).toContainText("Song 4 of Album A0");
  await page.evaluate(() => window.e2e.invoke("player_next"));
  await expect(selected(songsGrid(page))).toContainText("Song 5 of Album A0");
});

test("P26-AC5: Reset layout keeps the selection; the search text is not restored", async ({ page }) => {
  await open(page, "15,46,466");
  await expect(selected(songsGrid(page))).toContainText("Song 7 of Album B15");
  await expect(library(page).getByRole("searchbox")).toHaveValue("");
  await page.keyboard.press("Control+Shift+L");
  await expect(selected(list(page, "Artists"))).toHaveText("Artist 15");
  await expect(selected(songsGrid(page))).toContainText("Song 7 of Album B15");
});
