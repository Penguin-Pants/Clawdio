// Production measurement setup (P6.7, P18.5): a portable app folder whose settings point at
// a generated music library. Usage: node scripts/measure-setup.mjs <app binary> <music folder> <app folder>
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const [binary, music, appDir] = process.argv.slice(2);
if (!binary || !music || !appDir) {
  console.error("usage: measure-setup.mjs <app binary> <music folder> <app folder>");
  process.exit(2);
}
mkdirSync(join(appDir, "data", "config"), { recursive: true });
copyFileSync(binary, join(appDir, basename(binary)));
// The portable marker keeps settings, cache, logs and the WebView profile in data/ (R18.1).
writeFileSync(join(appDir, "portable"), "");
const settings = {
  version: 1,
  musicFolder: resolve(music),
  onlineLookups: false,
  onlineNoticeDone: true,
  window: null,
};
writeFileSync(join(appDir, "data", "config", "settings.json"), JSON.stringify(settings, null, 2));
console.log(`measure-setup: ${join(appDir, basename(binary))} reads ${resolve(music)}`);
