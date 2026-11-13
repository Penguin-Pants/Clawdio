// U3 (SP-5, UD18): the Playlists widget becomes an icon rail below 140 px, at 2 cells in a small window.
import { expect, test, widget } from "./test-base";

test("SP-5: a 2-cell Playlists widget in an 800 px window shows the rail; a rail button shows the playlist", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 560 });
  await page.goto("/?data=library");
  const playlists = widget(page, "playlists");
  await expect.poll(async () => (await playlists.boundingBox())?.width ?? 0).toBeLessThan(140);
  const rail = playlists.getByRole("navigation", { name: "Playlists" });
  await expect(rail).toBeVisible();
  const mix = rail.getByRole("button", { name: "Mix 2" });
  await mix.hover();
  await expect(page.getByText("Mix 2", { exact: true }).last()).toBeVisible();
  // A wider window gives the same 2 cells more width: the names show again.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(playlists.getByRole("option", { name: /Mix 1/ })).toBeVisible();
  await page.setViewportSize({ width: 800, height: 560 });
  await expect(rail).toBeVisible();
  // A rail button shows the playlist in the Songs widget and keeps the rail (R12 v1.9).
  await rail.getByRole("button", { name: "Mix 2" }).click();
  await expect(widget(page, "songs").getByRole("listbox", { name: "Songs in Mix 2" })).toBeVisible();
  await expect(rail).toBeVisible();
});

test("SP-5: a narrow Playlists widget with no playlists still shows the empty hint", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 560 });
  await page.goto("/");
  const playlists = widget(page, "playlists");
  await expect(playlists).toContainText("No playlists yet.");
  await expect.poll(async () => (await playlists.boundingBox())?.width ?? 0).toBeLessThan(140);
  await expect(playlists).toContainText("No playlists yet.");
});

test("SP-5, R12: Enter and double-click on a rail button play the playlist", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 560 });
  await page.goto("/?data=library");
  const playlists = widget(page, "playlists");
  const rail = playlists.getByRole("navigation", { name: "Playlists" });
  const lastPlay = async () => JSON.parse((await page.locator("body").getAttribute("data-play-list")) ?? "null");
  await rail.getByRole("button", { name: "Mix 1" }).focus();
  await page.keyboard.press("Enter");
  await expect.poll(lastPlay).toEqual({ ids: [0, 1, 2, 3, 4], start: 0 });
  await expect(widget(page, "songs").getByRole("listbox", { name: "Songs in Mix 1" })).toBeVisible();
  await rail.getByRole("button", { name: "Mix 2" }).dblclick();
  await expect.poll(lastPlay).toEqual({ ids: [10, 11, 12, 13, 14], start: 0 });
});
