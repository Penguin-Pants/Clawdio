// P7-AC5, P7-AC7, P7-AC8, P7-AC9, P7-AC11 and P7-AC12: Transport controls, Space, the Library
// menu and the Play queue on the mocked player.
import type { Page } from "@playwright/test";
import { grayProfile } from "./gray";
import { closeMenu, expect, openMenu, test, widget } from "./test-base";

async function openLibrary(page: Page) {
  await page.goto("/?data=library");
  await expect(widget(page, "library").getByRole("option", { name: "Artist 00", exact: true })).toBeVisible();
  await expect(widget(page, "nowPlaying")).toContainText("Song 4 of Album A0");
}

/** The player commands the app sent, in order. */
async function calls(page: Page): Promise<string[]> {
  return JSON.parse((await page.locator("body").getAttribute("data-player-calls")) ?? "[]");
}

const transport = (page: Page) => widget(page, "transport");
const button = (page: Page, name: string) => transport(page).getByRole("button", { name, exact: true });
const slider = (page: Page, name: string) => transport(page).getByRole("slider", { name });

async function hideWidget(page: Page, name: string) {
  await openMenu(page);
  await page.getByRole("menuitemcheckbox", { name, exact: true }).click();
  if (await page.getByRole("menu").isVisible()) await closeMenu(page);
}

test("P7-AC5: Space toggles playback with Transport controls hidden", async ({ page }) => {
  await openLibrary(page);
  await hideWidget(page, "Transport controls");
  await expect(widget(page, "transport")).toHaveCount(0);
  await widget(page, "library").getByRole("listbox", { name: "Songs" }).focus();
  await page.keyboard.press("Space");
  expect(await calls(page)).toEqual(["player_toggle"]);
  await page.keyboard.press("Space");
  expect(await calls(page)).toEqual(["player_toggle", "player_toggle"]);
});

test("P7-AC5: after a click on Next, Space toggles and does not press Next again", async ({ page }) => {
  await openLibrary(page);
  await button(page, "Next").click();
  await expect(button(page, "Next")).toBeFocused();
  await page.keyboard.press("Space");
  expect(await calls(page)).toEqual(["player_next", "player_toggle"]);
  await expect(button(page, "Pause")).toHaveCount(0);
  await expect(button(page, "Play")).toBeVisible();
});

test("P7-AC5: Space types a space in the search field", async ({ page }) => {
  await openLibrary(page);
  const field = widget(page, "library").getByRole("searchbox", { name: "Search" });
  await field.click();
  await page.keyboard.type("a b");
  await expect(field).toHaveValue("a b");
  expect(await calls(page)).toEqual([]);
});

test("P7-AC7: Add to queue appends and says so; Play replaces the queue", async ({ page }) => {
  await openLibrary(page);
  await page.evaluate(() => window.e2e.addAsTab("queue", "nowPlaying"));
  const queue = widget(page, "queue");
  await expect(queue).toContainText("50 songs");
  const songs = widget(page, "library").getByRole("listbox", { name: "Songs" });
  await songs.getByRole("option", { name: /Song 2 of Album B0/ }).click({ button: "right" });
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "Add to playlist" })).toHaveAttribute("aria-disabled", "true");
  await menu.getByRole("menuitem", { name: "Add to queue" }).click();
  await expect(page.locator("footer").getByRole("status")).toHaveText("Added to queue");
  await expect(queue).toContainText("51 songs");
  await expect(queue.getByRole("option", { name: /Playing.*Song 4 of Album A0/ })).toBeVisible();

  await songs.getByRole("option", { name: /Song 3 of Album A0/ }).click({ button: "right" });
  await menu.getByRole("menuitem", { name: "Play", exact: true }).click();
  await expect(queue.getByRole("option", { name: /Playing.*Song 3 of Album A0/ })).toBeVisible();
  expect((await calls(page)).at(-1)).toBe("player_play_list");
});

test("P7-AC8: active Shuffle and Repeat show in a grayscale screenshot", async ({ page }) => {
  await openLibrary(page);
  for (const name of ["Shuffle", "Repeat"]) {
    const toggle = button(page, name);
    await page.mouse.move(0, 0);
    const off = await grayProfile(page, toggle);
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await page.mouse.move(0, 0);
    const on = await grayProfile(page, toggle);
    // The dot and the icon color change the gray image, not only the hue.
    expect(Math.abs(on.mean - off.mean), name).toBeGreaterThan(3);
  }
  await button(page, "Repeat").click();
  await expect(button(page, "Repeat one")).toHaveAttribute("aria-pressed", "true");
  await expect(button(page, "Repeat one").locator("[data-icon='repeatOne']")).toBeVisible();
});

test("P7-AC9, P7-AC11: the seek slider moves playback by keyboard", async ({ page }) => {
  await openLibrary(page);
  const seek = slider(page, "Seek");
  await expect(seek).toHaveAttribute("aria-valuetext", "1:23 of 2:04");
  await seek.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("body")).toHaveAttribute("data-seek", "84000");
  await expect(seek).toHaveAttribute("aria-valuetext", "1:24 of 2:04");
  await page.keyboard.press("End");
  await expect(page.locator("body")).toHaveAttribute("data-seek", "124000");
  await page.keyboard.press("Home");
  await expect(page.locator("body")).toHaveAttribute("data-seek", "0");
  await expect(seek).toHaveAttribute("aria-valuetext", "0:00 of 2:04");
  // The thumb stays visible at position 0.
  const thumb = transport(page).locator("[data-slot='slider-thumb']").first();
  const box = await thumb.boundingBox();
  expect(box?.width).toBe(12);
  expect(box?.height).toBe(12);
  const times = transport(page).locator("[data-slot='time']");
  await expect(times.first()).toHaveCSS("font-variant-numeric", "tabular-nums");
});

test("P7-AC11: the volume slider reads the percent and shows VolumeX at 0", async ({ page }) => {
  await openLibrary(page);
  const volume = slider(page, "Volume");
  await expect(volume).toHaveAttribute("aria-valuetext", "Volume 80 percent");
  await volume.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(volume).toHaveAttribute("aria-valuetext", "Volume 79 percent");
  await page.keyboard.press("Home");
  await expect(volume).toHaveAttribute("aria-valuetext", "Volume 0 percent");
  await expect(transport(page).locator("[data-icon='volumeMuted']")).toBeVisible();
  await page.keyboard.press("End");
  await expect(volume).toHaveAttribute("aria-valuetext", "Volume 100 percent");
  await expect(transport(page).locator("[data-icon='volume']")).toBeVisible();
});

test("P7-AC12: in the Play queue Up and Down move and Delete removes the entry", async ({ page }) => {
  await openLibrary(page);
  await page.evaluate(() => window.e2e.addAsTab("queue", "nowPlaying"));
  const list = widget(page, "queue").getByRole("listbox", { name: "Play queue" });
  await list.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(list.getByRole("option", { name: /Song 2 of Album A0/ })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowUp");
  await expect(list.getByRole("option", { name: /Song 1 of Album A0/ })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Delete");
  await expect(widget(page, "queue")).toContainText("49 songs");
  await expect(list.getByRole("option").first()).toContainText("Song 2 of Album A0");
  await expect(list.getByRole("option", { name: /Playing.*Song 4 of Album A0/ })).toBeVisible();

  await list.getByRole("option", { name: /Song 3 of Album A0/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Remove" }).click();
  await expect(widget(page, "queue")).toContainText("48 songs");
  await widget(page, "queue").getByRole("button", { name: "Clear queue" }).click();
  await expect(widget(page, "queue")).toContainText("The queue is empty.");
  await expect(button(page, "Play")).toBeDisabled();
});
