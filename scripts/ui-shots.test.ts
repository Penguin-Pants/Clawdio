import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SHOT_SIZES, pngSize, shotPlan } from "./ui-shots.mjs";
import { REPO_ROOT, runScript } from "./test-helpers";

describe("ui-shots", () => {
  it("plans one file per size in docs/ui-reference/<folder>", () => {
    const plan = shotPlan("/repo", "before");
    expect(plan).toEqual([
      { path: join("/repo", "docs/ui-reference/before/800x560.png"), width: 800, height: 560 },
      { path: join("/repo", "docs/ui-reference/before/1280x720.png"), width: 1280, height: 720 },
      { path: join("/repo", "docs/ui-reference/before/1920x1080.png"), width: 1920, height: 1080 },
    ]);
  });

  it("refuses a missing or unsafe folder name", () => {
    expect(() => shotPlan("/repo")).toThrow(/folder name/);
    expect(() => shotPlan("/repo", "../x")).toThrow(/folder name/);
    const run = runScript("ui-shots.mjs", []);
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/folder name/);
  });

  it("reads the PNG header size and rejects other files", () => {
    const header = new Uint8Array(24);
    header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    new DataView(header.buffer).setUint32(16, 800);
    new DataView(header.buffer).setUint32(20, 560);
    expect(pngSize(header)).toEqual({ width: 800, height: 560 });
    expect(pngSize(new TextEncoder().encode("not a png at all, really"))).toBeNull();
  });

  // The committed screenshots (U0-AC2, U7-AC2) have the planned pixel sizes.
  for (const folder of ["before", "after"]) {
    const plan = shotPlan(REPO_ROOT, folder);
    // The before shots are committed (U0); the after shots come in U7, so until then they may be missing.
    const pending = folder === "after" && !plan.every((shot) => existsSync(shot.path));
    it.skipIf(pending)(`the ${folder} screenshots exist and have their sizes`, () => {
      for (const shot of plan) {
        expect(pngSize(readFileSync(shot.path))).toEqual({ width: shot.width, height: shot.height });
      }
      expect(plan).toHaveLength(SHOT_SIZES.length);
    });
  }
});
