// U1: the transport band (TR-1 to TR-8, rework Phase 1 accept) as the Transport controls grid
// widget (R38.2): it fills its cells, so its height is one row of the grid (R38.1).
import type { Page } from "@playwright/test";
import { band, center, expect, expectNoMotion, expectNoSeriousViolations, test, widget } from "./test-base";

async function openLibrary(page: Page) {
  await page.goto("/?data=library");
  await expect(widget(page, "artist").getByRole("option", { name: "Artist 00", exact: true })).toBeVisible();
  await expect(band(page)).toContainText("Song 4 of Album A0");
}

/** The px height of the band's grid cells. */
async function cellHeight(page: Page): Promise<number> {
  const box = await page.locator("[data-grid-item='transport']").boundingBox();
  if (!box) throw new Error("no transport cells");
  return box.height;
}

/** The band's box, its size class and whether anything inside it wraps or overflows. */
async function bandState(page: Page) {
  return band(page).evaluate((element) => {
    const box = element.getBoundingClientRect();
    const children = [...element.children].filter((child) => getComputedStyle(child).position !== "absolute");
    const tops = children.map((child) => {
      const rect = child.getBoundingClientRect();
      return Math.round(rect.top + rect.height / 2);
    });
    return {
      size: element.dataset.size,
      width: box.width,
      height: box.height,
      overflowY: element.scrollHeight - element.clientHeight,
      overflowX: element.scrollWidth - element.clientWidth,
      oneRow: Math.max(...tops) - Math.min(...tops) <= 1,
    };
  });
}

/** Narrows the band itself (TR-2: the band measures its own width, not the window). */
async function setBandWidth(page: Page, width: number) {
  await band(page).evaluate((element, value) => {
    element.style.width = `${value}px`;
  }, width);
}

test("U1-AC2: the size class follows the band width at 1280, 1100 and 800 px", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openLibrary(page);
  await expect(band(page)).toHaveAttribute("data-size", "xl");
  await page.setViewportSize({ width: 1100, height: 800 });
  await expect(band(page)).toHaveAttribute("data-size", "lg");
  await page.setViewportSize({ width: 800, height: 560 });
  await expect(band(page)).toHaveAttribute("data-size", "md");
  const state = await bandState(page);
  expect(state.height).toBeCloseTo(await cellHeight(page), 0);
  expect(state.oneRow).toBe(true);
  expect(state.overflowY).toBeLessThanOrEqual(0);
  await expect(band(page).getByRole("button", { name: "Play", exact: true })).toBeVisible();
});

test("U1-AC2, rework Phase 1 accept: from 800 to 2560 px the band never wraps, keeps its row height and keeps Play", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await openLibrary(page);
  const height = (await bandState(page)).height;
  for (const width of [800, 900, 1024, 1199, 1200, 1600, 1920, 2560]) {
    await page.setViewportSize({ width, height: 600 });
    // The full-width band: the window less its grip strip.
    await expect.poll(async () => width - (await bandState(page)).width).toBeLessThan(24);
    const state = await bandState(page);
    expect(state.height, `${width} px`).toBe(height);
    expect(state.oneRow, `${width} px wraps`).toBe(true);
    expect(state.overflowX, `${width} px overflows`).toBeLessThanOrEqual(0);
    await expect(band(page).getByRole("button", { name: "Play", exact: true })).toBeVisible();
  }
});

test("TR-2, TR-3: at 600 and 400 px the band shows SM and XS, the progress line and the overflow items", async ({
  page,
}) => {
  await openLibrary(page);
  await setBandWidth(page, 600);
  await expect(band(page)).toHaveAttribute("data-size", "sm");
  await expect(band(page).getByRole("progressbar", { name: "Playback position" })).toBeVisible();
  await expect(band(page).getByRole("slider", { name: "Seek" })).toHaveCount(0);
  await expect(band(page).getByRole("button", { name: "Previous" })).toBeVisible();
  expect((await bandState(page)).oneRow).toBe(true);
  await band(page).getByRole("button", { name: "More" }).click();
  for (const name of ["Seek…", "Stop", "Volume…"]) await expect(page.getByRole("menuitem", { name })).toBeVisible();
  for (const name of ["Shuffle", "Play queue"])
    await expect(page.getByRole("menuitemcheckbox", { name })).toBeVisible();
  await page.keyboard.press("Escape");

  await setBandWidth(page, 400);
  await expect(band(page)).toHaveAttribute("data-size", "xs");
  await expect(band(page).getByRole("button", { name: "Previous" })).toHaveCount(0);
  await expect(band(page).getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await band(page).getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Previous" }).click();
  expect(JSON.parse((await page.locator("body").getAttribute("data-player-calls")) ?? "[]")).toContain(
    "player_previous",
  );
  // Seek moves to the overflow menu and keeps the keyboard path (TR-4).
  await band(page).getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Seek…" }).click();
  const seek = page.getByRole("dialog").getByRole("slider", { name: "Seek" });
  await expect(seek).toBeVisible();
  await seek.focus();
  await page.keyboard.press("End");
  // Previous started the song before, so the end is that song's length.
  const end = Number(await seek.evaluate((element) => (element as HTMLInputElement).max)) * 1000;
  await expect(page.locator("body")).toHaveAttribute("data-seek", String(end));
});

test("TR-4: the seek bar seeks by click, by drag and by keyboard", async ({ page }) => {
  await openLibrary(page);
  const seek = band(page).getByRole("slider", { name: "Seek" });
  const track = band(page).locator("[data-slot='seek'] [data-slot='slider-track']");
  const box = await track.boundingBox();
  if (!box) throw new Error("no seek track");
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height / 2);
  await expect.poll(async () => Number(await page.locator("body").getAttribute("data-seek"))).toBeLessThan(40_000);
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => Number(await page.locator("body").getAttribute("data-seek"))).toBeGreaterThan(85_000);
  await seek.focus();
  await page.keyboard.press("Home");
  await expect(page.locator("body")).toHaveAttribute("data-seek", "0");
  await expect(band(page).locator("[data-slot='time']")).toHaveText(["0:00", "2:04"]);
});

test("TR-5 to TR-8: text ellipsis, no overlap with the dock, opaque background, 32 px buttons and tooltips", async ({
  page,
}) => {
  await openLibrary(page);
  for (const slot of ["title", "artist"]) {
    const text = band(page).locator(`[data-slot='now-playing'] [data-slot='${slot}']`);
    await expect(text).toHaveCSS("text-overflow", "ellipsis");
    await expect(text).toHaveCSS("white-space", "nowrap");
  }
  await expect(band(page).locator("[data-slot='now-playing'] img")).toBeVisible();
  // TR-6, R38.2: the band is a grid widget, and no other widget's box intersects it.
  const bandBox = await band(page).boundingBox();
  if (!bandBox) throw new Error("no box");
  for (const item of await page.locator("[data-grid-item]:not([data-grid-item='transport'])").all()) {
    const box = await item.boundingBox();
    if (box) expect(box.y).toBeGreaterThanOrEqual(bandBox.y + bandBox.height - 0.5);
  }
  // SH-3, R38.1: the grid takes the window less the header and the status line.
  const chrome = await page.evaluate(() =>
    ["header", "footer"].map((selector) => document.querySelector(selector)?.getBoundingClientRect().height ?? 0),
  );
  const gridBox = await page.locator("[data-grid]").boundingBox();
  expect(Math.abs((gridBox?.height ?? 0) - (800 - chrome[0] - chrome[1]))).toBeLessThanOrEqual(1);
  // TR-7: opaque.
  const alpha = await band(page).evaluate((element) => {
    const color = getComputedStyle(element).backgroundColor;
    const match = color.match(/rgba?\(([^)]+)\)/);
    const parts = match ? match[1].split(",").map((part) => part.trim()) : [];
    return parts.length === 4 ? Number(parts[3]) : 1;
  });
  expect(alpha).toBe(1);
  // TR-8: every button has a name and a 32 x 32 px box.
  for (const button of await band(page).getByRole("button").all()) {
    expect(await button.getAttribute("aria-label")).toBeTruthy();
    const box = await button.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(32);
    expect(box?.height).toBeGreaterThanOrEqual(32);
  }
  const play = await center(band(page).getByRole("button", { name: "Play", exact: true }));
  await page.mouse.move(play.x, play.y);
  await expect(page.getByText("Play (Space)", { exact: true })).toBeVisible();
});

for (const percent of [100, 125, 140]) {
  test(`TH-1, R38.1: at a ${percent}% root font the band fills its row and its content fits`, async ({ page }) => {
    await openLibrary(page);
    await page.evaluate((value) => {
      document.documentElement.style.fontSize = `${value}%`;
    }, percent);
    await expect.poll(async () => (await bandState(page)).height).toBeCloseTo(await cellHeight(page), 0);
    const state = await bandState(page);
    expect(state.overflowY).toBeLessThanOrEqual(0);
    expect(state.oneRow).toBe(true);
  });
}

test("AX-1, AX-2: axe finds no serious violation with the band, and reduced motion holds", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openLibrary(page);
  await expectNoSeriousViolations(page);
  await expectNoMotion(page);
  await setBandWidth(page, 400);
  await expect(band(page)).toHaveAttribute("data-size", "xs");
  await expectNoSeriousViolations(page);
});
