// P11-AC4, P11-AC5, P11-AC8 and P11-AC10 (browser part): the Playlists widget, Add to
// playlist, the hearts and the error dialog, on the mocked playlists.
import type { Page } from "@playwright/test";
import { closeMenu, expect, openMenu, test, widget } from "./test-base";

async function openPlaylists(page: Page) {
  await page.goto("/?data=library");
  await expect(widget(page, "library").getByRole("option", { name: "Artist 00", exact: true })).toBeVisible();
  await openMenu(page);
  await page.getByRole("menuitemcheckbox", { name: "Playlists", exact: true }).click();
  if (await page.getByRole("menu").isVisible()) await closeMenu(page);
  await expect(tree(page).getByRole("treeitem", { name: /Mix 1/ })).toBeVisible();
}

const tree = (page: Page) => widget(page, "playlists").getByRole("tree", { name: "Playlists" });
const songs = (page: Page) => widget(page, "library").getByRole("listbox", { name: "Songs" });

async function lastPlay(page: Page): Promise<{ ids: number[]; start: number }> {
  return JSON.parse((await page.locator("body").getAttribute("data-play-list")) ?? "null");
}

test("P11-AC8: keys move, open, close, delete and play in the Playlists tree", async ({ page }) => {
  await openPlaylists(page);
  await tree(page).focus();
  await page.keyboard.press("ArrowDown");
  const mix = tree(page).getByRole("treeitem", { name: /Mix 1/ });
  await expect(mix).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight");
  await expect(mix).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowRight");
  const first = tree(page).getByRole("treeitem", { level: 2 }).first();
  await expect(first).toHaveAttribute("aria-selected", "true");
  await expect(first).toContainText("Song 1 of Album A0");
  await page.keyboard.press("Delete");
  await expect(mix).toContainText("5");
  await expect(tree(page).getByRole("treeitem", { level: 2 }).first()).toContainText("Song 2 of Album A0");
  await page.keyboard.press("ArrowLeft");
  await expect(mix).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(mix).toHaveAttribute("aria-expanded", "false");
  // Enter plays the playlist (D24); the missing entry is skipped (P11-AC4).
  await page.keyboard.press("Enter");
  await expect.poll(() => lastPlay(page)).toEqual({ ids: [1, 2, 3, 4], start: 0 });
  await tree(page).getByRole("treeitem", { name: /Mix 2/ }).dblclick();
  await expect.poll(() => lastPlay(page)).toEqual({ ids: [10, 11, 12, 13, 14], start: 0 });
});

test("P11-AC4: a missing entry shows as missing and an entry plays its playlist from there", async ({ page }) => {
  await openPlaylists(page);
  await tree(page).getByRole("treeitem", { name: /Mix 1/ }).click();
  const missing = tree(page).getByRole("treeitem", { level: 2 }).last();
  await expect(missing).toContainText("missing");
  await expect(missing).toContainText("../Missing/Song 5.mp3");
  await tree(page)
    .getByRole("treeitem", { name: /Song 3 of Album A0/ })
    .dblclick();
  await expect.poll(() => lastPlay(page)).toEqual({ ids: [0, 1, 2, 3, 4], start: 2 });
});

test("P11.5: New playlist checks the name inline and creates the playlist", async ({ page }) => {
  await openPlaylists(page);
  await widget(page, "playlists").getByRole("button", { name: "New playlist" }).click();
  const dialog = page.getByRole("dialog", { name: "New playlist" });
  await dialog.getByRole("textbox", { name: "Name" }).fill("favorites");
  await expect(dialog.getByRole("alert")).toHaveText("Favorites is the heart's playlist");
  await expect(dialog.getByRole("button", { name: "Create" })).toBeDisabled();
  await dialog.getByRole("textbox", { name: "Name" }).fill("Road trip");
  await expect(dialog.getByRole("alert")).toHaveText("");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(tree(page).getByRole("treeitem", { name: /Road trip/ })).toBeVisible();
});

test("P11.6: Add to playlist lists playlists but Favorites, and New playlist adds the song", async ({ page }) => {
  await openPlaylists(page);
  await widget(page, "nowPlaying").getByRole("button", { name: "Add to Favorites" }).click();
  await expect(tree(page).getByRole("treeitem", { name: /Favorites/ })).toBeVisible();
  await songs(page)
    .getByRole("option", { name: /Song 2 of Album A0/ })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Add to playlist" }).click();
  const submenu = page.getByRole("menu").last();
  await expect(submenu.getByRole("menuitem", { name: "Mix 3" })).toBeVisible();
  await expect(submenu.getByRole("menuitem", { name: "Favorites" })).toHaveCount(0);
  await submenu.getByRole("menuitem", { name: "Mix 3" }).click();
  await expect(page.locator("footer").getByRole("status")).toHaveText("Added to playlist");
  await expect(tree(page).getByRole("treeitem", { name: /Mix 3/ })).toContainText("7");

  await songs(page)
    .getByRole("option", { name: /Song 2 of Album A0/ })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Add to playlist" }).click();
  await page.getByRole("menu").last().getByRole("menuitem", { name: "New playlist…" }).click();
  const dialog = page.getByRole("dialog", { name: "New playlist" });
  await dialog.getByRole("textbox", { name: "Name" }).fill("Fresh");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(tree(page).getByRole("treeitem", { name: /Fresh/ })).toContainText("1");
});

test("P11-AC5: the hearts add and remove the song in Favorites", async ({ page }) => {
  await openPlaylists(page);
  const heart = widget(page, "nowPlaying").getByRole("button", { name: "Add to Favorites" });
  await expect(heart).toHaveAttribute("aria-pressed", "false");
  await heart.click();
  const pressed = widget(page, "nowPlaying").getByRole("button", { name: "Remove from Favorites" });
  await expect(pressed).toHaveAttribute("aria-pressed", "true");
  // The playing song's row shows a filled heart.
  const row = songs(page).getByRole("option", { name: /Song 4 of Album A0/ });
  await expect(row.locator("[data-slot='row-heart']")).toHaveAttribute("data-favorite", "");
  await row.locator("[data-slot='row-heart']").click();
  await expect(widget(page, "nowPlaying").getByRole("button", { name: "Add to Favorites" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(tree(page).getByRole("treeitem", { name: /Favorites/ })).toContainText("0");
});

test("P11-AC10: a failed write shows a dialog and playback goes on", async ({ page }) => {
  await openPlaylists(page);
  await widget(page, "playlists").getByRole("button", { name: "New playlist" }).click();
  await page.getByRole("dialog").getByRole("textbox", { name: "Name" }).fill("Read only");
  await page.getByRole("dialog").getByRole("button", { name: "Create" }).click();
  await songs(page)
    .getByRole("option", { name: /Song 2 of Album A0/ })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Add to playlist" }).click();
  await page.getByRole("menu").last().getByRole("menuitem", { name: "Read only" }).click();
  const dialog = page.getByRole("dialog", { name: "Cannot save the change" });
  await expect(dialog).toContainText("read-only");
  await dialog.getByRole("button", { name: "OK" }).click();
  await songs(page)
    .getByRole("option", { name: /Song 2 of Album A0/ })
    .dblclick();
  await expect(widget(page, "nowPlaying")).toContainText("Song 2 of Album A0");
});

test("R12: Delete playlist asks first and names the file", async ({ page }) => {
  await openPlaylists(page);
  await tree(page).getByRole("treeitem", { name: /Mix 5/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete playlist" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete playlist" });
  await expect(dialog).toContainText("Mix 5.m3u8");
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(tree(page).getByRole("treeitem", { name: /Mix 5/ })).toHaveCount(0);
});

test("P12.5: Import playlist shows the matched and missing report", async ({ page }) => {
  await openPlaylists(page);
  await widget(page, "playlists").getByRole("button", { name: "Import playlist" }).click();
  const dialog = page.getByRole("dialog", { name: "Import report" });
  await expect(dialog).toContainText("1 matched, 2 missing");
  await expect(dialog).toContainText("Cloud Band - Streaming Song: no file location");
  await expect(dialog).toContainText("Lost Song: not found");
  await expect(dialog).toContainText("One playlist imported");
  await expect(dialog.getByRole("region", { name: "Too long" })).toContainText(
    "Not imported: The playlist file cannot be written",
  );
  await dialog.getByRole("button", { name: "OK" }).click();
  await expect(tree(page).getByRole("treeitem", { name: /Road Trip_ 2026/ })).toBeVisible();
});
