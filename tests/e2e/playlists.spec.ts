// P11-AC4, P11-AC5, P11-AC8 and P11-AC10 (browser part): the Playlists widget, Add to
// playlist, the hearts and the error dialog, on the mocked playlists.
import type { Page } from "@playwright/test";
import { expect, test, widget } from "./test-base";

async function openPlaylists(page: Page) {
  await page.goto("/?data=library");
  await expect(widget(page, "library").getByRole("option", { name: "Artist 00", exact: true })).toBeVisible();
  // The default preset shows Playlists; Now playing (the heart) is hidden (UD6).
  await page.evaluate(() => window.e2e.show("nowPlaying"));
  await expect(tree(page).getByRole("treeitem", { name: /Mix 1/ })).toBeVisible();
}

const tree = (page: Page) => widget(page, "playlists").getByRole("tree", { name: "Playlists" });
const songs = (page: Page) => widget(page, "library").getByRole("grid", { name: "Songs" });

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

test("P11.5: a second submit while the playlist is made creates nothing and shows no error", async ({ page }) => {
  await openPlaylists(page);
  await widget(page, "playlists").getByRole("button", { name: "New playlist" }).click();
  const dialog = page.getByRole("dialog", { name: "New playlist" });
  await dialog.getByRole("textbox", { name: "Name" }).fill("Slow");
  await expect(dialog.getByRole("button", { name: "Create" })).toBeEnabled();
  await dialog.getByRole("textbox", { name: "Name" }).press("Enter");
  await dialog.getByRole("textbox", { name: "Name" }).press("Enter");
  await expect(dialog).toBeHidden();
  await expect(tree(page).getByRole("treeitem", { name: /Slow/ })).toHaveCount(1);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.locator("footer").getByRole("status")).not.toHaveText(/Cannot create/);
});

test("P11.6: a playlist made after the Library rows rendered shows in their Add to playlist menu", async ({ page }) => {
  await openPlaylists(page);
  const album = widget(page, "library")
    .getByRole("listbox", { name: "Albums" })
    .getByRole("option", { name: /Album A0/ });
  await expect(album).toBeVisible();
  await widget(page, "playlists").getByRole("button", { name: "New playlist" }).click();
  const dialog = page.getByRole("dialog", { name: "New playlist" });
  await dialog.getByRole("textbox", { name: "Name" }).fill("Later");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(tree(page).getByRole("treeitem", { name: /Later/ })).toBeVisible();
  await album.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Add to playlist" }).click();
  await expect(page.getByRole("menu").last().getByRole("menuitem", { name: "Later" })).toBeVisible();
});

test("P11.6: Add to playlist lists playlists but Favorites, and New playlist adds the song", async ({ page }) => {
  await openPlaylists(page);
  await widget(page, "nowPlaying").getByRole("button", { name: "Add to Favorites" }).click();
  await expect(tree(page).getByRole("treeitem", { name: /Favorites/ })).toBeVisible();
  await songs(page)
    .getByRole("row", { name: /Song 2 of Album A0/ })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Add to playlist" }).click();
  const submenu = page.getByRole("menu").last();
  await expect(submenu.getByRole("menuitem", { name: "Mix 3" })).toBeVisible();
  await expect(submenu.getByRole("menuitem", { name: "Favorites" })).toHaveCount(0);
  await submenu.getByRole("menuitem", { name: "Mix 3" }).click();
  await expect(page.locator("footer").getByRole("status")).toHaveText("Added to playlist");
  await expect(tree(page).getByRole("treeitem", { name: /Mix 3/ })).toContainText("7");

  await songs(page)
    .getByRole("row", { name: /Song 2 of Album A0/ })
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
  const row = songs(page).getByRole("row", { name: /Song 4 of Album A0/ });
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
    .getByRole("row", { name: /Song 2 of Album A0/ })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Add to playlist" }).click();
  await page.getByRole("menu").last().getByRole("menuitem", { name: "Read only" }).click();
  const dialog = page.getByRole("dialog", { name: "Cannot save the change" });
  await expect(dialog).toContainText("read-only");
  await dialog.getByRole("button", { name: "OK" }).click();
  await songs(page)
    .getByRole("row", { name: /Song 2 of Album A0/ })
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

/**
 * The arguments of the last call of `command`. No playlist call holds a path: IPC carries ids
 * and names only (D13, P19-AC7).
 */
async function lastArgs(page: Page, command: string): Promise<string> {
  const calls = JSON.parse((await page.locator("body").getAttribute("data-playlist-calls")) ?? "[]") as [
    string,
    unknown,
  ][];
  for (const [, args] of calls) expect(JSON.stringify(args)).not.toMatch(/[/\\]/);
  const last = calls.filter(([name]) => name === command).at(-1);
  return JSON.stringify(last?.[1] ?? null);
}

const statusLine = (page: Page) => page.locator("span[role=status]");

const report = (page: Page, name: string) => page.getByRole("dialog", { name });

test("P12.5, P19-AC7: Import playlist shows the combined report", async ({ page }) => {
  await openPlaylists(page);
  await widget(page, "playlists").getByRole("button", { name: "Import playlist" }).click();
  const dialog = report(page, "Import report");
  await expect(dialog).toContainText("One playlist imported");
  const imported = dialog.getByRole("region", { name: "Imported" });
  await expect(imported).toContainText("1 matched, 2 missing");
  await expect(imported).toContainText("Cloud Band - Streaming Song: no file location");
  await expect(imported).toContainText("Lost Song: not found");
  await expect(dialog.getByRole("region", { name: "Skipped" }).getByRole("region", { name: "Mix 1" })).toContainText(
    "Skipped, name exists",
  );
  await expect(dialog.getByRole("region", { name: "Failed" }).getByRole("region", { name: "Too long" })).toContainText(
    "Not imported: The playlist file cannot be written",
  );
  expect(await lastArgs(page, "playlist_import")).toBe("{}");
  await dialog.getByRole("button", { name: "OK" }).click();
  await expect(tree(page).getByRole("treeitem", { name: /Road Trip_ 2026/ })).toBeVisible();
});

test("P19-AC7: Import folder shows a busy state, then the combined report", async ({ page }) => {
  await openPlaylists(page);
  const playlists = widget(page, "playlists");
  await playlists.getByRole("button", { name: "Import folder" }).click();
  await expect(playlists.getByRole("button", { name: "Import playlist" })).toBeDisabled();
  await expect(playlists).toContainText("Importing playlists");
  await expect(statusLine(page)).not.toHaveText("Importing playlists");
  const dialog = report(page, "Import report");
  await expect(dialog).toContainText("2 playlists imported");
  await expect(dialog.getByRole("region", { name: "Evening (2)" })).toContainText("1 matched, 0 missing");
  await expect(dialog.getByRole("region", { name: "notes.xml" })).toContainText(
    "Not imported: The file is not an Apple",
  );
  expect(await lastArgs(page, "playlist_import_folder")).toBe("{}");
  await dialog.getByRole("button", { name: "OK" }).click();
  await expect(playlists.getByRole("button", { name: "Import playlist" })).toBeEnabled();
  await expect(playlists).not.toContainText("Importing playlists");
  await expect(tree(page).getByRole("treeitem", { name: /Evening \(2\)/ })).toBeVisible();
});

test("P19-AC7: Find missing songs on one playlist, then on all playlists", async ({ page }) => {
  await openPlaylists(page);
  const mix = tree(page).getByRole("treeitem", { name: /Mix 1/ });
  await mix.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Find missing songs" }).click();
  let dialog = report(page, "Find missing songs");
  await expect(dialog).toContainText("One song found.");
  await expect(dialog.getByRole("region", { name: "Mix 1" })).toContainText("1 fixed, 0 still missing");
  expect(await lastArgs(page, "playlist_find_missing")).toBe('{"id":0}');
  await dialog.getByRole("button", { name: "OK" }).click();
  // Nothing is missing now: the command leaves the menu.
  await mix.click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Play", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Find missing songs" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  // The context menu must be gone and its focus return done (WebKit returns focus a moment
  // after the close), or the focus return closes the next menu as soon as it opens.
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(tree(page)).toBeFocused();

  await widget(page, "playlists").getByRole("button", { name: "Playlist actions" }).click();
  await page.getByRole("menuitem", { name: "Find missing songs in all playlists" }).click();
  dialog = report(page, "Find missing songs");
  await expect(dialog).toContainText("4 songs found.");
  const repaired = dialog.getByRole("region", { name: "Repaired" });
  await expect(repaired.getByRole("region")).toHaveCount(4);
  await expect(repaired.getByRole("region", { name: "Mix 5" })).toContainText("1 fixed, 0 still missing");
  expect(await lastArgs(page, "playlist_find_missing_all")).toBe("{}");
});

test("P19-AC7, R33.1: a canceled scan stops import and repair with nothing changed", async ({ page }) => {
  await openPlaylists(page);
  await page.evaluate(() => (document.body.dataset.cancelScan = "1"));
  await widget(page, "playlists").getByRole("button", { name: "Import playlist" }).click();
  let dialog = report(page, "Import report");
  await expect(dialog).toContainText("Canceled, nothing changed");
  await dialog.getByRole("button", { name: "OK" }).click();
  await widget(page, "playlists").getByRole("button", { name: "Playlist actions" }).click();
  await page.getByRole("menuitem", { name: "Find missing songs in all playlists" }).click();
  dialog = report(page, "Find missing songs");
  await expect(dialog).toContainText("Canceled, nothing changed");
  await dialog.getByRole("button", { name: "OK" }).click();
  await expect(tree(page).getByRole("treeitem", { name: /Road Trip_ 2026/ })).toHaveCount(0);
  await expect(tree(page).getByRole("treeitem", { name: /Mix 1/ })).toContainText("6");
});
