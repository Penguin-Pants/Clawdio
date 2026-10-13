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
