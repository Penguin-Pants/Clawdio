// U5 (TR-11): the Now playing card shares the player state with the band (rework 5.10).
import type { Page } from "@playwright/test";
import { band, expect, tab, test, widget } from "./test-base";

async function openCard(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?data=library");
  await expect(widget(page, "library").getByRole("option", { name: "Artist 00", exact: true })).toBeVisible();
  // The default preset hides Now playing (UD6).
  await page.evaluate(() => window.e2e.show("nowPlaying"));
  await expect(widget(page, "nowPlaying")).toBeVisible();
  return widget(page, "nowPlaying");
}

test("TR-11: the card shows the song, the heart, the seek bar and the play buttons", async ({ page }) => {
  const card = await openCard(page);
  await expect(card).toContainText("Song 4 of Album A0");
  await expect(card).toContainText("Artist 00 · Album A0");
  await expect(card.getByRole("button", { name: "Add to Favorites" })).toBeVisible();
  await expect(card.getByRole("slider", { name: "Seek" })).toBeVisible();
  await expect(card).toContainText("1:23");
  await expect(card).toContainText("2:04");
  for (const name of ["Previous", "Play", "Next"]) {
    await expect(card.getByRole("button", { name, exact: true })).toBeVisible();
  }
});

test("TR-11: play in the band shows pause in the card, and a seek in the card moves the band time", async ({
  page,
}) => {
  const card = await openCard(page);
  await band(page).getByRole("button", { name: "Play", exact: true }).click();
  await expect(card.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(band(page).getByRole("button", { name: "Play", exact: true })).toBeVisible();
  const seek = card.getByRole("slider", { name: "Seek" });
  await seek.focus();
  await page.keyboard.press("Home");
  await expect(page.locator("body")).toHaveAttribute("data-seek", "0");
  await expect(band(page)).toContainText("0:00");
});

test("TR-11: below 320 px Stop, Shuffle and Repeat move to the card's More menu", async ({ page }) => {
  const card = await openCard(page);
  const box = await card.boundingBox();
  if (!box) throw new Error("no card");
  // Show puts the card below Playlists (UD6): a 240 px column.
  expect(box.width).toBeLessThan(320);
  await expect(card.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0);
  await card.getByRole("button", { name: "More" }).click();
  for (const name of ["Stop", "Repeat: Off"]) await expect(page.getByRole("menuitem", { name })).toBeVisible();
  await expect(page.getByRole("menuitemcheckbox", { name: "Shuffle" })).toBeVisible();
  // The card's menu has no band items.
  await expect(page.getByRole("menuitem", { name: "Customize transport bar…" })).toHaveCount(0);
});

test("TR-11: the card docks like any widget and has a minimum size", async ({ page }) => {
  const card = await openCard(page);
  const box = await card.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(220 - 1);
  expect(box?.height).toBeGreaterThanOrEqual(240 - 40);
  await expect(tab(page, "Now playing")).toBeVisible();
});

test("TR-11: wider than 320 px the card shows Stop, Shuffle and Repeat itself", async ({ page }) => {
  const card = await openCard(page);
  const sash = page
    .getByRole("separator", { name: /^Resize Playlists, Now playing and Library$|^Resize Playlists/ })
    .first();
  await sash.focus();
  for (let step = 0; step < 4; step += 1) await page.keyboard.press("Shift+ArrowRight");
  await expect.poll(async () => (await card.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(320);
  await expect(card.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "Shuffle" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Repeat" })).toBeVisible();
  await expect(card.getByRole("button", { name: "More" })).toHaveCount(0);
});
