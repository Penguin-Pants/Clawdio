// Generates the platform icons in src-tauri/icons from the brand icon SVG (R31, D9) and checks
// their pixel sizes (P1-AC2).
// Usage: node scripts/icons.mjs [--root <dir>] [--force]
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const BRAND_ICON = "assets/branding/export/clawdio-icon-full.svg";
export const ICON_DIR = "src-tauri/icons";

/**
 * Pixel sizes of each icon file that bundle.icon may list (D9). An .ico lists every layer.
 * @type {Readonly<Record<string, number[]>>}
 */
export const EXPECTED_SIZES = Object.freeze({
  "32x32.png": [32],
  "64x64.png": [64],
  "128x128.png": [128],
  "128x128@2x.png": [256],
  "icon.png": [512],
  "icon.ico": [16, 24, 32, 48, 64, 256],
});

/**
 * The icon files that `bundle.icon` in tauri.conf.json lists, relative to src-tauri/icons.
 * @param {string} root
 * @returns {string[]}
 */
export function listedIcons(root) {
  /** @type {{ bundle?: { icon?: unknown } }} */
  const config = JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8"));
  const icons = config.bundle?.icon;
  if (!Array.isArray(icons) || icons.length === 0) {
    throw new Error("tauri.conf.json: bundle.icon must list the icon files");
  }
  return icons.map((path) => {
    if (typeof path !== "string" || !path.startsWith("icons/")) {
      throw new Error(`tauri.conf.json: bundle.icon entry ${JSON.stringify(path)} is not in icons/`);
    }
    return path.slice("icons/".length);
  });
}

/**
 * True when every output exists and is newer than the source.
 * @param {string[]} outputs absolute paths
 * @param {string} source absolute path
 * @returns {boolean}
 */
export function isUpToDate(outputs, source) {
  const sourceTime = statSync(source).mtimeMs;
  return outputs.every((path) => existsSync(path) && statSync(path).mtimeMs > sourceTime);
}

/**
 * Deletes every entry in `dir` that `keep` does not name.
 * @param {string} dir
 * @param {string[]} keep
 * @returns {string[]} the deleted names
 */
export function pruneOutputs(dir, keep) {
  const deleted = [];
  for (const name of readdirSync(dir)) {
    if (!keep.includes(name)) {
      rmSync(join(dir, name), { recursive: true, force: true });
      deleted.push(name);
    }
  }
  return deleted.sort();
}

/**
 * Square pixel sizes of a PNG file, or of every layer of an ICO file, in ascending order.
 * @param {Buffer} bytes
 * @returns {number[]}
 */
export function imageSizes(bytes) {
  if (bytes.length >= 24 && bytes.readUInt32BE(0) === 0x89504e47) {
    const [width, height] = [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
    if (width !== height) throw new Error(`PNG is not square: ${width} x ${height}`);
    return [width];
  }
  if (bytes.length >= 6 && bytes.readUInt16LE(0) === 0 && bytes.readUInt16LE(2) === 1) {
    const sizes = [];
    for (let index = 0; index < bytes.readUInt16LE(4); index += 1) {
      const entry = 6 + index * 16;
      if (entry + 16 > bytes.length) throw new Error("ICO directory is cut off");
      // In an ICO directory entry, 0 means 256 pixels.
      const [width, height] = [bytes[entry] || 256, bytes[entry + 1] || 256];
      if (width !== height) throw new Error(`ICO layer ${index} is not square: ${width} x ${height}`);
      sizes.push(width);
    }
    return sizes.sort((a, b) => a - b);
  }
  throw new Error("not a PNG or ICO file");
}

/**
 * Problems with the pixel sizes of the listed icon files.
 * @param {string} dir
 * @param {string[]} names
 * @returns {string[]}
 */
export function checkSizes(dir, names) {
  return names.flatMap((name) => {
    const expected = EXPECTED_SIZES[name];
    if (!expected) return [`${name}: no expected size is known`];
    const path = join(dir, name);
    if (!existsSync(path)) return [`${name}: missing`];
    try {
      const actual = imageSizes(readFileSync(path));
      if (actual.join(",") === expected.join(",")) return [];
      return [`${name}: sizes ${actual.join(", ")}, expected ${expected.join(", ")}`];
    } catch (error) {
      return [`${name}: ${error instanceof Error ? error.message : String(error)}`];
    }
  });
}

/**
 * @param {{ root: string, force: boolean }} options
 * @returns {"skipped" | "generated"}
 */
export function generateIcons({ root, force }) {
  const source = join(root, BRAND_ICON);
  if (!existsSync(source)) throw new Error(`${BRAND_ICON} is missing`);
  const outDir = join(root, ICON_DIR);
  const keep = listedIcons(root);
  const outputs = keep.map((name) => join(outDir, name));
  if (!force && isUpToDate(outputs, source)) return "skipped";
  const cli = createRequire(import.meta.url).resolve("@tauri-apps/cli/tauri.js");
  const run = spawnSync(process.execPath, [cli, "icon", source, "-o", outDir], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (run.status !== 0) {
    throw new Error(`tauri icon failed with exit code ${run.status}\n${run.stderr}`);
  }
  pruneOutputs(outDir, keep);
  const problems = checkSizes(outDir, keep);
  if (problems.length > 0) {
    throw new Error(`wrong icon output\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
  }
  return "generated";
}

/** @param {string[]} argv */
function parseArgs(argv) {
  const rootIndex = argv.indexOf("--root");
  const root = rootIndex >= 0 ? argv[rootIndex + 1] : undefined;
  return {
    root: resolve(root ?? fileURLToPath(new URL("..", import.meta.url))),
    force: argv.includes("--force"),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = generateIcons(parseArgs(process.argv.slice(2)));
    console.log(`icons: ${result} from ${BRAND_ICON}`);
  } catch (error) {
    console.error(`icons: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
