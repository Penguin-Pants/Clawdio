// SVG rules for brand assets (P1.5, D34). Every SVG under assets/branding/ must parse as XML,
// have a viewBox and hold no <image>, <text>, <filter>, <foreignObject> or <script> element and
// no http reference.
// Usage: node scripts/check-svg.mjs [--root <dir>]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

export const BRAND_DIR = "assets/branding";
const FORBIDDEN_ELEMENTS = ["image", "text", "filter", "foreignObject", "script"];
const VIEW_BOX = /^\s*-?[\d.]+(?:[\s,]+-?[\d.]+){3}\s*$/;
const HTTP = /https?:/i;

/**
 * SVG files below `dir`, as paths relative to `root` with "/".
 * @param {string} root
 * @param {string} dir
 * @returns {string[]}
 */
export function listSvgs(root, dir = BRAND_DIR) {
  const absolute = join(root, dir);
  if (!existsSync(absolute)) return [];
  /** @type {string[]} */
  const files = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) files.push(...listSvgs(root, path));
    else if (entry.name.toLowerCase().endsWith(".svg")) files.push(path);
  }
  return files.sort();
}

/**
 * Rule violations in one SVG document.
 * @param {string} text
 * @returns {string[]}
 */
export function checkSvgText(text) {
  const { DOMParser } = new JSDOM().window;
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = doc.documentElement;
  if (doc.getElementsByTagName("parsererror").length > 0 || root.localName !== "svg") {
    return ["does not parse as an SVG XML document"];
  }
  /** @type {string[]} */
  const problems = [];
  if (!VIEW_BOX.test(root.getAttribute("viewBox") ?? "")) problems.push("has no valid viewBox on <svg>");
  for (const name of FORBIDDEN_ELEMENTS) {
    if (doc.getElementsByTagNameNS("*", name).length > 0) problems.push(`has a <${name}> element`);
  }
  for (const element of [root, ...root.querySelectorAll("*")]) {
    for (const attribute of element.attributes) {
      const isNamespace = attribute.name === "xmlns" || attribute.name.startsWith("xmlns:");
      if (!isNamespace && HTTP.test(attribute.value)) {
        problems.push(`has an http reference in <${element.localName} ${attribute.name}>`);
      }
    }
    for (const node of element.childNodes) {
      if ((node.nodeType === 3 || node.nodeType === 4) && HTTP.test(node.textContent ?? "")) {
        problems.push(`has an http reference in the text of <${element.localName}>`);
      }
    }
  }
  return problems;
}

/**
 * @param {string} root
 * @returns {{ files: string[], problems: string[] }}
 */
export function checkSvgs(root) {
  const files = listSvgs(root);
  const problems = files.flatMap((file) =>
    checkSvgText(readFileSync(join(root, file), "utf8")).map((problem) => `${file}: ${problem}`),
  );
  return { files, problems };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const rootIndex = argv.indexOf("--root");
  const root = resolve(rootIndex >= 0 ? (argv[rootIndex + 1] ?? ".") : fileURLToPath(new URL("..", import.meta.url)));
  const { files, problems } = checkSvgs(root);
  for (const problem of problems) console.error(problem);
  if (problems.length > 0) {
    console.error(`check:svg: ${problems.length} problem(s)`);
    process.exit(1);
  }
  console.log(`check:svg: ${files.length} SVG file(s) pass`);
}
