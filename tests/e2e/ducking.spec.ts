// P20-AC3: "When the microphone is in use" in Settings, on the mocked IPC. Windows shows it;
// other platforms do not (D53).
import type { Page } from "@playwright/test";
import { expect, openMenu, test } from "./test-base";

async function openSettings(page: Page, query = "") {
  await page.goto(`/${query}`);
  await openMenu(page);
  await page.getByRole("menuitem", { name: "Settings" }).click();
  return page.getByRole("dialog", { name: "Settings" });
}

test("P20-AC3: the ducking modes, and the slider only for Lower volume", async ({ page }) => {
  const dialog = await openSettings(page);
  const modes = dialog.getByRole("group", { name: "When the microphone is in use" });
  await expect(modes.getByRole("button", { name: "Off" })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("slider", { name: "Ducked volume" })).toHaveCount(0);
  await expect(dialog).toContainText("Always-On Microphone");

  await modes.getByRole("button", { name: "Lower volume" }).click();
  await expect(modes.getByRole("button", { name: "Lower volume" })).toHaveAttribute("aria-pressed", "true");
  const slider = dialog.getByRole("slider", { name: "Ducked volume" });
  await expect(slider).toHaveAttribute("aria-valuetext", "20 percent of your volume");
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuetext", "25 percent of your volume");
  await expect(dialog).toContainText("Volume 25%");

  await modes.getByRole("button", { name: "Pause" }).click();
  await expect(modes.getByRole("button", { name: "Pause" })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("slider", { name: "Ducked volume" })).toHaveCount(0);

  // The choice is saved: it shows again after a reload.
  await page.reload();
  await openMenu(page);
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" }).getByRole("button", { name: "Pause" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("P20-AC3, D53: other platforms show no microphone setting", async ({ page }) => {
  const dialog = await openSettings(page, "?linux=1");
  await expect(dialog.getByRole("heading", { name: "Online lookups" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Microphone" })).toHaveCount(0);
  await expect(dialog.getByRole("group", { name: "When the microphone is in use" })).toHaveCount(0);
});
