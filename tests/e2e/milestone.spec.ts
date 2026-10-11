// P3-AC1 (browser part): every widget shows data and each Library mode scrolls its lists.
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { closeMenu, expect, openMenu, settle, test, widget } from "./test-base";

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
  await expect(widget(page, "queue")).toContainText("Playing:");
  await expect(widget(page, "playlists").getByRole("treeitem", { name: /Mix 1/ })).toBeVisible();
  await expect(widget(page, "lyrics")).toContainText("Lyric line 60");
  await expect(widget(page, "nowPlaying")).toContainText("Song 4 of Album A0");
  await expect(widget(page, "transport")).toContainText("1:23");
  await expect(widget(page, "transport")).toContainText("2:04");
  await widget(page, "playlists").getByRole("treeitem", { name: /Mix 1/ }).click();
  await expect(widget(page, "playlists")).toContainText("missing");
});

test("P3-AC1: Columns filters by artist and album and scrolls the songs", async ({ page }) => {
  await open(page, "columns");
  const library = widget(page, "library");
  const songs = library.getByRole("listbox", { name: "Songs" });
  await songs.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await expect(songs.getByRole("option").last()).toContainText("Song 10 of Album C19");
  await library.getByRole("listbox", { name: "Artists" }).getByRole("option", { name: "Artist 05" }).click();
  const albums = library.getByRole("listbox", { name: "Albums" }).getByRole("option");
  await expect(albums).toHaveCount(4);
  await albums.nth(2).click();
  await expect(songs.getByRole("option")).toHaveCount(10);
  await expect(songs.getByRole("option").first()).toContainText("Song 1 of Album B5");
});

test("P3-AC1: Top/bottom and Tree show the library and search filters it", async ({ page }) => {
  await open(page, "topBottom");
  const library = widget(page, "library");
  await expect(page.locator("[data-library-body]")).toHaveAttribute("data-library-body", "topBottom");
  await expect(library.getByRole("listbox", { name: "Songs" }).getByRole("option").first()).toBeVisible();
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

test("P3: axe finds no serious or critical violation with data", async ({ page }) => {
  await open(page, "columns");
  await expect(widget(page, "queue").getByRole("option").first()).toBeVisible();
  await settle(page);
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`);
  expect(serious).toEqual([]);
});
