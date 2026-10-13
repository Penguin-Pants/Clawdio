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
  const handle = rows.nth(9).locator("[data-slot='slot-handle']");
  const from = await handle.boundingBox();
  const to = await rows.nth(4).boundingBox();
  if (!from || !to) throw new Error("no rows");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, to.y + 2, { steps: 10 });
  await page.mouse.up();
  await expect(rows.nth(4)).toHaveAttribute("data-slot", "queue");
});
