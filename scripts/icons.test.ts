import { readdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BRAND_ICON,
  EXPECTED_SIZES,
  ICON_DIR,
  checkSizes,
  generateIcons,
  imageSizes,
  isUpToDate,
  listedIcons,
  pruneOutputs,
} from "./icons.mjs";
import { REPO_ROOT, runScript, tempDir, writeFile } from "./test-helpers";

const SQUARE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64"/></svg>';

function fixtureRoot(withBrandIcon: boolean): string {
  const root = tempDir();
  writeFile(root, "src-tauri/tauri.conf.json", readFileSync(join(REPO_ROOT, "src-tauri/tauri.conf.json"), "utf8"));
  if (withBrandIcon) writeFile(root, BRAND_ICON, SQUARE);
  return root;
}

/** A minimal PNG header with the given size. */
function pngHeader(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(24);
  bytes.writeUInt32BE(0x89504e47, 0);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

/** A minimal ICO directory with the given layer sizes (256 is written as 0). */
function icoHeader(sizes: number[]): Buffer {
  const bytes = Buffer.alloc(6 + sizes.length * 16);
  bytes.writeUInt16LE(1, 2);
  bytes.writeUInt16LE(sizes.length, 4);
  sizes.forEach((size, index) => {
    bytes[6 + index * 16] = size % 256;
    bytes[7 + index * 16] = size % 256;
  });
  return bytes;
}

describe("icons", () => {
  it("reads the icon list from bundle.icon (D9)", () => {
    expect(listedIcons(REPO_ROOT)).toEqual(Object.keys(EXPECTED_SIZES));
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

  it("reads PNG sizes and ICO layer sizes", () => {
    expect(imageSizes(pngHeader(32, 32))).toEqual([32]);
    expect(imageSizes(icoHeader([256, 16, 48]))).toEqual([16, 48, 256]);
    expect(() => imageSizes(pngHeader(32, 16))).toThrow("not square");
    expect(() => imageSizes(Buffer.from("text file"))).toThrow("not a PNG or ICO file");
  });

  it("names each icon with a wrong, unknown or missing size", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "32x32.png"), pngHeader(32, 32));
    writeFileSync(join(dir, "64x64.png"), pngHeader(48, 48));
    writeFileSync(join(dir, "icon.ico"), icoHeader([16, 32]));
    expect(checkSizes(dir, ["32x32.png", "64x64.png", "icon.ico", "icon.png", "other.png"])).toEqual([
      "64x64.png: sizes 48, expected 64",
      "icon.ico: sizes 16, 32, expected 16, 24, 32, 48, 64, 256",
      "icon.png: missing",
      "other.png: no expected size is known",
    ]);
  });

  it("has committed icons with the D9 sizes (P1-AC2)", () => {
    const names = listedIcons(REPO_ROOT);
    expect(checkSizes(join(REPO_ROOT, ICON_DIR), names)).toEqual([]);
  });

  it("fails with a message when the brand icon is missing", () => {
    const run = runScript("icons.mjs", ["--root", fixtureRoot(false)]);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(`${BRAND_ICON} is missing`);
  });

  it("generates exactly the listed icons, then skips until the source changes", { timeout: 60_000 }, () => {
    const root = fixtureRoot(true);
    expect(generateIcons({ root, force: false })).toBe("generated");
    const outDir = join(root, ICON_DIR);
    expect(readdirSync(outDir).sort()).toEqual([...listedIcons(root)].sort());
    expect(checkSizes(outDir, listedIcons(root))).toEqual([]);
    expect(generateIcons({ root, force: false })).toBe("skipped");
    expect(generateIcons({ root, force: true })).toBe("generated");
  });
});
