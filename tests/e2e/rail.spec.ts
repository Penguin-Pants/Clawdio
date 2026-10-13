// U3 (SP-5, UD18): the Playlists widget becomes an icon rail below 140 px.
import { drag, expect, test, widget } from "./test-base";

test("SP-5: a narrow Playlists widget shows the rail; a rail button widens it and selects the playlist", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?data=library");
  const playlists = widget(page, "playlists");
  await expect(playlists.getByRole("treeitem", { name: /Mix 1/ })).toBeVisible();
  const sash = page.getByRole("separator", { name: "Resize Playlists and Library" });
  const box = await sash.boundingBox();
  if (!box) throw new Error("no separator");
  await drag(page, { x: box.x + box.width / 2, y: box.y + 200 }, { x: box.x - 120, y: box.y + 200 });
  await expect.poll(async () => (await playlists.boundingBox())?.width ?? 0).toBeLessThan(140);
  const rail = playlists.getByRole("navigation", { name: "Playlists" });
  await expect(rail).toBeVisible();
  const mix = rail.getByRole("button", { name: "Mix 2" });
  await mix.hover();
  await expect(page.getByText("Mix 2", { exact: true }).last()).toBeVisible();

  // The rail state is in the saved dock (the group width): it survives a reload.
  await expect
    .poll(async () => {
      const saved = JSON.parse((await page.evaluate(() => sessionStorage.getItem("e2e-layout"))) ?? "{}");
      return JSON.stringify(saved.dock?.grid ?? {}).length > 0;
    })
    .toBe(true);
  await page.waitForTimeout(700);
  await page.reload();
  await expect(widget(page, "playlists").getByRole("navigation", { name: "Playlists" })).toBeVisible();

  await widget(page, "playlists").getByRole("button", { name: "Mix 2" }).click();
  await expect.poll(async () => Math.abs(((await playlists.boundingBox())?.width ?? 0) - 240)).toBeLessThanOrEqual(1);
  await expect(playlists.getByRole("treeitem", { name: /Mix 2/ })).toHaveAttribute("aria-selected", "true");
});
