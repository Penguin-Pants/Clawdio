// Arrange mode (owner answers Q13, Q14; replaces Lock layout R38.9): the menu item and
// Ctrl+Shift+A turn it on, the status line says how it works, and it is not saved.
import {
  closeMenu,
  cover,
  expect,
  expectNoSeriousViolations,
  layoutOf,
  openApp,
  openMenu,
  setWidgetShown,
  test,
  widget,
} from "./test-base";

test("Q13: the menu turns Arrange mode on and off; show and hide work in both modes", async ({ page }) => {
  await openApp(page);
  await expect(page.locator("[data-arrange]")).toHaveCount(0);
  await openMenu(page);
  await expect(page.getByRole("menuitemcheckbox", { name: "Lock layout" })).toHaveCount(0);
  const item = page.getByRole("menuitemcheckbox", { name: /^Arrange layout/ });
  await expect(item).toContainText("Ctrl+Shift+A");
  await expect(page.getByRole("menuitem", { name: /^Move or resize/ })).toHaveAttribute("aria-disabled", "true");
  await item.click();
  await closeMenu(page);
  await expect(cover(page, "songs")).toBeVisible();
  await expect(page.locator("footer").getByRole("status")).toContainText("Arrange layout");
  await expectNoSeriousViolations(page);
  await setWidgetShown(page, "Lyrics", true);
  await expect(cover(page, "lyrics")).toBeVisible();
  await page.locator("body").press("Control+Shift+A");
  await expect(page.locator("[data-arrange]")).toHaveCount(0);
  await setWidgetShown(page, "Lyrics", false);
  await expect(widget(page, "lyrics")).toHaveCount(0);
});

test("Q13: Arrange mode is not saved; a moved widget is", async ({ page }) => {
  await openApp(page);
  await page.locator("body").press("Control+Shift+A");
  await cover(page, "nowPlaying").focus();
  await page.keyboard.press("ArrowDown");
  const layout = await layoutOf(page);
  await expect
    .poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("e2e-layout") ?? "{}").widgets))
    .toEqual(layout);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("e2e-layout") ?? "{}"))).not.toHaveProperty(
    "locked",
  );
  await page.reload();
  await expect(widget(page, "songs")).toBeVisible();
  await expect(page.locator("[data-arrange]")).toHaveCount(0);
  expect(await layoutOf(page)).toEqual(layout);
});
