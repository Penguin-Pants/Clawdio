// Generates the platform icons in src-tauri/icons from the brand icon SVG (R31, D9).
// Usage: node scripts/icons.mjs [--root <dir>] [--force]
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const BRAND_ICON = "assets/branding/export/clawdio-icon-full.svg";
export const PLACEHOLDER_ICON = "assets/branding/placeholder/icon.svg";
export const ICON_DIR = "src-tauri/icons";

/**
 * The brand icon when it exists, else the placeholder.
 * @param {string} root
 * @returns {string}
 */
export function pickSource(root) {
  const brand = join(root, BRAND_ICON);
  return existsSync(brand) ? brand : join(root, PLACEHOLDER_ICON);
}

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
 * @param {{ root: string, force: boolean }} options
 * @returns {"skipped" | "generated"}
 */
export function generateIcons({ root, force }) {
  const source = pickSource(root);
  const outDir = join(root, ICON_DIR);
  const keep = listedIcons(root);
  if (
    !force &&
    isUpToDate(
      keep.map((name) => join(outDir, name)),
      source,
    )
  ) {
    return "skipped";
  }
  const cli = createRequire(import.meta.url).resolve("@tauri-apps/cli/tauri.js");
  const run = spawnSync(process.execPath, [cli, "icon", source, "-o", outDir], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (run.status !== 0) {
    throw new Error(`tauri icon failed with exit code ${run.status}\n${run.stderr}`);
  }
  pruneOutputs(outDir, keep);
  const missing = keep.filter((name) => !existsSync(join(outDir, name)));
  if (missing.length > 0) {
    throw new Error(`tauri icon did not write: ${missing.join(", ")}`);
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
    const options = parseArgs(process.argv.slice(2));
    const result = generateIcons(options);
    console.log(`icons: ${result} from ${pickSource(options.root)}`);
  } catch (error) {
    console.error(`icons: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
