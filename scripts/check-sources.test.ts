import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkSources, checkText, readProductName } from "./check-sources.mjs";
import { REPO_ROOT, runScript, tempDir, writeFile } from "./test-helpers";

const productName = readProductName(REPO_ROOT);

/** A temp copy of the parts of the repo that the guard reads. */
function fixtureRoot(files: Record<string, string>): string {
  const root = tempDir();
  writeFile(root, "src-tauri/tauri.conf.json", readFileSync(join(REPO_ROOT, "src-tauri/tauri.conf.json"), "utf8"));
  writeFile(root, "src/App.tsx", "export const App = () => null;\n");
  for (const [path, text] of Object.entries(files)) writeFile(root, path, text);
  return root;
}

describe("check-sources", () => {
  it("passes on the repository (P0-AC6)", () => {
    expect(checkSources(REPO_ROOT)).toEqual([]);
  });

  it("passes on a clean tree", () => {
    expect(runScript("check-sources.mjs", ["--root", fixtureRoot({})]).status).toBe(0);
  });

  it("fails when a file in src/ has a hex color (P0-AC6)", () => {
    const run = runScript("check-sources.mjs", ["--root", fixtureRoot({ "src/x.css": "a { color: #fff; }\n" })]);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("src/x.css:1: hex color #fff");
  });

  it("fails when a file in crates/ has the product name (P0-AC6)", () => {
    const root = fixtureRoot({ "crates/core/src/lib.rs": `// ${productName}\n` });
    const run = runScript("check-sources.mjs", ["--root", root]);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(`crates/core/src/lib.rs:1: product name "${productName}"`);
  });

  it.each(["src/a.ts", "src-tauri/src/main.rs"])("fails when %s has the product name", (path) => {
    expect(checkText(path, `const n = "${productName}";`, { productName })).toHaveLength(1);
  });

  it("allows the generated token file, lowercase crate names and HTML entities", () => {
    const root = fixtureRoot({
      "src/styles/tokens.generated.css": "@theme { --c: #0B0B0B; }\n",
      "src/b.tsx": `import x from "${productName.toLowerCase()}_core"; const e = "&#123;"; const id = "#main-view";\n`,
    });
    expect(checkSources(root)).toEqual([]);
  });

  it("checks hex colors only under src/", () => {
    expect(checkText("crates/core/src/a.rs", 'const C: &str = "#FFFFFF";', { productName })).toEqual([]);
    expect(checkText("src/a.ts", 'const c = "#FFFFFF";', { productName })).toHaveLength(1);
  });

  it("matches 3, 4, 6 and 8 digit colors and ignores longer words", () => {
    const hits = (text: string) => checkText("src/a.ts", text, { productName }).length;
    expect(hits("#abc #abcd #aabbcc #aabbccdd")).toBe(4);
    expect(hits("#abcde #abcdefabc #defaultValue")).toBe(0);
  });

  it("fails with a message when tauri.conf.json has no productName", () => {
    const root = tempDir();
    writeFile(root, "src-tauri/tauri.conf.json", "{}");
    const run = runScript("check-sources.mjs", ["--root", root]);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("has no productName");
  });
});
