// U3 (SP-5, UD18): the Playlists widget becomes an icon rail below 140 px.
import { drag, expect, group, test, widget } from "./test-base";

test("SP-5: a narrow Playlists widget shows the rail; a rail button shows the playlist in the Library", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?data=library");
  const playlists = widget(page, "playlists");
  await expect(playlists.getByRole("option", { name: /Mix 1/ })).toBeVisible();
  const sash = page.getByRole("separator", { name: "Resize Playlists and Library" });
  const box = await sash.boundingBox();
  if (!box) throw new Error("no separator");
  await drag(page, { x: box.x + box.width / 2, y: box.y + 200 }, { x: box.x - 120, y: box.y + 200 });
  await expect.poll(async () => (await playlists.boundingBox())?.width ?? 0).toBeLessThan(140);
  const rail = playlists.getByRole("navigation", { name: "Playlists" });
  await expect(rail).toBeVisible();
  // The narrow group keeps its tab (grip only) in the tab strip, not in the overflow list.
  const tabStrip = group(page, "playlists").locator(".dv-tabs-container");
  await expect(tabStrip.locator(".dv-tab")).toHaveCount(1);
  await expect(tabStrip.locator(".dv-tab")).toBeVisible();
  await expect(group(page, "playlists").locator(".dv-tabs-overflow-dropdown-root")).toHaveCount(0);
  const mix = rail.getByRole("button", { name: "Mix 2" });
  await mix.hover();
  await expect(page.getByText("Mix 2", { exact: true }).last()).toBeVisible();

  // The rail state is in the saved dock (the group width): it survives a reload once saved.
  await expect
    .poll(() =>
      page.evaluate(() => {
        // The saved width of the leaf that holds Playlists.
        type Node = { type: string; data: unknown; size: number };
        const find = (node: Node): number | null => {
          if (node.type === "leaf")
            return (node.data as { views: string[] }).views.includes("playlists") ? node.size : null;
          for (const child of node.data as Node[]) {
            const size = find(child);
            if (size !== null) return size;
          }
          return null;
        };
        const saved = JSON.parse(sessionStorage.getItem("e2e-layout") ?? "null");
        return saved ? find(saved.dock.grid.root) : null;
      }),
    )
    .toBeLessThan(140);
  await page.reload();
  await expect(widget(page, "playlists").getByRole("navigation", { name: "Playlists" })).toBeVisible();

  // A rail button shows the playlist in the Library and keeps the rail (R12 v1.9).
  await widget(page, "playlists").getByRole("button", { name: "Mix 2" }).click();
  await expect(widget(page, "library").getByRole("listbox", { name: "Songs in Mix 2" })).toBeVisible();
  await expect(widget(page, "playlists").getByRole("navigation", { name: "Playlists" })).toBeVisible();
});

test("SP-5: a narrow Playlists widget with no playlists still shows the empty hint", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const playlists = widget(page, "playlists");
  await expect(playlists).toContainText("No playlists yet.");
  const sash = page.getByRole("separator", { name: "Resize Playlists and Library" });
  const box = await sash.boundingBox();
  if (!box) throw new Error("no separator");
  await drag(page, { x: box.x + box.width / 2, y: box.y + 200 }, { x: box.x - 120, y: box.y + 200 });
  await expect.poll(async () => (await playlists.boundingBox())?.width ?? 0).toBeLessThan(140);
  await expect(playlists).toContainText("No playlists yet.");
});
