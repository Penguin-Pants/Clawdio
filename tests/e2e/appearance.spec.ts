// P2-AC7, P2-AC8, P2-AC9, P2-AC13 to P2-AC16: tokens, motion, axe, focus contrast, grayscale and forced colors.
import type { Locator } from "@playwright/test";
import {
  expect,
  expectNoMotion,
  expectNoSeriousViolations,
  openApp,
  openMenu,
  tab,
  test,
  tokenRgb,
  widget,
} from "./test-base";
import { grayProfile } from "./gray";

const RED_TOKENS = ["--color-brand-red", "--color-state-red-hover", "--color-state-red-active"];

test("P2-AC7: dock chrome colors come from tokens and no red shows at rest", async ({ page }) => {
  await openApp(page);
  const surface = await tokenRgb(page, "--color-bg-surface");
  const elevated = await tokenRgb(page, "--color-bg-elevated");
  const border = await tokenRgb(page, "--color-border-default");
  const primary = await tokenRgb(page, "--color-text-primary");
  const style = (selector: string, property: string, pseudo?: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((element, [name, before]) => getComputedStyle(element, before).getPropertyValue(name), [
        property,
        pseudo ?? null,
      ] as const);
  expect(await style(".dv-groupview", "background-color")).toBe(surface);
  expect(await style(".dv-tabs-and-actions-container", "background-color")).toBe(elevated);
  expect(await style(".dv-tabs-and-actions-container", "border-bottom-color")).toBe(border);
  expect(await style(".dv-tab.dv-active-tab", "color")).toBe(primary);
  expect(
    await style(
      ".dv-split-view-container > .dv-view-container > .dv-view:not(:first-child)",
      "background-color",
      "::before",
    ),
  ).toBe(border);

  const reds = await Promise.all(RED_TOKENS.map((token) => tokenRgb(page, token)));
  const found = await page.evaluate((colors) => {
    const hits: string[] = [];
    for (const element of document.querySelectorAll("body *")) {
      // Transport indicators are red by D10 (3) and P7.7: the play ring, slider ranges and thumbs.
      if (element.closest("[data-widget='transport']")) continue;
      const style = getComputedStyle(element);
      const values = [
        style.color,
        style.backgroundColor,
        style.borderTopColor,
        style.borderRightColor,
        style.borderBottomColor,
        style.borderLeftColor,
        style.outlineStyle === "none" ? "" : style.outlineColor,
        style.boxShadow,
      ];
      if (values.some((value) => colors.some((color) => value.includes(color))))
        hits.push(element.outerHTML.slice(0, 80));
    }
    return hits;
  }, reds);
  expect(found).toEqual([]);
});

test("P2-AC8: with reduced motion every duration is 0s", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openApp(page);
  await expectNoMotion(page);
  await openMenu(page);
  await expectNoMotion(page);
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expectNoMotion(page);
});

test("P2-AC9: axe finds no serious or critical violation", async ({ page }) => {
  await openApp(page);
  await expectNoSeriousViolations(page);
  await openMenu(page);
  await expectNoSeriousViolations(page);
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expectNoSeriousViolations(page);
});

test("P2-AC13: hover and focus 140 ms, menus and dialogs 200 ms, no transition on the seek bar and times", async ({
  page,
}) => {
  await openApp(page);
  const duration = (locator: Locator, property: "transitionDuration" | "animationDuration") =>
    locator.evaluate((element, name) => getComputedStyle(element)[name], property);
  expect(await duration(page.getByRole("button", { name: "Menu" }), "transitionDuration")).toBe("0.14s");
  expect(await duration(widget(page, "library").getByRole("button", { name: "Tree" }), "transitionDuration")).toBe(
    "0.14s",
  );
  expect(await duration(widget(page, "library").getByRole("searchbox"), "transitionDuration")).toBe("0.14s");
  for (const locator of await widget(page, "transport").locator("[data-slot='time'], [data-slot='seek-track']").all()) {
    expect(await duration(locator, "transitionDuration")).toBe("0s");
  }
  await openMenu(page);
  expect(await duration(page.getByRole("menu"), "animationDuration")).toBe("0.2s");
  await page.getByRole("menuitem", { name: "Settings" }).click();
  expect(await duration(page.getByRole("dialog"), "animationDuration")).toBe("0.2s");
});

/** Contrast of the focus outline against the color next to it (inside for inset rings, else outside). */
async function focusContrast(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const parse = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number);
    const opaque = (value: string) => {
      const parts = parse(value);
      return parts.length === 3 || (parts.length === 4 && parts[3] === 1);
    };
    const luminance = (value: string) => {
      const [r, g, b] = parse(value).map((channel) => {
        const c = channel / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const style = getComputedStyle(element);
    if (!element.matches(":focus-visible") || style.outlineStyle === "none") return 0;
    let current: Element | null = parseFloat(style.outlineOffset) < 0 ? element : element.parentElement;
    let background = "rgb(0, 0, 0)";
    while (current) {
      const value = getComputedStyle(current).backgroundColor;
      if (opaque(value)) {
        background = value;
        break;
      }
      current = current.parentElement;
    }
    const [a, b] = [luminance(style.outlineColor), luminance(background)].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  });
}

test("P2-AC14: focus indicators reach 3:1 against the adjacent color", async ({ page }) => {
  await openApp(page);
  const library = widget(page, "library");
  const targets: [string, Locator][] = [
    ["button", page.getByRole("button", { name: "Menu" })],
    ["input", library.getByRole("searchbox")],
    ["toggle", library.getByRole("button", { name: "Tree" })],
    ["tab", tab(page, "Library")],
  ];
  for (const [kind, locator] of targets) {
    await page.keyboard.press("Shift");
    await locator.focus();
    expect(await focusContrast(locator), kind).toBeGreaterThanOrEqual(3);
  }
  await page.getByRole("button", { name: "Menu" }).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  const item = page.locator("[role^='menuitem']:focus");
  await expect(item).toHaveCount(1);
  expect(await focusContrast(item), "menu item").toBeGreaterThanOrEqual(3);
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 350, height: 700 });
  const select = library.getByRole("combobox", { name: "Library mode" });
  await select.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  const option = page.locator("[role='option']:focus");
  await expect(option).toHaveCount(1);
  expect(await focusContrast(option), "select item").toBeGreaterThanOrEqual(3);
});

test("P2-AC15: the pressed mode, the active tab and the highlighted menu item show in grayscale", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    document.documentElement.style.filter = "grayscale(1)";
  });
  const library = widget(page, "library");
  const pressed = await grayProfile(page, library.getByRole("button", { name: "Columns" }));
  const unpressed = await grayProfile(page, library.getByRole("button", { name: "Tree" }));
  expect(pressed.bottom - unpressed.bottom).toBeGreaterThan(100);

  // The default preset has Lyrics as the inactive tab beside Play queue.
  const active = await grayProfile(page, tab(page, "Play queue"));
  const inactive = await grayProfile(page, tab(page, "Lyrics"));
  expect(active.bottom - inactive.bottom).toBeGreaterThan(100);

  await page.getByRole("button", { name: "Menu" }).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  // Disabled items (Library) can take keyboard focus and show at half opacity; the check is
  // about an enabled item.
  const highlighted = page.locator("[role^='menuitem'][data-highlighted]");
  for (let step = 0; step < 5 && (await highlighted.getAttribute("data-disabled")) !== null; step += 1) {
    await page.keyboard.press("ArrowDown");
  }
  await expect(highlighted).toHaveCount(1);
  await expect(highlighted).not.toHaveAttribute("data-disabled");
  const name = (await highlighted.textContent()) ?? "";
  const other = page
    .locator("[role^='menuitem']:not([data-highlighted]):not([data-disabled])")
    .filter({ hasNotText: name })
    .first();
  const lit = await grayProfile(page, highlighted);
  const plain = await grayProfile(page, other);
  expect(lit.left - plain.left).toBeGreaterThan(100);
});

test("P2-AC16: forced colors keep focus rings, mask icons and the art placeholder visible", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "forced colors emulation is Chromium only");
  await page.emulateMedia({ forcedColors: "active" });
  await openApp(page);
  await page.keyboard.press("Shift");
  await page.getByRole("button", { name: "Menu" }).focus();
  const ring = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement as Element);
    return { style: style.outlineStyle, color: style.outlineColor };
  });
  expect(ring.style).toBe("solid");
  expect(ring.color).not.toBe("rgba(0, 0, 0, 0)");

  const marks = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.setAttribute("data-slot", "mask-icon");
    document.body.append(probe);
    const placeholder = document.querySelector("[data-slot='art-placeholder-mark']") as Element;
    const result = [probe, placeholder].map((element) => {
      const style = getComputedStyle(element);
      const parent = getComputedStyle(element.parentElement as Element).backgroundColor;
      return { adjust: style.forcedColorAdjust, background: style.backgroundColor, parent };
    });
    probe.remove();
    return result;
  });
  for (const mark of marks) {
    expect(mark.adjust).toBe("none");
    expect(mark.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(mark.background).not.toBe(mark.parent);
  }
});
