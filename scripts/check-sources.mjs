// Source guards (D34, P0.14).
// - No hex color literal under src/, except the generated token file.
// - No product name (same letter case) under src/, crates/ or src-tauri/src/.
// Usage: node scripts/check-sources.mjs [--root <dir>]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".css", ".rs"]);
const SKIPPED_DIRS = new Set(["node_modules", "target", "dist", "gen"]);
const HEX_EXEMPT = new Set(["src/styles/tokens.generated.css"]);
const HEX_ROOTS = ["src"];
const NAME_ROOTS = ["src", "crates", "src-tauri/src"];
// 3, 4, 6 or 8 hex digits after "#", not part of a longer word or an HTML entity ("&#123;").
const HEX_COLOR = /(?<![\w&])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/gi;

/**
 * @typedef {{ file: string, line: number, rule: "hex-color" | "product-name", text: string }} Violation
 */

/**
 * Files with a scanned extension below `dir`, as paths relative to `root` with "/".
 * @param {string} root
 * @param {string} dir relative to root
 * @returns {string[]}
 */
export function listSources(root, dir) {
  const absolute = join(root, dir);
  if (!existsSync(absolute)) return [];
  /** @type {string[]} */
  const files = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) files.push(...listSources(root, path));
    } else if (SCANNED_EXTENSIONS.has(extname(entry.name))) {
      files.push(path);
    }
  }
  return files.sort();
}

/**
 * The product name from src-tauri/tauri.conf.json (the single name value, D2).
 * @param {string} root
 * @returns {string}
 */
export function readProductName(root) {
  /** @type {{ productName?: unknown }} */
  const config = JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8"));
  if (typeof config.productName !== "string" || config.productName.length === 0) {
    throw new Error("src-tauri/tauri.conf.json has no productName");
  }
  return config.productName;
}

/**
 * Violations in one file's text.
 * @param {string} file relative path with "/"
 * @param {string} text
 * @param {{ productName: string }} options
 * @returns {Violation[]}
 */
export function checkText(file, text, { productName }) {
  const checkHex = HEX_ROOTS.some((dir) => file.startsWith(`${dir}/`)) && !HEX_EXEMPT.has(file);
  const checkName = NAME_ROOTS.some((dir) => file.startsWith(`${dir}/`));
  /** @type {Violation[]} */
  const violations = [];
  text.split(/\r?\n/).forEach((content, index) => {
    const line = index + 1;
    if (checkHex) {
      for (const match of content.matchAll(HEX_COLOR)) {
        violations.push({ file, line, rule: "hex-color", text: match[0] });
      }
    }
    if (checkName && content.includes(productName)) {
      violations.push({ file, line, rule: "product-name", text: productName });
    }
  });
  return violations;
}

/**
 * @param {string} root
 * @returns {Violation[]}
 */
export function checkSources(root) {
  const productName = readProductName(root);
  const files = [...new Set(NAME_ROOTS.flatMap((dir) => listSources(root, dir)))];
  return files.flatMap((file) => checkText(file, readFileSync(join(root, file), "utf8"), { productName }));
}

/** @param {Violation} violation */
export function formatViolation({ file, line, rule, text }) {
  const reason =
    rule === "hex-color"
      ? `hex color ${text}: use a token variable (theme/tokens.json)`
      : `product name "${text}": read it from the build config (tauri.conf.json productName)`;
  return `${file}:${line}: ${reason}`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const rootIndex = argv.indexOf("--root");
  const root = resolve(rootIndex >= 0 ? (argv[rootIndex + 1] ?? ".") : fileURLToPath(new URL("..", import.meta.url)));
  try {
    const violations = checkSources(root);
    for (const violation of violations) console.error(formatViolation(violation));
    if (violations.length > 0) {
      console.error(`check:sources: ${violations.length} violation(s)`);
      process.exit(1);
    }
    console.log("check:sources: no violations");
  } catch (error) {
    console.error(`check:sources: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
