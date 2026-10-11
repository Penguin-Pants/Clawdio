import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** A new empty folder in the OS temp folder. */
export function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "repo-test-"));
}

/** Writes `text` to `root/path`, creating folders. */
export function writeFile(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

/** Runs a script in `scripts/` with Node and returns its exit code and output. */
export function runScript(script: string, args: string[]) {
  const run = spawnSync(process.execPath, [join(REPO_ROOT, "scripts", script), ...args], {
    encoding: "utf8",
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}
