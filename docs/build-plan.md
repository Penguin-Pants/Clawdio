# Clawdio Build Plan

**Version:** 1.11, October 11, 2026 (owner decision on D41, section 13).
**Status:** In execution. Section 2 gives the phase status.
**Scope:** Clawdio v1, as the source documents in section 3 define it.
**Companion file:** `docs/requirements-traceability.md`. It maps each source requirement to a task, an acceptance criterion and a verification method.

**Bottom line**
- The repository holds documents, brand inputs and the owner's `AGENTS.md`. No code or tests exist yet.
- The plan has 19 phases (P0 to P18). P3 is a footprint gate (Milestone 0) before feature work, as R20 requires.
- The first end-to-end player (choose a folder, see songs, play one) arrives in P4. Brand assets arrive in P1 and the themed shell in P2. Branding is part of the build from the start.
- No genuine blocker stops P0. Owner inputs are in section 5.3 and gates in section 5.4. The owner signed off the brand (Q6) after P1.

---

## 1. How to execute this plan

### 1.1 Rules for the coding agent

1. Execute phases in numeric order. Start a phase only when every phase on its "Depends on" line has the status Done or Done with exceptions. An open gate in section 5.4 blocks only the phase it names. An owner sign-off on the "Depends on" line must also be given.
2. Before a phase, read the phase, the traceability rows that cite it and the source sections on its Scope line.
3. Inspect the code and tests that the phase changes.
4. Implement only the phase tasks. Record other defects and ideas in section 11. Do not implement them.
5. Run TWO-PASS REVIEW (defined in `AGENTS.md`) on the complete phase diff. Classify each finding as F1 to F4.
6. Run the phase verification. Each acceptance criterion must pass or carry a recorded reason. Example: "Windows manual check not run: no Windows machine in this environment."
7. Update section 2, the phase record (section 2.1) and the Status column of the traceability matrix.
8. Commit and push only after the validation command set (section 1.2) passes.
9. Stop on a blocker. Record it in section 2 and section 5.4. Do not invent a solution.
10. Do not change a decision in section 5.2 without an owner decision. Record the change in section 13.

### 1.2 Validation command set

P0 creates these commands. Every phase runs them before a push.

| Command | Checks |
|---|---|
| `npm run check` | ESLint, TypeScript, Vitest, source guards, SVG checks |
| `cargo fmt --all --check` | Rust format |
| `cargo clippy --workspace --all-targets -- -D warnings` | Rust lint |
| `cargo test --workspace` | Rust unit and integration tests, ts-rs type export |
| `test -z "$(git status --porcelain -- src/lib/ipc/bindings)"` | Generated IPC types are committed, including new files |
| `npm run test:e2e` | Playwright with mocked IPC (from P2) |

Rows marked "from Pn" join the set when that phase ends. Earlier phases skip them.

**Environment.** The Rust commands build `src-tauri`, which needs the Linux packages in section 6.17. P0.0 installs them and the Playwright browsers. If an environment cannot install them, run `cargo test -p clawdio-core` and `npm run check` locally, let CI run the rest and record the gap in the phase record as an exception.

### 1.3 Standard phase checkpoint

A phase is Done when all of these are true:

- [ ] Every acceptance criterion passes, or the phase record names the criterion and the reason it could not run.
- [ ] TWO-PASS REVIEW is recorded with the F1 to F4 counts. No F1 and no F2 finding is open.
- [ ] The validation command set passes.
- [ ] Section 2 and the traceability Status column are updated.
- [ ] Docs named in the phase are updated.
- [ ] The commits are pushed.

"Done with exceptions" means one or more criteria could not run in the environment (for example a Windows-only manual check). The exception must be listed. P18 runs every exception again.

---

## 2. Phase status

| Phase | Name | Depends on | Status |
|---|---|---|---|
| P0 | Foundation and conventions | none | Done with exceptions |
| P1 | Brand identity assets and icon pipeline | P0 | Done with exceptions |
| P2 | Themed docking shell | P1, Q6 sign-off | Done with exceptions |
| P3 | Milestone 0 footprint gate | P2 | Done with exceptions |
| P4 | End-to-end slice | P3 | Not started |
| P5 | Library scan and cache | P4 | Not started |
| P6 | Library widget and search | P5 | Not started |
| P7 | Playback engine and Play queue | P6 | Not started |
| P8 | OS media integration | P7 | Not started |
| P9 | Persistence: state, arrangement and instance | P8 | Not started |
| P10 | Local artwork and thumbnails | P9 | Not started |
| P11 | Playlists and Favorites | P10 | Not started |
| P12 | Playlist import | P11 | Not started |
| P13 | Local lyrics | P12 | Not started |
| P14 | Online lookups and artwork fetch | P13 | Not started |
| P15 | Lyrics fetch | P14 | Not started |
| P16 | Metadata fill | P15 | Not started |
| P17 | UI quality audit | P16 | Not started |
| P18 | Release readiness | P17, gate B3 closed | Not started |

Status values: Not started, In progress, Done, Done with exceptions, Blocked.

### 2.1 Phase records

Each phase adds one entry here when it ends: date, commit range, criteria results, review counts (F1 to F4), exceptions, blockers and proposed follow-ups.

#### P0. Foundation and conventions (October 11, 2026)

- **Status:** Done with exceptions.
- **Commits:** branch `clawd/happy-gates-m2ikwy`, base `21da212`. Messages start with `P0:`.
- **Environment (P0.0):** Ubuntu 24.04 container, Node 22.22.0, npm 10.9.4, Rust 1.97 (`rust-toolchain.toml`). The section 6.17 Linux packages were present (environment setup script). Chromium for Playwright is preinstalled. WebKit is not installed here (exception E2).
- **Prompt Phase 1 audit:** framework React 19.3, Vite 8.3, TypeScript 6.0. Wrapper Tauri 2.12.3 with Rust. Native OS integration: WebView2 accelerator keys only (D37). Styling: Tailwind CSS 4.3, shadcn/ui (Base UI primitives, style `base-nova`), token variables. Brand files: `theme/tokens.json`, `docs/design.md`, `docs/asset-manifest.md`, the mockup and the placeholder icon. Old product names: none. Risks: K4 (Windows check open), K19 (focus rule test), K20 (packages present here).

| Criterion | Result | Evidence |
|---|---|---|
| P0-AC1 | Pass | Local Linux: `npm run check` (63 tests), `cargo fmt`, `cargo clippy` (also for target `x86_64-pc-windows-msvc`, no link), `cargo test` (3 tests), bindings check. CI run 38160684257 failed `rust (windows-latest)` at the bindings check (N7). After the fix, CI runs 38162065518 (push) and 38162069020 (pull request) on `9111ece` pass all five jobs on ubuntu-22.04 and windows-latest. |
| P0-AC2 | Pass (Xvfb) | `npm run tauri dev`: one window titled "Clawdio", 1200 x 800, minimum 800 x 560, 960,000 px of `#0B0B0B`. |
| P0-AC3 | Pass (Xvfb) | With `colors.bg.canvas` set to `#123456`, the window showed `#123456`. `git status` showed no other change. A unit test shows that only the canvas line of the generated CSS changes. |
| P0-AC4 | Pass | Vitest: without `colors.text.muted`, `npm run tokens` exits 1 with "colors.text.muted is missing". |
| P0-AC5 | Pass | `src/styles/contrast.test.ts`, 27 cases. Note N1. |
| P0-AC6 | Pass | `npm run check:sources` passes. Vitest: `#fff` in `src/` and the product name in `crates/` make it fail. |
| P0-AC7 | Pass | `AGENTS.md`: 69 lines added, 0 removed, eight project rules (the six architecture lines and the six commands are each split into two lists of three, Output rule 05). `mdformat --number --check` passes. `LICENSE` is MIT. `NOTICE` lists Geist with the OFL 1.1 text. |
| P0-AC8 | Not verified | No Windows machine (E1). The module passes clippy for `x86_64-pc-windows-msvc`. CI builds it on windows-latest. |
| P0-AC9 | Pass (review) | The capability file grants only `core:default`. The CSP equals section 6.13. A release build under Xvfb renders the stylesheet. `dist/index.html` has no inline script or style, so Tauri adds no nonce. Chromium with the same CSP header: 0 `securitypolicyviolation` events. |

**Notes**

- N1 (P0.15): the rule "Excluded pairs must stay below the threshold" fails for `state.redActive` on canvas (3.16) and surface (3.03). Section 6.12 lists that row as "3.16 to 2.70". The test applies the rule to the row as one role: its worst surface must stay below 3:1. The owner approved this wording as F-06 (plan 1.10).
- N2 (P0.10): `shadcn init` downloads from `ui.shadcn.com`. The environment denied the host (B6) until the owner allowed it. The CLI asks for a preset, so the init ran with `-p nova` (Lucide, Geist). The token mapping replaced the generated colors, the chart and sidebar variables and the `.dark` block. `index.html` sets `class="dark"`, so shadcn dark styles apply in the dark-only app. `shadcn` and `tw-animate-css` are dev dependencies (build-time CSS).
- N3 (P0.9): Geist is imported in `main.tsx` only. The init also added an import to `globals.css`. That copy was removed.
- N4: jsdom is 29.1.1, because jsdom 30 needs Node 22.22.2 or later.
- N5 (P0.12): `tauri dev` loads and renders with the configured CSP, so `devCsp` is not set.
- N6: the CI action versions (`actions/checkout@v5`, `actions/setup-node@v5`, `Swatinem/rust-cache@v2`) could not be checked here: GitHub API access is limited to this repository. CI run 38160684257 ran all three.
- N7 (P0-AC1): `rust (windows-latest)` failed the bindings check. Root cause: Windows runners check out with `core.autocrlf=true`, so `AppInfo.ts` has CRLF line ends. ts-rs rewrites it with LF, and `git status` reports a change. Reproduced locally with `core.autocrlf=true`. Fix: `.gitattributes` keeps `src/lib/ipc/bindings/**` LF on every OS. The rule does not touch `CLAUDE.md` or other owner files.

**Exceptions**

- E1: P0-AC8 not verified: no Windows machine in this environment (B5).
- E2: WebKit Playwright tests run in CI only. This environment has Chromium only.
- E3: P0-AC2 and P0-AC3 ran on an Xvfb display, not on a desktop session.
- E4: the Windows part of P0-AC1 ran in CI only.

**Blockers:** B6 (section 5.4), closed during the phase.

**TWO-PASS REVIEW:** F1 2, F2 6, F3 3, F4 11.

- F1: the `shadcn init` output broke P0.10: generated colors, `outline-ring/50` and a `.dark` block. Fixed before commit. The Windows bindings check failed in CI (N7). Fixed.
- F2: a repository-wide `.gitattributes` would renormalize the owner's CRLF `CLAUDE.md` (removed; N7 adds a rule for the bindings only). Button `destructive` and `link` variants used red 14 px text against D10 (now `text-foreground`). Duplicate Geist import (removed). `shadcn` CLI in the runtime dependencies (moved). Caret ranges from the init (pinned). jsdom 30 engine mismatch (pinned 29.1.1).
- F3: F-06, F-07 and F-08 (section 11).
- F4:
  - Script entry checks could differ in drive-letter case on Windows: Node derives both paths from one resolved path. The Windows `tauri-build` job ran both scripts and passed.
  - The forced-colors rule on `[aria-selected="true"]` also hits tabs: no such element exists yet. P2-AC16 and P17 test it.
  - `applyAppName` hides errors: outside the Tauri runtime the failure is expected, and the native title is the product name (D2).
  - `NOTICE` lists Geist only: P0.2 asks for the table and Geist. P18.4 builds the full list (P18-AC7).
  - `lucide-react` and `src/lib/utils.ts` have no import yet: both come from the init, `components.json` names them and P2 uses them.
  - No `devCsp`: `tauri dev` renders under the configured CSP (N5).
  - `icons.mjs` deletes unknown files in `src-tauri/icons/`: D9 says to delete other outputs, and the folder holds generated files only.
  - Bundle targets stay "all": package targets are P18.1 work.
  - Prettier skips Markdown: `AGENTS.md` assigns mdformat to instruction files, and docs keep their format.
  - `dark:` input fills are faint: borders and fills are decoration (D10 rule 6). P2-AC14 tests focus contrast.
  - Unverified action versions: see N6. CI ran them.

**Follow-ups:** F-06, F-07, F-08.

#### P1. Brand identity assets and icon pipeline (October 11, 2026)

- **Status:** Done with exceptions. The owner signed off the brand (Q6) and closed B7 with F-09 option (b): P1-AC4 checks bar separation at the 72 px README height.
- **Commits:** branch `clawd/happy-gates-m2ikwy-p1`, based on the P0 branch. Messages start with `P1:`.

| Criterion | Result | Evidence |
|---|---|---|
| P1-AC1 | Pass | `npm run check:svg`: 9 SVG files pass. `scripts/check-svg.test.ts` covers each rule. |
| P1-AC2 | Pass | `npm run icons` exits 0 and checks every pixel size (`scripts/icons.mjs`). `identify src-tauri/icons/icon.ico`: 16x16, 24x24, 32x32, 48x48, 64x64, 256x256. PNGs: `32x32.png` 32, `64x64.png` 64, `128x128.png` 128, `128x128@2x.png` 256, `icon.png` 512. |
| P1-AC3 | Pass | `docs/images/icon-legibility.png`. 16 px layer: two ear tips (7 px apart), a closed head outline and two red eye marks (2 px apart). 24, 32 and 48 px: every feature is clear. Rim `#B7B7B7` on `#171717`: 8.94:1. At 16 px the rim is 96 x 0.7 / 64 = 1.05 px and each eye (200 x 120 units) is 2.19 x 1.31 px. The Q8 fallback is not needed. |
| P1-AC4 | Pass (after B7) | No `<text>`. "Claw" is `#E10606`. The "o" holds five bars. Each bar is 18 units (1.13 px at 20 px). At 72 px each 8-unit gap is 1.8 px: the contact sheet (72 px row and the ring at 8x) and a pixel map show at least one full background pixel in every gap, in both variants. Light variant: `#E10606` 4.96:1 and `#4A4A4A` 8.86:1 on white. First result under the old text: at 20 px the 0.5 px gaps rendered as dim red (B7). |
| P1-AC5 | Pass (Linux) | `clawdio-icon-full.svg` replaced with a green square and a white circle. `npm run tauri build -- --debug` built the binary and the `.deb`. Only that SVG and the six files in `src-tauri/icons/` changed (checksums of every other file match). The new binary's window icon (`_NET_WM_ICON`, 32 px) is `#00A651` with white. The `.deb` launcher icons are green. See N8 for the rpm and AppImage steps. |
| P1-AC6 | Pass | `grep -r branding/placeholder` (without `node_modules`, `target`, `dist`) finds only this plan, which describes P0.11, P1.6 and P1-AC6. |
| P1-AC7 | Pass | Originality statement below. |

**Originality statement (P1-AC7).** Every shape in the nine SVG files was built in this phase from primitives with numeric coordinates: straight-line polygons, quadratic curves, circles and one arc. A one-time generator script made the files and was not committed (Edits rule 8); the SVG files are the sources. No path was traced from the mockup. No image data is embedded. No third-party character art or emblem is reproduced. The mockup was used for direction only: colors, the wordmark layout, the eye style and the bars.

**Notes**

- N1 (P1.1): the letters carry the 12 degree slant. The ring and its bars stay upright, because a slanted bar would cross the ring.
- N2 (P1.1): the outer bars touch the inner ring edge. Five bars of 18 units with 8-unit gaps (122 units) is the widest row in which the outer 38.4-unit bars fit inside the 64-unit inner radius.
- N3 (P1.3): the first monogram draft read as an "e" (heavy top arm, low mouth). The final C has equal arms and a centered mouth, with the eye cut into the top arm.
- N4 (P1.4): `clawdio-icon-mono.svg` cuts the eyes out of the one-color silhouette, so they stay visible in one color.
- N5 (P1.5): `check-svg.mjs` parses with jsdom, an existing dev dependency. `xmlns` namespace attributes are not http references.
- N6 (P1-AC2): the size check reads PNG headers and the ICO directory in Node, so it runs on every OS. The task text names ImageMagick `identify`; its output is in the table.
- N7 (P1.6, P1.8): without the placeholder, `icons.mjs` stops with an error when `clawdio-icon-full.svg` is missing. Vite inlines the small brand SVGs as `data:` URLs, which `img-src` allows.
- N8 (P1-AC5): after the binary and the `.deb`, the bundler spent more than 10 minutes compressing the 200 MB debug binary into the rpm. The run was stopped there (exit 143), so no rpm or AppImage was made. The criterion needs the new executable icon, which the binary and the `.deb` show.
- N9: the contrast helper moved to `scripts/contrast.mjs`. The P0 contrast test and the new brand asset test share it (Edits rules 5 and 6).
- N10 (owner decisions, October 11, 2026): Q6 signed off. B7 closed with F-09 option (b). The contact sheet gained a 72 px row, and `scripts/brand-assets.test.ts` checks that each bar gap is at least 1 px at 72 px.

**Exceptions**

- E1: P1-AC5 on Windows (the `.exe` icon) not verified: no Windows machine (B5). The verification line asks for Linux.
- E2: the rpm and AppImage steps of the P1-AC5 build did not complete (N8).
- E3: the P1-AC3 visual check was the agent's. The owner signed off at Q6.

**Blockers:** B7 (section 5.4), closed by the owner decision.

**TWO-PASS REVIEW:** F1 0, F2 2, F3 2, F4 11.

- F2: the first monogram read as an "e" (N3). Fixed. `tsc` found no types for jsdom in `check-svg.mjs`; `@types/jsdom` 28.0.3 added (no types exist for jsdom 29; the code uses only `JSDOM` and `DOMParser`).
- F3: F-09 (the P1-AC4 bar gap cannot be met, B7; the owner chose option (b)) and F-10 (a committed contact sheet script, section 11).
- F4:
  - `xmlns` holds an http URL: it is a namespace name, not a reference.
  - Embedded raster without `<image>`: an SVG can show raster data only through `<image>`, `<feImage>` (inside the forbidden `<filter>`) or `<foreignObject>`.
  - A clone without `clawdio-icon-full.svg` cannot build: the file is committed, and the script names it in the error.
  - `Wordmark` has an empty `alt` until the name is read: the IPC call returns at startup, and outside the app the image has no name to give.
  - Each `useAppName` call makes one IPC call: P2 and P4 use one or two instances.
  - The art placeholder mask is a `data:` URL: `img-src` allows `data:`.
  - Forced colors can hide the mask: P2.13 sets `forced-color-adjust: none` for mask icons and the art placeholder.
  - The generator script is not committed: the SVG files are the sources (P1.1 to P1.3).
  - Brand asset tests read the SVG structure: they check stated rules (colors, bar count, scale), not drawing details.
  - DOM parsing in `check-svg.mjs` runs no script: `DOMParser` does not execute content.
  - Eyes as holes in the mono icon: one fill cannot show filled eyes on a filled head (N4).

**Follow-ups:** F-10. F-09 is closed (option (b), section 13).

#### P2. Themed docking shell (October 11, 2026)

- **Status:** Done with exceptions.
- **Commits:** branch `clawd/determined-ramanujan-3gm3n1`, base `8143bc3`. Messages start with `P2:`.
- **Packages:** `dockview-react` 8.5.1 (MIT), `zustand` 5.0.15, `@playwright/test` 1.64.0 and `@axe-core/playwright` 4.13.0 (dev). shadcn/ui components added with the 4.21.4 CLI: `dropdown-menu`, `toggle-group` (with `toggle`), `select`, `input`, `tooltip`, `dialog`.
- **Screenshots:** `docs/images/p2-default-1200x800.png`, `p2-default-800x560.png`, `p2-tabbed-1200x800.png`, `p2-tabbed-800x560.png`.

| Criterion | Result | Evidence |
|---|---|---|
| P2-AC1 | Pass (Chromium) | `tests/e2e/docking.spec.ts`. Unit: `src/shell/layouts.test.ts`. |
| P2-AC2 | Pass (Chromium, Xvfb) | `docking.spec.ts`: edge dock, tabbed group, splitter resize, no context menu, no float or pop-out item. The debug app under Xvfb (WebKitGTK): an `xdotool` drag of the Transport controls header to the Library edge showed the red-bordered drop zone and docked the widget. |
| P2-AC3 | Pass (Chromium) | `docking.spec.ts`: no close control, disabled menu item, Delete and Backspace on the focused tab, moving Library to an edge and into a tabbed group keeps one Library. Unit: the guard tests. |
| P2-AC4 | Pass (Chromium) | `layouts.spec.ts`: show and hide each hideable widget, mode radio items, each layout, Reset layout from the menu and Ctrl+Shift+L, 20 layout applications. |
| P2-AC5 | Pass (Chromium) | `layouts.spec.ts`: search and mode switch in the header; dropdown at 350 px; search text kept. Selection: `src/store/library.test.ts`, `LibraryWidget.test.tsx` (no list UI before P3, N3). |
| P2-AC6 | Pass (Chromium) | `layouts.spec.ts` at an 800 x 560 viewport: default arrangement, plus Play queue, and six stacked widgets with the D45 clamp. Unit: `src/shell/clamp.test.ts`. |
| P2-AC7 | Pass (Chromium) | `appearance.spec.ts`: computed group, tab bar, tab and splitter colors equal the tokens; no red at rest. |
| P2-AC8 | Pass (Chromium) | `appearance.spec.ts`: every element 0s at rest, with the menu open and with the dialog open. |
| P2-AC9 | Pass (Chromium) | `appearance.spec.ts`: axe, no serious or critical violation in the three states. |
| P2-AC10 | Pass (Chromium) | `keyboard.spec.ts`: order, wrap, Shift+F6, hidden tab skipped, 2 px red ring. Unit: `src/lib/keyboard.test.ts`. |
| P2-AC11 | Pass | Unit: `src/components/icons.test.tsx`. Manual build: `assets/branding/ui-icons/menu.svg` added, e2e build rebuilt, the menu button showed a `mask-icon` span with the file as its mask; the file was then removed. |
| P2-AC12 | Pass (Chromium) | `layouts.spec.ts`. |
| P2-AC13 | Pass (Chromium) | `appearance.spec.ts`: button, toggle and input 0.14s; menu and dialog 0.2s; seek track and time labels 0s. No list rows exist before P3 (N3). |
| P2-AC14 | Pass with exception (Chromium) | `appearance.spec.ts`: button, input, toggle, tab, menu item and select item reach 3:1. Switch and slider do not exist yet (E3). |
| P2-AC15 | Pass (Chromium) | `appearance.spec.ts`: grayscale page, mean brightness of the underline rows and the menu item bar columns. |
| P2-AC16 | Pass (Chromium) | `appearance.spec.ts`: focus ring, a mask icon probe and the art placeholder under emulated forced colors. |
| P2-AC17 | Pass (Chromium) | `docking.spec.ts`: resize cursor, 1 px line on hover, 2 px while dragging, overlay with a 2 px red border. |
| P2-AC18 | Pass (Chromium) | `tests/e2e/test-base.ts` fails every test on a `securitypolicyviolation` event. |
| P2-AC19 | Pass | `scripts/check-sources.test.ts`: an import of `@tauri-apps/api/mocks` and files named `mock.ts`, `ipcMocks.tsx` and `library-fixture.ts` under `src/` fail the guard. `npm run test:e2e` builds with `tests/e2e/entry.ts`. Review: no inline mock data in `src/`. |

**Notes**

- N1 (P2.1): Dockview 8.5 runs with `dndStrategy: "pointer"`. Pointer events drive drags in every engine, so docking does not depend on HTML5 drag and drop in WebView2 or WebKitGTK. No tab context menu is configured, so no float or pop-out command exists.
- N2 (P2.3): a tab cannot hold a focusable child (axe `nested-interactive`). The close control in a widget header is a pointer-only element with a tooltip. Keyboard users hide widgets from the menu (R29 non-drag path).
- N3 (P2.5, P2.13): Library lists, list rows, the switch (P4) and the slider (P7) do not exist yet. Their checks run in the phases that add them and in P17.
- N4 (P2.6): the menu uses group labels (Widgets, Library mode, Layouts) instead of submenus.
- N5 (P2.11): the clamp (`src/shell/clamp.ts`) sets explicit group constraints from the largest minimum of the widgets in each group, so every tab of a tabbed group fits.
- N6 (P2.15): Playwright 1.64 expects Chromium build 1248. This environment has build 1194 at `/opt/pw-browsers/chromium`, so local runs set `PW_CHROMIUM_PATH`. CI installs the expected browsers.
- N7 (P2.15): test hooks (`window.e2e`) live in `tests/e2e/entry.ts` and act on the real dock.
- N8: `ArtPlaceholder` (P1) used percent padding, which grows with the parent width. It now centers the monogram at 60 % of the square.
- N9: the production JavaScript bundle is 856 kB (minified, before compression). P3 measures the footprint.

**Exceptions**

- E1: WebKit e2e runs in CI only. This environment has Chromium only.
- E2: P2-AC16 runs in Chromium only, as the verification line states.
- E3: P2-AC14 for the switch and the slider: neither exists in P2 (N3). P17-AC2 audits every focusable type.
- E4: manual Linux checks ran under Xvfb with `xdotool`, not on a desktop session. P2-AC6 at the real minimum window was not verified in the app: without a window manager the webview did not follow a window resize. The 800 x 560 browser viewport check passed.

**Blockers:** none.

**TWO-PASS REVIEW:** F1 3, F2 4, F3 1, F4 10.

- F1: the generated shadcn components broke the P0.10 focus rule (`outline-none`, `outline-hidden`, `ring-3` and `ring-ring/50` focus classes) and the palette guard (`bg-black/10`). Fixed. The close button inside a tab failed axe (`nested-interactive`, P2-AC9). Fixed (N2). The inset focus ring of menu items covered the 2 px highlight bar (P2-AC15). The ring now sits outside the item.
- F2: `ArtPlaceholder` padding (N8). Light tooltip from the template (`bg-foreground`); now elevated with a border. The select list had no padding, so the item ring was clipped. The e2e hook duplicated the add-widget code; `layouts.ts` now exports `addWidget` and `replaceArrangement` (Edits rule 5).
- F3: F-12 (section 11).
- F4:
  - The close control is not keyboard reachable: a tab cannot hold a focusable child; the menu hides widgets (N2).
  - The Library guard runs after a microtask while a move also fires a remove event: the e2e test moves Library to an edge and into a tabbed group and finds one Library.
  - F6 skips the header strip and the status line: P2.12 cycles widgets only.
  - The clamp lowers every group on an axis by one factor: D45 asks for "in proportion"; P2-AC6 passes.
  - Selection survival has no e2e test: no list exists before P3; unit tests cover the store, and P6-AC2 covers the UI.
  - `tests/e2e/data/app.json` holds the product name: the guard covers `src/`, `crates/` and `src-tauri/src/`; mock data belongs in `tests/e2e/`.
  - The e2e server sends the CSP without a nonce: D48 covers the release nonce; P17 and P18 check a release build.
  - `NOTICE` does not list Dockview, Base UI, zustand or the copied shadcn/ui components: P18.4 builds the full list (P18-AC7).
  - Clicking the pressed mode toggle empties the group value: the value is controlled and keeps the mode.
  - The narrow switch decision measures the whole widget: the header spans the widget width.

**Follow-ups:** F-12.

#### P3. Milestone 0 footprint gate (October 11, 2026)

- **Status:** Done with exceptions.
- **Commits:** branch `clawd/determined-ramanujan-3gm3n1`, from `1990a37`. Messages start with `P3:`.
- **Packages:** `@tanstack/react-virtual` 3.14.15, `unicode-normalization` 0.1.25, `thiserror` 2.0.21, `image` 0.25.10 (`jpeg`, only with `fixtures`), Tauri feature `protocol-asset`.

| Criterion | Result | Evidence |
|---|---|---|
| P3-AC1 | Pass (Linux, Xvfb) | Fixtures build in each mode with all six widgets populated (`CLAWDIO_MEASURE_MODE`). Browser: `tests/e2e/milestone.spec.ts` (Songs list to its end, filters, tree expansion, axe). Rust: `src-tauri/src/fixtures.rs` tests (50,000 songs, 2,000 thumbnails, widget data). |
| P3-AC2 | Pass | `docs/milestone-0.md`. Linux: 468 MB (agent container) and 390 MB (CI runner). Windows: 112 MB (`measure.yml` run 38171140952). Worst mode medians, all six widgets, environments recorded. |
| P3-AC3 | Pass | `.deb` 3.3 MB (local). NSIS installer 2.2 MB (`measure.yml` run 38169331542). |
| P3-AC4 | Pass | Linux over 300 MB: target raised to 468 MB (D49). Windows 112 MB: pass, keeps 200 MB. Both bundles under 30 MB. |
| P3-AC5 | Pass | Thumbnails load from the cache folder (`~/.cache/...` on Linux) through the `thumb://` scheme (D41 as changed in 1.11). The measurement ready signal waits for the Now playing thumbnail to decode, so every `measure.yml` run checks it on Linux and Windows (run on the commit after `2d76032`). Rust test `src-tauri/src/thumbs.rs`: only plain `.jpg` names inside the folder are served. |

**Notes**

- N1: commands `player_state` and `measure_mode` are not in the section 6.7 list. `player_state` gives Transport controls and Now playing their start state (P4 and P7 add events). `measure_mode` reads `CLAWDIO_MEASURE_MODE`.
- N2: queue, player, playlist and lyrics commands read `Widgets` state, empty without `fixtures`. P4, P7, P11 and P13 replace the source. `lyrics_get` ignores its track until P13.
- N3: `fold` (D4) came forward from P5.5 for search. Natural order stays in P5.
- N4: song rows cache at most 2,000 rows per list (`ROW_CACHE_LIMIT`).
- N5: the e2e mocks serve a 600-song library with `?data=library` (`tests/e2e/library-data.ts`).
- N6: the measurement ran in a container with Xvfb and software rendering (K15). `WebKitWebProcess` is 338 of the 468 MB.
- N8: the ready signal also waits for the Now playing art to decode, so a broken thumbnail fails the measurement. The e2e build serves `tests/e2e/public/thumb/album.jpg` for it.
- N7: the first Linux run (`1990a37`, before the D14 fix and the ready signal) gave 470 MB. The run on `e62ddca` gave 468 MB; `docs/milestone-0.md` holds it.

**Exceptions**

- E1: all numbers come from a container or CI virtual machines with software rendering, not desktop sessions (K15). P18.5 measures again.
- E2: the manual scroll check (P3 verification) ran under Xvfb only.

**Blockers:** B8, closed by the owner's approval of `measure/p3`.

**TWO-PASS REVIEW:** F1 0, F2 9, F3 0, F4 6. One finding (absolute thumbnail paths over IPC, D13 against D41) went to the owner, who chose the `thumb://` scheme (section 13, 1.11).

- F2 (Codex review of `fdc1db1`): artist and album lists loaded every row at once, against D14; they now load ids, then rows for the visible window (`library_artist_rows`, `library_album_rows`). A tree album selection kept the old artist; it now selects its artist too. `album_art` returned no art for an unknown track; it now returns `unknown_id` (D46). `measure-memory.sh` and `.ps1` now fail when the app exits before the sample. The first Windows run failed: `$runs` and the `-Runs` parameter are one variable in PowerShell (renamed `$runRecords`).
- F2 (Codex review of `b71e28c`): a tree song selection kept the old artist and album; it now sets all three. The scripts sampled after a fixed delay; the UI now writes a ready file once all six widgets show data (`measure_ready`, `CLAWDIO_MEASURE_READY`) and the scripts wait for it. F6 stayed in a focused Library list; only select popups keep F6 now. The Menu and dialog close buttons had no tooltip.
- F2: the song row cache had no limit; scrolling 50,000 rows kept every row. Now capped (N4). The fixture `widgets` assignment failed `clippy` with the feature on; CI now lints and tests with `--features clawdio/fixtures`.
- F4:
  - Fixture thumbnails stay in the cache folder after P6.7: the cache is rebuildable (R19).
  - Queries sort per call: 50,000 songs sort in milliseconds; P6.1 finishes the queries.
  - `CLAWDIO_MEASURE_MODE` holds the product name in capitals: the plan names the variable; the guard is case sensitive (D34).
  - List keyboard navigation is missing: P6.6.
  - The 875 kB bundle: the measured memory is the gate; P17 or P18 may split it.
  - Codex claims `$id` in `measure-memory.ps1` collides with the automatic `$PID`: PowerShell names are case insensitive, but `id` and `pid` are different names.

**Follow-ups:** none.

---

## 3. Source documents and precedence

| Source | Role | Authority |
|---|---|---|
| `docs/MusicPlayer_REQUIREMENTS.md` v1.5 | Features, behavior, constraints, acceptance checks | Functional source of truth |
| `docs/design.md` | Visual design, components, interactions, motion, Magic UI use | UI source of truth |
| `docs/claude-code-implementation-prompt.md` | Brand identity, assets, naming, brand validation | Brand source of truth |
| `docs/asset-manifest.md`, `theme/tokens.json`, `assets/reference/clawdio-approved-mockup.png` | Inputs the branding prompt names | Same authority as the branding prompt for assets and tokens. The mockup is direction only. |
| `AGENTS.md` | Repository conventions, TWO-PASS REVIEW, finding classes | Supplied by the owner (commit `2f147a2`). P0.1 adds the project rules. |
| `docs/REQUIREMENTS_REVIEW.md` | Review of spec v1.3 | Context only. Version 1.5 of the requirements already applied its section G. Items it names that v1.4 or v1.5 changed (for example `brand/DESIGN.md`) are superseded. |

**Conflict rule.** Functional behavior follows the requirements. UI decisions follow `design.md`. Brand identity follows the branding prompt. Section 5.1 lists every conflict found and its resolution. A conflict that this rule cannot resolve is an owner question (section 5.3) or a blocker (section 5.4).

**`[D]` items.** The requirements mark derived details `[D]`. This plan keeps them. Where the plan must fix a detail that the sources leave open, section 5.2 records the decision.

---

## 4. Repository baseline

Inspection on October 11, 2026, at commit `9c297ca` (branch `main`, merge of pull request 2).

| Path | Content |
|---|---|
| `README.md` | Two lines: name and one-sentence description |
| `docs/MusicPlayer_REQUIREMENTS.md` | Requirements v1.5 (408 lines) |
| `docs/REQUIREMENTS_REVIEW.md` | Review of v1.3 with addendum |
| `docs/design.md` | Design spec (section 5 already describes the docking shell) |
| `docs/asset-manifest.md` | Asset checklist and proposed structure |
| `docs/claude-code-implementation-prompt.md` | Branding implementation prompt |
| `theme/tokens.json` | 14 colors, 3 radii, 3 motion values |
| `assets/reference/clawdio-approved-mockup.png` | 1448 x 1086 RGBA concept image |

**Not present:** source code, package manifests, lockfiles, tests, CI workflows, build scripts, an icon pipeline, `LICENSE`, `NOTICE` and `AGENTS.md`.

**Update (October 11, 2026):** the owner added `AGENTS.md` and `CLAUDE.md` (commit `2f147a2`). The review sections were added to `AGENTS.md` afterwards.

**What this means for the plan**

- **Implemented:** nothing. The branding prompt asks to "preserve" working library, playback and other behavior. With no code, this becomes a rule: each phase keeps the tests of earlier phases green.
- **Needs modification:** `README.md` (P1, P18). `docs/design.md`, only for justified implementation differences (P17). `docs/asset-manifest.md` checkboxes (P1, P18).
- **Missing:** everything else. Each phase lists the files it creates.
- **Old product names:** none in the repository. The requirements title says "Minimalist Open Source Music Player". That is a document title, not a product name. It stays.
- **Planning environment:** Node 22.22, npm 10.9, Rust 1.97, ffmpeg 6.1 and ImageMagick 6.9 are present. The WebKitGTK, GTK, ALSA and D-Bus development packages are missing; `apt-get` with `sudo` is available (P0.0). No build ran, because this task is planning only.

---

## 5. Reconciliation

### 5.1 Conflicts and resolutions

| ID | Sources | Conflict | Resolution |
|---|---|---|---|
| C1 | Prompt (mission, Phase 1, Phase 3.9, constraints) vs repository | The prompt assumes an existing player, `AGENTS.md` and tests. None existed at planning time. | Build v1 with the brand inputs from P0. The owner supplied `AGENTS.md`; P0.1 extends it. "Preserve behavior" becomes "keep earlier tests green". |
| C2 | design.md §11 vs R12, R26 | §11 forbids playlist editing and Favorites "unless supported by existing requirements". R12 and R26 require them. | Requirements govern features. Both are in scope (P11). |
| C3 | design.md §6 (Volume: "clearly defined mute and level") vs R6 ("Nothing else") | A mute toggle is a playback function that R6 does not list. | No mute toggle. The volume icon shows the muted glyph at level 0. |
| C4 | design.md §4 (Geist Sans or Inter) vs R16 (local fonts, the owner may bundle one OFL font) | design.md asks for a named font. R16 allows one bundled OFL font. | Bundle Geist Sans (OFL 1.1) as the one font (D7). System fonts are the fallback. The owner confirmed this on October 11, 2026 (Q3, closed). |
| C5 | asset-manifest (PNG 16 to 1024 px and `.ico` in `assets/branding/export/`) vs R31 (the build generates platform icons from `clawdio-icon-full.svg`) | Two homes for the same raster files. | Commit SVG sources and SVG exports only. `tauri icon` writes rasters to `src-tauri/icons/` (D9). No 1024 px PNG, because no package needs it. |
| C6 | asset-manifest ("About view renamed Clawdio") vs R5 menu (Widgets, Layouts, Settings, Rescan) and design.md §11 | No About view exists. A new menu entry is a new feature. | An About section inside the Settings dialog. No new menu entry (D12). |
| C7 | asset-manifest (`assets/branding/reference/`) vs R31 and design.md front matter (`assets/reference/`) | Moving the mockup breaks two references. | Keep `assets/reference/`. |
| C8 | design.md §7 (Blur Fade or Magic Card "may be appropriate") vs R30 `[D]` (only components with a function in R5, R6 or R29; no decorative effects) | Both candidates are decorative. Both need Motion. | No Magic UI components. Motion is not a dependency. CSS transitions only (D6). The owner may name a component (Q4). |
| C9 | Mockup (sidebar views, no Stop, macOS window buttons, fortress art, invented songs) vs R5, R6, R28, R29, design.md §1, §5, §9, prompt Phase 3.7 | The mockup shows a fixed shell and reference-only content. | Requirements and design.md §5 govern the shell. The mockup gives color, logo direction and the transport look. |
| C10 | R31 `[D]` (name, window title, bundle identifier and User-Agent from one build config value) vs OS data folders keyed to the identifier | Tauri config cannot derive one field from another. Deriving the identifier from the display name would move user data on a rename. | `productName` in `src-tauri/tauri.conf.json` is the one value for name, window title, User-Agent and About. `identifier` is in the same file and changes only by owner decision. The owner confirmed it on October 11, 2026 (D2, Q2 closed). |
| C11 | design.md §6 ("Album cards") vs R5 (thumbnail "in Album rows") and R28 (lists, no grid) | R28 has no album grid. | Album rows follow the card guidance: cover, title, artist, quiet hover. |
| C12 | design.md §4 ("main view title 24 px") vs the docking shell | Widgets have no page title. | Type scale map in section 6.12. |
| C13 | tokens.json values vs design.md §3 ("ensure contrast", "do not use red alone") | `brand.red` on `bg.canvas` is 3.96:1. `text.primary` on `brand.red` is 4.24:1 and on `state.redHover` 3.67:1. `brand.red` on `state.selected` is 2.77:1. `brand.steel` on `bg.canvas` is 2.22:1. | Color role rules (D10), enforced by a test (P0.15). |
| C14 | R5 (menu button "fixed in the top-right corner") vs the mockup header with the wordmark | The button needs a place that no layout covers. | A 32 px header strip above the dock: wordmark left, menu button right (D11). |
| C15 | Prompt constraints ("Do not commit or open PRs unless repository workflow requires it") vs a phased build | No workflow exists until `AGENTS.md`. | `AGENTS.md` (P0.1) defines commits per phase after validation. |
| C16 | design.md §6 ("Album cards: unobtrusive hover"), §8 (no animation on repeated list rows) | Hover feedback on 50,000 rows. | Rows change background color with no transition. Transitions are for buttons, menus and dialogs only. |
| C17 | R8 ("It never overwrites existing art") vs R8 "Set cover" ("The app saves it as `cover.jpg`") | "Set cover" on an album that already has `cover.jpg` must either overwrite or fail. | Ask, then replace atomically (D19). R8's rule applies to the automatic fetch. The owner confirmed this on October 11, 2026 (Q7). |
| C18 | Section 5 (a cover file that fails to decode is ignored and "the online lookup still applies") vs R8 (never overwrite; no automatic retry) | When the broken file is `cover.jpg`, a fetched image cannot be saved, so every startup would look the album up again. | A broken `cover.jpg` and a corrupt `sidecar.json` make the album a non-candidate. Each is logged (D44). A broken file with another cover name does not block the lookup. |
| C19 | `AGENTS.md` Edits rule 9 ("Mock data only in tests") vs R20 (Milestone 0 before feature work, every widget populated with test data) | At P3 the app cannot read music yet, so the spike must generate its data inside the app build. Playwright mocks run only the UI in a browser and cannot measure memory across all app processes. | Keep D35: the `fixtures` Cargo feature in `src-tauri` is an approved exception to Edits rule 9. It is off by default and never goes into a release bundle (P3.6 builds the bundles without it). P0.1 names the exception in the project rules. P6.7 deletes it (P6-AC8). The owner confirmed this on October 11, 2026. |

### 5.2 Plan decisions

The sources leave these details open. The owner may change any of them. Section 13 records changes.

| ID | Decision | Reason |
|---|---|---|
| D1 | Cargo workspace with two crates. `crates/clawdio-core`: all library, scan, queue, playlist, import, lyrics, sidecar, online and settings logic, no Tauri and no audio device. `src-tauri`: Tauri app, commands, audio output, media controls, window. | Core tests run without WebKitGTK or ALSA packages. Clear boundary. |
| D2 | `productName` "Clawdio". `identifier` `io.github.penguinpants.clawdio` (no hyphen, because Linux D-Bus names come from it). The window title is set at runtime from `app.package_info().name`, because `productName` does not set the title. | R31 single name value (C10). |
| D3 | rodio 0.22.2 with `default-features = false` and features `playback`, `mp3`, `vorbis`, `wav`, `symphonia-adpcm`. Symphonia pinned to `=0.5.5` (the version rodio 0.22.2 uses) with `mp3`, `ogg`, `vorbis`, `wav`, `pcm`, `adpcm`. Symphonia 0.6 is not used. | Section 6 (rodio pinned, Symphonia with `mp3`). One Symphonia copy in the binary. |
| D4 | Own text folding and natural order in `fold.rs` on `unicode-normalization`: NFD, drop combining marks, lowercase, compare digit runs by value, then exact bytes. `icu_collator` is not used. | R3 order with a small, testable function. ICU adds data and size. |
| D5 | Zustand stores for player, library and UI state. Components subscribe to slices. | Position events (4 per second) must not re-render the 50,000-row lists. |
| D6 | No Magic UI components. No Motion. CSS transitions with `motion.fast` and `motion.panel`. | R30 rule and design.md §7 (C8). The registry has no virtualized or functional component that fits. |
| D7 | Geist Sans Variable through `@fontsource-variable/geist` (OFL 1.1, tabular numerals), the font of the shadcn/ui default preset. Fallback: `system-ui, "Segoe UI", Ubuntu, Cantarell, sans-serif`. | design.md §4 (C4). No second font dependency. |
| D8 | Dockview (`dockview-react`): floating groups disabled, no pop-out calls, tabbed groups allowed, custom tab header. | R29, section 6 docking constraint. |
| D9 | `tauri icon` makes the rasters from the SVG. Commit only what `bundle.icon` lists: `32x32.png`, `64x64.png`, `128x128.png`, `128x128@2x.png`, `icon.png` (512) and `icon.ico` (16, 24, 32, 48, 64, 256). Delete the other outputs. `beforeBuildCommand` regenerates them. The committed copies let `cargo` builds work without the Tauri CLI. No README banner and no social image: the README uses the SVG wordmark. | R31, C5, asset-manifest "only if helpful". |
| D10 | Color role rules. (1) Text uses `text.primary`, `text.secondary` or `text.muted`. Red text only at 24 px and larger, or 18.66 px and larger when bold. Error messages use `text.primary` with a `brand.red` icon. (2) Text on a red fill uses `state.redActive` in every state (5.33:1). `state.redHover` and `brand.red` fills carry icons only. (3) Indicators (focus ring, slider range and thumb, switch on, active toggles, active drop target) use `brand.red`, 3.40 to 3.96:1 on the four dark surfaces. `state.redActive` is never an indicator (2.70 to 3.16:1). (4) On `state.selected` rows, icons, bars and outlines use `text.primary`. (5) `brand.steel`: the wordmark "dio" on light backgrounds and the decorative seek and volume track. The wordmark "dio" on dark uses silver `#B7B7B7`. (6) Borders are decoration. Inputs carry an icon and placeholder text (`text.muted`, at least 4.5:1). (7) No state is shown by color alone: selected rows add a left bar, pressed toggles and the active tab add an underline or a dot. | C13. WCAG 2.2 AA for text and non-text contrast. design.md §3. |
| D11 | A 32 px header strip: wordmark at left, menu button at right. | C14. |
| D12 | About is a section of the Settings dialog: name, version, license and a link to the notices. | C6. |
| D13 | The webview gets no filesystem, HTTP, shell or dialog permission. Rust opens native pickers. IPC carries ids and validated names, not file paths. | Security (section 6.13). |
| D14 | The library index lives in Rust memory. SQLite is the rebuildable cache (R19). The UI asks for id lists and fetches row data for the visible window only. | Memory (R20) and responsiveness (AC-2). |
| D15 | `ts-rs` generates TypeScript types for IPC structs into `src/lib/ipc/bindings/` during `cargo test`. CI fails if they are not committed. | One source of truth for IPC types. |
| D16 | Scan classes: files with other extensions are ignored and not counted (R1). "Unsupported type": an audio extension with other content. "Unsupported codec": an Ogg stream that is not Vorbis, or a WAV encoding other than PCM integer, PCM float or ADPCM (for example A-law, mu-law or MP3 in WAV), or one of those three that Symphonia 0.5.5 cannot decode. "Corrupt file": a parse or probe failure. | R2 skip reasons. |
| D17 | Reset layout is Ctrl+Shift+L. Space toggles play and pause everywhere except in text fields and inside open menus and dialogs. On a focused button outside a dialog, Space toggles playback and Enter activates the button. | R25 exempts only typing. Menus and dialogs keep Space for their own controls. |
| D18 | A transient status message shows for 5 s, then the line returns to "Ready" or the running job. | R5 status line. |
| D19 | "Set cover" over an existing `cover.jpg` asks for confirmation, then replaces it atomically. | C17. R8's "never overwrites" applies to the automatic fetch. The owner confirmed this on October 11, 2026 (Q7). |
| D20 | The "Add to playlist" submenu lists all playlists except Favorites, so only the heart adds to Favorites and Favorites never holds duplicates. "Remove from playlist" and Delete work on Favorites entries like on any playlist. The name "Favorites" is reserved in any letter case. | R12 (Favorites toggles), R25 (Delete in a playlist), R26 (a normal playlist). |
| D21 | A new playlist name that matches an existing file (ignoring case) is rejected with a message. Import names: each forbidden character becomes "_", leading and trailing spaces and dots are removed, a reserved name gets " (imported)" and a taken name gets " (2)", " (3)" and so on. | R12 rule applied to R14 output names. |
| D22 | Apple XML: import each playlist in the file that has no `Master` key and no `Distinguished Kind` key. One `.m3u8` per playlist. | R14. Library-wide system playlists are not user playlists. |
| D23 | Heart buttons on song rows are pointer targets (`tabIndex = -1`). Keyboard users use the Now playing heart. | Section 7 defers accessibility work beyond platform defaults and R25. Buttons inside listbox options break the listbox pattern. |
| D24 | Enter on a playlist row plays the playlist, like a double-click. | R25 Enter rule and R12 double-click rule. |
| D25 | Saved playback state holds the queue, current entry, position and volume. Shuffle and repeat are not saved. | R27 lists exactly these four items. |
| D26 | `.lrc` and `.txt` files are read as UTF-8 (BOM removed), with a Windows-1252 fallback. | Same rule as legacy `.m3u` in R14. |
| D27 | Thumbnails: 96 px JPEG for album rows. Display art: 512 px JPEG for Now playing and the OS panel. Cache key: album folder relative path, source size and modified time. | R5, R19, R20. |
| D28 | R20 memory method. Windows: sum of the private working set of the app process tree (includes WebView2 processes). Linux: sum of PSS of the app process tree (includes WebKit processes). Idle: 60 s after the library loads, no playback, window visible. Median of 3 runs. | R20 says "across all processes" but names no metric. |
| D29 | Online code uses async `reqwest` 0.13 (rustls). One gate object owns the client. Cancellation drops the request future through a token. A custom redirect policy checks the gate and the host allow-list on each hop (max 5, HTTPS only). | R7 (zero calls when off, abort in flight). |
| D30 | Music folder missing at startup: the Library body shows the message and "Change folder". The cached library is not shown. The cache is not touched. | Section 5. Playback from a missing folder would fail. |
| D31 | Tests: Vitest with React Testing Library. Playwright (Chromium and WebKit) against Vite with mocked IPC. axe-core. No `tauri-driver` (its README says pre-alpha). OS-level checks are manual. | Reliable automation now. Chromium is close to WebView2. WebKit is close to WebKitGTK. |
| D32 | A decode error is any of: (a) a failure to open or probe a file; (b) an error that the engine's own Symphonia source reports while decoding: an I/O error other than end of stream, or more than 3 packet decode errors in a row (a single bad packet is skipped and logged); (c) an end of stream more than 2 s before a duration that the container states (WAV header, Ogg granule position, MP3 Xing, VBRI or LAME header). An estimated duration never triggers rule (c). The engine decodes with this source instead of `rodio::Decoder`, because `rodio::Decoder` hides errors and Symphonia reports a cut-off file as a normal end of stream. | R6 decode rule. Codex review finding X4. |
| D33 | Window minimum 800 x 560, default 1200 x 800. Widget minimums (width x height): Library 320 x 240, Transport controls 320 x 88, Now playing 240 x 88, Playlists 200 x 160, Play queue 200 x 160, Lyrics 200 x 160. P3 may tune them and records the change. | Section 5 (window smaller than layout). |
| D34 | Source guards: no hex color literals in `src/` (except the generated token file). No Tailwind default palette color (a class such as `bg-red-500` or a variable such as `--color-red-500`) in `src/` (F-07). No product name literal in `src/`, `crates/` or `src-tauri/src/`. SVG rules in P1.5. | design.md §10, section 6 branding constraint, AC-15. |
| D35 | Milestone 0 test data uses a `fixtures` Cargo feature. P6 deletes it. The owner confirmed this on October 11, 2026 (C19). | Spike data without dead code later. |
| D36 | Test audio: tiny seed files made with ffmpeg and committed (under 100 KB). Test trees and the 50,000-track library are generated at test time. | No copyrighted audio. No large files in git. |
| D37 | Windows release builds turn off WebView2 browser accelerator keys (find, reload, print, DevTools) through `ICoreWebView2Settings3`. Tauri 2.12 has no option for it. | Ctrl+F belongs to R25. F5 must not reload the app. |
| D38 | The portable build relies on Tauri's built-in "WebView2 Runtime not found" dialog (Tauri 2.6 and later), which links to the Microsoft download page. `main` exits with code 1 on `WebviewRuntimeNotInstalled` and does not panic. | R22. No extra code. |
| D39 | souvlaki 0.8.3 with default features (libdbus on Linux). | R24. |
| D40 | Log: file `app.log`, 1 MB per file, 5 old files kept. | R23 size-based rotation. |
| D41 | Thumbnails and display art load through a `thumb://` URI scheme. Rust serves only plain `.jpg` file names from the thumbnail folder. IPC carries the file name; the webview builds the URL with `convertFileSrc(name, "thumb")`. The asset protocol is off. | D13 (no file paths over IPC). Owner decision October 11, 2026 (1.11); it replaced the asset protocol scope. |
| D42 | Metadata fill picks a release in three steps. (1) Search releases by the folder artist and album; if that gives no single release group by the D43 normalization, search again by the most common album and artist tags of the album's songs, when they differ. (2) Among the remaining releases, score each by the number of songs whose title (tag, else the R4 file-name title) matches a track title after folding. (3) The release with the highest score wins if at least half the songs match and no other release has the same score; prefer a track count equal to the song count, then the earliest date. Otherwise there is no proposal. | R10: "It looks up by folder names, existing tags and file name." Codex review finding Y4. |
| D43 | Name normalization for R8 and R10 matching: fold (D4); remove a leading year with an optional separator ("1973 - ", "1973. ", "(1973) "); remove each bracketed or parenthesized group that holds a 4-digit year or any of these words: remaster, remastered, deluxe, edition, expanded, anniversary, bonus, special, reissue, version, mono, stereo; remove a leading "the "; collapse spaces. | R8 gives examples, not a full list. |
| D44 | Online candidates use flags that the scan stores: per track, whether it has an embedded picture; per album, the cover file state (none, valid, broken). A cover file is decoded only when it is new or changed. An album with a broken `cover.jpg` or a corrupt `sidecar.json` is not a candidate and is logged once per scan. | C18. R8 (no overwrite, no automatic retry). Startup must not read 50,000 files (P5-AC7). |
| D45 | Clamp rule: when the minimum sizes of an arrangement exceed the window along one axis, the dock lowers the group minimums in proportion, never below 32 px (the widget header). The dock has no scroll bar. | Section 5 "clamps the layout to fit". The D33 minimums add up to more than the 560 px window when all six widgets stack. |
| D46 | Track ids are monotonic within a session and never reused. A removed track stays as a tombstone until the next start, and an unknown or removed id returns a typed error. The index lives in the core behind `Arc<RwLock<_>>`. The player thread owns the queue: every `player_*` and `queue_*` command goes through its channel. | Rescans must not shift ids under the queue, the selection or a pending `library_rows` call. |
| D47 | On Linux, portable mode applies to the AppImage. "Next to the executable" means next to the AppImage file (the `APPIMAGE` environment variable), for both the marker and the R18.1 path rule. | Inside an AppImage the executable runs from a temporary mount. |
| D48 | Tauri's CSP nonce injection stays on. If a release build reports a `style-src` violation, add `dangerousDisableAssetCspModification: ["style-src"]` and record it. The e2e suite serves the section 6.13 CSP and fails on any violation. | A nonce makes browsers ignore `'unsafe-inline'`. Inline styles from libraries must not break silently. |
| D49 | Milestone 0 over 300 MB on an OS: that OS's worst value becomes its memory target, and the build continues. No stop. An OS at or under 300 MB keeps the 200 MB target. | Owner answer to B2, October 11, 2026. R20 calls the targets adjustable. This replaces the R20 `[D]` stop rule. |

### 5.3 Owner confirmations

None of these blocks work. Q6 blocked P2 until the owner signed off the brand after P1 (October 11, 2026). Each other question has a default.

| ID | Question | Default | Needed by |
|---|---|---|---|
| Q1 | Copyright holder and publisher name. design.md says "Dr. Claw Development". Dr. Claw is a character name owned by a third party (risk K7). | **Answered October 11, 2026:** keep "Dr. Claw Development". The owner accepts risk K7. | Closed |
| Q2 | Bundle identifier. Changing it after release moves user settings. | **Answered October 11, 2026:** use `io.github.penguinpants.clawdio` | Closed |
| Q3 | Bundle Geist Sans, or use system fonts only. | **Answered October 11, 2026:** bundle Geist Sans | Closed |
| Q4 | Name any Magic UI component that serves R5, R6 or R29. | None | Any time |
| Q5 | Supply real exports for AC-4: one Apple XML, one MusicBee M3U8, one legacy `.m3u`. | **Answered October 11, 2026:** the owner supplies the formats they have. A missing format stays "not verified". The files never go into the public repo. | P12 sign-off |
| Q6 | Sign off the wordmark, app icon and monogram. | **Answered October 11, 2026:** the owner reviewed after P1 (contact sheet and export previews) and signed off. | Closed |
| Q7 | Confirm that "Set cover" may replace an existing `cover.jpg` after a confirmation (C17). | **Answered October 11, 2026:** ask, then replace | Closed |
| Q8 | If the full icon is not legible at 16 or 24 px after P1, may the 16 and 24 px layers come from `clawdio-icon-simple.svg`? R31 names one source file. | **Answered October 11, 2026:** yes, only if P1.7 shows that the full icon fails at 16 or 24 px | Closed |

### 5.4 Blockers and gates

| ID | Item | Effect | Resolution path |
|---|---|---|---|
| B1 | `AGENTS.md` did not exist. The task and the prompt require it. | None. | Closed October 11, 2026: the owner supplied `AGENTS.md`; the review sections were added; P0.1 adds the project rules. |
| B2 | Milestone 0 outcome (R20, section 8). | P4 and later wait for the P3 measurements. | Closed October 11, 2026: P3 verdict recorded in `docs/milestone-0.md`. Linux 468 MB raised the Linux target (D49); Windows 112 MB passes. **Owner answer October 11, 2026:** over 300 MB on an OS raises that OS's memory target to its measured value, and the build continues (D49). |
| B3 | R13 path base (section 8). If a target player fails on `..` paths, the owner decides whether playlists move to the folder root. | P11 may close as Done with exceptions while B3 is open. P18 cannot be Done until B3 closes. | P11.9 interop test. |
| B4 | R14 MusicBee export assumption (section 8). | AC-4 needs a real export. | Q5 sample, P12. |
| B5 | Windows and Linux desktop machines for manual checks (media keys, device unplug, portable copy, memory). | Criteria stay "not verified" without them. | P18 needs at least one Windows 10 or 11 machine and one Ubuntu 22.04 desktop, or a recorded exception. **Owner answer October 11, 2026:** a Windows 10 or 11 machine only. P18 records each manual Linux criterion as an exception ("not verified: no Ubuntu desktop"). |
| B6 | The environment egress policy denied `ui.shadcn.com` (HTTP 403). `shadcn init` and `shadcn add` download from it. | P0.10 stopped. P2.14 needs the same host. | Closed October 11, 2026: the owner allowed the host in the environment network settings. A new environment needs the same setting. |
| B7 | P1-AC4 asks for separate wordmark bars at the 20 px header height. With the P1.1 geometry (five bars of at least 18 units and gaps of at least 8 units inside a 128-unit inner ring) each gap is 0.5 px at 20 px. Five 1 px bars with 1 px gaps need 9 px; the inner ring is 8 px. | P1 could not be Done. | Closed October 11, 2026: the owner chose F-09 option (b). P1-AC4 checks bar separation at the 72 px README height. The assets did not change. |
| B8 | The Windows Milestone 0 numbers (P3-AC2 to P3-AC5) need `measure.yml` on windows-latest. GitHub runs it only on a push to a `measure/**` branch or by dispatch from the default branch. The agent may push only to its task branch. | P3 could not close; P4 waited for the Windows verdict (B2). | Closed October 11, 2026: the owner allowed pushes to `measure/p3`. Run 38171140952 measured Windows. |

---

## 6. Architecture

### 6.1 Overview

```text
+--------------------------- Webview (React) ----------------------------+
| AppHeader | DockShell (Dockview) with six widgets | StatusLine          |
| Zustand stores <- events     typed commands (ts-rs types) ->           |
+-------------------------------|----------------------------------------+
                                | Tauri IPC (commands, events)
+------------------------------ src-tauri ------------------------------+
| commands  events  window  player (rodio thread)  media_controls       |
| plugins: single-instance, log, dialog (Rust API), opener (Rust API)    |
+-------------------------------|----------------------------------------+
                                | plain Rust calls
+------------------------- crates/clawdio-core -------------------------+
| paths settings state | scan (walk, probe) cache(SQLite) library index |
| queue | playlist import | artwork thumbs | lyrics sidecar | net (gate) |
+-----------------------------------------------------------------------+
        |                         |                          |
  music folder (read,       OS or portable data       MusicBrainz, CAA,
  writes only by R8-R14)    folders (section 6.8)     LRCLIB (opt-in only)
```

### 6.2 Stack and versions

Versions were checked against crates.io, npm and project sources on October 11, 2026. P0 pins exact versions in `Cargo.toml` and `package.json`. Rows marked "pin at use" were not checked. The phase that adds the package records the version.

| Area | Package | Version | Notes |
|---|---|---|---|
| App shell | `tauri` / `tauri-build` | 2.12.3 / 2.7.2 | `protocol-asset` feature for thumbnails |
| CLI and JS API | `@tauri-apps/cli` / `@tauri-apps/api` | 2.12.2 / 2.12.3 | `mockIPC`, `mockConvertFileSrc` for tests |
| Plugins | `tauri-plugin-single-instance`, `-log`, `-dialog`, `-opener` | 2.5.3, 2.10.1, 2.8.2, 2.7.1 | Dialog and opener used from Rust only |
| Audio | `rodio` | 0.22.2 | `Player`, `DeviceSinkBuilder` with error callback (D3) |
| Decode | `symphonia` | =0.5.5 | MPL-2.0, NOTICE entry |
| Tags | `lofty` | 0.25.4 | USLT maps to `ItemKey::UnsyncLyrics` |
| Media keys | `souvlaki` | 0.8.3 | Windows needs the HWND |
| Cache | `rusqlite` (`bundled`) | 0.40.2 | SQLite 3.53.2 |
| Images | `image` (`jpeg`, `png` only) | 0.25.10 | Thumbnails, Set cover conversion |
| Text | `unicode-normalization` | 0.1.25 | D4 |
| Traversal | `walkdir` | 2.5.0 | Junctions listed, not entered |
| HTTP | `reqwest` (rustls) | 0.13.5 | Size limit enforced by streaming |
| Import | `plist` / `encoding_rs` | 1.10.1 / 0.8.42 | Apple XML, Windows-1252 |
| Atomic writes | `tempfile` | 3.27.0 | Temp file in the target folder |
| Windows interop | `webview2-com` / `windows` | 0.39 / 0.62 | Same versions as Tauri (D37) |
| Supporting crates | `serde`, `serde_json`, `thiserror`, `log`, `tokio-util`, `ts-rs` | pin at use | |
| Dev crates | `proptest`, `httpmock`, `tempfile` | pin at use | |
| License tools | `cargo-deny` / `cargo-about` | 0.20.2 / 0.9.2 | P18 |
| UI | `react` / `react-dom` | 19.3.0 | |
| Build | `vite` / `@vitejs/plugin-react` | 8.3.4 / 6.1.2 | Node 22.12 or later |
| Language | `typescript` | 6.0.3 | TypeScript 7 is not supported by typescript-eslint 8.71 |
| Lint | `eslint` / `typescript-eslint` | 10.12.0 / 8.71.1 | Flat config |
| CSS | `tailwindcss` / `@tailwindcss/vite` | 4.3.3 | `@theme` for tokens |
| Components | shadcn/ui CLI | 4.21.4 | Base UI primitives (the CLI default since July 2026), Lucide icons |
| Docking | `dockview-react` | 8.5.1 | MIT. Not `dockview-enterprise`. |
| Virtual lists | `@tanstack/react-virtual` | 3.14.15 | Trees are flattened |
| State | `zustand` | 5.0.15 | D5 |
| Icons | `lucide-react` | 1.55.0 | ISC |
| Font | `@fontsource-variable/geist` | 5.3.0 | OFL 1.1 (D7) |
| Unit tests | `vitest` | 5.0.3 | jsdom, React Testing Library (pin at use) |
| E2E tests | `@playwright/test` / `@axe-core/playwright` | 1.64.0 / 4.13.0 | Dev only |
| CI runtime | Node.js | 24 LTS | |

### 6.3 Repository layout (target)

```text
AGENTS.md  LICENSE  NOTICE  README.md
package.json  package-lock.json  vite.config.ts  tsconfig.json  eslint.config.js
playwright.config.ts  components.json  index.html  rust-toolchain.toml
Cargo.toml  Cargo.lock  deny.toml  about.toml
.github/workflows/  ci.yml  measure.yml  release.yml
assets/reference/clawdio-approved-mockup.png        (existing)
assets/branding/source/   clawdio-wordmark.svg  clawdio-cat.svg  clawdio-monogram.svg
assets/branding/export/   wordmark primary, light, mono; icon full, simple, mono (SVG)
assets/branding/ui-icons/ README.md (optional per-name icon overrides, R31)
theme/tokens.json                                   (existing)
docs/  build-plan.md  requirements-traceability.md  theming-and-brand.md
       file-formats.md  milestone-0.md  release-checklist.md  images/
scripts/  build-tokens.mjs  check-sources.mjs  check-svg.mjs  icons.mjs  contact-sheet.sh
          measure-memory.sh  measure-memory.ps1
crates/clawdio-core/
  src/  lib.rs config.rs paths.rs settings.rs state.rs fold.rs cache.rs queue.rs
        api.rs (IPC structs) library/ scan/ playlist/ import/ artwork.rs thumbs.rs
        lyrics.rs sidecar.rs net/ metadata_fill.rs
  tests/  common/ fixtures/seed/   examples/gen_test_library.rs
src-tauri/
  tauri.conf.json  capabilities/default.json  icons/  build.rs
  src/  main.rs lib.rs window.rs commands/ events.rs player/ media_controls.rs
        webview2_keys.rs
src/
  main.tsx App.tsx styles/ lib/ipc/ lib/keyboard.ts lib/format.ts store/
  shell/ widgets/ dialogs/ components/ui/ components/brand/ components/icons.tsx
tests/e2e/
```

### 6.4 Rust core modules

| Module | Responsibility | Phase |
|---|---|---|
| `config` | User-Agent string from name, version and contact URL | P0 |
| `paths` | Data folders, portable mode, music folder path storage | P4 |
| `settings`, `state` | `settings.json`, `state.json` with atomic writes | P4, P9 |
| `fold` | Folding and natural order | P5 |
| `scan` | Traversal, classification, incremental sync, jobs | P4, P5 |
| `cache` | SQLite cache, schema version | P5 |
| `library` | Grouping, titles, order, index, queries | P5, P6 |
| `queue` | Pure play queue state machine | P7 |
| `artwork`, `thumbs` | Art source order, thumbnails, Set cover | P10 |
| `playlist` | M3U8 read and write, names, Favorites | P11 |
| `import` | M3U, M3U8, Apple XML, matching, report | P12 |
| `lyrics` | Local sources, LRC cleanup, fetch | P13, P15 |
| `sidecar` | `sidecar.json` read and write | P14, P16 |
| `net` | Gate, client, rate limiter, MusicBrainz, CAA, LRCLIB, name normalization | P14 |
| `metadata_fill` | Preview and apply | P16 |
| `api` | IPC structs with `serde` and `ts-rs` | All |

### 6.5 Tauri shell modules

| Module | Responsibility | Phase |
|---|---|---|
| `main.rs`, `lib.rs` | Builder, plugins (single-instance first), state, setup | P0, P4, P9 |
| `window.rs` | Main window, data directory, size save | P4 |
| `webview2_keys.rs` | Accelerator keys off (Windows) | P0 |
| `commands/` | One file per area, thin wrappers over the core | All |
| `events.rs` | Event names and throttling | P4 onward |
| `player/` | Audio thread, rodio output, test output | P4, P7 |
| `media_controls.rs` | souvlaki | P8 |

### 6.6 Frontend structure

- `shell/`: `DockShell`, `WidgetTab`, `AppHeader`, `AppMenu`, `StatusLine`, `layouts.ts`, `widgets.ts`, `persistence.ts`.
- `widgets/`: one folder per widget (`library`, `transport`, `now-playing`, `playlists`, `queue`, `lyrics`).
- `dialogs/`: Settings, online notice, new playlist, delete playlist, import report, metadata preview, Set cover confirm.
- `store/`: `player.ts`, `library.ts`, `ui.ts` (Zustand).
- `lib/ipc/`: `commands.ts` (typed `invoke` wrappers), `events.ts` (typed `listen`), `bindings/` (generated).
- `components/ui/`: shadcn/ui components, added only when a phase uses them.

### 6.7 IPC contract

Commands take ids and plain values. They return typed structs or a typed error `{ code, message }`.

| Area | Commands | Events |
|---|---|---|
| App and settings | `settings_get`, `choose_music_folder`, `set_online_lookups`, `first_run_notice_done`, `open_log_folder` | `settings-changed` |
| Library | `library_artists`, `library_albums`, `library_song_ids`, `library_rows`, `library_tree`, `rescan`, `cancel_job` | `library-changed` (max 2/s), `job-progress`, `status-message` |
| Player and queue | `player_play_list`, `player_play`, `player_pause`, `player_toggle`, `player_stop`, `player_next`, `player_previous`, `player_seek`, `player_set_volume`, `player_set_shuffle`, `player_set_repeat`, `queue_get`, `queue_append`, `queue_remove`, `queue_clear` | `player-state`, `player-position` (4/s while playing), `queue-changed` |
| Art | `album_art`, `set_album_cover`, `retry_artwork_lookup` | `art-ready` |
| Playlists | `playlists_list`, `playlist_entries`, `playlist_create`, `playlist_add`, `playlist_remove_entry`, `playlist_delete`, `favorite_toggle`, `playlist_import` | `playlists-changed` |
| Lyrics | `lyrics_get`, `lyrics_fetch` | `lyrics-changed` |
| Metadata | `metadata_fill_preview`, `metadata_fill_apply` | none |
| Layout | `layout_load`, `layout_save` | none |

### 6.8 Data locations

| Item | File | Normal mode | Portable mode (R18.1) |
|---|---|---|---|
| Settings and window size | `settings.json` | `app_config_dir` | `data/config/` |
| Widget arrangement | `layout.json` | `app_config_dir` | `data/config/` |
| Playback state | `state.json` | `app_config_dir` | `data/config/` |
| Cache database | `library.sqlite` | `app_cache_dir` | `data/cache/` |
| Thumbnails and display art | `thumbs/*.jpg` | `app_cache_dir/thumbs/` | `data/cache/thumbs/` |
| Log | `app.log` and rotated files | `app_log_dir` | `data/logs/` |
| WebView profile | engine files | Tauri default (`app_local_data_dir`) | `data/webview/` |
| Playlists, Favorites | `*.m3u8` | music folder | music folder |
| Sidecars | `cover.jpg`, `.lrc`, `.txt`, `sidecar.json` | music folder | music folder |

`data/` is next to the executable. On Linux, portable mode applies to the AppImage, and `data/` is next to the AppImage file (D47). Tauri's `appDirectoriesOverride` is not used, because the R18.1 marker is a runtime check.

### 6.9 Library model

- **Track:** id (index in memory), relative path, file name, artist group, album group, tag title, tag artist, tag track, tag disc, duration, sidecar title and track (P16), computed title, track number and disc order, folded search key.
- **Artist and album groups:** folder names unchanged, folded sort keys, "Unknown Artist" and "Unknown Album" last.
- **Ids are session ids** (D46). They are monotonic and never reused in a session. A removed track stays as a tombstone until the next start. Ids change after a restart or a cache rebuild, so everything stored on disk uses relative paths (R19, R27).
- **Ownership:** the index lives in the core behind `Arc<RwLock<_>>`. The scan thread writes; commands read.
- **Scan flags** (D44): each track records whether it has an embedded picture. Each album records its cover file state (none, valid, broken).
- **Queries return ids.** Rows are fetched for the visible window only (D14).
- **Updates during a scan** go to the cache in batches of 500 and to the index at once. The UI gets `library-changed` at most twice per second.

### 6.10 Playback model

- `clawdio-core::queue` decides what plays (pure logic, P7.1). The player thread owns the queue (D46).
- `src-tauri::player` plays it: one audio thread, a command channel, a rodio `Player` on a device sink opened by `DeviceSinkBuilder::from_default_device()` with an error callback. The sink opens on the first Play. An `EmptyCallback` source after each track signals the end.
- Position is read every 250 ms. Events go out 4 times per second while playing.
- Device error: stop, message, reopen the default device on the next Play (section 5).
- Gapless later: `prepare_next` exists. v1 calls it after the current track ends (section 6 constraint).

### 6.11 Online services model

- One `OnlineGate` in the core holds the switch state, a cancellation token and the HTTP client. Code outside `net` cannot make a request (the client type is private to the module).
- Every request and every redirect hop checks the switch first. Turning the switch off cancels the token: queued work stops and in-flight requests are dropped (R7).
- Host allow-list: `musicbrainz.org`, `coverartarchive.org`, `archive.org` and its subdomains (Cover Art Archive redirects), `lrclib.net`. HTTPS only.
- MusicBrainz: at least 1 s between requests (R8). LRCLIB: one request at a time. On HTTP 503 or 429 the job stops and retries at the next startup.
- User-Agent: `Clawdio/<version> ( https://github.com/Penguin-Pants/Clawdio )`, built from `productName` and the version (R8, R31). LRCLIB also gets the same value in `Lrclib-Client`.
- Downloads stream with a 10 MB cap. Images are decoded before saving.
- Tests point the base URLs at a local mock server.

### 6.12 Theme, brand and icon pipeline

**Pipeline.** `theme/tokens.json` goes to `scripts/build-tokens.mjs`, which writes `src/styles/tokens.generated.css`. Tailwind v4 builds it into the CSS bundle. A token change needs a rebuild and nothing else (AC-7, AC-15).

**Token map**

| Token | CSS variable | UI roles |
|---|---|---|
| `colors.brand.red` | `--color-brand-red` | Slider range and thumb, play ring, active toggles, switch on, focus ring, active drop target, error icons |
| `colors.brand.steel` | `--color-brand-steel` | Wordmark "dio" on light backgrounds; decorative seek and volume track |
| `colors.bg.canvas` | `--color-bg-canvas` | Window, header strip, status line |
| `colors.bg.surface` | `--color-bg-surface` | Widget bodies |
| `colors.bg.elevated` | `--color-bg-elevated` | Widget headers (tab bars), menus, dialogs, inputs, art placeholder |
| `colors.bg.hover` | `--color-bg-hover` | Row and button hover, drop zone overlay |
| `colors.border.default` | `--color-border-default` | Panel boundaries, splitters |
| `colors.border.strong` | `--color-border-strong` | Splitter hover, input border, dialog border |
| `colors.text.primary` | `--color-text-primary` | Main text, active tab title |
| `colors.text.secondary` | `--color-text-secondary` | Artist, album, status line |
| `colors.text.muted` | `--color-text-muted` | Hints, placeholders, inactive tab titles, durations, missing entries |
| `colors.state.selected` | `--color-state-selected` | Selected rows |
| `colors.state.redHover` | `--color-state-red-hover` | Hover of red icon controls |
| `colors.state.redActive` | `--color-state-red-active` | Pressed red controls, fill of red text buttons |
| `radii.control` | `--radius-control` | Buttons, inputs, menu items |
| `radii.card` | `--radius-card` | Widgets, album thumbnails, art |
| `radii.dialog` | `--radius-dialog` | Dialogs |
| `motion.fast` | `--clawdio-motion-fast` | Hover and focus transitions |
| `motion.panel` | `--clawdio-motion-panel` | Menu and dialog open and close |
| `motion.reduced` | policy | The reduced-motion block (section 6.16) |

`radii.control` also feeds the shadcn `--radius` variable. `state.redHover` and `state.redActive` keep their camelCase source keys; the script writes kebab case.

**shadcn/ui semantic variables** (in `globals.css`, through `@theme inline`): `--background` canvas, `--foreground` text.primary, `--card` surface, `--popover` elevated, `--primary` brand.red (indicators), `--primary-foreground` text.primary, `--secondary` elevated, `--muted` surface, `--muted-foreground` text.muted, `--accent` hover, `--accent-foreground` text.primary, `--destructive` brand.red, `--border` border.default, `--input` border.strong, `--ring` brand.red at full opacity, `--radius` radii.control. The Button default variant is edited to a `state.redActive` fill, because text on `brand.red` fails (P0.10).

**Dock chrome.** Each `--dv-*` variable in `dockview-react/dist/styles/dockview.css` for group background, tab bar, tabs, separators, sashes and drop overlays maps to a token variable (P2.10). Widget headers: `bg.elevated`. Splitters: `border.default`, hover `border.strong`. Drop zones: `bg.hover` overlay. Active drop target: 2 px `brand.red` border.

**Contrast role pairs** (checked by P0.15; ratios from the current tokens)

| Pair | Ratio | Rule | Result |
|---|---|---|---|
| text.primary on canvas, surface, elevated, hover, selected | 16.81 to 11.75 | text 4.5 | Pass |
| text.secondary on the same five backgrounds | 9.81 to 6.86 | text 4.5 | Pass |
| text.muted on the same five backgrounds | 6.91 to 4.83 | text 4.5 | Pass |
| text.primary on state.redActive | 5.33 | text 4.5 | Pass |
| brand.red on canvas, surface, elevated, hover | 3.96 to 3.40 | non-text and large text 3.0 | Pass for icons, rings and 24 px text |
| text.primary on brand.red / state.redHover | 4.24 / 3.67 | not used for text (D10) | Excluded |
| brand.red on state.selected | 2.77 | not used (D10) | Excluded |
| brand.steel on canvas, surface | 2.22, 2.13 | decorative track only; the thumb and range carry the state (D10) | Decorative |
| state.redActive on canvas, surface, elevated, hover | 3.16 to 2.70 | never an indicator (D10) | Excluded |
| text.primary outline or bar on state.selected, surface | 11.75, 16.13 | non-text 3.0 | Pass |
| state.selected on surface (fill alone) | 1.37 | needs the left bar (D10) | Bar required |

**Type scale** (C12; Geist Sans, sentence case)

| Use | Size |
|---|---|
| First-run and empty-library heading | 24 px |
| Now playing title, dialog titles | 18 px |
| Body, rows, buttons | 14 px |
| Artist and album lines, widget titles, status line | 13 px |
| Durations, captions, hints | 12 px |

Uppercase spaced text is not used in the app UI (design.md §4).

**Brand assets.** Sources and exports are in `assets/branding/` (P1). The build makes platform icons from `assets/branding/export/clawdio-icon-full.svg` (D9). The wordmark shows in the header strip. The monogram draws the art placeholder. The cat icon is the app icon only. The full mascot does not repeat in the UI (design.md §2).

**UI icons.** Lucide through `components/icons.tsx`. A file `assets/branding/ui-icons/<name>.svg` replaces the icon of that name (R31).

### 6.13 Security model

- **Content Security Policy:** `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' thumb: http://thumb.localhost data:; font-src 'self'; connect-src ipc: http://ipc.localhost; object-src 'none'; base-uri 'none'; frame-src 'none'`. Nonce handling per D48.
- **Capabilities:** `core:default`, plus `log:default` from P4. No fs, http, shell, dialog or opener permission in the webview (D13).
- **Thumbnails:** the `thumb://` scheme serves file names from the thumbnail folder only (D41). The asset protocol is off. The music folder is never exposed to the webview.
- **Paths:** IPC never accepts a file path from the webview. Paths come from Rust pickers or from the index. Every write target is checked to be inside the music folder after normalization. Playlist names pass the R12 rule before any file operation.
- **Network:** off by default. Allow-listed HTTPS hosts only. 10 MB cap. Images decoded before saving. No telemetry and no updater.
- **Supply chain:** lockfiles committed. `cargo deny check` in CI (licenses, advisories, sources) from P18; `npm audit --omit=dev` reported in CI.
- **Audio files are read-only to the app** (R11). A test hashes every fixture audio file before and after all actions.

### 6.14 Error handling and logging

- The core returns typed errors (`thiserror`). Commands map them to `{ code, message }`. No panic on user data.
- Every skip-and-log event (scan, playlists, sidecars, lookups, layouts) writes one `warn` line with its area and the relative path (R23).
- The UI shows errors in three ways:
  - Transient results in the status line (for example "Cannot play song.mp3").
  - Lasting states inside the widget (for example "Music folder not found").
  - Failed writes in a dialog with plain, actionable text (design.md §6).
- Read-only music folder: playlist edits, Favorites, Set cover and fetches show "The music folder is read-only. <action> needs write access." Playback and browsing continue (section 5).

### 6.15 Performance budgets

| Budget | Value | Source | Checked in |
|---|---|---|---|
| Idle memory, 50,000 tracks, all processes | under 200 MB; over 300 MB raises the target (D49) | R20 | P3, P18 |
| Windows installer, Linux `.deb` | under 30 MB each | R20 | P3, P18 |
| Input to next paint during the first scan | 100 ms or less, every event | AC-2 | P6 |
| `player-position` events | 4 per second while playing | Plan | P7 |
| `library-changed` events | 2 per second or fewer | Plan | P4 |
| Rescan of an unchanged 50,000-track folder | recorded, no gate | Plan | P18 |

### 6.16 Accessibility, keyboard and motion

- **Keys** (R25, D17): Space, Up, Down, Right, Left, Enter, Ctrl+F, Esc, F6, Shift+F6, Delete, Ctrl+Shift+L. One handler in `lib/keyboard.ts`. Keys work with any widget hidden.
- **Focus:** `:focus-visible` ring 2 px `brand.red` with a 2 px offset. Against the four dark surfaces it measures 3.40 to 3.96:1. Every interactive element shows it, including shadcn/ui components after the P0.10 focus rule. In lists and trees, DOM focus stays on the container (`aria-activedescendant`), so the active row shows a 2 px inset `text.primary` outline.
- **Roles:** listbox for lists, tree for Tree mode and Playlists, Dockview tablist roles for widget tabs, `aria-pressed` for toggles, `aria-label` and tooltips for icon buttons.
- **Not color alone:** active toggles add a dot and an icon change. The pressed Library mode and the active widget tab add a 2 px `text.primary` underline. Selected rows add a 2 px `text.primary` left bar. Highlighted menu items add a 2 px inset bar. The playing row adds an icon and a label. Missing playlist entries add an icon and the word "missing".
- **Motion:** hover and focus 140 ms (`motion.fast`, also Tailwind's default transition duration), menus and dialogs 200 ms (`motion.panel`). No transitions on list rows, the seek bar or time labels. Under `prefers-reduced-motion: reduce`, a global rule sets every transition and animation duration to 0s and turns off smooth scrolling. Dockview's own CSS also honors the setting.
- **Known gap:** Dockview splitters have no keyboard resize, in any edition. Moving widgets by keyboard is deferred (section 7 of the requirements). The menu covers show, hide, mode and layouts (R29 non-drag path).
- **Color scheme:** `:root` sets `color-scheme: dark`, so native scrollbars and form controls match the dark-only theme (F-08).
- **Windows high contrast:** `forced-colors: active` rules keep focus rings, selected rows and mask icons visible with system colors. P0.7 and P2.13 add them, P2-AC16 tests them and P17 audits them.
- **Splitters and drop zones:** splitters show a resize cursor on hover and a 2 px line while dragging. Drop zones show the `bg.hover` overlay. Only the active target has the red border (design.md §6).

### 6.17 Testing strategy and CI

| Layer | Tool | What |
|---|---|---|
| Core unit | `cargo test` | Folding, order, titles, grouping, queue (with `proptest`), names, normalization, matching, LRC, sidecar, paths |
| Core integration | `cargo test` with generated trees | Scan, cache, playlists, import, lyrics, art, online with `httpmock`, audio-file hash guard |
| Engine | `cargo test` with the test output | Decode errors, end of track, seek |
| Frontend unit | Vitest | Stores, layouts, persistence rules, tokens script, guards, contrast |
| UI | Playwright (Chromium, WebKit) with mocked IPC | Shell, widgets, keyboard, reduced motion, axe |
| OS level | Manual checklist (`docs/release-checklist.md`) | Media keys, device unplug, portable copy, memory, packages |

**CI** (`ci.yml`, on push and pull request):
- `frontend`: ubuntu-22.04, Node 24: `npm ci`, `npm run check`, `npx playwright install --with-deps chromium webkit`, `npm run test:e2e` (from P2).
- `rust`: ubuntu-22.04 and windows-latest: fmt, clippy, test, bindings diff.
- `tauri-build`: ubuntu-22.04 and windows-latest: Linux packages, `npm ci`, debug build, no bundle.

Linux build packages: `libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev libasound2-dev libdbus-1-dev`.

`measure.yml` runs P3 and P18 measurements. It triggers on `workflow_dispatch` and on pushes to `measure/**` branches, because GitHub dispatches a workflow only when it exists on the default branch. `release.yml` (tags) builds packages (P18). The AppImage and `.deb` build in an `ubuntu:22.04` container, so the glibc floor stays at 2.35 even if hosted runners change.

---

## 7. Phase sequence and rationale

```text
P0 foundation -> P1 brand assets -> P2 themed shell -> P3 GATE (Milestone 0)
  -> P4 end-to-end slice -> P5 scan and cache -> P6 Library widget
  -> P7 playback -> P8 media keys -> P9 persistence -> P10 local art
  -> P11 playlists -> P12 import -> P13 local lyrics
  -> P14 online and artwork fetch -> P15 lyrics fetch -> P16 metadata fill
  -> P17 UI quality audit -> P18 release readiness
```

- **Brand and design early.** Tokens and focus styles come in P0, brand assets in P1 and the themed shell in P2. Every later widget is built on them. P17 is an audit of what exists, not a styling pass.
- **Gate before features.** R20 puts Milestone 0 before feature work. P3 uses the real shell from P2, so the spike code becomes product code.
- **Usable early.** P4 delivers choose-folder, browse and play. Each later phase adds one area and keeps the app working.
- **Online features last.** They depend on the library, art, lyrics and sidecars. They are opt-in and must not change offline behavior.
- **Small phases.** Each phase touches one area and ends with its own tests.
## 8. Phases

Each phase has the same parts: Objective, Scope, Depends on, Tasks, Acceptance criteria, Verification and Completion checkpoint. Scope names source items. The traceability matrix gives the full mapping.

The standard checkpoint in section 1.3 applies to every phase. A phase checkpoint lists only extra items.

---

### P0. Foundation and conventions

**Objective.** A buildable, empty Clawdio window on Windows and Linux. Repository rules, quality gates, the token pipeline and the single name value exist.

**Scope.** AGENTS.md project rules (B1 closed). R15. R30 (stack, tokens to Tailwind at build time). R31 (theme from tokens, single name value, placeholder icon). Section 6 (stack, license, branding constraint, Strawberry rule). design.md §3 (token source), §4 (font, tabular numerals), §8 (reduced motion base). Prompt Phase 1 (audit), Phase 3.1 (token mapping). tokens.json (all keys).

**Depends on.** None.

**Tasks.**

- **P0.0** Environment: install the Linux build packages from section 6.17 (`sudo apt-get install ...`) and the Playwright browsers (`npx playwright install --with-deps chromium webkit`) where the environment allows it. Record in the phase record what could not be installed (section 1.2).
- **P0.1** Extend the owner's `AGENTS.md` (added at commit `2f147a2`). Keep every owner rule unchanged. The sections "Review (TWO-PASS REVIEW)" and "Finding classification" already exist (added October 11, 2026). Add one section "Project rules" with these items, in lists of at most 5 (Output rule 05), and format the file with `mdformat --number`:
  1. Source precedence (section 3 of this plan).
  2. Scope rules: implement only the current phase. Section 4 non-goals and section 7 deferred items are out. Do not copy Strawberry code (GPL-3.0). Record other ideas as F3 proposals.
  3. Architecture rules: D1, D13, D14, D15, D34 and D46 of this plan, in one line each.
  4. Coding standards. Rust: edition 2021, `cargo fmt`, `cargo clippy -D warnings`, `thiserror` errors in the core, no `unwrap` or `expect` on user data outside tests. TypeScript: `strict`, ESLint, Prettier, no `any` in IPC code. Every shadcn/ui component added to the repo follows the P0.10 focus rule.
  5. Test rules: every phase adds tests for its acceptance criteria. Tests use generated fixtures in temp folders. Tests never touch a real music folder. Approved exception to Edits rule 9 (C19): the `fixtures` Cargo feature (D35) holds generated data in `src-tauri` from P3 until P6.7 deletes it.
  6. Validation command set (section 1.2 of this plan).
  7. Workflow: one phase at a time. Commit messages start with the phase ID (for example `P5: add incremental scan`). Push only after the validation command set passes. Update the build plan status, the phase record and the traceability status in the same push.
  8. Platform reporting: name every check that could not run in the current environment. Never claim a check that did not run.
- **P0.2** Add `LICENSE` (MIT, holder "Dr. Claw Development", Q1). Add `NOTICE` with a header and an empty component table: component, version, license, source location.
- **P0.3** Scaffold the frontend: `package.json` (name `clawdio`, private), `index.html` (empty `<title>`), `vite.config.ts`, `tsconfig.json` (`strict: true`), `src/main.tsx`, `src/App.tsx` (renders an empty `main` element). Use the versions in section 6.2.
- **P0.4** Scaffold Rust: root `Cargo.toml` workspace with members `crates/clawdio-core` and `src-tauri`. `crates/clawdio-core/src/lib.rs` with one test. `src-tauri` from the Tauri v2 template, adapted:
  - `tauri.conf.json`: `productName` "Clawdio", `identifier` from D2, `version` "0.1.0", `app.windows` empty.
  - `src-tauri/src/window.rs` creates the main window in `setup` with `WebviewWindowBuilder`: label `main`, title from `app.package_info().name` (D2), size 1200 x 800, minimum 800 x 560 (D33). P4 adds the data directory and the saved size.
  - `build.beforeDevCommand` = `npm run dev` and `build.beforeBuildCommand` = `npm run build`. The npm `predev` and `prebuild` hooks run the token and icon scripts.
  - `.cargo/config.toml` sets `[env] TS_RS_EXPORT_DIR` to the repository's `src/lib/ipc/bindings` (D15). `crates/clawdio-core/src/api.rs` exports one struct (`AppInfo`) so the folder exists from P0.
  - `crates/clawdio-core/Cargo.toml` sets `repository = "https://github.com/Penguin-Pants/Clawdio"`.
- **P0.5** Tooling. ESLint flat config (typescript-eslint, react-hooks), Prettier, Vitest with jsdom and React Testing Library. npm scripts: `dev`, `build`, `predev`, `prebuild`, `tokens`, `icons`, `lint`, `typecheck`, `test`, `check:sources`, `check` (runs lint, typecheck, test, check:sources). Add `rust-toolchain.toml` pinned to stable 1.97.
- **P0.6** Token pipeline. `scripts/build-tokens.mjs` reads `theme/tokens.json` and writes `src/styles/tokens.generated.css` (git-ignored).
  - Validate the shape. Required keys are every key in the current file. A missing key or a value that is not a color, a px length or a ms duration fails with a message that names the key path.
  - Emit a Tailwind v4 `@theme` block: `colors.<group>.<name>` becomes `--color-<group>-<name>`. `radii.<name>` becomes `--radius-<name>`. Emit `:root` variables `--clawdio-motion-fast` and `--clawdio-motion-panel`, and set Tailwind's `--default-transition-duration` to `var(--clawdio-motion-fast)` in the `@theme` block. `motion.reduced` is a policy, not a value. The script checks that it exists and emits nothing for it.
  - `predev` and `prebuild` run the script.
- **P0.7** `src/styles/globals.css`: import Tailwind and the generated tokens. Map the shadcn/ui semantic variables to token variables (table in section 6.12). Set `body` background `--color-bg-canvas`, text `--color-text-primary`, the font stack (D7) and `font-size: 14px`. Add the global `:focus-visible` ring (2 px `--color-brand-red`, 2 px offset). Add the reduced-motion block (section 6.16). Add a `@media (forced-colors: active)` block: focus ring in `Highlight`, selected rows in `Highlight` with `HighlightText`. Add a `.tabular` utility (`font-variant-numeric: tabular-nums`).
- **P0.8** Name plumbing. `crates/clawdio-core/src/config.rs`: `user_agent(name, version, contact_url)` returns `Name/version ( contact_url )` (unit test with values passed in). The contact URL comes from `env!("CARGO_PKG_REPOSITORY")`, so no product name appears in Rust source. The frontend sets `document.title` from `getName()` (`core:app:default` is part of `core:default`).
- **P0.9** Font (D7). Add `@fontsource-variable/geist` if the shadcn/ui init did not add it. Import it in `main.tsx`. Add Geist and its OFL 1.1 text to `NOTICE`.
- **P0.10** shadcn/ui init: `npx shadcn@latest init -t vite -b base` (Tailwind v4, Base UI primitives, Lucide icons). Replace the generated color variables with the token mapping of P0.7. Add only `button`. **Focus rule** for every generated component: remove `outline-none` and `outline-hidden`; replace `ring-ring/50` and `ring-[3px]` focus classes with the global ring; give highlighted menu and select items a 2 px inset `text.primary` bar as well as the `bg.hover` fill. Edit the Button default variant to a `state.redActive` fill (D10).
- **P0.11** Placeholder icon (R31). Add `assets/branding/placeholder/icon.svg` (a 1024 square in `#171717` with a `#E10606` circle). `scripts/icons.mjs` uses `assets/branding/export/clawdio-icon-full.svg` when it exists, else the placeholder. It runs `tauri icon <source> -o src-tauri/icons` and deletes outputs that `bundle.icon` does not list (D9). It skips the run when every listed output is newer than the source, so builds do not rewrite committed files.
- **P0.12** Security baseline (D13). `app.security.csp` per section 6.13. If the Vite dev server fails under it, set `app.security.devCsp` to the same policy plus `ws://localhost:*` and `http://localhost:*` in `connect-src`. Check the release policy in a release build. Nonce handling per D48. `capabilities/default.json` grants `core:default` and nothing else. No fs, http, shell or dialog plugin. DevTools only in debug builds.
- **P0.13** Disable WebView2 browser accelerator keys in release builds (D37). Module `src-tauri/src/webview2_keys.rs` (Windows only) uses `with_webview` and `ICoreWebView2Settings3::SetAreBrowserAcceleratorKeysEnabled(false)`.
- **P0.14** Source guards. `scripts/check-sources.mjs` scans `*.ts`, `*.tsx`, `*.css` and `*.rs` files. It fails when: a hex color literal appears under `src/` (except `tokens.generated.css`); the product name appears, with the same letter case, under `src/`, `crates/` or `src-tauri/src/`. It reads the product name from `tauri.conf.json`. Lowercase crate and package names (`clawdio_core`) do not match.
- **P0.15** Contrast test `src/styles/contrast.test.ts`. It reads `theme/tokens.json` and checks the role pairs in section 6.12 against WCAG 2.2 thresholds: text 4.5:1, large text and non-text 3:1. Pairs marked Excluded must stay below the threshold that the rule names, so a token change that makes them pass shows up for review. A row that names one role on several surfaces (the `state.redActive` row) stays excluded while its worst surface is below the threshold (F-06).
- **P0.16** CI `.github/workflows/ci.yml`. Jobs: `frontend` (ubuntu-22.04: `npm ci`, `npm run check`); `rust` (matrix ubuntu-22.04 and windows-latest: install Linux packages from section 6.17, `cargo fmt --check`, `cargo clippy`, `cargo test`, the bindings check from section 1.2); `tauri-build` (matrix: Linux packages, `npm ci`, `npm run tauri build -- --debug --no-bundle`).
- **P0.17** Docs. `docs/theming-and-brand.md` with the token table (token, CSS variable, UI role) and the contrast role table (R17). README section "Build from source" with prerequisites and commands.

**Acceptance criteria.**

- **P0-AC1** The validation command set passes in CI on ubuntu-22.04 and windows-latest, and locally as far as section 1.2 allows.
- **P0-AC2** `npm run tauri dev` on Linux opens one window titled "Clawdio" with background `#0B0B0B` (`colors.bg.canvas`).
- **P0-AC3** Change `colors.bg.canvas` in `theme/tokens.json`, rebuild and run. The window background changes. No other file changes (baseline for AC-7).
- **P0-AC4** Delete `colors.text.muted` from a copy of the token file and run `npm run tokens` on it. The command fails and names `colors.text.muted`.
- **P0-AC5** The contrast test passes for every role pair in section 6.12.
- **P0-AC6** `npm run check:sources` passes. Adding `#fff` to a file in `src/` makes it fail. Adding the product name to a file in `crates/` makes it fail.
- **P0-AC7** `AGENTS.md` keeps every owner rule, holds the Review and Finding classification sections and the eight project rules of P0.1, and passes `mdformat --number --check`. `LICENSE` is MIT. `NOTICE` lists Geist.
- **P0-AC8** In a Windows release build, F5, Ctrl+R, Ctrl+P and Ctrl+Shift+I do nothing.
- **P0-AC9** The capability file grants only `core:default`. The CSP string matches section 6.13. A release build logs no CSP violation in the WebView console.

**Verification.** Automated: P0-AC1, P0-AC4, P0-AC5, P0-AC6 (Vitest tests run `build-tokens.mjs` and `check-sources.mjs` on temp copies). Manual Linux: P0-AC2, P0-AC3. Manual Windows: P0-AC8 (report "not verified" if no Windows machine; CI proves compile only). Review: P0-AC7, P0-AC9.

**Phase checkpoint.** Prompt Phase 1 audit result recorded in the phase record: framework, wrapper, styling, brand files, old names (none) and risks.

---

### P1. Brand identity assets and icon pipeline

**Objective.** Original vector brand assets exist. The build generates platform icons from them.

**Scope.** design.md §1 (visual source of truth), §2 (logo hierarchy, no raster icon, no repeated mascot). Prompt Phase 2.1 to 2.5. asset-manifest checklist (vector masters, variants, viewBox, no raster, PNG sizes, ICO, Linux icon, legibility, light backgrounds, high contrast, no third-party artwork). R31 (icon generation). AC-15 (icon part).

**Depends on.** P0.

**Tasks.**

- **P1.1** `assets/branding/source/clawdio-wordmark.svg`. Outlined paths only (no `<text>`).
  - Grid: viewBox `0 0 1200 320`. Cap height 200. Letters are angular polygons with a 12 degree forward slant baked into the coordinates.
  - "Claw" fill `#E10606`. "dio" fill `#B7B7B7` (silver, D10). The final "o" is a ring (outer radius 100, inner radius 64) with five vertical bars inside, heights 30, 52, 74, 52, 30 percent of the inner diameter, fill `#E10606`. Each bar is at least 18 units wide with gaps of at least 8 units, so each bar is at least 1 px wide at the 20 px header height (18 x 20 / 320 = 1.1).
  - Transparent background.
- **P1.2** `assets/branding/source/clawdio-cat.svg`. Cat head silhouette.
  - viewBox `0 0 1024 1024`. Two pointed ears with tips at least 120 units apart. Head fill `#0B0B0B`. Rim stroke `#B7B7B7`, width 96.
  - Two narrow almond eyes in `#E10606`, angled down toward the nose. Each eye is at least 160 units wide and 110 units tall.
  - Size rule: after the 70 percent scale in P1.4, the rim and each eye measure at least 1 px in the 16 px icon (96 x 0.7 / 64 = 1.05).
  - Whiskers: two strokes per side, width 16, `#B7B7B7`. They may vanish below 48 px. That is accepted.
- **P1.3** `assets/branding/source/clawdio-monogram.svg`. Angular "C" in `#E10606` with a negative-space almond eye and three bars (heights 40, 70, 100 percent of the eye height). viewBox `0 0 512 512`.
- **P1.4** Exports in `assets/branding/export/`:
  - `clawdio-wordmark-primary.svg` (dark backgrounds, colors as P1.1).
  - `clawdio-wordmark-light.svg` (light backgrounds: "dio" `#4A4A4A`).
  - `clawdio-wordmark-mono.svg` (one fill, `currentColor`).
  - `clawdio-icon-full.svg`: 1024 square, corner radius 192, fill `#171717`. A faint arc in `#E10606` at 35 percent opacity behind the head. The cat from P1.2 scaled to 70 percent width. Five bars in `#E10606` along the bottom edge.
  - `clawdio-icon-simple.svg`: the monogram on the same square. It is the source for the 16 and 24 px icon layers if P1.7 shows that the full icon fails there (Q8, owner approved). The app does not use it otherwise.
  - `clawdio-icon-mono.svg`: the cat silhouette and eyes in one fill (`currentColor`) for monochrome contexts outside the app (documentation, third-party listings). The app does not use it.
- **P1.5** `scripts/check-svg.mjs` (part of `npm run check`). Every SVG under `assets/branding/` must: parse as XML, have a `viewBox`, contain no `<image>`, `<text>`, `<filter>`, `<foreignObject>` or `<script>` element and no `http` reference.
- **P1.6** Switch the icon pipeline to `clawdio-icon-full.svg`. Remove `assets/branding/placeholder/`. Regenerate and commit the icon files that `bundle.icon` lists (D9).
- **P1.7** Legibility review. Render the icon at 16, 24, 32 and 48 px from the generated `icon.ico` and PNGs. Add the primary wordmark at the 20 px header height. Save one contact sheet to `docs/images/icon-legibility.png` (1x, 2x and 8x zoom).
- **P1.8** In-app brand components:
  - `src/components/brand/Wordmark.tsx`: an `<img>` of the primary wordmark export with `alt` from the app name.
  - `src/components/brand/ArtPlaceholder.tsx`: a square on `--color-bg-elevated` with the monogram drawn by CSS mask in `--color-text-muted`.
- **P1.9** README header: a `<picture>` that shows the light wordmark for light mode and the primary wordmark for dark mode, then the line "Minimalist local music player".
- **P1.10** `docs/theming-and-brand.md`: add "Brand inputs" (R17, R31): each file, its use, how to replace it and how icons are generated. Tick the matching boxes in `docs/asset-manifest.md`.

**Acceptance criteria.**

- **P1-AC1** `check-svg.mjs` passes for all nine SVG files.
- **P1-AC2** `npm run icons` exits 0. `src-tauri/icons/icon.ico` holds the 16, 24, 32, 48, 64 and 256 px layers (`identify` output in the phase record). The Linux PNGs listed in D9 exist with the right pixel sizes.
- **P1-AC3** At 16 and 32 px the contact sheet shows two separate red eye marks, two ear tips and the head edge. The rim color has a contrast of at least 3:1 against the icon square (computed: `#B7B7B7` on `#171717`, 8.94:1). Geometry check: the rim stroke and each eye measure at least 1 px at 16 px. If the 16 or 24 px layer still fails the visual check, record it, make `scripts/icons.mjs` render those two layers from `clawdio-icon-simple.svg` (Q8, owner approved) and run P1.7 again. With this fallback on, the 16 and 24 px layers pass a monogram check instead of the cat check: the "C" stroke and the negative-space eye each measure at least 1 px at 16 px and stay separate, and `#E10606` reaches at least 3:1 on `#171717` (computed: 3.61:1). The 32 px and larger layers still pass the cat check.
- **P1-AC4** The wordmark files contain no `<text>`. "Claw" is `#E10606`. The "o" holds five bars. At the 20 px header height each bar is at least 1 px wide. At the 72 px README height the bars are separate (contact sheet; owner decision B7). In the light variant both colors reach at least 3:1 on `#FFFFFF`.
- **P1-AC5** Replace `clawdio-icon-full.svg` with any other square SVG and run `npm run tauri build -- --debug`. The new executable shows the new icon. No other source file changed; only the generated files in `src-tauri/icons/` differ (D9; AC-15 icon part). If the Q8 fallback is on, the test replaces `clawdio-icon-simple.svg` too, and P1.10 tells users to replace both files.
- **P1-AC6** No file references `assets/branding/placeholder/`.
- **P1-AC7** Originality statement in the phase record: all shapes come from primitives in this phase. No path was traced from the mockup. No third-party character art or emblem is reproduced.

**Verification.** Automated: P1-AC1, P1-AC2 (script checks sizes with ImageMagick `identify` when present), P1-AC6 (grep). Manual: P1-AC3, P1-AC4, P1-AC5 (Linux), P1-AC7 (review). Prompt Phase 4.2 and 4.3 checks for icons happen here.

**Phase checkpoint.** Ask the owner for brand sign-off (Q6) with the contact sheet and the export previews. Wait for it: P2 starts only after the sign-off (owner answer, October 11, 2026).

---

### P2. Themed docking shell

**Objective.** The real application shell: docking, six widget frames, header strip, menu, status line, built-in layouts and the Library mode switch. All chrome uses tokens.

**Scope.** R5 (widget set, Search in the Library header, status line, menu button). R28 (one widget, mode switch, dropdown when narrow, cannot hide). R29 (drag docking, splitters, tabbed groups, no floating or pop-out, built-in layouts, default arrangement, Reset layout and its shortcut, non-drag path, menu and status line cannot be hidden). R30 (dock chrome styled by tokens, Magic UI list). R31 (Lucide icons, brand icon override by name). R25 (F6, focus visible). design.md §5, §6 (app shell, widget header, tooltips), §8. Section 5 (empty widget hints, window smaller than layout). Section 6 (docking constraint, complexity budget).

**Depends on.** P1 and the owner's Q6 sign-off.

**Tasks.**

- **P2.1** Add `dockview-react` (section 6.2). `src/shell/DockShell.tsx` creates the dock with `disableFloatingGroups`, no call to `addPopoutGroup`, no pop-out item in tab context menus and tabbed groups allowed (D8). A custom Dockview theme object carries the token variables (P2.10).
- **P2.2** `src/shell/widgets.ts`: the widget registry. Each entry: id (`library`, `transport`, `nowPlaying`, `playlists`, `queue`, `lyrics`), title, `hideable` (false only for `library`), minimum width and height (D33), React component.
- **P2.3** `src/shell/WidgetTab.tsx`: custom tab component with a grip icon, the title and a close button. The Library panel uses a variant with no close button (`hideClose`). Dockview closes a focused tab on Delete or Backspace, so the Library variant stops that key event, and a guard on panel removal re-adds Library if any path removes it. The guard is off while `applyLayout`, `resetLayout` or a layout restore runs (a `replacing` flag in `layouts.ts`), because those calls clear the dock on purpose. The active tab has a 2 px `text.primary` underline; inactive tabs use `text.muted` with no underline (D10). Icon buttons have `aria-label` and a tooltip.
- **P2.4** `src/shell/layouts.ts`: `defaultArrangement(api)` adds Library to the main area and Now playing beside Transport controls in a bottom row. Playlists, Play queue and Lyrics are not added. `applyLayout(id)` sets the `replacing` flag, clears the dock, rebuilds the default arrangement, sets the Library mode (`columns`, `tree` or `topBottom`) and clears the flag in a `finally` block. `resetLayout()` applies `columns`.
- **P2.5** `src/shell/AppHeader.tsx` (D11): 32 px strip. Left: `Wordmark` at 20 px height. Right: the menu button (Lucide `Menu`, `aria-label` "Menu").
- **P2.6** `src/shell/AppMenu.tsx` (shadcn DropdownMenu):
  - Widgets: one checkbox item per widget. Library is checked and disabled.
  - Library mode: radio items Tree, Columns, Top/bottom.
  - Layouts: Columns, Tree, Top/bottom, a separator, then Reset layout with its shortcut hint.
  - Settings (opens an empty dialog until P4). Rescan (disabled until P5).
- **P2.7** `src/shell/StatusLine.tsx`: fixed 24 px line at the bottom. Text `--color-text-secondary`. States: idle "Ready", job (text plus a Cancel button), transient message (D18). API in `src/store/ui.ts`.
- **P2.8** Library widget frame `src/widgets/library/LibraryWidget.tsx`:
  - Header: mode switch (shadcn ToggleGroup with icon and label; the pressed item has `aria-pressed` and a 2 px `text.primary` underline) and a search `Input` (placeholder "Search").
  - Below a width threshold of 360 px (ResizeObserver) the switch becomes a shadcn `Select` that shows the current mode.
  - Mode, search text and selection live in `src/store/library.ts` and survive a mode switch.
  - The body shows a mode-specific placeholder until P3.
- **P2.9** Empty hints (section 5): Play queue "The queue is empty. Double-click a song to play it." Playlists "No playlists yet." Lyrics "No lyrics for this song." Now playing shows `ArtPlaceholder` and "Nothing playing". Transport buttons render disabled.
- **P2.10** `src/styles/dockview-theme.css`: a custom theme class that sets each `--dv-*` variable listed in `dockview-react/dist/styles/dockview.css` for groups, tab bars, tabs, sashes and drop overlays to a token variable (section 6.12). Splitters: 1 px `border.default` at rest; `border.strong` and a resize cursor on hover; a 2 px `border.strong` line while dragging. Drop zones: `bg.hover` overlay; the active target adds a 2 px `brand.red` border. Red appears only on the active drop target and on focus rings.
- **P2.11** Window and widget minimum sizes (D33) in `src-tauri/src/window.rs` and the registry. Implement the D45 clamp: on every window resize and after every layout load, lower group minimums in proportion when they exceed the dock, never below 32 px.
- **P2.12** Global keys in `src/lib/keyboard.ts`: Reset layout (Ctrl+Shift+L, D17). F6 and Shift+F6 move focus to the next or previous visible widget in reading order (top to bottom, then left to right). A widget in a hidden tab is skipped.
- **P2.13** `src/components/icons.tsx` (R31): semantic icon names map to Lucide components. A file `assets/branding/ui-icons/<name>.svg`, when present at build time, replaces the icon of that name. It renders through a CSS mask in `currentColor`. Under `forced-colors: active`, mask icons and the art placeholder set `forced-color-adjust: none` and paint in `CanvasText`. Add `assets/branding/ui-icons/README.md` that explains this.
- **P2.14** shadcn components added in this phase: `dropdown-menu`, `toggle-group`, `select`, `input`, `tooltip`, `dialog`. Apply the P0.10 focus rule to each. Set menu and dialog open and close animation durations to `--clawdio-motion-panel`.
- **P2.15** Test infrastructure: `playwright.config.ts` with Chromium and WebKit projects. All mock code and mock data stay in `tests/e2e/` (`AGENTS.md` Edits rule 9). `tests/e2e/install-mocks.ts` installs `mockIPC` and `mockConvertFileSrc` with data from `tests/e2e/data/`. `tests/e2e/entry.ts` imports `./install-mocks` first, then `src/main.tsx`. `vite.e2e.config.ts` extends `vite.config.ts`, and its `transformIndexHtml` hook with `order: 'pre'` points the page script at `tests/e2e/entry.ts` before Vite processes the HTML, so the entry is bundled (a hook without `order` runs after the HTML transform). `tsconfig.json` includes `tests/e2e/` and `vite.e2e.config.ts`, so `npm run typecheck` and ESLint cover the mocks. Add one rule to `scripts/check-sources.mjs`: it fails when a file under `src/` imports `@tauri-apps/api/mocks` or has `mock` or `fixture` in its file name. `npm run test:e2e` builds with `vite.e2e.config.ts`, serves the build with `vite preview` and sends the section 6.13 CSP as a response header. Tests fail on any `securitypolicyviolation` event. Update `ci.yml`: the `frontend` job installs the browsers and runs `npm run test:e2e`.
- **P2.16** `docs/theming-and-brand.md`: dock chrome token table (widget headers, splitters, drop zones) and "Copied Magic UI components: none" (R17, R30, D6).

**Acceptance criteria.**

- **P2-AC1** On first start the dock shows Library in the main area and Now playing beside Transport controls in a bottom row. Playlists, Play queue and Lyrics are absent and unchecked in the Widgets menu.
- **P2-AC2** Dragging a widget header to the edge of another widget or of the window docks it there. Dropping it on another group's tab bar forms a tabbed group. Splitters resize. No float or pop-out command exists in any menu or header.
- **P2-AC3** The Library tab has no close button. Its Widgets menu item is disabled. Delete and Backspace on the focused Library tab do nothing. No user action removes it.
- **P2-AC4** The menu shows and hides each hideable widget, switches the Library mode and applies each layout. Reset layout from the menu and from Ctrl+Shift+L restores P2-AC1. Applying layouts 20 times in a row leaves exactly one Library panel and raises no error.
- **P2-AC5** The Library header shows the search field and the mode switch. Below 360 px the switch is a dropdown that shows the current mode. Search text and selection survive a mode switch.
- **P2-AC6** At the minimum window size (800 x 560), in the default arrangement and in the default arrangement plus Play queue docked at the right, every visible widget is at or above its minimum size. With all six widgets stacked in one column, the D45 clamp applies: every widget header is visible and the dock has no scroll bar. The header strip, menu button and status line stay visible.
- **P2-AC7** Dock chrome colors come from token variables (test reads computed styles). Red appears only on the active drop target and on focus rings.
- **P2-AC8** With reduced motion emulated, every shell element has a computed `transition-duration` and `animation-duration` of 0s.
- **P2-AC9** axe-core reports no serious or critical violation on the shell in its default state, with the menu open and with a dialog open.
- **P2-AC10** F6 and Shift+F6 cycle focus through visible widgets and skip widgets in hidden tabs. The focus ring is visible on each target.
- **P2-AC11** An override SVG in `assets/branding/ui-icons/` replaces the icon with that name after a rebuild (unit test with an injected override map plus one manual build).
- **P2-AC12** Empty Play queue, Playlists and Lyrics widgets show their hints. Now playing shows the placeholder. No widget is blank.
- **P2-AC13** Hover and focus transitions last 140 ms (`motion.fast`). Menus and dialogs open in 200 ms (`motion.panel`). List rows, the seek bar and time labels have no transition (computed styles).
- **P2-AC14** For each focusable type (button, input, toggle, switch, menu item, select item, tab, slider) the focus indicator has a contrast of at least 3:1 against the adjacent color (Playwright reads computed styles).
- **P2-AC15** In a grayscale screenshot, the pressed Library mode, the active tab and the highlighted menu item are identifiable.
- **P2-AC16** With forced colors emulated (Playwright `forcedColors: 'active'`, Chromium), focus rings, mask icons and the art placeholder stay visible.
- **P2-AC17** Splitters show a resize cursor on hover and a 2 px line while dragging. Drop zones show the overlay. Only the active target has the red border.
- **P2-AC18** No `securitypolicyviolation` event fires during the e2e run.
- **P2-AC19** `npm run check:sources` fails when a file under `src/` imports `@tauri-apps/api/mocks` or has `mock` or `fixture` in its file name. `npm run test:e2e` runs with the mocks from `tests/e2e/`. Mock data written inline in another `src/` file is a TWO-PASS REVIEW item (Edits rule 9), because no guard can prove its absence.

**Verification.** Vitest: registry, layouts, store, icon override. Playwright (both engines): P2-AC1 to P2-AC10 and P2-AC12 to P2-AC18 (P2-AC16 in Chromium only). `npm run check:sources` with a test import of `@tauri-apps/api/mocks` and a test file named `mock.ts` under `src/`, then `npm run test:e2e`: P2-AC19. Manual Linux: drag and drop feel, P2-AC6 at the real minimum window.

**Phase checkpoint.** Screenshots of the default arrangement and of a tabbed group at 1200 x 800 and 800 x 560 attached to the phase record.

---

### P3. Milestone 0 footprint gate

**Objective.** Measure idle memory and package size with the real UI stack and full test data. Decide to continue or stop.

**Scope.** R20 (Milestone 0 scope, targets, stop rule). Section 8 item "R20 Milestone 0 outcome". AC-1. R28 modes at 50,000 tracks. R5 album thumbnails (spike data). Section 6 stack ("Revisit if Milestone 0 fails").

**Depends on.** P2.

**Tasks.**

- **P3.1** Cargo feature `fixtures` in `src-tauri` (off by default, D35). When on, at startup:
  - The core `LibraryIndex` (D46) is filled with 1,000 artists, 5,000 albums and 50,000 songs with deterministic names (including accents and numbers).
  - The real query commands serve it: `library_artists`, `library_albums`, `library_song_ids`, `library_rows` and `library_tree`, with search (signatures as in section 6.7). This matches D14, so the gate measures the real memory profile.
  - The app writes 2,000 album thumbnails (96 px JPEG, generated colors and numbers) into the thumbnail folder.
  - Outside the `fixtures` feature, so release builds keep it: with `CLAWDIO_MEASURE_MODE` set to `tree`, `columns` or `topBottom`, the app applies an arrangement that shows all six widgets (Playlists, Play queue and Lyrics docked beside the default arrangement) in that Library mode. It does not save that arrangement.
- **P3.2** Thumbnail scheme (D41): register `thumb://`, which serves plain `.jpg` names from the thumbnail folder. Album rows carry the file name. Use `convertFileSrc(name, "thumb")` for image URLs. (Changed in 1.11; it was the asset protocol.)
- **P3.3** Library views with fixture data, all virtualized (section 6.2):
  - Tree: flattened rows (artist, album, song) with expand and collapse.
  - Columns: Artist, Album and Songs lists side by side. Artist and Album lists start with an "All" row.
  - Top/bottom: Artist and Album on top, Songs below.
  - Album rows show the 40 px thumbnail.
  - Search calls the real query commands.
- **P3.4** Other widgets with fixture data: Play queue (500 entries), Playlists (20 playlists with 30 entries each), Lyrics (60 lines), Now playing (art, title, artist, album, heart), Transport (static position and duration).
- **P3.5** `scripts/measure-memory.sh` (Linux) and `scripts/measure-memory.ps1` (Windows). Method per D28. Each script runs the app three times per Library mode with `CLAWDIO_MEASURE_MODE`, so every widget is mounted and populated. The value per mode is the median of its three runs (D28). The gate value per OS is the worst mode. Output JSON: per-process values, total per mode, environment.
- **P3.6** `.github/workflows/measure.yml` (triggers: `workflow_dispatch` and pushes to `measure/**` branches). Build release with `--features fixtures` on ubuntu-22.04 (under `xvfb-run`) and windows-latest. Run the scripts. Build NSIS and `.deb` bundles without fixtures and report their sizes. Upload results as artifacts.
- **P3.7** `docs/milestone-0.md`: method, environment, numbers per OS, bundle sizes, verdict and notes on scroll behavior.
- **P3.8** Verdict per R20: under 200 MB passes. 200 to 300 MB continues and the owner is told the number. Over 300 MB on an OS: record that OS's worst value as its new memory target in `docs/milestone-0.md`, tell the owner the number and continue (D49). An OS at or under 300 MB keeps the 200 MB target. Package size: under 30 MB passes. Over 30 MB, the owner is told and decides, because R20 calls the targets adjustable. A size result alone does not block P4.

**Acceptance criteria.**

- **P3-AC1** With fixtures, each Library mode scrolls the 50,000 songs. 2,000 thumbnails load. Every widget shows data.
- **P3-AC2** Idle memory is measured on Windows and Linux by the D28 method, with all six widgets shown, in each Library mode. The worst mode per OS is the gate value. The environment is recorded.
- **P3-AC3** NSIS installer and `.deb` sizes are recorded against the 30 MB target.
- **P3-AC4** The verdict is recorded for memory and for package size. An OS over 300 MB gets its measured value as its new memory target. The other OS keeps 200 MB (D49).
- **P3-AC5** Thumbnails load from the cache folder on Linux and Windows through the `thumb://` scheme (no broken images).

**Verification.** CI workflow `measure.yml` plus local Linux runs. Manual: scroll each mode, open each widget. The owner gets the numbers in the phase report.

**Phase checkpoint.** The gate verdict is in `docs/milestone-0.md` and in section 2. P4 starts once the verdict is recorded: under 200 MB passes, 200 to 300 MB continues after the owner is told the number, and over 300 MB continues with the raised target for that OS (D49).

---

### P4. End-to-end slice

**Objective.** A user starts the app, chooses a music folder, sees songs while the scan runs and plays one. Paths, settings, logging and portable mode exist.

**Scope.** R1.1. R1 (file types, basic). R7 (switch and first-run notice; no network code yet). R18 (settings, window size). R18.1 (data locations, music folder path rule). R23 (log file, rotation). Section 5 (no music folder set). AC-20 (basic).

**Depends on.** P3 passed.

**Tasks.**

- **P4.1** `crates/clawdio-core/src/paths.rs`: `DataDirs` for config, cache, logs and webview. Portable when a file named `portable` exists next to the executable: all four under `<exe dir>/data/`. Otherwise the Tauri path resolver dirs (section 6.8). `store_music_path` and `resolve_music_path` implement the R18.1 rule: relative to the executable folder on the same volume, else absolute. Same volume: same drive or UNC share on Windows, same `st_dev` on Linux. On Linux inside an AppImage, "next to the executable" means next to the file named by `APPIMAGE` (D47). Unit tests with temp folders.
- **P4.2** `src-tauri/src/window.rs`: create the main window in `setup` with `WebviewWindowBuilder`: title from the app name, `data_directory` from `DataDirs.webview`, saved size or 1200 x 800, minimum 800 x 560. Save the size on resize (debounced 1 s) and on close.
- **P4.3** Logging (R23, D40): `tauri-plugin-log` with a `Folder` target at `DataDirs.logs`, file name `app.log`, `max_file_size` 1 MB, `RotationStrategy::KeepSome(5)`. Command `open_log_folder` opens the folder with the opener plugin from Rust. The frontend logs through `@tauri-apps/plugin-log` (capability `log:default`).
- **P4.4** `crates/clawdio-core/src/settings.rs`: `settings.json` (schema in `docs/file-formats.md`). Atomic write (temp file in the same folder, then rename). Corrupt or unknown version: log a warning and use defaults. Commands `settings_get`, `set_online_lookups`, `first_run_notice_done`.
- **P4.5** `choose_music_folder` command: a native folder picker opened from Rust (dialog plugin, Rust API). It validates that the folder exists and is readable, stores it by the R18.1 rule and starts a scan.
- **P4.6** First-run flow:
  - With no settings file, `OnlineNoticeDialog` opens. It explains the files the app may write into the music folder (`cover.jpg`, `.lrc` and `.txt` lyrics, `sidecar.json`) and names MusicBrainz, Cover Art Archive and LRCLIB. Buttons: "Turn on" and "Keep off". The choice is saved and the notice does not show again.
  - With no music folder, the Library body shows a 24 px heading and a "Choose music folder" button. Other widgets show their hints. Transport controls are disabled.
- **P4.7** Basic scan skeleton in `crates/clawdio-core/src/scan/`: walk the folder (walkdir, `follow_links(false)`), accept `.mp3`, `.ogg` and `.wav` (case-insensitive), read tags with lofty, write rows to SQLite and to the in-memory index in batches of 500. Run on a background thread with a cancel token. Emit `library-changed` at most twice per second. P5 adds all rules.
- **P4.8** The P3 Library views now read the index that the scan fills, through the same commands. Add double-click and Enter on a song row in the Songs list: call `player_play_list` with the list as shown (full rule in P6.5).
- **P4.9** Minimal player in `src-tauri/src/player/`: an audio thread with rodio (section 6.10) that owns the queue (D46). It plays through an `AudioOutput` trait with a rodio implementation and a test implementation that decodes with Symphonia and advances a virtual clock. The sink opens on the first Play. Commands `player_play_list(ids, start)`, `player_toggle`, `player_stop`. Events `player-state` and `player-position` (4 per second while playing). Wire play/pause and stop in Transport controls and the title, artist and album in Now playing.
- **P4.10** `SettingsDialog`: music folder with "Change folder", Online lookups switch, About section (D12: wordmark, name, version, license, link to `NOTICE`).
- **P4.11** Test music (D36): `crates/clawdio-core/tests/fixtures/seed/` holds one-second files made with ffmpeg: `tone.mp3`, `tone-vorbis.ogg` and `tone-pcm16.wav`. The folder README lists the ffmpeg commands. P5.11 adds the edge-case files.
- **P4.12** Generator `crates/clawdio-core/examples/gen_test_library.rs`: `cargo run -p clawdio-core --example gen_test_library -- <dir> --tracks N` copies seed files into artist and album folders (10 songs per album, 5 albums per artist) and writes tags with lofty (test data only).

**Acceptance criteria.**

- **P4-AC1** With a fresh profile the notice names the three services and the three file kinds. The choice persists after a restart. The notice does not show again.
- **P4-AC2** With no folder set, the Library shows "Choose music folder". Transport buttons are disabled. Other widgets show hints.
- **P4-AC3** After choosing a 50,000-track library made by P4.12, songs appear while the status line still shows the scan. Double-clicking one plays audio before the scan ends. Pause and Stop work.
- **P4-AC4** With a `portable` file next to the executable, settings, logs, cache and the webview profile appear under `data/`. Nothing new appears in the OS config, cache or log folders.
- **P4-AC5** The log file rotates at 1 MB and keeps five files (test with a small limit).
- **P4-AC6** A corrupt `settings.json` gives defaults and a warning in the log.
- **P4-AC7** The window size is restored after a restart.

**Verification.** Rust unit and integration tests: paths (including the `APPIMAGE` rule), settings, rotation, scan skeleton, player with the test output. Playwright: P4-AC1, P4-AC2. Manual Linux: P4-AC3, P4-AC4, P4-AC7. Manual Windows: P4-AC4 (or "not verified").

---

### P5. Library scan and cache

**Objective.** The scan follows every R1 to R4 and R2 rule. The cache follows R19. Library edge cases in section 5 behave as specified.

**Scope.** R1 (Vorbis only, WAV encodings, ignore other types). R2 (all bullets). R3 (all bullets). R4 (title, prefix, track number, disc order; the sidecar step comes in P16). R19. Section 5: unsupported or corrupt file, Opus, missing tags, tag and folder disagree, case-different folders, non-ASCII names, paths over 260 characters, invalid UTF-8 names, music folder changed, music folder missing, folder edited while running, no music folder (scan side). AC-8, AC-9 (library part), AC-18 (order part).

**Depends on.** P4.

**Tasks.**

- **P5.1** Traversal rules in `scan/walk.rs`: skip files and folders whose names start with "."; never enter symbolic links or junctions to folders (walkdir with `follow_links(false)` lists them and does not enter them); scan a symbolic link to a file like a file (R2 excludes only links to folders); skip and log a name that is not valid UTF-8 (Linux); accept paths longer than 260 characters on Windows.
- **P5.2** Classification in `scan/probe.rs` (D16):
  - Other extensions: ignored, not counted, not logged (R1).
  - `.ogg`: lofty `FileType::Vorbis` is accepted. Any other Ogg codec (Opus, Speex, FLAC) is "unsupported codec".
  - `.wav`: accepted only when the encoding is PCM integer, PCM float or ADPCM (IMA or Microsoft), including those inside `WAVE_FORMAT_EXTENSIBLE`, and the Symphonia 0.5.5 codec registry can decode it (R1). Any other encoding (A-law, mu-law, MP3 in WAV) is "unsupported codec". Symphonia can decode A-law and mu-law, but R1 lists only PCM integer, PCM float and ADPCM.
  - Content that does not match the extension is "unsupported type". A parse or probe failure is "corrupt file".
  - Each skip writes one log line: reason and relative path.
- **P5.3** Incremental sync in `scan/mod.rs`. A scan runs at every startup after the cache loads (R2 startup sync). Compare (relative path, size, modified time) with the cache. Unchanged files are not re-read. Changed files are re-read. New files are added. Missing files are removed only after a complete traversal. A changed file that is now skipped (corrupt or unsupported) has its old row removed, staged with the other removals until the traversal completes. A changed `sidecar.json` (size or modified time, stored per album) is read again and its values update the album's rows. A canceled or failed scan removes nothing. A readable, empty root removes all tracks. An unreadable or missing root removes nothing. The scan stores the D44 flags: per track, whether it has an embedded picture; per album, the cover file state. A cover file is decoded only when it is new or changed.
- **P5.4** Jobs: `rescan` does nothing while a scan runs. The status line shows "Scanning: N files" with Cancel. At the end it shows "Scan complete: A added, R removed, S skipped". Settings shows the last counts (stored in `settings.json`) and "Open log folder".
- **P5.5** Text folding and order in `crates/clawdio-core/src/fold.rs` (D4): `fold(s)` = NFD, drop combining marks, lowercase. `natural_cmp(a, b)` compares folded digit runs by value and other runs by text, then exact bytes for ties.
- **P5.6** Grouping in `library/group.rs` (R3): artist = first folder, album = second folder, deeper folders fold into the album, artist-level files go to "Unknown Album", root files go to "Unknown Album" under "Unknown Artist". Display names are folder names unchanged. Unknown groups sort last.
- **P5.7** Titles and order in `library/title.rs` (R4): title = tag, else file name without extension and without the prefix (regex `^\d{1,3}(?:[-.]\d{1,3})?[ ._-]+`). Track number = tag, else the number taken from the prefix. Disc order = disc tag, else the natural-order position of the song's sub-folder, else 0 for files directly in the album folder. Song order: disc order, track number, file name (case-insensitive).
- **P5.8** Cache in `cache.rs` (R19): `library.sqlite` in `DataDirs.cache`. `PRAGMA user_version` holds the schema version. A different version deletes the file and rebuilds. Paths are relative to the music folder root. The D44 flags are cache columns. No lookup markers. Deleting the file rebuilds the same library on the next start.
- **P5.9** Music folder changed (section 5): cancel any running scan or online job and wait for it to end, then stop playback, reset the position, clear the queue and the cache, store the new root, scan the new folder and reload playlists (hook used by P11). No entry from the old folder remains.
- **P5.10** Music folder missing at startup (D30): the Library body shows "Music folder not found: <path>" and "Change folder". The cache file and `state.json` are not touched. "Change folder" works from this screen.
- **P5.11** Edge-case seeds in the P4.11 folder: `tone-opus.ogg`, `tone-float.wav`, `tone-adpcm.wav`, `tone-alaw.wav`, `corrupt.mp3` (random bytes), `truncated.mp3` (a file with a Xing header, cut in the middle) and `damaged.ogg` (a Vorbis file with bytes overwritten in the middle). All seeds together stay under 100 KB. Add the ffmpeg commands to the README.
- **P5.12** Fixture builder `crates/clawdio-core/tests/common/tree.rs`: builds a temp music folder with: two-disc album (tags and sub-folders), album without disc tags, artist-level file, root file, hidden folder, hidden file, folder symlink loop (Linux) or junction (Windows), symbolic link to an audio file (Linux), case-different folders (Linux), accented and non-Latin names, numbered file names for every R4 example, a deep path over 260 characters (Windows).
- **P5.13** Generator option `--edge-cases` for P4.12: mixes the P5.11 files into 1 percent of albums and adds two-disc albums. Option `--covers N` writes a generated `cover.jpg` into N albums. P6-AC6 and P18.5 use the 50,000-track library it makes.
- **P5.14** Audio hash guard (R11) in `crates/clawdio-core/tests/common/guard.rs`: hash every audio file in a fixture tree before a test and compare after it. Every integration test from P5 onward that writes into a music folder calls it.

**Acceptance criteria.**

- **P5-AC1** Scanning the fixture tree gives the expected artist, album and song lists in the expected order (golden JSON test).
- **P5-AC2** Opus `.ogg` and A-law `.wav` count as "unsupported codec". `corrupt.mp3` counts as "corrupt file". A `.txt` file is not counted. Each counted skip has one log line.
- **P5-AC3** Hidden files and folders are skipped. The folder symlink loop or junction is not entered and the scan ends. A symbolic link to an audio file is scanned.
- **P5-AC4** A canceled scan removes no tracks. The next complete scan removes missing files and files that changed into corrupt or unsupported content. A readable, empty root removes all tracks. An unreadable root removes none.
- **P5-AC5** Rescan during a scan starts nothing new.
- **P5-AC6** The status line and Settings show the counts of the last scan.
- **P5-AC7** A second scan of an unchanged folder reads no tags (counter in the test).
- **P5-AC8** Deleting the cache and restarting restores the same library (AC-9 library part).
- **P5-AC9** Changing the schema version rebuilds the cache.
- **P5-AC10** Every R4 prefix example ("01 - ", "01. ", "1-01 ", "001_") is removed. "1984.mp3" keeps its name.
- **P5-AC11** The two-disc album orders disc 1 then disc 2 by track number, with and without disc tags (AC-18 order part).
- **P5-AC12** With the folder missing at startup the message and "Change folder" show. The cache file and `state.json` are unchanged. "Change folder" opens the picker and scans the chosen folder (AC-8).
- **P5-AC13** After a folder change, also one made while the startup scan of the old folder runs, no track from the old folder is in the cache, the index or the queue.
- **P5-AC14** Non-ASCII names work on Linux and Windows. A path over 260 characters works on Windows. A non-UTF-8 name on Linux is skipped and logged.
- **P5-AC15** A file added while the app runs appears only after Rescan or a restart. The app does not watch the folder.
- **P5-AC16** The cache holds the D44 flags. A second startup with no changes decodes no cover file (counter in the test).

**Verification.** Rust unit tests (fold, natural order, prefix table, grouping table, disc order). Rust integration tests on the fixture tree (Linux and Windows CI), including P5-AC15. Manual Linux: P5-AC6, P5-AC12.

---

### P6. Library widget and search

**Objective.** The Library widget shows the real library in all three modes with search, selection and keyboard navigation.

**Scope.** R28 (all). R5 (album rows with thumbnails slot, tag artist when it differs, Search in the header). R6 (single click, double-click and Enter, search semantics, Tree search rule). R25 (Up, Down, Right, Left, Enter, Ctrl+F, Esc, focus visible). design.md §5 (main area), §6 (track rows, album cards, search). AC-2, AC-14, AC-20.

**Depends on.** P5.

**Tasks.**

- **P6.1** Index queries in `library/query.rs` (first built in P3.1), finished and tested on the real index: `library_artists(query)`, `library_albums(artist_id | null, query)`, `library_song_ids(scope, query)`, `library_rows(ids)` and `library_tree(query)`. `library_tree` returns the matching artists, albums and songs by the R6 Tree rule: a match on an artist or album name includes all its songs.
- **P6.2** Search (R6): incremental, case and accent insensitive (`fold`), matches artist, album and song title. The frontend debounces input by 120 ms.
- **P6.3** Finish the Tree, Columns and Top/bottom views on the real index. "All" rows, Artist filters Album, Album filters Songs, no selection shows all songs (R28).
- **P6.4** Rows (design.md §6): song rows show title, the tag artist when it differs from the folder artist, album (Columns and Top/bottom only) and duration (`.tabular`). Album rows show a 40 px thumbnail slot (ArtPlaceholder until P10), the album name and the artist name. Selected rows use `--color-state-selected` and a 2 px `text.primary` bar at the left edge (D10). The playing song shows a Lucide `AudioLines` icon and an accessible "Playing" label.
- **P6.5** Selection: single click selects. Double-click or Enter on a song calls `player_play_list` with the list it appears in (R6 queue rule: the album in Tree mode, the Songs list as shown in Columns and Top/bottom). Double-click or Enter on an album row plays the album from its first song.
- **P6.6** Keyboard (R25): lists use `role="listbox"` and the tree uses `role="tree"`, with `aria-activedescendant`, `aria-setsize`, `aria-posinset` and `aria-selected`; tree rows also carry `aria-level` and `aria-expanded`. The active row shows a 2 px inset `text.primary` outline while the list has focus. The virtualizer's `rangeExtractor` keeps the active row rendered when it scrolls out of view. Up and Down move. Right expands and Left collapses in Tree mode. Shift+F10 and the ContextMenu key open the context menu for the active row. Ctrl+F activates the Library tab when it is in a tabbed group and focuses the search field. Esc clears the search and moves focus to the Library list.
- **P6.7** Remove the `fixtures` feature and its data generator (D35). The query commands and `CLAWDIO_MEASURE_MODE` stay. Playwright mocks stay. Switch `measure.yml` to the production setup that P18.5 uses: a release build without fixtures, a portable folder with a pre-written `settings.json` that points at a 50,000-track library made by P4.12 and P5.13 (with `--covers 2000`, which writes `cover.jpg` into 2,000 albums), and the same three-mode runs.
- **P6.8** Responsiveness probe (AC-2): when the environment variable `CLAWDIO_PERF=1` is set, a release build records, for each key and pointer event, the time from the event to the next paint. WebView2 uses the Event Timing API (`duration`). WebKitGTK uses the time to a `MessageChannel` callback queued from the next animation frame. Every 10 s the app logs the maximum and the number of events over 100 ms.

**Acceptance criteria.**

- **P6-AC1** Each mode shows the fixture library with "All" rows and filters per R28.
- **P6-AC2** Switching the mode keeps the selected song, album and artist and the search text (AC-14 part).
- **P6-AC3** Search "beyonce" finds "Beyoncé". Tree search shows matching artists and albums and the matching songs. An album name match shows all its songs.
- **P6-AC4** Double-click and Enter play by the queue rule in each mode. An album row plays the album from its first song.
- **P6-AC5** Up, Down, Right, Left, Enter, Ctrl+F and Esc work as R25 states. The active row shows the inset outline. Tree rows expose `aria-level`, `aria-expanded` and `aria-selected`. After the active row is scrolled out of view with the wheel, the arrow keys still move from it.
- **P6-AC6** During the first scan of the 50,000-track generated library, a user selects and plays an already scanned song. With `CLAWDIO_PERF=1`, no input-to-paint time exceeds 100 ms (AC-2).
- **P6-AC7** A song whose tag artist differs from its folder artist shows both names.
- **P6-AC8** The `fixtures` feature and its data generator are gone.
- **P6-AC9** Selected rows are identifiable in a grayscale screenshot.
- **P6-AC10** Shift+F10 and the ContextMenu key open the context menu for the active row.

**Verification.** Rust tests for queries and the Tree rule. Playwright with mocked IPC: P6-AC1 to P6-AC5, P6-AC7, P6-AC9, P6-AC10. Manual Linux and Windows: P6-AC6 with the generated library.

---

### P7. Playback engine and Play queue

**Objective.** Complete R6 playback semantics. Transport controls, Now playing and Play queue work with real playback.

**Scope.** R6 (controls, Stop, repeat modes, shuffle, Previous, decode error, queue rule, Play and Add to queue, queue edits, context menu, "Added to queue"). R5 (Transport buttons, seek bar, volume, elapsed and total time; Now playing fields). R25 (Space, Enter, Delete in the queue). Section 5 (decode error, audio device unplugged, transport hidden). Section 6 (audio engine, gapless-ready design). design.md §6 (transport, timeline, volume). AC-10, AC-13 (keyboard part), AC-18 (playback part), AC-19, AC-20.

**Depends on.** P6.

**Tasks.**

- **P7.1** `crates/clawdio-core/src/queue.rs`: a pure state machine. State: entries (track ids), current index, play order, history, shuffle flag, repeat mode. Operations: `replace(list, start)`, `append(ids)`, `remove(index)`, `clear`, `next`, `previous(position)`, `on_end`, `set_shuffle`, `set_repeat`. The player thread owns it (D46). Rules:
  - Repeat off: after the last entry, stop with the last entry current at position 0.
  - Repeat all: after the last entry, continue from the first.
  - Repeat one: the current entry restarts when it ends. Next and Previous still move.
  - Shuffle on: random order over the remaining entries. Each entry plays once before any repeats. The display order does not change. Shuffle off continues in queue order from the current entry.
  - Previous: position over 3 s restarts the current entry. Otherwise it goes to the previous entry in play order (with shuffle, the last entry played in this run). With none, it restarts the current entry.
  - Remove the playing entry: stop it and start the next, or stop at the end. Remove an entry before the playing one: keep the song and position. Clear: stop and empty.
  - Appending during shuffle adds the new entries to the remaining random pool.
- **P7.2** Engine in `src-tauri/src/player/engine.rs` (section 6.10): one audio thread, a command channel, rodio `Player` on a device sink opened with an error callback. The sink opens on the first Play, not at startup, so idle memory and CI runs without a sound device are not affected. Position polled every 250 ms. End detection by an `EmptyCallback` source appended after each track. Seek with `try_seek`. Volume 0 to 1.
- **P7.3** Decode errors (R6, D32): `src-tauri/src/player/source.rs` implements a rodio `Source` over Symphonia 0.5.5 that sends decode errors to the engine through a channel. A D32 error of kind (a), (b) or (c) logs it, shows "Cannot play <file name>" and moves to the next entry. Three consecutive failures stop playback.
- **P7.4** Device errors (section 5): the error callback stops playback and shows "Audio output not available. Press Play to try again." The next Play opens the current default device.
- **P7.5** Gapless-ready seam (section 6): the engine API has `prepare_next(track)`. v1 calls it only after the current track ends. A later change can call it early.
- **P7.6** Commands and events: `player_play`, `player_pause`, `player_toggle`, `player_stop`, `player_next`, `player_previous`, `player_seek(ms)`, `player_set_volume(v)`, `player_set_shuffle(on)`, `player_set_repeat(mode)`, `queue_get`, `queue_append(ids)`, `queue_remove(index)`, `queue_clear`. Events `player-state`, `player-position`, `queue-changed`.
- **P7.7** Transport controls widget: 44 px play/pause with a red ring, neutral Stop, Previous and Next, Shuffle and Repeat toggles (`aria-pressed`, red icon plus a 4 px dot when on, `Repeat1` icon for repeat one), seek slider (decorative `brand.steel` track, `brand.red` range, 12 px `brand.red` thumb that is always visible, step 1 s, Home and End, `aria-valuetext` such as "2:14 of 4:32"), elapsed and total time (`m:ss`, `h:mm:ss` from one hour, `.tabular`), volume slider (same colors, arrows, Home and End, `aria-valuetext` such as "Volume 60 percent") with a Lucide icon that shows `VolumeX` at 0 (C3). Tooltips name the shortcut where one exists. Buttons are disabled with no folder or an empty queue.
- **P7.8** Now playing widget: art slot (ArtPlaceholder until P10), title (18 px), artist and album (13 px, `--color-text-secondary`), heart slot (P11).
- **P7.9** Play queue widget: virtualized list, the playing entry marked by icon and label, Delete removes the selected entry (R25), a context menu with Remove, a "Clear queue" button in the widget body header, the empty hint.
- **P7.10** Library context menu on songs (shadcn ContextMenu): Play (replaces the queue, R6), Add to queue (appends; status "Added to queue"), Add to playlist (disabled until P11).
- **P7.11** Space (D17) toggles play and pause everywhere except in text fields and inside open menus and dialogs. On a focused button outside a dialog, Space toggles playback (it does not press the button). It works with Transport controls hidden.
- **P7.12** Extend the P4.9 test output with end-of-track, decode-error and early-end cases (D32 rules b and c), using `damaged.ogg` and `truncated.mp3`.

**Acceptance criteria.**

- **P7-AC1** Each R6 rule in P7.1 has a named unit test, and all pass. A property test checks that shuffle plays every entry once before a repeat.
- **P7-AC2** Stop ends playback, sets the position to 0 and keeps the queue.
- **P7-AC3** A queue with `corrupt.mp3` skips it, shows "Cannot play corrupt.mp3" and continues. Three corrupt files in a row stop playback (AC-19). `truncated.mp3` (rule c) and `damaged.ogg` (rule b) each show "Cannot play <file name>", and playback continues. A VBR MP3 with no Xing header plays to its end with no message.
- **P7-AC4** Unplugging the output device during playback stops it with the message. Play resumes on the default device (AC-10, manual on Windows and Linux).
- **P7-AC5** With Transport controls hidden, Space toggles playback. After a click on Next, Space toggles playback and does not press Next again. In the search field Space types a space (AC-13 keyboard part).
- **P7-AC6** A two-disc album plays disc 1 then disc 2 in track order (AC-18).
- **P7-AC7** "Add to queue" appends and shows "Added to queue". Play from the context menu replaces the queue.
- **P7-AC8** Active Shuffle and Repeat are identifiable in a grayscale screenshot (dot and icon change).
- **P7-AC9** Seek by keyboard on the focused slider moves playback. Times use tabular numerals.
- **P7-AC10** First run to first sound: after choosing the 50,000-track generated library, the user plays a song while the status line still shows the scan (AC-20).
- **P7-AC11** Seek and volume sliders: the arrow keys, Home and End work; `aria-valuetext` reads the time or the percent; the thumb is visible at position 0; `VolumeX` shows at volume 0.
- **P7-AC12** In the Play queue, Up and Down move and Delete removes the selected entry.

**Verification.** Rust unit and property tests (queue). Engine tests with the test output. Playwright with mocked IPC for widget states, P7-AC5, P7-AC11 and P7-AC12. Manual Linux and Windows: audible playback, P7-AC4, P7-AC10.

---

### P8. OS media integration

**Objective.** Media keys and the OS now-playing panel work on Windows and Linux.

**Scope.** R24 (all). Section 5 (transport hidden: media keys; closing the window quits). AC-13 (media key part).

**Depends on.** P7.

**Tasks.**

- **P8.1** `src-tauri/src/media_controls.rs` with souvlaki (D39). Windows: pass the main window HWND. Linux: D-Bus name from the identifier with dots replaced by underscores.
- **P8.2** Map OS events Play, Pause, Toggle, Next, Previous and Stop to player commands. Ignore other events.
- **P8.3** On each track change publish title, artist, album, duration and the cover URL (`file://` to the 512 px cache image, from P10; none before P10). Publish the playback state with position on each state change.
- **P8.4** Fail soft: an error on create or attach is logged and the app continues.
- **P8.5** Closing the main window quits the app. No tray and no background process.

**Acceptance criteria.**

- **P8-AC1** Windows: keyboard media keys control playback with the window in the background. The Windows media flyout shows title, artist and album. Its play, pause, next and previous buttons work, and its position matches the app within 2 s.
- **P8-AC2** Linux: `playerctl play`, `pause`, `play-pause`, `next`, `previous` and `stop` control playback. `playerctl metadata` shows title, artist and album. `playerctl position` matches the app within 2 s.
- **P8-AC3** With no D-Bus session (`DBUS_SESSION_BUS_ADDRESS` set to an invalid value) the app starts, logs the error and plays audio.
- **P8-AC4** With Transport controls hidden, media keys still work (AC-13 media key part).
- **P8-AC5** After the window closes, no app process remains.

**Verification.** Manual Linux (GNOME on Ubuntu 22.04 or later): P8-AC2, P8-AC3, P8-AC5. Manual Windows: P8-AC1, P8-AC4, P8-AC5. Report any platform that was not available.

---

### P9. Persistence: state, arrangement and instance

**Objective.** The app restores the queue, position, volume and the widget arrangement. Bad layout files fail safe. A second launch focuses the first.

**Scope.** R27 (all). R29 (arrangement file, version, auto-save, restore, apply replaces, corrupt, unknown widget, no Library widget, tabbed group round trip). R17 (arrangement schema doc). Section 5 (layout problems, second app launch, window smaller than layout). AC-11, AC-12, AC-13 (Reset layout), AC-17 (state part).

**Depends on.** P8.

**Tasks.**

- **P9.1** `crates/clawdio-core/src/state.rs`: `state.json` with version, queue (paths relative to the music folder), current index, position in ms and volume (D25). Save 2 s after a change and on exit. At startup restore it paused:
  - Resolve entries against the index after the cache loads.
  - Entries not in the index stay pending until the startup scan completes a full traversal. Only then drop those still missing, with no message.
  - With the music folder missing, drop nothing and do not write `state.json`.
  - Do not save state until the restore has resolved.
- **P9.2** Commands `layout_load` and `layout_save(json)`: Rust reads and atomically writes `layout.json` in `DataDirs.config`.
- **P9.3** `src/shell/persistence.ts`: the saved object is `{ "version": 1, "libraryMode": ..., "dock": <Dockview toJSON> }`. Save 500 ms after a layout or mode change. No window size. On a window close request (`onCloseRequested`), write any pending save before the window closes.
- **P9.4** Restore order:
  1. Parse error, unknown version, a missing `dock` object, or a `libraryMode` that is missing or not one of `tree`, `columns`, `topBottom`: log a warning and apply Columns.
  2. Unknown widget ids: Dockview `fromJSON` throws on an unknown component name. Before the call, rewrite each unknown component name to a registered `unknown` placeholder and log the id. After the call, remove those panels.
  3. No Library panel: apply Columns.
  4. Any error thrown by `fromJSON`: log it and apply Columns.
  5. Fit the layout to the window (Dockview layout call with the window size). Panel minimum sizes are saved in the layout, so the clamp uses them.
- **P9.5** Single instance (`tauri-plugin-single-instance`, registered first): a second launch focuses, unminimizes and raises the first window, then exits.
- **P9.6** `docs/file-formats.md`: `settings.json`, `state.json` and `layout.json` schemas with examples.

**Acceptance criteria.**

- **P9-AC1** After a restart the queue, current song, position (paused) and volume return. Entries for deleted files are gone with no message.
- **P9-AC2** In each Library mode, a docked, resized and hidden arrangement survives a restart (AC-11).
- **P9-AC3** Each built-in layout applies. A tabbed group survives a restart (AC-12).
- **P9-AC4** Corrupt JSON, version 2, an unknown or missing `libraryMode`, an unknown widget id and a file without Library each give the specified result and one log line (unit tests with fixture files).
- **P9-AC5** Reset layout restores the default after a restart with a saved custom layout (AC-13 Reset part).
- **P9-AC6** A second launch focuses the first window and leaves one process.
- **P9-AC7** In portable mode `state.json` and `layout.json` are in `data/config`. The queue survives a copy of the portable folder and the music folder to another drive letter (AC-17 state part, Windows).
- **P9-AC8** `layout.json` holds no window size. The window size is in `settings.json` only.
- **P9-AC9** A layout saved in a 1600 x 1000 window and restored in an 800 x 560 window fits. Every visible widget is at or above its minimum size, or the D45 clamp applies.
- **P9-AC10** Delete the cache and restart: the queue survives after the scan ends. Start with the music folder missing: `state.json` is byte-identical after the app exits (AC-8, AC-9).
- **P9-AC11** Change the arrangement and close the window within 100 ms. After a restart the change is there.

**Verification.** Rust tests (state round trip, missing entries, P9-AC10). Vitest (restore rules with fixture JSON, P9-AC8). Playwright (save on change, P9-AC9 with two viewport sizes, P9-AC11). Manual Linux and Windows: P9-AC2, P9-AC3, P9-AC6. Manual Windows: P9-AC7.

---

### P10. Local artwork and thumbnails

**Objective.** Album art from cover files and embedded images shows in album rows, Now playing and the OS panel. Albums with no art show a quiet brand placeholder. "Set cover" works.

**Scope.** R5 (art order, cover file names, decode failure, thumbnails in the cache). R8 ("Set cover"). R19 (thumbnails in the cache folder). R24 (artwork to the OS). Section 5 (cover file fails to decode, read-only music folder for Set cover). design.md §5 (quiet placeholder), §6 (album cards). asset-manifest (missing-artwork placeholder). AC-6 (Set cover part).

**Depends on.** P9.

**Tasks.**

- **P10.1** `artwork.rs`: art source for an album:
  1. A cover file in the album folder. Names in order `cover`, `folder`, `front`, `albumart`; extensions in order `.jpg`, `.jpeg`, `.png`; names compared without case.
  2. Else embedded art: walk the album's songs in album order (only songs with the D44 embedded-picture flag) and take the first front cover (`PictureType::CoverFront`) that decodes. If no song has a front cover that decodes, take the first picture of any type that decodes.
  3. A cover file that fails to decode is logged and skipped. The next source applies.
- **P10.2** `thumbs.rs` (D27): 96 px and 512 px JPEG files in `DataDirs.cache/thumbs/`. Two worker threads make them on request. Command `album_art(album_id, size)` returns a path or none. Event `art-ready` tells the UI when a file appears.
- **P10.3** UI: album rows request art only for visible rows. `<img>` uses `convertFileSrc(name, "thumb")` (D41). Now playing shows the 512 px image. No art: `ArtPlaceholder`.
- **P10.4** "Set cover" on the album context menu: a Rust file picker for `.jpg`, `.jpeg` and `.png`. Decode the file, convert it to JPEG (quality 90), check that the folder is writable, ask for confirmation if `cover.jpg` exists (D19), write a temp file and rename it. Remove the album's thumbnails so they regenerate. Read-only folder: show the error and write nothing.
- **P10.5** Media controls: pass the 512 px file as a `file://` cover URL (R24). When the 512 px file for the current song's album becomes ready after the track started (`art-ready`), publish the metadata again.

**Acceptance criteria.**

- **P10-AC1** Source order tests pass: `cover.jpg` beats `folder.png`, any cover file beats embedded art, names match without case. An album whose only embedded art is in its third song shows that art.
- **P10-AC2** A cover file with broken image data logs a warning and the embedded art shows.
- **P10-AC3** Thumbnails are in the cache folder. Deleting the cache regenerates them.
- **P10-AC4** An album with no art shows the placeholder in rows and in Now playing.
- **P10-AC5** "Set cover" with a PNG writes a JPEG `cover.jpg`. An existing `cover.jpg` asks first. A read-only folder shows the error and writes nothing.
- **P10-AC6** The Windows media flyout and `playerctl metadata mpris:artUrl` show the art. With an empty thumbnail cache, the art appears for the current song without a track change.
- **P10-AC7** With 50,000 songs, scrolling the album list requests art only for visible rows plus overscan (Playwright request count).

**Verification.** Rust tests (order, decode failure, conversion, read-only). Playwright (P10-AC4, P10-AC7). Manual Linux and Windows: P10-AC5, P10-AC6.

---

### P11. Playlists and Favorites

**Objective.** Users create, fill, edit, delete and play M3U8 playlists. The heart adds and removes Favorites.

**Scope.** R12 (all, including the name rule and duplicates). R13 (all). R26 (all). R6 (queue rule for playlists, "Add to playlist"). R25 (Delete in a playlist, Enter). Section 5 (playlist entry with no file, unreadable playlist, playlist write failure, read-only folder, folder change reloads playlists). Section 8 (R13 path base). AC-3. B3.

**Depends on.** P10.

**Tasks.**

- **P11.1** `playlist/m3u.rs`: read UTF-8 (BOM removed). Write `#EXTM3U`, then for each entry `#EXTINF:<seconds>,<artist> - <title>` and the path relative to the playlist file with forward slashes. Write to a temp file in the same folder, then rename. A rewrite keeps entries and drops other comment lines. `docs/file-formats.md` states this.
- **P11.2** Discovery: the scan collects `.m3u8` files anywhere in the music folder (hidden names skipped). Entries resolve relative to the playlist file. An entry that is not a library track is "missing". An unreadable file is skipped and logged. `.m3u` and `.pls` files are not listed. A rescan never writes a playlist.
- **P11.3** `playlist/name.rs`: the R12 rule (no `/`, `\`, `..`, `< > : " | ? *`; no leading or trailing space or dot; not CON, PRN, AUX, NUL, COM1 to COM9, LPT1 to LPT9 in any case, also when followed by a dot and more text ("CON.mix"), because Windows reserves those names with any extension; not "Favorites" in any case) plus D21. Each rejection has a message.
- **P11.4** Commands: `playlists_list`, `playlist_entries`, `playlist_create`, `playlist_add`, `playlist_remove_entry`, `playlist_delete`, `favorite_toggle`. Event `playlists-changed`.
- **P11.5** Playlists widget (tree role, with the P6.6 keyboard and ARIA pattern):
  - Playlists in natural name order. Each expands to its entries. Up and Down move, Right expands and Left collapses.
  - Missing entries use `text.muted`, an icon and the word "missing".
  - Header buttons "New playlist" (name dialog with inline validation) and "Import playlist" (disabled until P12).
  - Double-click or Enter on a playlist plays it (D24). On an entry, it plays the playlist from that entry. Missing entries are skipped.
  - Delete removes the selected entry with no confirmation (R25), also in Favorites (D20).
  - Context menu on an entry: Play, Add to queue, Remove from playlist. On a playlist: Play, Delete playlist (confirmation dialog that names the file).
- **P11.6** Library song context menu "Add to playlist": all playlists except Favorites (D20) and "New playlist", which creates the playlist and adds the song. Duplicates are allowed.
- **P11.7** Favorites (R26): a heart toggle on Now playing (keyboard reachable, `aria-pressed`) and on Library song rows (pointer only, D23). The toggle adds the song, or removes every copy of it. The first use creates `Playlists/` and `Favorites.m3u8`. Favorites shows in the Playlists widget.
- **P11.8** Errors: a write failure or a read-only folder shows a dialog. The old file stays as it was. Playback continues.
- **P11.9** Interop test (AC-3, B3): write a playlist with entries in two artist folders. Open it in VLC on Linux and Windows. Open it in MusicBee too if available. Record the result in `docs/release-checklist.md`. On Linux, the check can run unattended: `cvlc -I dummy -A dummy --play-and-exit <playlist>` and a search of its log for "cannot open". If any tested player fails on `..` paths, ask the owner (R13, B3). If no Windows machine is available, P11 closes as Done with exceptions and B3 stays open until P18.
- **P11.10** Folder change (section 5) reloads the playlists of the new folder.

**Acceptance criteria.**

- **P11-AC1** Each forbidden name in R12 is rejected with a message, including "favorites" in any letter case and device names with an extension ("CON.mix", "com1.roadtrip"). Valid names, including non-Latin ones, are accepted.
- **P11-AC2** Create, add (with a duplicate), remove and delete (after confirmation) give files that match golden text byte for byte.
- **P11-AC3** A failed write shows the error. The old file is unchanged (hash).
- **P11-AC4** Missing entries show as "missing", are skipped in playback and stay in the file after every action.
- **P11-AC5** The heart adds and removes the song in `Playlists/Favorites.m3u8`, creates it on first use and matches the file state.
- **P11-AC6** `.m3u8` files in any folder are listed. `.m3u` and `.pls` are not. An unreadable file is skipped and logged.
- **P11-AC7** A rescan leaves every playlist file byte-identical.
- **P11-AC8** Up, Down, Right and Left move, expand and collapse in the Playlists tree. Delete removes the selected entry, also in Favorites. Enter and double-click play the playlist.
- **P11-AC9** VLC opens an app-written playlist with all paths intact on Linux and Windows (AC-3).
- **P11-AC10** With a read-only folder, playlist edits and the heart show an error. Playback and browsing work.
- **P11-AC11** After the cache is deleted, the same playlists show with the same entry states. After a folder change, only the new folder's playlists show (AC-9, section 5).

**Verification.** Rust unit and integration tests (P11-AC1 to P11-AC7, P11-AC11). Playwright (widget behavior, P11-AC8). Manual Linux and Windows: P11-AC9, P11-AC10.

---

### P12. Playlist import

**Objective.** Import M3U, M3U8 and Apple XML playlists into new M3U8 files with a matched and missing report.

**Scope.** R14 (all). Section 8 (MusicBee M3U8 assumption). AC-4. B4. Q5.

**Depends on.** P11.

**Tasks.**

- **P12.1** Parsers in `import/`: M3U (UTF-8 when valid, else Windows-1252), M3U8 (UTF-8), Apple XML (`plist` crate; `Tracks` and `Playlists`; `Location` from `file://` URL to path with percent-decoding; tracks with no `Location` go to the report only). Playlists per D22.
- **P12.2** Path normalization (R14): backslashes to slashes, drive letter or UNC prefix removed, Unicode NFC, comparison without case.
- **P12.3** Matching stages (R14): (1) relative to the playlist file (M3U family only), (2) longest path suffix, (3) file name, (4) name plus artist plus album when the source has them (Apple XML fields, or `#EXTINF` text). A stage must yield one track. More than one: the next stage runs on those candidates only. Still more than one after the last stage: "ambiguous", kept as missing.
- **P12.4** Output: a new `.m3u8` in `Playlists/` named from the source (file name, or the Apple playlist name) by D21. Matched entries become relative paths. Unmatched entries keep their original entry text (for Apple XML, the decoded path of `Location`) and show as missing. Normalization is used for matching only. The source file is not changed.
- **P12.5** Import report dialog: matched count, then missing entries with the reason (not found, ambiguous, no file location).
- **P12.6** Playlists widget "Import playlist" button opens a Rust file picker for `.m3u`, `.m3u8` and `.xml`. Matching searches the library only.
- **P12.7** Fixtures: Apple XML (library playlist with `Master`, one user playlist, one track with no `Location`, `file://localhost/C:/...` paths with `%20`), MusicBee-style M3U8 (absolute Windows paths), legacy `.m3u` in Windows-1252 with "é".

**Acceptance criteria.**

- **P12-AC1** Each stage, the candidate narrowing and the ambiguous rule have unit tests.
- **P12-AC2** The three fixtures give the expected `.m3u8` text and report (golden).
- **P12-AC3** Source files are byte-identical after import.
- **P12-AC4** The Windows-1252 file decodes "é" correctly.
- **P12-AC5** Tracks with no file location appear in the report only.
- **P12-AC6** The owner's real exports (Q5) import with a correct matched and missing report (AC-4), for each format the owner supplies. A format with no file stays "not verified". The files are never committed.

**Verification.** Rust tests (P12-AC1 to P12-AC5). Playwright (report dialog). Manual with owner files (P12-AC6).

---

### P13. Local lyrics

**Objective.** The Lyrics widget shows lyrics of the playing song from local files or embedded tags.

**Scope.** R9 (widget, timestamps hidden, source order, embedded lyrics, "Fetch lyrics" visibility, synced highlighting deferred). Section 5 (empty Lyrics widget). AC-21.

**Depends on.** P12.

**Tasks.**

- **P13.1** `lyrics.rs` `load(track)`: `<base name>.lrc` next to the song, else `<base name>.txt`, else embedded lyrics (lofty `ItemKey::UnsyncLyrics` and `ItemKey::Lyrics`; this covers ID3v2 USLT and Vorbis `LYRICS` and `UNSYNCEDLYRICS`). Text decoding per D26.
- **P13.2** LRC cleanup: remove every leading time stamp on a line in any common form (`[mm:ss]`, `[mm:ss.x]`, `[mm:ss.xx]`, `[mm:ss.xxx]`, also with `:` before the fraction; regex `\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]`), drop tag lines (`[ar:]`, `[ti:]`, `[al:]`, `[au:]`, `[by:]`, `[length:]`, `[offset:]`, `[re:]`, `[ve:]`), keep the file's line order and blank lines. No line highlighting (deferred).
- **P13.3** Command `lyrics_get(track_id)`. Event `lyrics-changed` when the playing song changes, when the app writes a lyrics file, or when a completed scan finds that the playing song's lyrics source changed (section 5: folder edits appear after Rescan).
- **P13.4** Lyrics widget: scrollable, selectable text, 14 px, line height 1.6. The empty hint when there are no lyrics. A "Fetch lyrics" button shows only when no source exists. In P13 it is disabled. P15 enables it.

**Acceptance criteria.**

- **P13-AC1** Source order tests: `.lrc` beats `.txt` beats embedded.
- **P13-AC2** LRC stamps in every form of P13.2 and tag lines do not show.
- **P13-AC3** An MP3 with an ID3 USLT frame and no lyrics file shows the embedded lyrics (AC-21).
- **P13-AC4** Ogg files with `LYRICS` or `UNSYNCEDLYRICS` show their lyrics.
- **P13-AC5** "Fetch lyrics" shows only when no source exists. The empty hint shows when nothing plays or no lyrics exist.
- **P13-AC6** Adding, editing or removing the playing song's `.lrc` file outside the app, then Rescan, updates the widget without a song change.

**Verification.** Rust tests with generated fixture files (lofty writes the tags into copies of the seed files). Playwright (P13-AC5). Manual Linux: P13-AC3 with real playback.

---

### P14. Online lookups and artwork fetch

**Objective.** The Online lookups switch controls all network use. With it on, artwork downloads follow R8.

**Scope.** R7 (switch behavior, zero calls when off, cancel and abort). R8 (all). R10 (sidecar file name, marker in the same file). R11 (sidecars are not tracks, orphans ignored). R19 (no markers in the cache). Section 5 (no network or service error, existing art, read-only music folder, corrupt sidecar). Section 6 (network constraint). AC-6, AC-9 (marker part).

**Depends on.** P13.

**Tasks.**

- **P14.1** `net/` (section 6.11, D29): `OnlineGate`, private `reqwest` client (rustls), User-Agent, `Lrclib-Client` header, redirect policy (gate check, allow-list, HTTPS, max 5 hops), connect timeout 10 s, total timeout 30 s, streamed body with a 10 MB cap, cancellation token. Base URLs come from a config struct so tests can use a mock server.
- **P14.2** MusicBrainz rate limiter: request starts at least 1 s apart, on a monotonic clock, shared by all MusicBrainz callers (R8, P16).
- **P14.3** `sidecar.rs`: `sidecar.json` in the album folder, schema version 1 (`docs/file-formats.md`): `{ "version": 1, "artwork": { "status": "no-match", "checked": "<RFC 3339 time>" }, "tracks": {} }`. Read leniently. A corrupt file is logged and ignored and never rewritten automatically; its album is not a lookup candidate (D44). Writes are atomic. Entries for missing songs are ignored and kept. The scan never treats `sidecar.json` as a track.
- **P14.4** Name normalization for matching (R8, D43), in `net/normalize.rs`: fold; remove a leading year (`1973 - `, `1973. `, `(1973) `); remove bracketed or parenthesized groups that hold a year or an edition word; remove a leading "the "; collapse spaces.
- **P14.5** Artwork job. Candidates come from the scan flags (D44), so startup reads no audio or image file. A candidate has a real album folder (not "Unknown Artist" or "Unknown Album"), no valid cover file, no `cover.jpg` at all (a broken `cover.jpg` blocks the save and is logged), no embedded picture in any song, a readable `sidecar.json` or none, no no-match marker and a writable folder (checked by creating and removing a temp file; a read-only folder is logged and skipped). Steps:
  1. Search MusicBrainz release groups: `query=releasegroup:"<album>" AND artist:"<artist>"` with Lucene escaping, `fmt=json`.
  2. Keep results whose normalized title equals the normalized album folder name and whose normalized artist credit equals the normalized artist folder name.
  3. Exactly one: request `https://coverartarchive.org/release-group/<id>/front-500`. Check the content type, the magic bytes (JPEG or PNG), the size (10 MB or less) and that the image decodes. Convert PNG to JPEG. Write `cover.jpg` only if no file exists (create new, never overwrite). Then set the album's cover state to valid, remove its old thumbnails, request new ones and emit `art-ready`, so the UI and the OS panel update at once (P10.5).
  4. Zero or two or more: write the no-match marker.
  5. A 404 from Cover Art Archive after a unique match: write the marker with status `no-art`. "Retry lookup" clears it like a no-match marker.
  6. Network error, 429 or 503: no marker. The album is retried at the next startup.
- **P14.6** Scheduling: with the switch on, the job runs after the startup scan completes a full traversal and after each later scan. Before each request the job checks the album folder on disk again (cover file names, and the D44 flags of files that changed) and skips the album if art now exists. One album at a time. The status line shows "Fetching artwork: N of M albums" with Cancel. Cancel uses a per-job cancellation token: it drops the active request and stops the queue, and no file is written after Cancel. Turning the switch on starts the job. Turning the switch off cancels the queue and drops in-flight requests (R7).
- **P14.7** "Retry lookup" on the album context menu (disabled when the switch is off): clear the marker and look up that album now.
- **P14.8** Tests with `httpmock` for every rule in P14.1 to P14.7.
- **P14.9** Docs: sidecar schema in `docs/file-formats.md`. README section "Online lookups": the services, the data sent (artist and album folder names, song title, duration) and the files written.

**Acceptance criteria.**

- **P14-AC1** With the switch off, startup, scan and "Retry lookup" make zero requests (mock server count and a gate counter). P15-AC6 covers "Fetch lyrics".
- **P14-AC2** Turning the switch off, or pressing Cancel, during a slow mock download aborts it within 1 s. No file is written. Queued albums are not processed.
- **P14-AC15** The job starts only after the startup scan ends. An album that gained `folder.jpg` while the app was closed is not looked up.
- **P14-AC3** The album folder "1973 - Album (Remastered)" matches the release group "Album" (AC-6).
- **P14-AC4** One match saves a valid `cover.jpg`. Zero or two matches write the marker. A 503 writes no marker.
- **P14-AC5** Albums with embedded art, a cover file, a marker, an Unknown group, songs directly in the artist folder or a read-only folder are not looked up. The read-only skip is logged.
- **P14-AC6** MusicBrainz requests start at least 1 s apart. The User-Agent matches `Clawdio/<version> ( https://github.com/Penguin-Pants/Clawdio )`.
- **P14-AC7** "Retry lookup" clears the marker and looks up again (AC-6).
- **P14-AC8** After the cache is deleted, albums with a marker are not looked up (AC-9 marker part).
- **P14-AC9** A non-image body or a body over 10 MB saves nothing.
- **P14-AC10** A corrupt `sidecar.json` is logged, ignored and left unchanged.
- **P14-AC11** A redirect to a host outside the allow-list is refused.
- **P14-AC12** During the job the status line shows progress and Cancel, and browsing and playback stay usable (manual).
- **P14-AC13** With no network, startup, browsing and playback work. The job logs the failure, writes no marker and runs again at the next startup.
- **P14-AC14** An album whose only cover file is a broken `folder.jpg` and that has no embedded art is a candidate. An album with a broken `cover.jpg` or a corrupt `sidecar.json` is skipped and logged, and no request is made (D44).

**Verification.** Rust integration tests with `httpmock` (P14-AC1 to P14-AC11, P14-AC13 to P14-AC15). Manual Linux with the real services and a small library: P14-AC12 and one real cover download.

---

### P15. Lyrics fetch

**Objective.** "Fetch lyrics" gets lyrics from LRCLIB for the playing song and saves them next to the song.

**Scope.** R9 (lookup fields, fallback search, 2 s rule, `.lrc` or `.txt`, button only when no lyrics exist, disabled when the switch is off). R7 (gate). Section 5 (read-only folder). AC-5.

**Depends on.** P14.

**Tasks.**

- **P15.1** `lyrics.rs` fetch through the gate. Request `GET /api/get` with `artist_name` (folder artist), `track_name` (R4 cleaned title), `album_name` (folder album) and `duration` (the playing song's duration from the decoder, in whole seconds). If `/api/get` returns 404, no lyrics or a duration more than 2 s off, request `GET /api/search` with `track_name` and `artist_name`. On both endpoints, accept only a result whose duration is within 2 s and that has synced or plain lyrics.
- **P15.2** Save next to the song: `<base name>.lrc` when synced lyrics exist, else `<base name>.txt`. Create new, atomic. A read-only folder shows the error.
- **P15.3** UI: "Fetch lyrics" is enabled when the switch is on. Status "Fetching lyrics", then "Lyrics saved" or "No lyrics found". The widget refreshes from `lyrics-changed`.
- **P15.4** Tests with `httpmock`.

**Acceptance criteria.**

- **P15-AC1** For "01 - Title.mp3" the request carries `track_name=Title` and the decoded duration (AC-5).
- **P15-AC2** On both endpoints, results 2 s off are accepted and results 3 s off are rejected. A `/api/get` result 3 s off leads to the search.
- **P15-AC3** Synced lyrics save as `.lrc`. Plain lyrics save as `.txt`.
- **P15-AC4** No acceptable result shows "No lyrics found" and writes nothing.
- **P15-AC5** A read-only folder shows the error and writes nothing.
- **P15-AC6** With the switch off the button is disabled and no request is made.
- **P15-AC7** Saved lyrics show at once, with no restart.

**Verification.** Rust tests with `httpmock` (P15-AC1 to P15-AC6). Playwright (P15-AC6, P15-AC7 with mocked IPC). Manual Linux: one real fetch.

---

### P16. Metadata fill

**Objective.** A per-album action proposes missing titles, track numbers and years, shows a preview and writes `sidecar.json` only after the user confirms.

**Scope.** R10 (all). R4 (sidecar step in title and track number order). R11. Section 5 (corrupt sidecar replaced after the preview). R17 (sidecar schema).

**Depends on.** P15.

**Tasks.**

- **P16.1** Nothing is written before Confirm, not even a probe file (R10). Before the lookup, read the folder's permissions without writing; if they show the folder is read-only, show the read-only error (section 6.14) and stop. On Confirm, a failed write shows the same error and leaves the folder unchanged. "Missing" per song and field: the embedded tag is absent or empty for title, track number or year. File-name fallbacks do not count as filled (R10).
- **P16.2** Lookup (D42): search MusicBrainz releases with `release:"<album>" AND artist:"<artist>"`. Keep results that match by the P14.4 normalization. Then apply the D42 steps: a second search by album and artist tags when needed, and title scoring across the candidates. Scoring fetches `/ws/2/release/<id>?inc=recordings&fmt=json` for at most 5 candidate releases, through the rate limiter. No audio fingerprinting.
- **P16.3** Map songs to tracks: by disc and track number when both are known (tag or file name), else by folded title, else no proposal for that song.
- **P16.4** Preview dialog: a table of song, field and proposed value, for missing fields only. Confirm writes. Cancel writes nothing. A corrupt existing sidecar is named in the dialog and replaced on Confirm.
- **P16.5** Apply: merge into `sidecar.json` `tracks`, keyed by the song path relative to the album folder: `{ "title": "...", "track": 3, "year": 1973 }`. Keep the artwork marker. Atomic write. Update the album's cache rows and the stored sidecar size and modified time in the same step (P5.3).
- **P16.6** R4 order now uses the sidecar: title = tag, then sidecar, then file name; track number = tag, then sidecar, then prefix. Reload the album in the index.
- **P16.7** Album context menu "Fill missing metadata", disabled when the switch is off and for Unknown groups.
- **P16.8** `docs/file-formats.md`: `tracks` part of the sidecar schema.

**Acceptance criteria.**

- **P16-AC1** The preview lists only fields that are missing.
- **P16-AC2** Before Confirm, the album folder is unchanged (file list and hashes).
- **P16-AC3** After Confirm, untagged songs show sidecar titles and order, also after a restart. Tagged songs keep their tag values.
- **P16-AC4** Audio files are byte-identical after every action in P10 to P16 (hash guard, R11).
- **P16-AC5** A corrupt sidecar is replaced only after Confirm.
- **P16-AC6** Sidecar entries for missing songs are ignored and not deleted.
- **P16-AC7** No fingerprinting code or dependency exists (review of `Cargo.lock`).
- **P16-AC8** With a read-only album folder, the action shows the error and writes nothing. Before Confirm, a file-system watch on the album folder records no event at all.
- **P16-AC9** An album whose folder name finds no release but whose album tag does gets a proposal. Two releases with the same title score give no proposal (D42).

**Verification.** Rust tests with `httpmock` and generated folders. Playwright (preview dialog). Review (P16-AC7).

---

### P17. UI quality audit

**Objective.** Verify brand, design system, accessibility, keyboard, motion and narrow-window behavior across the whole app. Fix confirmed defects only.

**Scope.** design.md §2 (mascot not repeated), §3 (red use, contrast, not color alone), §4 (type), §5 (states, small windows, empty states), §6 (all component rows), §8, §9 (text scaling, keyboard), §10. Prompt Phase 3.4, 3.5, 4.3, 4.4, 4.6. R25 (complete). R30 (reduce motion). AC-16. asset-manifest (light backgrounds and high contrast).

**Depends on.** P16.

**Tasks.**

- **P17.1** Playwright state sweep in Chromium and WebKit: each widget empty, populated, selected, playing, disabled and in error. Run axe on each state.
- **P17.2** Keyboard walkthrough in `docs/release-checklist.md`: every R25 key and Ctrl+Shift+L, Delete in the queue and in a playlist, F6 order. Run it on Windows and Linux.
- **P17.3** Reduced motion: Playwright emulation for every state. Manual: Windows "Animation effects" off, GNOME "Reduce animation" on.
- **P17.4** Narrow window: screenshots at 800 x 560 of each built-in layout and of one tabbed layout.
- **P17.5** Text scaling: Windows 150 percent display scale and GNOME "Large text" at the minimum window.
- **P17.6** Forced colors: `@media (forced-colors: active)` rules for the focus ring, toggles, selected rows and the progress bar. Check in Windows high contrast.
- **P17.7** Type and wording audit against section 6.12: sizes, sentence case, tabular numerals on every time.
- **P17.8** Brand audit: wordmark only in the header strip and About, cat only as the app icon, monogram only in the placeholder, red only for the roles in section 6.12.
- **P17.9** Update `docs/design.md` for justified implementation differences only (prompt Phase 4.6): header strip (D11), no mute toggle (C3), album rows (C11), Geist (D7), no Magic UI (D6), type map (C12). Give the reason for each.

**Acceptance criteria.**

- **P17-AC1** No serious or critical axe violation in the sweep, in both engines.
- **P17-AC2** Every R25 key works on Windows and Linux.
- **P17-AC3** With reduced motion, no element has a non-zero transition or animation duration (automated) and no animation is visible (manual). AC-16 is recorded as "no Magic UI components copied"; the CSS rule covers all motion.
- **P17-AC4** At 800 x 560 no control is clipped or overlaps another.
- **P17-AC5** At 150 percent scale and with large text, the minimum window has no overlap.
- **P17-AC6** In forced colors the focus ring and toggle states are visible.
- **P17-AC7** The `design.md` diff contains only justified differences, each with a reason.
- **P17-AC8** The contrast test, source guards and SVG checks pass. The brand audit (P17.8) and the type and wording audit (P17.7) find no open defect. Both results are in the phase record.
- **P17-AC9** No animation delays input: menus and dialogs accept keys and clicks while they open (Playwright).

**Verification.** Playwright (P17-AC1, P17-AC3 automated part, P17-AC9). Manual Windows and Linux (P17-AC2, P17-AC4 to P17-AC6). Review (P17-AC7, P17-AC8).

---

### P18. Release readiness

**Objective.** Build, check and document every R21 package. Confirm the footprint, licenses and all 21 acceptance checks.

**Scope.** R20 (final measurement). R21. R22. R18.1 (AC-17). R17 (docs complete). R23. Section 6 (license). R30 (MIT notices of copied components). design.md §9, §10. Prompt Phase 4.1, 4.2, 4.5 and the final deliverable. asset-manifest (app title, executable metadata, manifests, About; taskbar and launcher icons; redistributable fonts and assets). AC-1, AC-15, AC-17 and the full check run.

**Depends on.** P17. B3 closed (P11.9 result or owner decision).

**Tasks.**

- **P18.1** Bundle config in `tauri.conf.json`: targets `nsis`, `deb`, `appimage`. NSIS `installMode` `currentUser`. `webviewInstallMode` `downloadBootstrapper`. Publisher (Q1), copyright, short description "Minimalist local music player", category Audio. `.deb` extra depends: `libasound2 | libasound2t64`. Desktop entry categories `AudioVideo;Audio;Player;`.
- **P18.2** Portable zip `Clawdio-<version>-windows-portable.zip`: the executable, an empty `portable` file, `LICENSE`, `NOTICE` and the third-party license files. Check D38: run the executable with `WEBVIEW2_BROWSER_EXECUTABLE_FOLDER` set to an empty folder (this simulates a missing runtime; the simulation itself is not verified) and, if available, on a Windows VM without WebView2.
- **P18.3** `.github/workflows/release.yml` on tags `v*`: Windows job (NSIS and zip), Linux job in an `ubuntu:22.04` container (AppImage and `.deb`), a size step that fails at 30 MB or more for NSIS and `.deb`, SHA-256 checksums, artifacts on a draft GitHub release.
- **P18.4** Licenses:
  - `deny.toml` allow-list: MIT, Apache-2.0, Apache-2.0 WITH LLVM-exception, BSD-2-Clause, BSD-3-Clause, ISC, Zlib, Unicode-3.0, MPL-2.0, CC0-1.0, Unlicense. `cargo deny check` runs in CI.
  - `cargo about generate` writes `THIRD_PARTY_LICENSES_RUST.html`.
  - `scripts/frontend-licenses.mjs` reads the license files of production npm dependencies and writes `THIRD_PARTY_LICENSES_WEB.txt`.
  - `scripts/notice.mjs` generates the `NOTICE` component table from the complete inventories: every production Rust crate (`cargo metadata`; version, license, crates.io or repository URL), every production npm package (version, license, repository URL), every library inside the AppImage (`dpkg-query` in the build container; version, license, Ubuntu source package URL) and the copied or bundled assets (Geist OFL, shadcn/ui MIT, Lucide ISC with the Feather MIT notice). Symphonia's entry also names its tagged GitHub release. CI runs the script and fails when the committed `NOTICE` differs.
  - Every package carries these files. The AppImage carries the LGPL texts.
- **P18.5** Final measurement (D28) with release builds and the generated 50,000-track library on Windows and Linux. Record memory and package sizes. Between 200 and 300 MB: the owner decides whether to adjust the target (R20 says "adjustable"). If P3 raised the target for an OS (D49), compare that OS against its raised value.
- **P18.6** Docs:
  - README: features, install per OS (WebView2 note, AppImage FUSE note), portable mode, keyboard shortcuts, online lookups and the files they write, data locations, build from source, license.
  - Complete `docs/file-formats.md` and `docs/theming-and-brand.md` (every R17 item).
  - `docs/release-checklist.md`: all 21 checks, the platform matrix and the results.
- **P18.7** Run AC-1 to AC-21 on Windows 10 or 11 and Ubuntu 22.04, and install the `.deb` on Debian 12. Repeat every "Done with exceptions" item from earlier phases. Record pass, fail or "not run" with the reason (prompt Phase 4.5).
- **P18.8** Brand swap demo (AC-15): replace `theme/tokens.json` and `clawdio-icon-full.svg` with test versions, rebuild and confirm the theme and the icon change with no other source file change (only the generated `src-tauri/icons/` files differ). If the Q8 fallback is on, replace `clawdio-icon-simple.svg` too and confirm that the 16 and 24 px layers change. Revert.
- **P18.9** Final reconciliation:
  - Update section 2, the traceability Status column and the `docs/asset-manifest.md` boxes.
  - Write a final summary in the phase record. It covers the prompt's final deliverable list: changes with paths; assets and export sizes; Magic UI (none, with the reason); tests and builds run with results; limitations and unverified platform checks; deviations from the reference with reasons.

**Acceptance criteria.**

- **P18-AC1** One tag produces the NSIS installer, the portable zip, the AppImage and the `.deb`.
- **P18-AC2** The NSIS installer and the `.deb` are under 30 MB. The AppImage size is recorded.
- **P18-AC3** The NSIS installer installs for the current user with no admin prompt. A machine without WebView2 gets the bootstrapper download.
- **P18-AC4** The portable executable runs from any folder. With no WebView2 it shows an error with a download link and exits without a crash.
- **P18-AC5** The AppImage runs on Ubuntu 22.04 (glibc 2.35). The `.deb` installs and runs on Debian 12 and Ubuntu 22.04.
- **P18-AC6** Idle memory with 50,000 tracks is under 200 MB on Windows and Linux, or the owner accepted the recorded value (AC-1).
- **P18-AC7** Each package holds `LICENSE`, `NOTICE` and the third-party license files. The AppImage holds the LGPL texts. `NOTICE` lists every production Rust crate, npm package and AppImage library with version, license and source, and the CI regeneration check passes.
- **P18-AC8** `cargo deny check` passes.
- **P18-AC9** The brand swap demo passes (AC-15).
- **P18-AC10** After a copy of the portable folder and the music folder to another drive letter, settings, the arrangement and the queue survive (AC-17).
- **P18-AC11** The window title, Windows executable metadata, installer, Linux desktop entry and About show "Clawdio". The icon shows in the Windows taskbar and the GNOME app grid.
- **P18-AC12** `docs/release-checklist.md` records a result for each of the 21 checks. Every check that ran passes. A check may be "not run" only when its platform was not available, or for AC-4, when the owner could not supply that export format (Q5). Each one is recorded as an exception. A failed check blocks P18. AC-1 may instead carry an owner-accepted value (R20 targets are adjustable).
- **P18-AC13** The docs cover every R17 item: token use, sidecar schema, arrangement schema, brand inputs and the (empty) Magic UI list.

**Verification.** CI release workflow (P18-AC1, P18-AC2, P18-AC8). Manual Windows (P18-AC3, P18-AC4, P18-AC10, P18-AC11). Manual Linux (P18-AC5, P18-AC11). Measurement (P18-AC6). Review (P18-AC7, P18-AC12, P18-AC13).

---

## 9. Risks

| ID | Risk | Effect | Mitigation | Phase |
|---|---|---|---|---|
| K1 | WebView2 or WebKitGTK with React and Dockview exceeds 200 MB idle | R20 fails | P3 gate before feature work; D14 keeps rows out of memory | P3, P18 |
| K2 | souvlaki 0.8.3 is from June 2025 and pulls `windows` 0.44 | Maintenance and binary size | Wrap it in `media_controls.rs`. Fallback: own SMTC and MPRIS code (owner decision) | P8 |
| K3 | rodio API changes between releases (0.22 renamed core types) | Upgrade cost | Exact pin; engine module is the only user | P7 |
| K4 | WebView2 accelerator keys need COM interop | Ctrl+F or F5 reach the browser | D37 module with a manual check | P0 |
| K5 | Dockview splitters have no keyboard support; a focused tab closes on Delete | Keyboard users cannot resize; Library could close | Menu path covers R29; Library tab guard (P2.3); keyboard moves deferred by the source | P2 |
| K6 | Apple XML format is not documented by Apple | Import mismatches | Fixtures from public samples; owner exports (Q5) | P12 |
| K7 | "Dr. Claw Development" names a third-party character. A villain-cat brand can look derivative. | Trademark or takedown risk | Original vector shapes only (P1-AC7); owner kept the publisher name and accepted the risk on October 11, 2026 (Q1) | P1, P18 |
| K8 | Brand palette contrast (C13) | Unreadable text | D10 rules and the contrast test | P0, P17 |
| K9 | Thumbnails live in a dot folder on Linux (`~/.cache`) | Thumbnails fail to load | D41 `thumb://` scheme reads by name, with no glob scope; P3-AC5 | P3 |
| K10 | MusicBrainz blocks clients that exceed 1 request per second | Lookups fail | Shared limiter; stop on 503 | P14 |
| K11 | AppImage needs FUSE on the user system | AppImage does not start | README note: `--appimage-extract-and-run` | P18 |
| K12 | Hosted Ubuntu 22.04 runners may be retired | Higher glibc floor | Build in the `ubuntu:22.04` container | P18 |
| K13 | Windows paths over 260 characters | Scan or playback errors | Fixture with a long path in Windows CI | P5 |
| K14 | Decode errors depend on Symphonia's error reporting; a cut-off file with only an estimated duration ends with no message | One damaged file in rare cases plays short with no message | D32 engine source; fixtures `truncated.mp3`, `damaged.ogg`; P7-AC3 | P7 |
| K15 | CI virtual machines differ from desktops in memory use | Gate numbers drift | Record the environment; the owner may re-measure | P3, P18 |
| K16 | Unsigned Windows binaries trigger SmartScreen | Install friction | README note; follow-up F-01 | P18 |
| K17 | Hand-built brand vectors may not meet the owner's taste | Rework | Q6 sign-off; assets swap with no code change (AC-15) | P1 |
| K18 | Two portable copies share the single-instance key | The second copy only focuses the first | Accepted behavior (section 5 "second launch") | P9 |
| K19 | shadcn/ui templates ship focus styles below 3:1 on this palette | Invisible focus | P0.10 focus rule; P2-AC14 | P0, P2 |
| K20 | The agent environment lacks native build packages | Validation cannot run locally | P0.0; section 1.2 fallback | P0 |

---

## 10. Acceptance check coverage

| Check | Subject | Verified by |
|---|---|---|
| AC-1 | Footprint spike | P3-AC2, P3-AC3, P3-AC4; final P18-AC6 |
| AC-2 | Responsiveness during the first scan | P6-AC6 |
| AC-3 | Playlist interop | P11-AC9 |
| AC-4 | Import of real exports | P12-AC6 (needs Q5) |
| AC-5 | Lyrics through the cleaned title and duration | P15-AC1 |
| AC-6 | Artwork normalization, Set cover, Retry lookup | P14-AC3, P10-AC5, P14-AC7 |
| AC-7 | Theme build | P0-AC3, P18-AC9 |
| AC-8 | Missing folder | P5-AC12, P9-AC10 |
| AC-9 | Cache rebuild | P5-AC8, P9-AC10, P11-AC11, P14-AC8 |
| AC-10 | Audio device unplugged | P7-AC4 |
| AC-11 | Docking per Library mode survives restart | P2-AC2, P9-AC2 |
| AC-12 | Built-in layouts, tabbed group survives restart | P2-AC4, P9-AC3 |
| AC-13 | Transport hidden: keys and media keys; Reset layout | P7-AC5, P8-AC4, P9-AC5 |
| AC-14 | Library cannot close; mode switch keeps state | P2-AC3, P2-AC5, P6-AC2 |
| AC-15 | Branding swap | P1-AC5, P18-AC9 |
| AC-16 | Reduced motion | P2-AC8, P17-AC3 |
| AC-17 | Portable copy to another drive | P9-AC7, P18-AC10 |
| AC-18 | Two-disc album order | P5-AC11, P7-AC6 |
| AC-19 | Decode error skip | P7-AC3 |
| AC-20 | First run to first song before the scan ends | P4-AC3, P7-AC10 (50,000-track library) |
| AC-21 | Embedded lyrics | P13-AC3 |

---

## 11. Proposed follow-up work (out of scope)

Phases add items here under AGENTS.md class F3. Items are proposals only.

| ID | Proposal | Reason | Raised by |
|---|---|---|---|
| F-01 | Windows code signing | Fewer SmartScreen warnings (K16). No source requires it. | Planning |
| F-02 | Keyboard resize and move of widgets | Dockview has no keyboard resize (K5). Requirements section 7 defers keyboard moves. | Planning |
| F-04 | Remove the FUSE need of the AppImage | Users without FUSE 2 need a workaround (K11). | Planning |
| F-11 | Extend the color guard to CSS named colors and color functions in `src/` (for example `color: white`, `style={{ color: "red" }}` or `rgb(0 0 0)`), with an exception for `color-mix()` over token variables. | The hex and palette rules (D34) do not catch them, so a color from outside `theme/tokens.json` can still enter the UI (design.md §10). | F-07 review |
| F-12 | Evaluate Dockview 8.5 `keyboardNavigation` (Ctrl+M keyboard docking, Ctrl+[ and Ctrl+] tab switching) as the path for F-02 (keyboard moves of widgets). It needs an owner decision, because requirements section 7 defers keyboard moves. | K5 says the dock has no keyboard path. Dockview 8.5 ships one, off by default. | P2 review |

The deferred ideas in section 7 of the requirements are not repeated here. They stay deferred.

---

## 12. Plan review record

The plan went through a two-pass critical review on October 11, 2026, before the first phase.

**Method**
- **Pass 1 (audit).** Three independent reviewers read the plan, the matrix and every source document. Each had one focus: requirement coverage and correctness (A), architecture, dependencies and executability (B), and UI, brand and accessibility (U). The author also audited the draft (S).
- **Pass 2 (challenge).** The author checked each finding against the source text, the repository and the package facts in section 6.2. Contrast claims were recomputed from `theme/tokens.json`. The missing native packages (B1) were confirmed with `pkg-config`. Confirmed findings changed the plan. Rejected findings are listed with the reason.

**Result:** 59 findings (8 S, 20 A, 19 B, 12 U). 54 confirmed and fixed. 1 confirmed in part (U8). 3 duplicates (B7, B9, B19). 1 rejected in part (B2).

| ID | Sev. | Finding | Verdict | Change |
|---|---|---|---|---|
| S1 | High | WAV rule let the decoder decide; R1 lists PCM integer, PCM float and ADPCM only | Confirmed | P5.2, D16 |
| S2 | Med | Production CSP can block the Vite dev server | Confirmed | P0.12 |
| S3 | Low | Icon script rewrote committed files on every build | Confirmed | P0.11 |
| S4 | Med | Audio device opened at startup (CI, idle memory) | Confirmed | P7.2, 6.10 |
| S5 | Low | Ogg rule named only Opus and Speex | Confirmed | P5.2 |
| S6 | Med | Turning lookups on did not start the job | Confirmed | P14.6 |
| S7 | Med | Criteria missing for empty hints, folder edits, layout window size, clamp, no network, motion, type scale, empty root | Confirmed | P2-AC12, P2-AC13, P5-AC4, P5-AC15, P9-AC8, P9-AC9, P14-AC13, P17-AC8, P17-AC9 |
| S8 | Med | R11 audio hash guard had no task | Confirmed | P5.14 |
| A1 | High | D32 dropped mid-file decode errors from R6 | Confirmed | D32 rule (b), P7.3, P7-AC3, `truncated.mp3` |
| A2 | High | AC-2 weakened to a 95th percentile; probe timed before paint | Confirmed | P6.8, P6-AC6, 6.15 |
| A3 | High | Saved queue lost after a cache delete or with the folder missing | Confirmed | P9.1, P9-AC10, P5.10, P5-AC12 |
| A4 | Med | Milestone 0 verdict ignored the 30 MB size targets | Confirmed | P3.8, P3-AC4 |
| A5 | Med | Broken `cover.jpg` or corrupt sidecar caused lookups at every startup | Confirmed | C18, D44, P14.3, P14.5, P14-AC14 |
| A6 | Med | Metadata fill had no read-only handling | Confirmed | P16.1, P16-AC8 |
| A7 | Med | Lyrics fallback search ran only on 404 | Confirmed | P15.1, P15-AC2 |
| A8 | Med | OS position and separate play and pause not verified; Windows command set not checked | Confirmed | P8-AC1, P8-AC2 |
| A9 | Med | Playlists after cache rebuild and folder change had no criterion | Confirmed | P11-AC11 |
| A10 | Low | No task said a scan runs at every startup | Confirmed | P5.3 |
| A11 | Low | File symlinks and hidden files not covered | Confirmed | P5.1, P5.12, P5-AC3 |
| A12 | Low | Import rewrote unmatched entries with normalized paths | Confirmed | P12.4 |
| A13 | Low | Queue Delete and Playlists arrow keys lacked phase criteria | Confirmed | P7-AC12, P11-AC8 |
| A14 | Low | Token count said 13 colors; the file has 14 | Confirmed | Section 4 |
| A15 | High | D20 made the heart the only way to change Favorites, against R12, R25, R26 | Confirmed | D20, P11.3, P11.5, P11-AC1, P11-AC8 |
| A16 | Med | D17 kept Space on buttons; R25 exempts only typing | Confirmed | D17, P7.11, P7-AC5 |
| A17 | Low | "Set cover" overwrite was not listed as a conflict | Confirmed | C17, Q7, D19 |
| A18 | Med | "No other file changed" cannot pass with committed generated icons | Confirmed | P1-AC5, P18.8 |
| A19 | Med | Widget minimum heights exceed the minimum window | Confirmed | D45, P2.11, P2-AC6, P9-AC9 |
| A20 | Med | First-run checks named no library size | Confirmed | P4-AC3, P7-AC10 |
| B1 | High | Native packages missing; validation set cannot run locally | Confirmed (`pkg-config`) | P0.0, section 1.2, K20 |
| B2 | High | A-law WAV is decodable, so P5-AC2 fails | Rejected in part | S1 already applied the R1 list; A-law stays unsupported by R1. P5.2 now says so. |
| B3 | High | Index ids shift on removal; queue and index ownership undefined | Confirmed | D46, 6.9, 6.10, P4.9, P7.1 |
| B4 | High | P4 needed seeds, generator, double-click and a test output from later phases | Confirmed | P4.8, P4.9, P4.11, P4.12, P5.11, P5.13, P7.12 |
| B5 | Med | Spike sent all rows to the frontend, against D14 | Confirmed | P3.1, P3.3, P6.1, P6.7 |
| B6 | Med | A manual-only workflow cannot run from a phase branch | Confirmed | P3.6, 6.17 |
| B7 | Med | Queue dropped at startup | Duplicate of A3 | |
| B8 | Med | P14-AC1 tested a P15 feature | Confirmed | P14-AC1 |
| B9 | Med | Corrupt sidecar and broken cover loop | Duplicate of A5 | |
| B10 | Med | Candidate check would read 50,000 files at startup | Confirmed | D44, P5.3, P5.8, P5-AC16 |
| B11 | Med | Bindings check missed new files and failed before the folder existed | Confirmed | Section 1.2, P0.4 |
| B12 | Med | CSP checked only as a string; nonce effect on styles | Confirmed | D48, P0.12, P2.15, P2-AC18, P0-AC9 |
| B13 | Med | AppImage portable marker never found | Confirmed | D47, P4.1, 6.8 |
| B14 | Med | Name guard would catch the contact URL and crate names | Confirmed | P0.8, P0.14, P0.4 |
| B15 | Med | CI lacked the e2e step, browser install and build prerequisites | Confirmed | P0.16, P2.15, 6.17 |
| B16 | Med | Gate B3 could stall P12 to P18 | Confirmed | Section 1.1 rule 1, B3, P11.9, P18 |
| B17 | Low | Window minimum placed in the wrong file | Confirmed | P2.11 |
| B18 | Low | `?perf` URL flag cannot be passed to the app | Confirmed | P6.8 |
| B19 | Low | Generated icons break "no other file changed" | Duplicate of A18 | |
| U1 | High | shadcn focus styles fall below 3:1 | Confirmed | P0.10 focus rule, P2.14, P2-AC14, K19 |
| U2 | High | Active row in a virtual list has no visible focus | Confirmed | 6.16, P6.6, P6-AC5 |
| U3 | High | Selected rows, pressed mode and active tab used color alone | Confirmed | D10, P2.3, P2.8, P6.4, P2-AC15, P6-AC9 |
| U4 | High | Icon rim and eyes under 1 px at 16 px | Confirmed (math) | P1.2, P1-AC3, Q8 |
| U5 | High | shadcn `--primary` and `--destructive` usage broke D10 | Confirmed | D10, 6.12, P0.10 |
| U6 | Med | Seek track and thumb undefined; volume keys unverified | Confirmed | D10, 6.12, P7.7, P7-AC11 |
| U7 | Med | Tailwind and animation defaults kept 150 ms | Confirmed | P0.6, P2.14 |
| U8 | Med | Splitter and drop-zone states below 3:1 | Confirmed in part | Kept design.md §6 colors; added cursor and 2 px drag line (P2.10, P2-AC17) |
| U9 | Med | Tree ARIA, mounted active row, Playlists keys, Shift+F10 missing | Confirmed | P6.6, P11.5, P6-AC10, P7-AC12, P11-AC8 |
| U10 | Med | Forced colors arrived only in the audit phase | Confirmed | P0.7, P2.13, P2-AC16, P1.4 |
| U11 | Med | Wordmark bars under 1 px at header size | Confirmed | P1.1, P1.7, P1-AC4, P2.5 |
| U12 | Low | About lacked the wordmark; placeholder source wording; focus offset claim | Confirmed | P4.10, P1.4, 6.16 |

### 12.1 Automated review rounds on the pull request

The Codex review bot reviewed the draft (`93e65b6`, round X), version 1.1 (`c1f73fe`, round Y) and version 1.2 (`0702739`, round Z). Each comment was checked against the plan and the sources like a Pass 1 finding.

| ID | Bot label | Finding | Verdict | Change |
|---|---|---|---|---|
| X1 | P2 | Broken `cover.jpg` blocks the create-new write and repeats lookups | Already fixed in 1.1 | D44, C18 |
| X2 | P2 | Bindings check misses untracked files | Already fixed in 1.1 | Section 1.2 |
| X3 | P2 | Queue dropped while the cache rebuilds | Already fixed in 1.1 | P9.1 |
| X4 | P2 | Decode errors after a good probe are not reported | Confirmed | D32 engine source, P7.3, P7.12, P7-AC3, K14 |
| X5 | P2 | Minimum sizes cannot all fit at 800 x 560 | Already covered | D45 clamp in 1.1 |
| X6 | P2 | CI does not run the Playwright suite | Already fixed in 1.1 | P2.15 |
| X7 | P2 | AppImage portable marker | Already fixed in 1.1 | D47 |
| X8 | P2 | Embedded art read from the first song only | Confirmed | P10.1, P10-AC1 |
| X9 | P2 | Pending layout save lost on close | Confirmed | P9.3, P9-AC11 |
| X10 | P2 | Library removal guard fights `clear()` during layout changes | Confirmed | P2.3, P2.4, P2-AC4 |
| Y1 | P2 | Artwork job runs on stale cache flags before the startup scan | Confirmed | P14.6, P14-AC15 |
| Y2 | P1 | `test:e2e` required before P2 creates it | Confirmed | Section 1.2 ("from Pn" rule) |
| Y3 | P2 | Gate measured without all widgets and modes | Confirmed | P3.1, P3.5, P3-AC2 |
| Y4 | P2 | Release choice ignores tags and file names | Confirmed | D42, P16.2, P16-AC9 |
| Y5 | P2 | A file that becomes corrupt stays in the cache | Confirmed | P5.3, P5-AC4 |
| Y6 | P2 | Cancel does not abort the active request | Confirmed | P14.6, P14-AC2 |
| Y7 | P2 | Metadata fill not persisted in the cache | Confirmed | P5.3, P16.5, P16-AC3 |
| Y8 | P1 | P18 passes with failed acceptance checks | Confirmed | P18-AC12 |
| Y9 | P2 | OS artwork not republished when it arrives late | Confirmed | P10.5, P10-AC6 |
| Y10 | P1 | NOTICE covers a curated set only | Confirmed | P18.4, P18-AC7 |

Result: 20 comments. 14 confirmed and fixed in 1.2. 5 already fixed in 1.1. 1 already covered by D45.

Round Z reviewed version 1.2 (`0702739`).

| ID | Bot label | Finding | Verdict | Change |
|---|---|---|---|---|
| Z1 | P2 | A Cover Art Archive 404 after a unique match retries forever | Confirmed | P14.5 (`no-art` marker) |
| Z2 | P2 | A downloaded cover does not refresh the UI and OS panel | Confirmed | P14.5 |
| Z3 | P2 | `measure.yml` breaks when P6 removes the `fixtures` feature | Confirmed | P3.1, P6.7 |
| Z4 | P2 | Only one LRC time stamp form is removed | Confirmed | P13.2, P13-AC2 |
| Z5 | P2 | Folder change races a running scan | Confirmed | P5.9, P5-AC13 |
| Z6 | P2 | Device names with an extension pass the name rule | Confirmed | P11.3, P11-AC1 |
| Z7 | P2 | One run per mode cannot give the D28 median | Confirmed | P3.5 |
| Z8 | P2 | The writability probe writes before Confirm | Confirmed | P16.1, P16-AC8 |
| Z9 | P2 | `libraryMode` is not validated on restore | Confirmed | P9.4, P9-AC4 |
| Z10 | P2 | Lyrics files edited outside the app do not refresh after Rescan | Confirmed | P13.3, P13-AC6 |

Result: 10 comments. 10 confirmed and fixed in 1.3.

**What did not change.** All contrast ratios in sections 5.1 and 6.12 were confirmed by two reviewers. The R3 order, R4 prefix regex, R13, R14 matching, R18.1, R22, R29 and Milestone 0 thresholds were confirmed against the source. The phase order P7 to P10, P8 to P10, P7 to P11, P13 to P15 and P14 to P16 was confirmed.

**Proposed follow-up work** from the review is in section 11. F-03 was removed because A1 moved it into P7.

---

## 13. Change log

- **1.11 (October 11, 2026):** owner decision on the P3 review conflict between D13 (no file paths over IPC) and D41 (asset protocol with `convertFileSrc`): D13 wins. D41, P3.2, P3-AC5, P10.3, K9 and the section 6.13 CSP now use a `thumb://` scheme that serves file names from the thumbnail folder.
- **1.10 (October 11, 2026):** owner approved F-06, F-07 (as a source guard), F-08 and F-10. P0.15 states the row rule for `state.redActive`. D34 adds the Tailwind palette guard in `npm run check:sources`. Section 6.16 adds `color-scheme: dark`. `scripts/contact-sheet.sh` (`npm run contact-sheet`) builds the P1.7 contact sheet. The four proposals left section 11.
- **1.9 (October 11, 2026):** owner signed off the brand after P1 (Q6 closed). Owner chose F-09 option (b) for B7: P1-AC4 checks wordmark bar separation at the 72 px README height, and the 20 px rule keeps only the bar width. F-09 left section 11.
- **1.8 (October 11, 2026):** owner answered Q5 (supply the formats they have), Q6 (review after P1; P2 waits), Q7 (ask, then replace), Q8 (simple icon for 16 and 24 px only if needed), B5 (Windows machine only) and B2 (raise the target over 300 MB, new D49).
- **1.7 (October 11, 2026):** owner approved F-05: P2.15 keeps all e2e mock code and data in `tests/e2e/`, and P2-AC19 checks it. Owner answered Q1: keep "Dr. Claw Development" and accept K7.
- **1.6 (October 11, 2026):** owner kept D35. Added C19 (the `fixtures` feature is an approved exception to `AGENTS.md` Edits rule 9, "Mock data only in tests"). P0.1 test rules name the exception. Traceability row AGT-3 added. Follow-up F-05 proposed.
- **1.5 (October 11, 2026):** `AGENTS.md` supplied by the owner. TWO-PASS REVIEW and finding classes added to it. P0.1 now extends the file instead of creating it. B1 closed. Closed Q2 and Q3 removed from the open items in the traceability matrix. C4 and C10 now record the Q2 and Q3 answers. AGT-1 and AGT-2 stay Planned until P0-AC7 passes.
- **1.4 (October 11, 2026):** owner answered Q2 (keep the identifier in D2) and Q3 (bundle Geist Sans as in D7). Both questions are closed.
- **1.3 (October 11, 2026):** automated review round Z applied (section 12.1). Added P13-AC6 and tightened P3, P5, P6, P9, P11, P13, P14 and P16.
- **1.2 (October 11, 2026):** automated review rounds X and Y applied (section 12.1). Revised D32, D42 and K14. Added P9-AC11, P14-AC15 and P16-AC9 and tightened P3, P5, P10, P14, P16 and P18 criteria.
- **1.1 (October 11, 2026):** two-pass review applied (section 12). Added C17, C18, D44 to D48, Q7, Q8, K19, K20, tasks P0.0, P4.11, P4.12 and new criteria in P2, P5, P6, P7, P9, P11, P14 and P16. Revised D10, D17, D19, D20 and D32.
- **1.0 (October 11, 2026):** first version. Built from requirements v1.5, `design.md`, the branding prompt, the asset manifest and `theme/tokens.json`, with package facts checked on the same date.
