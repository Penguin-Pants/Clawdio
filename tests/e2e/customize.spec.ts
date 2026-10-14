// U5 (TR-10, UD20): Customize transport bar changes the band, saves with the layout and resets.
import type { Page } from "@playwright/test";
import { band, expect, test, widget } from "./test-base";

async function open(page: Page) {
  await page.setViewportSize({ width: 1600, height: 800 });
  await page.goto("/?data=library");
  await expect(widget(page, "library").getByRole("option", { name: "Artist 00", exact: true })).toBeVisible();
}

const left = async (page: Page, selector: string) =>
  (await band(page).locator(selector).first().boundingBox())?.x ?? Number.NaN;

async function customize(page: Page) {
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("menuitem", { name: "Transport bar" }).click();
  await page.getByRole("menuitem", { name: "Customize transport bar…" }).click();
  const dialog = page.getByRole("dialog", { name: "Customize transport bar" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("TR-10: hide Stop and move Volume before Shuffle; the band follows and a reload keeps it", async ({ page }) => {
  await open(page);
  const dialog = await customize(page);
  await dialog.getByRole("checkbox", { name: "Show Stop" }).click();
  await dialog.getByRole("button", { name: "Move Volume up" }).click();
  await dialog.getByRole("button", { name: "Move Volume up" }).click();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(band(page).getByRole("button", { name: "Stop", exact: true })).toHaveCount(0);
  expect(await left(page, "[data-slot='volume']")).toBeLessThan(await left(page, "button[aria-label='Shuffle']"));
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem("e2e-layout") ?? ""))
    .toContain('"hidden":["search","stop"]');
  await page.reload();
  await expect(band(page).getByRole("button", { name: "Shuffle" })).toBeVisible();
  await expect(band(page).getByRole("button", { name: "Stop", exact: true })).toHaveCount(0);
  // Reset layout restores the default slots.
  await page.keyboard.press("Control+Shift+L");
  await expect(band(page).getByRole("button", { name: "Stop", exact: true })).toBeVisible();
});

test("TR-10, AX-1: the dialog works by keyboard only", async ({ page }) => {
  await open(page);
  const dialog = await customize(page);
  const stop = dialog.getByRole("checkbox", { name: "Show Stop" });
  await stop.focus();
  await page.keyboard.press("Space");
  await expect(stop).not.toBeChecked();
  await dialog.getByRole("button", { name: "Move Repeat up" }).focus();
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("listitem").nth(6)).toHaveAttribute("data-slot", "repeat");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(band(page).getByRole("button", { name: "Stop", exact: true })).toHaveCount(0);
});

test("TR-10: a handle drag reorders the slots", async ({ page }) => {
  await open(page);
  const dialog = await customize(page);
  const rows = dialog.getByRole("listitem");
  // Queue (row 9) dropped on the top half of Seek (row 1).
  await expect(rows.nth(9)).toHaveAttribute("data-slot", "queue");
  const handle = rows.nth(9).locator("[data-slot='slot-handle']");
  const from = await handle.boundingBox();
  const to = await rows.nth(1).boundingBox();
  if (!from || !to) throw new Error("no rows");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, to.y + 2, { steps: 10 });
  await page.mouse.up();
  await expect(rows.nth(1)).toHaveAttribute("data-slot", "queue");
});

test("TR-10: a downward handle drag drops the slot just above the line", async ({ page }) => {
  await open(page);
  const dialog = await customize(page);
  const rows = dialog.getByRole("listitem");
  // Seek (row 1) dropped on the top half of Shuffle (row 6) goes between Stop and Shuffle.
  await expect(rows.nth(1)).toHaveAttribute("data-slot", "seek");
  const handle = rows.nth(1).locator("[data-slot='slot-handle']");
  const from = await handle.boundingBox();
  const to = await rows.nth(6).boundingBox();
  if (!from || !to) throw new Error("no rows");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, to.y + 2, { steps: 10 });
  await page.mouse.up();
  await expect(rows.nth(5)).toHaveAttribute("data-slot", "seek");
  await expect(rows.nth(6)).toHaveAttribute("data-slot", "shuffle");
});

test("TR-10: the play controls sit in the middle of the band and move to the start as a group", async ({ page }) => {
  await open(page);
  const play = band(page).getByRole("button", { name: "Play", exact: true });
  const bandBox = await band(page).boundingBox();
  const playBox = await play.boundingBox();
  if (!bandBox || !playBox) throw new Error("no band");
  // Centered within a couple of pixels.
  expect(Math.abs(playBox.x + playBox.width / 2 - (bandBox.x + bandBox.width / 2))).toBeLessThanOrEqual(2);

  const dialog = await customize(page);
  const rows = dialog.getByRole("listitem");
  const handle = rows.nth(3).locator("[data-slot='slot-handle']");
  const from = await handle.boundingBox();
  const to = await rows.nth(0).boundingBox();
  if (!from || !to) throw new Error("no rows");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, to.y + 2, { steps: 10 });
  await page.mouse.up();
  for (const [index, id] of ["previous", "playPause", "next", "nowPlaying"].entries()) {
    await expect(rows.nth(index)).toHaveAttribute("data-slot", id);
  }
  await dialog.getByRole("button", { name: "Done" }).click();
  // Nothing before the play controls: the band is left-aligned again.
  await expect(band(page).locator("[data-zone]")).toHaveCount(0);
  expect(await left(page, "button[aria-label='Previous']")).toBeLessThan(40);
});

for (const width of [900, 1200]) {
  test(`TR-10, TR-2: at ${width} px with the play controls last, every band control stays inside the band`, async ({
    page,
  }) => {
    await open(page);
    const dialog = await customize(page);
    const down = dialog.getByRole("button", { name: "Move Next down" });
    while (await down.isEnabled()) await down.click();
    await expect(dialog.getByRole("listitem").last()).toHaveAttribute("data-slot", "next");
    await dialog.getByRole("button", { name: "Done" }).click();
    await page.setViewportSize({ width, height: 800 });
    const bandBox = await band(page).boundingBox();
    if (!bandBox) throw new Error("no band");
    await expect(band(page).getByRole("button", { name: "Play", exact: true })).toBeVisible();
    const boxes = await band(page)
      .locator("button, [role='slider']")
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().toJSON() as DOMRect));
    for (const [index, box] of boxes.entries()) {
      expect(box.x).toBeGreaterThanOrEqual(bandBox.x);
      expect(box.x + box.width).toBeLessThanOrEqual(bandBox.x + bandBox.width + 0.5);
      // No control covers another one.
      for (const other of boxes.slice(index + 1)) {
        expect(box.x + box.width <= other.x + 0.5 || other.x + other.width <= box.x + 0.5).toBe(true);
      }
    }
    // No zone has more content than room.
    const clipped = await band(page)
      .locator("[data-zone]")
      .evaluateAll((zones) => zones.filter((zone) => zone.scrollWidth > zone.clientWidth + 1).length);
    expect(clipped).toBe(0);
  });
}
