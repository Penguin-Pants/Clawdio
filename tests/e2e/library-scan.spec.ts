// P5-AC6 and P5-AC12, browser part: the last scan counts, Rescan and the missing folder screen.
import { libraryArea, expect, openMenu, test } from "./test-base";

test("P5-AC6: Settings shows the counts of the last scan", async ({ page }) => {
  await page.goto("/");
  await openMenu(page);
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toContainText(
    "Last scan: 12 added, 1 removed, 2 skipped",
  );
});

test("P5: Rescan in the menu starts a scan", async ({ page }) => {
  await page.goto("/");
  await openMenu(page);
  await page.getByRole("menuitem", { name: "Rescan" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-rescans", "1");
});

test("P5-AC12: with the folder missing the Library shows the message and Change folder", async ({ page }) => {
  await page.goto("/?missing=1");
  const library = libraryArea(page);
  await expect(library.getByRole("heading", { name: "Music folder not found: music" })).toBeVisible();
  await expect(library.getByRole("grid", { name: "Songs" })).toHaveCount(0);
  await openMenu(page);
  await expect(page.getByRole("menuitem", { name: "Rescan" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await library.getByRole("button", { name: "Change folder" }).click();
  await expect(library.getByRole("grid", { name: "Songs" })).toBeVisible();
});
