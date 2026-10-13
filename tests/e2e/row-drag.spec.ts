// U6 (TB-12, UD21): drag the selected songs to a playlist or to the Play queue.
import type { Locator, Page } from "@playwright/test";
import { center, expect, SONG_ROWS, songsGrid, test, widget } from "./test-base";

async function open(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?data=library");
  await expect(widget(page, "library").getByRole("option", { name: "Artist 00", exact: true })).toBeVisible();
  await expect(playlist(page, "Mix 2")).toBeVisible();
}

const rows = (page: Page) => songsGrid(page).locator(SONG_ROWS);
const playlist = (page: Page, name: string) =>
  widget(page, "playlists").getByRole("treeitem", { name: new RegExp(name) });

/** A pointer drag from a row to a target, in small steps. */
async function dragTo(page: Page, from: Locator, to: Locator, before?: () => Promise<void>) {
  const start = await center(from);
  const end = await center(to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 8, start.y + 8, { steps: 4 });
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await expect(page.locator("[data-slot='drag-ghost']")).toBeVisible();
  await before?.();
  await page.mouse.up();
}

test("TB-12: two selected songs dragged to a playlist row join it", async ({ page }) => {
  await open(page);
  await rows(page).nth(0).click();
  await rows(page)
    .nth(1)
    .click({ modifiers: ["ControlOrMeta"] });
  await expect(playlist(page, "Mix 2")).toContainText("6");
  await dragTo(page, rows(page).nth(0), playlist(page, "Mix 2"), async () => {
    await expect(page.locator("[data-slot='drag-ghost']")).toHaveText("2 songs");
    await expect(playlist(page, "Mix 2")).toHaveAttribute("data-drop-active", "");
  });
  await expect(playlist(page, "Mix 2")).toContainText("8");
  await expect(page.locator("[data-slot='drag-ghost']")).toHaveCount(0);
  // The drop does not change the selection.
  await expect(songsGrid(page).locator("[role='row'][aria-selected='true']")).toHaveCount(2);
});

test("TB-12: songs dragged to the Play queue are added, with the status message", async ({ page }) => {
  await open(page);
  const queue = widget(page, "queue");
  await expect(queue).toContainText("50 songs");
  await rows(page).nth(2).click();
  await rows(page)
    .nth(3)
    .click({ modifiers: ["Shift"] });
  await dragTo(page, rows(page).nth(2), queue.getByRole("listbox"));
  await expect(queue).toContainText("52 songs");
  await expect(page.locator("footer")).toContainText("Added to queue");
});

test("TB-12: an empty Play queue takes a drag too", async ({ page }) => {
  await open(page);
  const queue = widget(page, "queue");
  await queue.getByRole("button", { name: "Clear queue" }).click();
  await expect(queue).toContainText("The queue is empty");
  await rows(page).nth(0).click();
  await dragTo(page, rows(page).nth(0), queue.getByText("The queue is empty"));
  await expect(queue).toContainText("1 song");
});

test("TB-12: a drag to Favorites adds only the songs that are not favorites yet", async ({ page }) => {
  await open(page);
  // Song 1 becomes a favorite by its heart; the Favorites playlist appears.
  await rows(page).nth(0).hover();
  await rows(page).nth(0).locator("[data-slot='row-heart']").click();
  await expect(playlist(page, "Favorites")).toContainText("1");
  await rows(page).nth(0).click();
  await rows(page)
    .nth(1)
    .click({ modifiers: ["Shift"] });
  await dragTo(page, rows(page).nth(1), playlist(page, "Favorites"));
  await expect(playlist(page, "Favorites")).toContainText("2");
  await expect(rows(page).nth(0).locator("[data-slot='row-heart']")).toHaveAttribute("data-favorite", "");
});

test("TB-12: Escape during a drag adds nothing; an unselected row drags itself", async ({ page }) => {
  await open(page);
  await rows(page).nth(0).click();
  await dragTo(page, rows(page).nth(4), playlist(page, "Mix 2"), async () => {
    await expect(page.locator("[data-slot='drag-ghost']")).toHaveText("1 song");
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-slot='drag-ghost']")).toHaveCount(0);
  });
  await expect(playlist(page, "Mix 2")).toContainText("6");
  // The drag selected the dragged row.
  await expect(rows(page).nth(4)).toHaveAttribute("aria-selected", "true");
});

test("TB-12: Escape keeps a multi-selection when the pointer comes up on the source row", async ({ page }) => {
  await open(page);
  await rows(page).nth(0).click();
  await rows(page)
    .nth(2)
    .click({ modifiers: ["Shift"] });
  const start = await center(rows(page).nth(1));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 8, start.y + 40, { steps: 6 });
  await expect(page.locator("[data-slot='drag-ghost']")).toHaveText("3 songs");
  await page.keyboard.press("Escape");
  await page.mouse.move(start.x, start.y, { steps: 6 });
  await page.mouse.up();
  await expect(songsGrid(page).locator("[role='row'][aria-selected='true']")).toHaveCount(3);
});

test("TB-12: a rail playlist button takes a drop", async ({ page }) => {
  await open(page);
  const sash = page.getByRole("separator", { name: "Resize Playlists and Library" });
  const box = await sash.boundingBox();
  if (!box) throw new Error("no separator");
  await page.mouse.move(box.x + box.width / 2, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x - 120, box.y + 200, { steps: 10 });
  await page.mouse.up();
  const rail = widget(page, "playlists").getByRole("navigation", { name: "Playlists" });
  const mix = rail.getByRole("button", { name: "Mix 2" });
  await expect(mix).toBeVisible();
  await rows(page).nth(0).click();
  await dragTo(page, rows(page).nth(0), mix, async () => {
    await expect(mix).toHaveAttribute("data-drop-active", "");
  });
  await expect(page.locator("footer")).toContainText("Added to playlist");
});

test("TB-12: two quick drops on Favorites keep the songs favorites", async ({ page }) => {
  await open(page);
  await rows(page).nth(0).hover();
  await rows(page).nth(0).locator("[data-slot='row-heart']").click();
  await expect(playlist(page, "Favorites")).toContainText("1");
  await rows(page).nth(1).click();
  await rows(page)
    .nth(2)
    .click({ modifiers: ["Shift"] });
  // The second drop starts before the first one's reload can reach the hearts.
  await page.evaluate(() => {
    window.e2eSlowFavorites = true;
  });
  await dragTo(page, rows(page).nth(1), playlist(page, "Favorites"));
  await dragTo(page, rows(page).nth(1), playlist(page, "Favorites"));
  // Let the slow reloads land.
  await page.waitForTimeout(2_000);
  await page.evaluate(() => {
    window.e2eSlowFavorites = false;
  });
  await expect(playlist(page, "Favorites")).toContainText("3");
  for (const index of [1, 2])
    await expect(rows(page).nth(index).locator("[data-slot='row-heart']")).toHaveAttribute("data-favorite", "");
});
