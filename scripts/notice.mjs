// NOTICE from the complete inventories (P18.4): every production Rust crate of the shipped
// targets (cargo metadata), every production npm package and the copied or bundled assets.
// The release build in the Ubuntu 22.04 container adds the AppImage libraries with
// `--appimage-libs <file>` (lines "package<TAB>version<TAB>license<TAB>source package").
// Usage: node scripts/notice.mjs [--check] [--appimage-libs <file>] [--output <file>]
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { productionPackages } from "./frontend-licenses.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const TARGETS = ["x86_64-unknown-linux-gnu", "x86_64-pc-windows-msvc"];

/** Copied or bundled assets: their license texts live in `licenses/`. */
const ASSETS = [
  {
    name: "Geist Sans (variable font, via @fontsource-variable/geist)",
    version: "@fontsource-variable/geist 5.3.0",
    license: "SIL Open Font License 1.1",
    source: "https://github.com/vercel/geist-font",
    file: "licenses/geist-OFL-1.1.txt",
  },
  {
    name: "shadcn/ui components (copied into src/components/ui)",
    version: "shadcn CLI 4.21.4",
    license: "MIT",
    source: "https://github.com/shadcn-ui/ui",
    file: "licenses/shadcn-ui-MIT.txt",
  },
  {
    name: "Lucide icons (via lucide-react; some icons derive from Feather, MIT)",
    version: "lucide-react 1.55.0",
    license: "ISC; Feather icons MIT",
    source: "https://github.com/lucide-icons/lucide",
    file: "licenses/lucide-ISC.txt",
  },
];

/**
 * @typedef {{ name: string; version: string; license: string; source: string }} Row
 * @typedef {{ id: string; name: string; version: string; license?: string; repository?: string; targets: { kind: string[] }[] }} CargoPackage
 * @typedef {{ id: string; deps: { pkg: string; dep_kinds: { kind: string | null }[] }[] }} CargoNode
 */

/**
 * Crates that a shipped binary links: normal dependencies of the workspace, no proc-macros.
 * @returns {Row[]}
 */
function rustCrates() {
  /** @type {Map<string, Row>} */
  const crates = new Map();
  for (const target of TARGETS) {
    /** @type {{ packages: CargoPackage[]; workspace_members: string[]; resolve: { nodes: CargoNode[] } }} */
    const metadata = JSON.parse(
      execFileSync("cargo", ["metadata", "--format-version", "1", "--filter-platform", target], {
        cwd: ROOT,
        encoding: "utf8",
        maxBuffer: 256 * 1024 * 1024,
      }),
    );
    const packages = new Map(metadata.packages.map((pkg) => /** @type {[string, CargoPackage]} */ ([pkg.id, pkg])));
    const nodes = new Map(metadata.resolve.nodes.map((node) => /** @type {[string, CargoNode]} */ ([node.id, node])));
    const workspace = new Set(metadata.workspace_members);
    const queue = [...workspace];
    const reached = new Set(queue);
    while (queue.length > 0) {
      const node = nodes.get(queue.pop() ?? "");
      for (const dep of node?.deps ?? []) {
        const normal = dep.dep_kinds.some((kind) => kind.kind === null);
        if (!normal || reached.has(dep.pkg)) continue;
        const pkg = packages.get(dep.pkg);
        if (!pkg || pkg.targets.some((target) => target.kind.includes("proc-macro"))) continue;
        reached.add(dep.pkg);
        queue.push(dep.pkg);
      }
    }
    for (const id of reached) {
      if (workspace.has(id)) continue;
      const pkg = packages.get(id);
      if (!pkg) continue;
      crates.set(`${pkg.name}@${pkg.version}`, {
        name: pkg.name,
        version: pkg.version,
        license: pkg.license ?? "see license file",
        source:
          pkg.name === "symphonia" || pkg.name.startsWith("symphonia-")
            ? `https://crates.io/crates/${pkg.name}/${pkg.version}; release https://github.com/pdeljanov/Symphonia/releases/tag/v${pkg.version}`
            : (pkg.repository ?? `https://crates.io/crates/${pkg.name}/${pkg.version}`),
      });
    }
  }
  return [...crates.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

/**
 * @param {string} file
 * @returns {Row[]}
 */
function appImageLibraries(file) {
  return readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, version, license, sourcePackage] = line.split("\t");
      return {
        name,
        version,
        license: license || "see /usr/share/doc in the source package",
        source: `https://launchpad.net/ubuntu/+source/${sourcePackage || name}`,
      };
    });
}

/** @param {string} text */
const escape = (text) => String(text).replaceAll("|", "\\|");
/** @param {Row[]} rows */
const table = (rows) => [
  "| Component | Version | License | Source location |",
  "|---|---|---|---|",
  ...rows.map(
    (row) => `| ${escape(row.name)} | ${escape(row.version)} | ${escape(row.license)} | ${escape(row.source)} |`,
  ),
];

/** @param {string | undefined} appImageFile */
export function notice(appImageFile) {
  const rule = "-".repeat(78);
  const lines = [
    "Third-party components",
    "",
    "This application is MIT licensed (see LICENSE). It bundles or links the",
    "third-party components below. Each entry states the exact version, the license",
    "and where the source is available. The license texts of the Rust crates are in",
    "THIRD_PARTY_LICENSES_RUST.html and those of the npm packages in",
    "THIRD_PARTY_LICENSES_WEB.txt. The texts of the assets follow the tables.",
    "",
    "## Assets",
    "",
    ...table(ASSETS),
    "",
    "## Rust crates",
    "",
    ...table(rustCrates()),
    "",
    "## npm packages",
    "",
    ...table(productionPackages()),
    "",
  ];
  if (appImageFile) {
    lines.push(
      "## AppImage libraries",
      "",
      "The AppImage bundles these Ubuntu 22.04 libraries. The LGPL and GPL texts are in",
      "usr/share/licenses inside the AppImage.",
      "",
      ...table(appImageLibraries(appImageFile)),
      "",
    );
  }
  for (const asset of ASSETS) {
    lines.push(
      rule,
      `${asset.name}: ${asset.license}`,
      rule,
      "",
      readFileSync(join(ROOT, asset.file), "utf8").trim(),
      "",
    );
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  /** @param {string} name */
  const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const output = resolve(option("--output") ?? join(ROOT, "NOTICE"));
  const text = notice(option("--appimage-libs"));
  if (args.includes("--check")) {
    if ((existsSync(output) ? readFileSync(output, "utf8") : "") !== text) {
      console.error("notice: NOTICE is out of date; run node scripts/notice.mjs");
      process.exit(1);
    }
    console.log("notice: up to date");
  } else {
    writeFileSync(output, text);
    console.log(`notice: wrote ${output}`);
  }
}
