// E2E build (P2.15): the app with mocked IPC from tests/e2e/, served with the release CSP.
import { readFileSync } from "node:fs";
import { defineConfig, mergeConfig, type Plugin } from "vite";
import base from "./vite.config.ts";

/** The section 6.13 policy, read from the one place that sets it. */
const csp: string = JSON.parse(readFileSync(new URL("./src-tauri/tauri.conf.json", import.meta.url), "utf8")).app
  .security.csp;

/** Points the page script at the e2e entry before Vite processes the HTML, so the entry is bundled. */
const e2eEntry: Plugin = {
  name: "e2e-entry",
  transformIndexHtml: {
    order: "pre",
    handler: (html) => html.replace("/src/main.tsx", "/tests/e2e/entry.ts"),
  },
};

export default mergeConfig(
  base,
  defineConfig({
    plugins: [e2eEntry],
    build: { outDir: "dist-e2e" },
    preview: { port: 4173, strictPort: true, headers: { "Content-Security-Policy": csp } },
  }),
);
