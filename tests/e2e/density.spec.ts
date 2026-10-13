// U6 (TB-14): Compact rows in the View menu, saved in columns.json.
import { expect, expectNoMotion, openMenu, closeMenu, SONG_ROWS, songsGrid, test, widget } from "./test-base";

test("TB-14: Compact rows use the compact row token, survive a reload and keep the album rows", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?data=library");
  await expect(widget(page, "library").getByRole("option", { name: "Artist 00", exact: true })).toBeVisible();
  const height = () =>
    songsGrid(page)
      .locator(SONG_ROWS)
      .first()
      .evaluate((row) => row.getBoundingClientRect().height);
  const token = (name: string) =>
    page.evaluate((variable) => {
      const style = getComputedStyle(document.documentElement);
      return Number.parseFloat(style.getPropertyValue(variable)) * Number.parseFloat(style.fontSize);
    }, name);
  expect(await height()).toBe(await token("--size-row-regular"));
  const album = await widget(page, "library")
    .getByRole("listbox", { name: "Albums" })
    .getByRole("option")
    .nth(1)
    .boundingBox();

  await openMenu(page);
  await page.getByRole("menuitemcheckbox", { name: "Compact rows" }).click();
  await closeMenu(page);
  await expect.poll(height).toBe(await token("--size-row-compact"));
  const queueRow = widget(page, "queue").getByRole("option").first();
  expect((await queueRow.boundingBox())?.height).toBe(await token("--size-row-compact"));
  const albumAfter = await widget(page, "library")
    .getByRole("listbox", { name: "Albums" })
    .getByRole("option")
    .nth(1)
    .boundingBox();
  expect(albumAfter?.height).toBe(album?.height);
  await expectNoMotion(page);

  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem("e2e-columns") ?? ""))
    .toContain('"density":"compact"');
  await page.reload();
  await expect(songsGrid(page).locator(SONG_ROWS).first()).toBeVisible();
  await expect.poll(height).toBe(await token("--size-row-compact"));
  await openMenu(page);
  await expect(page.getByRole("menuitemcheckbox", { name: "Compact rows" })).toHaveAttribute("aria-checked", "true");
});
