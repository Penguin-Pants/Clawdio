// U2 (DK-3, AX-1, UD17): float a widget, move it, dock it again, by pointer and by keyboard.
import type { Page } from "@playwright/test";
import { closeMenu, drag, expect, groupAction, openApp, openMenu, test, widget } from "./test-base";

const floating = (page: Page) => page.locator(".dv-groupview-floating, .dv-resize-container");

test("DK-3: the tab Float control floats Play queue; the group moves; Dock puts it back", async ({ page }) => {
  await openApp(page);
  await groupAction(page, "queue", "Play queue", "Float widget");
  await expect(floating(page).first()).toBeVisible();
  const container = page.locator(".dv-resize-container", { has: widget(page, "queue") });
  await expect(container).toBeVisible();
  const before = await container.boundingBox();
  const handle = container.locator(".dv-floating-titlebar").first();
  const handleBox = (await handle.count()) > 0 ? await handle.boundingBox() : before;
  if (!before || !handleBox) throw new Error("no floating group");
  const from = { x: handleBox.x + handleBox.width / 2, y: handleBox.y + Math.min(6, handleBox.height / 2) };
  await drag(page, from, { x: from.x - 150, y: from.y + 60 });
  const after = await container.boundingBox();
  expect(after?.x).toBeLessThan(before.x - 100);
  // The move is saved (PS-1, UD17).
  const savedLeft = () =>
    page.evaluate(
      () => JSON.parse(sessionStorage.getItem("e2e-layout") ?? "{}").dock?.floatingGroups?.[0]?.position?.left ?? -1,
    );
  await expect.poll(savedLeft).toBeGreaterThanOrEqual(0);
  await expect.poll(savedLeft).toBeLessThan(before.x - 100);
  await groupAction(page, "queue", "Play queue", "Dock widget");
  await expect(page.locator(".dv-resize-container", { has: widget(page, "queue") })).toHaveCount(0);
  await expect(widget(page, "queue")).toBeVisible();
});

test("DK-3, AX-1: by keyboard: F6 to a widget, Float widget, then Dock widget", async ({ page }) => {
  await openApp(page);
  // F6 order: band, Playlists, ...
  await page.keyboard.press("F6");
  await page.keyboard.press("F6");
  await expect(page.locator(":focus")).toHaveAttribute("data-widget", "playlists");
  await page.getByRole("button", { name: "Menu" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Dock widget" })).toHaveAttribute("aria-disabled", "true");
  await page.getByRole("menuitem", { name: "Float widget" }).press("Enter");
  await expect(page.locator(".dv-resize-container", { has: widget(page, "playlists") })).toBeVisible();
  await page.getByRole("button", { name: "Menu" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Float widget" })).toHaveAttribute("aria-disabled", "true");
  await page.getByRole("menuitem", { name: "Dock widget" }).press("Enter");
  await expect(page.locator(".dv-resize-container", { has: widget(page, "playlists") })).toHaveCount(0);
  await expect(widget(page, "playlists")).toBeVisible();
});

test("DK-3: a floating group survives a reload and stays inside the window", async ({ page }) => {
  await openApp(page);
  await groupAction(page, "queue", "Play queue", "Float widget");
  await expect(page.locator(".dv-resize-container", { has: widget(page, "queue") })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => (JSON.parse(sessionStorage.getItem("e2e-layout") ?? "{}").dock?.floatingGroups ?? []).length),
    )
    .toBe(1);
  await page.setViewportSize({ width: 800, height: 560 });
  await page.reload();
  const container = page.locator(".dv-resize-container", { has: widget(page, "queue") });
  await expect(container).toBeVisible();
  const box = await container.boundingBox();
  if (!box) throw new Error("no floating group");
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(801);
  expect(box.y + box.height).toBeLessThanOrEqual(561);
  await openMenu(page);
  await closeMenu(page);
  await expect(widget(page, "library")).toHaveCount(1);
});
