// UI reference screenshots (UD23, rework section 12): the mocked e2e app at three window sizes.
// Usage: npm run shots -- <folder>   (for example "before" or "after")
// Writes docs/ui-reference/<folder>/<width>x<height>.png. The app runs from the e2e build with the
// mocked IPC and a loaded library, as `npm run test:e2e` serves it. PW_CHROMIUM_PATH picks a local
// Chromium build, as in playwright.config.ts.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The window sizes (UC10: 800 x 560 stands in for 800 x 500, the window minimum). */
export const SHOT_SIZES = Object.freeze([
  { width: 800, height: 560 },
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
]);

const FOLDER_NAME = /^[a-z0-9-]+$/;
const PREVIEW_URL = "http://localhost:4173";
const VITE = "node_modules/vite/bin/vite.js";

/**
 * The files to write for one folder name.
 * @param {string} root repository root
 * @param {string} [folder]
 * @returns {{ path: string, width: number, height: number }[]}
 */
export function shotPlan(root, folder) {
  if (!folder || !FOLDER_NAME.test(folder)) {
    throw new Error(`the folder name must match ${FOLDER_NAME} (for example "before" or "after")`);
  }
  const dir = join(root, "docs", "ui-reference", folder);
  return SHOT_SIZES.map(({ width, height }) => ({ path: join(dir, `${width}x${height}.png`), width, height }));
}

/**
 * The pixel size in a PNG file header (the IHDR chunk), or null for a file that is not a PNG.
 * @param {Uint8Array} bytes
 * @returns {{ width: number, height: number } | null}
 */
export function pngSize(bytes) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || signature.some((byte, index) => bytes[index] !== byte)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** True when a server answers at `url`. @param {string} url */
async function answers(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

/**
 * Waits until the spawned preview serves `url`. Fails when that process exits first (for
 * example, the port is taken and `strictPort` stops it).
 * @param {string} url
 * @param {import("node:child_process").ChildProcess} server
 */
async function waitForServer(url, server, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (server.exitCode !== null || server.signalCode !== null) throw new Error("the preview server stopped");
    if (await answers(url)) return;
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error(`no server at ${url}`);
}

/**
 * Runs a Node script of the repository with this Node, with no shell (Windows has no `npx`
 * executable, only a `.cmd` shim).
 * @param {string} root
 * @param {string[]} args
 * @returns {[string, string[]]}
 */
function nodeArgs(root, args) {
  return [process.execPath, [resolve(root, args[0]), ...args.slice(1)]];
}

/**
 * Builds the e2e app, serves it and writes the screenshots.
 * @param {string} root
 * @param {string | undefined} folder
 */
async function run(root, folder) {
  const plan = shotPlan(root, folder);
  // The token CSS and the icon sprite are generated files; `npm run build` makes them first too.
  for (const step of [
    ["scripts/build-tokens.mjs"],
    ["scripts/icons.mjs"],
    [VITE, "build", "-c", "vite.e2e.config.ts"],
  ]) {
    const [command, args] = nodeArgs(root, step);
    if (spawnSync(command, args, { cwd: root, stdio: "inherit" }).status !== 0) {
      throw new Error(`${step.join(" ")} failed`);
    }
  }
  // Another server on the port would be photographed in place of this build.
  if (await answers(PREVIEW_URL)) throw new Error(`${PREVIEW_URL} is in use; stop that server first`);
  const [command, args] = nodeArgs(root, [VITE, "preview", "-c", "vite.e2e.config.ts"]);
  // The Vite process itself, not a wrapper, so kill() stops the server.
  const server = spawn(command, args, { cwd: root, stdio: "ignore" });
  try {
    await waitForServer(PREVIEW_URL, server);
    const { chromium } = await import("@playwright/test");
    const executablePath = process.env.PW_CHROMIUM_PATH;
    const browser = await chromium.launch(executablePath ? { executablePath } : {});
    try {
      mkdirSync(resolve(plan[0].path, ".."), { recursive: true });
      for (const shot of plan) {
        const page = await browser.newPage({ viewport: { width: shot.width, height: shot.height } });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto(`${PREVIEW_URL}/?data=library`);
        await page.locator('[data-widget="library"] [role="option"]').nth(1).waitFor();
        // Thumbnails and fonts load after the rows; the image waits for them.
        await page.waitForLoadState("networkidle");
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: shot.path, animations: "disabled" });
        const size = pngSize(readFileSync(shot.path));
        if (size?.width !== shot.width || size.height !== shot.height) {
          throw new Error(`${shot.path} is ${JSON.stringify(size)}, not ${shot.width} x ${shot.height}`);
        }
        console.log(`shots: wrote ${shot.path}`);
        await page.close();
      }
    } finally {
      await browser.close();
    }
  } finally {
    server.kill();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  run(root, process.argv[2]).catch((error) => {
    console.error(`shots: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
