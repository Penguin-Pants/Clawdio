// Licenses of the production npm packages (P18.4): writes THIRD_PARTY_LICENSES_WEB.txt from the
// installed packages. `--check` fails when the committed file differs.
// Usage: node scripts/frontend-licenses.mjs [--check]
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const OUTPUT = join(ROOT, "THIRD_PARTY_LICENSES_WEB.txt");
const LICENSE_FILE = /^(licen[cs]e|copying|notice)(\.(md|txt))?$/i;

/**
 * @typedef {{ name: string; version: string; license: string; source: string; texts: string[] }} Package
 */

/**
 * @param {string | { url?: string } | undefined} repository
 * @param {string} name
 */
function repositoryUrl(repository, name) {
  const url = typeof repository === "string" ? repository : repository?.url;
  if (!url) return `https://www.npmjs.com/package/${name}`;
  return url
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/\.git$/, "")
    .replace(/^github:/, "https://github.com/");
}

/**
 * Every production package (name, version, license, source and license texts), sorted.
 * @returns {Package[]}
 */
export function productionPackages() {
  const paths = execFileSync("npm", ["ls", "--omit=dev", "--all", "--parseable"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && resolve(line) !== ROOT);
  /** @type {Map<string, Package>} */
  const seen = new Map();
  for (const path of paths) {
    const manifest = JSON.parse(readFileSync(join(path, "package.json"), "utf8"));
    const key = `${manifest.name}@${manifest.version}`;
    if (seen.has(key)) continue;
    const texts = readdirSync(path)
      .filter((file) => LICENSE_FILE.test(file))
      .sort()
      .map((file) => readFileSync(join(path, file), "utf8").trim());
    seen.set(key, {
      name: manifest.name,
      version: manifest.version,
      license: typeof manifest.license === "string" ? manifest.license : (manifest.license?.type ?? "UNKNOWN"),
      source: repositoryUrl(manifest.repository, manifest.name),
      texts,
    });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

/** @param {Package[]} packages */
export function render(packages) {
  const rule = "-".repeat(78);
  const lines = [
    "Third-party licenses: npm packages",
    "",
    "The app's web interface includes the production npm packages below.",
    "",
  ];
  for (const pkg of packages) {
    lines.push(rule, `${pkg.name} ${pkg.version} (${pkg.license})`, pkg.source, rule, "");
    if (pkg.texts.length === 0) lines.push(`License: ${pkg.license}. The package ships no license file.`, "");
    for (const text of pkg.texts) lines.push(text, "");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = render(productionPackages());
  if (process.argv.includes("--check")) {
    const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, "utf8") : "";
    if (current !== text) {
      console.error(
        "frontend-licenses: THIRD_PARTY_LICENSES_WEB.txt is out of date; run node scripts/frontend-licenses.mjs",
      );
      process.exit(1);
    }
    console.log("frontend-licenses: up to date");
  } else {
    writeFileSync(OUTPUT, text);
    console.log(`frontend-licenses: wrote ${OUTPUT}`);
  }
}
