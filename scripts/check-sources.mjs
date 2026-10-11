// Source guards (D34, P0.14, F-07).
// - No hex color literal under src/, except the generated token file.
// - No Tailwind default palette color (class or CSS variable) under src/.
// - No product name (same letter case) under src/, crates/ or src-tauri/src/.
// - No IPC mock under src/: no import of @tauri-apps/api/mocks and no file named *mock* or
//   *fixture* (P2.15, AGENTS.md Edits rule 9). E2E mocks live in tests/e2e/.
// Usage: node scripts/check-sources.mjs [--root <dir>]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".css", ".rs"]);
const SKIPPED_DIRS = new Set(["node_modules", "target", "dist", "gen"]);
const HEX_EXEMPT = new Set(["src/styles/tokens.generated.css"]);
const HEX_ROOTS = ["src"];
const NAME_ROOTS = ["src", "crates", "src-tauri/src"];
const MOCK_ROOTS = ["src"];
const MOCK_IMPORT = "@tauri-apps/api/mocks";
const MOCK_FILE_NAME = /mock|fixture/i;
// 3, 4, 6 or 8 hex digits after "#", not part of a longer word or an HTML entity ("&#123;").
const HEX_COLOR = /(?<![\w&])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/gi;
// Tailwind utilities that take a color.
const COLOR_UTILITIES = [
  "bg",
  "text",
  "border(?:-[xytrblse])?",
  "outline",
  "ring",
  "ring-offset",
  "inset-ring",
  "shadow",
  "inset-shadow",
  "drop-shadow",
  "text-shadow",
  "fill",
  "stroke",
  "from",
  "via",
  "to",
  "accent",
  "caret",
  "decoration",
  "divide",
  "placeholder",
].join("|");

/**
 * @typedef {{ file: string, line: number, rule: "hex-color" | "palette-color" | "product-name" | "mock-import" | "mock-file", text: string }} Violation
 */

/**
 * Color names of Tailwind's default palette, read from the installed `tailwindcss/theme.css`,
 * so a Tailwind update that adds colors needs no change here.
 * @returns {string[]}
 */
export function readPaletteNames() {
  const theme = readFileSync(createRequire(import.meta.url).resolve("tailwindcss/theme.css"), "utf8");
  return [...new Set([...theme.matchAll(/--color-([a-z]+)(?:-\d+)?\s*:/g)].map((match) => match[1]))].sort();
}

/**
 * Matches a palette color class (`bg-red-500`, `hover:text-white`, `bg-black/50`) or a palette
 * CSS variable (`--color-red-500`). Token classes such as `bg-state-red-active` do not match.
 * @param {string[]} names
 * @returns {RegExp}
 */
export function palettePattern(names) {
  const colors = names.join("|");
  return new RegExp(
    `(?<![\\w-])(?:(?:${COLOR_UTILITIES})-(?:${colors})(?:-\\d{2,3})?(?:/[\\w.%]+)?|--color-(?:${colors})(?:-\\d{2,3})?)(?![\\w-])`,
    "g",
  );
}

/** @type {RegExp | undefined} */
let defaultPalette;

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
 * @param {{ productName: string, palette?: RegExp }} options
 * @returns {Violation[]}
 */
export function checkText(file, text, { productName, palette }) {
  const paletteColor = palette ?? (defaultPalette ??= palettePattern(readPaletteNames()));
  const checkHex = HEX_ROOTS.some((dir) => file.startsWith(`${dir}/`)) && !HEX_EXEMPT.has(file);
  const checkName = NAME_ROOTS.some((dir) => file.startsWith(`${dir}/`));
  const checkMocks = MOCK_ROOTS.some((dir) => file.startsWith(`${dir}/`));
  /** @type {Violation[]} */
  const violations = [];
  const fileName = file.slice(file.lastIndexOf("/") + 1);
  if (checkMocks && MOCK_FILE_NAME.test(fileName)) {
    violations.push({ file, line: 0, rule: "mock-file", text: fileName });
  }
  text.split(/\r?\n/).forEach((content, index) => {
    const line = index + 1;
    if (checkHex) {
      for (const match of content.matchAll(HEX_COLOR)) {
        violations.push({ file, line, rule: "hex-color", text: match[0] });
      }
      for (const match of content.matchAll(paletteColor)) {
        violations.push({ file, line, rule: "palette-color", text: match[0] });
      }
    }
    if (checkName && content.includes(productName)) {
      violations.push({ file, line, rule: "product-name", text: productName });
    }
    if (checkMocks && content.includes(MOCK_IMPORT)) {
      violations.push({ file, line, rule: "mock-import", text: MOCK_IMPORT });
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
  const reasons = {
    "hex-color": `hex color ${text}: use a token variable (theme/tokens.json)`,
    "palette-color": `palette color ${text}: use a token or semantic color class (theme/tokens.json)`,
    "product-name": `product name "${text}": read it from the build config (tauri.conf.json productName)`,
    "mock-import": `${text} import: IPC mocks belong in tests/e2e/`,
    "mock-file": `file name "${text}": mock and fixture files belong in tests/e2e/`,
  };
  const reason = reasons[rule];
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
