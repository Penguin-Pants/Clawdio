// P17 UI quality audit: the state sweep with axe and reduced motion (P17-AC1, P17-AC3), the
// narrow window (P17-AC4), forced colors (P17-AC6) and input while menus and dialogs open
// (P17-AC9).
import type { Locator, Page, TestInfo } from "@playwright/test";
import {
  closeMenu,
  expect,
  expectNoMotion,
  expectNoSeriousViolations,
  openMenu,
  SONG_ROWS,
  test,
  tokenRgb,
  widget,
} from "./test-base";

const ONLINE_SETTINGS = {
  folderName: "music",
  folderState: "ready",
  onlineLookups: true,
  noticePending: false,
  portable: false,
  lastScan: null,
};

/** axe and, with reduced motion on, no motion at all: the checks of every state. */
async function check(page: Page) {
  await expectNoSeriousViolations(page);
  await expectNoMotion(page);
}

const albums = (page: Page) => widget(page, "library").getByRole("listbox", { name: "Albums" });
const songs = (page: Page) => widget(page, "library").getByRole("grid", { name: "Songs" });

test.describe("P17-AC1, P17-AC3: state sweep with reduced motion", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("first run and no folder", async ({ page }) => {
    await page.goto("/?first=1");
    await expect(page.getByRole("dialog", { name: "Online lookups" })).toBeVisible();
    await check(page);
    await page.getByRole("dialog", { name: "Online lookups" }).getByRole("button", { name: "Keep off" }).click();
    await expect(widget(page, "library").getByRole("heading", { name: "Choose your music folder" })).toBeVisible();
    // Disabled: Transport with no folder.
    await expect(widget(page, "transport").getByRole("button", { name: "Play", exact: true })).toBeDisabled();
    await check(page);
  });

  test("a missing folder", async ({ page }) => {
    await page.goto("/?missing=1");
    await expect(widget(page, "library").getByRole("heading", { name: "Music folder not found: music" })).toBeVisible();
    await check(page);
  });

  test("every widget empty", async ({ page }) => {
    await page.goto("/?measure=columns");
    await expect(widget(page, "lyrics")).toBeVisible();
    await expect(widget(page, "queue")).toContainText("The queue is empty");
    await check(page);
  });

  test("every widget populated, selected and playing", async ({ page }) => {
    await page.goto("/?data=library&measure=columns");
    await expect(widget(page, "lyrics")).toContainText("Lyric line 60");
    await check(page);
    await albums(page)
      .getByRole("option", { name: /Album B0/ })
      .click();
    await songs(page).locator(SONG_ROWS).first().click();
    await widget(page, "playlists").getByRole("option").first().click();
    await widget(page, "queue").getByRole("option").first().click();
    // The Library shows the playlist (R12 v1.9); the check covers that view, then it goes back.
    await check(page);
    await widget(page, "library").getByRole("button", { name: "Library" }).click();
    await songs(page).locator(SONG_ROWS).first().dblclick();
    await expect(widget(page, "transport").getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    await check(page);
    // Disabled: "Fetch lyrics" with Online lookups off.
    await page.evaluate(() => window.e2e.setLyrics(null));
    await expect(widget(page, "lyrics").getByRole("button", { name: "Fetch lyrics" })).toBeDisabled();
    await check(page);
  });

  test("menus and dialogs", async ({ page }) => {
    await page.addInitScript((settings) => {
      if (!sessionStorage.getItem("e2e-settings")) sessionStorage.setItem("e2e-settings", JSON.stringify(settings));
    }, ONLINE_SETTINGS);
    await page.goto("/?data=library&measure=columns");
    await expect(widget(page, "lyrics")).toBeVisible();
    await openMenu(page);
    await check(page);
    await page.getByRole("menuitem", { name: "Settings" }).click();
    await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
    await check(page);
    await page.keyboard.press("Escape");

    await albums(page)
      .getByRole("option", { name: /Album B0/ })
      .click({ button: "right" });
    await expect(page.getByRole("menu")).toBeVisible();
    await check(page);
    await page.getByRole("menuitem", { name: "Fill missing metadata" }).click();
    await expect(page.getByRole("dialog", { name: "Fill missing metadata" })).toBeVisible();
    await check(page);
    await page.keyboard.press("Escape");

    await widget(page, "playlists").getByRole("button", { name: "New playlist" }).click();
    await expect(page.getByRole("dialog", { name: "New playlist" })).toBeVisible();
    await page.getByRole("dialog").getByRole("textbox", { name: "Name" }).fill("a/b");
    await check(page);
    await page.keyboard.press("Escape");

    await widget(page, "playlists").getByRole("button", { name: "Import playlist" }).click();
    await expect(page.getByRole("dialog", { name: "Import report" })).toBeVisible();
    await check(page);
    await page.keyboard.press("Escape");
  });

  test("errors", async ({ page }) => {
    await page.goto("/?data=library&measure=columns");
    await expect(widget(page, "playlists")).toBeVisible();
    // A playlist write that fails shows the error dialog (P11-AC10).
    await widget(page, "playlists").getByRole("button", { name: "New playlist" }).click();
    await page.getByRole("dialog").getByRole("textbox", { name: "Name" }).fill("Read only");
    await page.getByRole("dialog").getByRole("button", { name: "Create" }).click();
    await songs(page).locator(SONG_ROWS).first().click({ button: "right" });
    await page.getByRole("menuitem", { name: "Add to playlist" }).click();
    await page.getByRole("menu").last().getByRole("menuitem", { name: "Read only" }).click();
    await expect(page.getByRole("dialog", { name: "Cannot save the change" })).toBeVisible();
    await check(page);
    await page.getByRole("dialog").getByRole("button", { name: "OK" }).click();
    // A status line error (a read-only album folder, P10-AC5).
    await albums(page)
      .getByRole("option", { name: /Album C0/ })
      .click({ button: "right" });
    await page.getByRole("menuitem", { name: "Set cover" }).click();
    await expect(page.locator("footer").getByRole("status")).toHaveText("The album folder is read-only");
    await check(page);
  });
});

/** Visible controls: buttons, fields, sliders, tabs and switches. */
async function controlBoxes(page: Page) {
  return page.evaluate(() => {
    const selector = "button, input, [role='slider'], [role='tab'], [role='switch'], [role='combobox']";
    return [...document.querySelectorAll(selector)]
      .filter((element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        // A hidden form input (the Select's value) is not a control.
        if (element.closest("[aria-hidden='true']")) return false;
        return style.visibility !== "hidden" && style.display !== "none" && box.width > 0 && box.height > 0;
      })
      .filter((element, _, all) => !all.some((other) => other !== element && other.contains(element)))
      .map((element) => {
        const box = element.getBoundingClientRect();
        const label = element.getAttribute("aria-label") ?? element.textContent?.trim() ?? element.tagName;
        // The visible part: the box clipped by every ancestor that hides overflow.
        let visible = { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          if (getComputedStyle(parent).overflow === "visible") continue;
          const clip = parent.getBoundingClientRect();
          visible = {
            left: Math.max(visible.left, clip.left),
            top: Math.max(visible.top, clip.top),
            right: Math.min(visible.right, clip.right),
            bottom: Math.min(visible.bottom, clip.bottom),
          };
        }
        return {
          label,
          box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
          visible,
          // Rows of scrolling lists and inactive tabs of a scrolling tab strip may scroll out;
          // the active tab may not.
          inList:
            element.closest("[role='listbox'], [role='tree'], [role='grid']") !== null ||
            (element.closest(".dv-tab") !== null && element.closest(".dv-active-tab") === null),
        };
      });
  });
}

/** No control is clipped or overlaps another (P17-AC4). Rows in scrolling lists may scroll out. */
async function expectNoClipOrOverlap(page: Page, testInfo: TestInfo, name: string) {
  const clipped = async () =>
    (await controlBoxes(page))
      .filter((control) => !control.inList)
      .filter(
        ({ box, visible }) =>
          visible.right - visible.left < box.right - box.left - 1 ||
          visible.bottom - visible.top < box.bottom - box.top - 1,
      )
      .map((control) => control.label);
  // The dock settles its tab strips a frame after a layout change.
  await expect.poll(clipped, { message: `${name}: clipped controls` }).toEqual([]);
  await testInfo.attach(`${name} at 800 x 560`, { body: await page.screenshot(), contentType: "image/png" });
  const controls = (await controlBoxes(page)).filter((control) => !control.inList);
  const overlaps: string[] = [];
  controls.forEach((a, index) => {
    for (const b of controls.slice(index + 1)) {
      const width = Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left);
      const height = Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top);
      if (width > 1 && height > 1) overlaps.push(`${a.label} / ${b.label}`);
    }
  });
  expect(overlaps, `${name}: overlapping controls`).toEqual([]);
}

/** A Library mode from the menu (radio items). */
async function setMode(page: Page, name: string) {
  await openMenu(page);
  await page.getByRole("menuitemradio", { name, exact: true }).click();
  if (await page.getByRole("menu").isVisible()) await closeMenu(page);
}

test("U4 AX-1: the Songs grid carries the grid roles and row indexes", async ({ page }) => {
  await page.goto("/?data=library");
  await widget(page, "library").getByRole("button", { name: "Top/bottom" }).click();
  const grid = songs(page);
  await expect(grid.locator(SONG_ROWS).first()).toBeVisible();
  await grid.getByRole("columnheader", { name: "Title", exact: true }).click();
  await expect(grid).toHaveAttribute("aria-multiselectable", "true");
  await expect(grid.getByRole("columnheader", { name: "Title", exact: true })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  // 20 artists of 30 songs and Beyoncé's 3: the rows plus the header row.
  await expect(grid).toHaveAttribute("aria-rowcount", String(20 * 30 + 3 + 1));
  await expect(grid.locator("[role='row']:not([aria-selected])")).toHaveAttribute("aria-rowindex", "1");
  await expect(grid.locator(SONG_ROWS).first().getByRole("gridcell").first()).toBeVisible();
  await expectNoSeriousViolations(page);
  await grid.evaluate((element) => element.scrollTo(0, 5000));
  await expect(grid.locator(SONG_ROWS).first()).not.toHaveAttribute("aria-rowindex", "2");
  // Every rendered body row: its list place plus two, with no gap and no repeat.
  const places = await grid.locator(SONG_ROWS).evaluateAll((rows) =>
    rows.map((row) => {
      // The wrapper's offset in rows is the list place (UD8).
      const wrapper = row.parentElement as HTMLElement;
      const place = Math.round(new DOMMatrix(getComputedStyle(wrapper).transform).f / wrapper.offsetHeight);
      return [Number(row.getAttribute("aria-rowindex")), place];
    }),
  );
  for (const [index, place] of places) expect(index).toBe(place + 2);
  const indexes = places.map(([index]) => index);
  expect(indexes.length).toBeGreaterThan(5);
  indexes.forEach((index, place) => expect(index).toBe(indexes[0] + place));
  expect(indexes[0]).toBeGreaterThan(2);
  await expectNoSeriousViolations(page);
});

test("P17-AC4: at 800 x 560 no control is clipped or overlaps another", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 800, height: 560 });
  await page.goto("/?data=library");
  await expect(widget(page, "library").getByRole("option", { name: "Artist 00", exact: true })).toBeVisible();
  for (const mode of ["Tree", "Columns", "Top/bottom"]) {
    await setMode(page, mode);
    await expectNoClipOrOverlap(page, testInfo, `${mode} mode`);
  }
  // A tabbed layout: Now playing as a tab in the Playlists group, beside Play queue and Lyrics.
  await page.evaluate(() => window.e2e.addAsTab("nowPlaying", "playlists"));
  await expect(widget(page, "nowPlaying")).toBeVisible();
  await expectNoClipOrOverlap(page, testInfo, "tabbed layout");
});

test("P17-AC6: in forced colors the focus ring and the toggle, switch and slider states show", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "forced colors emulation is Chromium only");
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("/?data=library");
  await expect(widget(page, "library").getByRole("option", { name: "Artist 00", exact: true })).toBeVisible();
  const background = (locator: Locator) => locator.evaluate((element) => getComputedStyle(element).backgroundColor);
  const transparent = "rgba(0, 0, 0, 0)";
  // A pressed toggle (the Library mode) differs from an unpressed one.
  const pressed = await background(widget(page, "library").getByRole("button", { name: "Columns" }));
  const plain = await background(widget(page, "library").getByRole("button", { name: "Tree" }));
  expect(pressed).not.toBe(transparent);
  expect(pressed).not.toBe(plain);
  // The seek and volume ranges show.
  const range = page.locator("[data-slot='slider-range']").first();
  expect(await background(range)).not.toBe(transparent);
  expect(await background(range)).not.toBe(await background(page.locator("[data-slot='slider-track']").first()));
  // The Online lookups switch on and off.
  await openMenu(page);
  await page.getByRole("menuitem", { name: "Settings" }).click();
  const toggle = page.getByRole("dialog", { name: "Settings" }).locator("[data-slot='switch']");
  const off = await background(toggle);
  await toggle.click();
  await expect(toggle).toHaveAttribute("data-checked");
  // The switch fades between its states: wait for the new color.
  await expect.poll(() => background(toggle)).not.toBe(off);
  // The focus ring.
  await toggle.focus();
  await page.keyboard.press("Shift");
  const ring = await toggle.evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, color: style.outlineColor };
  });
  expect(ring.style).toBe("solid");
  // The ring uses the system highlight color, not the brand red.
  expect(ring.color).not.toBe(await tokenRgb(page, "--color-brand-red"));
});

test("P17-AC9: menus and dialogs accept keys and clicks while they open", async ({ page }) => {
  await page.goto("/?data=library");
  await expect(widget(page, "library").getByRole("option", { name: "Artist 00", exact: true })).toBeVisible();
  // Keys as soon as the menu has focus, during the 200 ms open animation. WebKit moves focus
  // into the menu a frame after the items exist.
  await page.getByRole("button", { name: "Menu" }).click();
  await page.waitForFunction(() => document.activeElement?.closest('[role="menu"]') !== null);
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(page.locator("body")).toHaveAttribute("data-rescans", "1");
  // A click on a menu item and typing into a dialog while they open.
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Now playing", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(widget(page, "nowPlaying")).toBeVisible();
  await widget(page, "playlists").getByRole("button", { name: "New playlist" }).click();
  await page.getByRole("dialog").getByRole("textbox", { name: "Name" }).waitFor({ state: "attached" });
  await page.keyboard.type("Quick");
  await expect(page.getByRole("dialog").getByRole("textbox", { name: "Name" })).toHaveValue("Quick");
  await page.keyboard.press("Enter");
  await expect(widget(page, "playlists").getByRole("option", { name: /Quick/ })).toBeVisible();
});
