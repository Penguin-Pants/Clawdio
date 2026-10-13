// U2 (SP-4, UD16): sidebars keep their pixel widths and Library absorbs a window resize.
import { expect, openApp, test, widget } from "./test-base";

test("SP-4: from 1280 to 1600 px wide, Playlists and Play queue keep their widths and Library grows", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  const width = async (id: string) => (await widget(page, id).boundingBox())?.width ?? 0;
  await expect.poll(() => width("playlists")).toBeGreaterThan(200);
  const before = { playlists: await width("playlists"), queue: await width("queue"), library: await width("library") };
  await page.setViewportSize({ width: 1600, height: 800 });
  await expect.poll(() => width("library")).toBeGreaterThan(before.library + 300);
  expect(Math.abs((await width("playlists")) - before.playlists)).toBeLessThanOrEqual(1);
  expect(Math.abs((await width("queue")) - before.queue)).toBeLessThanOrEqual(1);
  expect(Math.abs((await width("library")) - before.library - 320)).toBeLessThanOrEqual(1);
});

test("SP-4: a restart in a wider window keeps the side widths; Library takes the new width", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto("/?data=library");
  await expect(widget(page, "library").getByRole("option", { name: "Artist 00", exact: true })).toBeVisible();
  const width = async (id: string) => (await widget(page, id).boundingBox())?.width ?? 0;
  // A change of the arrangement saves it: widen Playlists by one separator step.
  await page
    .getByRole("separator", { name: /^Resize Playlists/ })
    .first()
    .focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => width("playlists")).toBeGreaterThan(240);
  const before = { playlists: await width("playlists"), library: await width("library"), queue: await width("queue") };
  // Wait for the layout save of this arrangement.
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("e2e-layout") !== null)).toBe(true);
  await page.setViewportSize({ width: 1600, height: 800 });
  await page.reload();
  await expect(widget(page, "library").getByRole("option", { name: "Artist 00", exact: true })).toBeVisible();
  await expect.poll(() => width("queue")).toBeCloseTo(before.queue, -1);
  expect(await width("playlists")).toBeCloseTo(before.playlists, -1);
  expect(await width("library")).toBeCloseTo(before.library + 400, -1);
});
