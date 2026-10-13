// U2 (DK-5, UD15): Lock layout stops widget drag and group resize; frames, scrolling and the View menu still work.
import type { Page } from "@playwright/test";
import { center, closeMenu, drag, expect, openMenu, setWidgetShown, tab, test, widget } from "./test-base";

async function setLocked(page: Page, locked: boolean) {
  await openMenu(page);
  const item = page.getByRole("menuitemcheckbox", { name: "Lock layout" });
  if ((await item.getAttribute("aria-checked")) !== String(locked)) await item.click();
  if (await page.getByRole("menu").isVisible()) await closeMenu(page);
}

const DOCK_SASH = ".dv-split-view-container.dv-horizontal > .dv-sash-container > .dv-sash:not([data-frame-group] *)";

async function libraryBox(page: Page) {
  const box = await widget(page, "library").boundingBox();
  if (!box) throw new Error("no library");
  return box;
}

test("DK-5: with Lock layout on, drags move and resize nothing, frames and scrolling still work", async ({ page }) => {
  await page.goto("/?data=library");
  await expect(widget(page, "library").getByRole("option", { name: "Artist 00", exact: true })).toBeVisible();
  await setLocked(page, true);
  const before = await libraryBox(page);
  // A tab drag moves nothing.
  await drag(page, await center(tab(page, "Play queue")), { x: before.x + 20, y: before.y + before.height / 2 });
  const queue = await widget(page, "queue").boundingBox();
  expect(queue?.x).toBeGreaterThan(before.x + before.width - 2);
  // A dock sash drag changes no size.
  const sash = page.locator(DOCK_SASH).first();
  const sashBox = await sash.boundingBox();
  if (!sashBox) throw new Error("no sash");
  await drag(
    page,
    { x: sashBox.x + sashBox.width / 2, y: sashBox.y + 150 },
    { x: sashBox.x + 120, y: sashBox.y + 150 },
  );
  const after = await libraryBox(page);
  expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);
  // A Library frame splitter still moves.
  const frames = page.locator("[data-frame-group='columns'] .dv-sash").first();
  const frameBox = await frames.boundingBox();
  if (!frameBox) throw new Error("no frame sash");
  const artists = widget(page, "library").getByRole("listbox", { name: "Artists" });
  const artistsBefore = (await artists.boundingBox())?.width ?? 0;
  await drag(
    page,
    { x: frameBox.x + frameBox.width / 2, y: frameBox.y + 150 },
    { x: frameBox.x + 60, y: frameBox.y + 150 },
  );
  expect((await artists.boundingBox())?.width ?? 0).toBeGreaterThan(artistsBefore + 30);
  // Lists still scroll.
  const songs = widget(page, "library").getByRole("listbox", { name: "Songs" });
  await songs.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await expect.poll(() => songs.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  // The View menu still hides and shows widgets; the tab Float control is gone.
  await setWidgetShown(page, "Playlists", false);
  await expect(widget(page, "playlists")).toHaveCount(0);
  await setWidgetShown(page, "Playlists", true);
  await expect(widget(page, "playlists")).toBeVisible();
  await expect(page.locator("[data-slot='group-options']")).toHaveCount(0);
});

test("DK-5: the lock state survives a reload, and unlocking restores drag", async ({ page }) => {
  await page.goto("/?data=library");
  await expect(widget(page, "library")).toBeVisible();
  await setLocked(page, true);
  await expect
    .poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("e2e-layout") ?? "{}").locked))
    .toBe(true);
  await page.reload();
  await expect(widget(page, "library")).toBeVisible();
  await openMenu(page);
  await expect(page.getByRole("menuitemcheckbox", { name: "Lock layout" })).toHaveAttribute("aria-checked", "true");
  await closeMenu(page);
  await setLocked(page, false);
  const library = await libraryBox(page);
  await drag(page, await center(tab(page, "Play queue")), { x: library.x + 15, y: library.y + library.height / 2 });
  await expect.poll(async () => (await widget(page, "queue").boundingBox())?.x ?? 0).toBeLessThan(library.x + 5);
});
