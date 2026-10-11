import { existsSync, readdirSync, readFileSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BRAND_ICON,
  ICON_DIR,
  PLACEHOLDER_ICON,
  generateIcons,
  isUpToDate,
  listedIcons,
  pickSource,
  pruneOutputs,
} from "./icons.mjs";
import { REPO_ROOT, tempDir, writeFile } from "./test-helpers";

const SQUARE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64"/></svg>';

function fixtureRoot(withBrandIcon: boolean): string {
  const root = tempDir();
  writeFile(root, "src-tauri/tauri.conf.json", readFileSync(join(REPO_ROOT, "src-tauri/tauri.conf.json"), "utf8"));
  writeFile(root, PLACEHOLDER_ICON, SQUARE);
  if (withBrandIcon) writeFile(root, BRAND_ICON, SQUARE);
  return root;
}

describe("icons", () => {
  it("uses the brand icon when it exists, else the placeholder", () => {
    expect(pickSource(fixtureRoot(true))).toMatch(/clawdio-icon-full\.svg$/);
    expect(pickSource(fixtureRoot(false))).toMatch(/placeholder\/icon\.svg$/);
  });

  it("reads the icon list from bundle.icon (D9)", () => {
    expect(listedIcons(REPO_ROOT)).toEqual([
      "32x32.png",
      "64x64.png",
      "128x128.png",
      "128x128@2x.png",
      "icon.png",
      "icon.ico",
    ]);
  });

  it("rejects an icon list outside icons/", () => {
    const root = tempDir();
    writeFile(root, "src-tauri/tauri.conf.json", JSON.stringify({ bundle: { icon: ["other/a.png"] } }));
    expect(() => listedIcons(root)).toThrow("is not in icons/");
  });

  it("is up to date only when every output exists and is newer than the source", () => {
    const root = tempDir();
    writeFile(root, "s.svg", SQUARE);
    writeFile(root, "a.png", "");
    const [source, output] = [join(root, "s.svg"), join(root, "a.png")];
    utimesSync(source, 1000, 1000);
    utimesSync(output, 2000, 2000);
    expect(isUpToDate([output], source)).toBe(true);
    expect(isUpToDate([output, join(root, "missing.png")], source)).toBe(false);
    utimesSync(source, 3000, 3000);
    expect(isUpToDate([output], source)).toBe(false);
  });

  it("deletes outputs that the list does not name", () => {
    const root = tempDir();
    writeFile(root, "keep.png", "");
    writeFile(root, "drop.png", "");
    writeFile(root, "android/x.png", "");
    expect(pruneOutputs(root, ["keep.png"])).toEqual(["android", "drop.png"]);
    expect(readdirSync(root)).toEqual(["keep.png"]);
  });

  it("generates exactly the listed icons, then skips until the source changes", { timeout: 60_000 }, () => {
    const root = fixtureRoot(true);
    expect(generateIcons({ root, force: false })).toBe("generated");
    const outDir = join(root, ICON_DIR);
    expect(readdirSync(outDir).sort()).toEqual([...listedIcons(root)].sort());
    expect(generateIcons({ root, force: false })).toBe("skipped");
    expect(generateIcons({ root, force: true })).toBe("generated");
    expect(existsSync(join(outDir, "icon.ico"))).toBe(true);
  });
});
