// P4-AC1, P4-AC2: the first-run notice and the no-folder state.
import { expect, openMenu, test, widget } from "./test-base";

test("P4-AC1: the notice names the services and the files, and the choice persists", async ({ page }) => {
  await page.goto("/?first=1");
  const notice = page.getByRole("dialog", { name: "Online lookups" });
  await expect(notice).toBeVisible();
  for (const text of ["MusicBrainz", "Cover Art Archive", "LRCLIB", "cover.jpg", ".lrc", ".txt", "sidecar.json"]) {
    await expect(notice).toContainText(text);
  }
  await page.keyboard.press("Escape");
  await expect(notice).toBeVisible();
  await notice.getByRole("button", { name: "Turn on" }).click();
  await expect(notice).toHaveCount(0);

  await page.reload();
  await expect(widget(page, "library")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Online lookups" })).toHaveCount(0);
  await openMenu(page);
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" }).getByRole("switch")).toBeChecked();
});

test("P4-AC1: Keep off leaves Online lookups off", async ({ page }) => {
  await page.goto("/?first=1");
  await page.getByRole("dialog", { name: "Online lookups" }).getByRole("button", { name: "Keep off" }).click();
  await openMenu(page);
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" }).getByRole("switch")).not.toBeChecked();
});

test("P4-AC2: with no folder the Library asks for one, Transport is disabled and widgets show hints", async ({
  page,
}) => {
  await page.goto("/?first=1");
  await page.getByRole("dialog", { name: "Online lookups" }).getByRole("button", { name: "Keep off" }).click();
  const library = widget(page, "library");
  await expect(library.getByRole("heading", { name: "Choose your music folder" })).toBeVisible();
  const heading = await library.getByRole("heading").evaluate((element) => getComputedStyle(element).fontSize);
  expect(heading).toBe("24px");
  for (const name of ["Shuffle", "Previous", "Play", "Stop", "Next", "Repeat"]) {
    await expect(widget(page, "transport").getByRole("button", { name, exact: true })).toBeDisabled();
  }
  await expect(widget(page, "transport")).toContainText("Nothing playing");

  await library.getByRole("button", { name: "Choose music folder" }).click();
  await expect(page.locator("[data-library-body]")).toBeVisible();
  // The queue is still empty, so Transport stays disabled (P7.7).
  await expect(widget(page, "transport").getByRole("button", { name: "Play", exact: true })).toBeDisabled();
});
