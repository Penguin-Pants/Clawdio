import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SCHEMA, renderCss, validateTokens } from "./build-tokens.mjs";
import { REPO_ROOT, runScript, tempDir, writeFile } from "./test-helpers";

type Json = Record<string, unknown>;

const readTokens = (): Json => JSON.parse(readFileSync(join(REPO_ROOT, "theme/tokens.json"), "utf8"));

/** The object that holds the last key of `path`, and that key. */
function parentOf(tokens: Json, path: string): [Json, string] {
  const keys = path.split(".");
  const last = keys.pop() ?? "";
  return [keys.reduce((node, key) => node[key] as Json, tokens), last];
}

const get = (tokens: Json, path: string) => {
  const [parent, key] = parentOf(tokens, path);
  return parent[key];
};

const set = (tokens: Json, path: string, value: unknown) => {
  const [parent, key] = parentOf(tokens, path);
  parent[key] = value;
};

const remove = (tokens: Json, path: string) => {
  const [parent, key] = parentOf(tokens, path);
  delete parent[key];
};

function buildFrom(tokens: unknown) {
  const dir = tempDir();
  writeFile(dir, "tokens.json", JSON.stringify(tokens));
  const output = join(dir, "out/tokens.generated.css");
  const run = runScript("build-tokens.mjs", ["--input", join(dir, "tokens.json"), "--output", output]);
  return { ...run, output };
}

describe("build-tokens", () => {
  it("accepts the repository token file and requires every key in it", () => {
    const { errors, values } = validateTokens(readTokens());
    expect(errors).toEqual([]);
    expect(values.size).toBe(Object.keys(SCHEMA).length);
  });

  it("writes every color, radius and motion token as a CSS variable", () => {
    const tokens = readTokens();
    const { status, output } = buildFrom(tokens);
    expect(status).toBe(0);
    const css = readFileSync(output, "utf8");
    expect(css).toContain(`--color-bg-canvas: ${get(tokens, "colors.bg.canvas")};`);
    expect(css).toContain(`--color-state-red-hover: ${get(tokens, "colors.state.redHover")};`);
    expect(css).toContain(`--color-state-red-active: ${get(tokens, "colors.state.redActive")};`);
    expect(css).toContain(`--radius-control: ${get(tokens, "radii.control")};`);
    expect(css).toContain(`--clawdio-motion-fast: ${get(tokens, "motion.fast")};`);
    expect(css).toContain(`--clawdio-motion-panel: ${get(tokens, "motion.panel")};`);
    expect(css).toContain("--default-transition-duration: var(--clawdio-motion-fast);");
    expect(css).not.toContain("reduced");
  });

  it("follows a changed token value with no other change (AC-7 baseline)", () => {
    const tokens = readTokens();
    const before = readFileSync(buildFrom(tokens).output, "utf8").split("\n");
    set(tokens, "colors.bg.canvas", "#123456");
    const after = readFileSync(buildFrom(tokens).output, "utf8").split("\n");
    expect(after.filter((line, index) => line !== before[index])).toEqual(["  --color-bg-canvas: #123456;"]);
  });

  it("fails and names the key path when a key is missing (P0-AC4)", () => {
    const tokens = readTokens();
    remove(tokens, "colors.text.muted");
    const { status, stderr } = buildFrom(tokens);
    expect(status).toBe(1);
    expect(stderr).toContain("colors.text.muted is missing");
  });

  it.each([
    ["colors.bg.canvas", "black", "a hex color"],
    ["radii.card", "12", "a px length"],
    ["motion.fast", "0.14s", "a ms duration"],
    ["motion.reduced", " ", "a non-empty text"],
  ])("fails and names %s when its value has the wrong kind", (path, value, label) => {
    const tokens = readTokens();
    set(tokens, path, value);
    const { status, stderr } = buildFrom(tokens);
    expect(status).toBe(1);
    expect(stderr).toContain(`${path} must be ${label}`);
  });

  it("fails with a message when the file is not JSON", () => {
    const dir = tempDir();
    writeFile(dir, "tokens.json", "{");
    const run = runScript("build-tokens.mjs", ["--input", join(dir, "tokens.json"), "--output", join(dir, "o.css")]);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("cannot read");
  });

  it("warns about unknown keys and does not emit them", () => {
    const tokens = readTokens();
    set(tokens, "colors.extra", { glow: "#ffffff" });
    const { status, stderr, output } = buildFrom(tokens);
    expect(status).toBe(0);
    expect(stderr).toContain("colors.extra.glow is not a known token");
    expect(readFileSync(output, "utf8")).not.toContain("extra");
  });

  it("writes the size and spacing tokens in rem (UD1, TH-1)", () => {
    const tokens = readTokens();
    const css = readFileSync(buildFrom(tokens).output, "utf8");
    expect(css).toContain("--size-transport-bar: 3.5rem;");
    expect(css).toContain("--size-transport-bar-compact: 2.5rem;");
    expect(css).toContain("--size-row-regular: 1.75rem;");
    expect(css).toContain("--size-row-compact: 1.5rem;");
    expect(css).toContain("--size-row-album: 3rem;");
    expect(css).toContain("--spacing-unit: 0.25rem;");
  });

  it("accepts a rem size and rejects a px size for a sizes key", () => {
    const tokens = readTokens();
    set(tokens, "sizes.transportBar", "3.5rem");
    expect(buildFrom(tokens).status).toBe(0);
    set(tokens, "sizes.transportBar", "56px");
    const { status, stderr } = buildFrom(tokens);
    expect(status).toBe(1);
    expect(stderr).toContain("sizes.transportBar must be a rem length");
  });

  it.each(["sizes.rowRegular", "spacing.unit"])("fails and names %s when it is missing (UK7)", (path) => {
    const tokens = readTokens();
    remove(tokens, path);
    const { status, stderr } = buildFrom(tokens);
    expect(status).toBe(1);
    expect(stderr).toContain(`${path} is missing`);
  });

  it("renders only the values it gets", () => {
    const css = renderCss(new Map([["colors.brand.red", "#E10606"]]));
    expect(css).toContain("--color-brand-red: #E10606;");
    expect(css).not.toContain("--radius-");
  });
});
