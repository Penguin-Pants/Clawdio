// P3-AC1 (browser part): every widget shows data and each Library mode scrolls its lists.
import type { Page } from "@playwright/test";
import { closeMenu, expect, expectNoSeriousViolations, openMenu, SONG_ROWS, test, widget } from "./test-base";

async function open(page: Page, measure: string) {
  await page.goto(`/?data=library&measure=${measure}`);
  await expect(widget(page, "lyrics")).toBeVisible();
}

test("P3-AC1: the measurement arrangement shows all six widgets with data", async ({ page }) => {
  await open(page, "columns");
  for (const id of ["library", "transport", "nowPlaying", "playlists", "queue", "lyrics"]) {
    await expect(widget(page, id)).toBeVisible();
  }
  await expect(widget(page, "queue").getByRole("option").first()).toContainText("Song 1 of Album A0");
  await expect(widget(page, "queue")).toContainText("Playing");
  await expect(widget(page, "playlists").getByRole("option", { name: /Mix 1/ })).toBeVisible();
  await expect(widget(page, "lyrics")).toContainText("Lyric line 60");
  await expect(widget(page, "nowPlaying")).toContainText("Song 4 of Album A0");
  await expect(widget(page, "transport")).toContainText("1:23");
  await expect(widget(page, "transport")).toContainText("2:04");
  // A playlist shows its songs, a missing one too, in the Library (R12 v1.9).
  await widget(page, "playlists").getByRole("option", { name: /Mix 1/ }).click();
  await expect(widget(page, "library")).toContainText("missing");
  // The app signals the measurement scripts once every widget shows data (P3.5).
  await expect(page.locator("body")).toHaveAttribute("data-measure-ready", "true");
});

test("P3-AC1: Columns filters by artist and album and scrolls the songs", async ({ page }) => {
  await open(page, "columns");
  const library = widget(page, "library");
  const songs = library.getByRole("grid", { name: "Songs" });
  await songs.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await expect(songs.locator(SONG_ROWS).last()).toContainText("Sorry");
  await library.getByRole("listbox", { name: "Artists" }).getByRole("option", { name: "Artist 05" }).click();
  const albums = library.getByRole("listbox", { name: "Albums" }).getByRole("option");
  await expect(albums).toHaveCount(4);
  await albums.nth(2).click();
  await expect(songs.locator(SONG_ROWS)).toHaveCount(10);
  await expect(songs.locator(SONG_ROWS).first()).toContainText("Song 1 of Album B5");
});

test("P3-AC1: Top/bottom and Tree show the library and search filters it", async ({ page }) => {
  await open(page, "topBottom");
  const library = widget(page, "library");
  await expect(page.locator("[data-library-body]")).toHaveAttribute("data-library-body", "topBottom");
  await expect(library.getByRole("grid", { name: "Songs" }).locator(SONG_ROWS).first()).toBeVisible();
  await library.getByRole("searchbox").fill("Album B7");
  await expect(library.getByRole("listbox", { name: "Artists" }).getByRole("option")).toHaveCount(2);

  await library.getByRole("searchbox").fill("");
  await openMenu(page);
  await page.getByRole("menuitemradio", { name: "Tree" }).click();
  await closeMenu(page);
  const tree = library.getByRole("tree", { name: "Library" });
  await tree.getByRole("treeitem", { name: "Artist 00", exact: true }).click();
  await tree.getByRole("treeitem", { name: "Album A0", exact: true }).click();
  await expect(tree.getByRole("treeitem", { name: /Song 10 of Album A0/ })).toBeVisible();
  await expect(tree.getByRole("treeitem", { name: "Artist 00", exact: true })).toHaveAttribute("aria-expanded", "true");
});

test("P3: a tree album selection also selects its artist, so Columns shows that album", async ({ page }) => {
  await open(page, "tree");
  const library = widget(page, "library");
  const tree = library.getByRole("tree", { name: "Library" });
  await tree.getByRole("treeitem", { name: "Artist 00", exact: true }).click();
  await tree.getByRole("treeitem", { name: "Artist 01", exact: true }).click();
  await tree.getByRole("treeitem", { name: "Album B0", exact: true }).click();
  await openMenu(page);
  await page.getByRole("menuitemradio", { name: "Columns" }).click();
  await closeMenu(page);
  const artists = library.getByRole("listbox", { name: "Artists" });
  await expect(artists.getByRole("option", { name: "Artist 00" })).toHaveAttribute("aria-selected", "true");
  await expect(library.getByRole("grid", { name: "Songs" }).locator(SONG_ROWS).first()).toContainText(
    "Song 1 of Album B0",
  );
});

test("P3: a tree song selection also selects its artist and album", async ({ page }) => {
  await open(page, "tree");
  const library = widget(page, "library");
  const tree = library.getByRole("tree", { name: "Library" });
  await tree.getByRole("treeitem", { name: "Artist 00", exact: true }).click();
  await tree.getByRole("treeitem", { name: "Album A0", exact: true }).click();
  await tree.getByRole("treeitem", { name: "Album B0", exact: true }).click();
  await tree.getByRole("treeitem", { name: /Song 2 of Album A0/ }).click();
  await openMenu(page);
  await page.getByRole("menuitemradio", { name: "Columns" }).click();
  await closeMenu(page);
  const songs = library.getByRole("grid", { name: "Songs" });
  await expect(songs.getByRole("row", { name: /Song 2 of Album A0/ })).toHaveAttribute("aria-selected", "true");
});

test("P3: F6 leaves a focused Library list", async ({ page }) => {
  await open(page, "columns");
  await widget(page, "library").getByRole("grid", { name: "Songs" }).focus();
  await page.keyboard.press("F6");
  const focused = await page.evaluate(() =>
    document.activeElement?.closest("[data-widget]")?.getAttribute("data-widget"),
  );
  expect(focused).not.toBe("library");
});

test("P3: axe finds no serious or critical violation with data", async ({ page }) => {
  await open(page, "columns");
  await expect(widget(page, "queue").getByRole("option").first()).toBeVisible();
  await expectNoSeriousViolations(page);
});
