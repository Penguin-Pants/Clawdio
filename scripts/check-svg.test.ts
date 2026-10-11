import { describe, expect, it } from "vitest";
import { checkSvgText, checkSvgs, listSvgs } from "./check-svg.mjs";
import { REPO_ROOT, runScript, tempDir, writeFile } from "./test-helpers";

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const svg = (inner: string, attributes = 'viewBox="0 0 10 10"') => `<svg ${NS} ${attributes}>${inner}</svg>`;

describe("check-svg", () => {
  it("passes the nine brand SVG files in the repository (P1-AC1)", () => {
    const { files, problems } = checkSvgs(REPO_ROOT);
    expect(problems).toEqual([]);
    expect(files).toEqual([
      "assets/branding/export/clawdio-icon-full.svg",
      "assets/branding/export/clawdio-icon-mono.svg",
      "assets/branding/export/clawdio-icon-simple.svg",
      "assets/branding/export/clawdio-wordmark-light.svg",
      "assets/branding/export/clawdio-wordmark-mono.svg",
      "assets/branding/export/clawdio-wordmark-primary.svg",
      "assets/branding/source/clawdio-cat.svg",
      "assets/branding/source/clawdio-monogram.svg",
      "assets/branding/source/clawdio-wordmark.svg",
    ]);
  });

  it("accepts a plain vector file with the SVG namespace", () => {
    expect(checkSvgText(svg('<path d="M0 0 L10 10"/>'))).toEqual([]);
  });

  it("rejects text that is not XML", () => {
    expect(checkSvgText(`<svg ${NS} viewBox="0 0 10 10"><path></svg>`)).toEqual([
      "does not parse as an SVG XML document",
    ]);
  });

  it.each(["", 'viewBox="0 0 10"', 'viewBox="a b c d"'])("rejects a missing or invalid viewBox (%s)", (attributes) => {
    expect(checkSvgText(svg("", attributes))).toEqual(["has no valid viewBox on <svg>"]);
  });

  it.each(["image", "text", "filter", "foreignObject", "script"])("rejects a <%s> element", (name) => {
    expect(checkSvgText(svg(`<g><${name}/></g>`))).toEqual([`has a <${name}> element`]);
  });

  it("rejects http references in attributes and in style text", () => {
    expect(checkSvgText(svg('<use href="https://example.org/a.svg#x"/>'))).toEqual([
      "has an http reference in <use href>",
    ]);
    expect(checkSvgText(svg("<style>path { fill: url(http://example.org/p.svg#g); }</style>"))).toEqual([
      "has an http reference in the text of <style>",
    ]);
  });

  it("finds SVG files in sub-folders and fails the command with the file name", () => {
    const root = tempDir();
    writeFile(root, "assets/branding/a/good.svg", svg(""));
    writeFile(root, "assets/branding/b/bad.svg", svg("<text>x</text>"));
    expect(listSvgs(root)).toEqual(["assets/branding/a/good.svg", "assets/branding/b/bad.svg"]);
    const run = runScript("check-svg.mjs", ["--root", root]);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("assets/branding/b/bad.svg: has a <text> element");
  });
});
