// P10-AC4, P10-AC5 (browser part) and P10-AC7: album art in rows and Now playing, the
// placeholder, Set cover and art requests for the visible window only.
import type { Page } from "@playwright/test";
import { expect, test, widget } from "./test-base";

async function openLibrary(page: Page) {
  await page.goto("/?data=library");
  await expect(widget(page, "library").getByRole("option", { name: "Artist 00", exact: true })).toBeVisible();
}

const albums = (page: Page) => widget(page, "library").getByRole("listbox", { name: "Albums" });

async function artRequests(page: Page): Promise<number[]> {
  return JSON.parse((await page.locator("body").getAttribute("data-art-requests")) ?? "[]");
}

test("P10-AC4: albums with art show it; an album with none shows the placeholder", async ({ page }) => {
  await openLibrary(page);
  const withArt = albums(page).getByRole("option", { name: /Album A0/ });
  await expect(withArt.locator("img")).toHaveAttribute("src", /album\.jpg$/);
  await expect(widget(page, "nowPlaying").locator("img")).toHaveAttribute("src", /album\.jpg$/);

  await widget(page, "library").getByRole("searchbox", { name: "Search" }).fill("lemonade");
  const none = albums(page).getByRole("option", { name: /Lemonade/ });
  await expect(none.locator("[data-slot='art-placeholder-mark']")).toBeVisible();
  await expect(none.locator("img")).toHaveCount(0);
  await widget(page, "library").getByRole("listbox", { name: "Songs" }).getByRole("option").first().dblclick();
  await expect(widget(page, "nowPlaying")).toContainText("Pray You Catch Me");
  await expect(widget(page, "nowPlaying").locator("[data-slot='art-placeholder-mark']")).toBeVisible();
});

test("P10.2: art made after the first request shows on art-ready", async ({ page }) => {
  await openLibrary(page);
  await widget(page, "library")
    .getByRole("listbox", { name: "Artists" })
    .getByRole("option", { name: "Artist 05" })
    .click();
  const row = albums(page).getByRole("option", { name: /Album B5/ });
  await expect(row.locator("img")).toHaveAttribute("src", /album\.jpg$/);
  // The row asked once (null), then again after art-ready.
  expect((await artRequests(page)).filter((album) => album === 16).length).toBeGreaterThanOrEqual(2);
});

test("P10-AC7: album art is requested only for the visible rows plus overscan", async ({ page }) => {
  await openLibrary(page);
  await expect(
    albums(page)
      .getByRole("option", { name: /Album A0/ })
      .locator("img"),
  ).toBeVisible();
  const first = new Set(await artRequests(page));
  // 61 albums; the list shows about 10 rows plus an overscan of 8.
  expect(first.size).toBeGreaterThan(0);
  expect(first.size).toBeLessThan(30);
  // A jump to the end: a wheel scroll can pass every row on the way in some engines.
  await albums(page).evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(albums(page).getByRole("option", { name: /Lemonade/ })).toBeVisible();
  // The row asks in an effect after it renders.
  await expect.poll(async () => (await artRequests(page)).includes(60), { message: "the last album" }).toBe(true);
  expect(new Set(await artRequests(page)).size).toBeLessThan(61);
});

test("P10-AC5: Set cover is on the album menu; a read-only folder shows the error", async ({ page }) => {
  await openLibrary(page);
  await albums(page)
    .getByRole("option", { name: /Album B0/ })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Set cover" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-set-cover", "1");

  await albums(page)
    .getByRole("option", { name: /Album C0/ })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Set cover" }).click();
  await expect(page.locator("footer").getByRole("status")).toHaveText("The album folder is read-only");
});
