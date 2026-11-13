import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "./test-helpers";

const read = (path: string) => readFileSync(join(REPO_ROOT, path), "utf8");
const version: string = JSON.parse(read("src-tauri/tauri.conf.json")).version;

describe("release prerequisites (P28-AC1)", () => {
  it.each(["package.json", "package-lock.json"])("%s matches the app version", (path) => {
    expect(JSON.parse(read(path)).version).toBe(version);
  });

  it("the npm lockfile root package matches the app version", () => {
    expect(JSON.parse(read("package-lock.json")).packages[""].version).toBe(version);
  });

  it.each(["src-tauri/Cargo.toml", "crates/clawdio-core/Cargo.toml"])("%s matches the app version", (path) => {
    const manifest = read(path)
      .split(/^\[/m)
      .find((section) => section.startsWith("package]"));
    expect(manifest?.match(/^version\s*=\s*"([^"]+)"/m)?.[1]).toBe(version);
  });

  it.each(["clawdio", "clawdio-core"])("Cargo.lock records the app version for %s", (name) => {
    const entry = read("Cargo.lock")
      .split("[[package]]")
      .find((section) => section.split(/\r?\n/).includes(`name = "${name}"`));
    expect(entry?.match(/^version = "([^"]+)"/m)?.[1]).toBe(version);
  });

  it("the app version has release notes before the release workflow runs", () => {
    expect(existsSync(join(REPO_ROOT, `docs/release-notes/${version}.md`))).toBe(true);
    expect(read(`docs/release-notes/${version}.md`).trim()).not.toBe("");
  });
});
