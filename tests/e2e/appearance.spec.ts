// P2-AC7, P2-AC8, P2-AC9, P2-AC13 to P2-AC16: tokens, motion, axe, focus contrast, grayscale and forced colors.
import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { expect, openApp, openMenu, settle, tab, test, tokenRgb, widget } from "./test-base";

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

async function expectNoMotion(page: Page) {
  const moving = await page.evaluate(() =>
    [...document.querySelectorAll("*")]
      .filter((element) => {
        const style = getComputedStyle(element);
        const durations = `${style.transitionDuration},${style.animationDuration}`.split(",");
        return durations.some((value) => value.trim() !== "0s");
      })
      .map((element) => element.outerHTML.slice(0, 80)),
  );
  expect(moving).toEqual([]);
}

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

async function expectNoSeriousViolations(page: Page) {
  await settle(page);
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`);
  expect(serious).toEqual([]);
}

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

/** Mean grayscale brightness (0 to 255) of the bottom rows and left columns of an element screenshot. */
async function grayProfile(page: Page, locator: Locator) {
  const png = (await locator.screenshot()).toString("base64");
  return page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d") as CanvasRenderingContext2D;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    const gray = (x: number, y: number) => {
      const i = (y * image.width + x) * 4;
      return 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    };
    const row = (y: number) => {
      let sum = 0;
      for (let x = 0; x < image.width; x += 1) sum += gray(x, y);
      return sum / image.width;
    };
    const column = (x: number) => {
      let sum = 0;
      for (let y = 0; y < image.height; y += 1) sum += gray(x, y);
      return sum / image.height;
    };
    return {
      bottom: Math.min(row(image.height - 1), row(image.height - 2)),
      left: Math.min(column(0), column(1)),
    };
  }, png);
}

test("P2-AC15: the pressed mode, the active tab and the highlighted menu item show in grayscale", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    document.documentElement.style.filter = "grayscale(1)";
  });
  const library = widget(page, "library");
  const pressed = await grayProfile(page, library.getByRole("button", { name: "Columns" }));
  const unpressed = await grayProfile(page, library.getByRole("button", { name: "Tree" }));
  expect(pressed.bottom - unpressed.bottom).toBeGreaterThan(100);

  await page.evaluate(() => window.e2e.addAsTab("queue", "transport"));
  const active = await grayProfile(page, tab(page, "Play queue"));
  const inactive = await grayProfile(page, tab(page, "Transport controls"));
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
