// @vitest-environment node
// P0.10 focus rule: shadcn/ui components keep the global focus ring (2 px brand red).
// They must not hide the outline or draw their own focus ring, which falls below 3:1 (K19).
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FORBIDDEN = ["outline-none", "outline-hidden", "ring-ring/50", "ring-[3px]", "focus-visible:ring", "focus:ring"];

const dir = new URL("./", import.meta.url);
const components = readdirSync(dir).filter((name) => name.endsWith(".tsx") && !name.endsWith(".test.tsx"));

describe("shadcn/ui focus rule", () => {
  it("finds the components", () => {
    expect(components).toContain("button.tsx");
  });

  it.each(components)("%s has no class that hides or replaces the global focus ring", (name) => {
    const source = readFileSync(new URL(name, dir), "utf8");
    expect(FORBIDDEN.filter((token) => source.includes(token))).toEqual([]);
  });
});
