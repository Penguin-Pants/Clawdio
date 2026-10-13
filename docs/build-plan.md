# Clawdio Build Plan

**Version:** 1.24, October 13, 2026 (UI shell rework plan added as phases U0 to U7 in `docs/planning/ui-shell-rework-build-plan.md`).
**Status:** In execution. Section 2 gives the phase status.
**Scope:** Clawdio v1, as the source documents in section 3 define it, plus the requirements v1.6 additions (P19, P20) and the v1.7 additions (P22, P23).
**Companion file:** `docs/requirements-traceability.md`. It maps each source requirement to a task, an acceptance criterion and a verification method.

**Bottom line**
- Status (October 12, 2026): P0 to P17 and P19 to P21 are Done or Done with exceptions. P18 stays In progress: B3 (Windows playlist interop) and B5 (manual Windows, Ubuntu desktop and Debian checks) need the owner. Section 2 has the details.
- Requirements v1.7 adds P22 (Library frame splitters, Done with exceptions) and P23 (bar widgets and Windows build, Done with exceptions: the owner's Windows check P23-AC7 remains).
- The plan has 24 phases (P0 to P23). P19, P20 and P21 come from requirements v1.6. P22 and P23 come from requirements v1.7. P21 repeats the release checks on the final product. P3 is a footprint gate (Milestone 0) before feature work, as R20 requires.
- The first end-to-end player (choose a folder, see songs, play one) arrives in P4. Brand assets arrive in P1 and the themed shell in P2. Branding is part of the build from the start.
- Open owner items: B3, B5, the manual Windows rows of `docs/release-checklist.md`, and the F-proposals in section 11.

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
| P4 | End-to-end slice | P3 | Done with exceptions |
| P5 | Library scan and cache | P4 | Done with exceptions |
| P6 | Library widget and search | P5 | Done with exceptions |
| P7 | Playback engine and Play queue | P6 | Done with exceptions |
| P8 | OS media integration | P7 | Done with exceptions |
| P9 | Persistence: state, arrangement and instance | P8 | Done with exceptions |
| P10 | Local artwork and thumbnails | P9 | Done with exceptions |
| P11 | Playlists and Favorites | P10 | Done with exceptions |
| P12 | Playlist import | P11 | Done with exceptions |
| P13 | Local lyrics | P12 | Done |
| P14 | Online lookups and artwork fetch | P13 | Done |
| P15 | Lyrics fetch | P14 | Done |
| P16 | Metadata fill | P15 | Done |
| P17 | UI quality audit | P16 | Done with exceptions |
| P18 | Release readiness | P17, gate B3 closed | In progress |
| P19 | Bulk import and missing-song repair | P18 (waived, section 13 v1.14) | Done with exceptions |
| P20 | Microphone ducking (Windows) | P19 | Done with exceptions |
| P21 | Release readiness after v1.6 | P20 | Done with exceptions |
| P22 | Library frame splitters | P21 | Done with exceptions |
| P23 | Bar widgets and Windows build | P22 | Done with exceptions |
| U0 to U7 | UI shell rework (transport band, docking, splitters, Library table) | P23 | In progress (U0 to U4 Done). Plan: `docs/planning/ui-shell-rework-build-plan.md`. Source: `docs/planning/ui-shell-rework.md`. |

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
- **Packages:** `@tanstack/react-virtual` 3.14.15, `unicode-normalization` 0.1.25, `thiserror` 2.0.21, `image` 0.25.10 (`jpeg`, only with `fixtures`). The Tauri feature `protocol-asset` was added and then removed with the `thumb://` scheme (D41, 1.11).

| Criterion | Result | Evidence |
|---|---|---|
| P3-AC1 | Pass (Linux, Xvfb) | Fixtures build in each mode with all six widgets populated (`CLAWDIO_MEASURE_MODE`). Browser: `tests/e2e/milestone.spec.ts` (Songs list to its end, filters, tree expansion, axe). Rust: `src-tauri/src/fixtures.rs` tests (50,000 songs, 2,000 thumbnails, widget data). |
| P3-AC2 | Pass | `docs/milestone-0.md`. Linux: 468 MB (agent container) and 390 MB (CI runner). Windows: 112 MB (`measure.yml` run 38171140952). Worst mode medians, all six widgets, environments recorded. |
| P3-AC3 | Pass | `.deb` 3.3 MB (local). NSIS installer 2.2 MB (`measure.yml` run 38169331542). |
| P3-AC4 | Pass | Linux over 300 MB: target raised to 468 MB (D49). Windows 112 MB: pass, keeps 200 MB. Both bundles under 30 MB. |
| P3-AC5 | Pass | Thumbnails load from the cache folder (`~/.cache/...` on Linux) through the `thumb://` scheme (D41 as changed in 1.11). The measurement ready signal waits for the Now playing thumbnail to decode, so every `measure.yml` run checks it on Linux and Windows (run 38172605144 on `e896960` passed on Linux and Windows). Rust test `src-tauri/src/thumbs.rs`: only plain `.jpg` names inside the folder are served. |

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

#### P4. End-to-end slice (October 11, 2026)

- **Status:** Done with exceptions.
- **Commits:** branch `clawd/determined-ramanujan-3gm3n1`, from `e896960`. Messages start with `P4:`.
- **Packages:** `walkdir` 2.5.0, `lofty` 0.25.4, `rusqlite` 0.40.2 (`bundled`), `tempfile` 3.27.0, `rodio` 0.22.2, `symphonia` 0.5.5, `tauri-plugin-log` 2.10.1, `tauri-plugin-dialog` 2.8.2, `tauri-plugin-opener` 2.7.1, `@tauri-apps/plugin-log` 2.10.1. Dev only: Tauri feature `test`.

| Criterion | Result | Evidence |
|---|---|---|
| P4-AC1 | Pass | `tests/e2e/first-run.spec.ts`: the notice names the three services and the three file kinds; the choice is saved and the notice does not show again. Manual Linux: the notice shows on a fresh portable profile; "Keep off" writes `onlineNoticeDone: true`. |
| P4-AC2 | Pass | `tests/e2e/first-run.spec.ts` and `layouts.spec.ts` (P2-AC12): "Choose music folder", disabled transport, widget hints. |
| P4-AC3 | Pass (Linux, Xvfb) | 50,000 tracks from `gen_test_library`, release build, cold page cache: the Songs list fills while the status line shows "Scanning: 9500 files"; a double-click plays before the scan ends; Pause and Stop change the state. Rust: `player/mod.rs` tests with the test output (order, pause, stop, skip, three failures). |
| P4-AC4 | Pass (Linux) | `portable` next to `target/release/clawdio`: `data/config/settings.json`, `data/cache/library.sqlite`, `data/logs/app.log` and `data/webview/`. No new file under `~/.config`, `~/.cache` or `~/.local/share`. Windows: not verified (E2). |
| P4-AC5 | Pass | `src-tauri/src/lib.rs` test: the real log setup with a 200-byte limit rotates and keeps five old files. |
| P4-AC6 | Pass | `settings.rs` tests. Manual Linux: `{ not json` gives defaults and `WARN settings: corrupt settings file ...; using defaults` in `app.log`. |
| P4-AC7 | Pass (Linux, Xvfb) | Resized to 1000 x 700, restarted: the window opens at 1000 x 700. `window.rs` tests. |

**Notes**

- N1: `SettingsView` carries the music folder's name, not its path (D13). Settings shows the name.
- N2: one scan runs at a time. A new scan waits until the canceled one stops, so the old one cannot write after a fresh scan clears the index.
- N3: without the cache (cannot open), the scan still fills the index and logs a warning (D14).
- N4: the portable `config` and `cache` folders appear on the first write (notice answer, first scan).
- N5: `docs/file-formats.md` holds the `settings.json` schema.

**Exceptions**

- E1: manual checks ran in a container under Xvfb with the ALSA null device. The null device plays faster than real time, so the sound and the elapsed time were not checked by ear. P7-AC4 and P18 test on a desktop.
- E2: P4-AC4 on Windows is not verified (no Windows desktop; the plan allows "not verified").
- E3: WebKit e2e runs only in CI (no WebKit build in the container).

**Blockers:** none.

**TWO-PASS REVIEW:** F1 0, F2 6, F3 1, F4 4.

- F2: a double-click on a row selected its text (rows are now `select-none`). Overlapping scans could write old rows after a fresh clear (scan gate). A cache open failure stopped the scan (scan without cache). `SettingsView` sent the absolute music folder path (D13; now the name). A minimized window could save 0 x 0 (not saved now). A late start read could overwrite a newer `player-state` event (dropped now).
- F3: F-13 (Tree data per visible window), raised by the Codex review of `e896960`.
- F4:
  - A device error stops the queue: P7.4 sets this rule and adds the message.
  - `library-changed` comes only at 500-file batches: the P4.7 batch rule.
  - A row fetch for ids from before a fresh scan fails: the hook clears its pending ids, and the new ids load after the refresh.
  - Windows drive-letter case in `relative_to`: both paths come from OS APIs in canonical form, and the fallback is a valid absolute path.

**Follow-ups:** F-13.

---

#### P5. Library scan and cache (October 11, 2026)

- **Status:** Done with exceptions.
- **Commits:** branch `clawd/determined-ramanujan-3gm3n1`, from `2300ac4`. Messages start with `P5:`.
- **Packages:** `symphonia` 0.5.5 (`wav`, `pcm`, `adpcm`) and `image` 0.25.10 (`jpeg`, `png`) in the core. Cache schema version 3.

| Criterion | Result | Evidence |
|---|---|---|
| P5-AC1 | Pass | `tests/scan.rs` golden test against `tests/golden/fixture-tree.json` (fixture tree from `tests/common/tree.rs`). |
| P5-AC2 | Pass | Opus and A-law: unsupported codec. `corrupt.mp3`: corrupt file. MP3 data in a `.wav`: unsupported type. `notes.txt` not counted. One log line each (log capture). |
| P5-AC3 | Pass (Linux) | Hidden names skipped. The folder link loop is not entered. A link to a file is scanned. |
| P5-AC4 | Pass | Cancel removes nothing. A complete scan removes a missing file and a file that became corrupt. A missing root removes nothing. An empty root removes all. |
| P5-AC5 | Pass (Linux, manual) | Rescan pressed at "Scanning: 17500 files" during the startup scan: one scan in the log. |
| P5-AC6 | Pass | Manual Linux: status line "Scan complete: 50000 added, 0 removed, 0 skipped" and `lastScan` in `settings.json`. E2E: Settings shows the last counts. |
| P5-AC7 | Pass | A second scan reads no file, also after a restart; skipped files count again without a read (`ScanReport.read`). Manual: restart of 50,000 tracks, "0 read". |
| P5-AC8 | Pass | The cache fills a new index with the same library; a deleted cache rebuilds it. |
| P5-AC9 | Pass | Another `user_version` deletes and rebuilds the file (unit and integration tests). Manual: the P4 cache (version 1) was rebuilt. |
| P5-AC10 | Pass | `library/title.rs` tests and the golden file ("01 - ", "02. ", "1-03 ", "004_"; "1984" stays). |
| P5-AC11 | Pass | Golden file: disc tags win over folder order; without tags "Disc 2" comes before "Disc 10". |
| P5-AC12 | Pass with exception | Manual Linux: "Music folder not found: lib50k" and "Change folder"; the cache file is unchanged. E2E: Change folder leads to the library. The native picker step did not run (E1). |
| P5-AC13 | Pass | Core test: a canceled old scan, a clear and a new scan leave only new paths in the index and the cache. App: one scan at a time (gate), and the player queue clears before the index (`Command::Clear`). |
| P5-AC14 | Pass | Non-ASCII names in the golden file. A name that is not valid UTF-8 is skipped and logged once. The path over 260 characters passes in Windows CI (`p5_ac14_...`, run on `402c5fd`). |
| P5-AC15 | Pass | A file added after a scan appears only after the next scan. |
| P5-AC16 | Pass | Cover state none, valid and broken and the embedded picture flag are cached; a restart decodes no cover; a changed cover decodes again. |

**Notes**

- N1: IMA ADPCM WAV: lofty 0.25.4 cannot parse it, Symphonia decodes it. Such a file is a track without tags, with the Symphonia duration (R1).
- N2: P5.10 asks for "<path>" in the message. D13 wins (as in 1.11): the message shows the folder name.
- N3: the generator takes `--edge-cases` and `--covers N` (P5.13), with a test.
- N4: `truncated.mp3` and `damaged.ogg` scan as tracks; their decode errors belong to P7.
- N5: a part of the folder that cannot be read makes the scan "incomplete": nothing is removed.

**Exceptions**

- E1: the GTK folder picker under Xvfb lists no files, so the picker step of P5-AC12 did not run. P4 uses the same command.
- E2: P5.3 sidecar part: the scan does not read `sidecar.json` yet. The sidecar reader comes in P14.3 and the R4 sidecar step in P16.6. Those phases add the stamp check.
- E3: the Windows-only tests (long path) run in CI only; they passed on `402c5fd`.

**Blockers:** none.

**TWO-PASS REVIEW:** F1 1, F2 17, F3 0, F4 9. Sources: own audit, a reviewer agent and the Codex review of `febbf71`.

- F1: skipped files were read again at every scan (P5-AC7). The index and the cache (`skipped` table, schema 3) now keep their stamp and reason.
- F2, scan: a broken file link made every scan incomplete, so nothing was ever removed (now skipped and logged). A file that could not be opened counted as corrupt and lost its track (now the scan is incomplete and keeps it). Recording a skipped file removed its track before the removal count. A changed file got a new id; it now keeps its id (D46 rationale). IMA ADPCM WAV counted as corrupt (Symphonia fallback). Cover files decoded under the index write lock (now outside it). "1-01 " as a whole name became "01 ". A folder change kept old album thumbnails.
- F2, cache and jobs: a corrupt `library.sqlite` was never rebuilt (now deleted and created again). Canceling a waiting folder change skipped the clear. The old folder's playback stopped only after the root changed. Two quick Rescans could both start, and a panic left Rescan blocked (atomic claim and a drop guard). A canceled or failed scan replaced the last counts.
- F2, Codex review of `febbf71` (P4 code): a drive or root folder sent its path as the name (now a label). A failed settings save still changed the live settings. Handled e2e mock commands fell through and threw. The plan named the removed `protocol-asset` feature.
- F4:
  - Transport controls stay enabled when the folder is missing: the queue is empty, and P7 handles play errors.
  - Song order sorts per call: 50,000 songs sort in milliseconds; P6.1 finishes the queries.
  - Windows junctions: std reports them as links, so the walk reads them through and skips folders.
  - The P5-AC13 test clears by hand: the job order needs a Tauri runtime; the code path is reviewed and the player clear is tested.
  - No test for the "part of the folder unreadable" branch: tests run as root, so permissions do not apply.
  - P5-AC15 cannot fail: there is no watcher, and the test records that behavior.
  - The hash guard finds nothing to catch in P5: the scan never writes. Later phases that write use it (R11).
  - The golden file came from the implementation: it was reviewed line by line against R3 and R4 before commit.
  - Real folders named "Unknown Artist" or "Unknown Album" sort with the unknown groups; lofty also reads embedded pictures for the flag (a 50,000-track cold scan took 9 s in the container; P6-AC6 measures).

**Follow-ups:** none.

---

#### P6. Library widget and search (October 11, 2026)

- **Status:** Done with exceptions.
- **Commits:** branch `clawd/determined-ramanujan-3gm3n1`, from `402c5fd`. Messages start with `P6:`.
- **Packages:** none added. `image` left `src-tauri` with the `fixtures` feature.

| Criterion | Result | Evidence |
|---|---|---|
| P6-AC1 | Pass | `tests/e2e/library.spec.ts`: All rows, Artist filters Album, Album filters Songs, Top/bottom and Tree. |
| P6-AC2 | Pass | E2E: Tree and back keeps the artist, album, song and search text. |
| P6-AC3 | Pass | E2E: "beyonce" finds "Beyoncé"; an album name match shows all its songs; "hold" shows one. Rust: `tests/library.rs` on the scanned fixture tree ("BJORK", "debut", the Tree rule). |
| P6-AC4 | Pass | E2E: double-click and Enter play the Songs list as shown; an album row plays from its first song; in Tree a song plays its album from that song. |
| P6-AC5 | Pass | E2E: Up, Down, Enter, Ctrl+F, Esc; the active row has a 2 px inset outline and `aria-activedescendant`; after a wheel scroll Down moves from the active row; Tree Right, Left, `aria-level`, `aria-expanded`, `aria-selected`. A mutation (no move) fails the test. |
| P6-AC6 | Exception (E1) | Manual Linux (Xvfb, software rendering), release build, first scan of 50,000 tracks with `CLAWDIO_PERF=1`, select, play, 30 Down keys: maximum 104 ms (1 of 28 events over 100 ms), then 48 ms and 64 ms in two more runs. Without a scan: 56 ms. Windows: not verified. |
| P6-AC7 | Pass | E2E: "Song 3" shows "Artist 00 feat. Guest". |
| P6-AC8 | Pass | `src-tauri/src/fixtures.rs`, the feature and its CI steps are gone. `CLAWDIO_MEASURE_MODE` and the mocks stay. |
| P6-AC9 | Pass | E2E: the selected row's left edge reads over 100 brighter in grayscale. |
| P6-AC10 | Pass | E2E: Shift+F10 and the ContextMenu key open the menu at the active row; Play plays; Esc returns focus to the list. |

**Notes**

- N1: the context menu has "Play" only. P7 adds "Add to queue", P11 "Add to playlist".
- N2: the measurement (P6.7) runs a portable release build (`scripts/measure-setup.mjs`) on the generated library with `--edge-cases --covers 2000`. The ready signal waits for the six widgets, Library rows and the end of the startup scan (`scan_running`, D28). The queue, playlists, lyrics and Now playing art have no data until P7, P9, P11 and P13. A short local run (10 s idle): 477 to 499 MB.
- N3: WebKitGTK 2.52 supports the Event Timing API, so the probe uses it on Linux too; the next-frame message is the fallback. Event Timing reports only events of 16 ms or more, so listeners count every input.
- N4: `SetQueue` and `set_album_thumb` went with the fixtures. P9 and P10 add their own.
- N5: the e2e mock library gained "Beyoncé" and folds accents like `fold` (D4).

**Exceptions**

- E1: P6-AC6 passed in 2 of 3 Linux runs in a container with software rendering (K15). P17 and P18.5 repeat it on desktops; Windows is not verified.

**Blockers:** none.

**TWO-PASS REVIEW:** F1 3, F2 11, F3 0, F4 7. Sources: own audit and a reviewer agent (its fixes are in the commit after `05b430c`).

- F1: a song selected under "All" in Columns did not show in Tree (P6-AC2); Tree now opens the artist and album of the selection. In Tree and on album rows the queue was the search-filtered list; R6 says "its album", so the whole album plays (P6-AC4). Ctrl+F did nothing when Library was a hidden tab (P6-AC5); the focus now waits for the tab body.
- F2: the debounced search could drop keys. The probe logged nothing when all events were fast under Event Timing. Right-click on a Tree row opened or closed it. The menu returned focus to a wrapper, not the list. A search that hid the selected artist or album kept filtering the other lists (now "All" is selected). The row cache kept old rows after a rescan (D46 keeps ids). Ctrl+F and Ctrl+Shift+L matched the physical key, not the typed letter (AZERTY, Dvorak). Page Up and Page Down moved 10 rows, not a page. The probe test had no Event Timing case and no slow count.
- F4:
  - An album selected outside the filtered list made "All" active: now the selection moves to "All" (F2 above).
  - The context menu has no trigger element: Base UI positions it at the row; focus returns to the list (tested).
  - `library_tree` returns the whole structure: P6.1 defines it so; F-13 waits for the owner.
  - `library-changed` refetches the id lists twice per second during a scan: section 6.9 allows it; P6-AC6 measured the cost.
  - Tree Right on an open node with no children: the tree builder always yields children.
  - The measurement readiness has no race: `start_scan` counts the startup scan before the UI asks `scan_running`.
  - Older plan text names the `fixtures` CI steps: it is the P3 record of that time.

**Follow-ups:** F-13 (open).

---

#### P7. Playback engine and Play queue (October 11, 2026)

- **Status:** Done with exceptions.
- **Commits:** branch `clawd/determined-ramanujan-3gm3n1`, from `5f7b559`. Messages start with `P7:`.
- **Packages:** none added. `rodio` keeps only `playback`: the engine decodes with its own Symphonia source, so the rodio decoder features went.

| Criterion | Result | Evidence |
|---|---|---|
| P7-AC1 | Pass | `crates/clawdio-core/src/queue.rs`: one named test per P7.1 rule (repeat off, all, one; shuffle; shuffle off; Previous; remove playing, remove earlier; clear; append during shuffle) and a property test over 299 seeds and four rounds with repeat all that shuffle plays every entry once before a repeat. Engine: `player/engine.rs` tests for repeat all and one. |
| P7-AC2 | Pass | `engine.rs` `stop_ends_playback_resets_the_position_and_keeps_the_queue`. |
| P7-AC3 | Pass | `engine.rs`: `corrupt.mp3` shows "Cannot play corrupt.mp3" and the next entry plays; three failures in a row stop; a good file resets the count; `truncated.mp3` and `damaged.ogg` show "Cannot play <file name>" at their early end and the next entry plays; `tone-vbr.mp3` (no Xing header) plays to its end with no message. `source.rs`: rule (b) counts bad packets. See N2. |
| P7-AC4 | Exception (E1) | `engine.rs` `a_lost_device_stops_with_the_message_and_play_tries_again` with the test output. No device can be unplugged in the container. |
| P7-AC5 | Pass | `tests/e2e/playback.spec.ts`: Space toggles with Transport hidden; after a click on Next, Space sends one toggle and no second Next; Space types in the search field. Unit: `src/lib/keyboard.test.ts` (buttons, key repeat, text fields, range inputs, menus, dialogs). Manual Linux: Space paused and resumed the release build. |
| P7-AC6 | Pass | `query.rs` `songs_order_by_disc_then_track_then_file_name`; an album row plays its song ids in that order (P6-AC4); the engine plays the queue in order (`plays_the_queue_in_order_and_stops_after_the_last_entry`). |
| P7-AC7 | Pass | E2E: "Add to queue" appends (50 to 51 songs), the status line shows "Added to queue", the playing song stays; Play from the menu replaces the queue; "Add to playlist" is disabled. |
| P7-AC8 | Pass | E2E: the grayscale mean of Shuffle and Repeat changes by more than 3 when on (red icon and 4 px dot); repeat one shows the `Repeat1` icon. |
| P7-AC9 | Pass | E2E: Right Arrow on the focused seek slider seeks to 84 s; End and Home seek to the end and 0; times use `tabular-nums`. |
| P7-AC10 | Exception (E2) | Manual Linux, release build, 50,000 generated tracks: a double-click 2 s after start played the first song in the same second the scan ended. |
| P7-AC11 | Pass | E2E: arrows, Home and End on both sliders; `aria-valuetext` "1:23 of 2:04" and "Volume 79 percent"; the 12 px thumb at position 0; `VolumeX` at 0. |
| P7-AC12 | Pass | E2E: Up and Down select in the Play queue; Delete removes the entry; the menu Remove and Clear queue work. |

**Notes**

- N1: the engine is in `player/engine.rs` (P7.2); `player/mod.rs` keeps the thread, the handle and the `PlayerEvents` trait. `PlayerEvent` went: `player-state` and `queue-changed` are separate events.
- N2: `damaged.ogg` reaches rule (c), not rule (b) as P7-AC3 says. Symphonia 0.5.5 drops Ogg pages with bad audio and decodes garbage with no error, so no seed file triggers rule (b). The rule is a unit test on the packet counter (`source.rs`). Both damaged seeds are 6 s tones that end over 2 s early.
- N3: rule (c) uses only a stated length: MP3 needs a Xing, Info or VBRI tag, else Symphonia estimates and the check is off (D32). New seed `tone-vbr.mp3` (1.5 KB) covers it.
- N4: a buffer underrun from the device does not stop playback; other stream errors do (P7.4). Each command first checks for a lost device. A device that dies in the moment between that check and a seek can still block the seek, because rodio's `try_seek` waits for the mixer thread with no timeout (rodio 0.22.2 `player.rs:247`).
- N5: Transport controls are disabled with an empty queue (P7.7), so P4-AC2's check after "Choose music folder" now expects Play disabled. P2-AC7's "no red at rest" scan skips Transport controls, whose play ring, slider ranges and thumbs are red indicators by D10 (3).
- N6: the Library menu has Play, Add to queue and a disabled Add to playlist on song, album and artist rows. The e2e build has a mock player (`tests/e2e/mock-player.ts`) that sends the real events.
- N7: the traceability coverage summary was recounted from the rows. Earlier phases had changed row statuses but not the counts.

**Exceptions**

- E1: P7-AC4 needs a real device. The device path ran only in the unit test. Manual on Windows and Linux desktops in P18.
- E2: P7-AC10: the container scan of 50,000 tracks takes about 2 s with a warm page cache, so play during the scan was not shown. P4-AC3 showed play during a cold scan. Not checked by ear (P4 E1).

**Blockers:** none.

**TWO-PASS REVIEW:** F1 1, F2 11, F3 0, F4 12. Sources: own audit (in `b18d5d0`) and a reviewer agent (fixed in the next commit).

- F1: Add to queue on an empty queue left no current entry, so Play played one song and stopped (`Queue::append` now makes the first new entry current).
- F2:
  - Own audit: a buffer underrun stopped playback like a lost device (N4). Unused TypeScript wrappers for `player_play` and `player_pause` (removed; the commands stay for P8). Unused rodio decoder features (removed).
  - Reviewer: a device lost while paused, or between ticks, could block the player thread in `Player::clear` or `try_seek` (each command now checks the device first, and a new `Player` replaces `clear`). `queue_get` and `player_state` could block the main thread (now async). An ID3 tag over 16 KiB (cover art) hid the Xing tag, so rule (c) was off. A rule (b) or (c) error that arrived between the error check and the end check was lost (the tick now reads the end first). A device lost while idle needed two Play presses. After repeat all wrapped, Previous on the first entry restarted it instead of going to the last entry played. Removing the playing entry with shuffle and repeat all stopped when the cycle had ended. Two tests passed with the rule inverted: the VBR seed now asserts no stated length, and the e2e test checks that Play replaces the queue count.
- F4:
  - A decode error and the end callback in the same tick: the source sends the error before the end callback runs (and the tick now reads the end first).
  - Repeat one with a file that fails at its end: the engine moves on with Next, and the failure count still stops a loop.
  - Space on a focused button presses it on key up: the capture handler also takes key up.
  - Seek before a file plays: the engine ignores it (tested).
  - `Queue::next` shares the iterator method name: the plan names it; clippy's lint is allowed there with the reason.
  - Removing the playing entry while paused starts the next entry: R6 says "starts the next entry".
  - A stale end callback could mark the new file ended: each `load` makes a new flag.
  - A paused player could block a seek: the mixer still runs while paused.
  - A keyboard seek might not commit: Base UI commits on each key change.
  - Space against D17: text fields, menus, dialogs and select popups keep Space (unit and e2e tests).
  - D13: IPC carries ids and indexes; messages carry the file name only.
  - The three-failures count: it resets only on a normal end or a user action.

**Follow-ups:** F-13 (open).

---

#### P8. OS media integration (October 11, 2026)

- **Status:** Done with exceptions.
- **Commits:** branch `clawd/determined-ramanujan-3gm3n1`, from `7596b11`. Messages start with `P8:`.
- **Packages:** `souvlaki` 0.8.3 with default features (D39). `dbus` 0.9.12 on Linux, the version souvlaki already uses (N2).

| Criterion | Result | Evidence |
|---|---|---|
| P8-AC1 | Not verified (E1) | No Windows desktop. The window handle goes to souvlaki (P8.1). The Windows CI job failed clippy on `ed0b76a` (an unneeded cast); the fix is in the next commit. |
| P8-AC2 | Pass with exception (E2) | Manual Linux (Xvfb, a private D-Bus session, release build): `playerctl -l` lists `io_github_penguinpants_clawdio`; `play`, `pause`, `play-pause`, `next`, `previous` and `stop` changed the app, and the app showed the same song and state; `playerctl metadata` showed title, artist and album. Unit: `media_controls.rs` (event map, D-Bus name, metadata on track change, state, position once per second). |
| P8-AC3 | Pass | Manual Linux: with `DBUS_SESSION_BUS_ADDRESS=unix:path=/nonexistent` the log has "media: cannot attach the media controls" and a double-click plays. |
| P8-AC4 | Exception (E1) | OS events go straight to the player thread (`media_controls.rs` `attach`); no widget is involved. Manual Windows not done. |
| P8-AC5 | Pass (Linux) | Manual Linux: a close request (`WM_DELETE_WINDOW`) to the main window ended the process, with and without D-Bus, and the MPRIS entry went away. Windows not verified. |

**Notes**

- N1: the controls live on the main thread (Windows ties them to the window). Player events reach them through `run_on_main_thread`. Metadata goes out on each track change, the state on each state change, and the position once per second while playing. MPRIS reads the last position, so it stays within about 1 s of the app.
- N2: souvlaki 0.8.3's D-Bus thread handles one update per loop, and its loop waits up to 1 s for a D-Bus message. With one position update per second the updates queued up and the OS state fell behind. A `media-wake` thread reads `PlaybackStatus` once per update, which ends that wait. D39 stays as decided.
- N3: no cover before P10 (P8.3).
- N4: rodio's note on stderr when the sink closes is off.

**Exceptions**

- E1: no Windows desktop: P8-AC1, P8-AC4 and the Windows part of P8-AC5 are for P18 manual checks.
- E2: P8-AC2 position: the ALSA null device plays faster than real time, so `playerctl position` against the app clock was not measured. By design the gap is at most the 1 s update interval.

**Blockers:** none.

**TWO-PASS REVIEW:** F1 3, F2 2, F3 1, F4 13. Sources: own audit and a reviewer agent.

- F1: souvlaki's D-Bus thread fell behind by one update per second, so the OS state lagged the app (N2, fixed with the wake thread).
- F2: rodio printed a note on stderr at each exit (N4).
- Reviewer agent (fixed in the commit after `ed0b76a`): F1: the HWND cast failed Windows clippy (CI red on `ed0b76a`); the record claimed a Windows CI pass that had not run. F2: a seek while paused did not reach the OS position until the next state change (the engine now announces the state on each seek; tested). F3: F-14 (no MPRIS `Seeked` signal on an app seek).
- F4:
  - The player thread reads the library lock for metadata: the scan holds the write lock only briefly per batch.
  - A souvlaki thread that stops makes the next update fail: the app logs it once and stops sending.
  - The wake read after the controls went away: it fails and is logged at debug level.
  - D34: the display name comes from the package info and the D-Bus name from the identifier.
  - Exit: `RunEvent::Exit` runs on the main thread, where the controls live, and detaches them.
  - Reviewer, none hold: main-thread re-entry, souvlaki's `unwrap` on a wake read, a wake deadlock, an exit hang, a missing window handle, the lowercase name in a test (D34 is case sensitive), lock order, and tests that pass inverted.

**Follow-ups:** F-13 (open).

---

#### P9. Persistence: state, arrangement and instance (October 11, 2026)

- **Status:** Done with exceptions.
- **Commits:** branch `clawd/determined-ramanujan-3gm3n1`, from `5f7c1ef`. Messages start with `P9:`.
- **Packages:** `tauri-plugin-single-instance` 2.5.3 (section 6.2).

| Criterion | Result | Evidence |
|---|---|---|
| P9-AC1 | Pass | `state.rs` tests: round trip, capture and resolve, missing entries dropped after a complete traversal, a missing current entry. `engine.rs`: a restored queue is paused at the saved position, and Play starts there. Manual Linux (release build, 50,000 tracks): after a restart the queue (50,000 entries), the current song and the Tree mode came back, paused. |
| P9-AC2 | Pass | `tests/e2e/persistence.spec.ts`: in each mode a hidden Transport, a shown Play queue and the Library width survive a reload. |
| P9-AC3 | Pass | E2E: a tabbed group survives a reload. Each built-in layout applies (P2-AC4). |
| P9-AC4 | Pass | `src/shell/persistence.test.ts` with fixture files: corrupt JSON, version 2, an unknown and a missing `libraryMode`, a file without Library and a dock that cannot load apply Columns with one log line; an unknown widget is removed with one log line. |
| P9-AC5 | Pass | E2E: Ctrl+Shift+L after a reload with a saved layout restores the default. |
| P9-AC6 | Pass (Linux) | Manual Linux: a second launch exited with code 0 and one process remained. Windows not verified (E1). |
| P9-AC7 | Exception (E1) | Manual Linux: `state.json` and `layout.json` are in `data/config` of the portable folder. The copy to another drive letter is Windows only. |
| P9-AC8 | Pass | Vitest: the saved object has `version`, `libraryMode` and `dock` only. N2. |
| P9-AC9 | Pass | E2E: a layout saved at 1600 x 1000 with six widgets restored at 800 x 560 fits, each group at its minimum or the D45 floor. |
| P9-AC10 | Pass | Manual Linux: with the cache deleted the log shows "queue entries wait for the scan", then "restored 50000 queue entries" after the scan. With the music folder missing, `state.json` had the same SHA-256 after the app exited. Rust: `missing_entries_wait_for_a_complete_traversal_then_go`. |
| P9-AC11 | Pass | E2E: a change and the close request in one task: the layout with the change is saved before the window is destroyed. |

**Notes**

- N1: a 50,000-entry queue makes a 3.4 MB `state.json`. Position ticks no longer start a save; queue and state changes do, and the exit saves the last position. The file is compact JSON, and an unchanged state is not written again.
- N2: `layout.json` has the Dockview grid `width` and `height`. They are the dock size when saved, not the window size; the restore fits the grid to the current window (P9.4 step 5).
- N3: the close request needs `core:window:allow-destroy` in the capability: `onCloseRequested` destroys the window after the save (P9.3). D13 is unchanged: no filesystem, HTTP, shell or dialog permission.
- N4: Dockview can report a layout change after the close request, so the close writes the current layout even with no save pending.
- N5: a queue or volume change before the restore resolves drops the saved queue; the user's action wins.
- N6: the disk allowance of the container ran out during validation; old build output was deleted and the checks ran again.

**Exceptions**

- E1: no Windows desktop: P9-AC6 on Windows and P9-AC7 (another drive letter) are for P18. P9-AC6 on Linux checked the process only; the X server had no window manager, so focus and raise were not visible.

**Blockers:** none.

**TWO-PASS REVIEW:** F1 2, F2 7, F3 1, F4 13. Sources: own audit (in `8140536`) and a reviewer agent (fixed in the next commit).

- F1: saving `state.json` on each position tick wrote 3.4 MB every 2 s with a 50,000-entry queue (N1).
- F2: the close flush waited for a pending change that Dockview had not reported yet (N4). The unit test for the close path asserted the old behavior (updated).
- F4:
  - The saved queue could replace a queue the user started during the scan: a user action first drops it (N5).
  - The restore event could count as a user action: the store is ready before the Restore command goes out.
  - Paths over IPC: the layout commands carry JSON text only; the config path is fixed in Rust (D13).
  - Position 0 after a restore with the current entry missing: R27 drops missing entries; the next entry starts at 0.
- Reviewer:
  - F1: any player state event (volume, shuffle, a lost device) before the restore counted as a user action and dropped the saved queue (only a queue change does now; tested).
  - F2: a race let the restore replace a queue the user started during the scan (the engine now ignores a restore when a queue is in use, and `ready` changes only under the pending lock; tested). The layout save error sent the config path to the webview (now a fixed message, D13). A saved entry that failed to open made Play seek the next song to the saved position (tested). An older capture could be written after the exit save, and an exit before the player applied the restore saved an empty queue (one save at a time; the restored values are the latest state; tested). `persist.rs` had no tests (four added). The P9-AC9 test passed with no minimums, and the P9-AC3 test compared text lengths (both now check the real values).
  - F3: F-15 (the settings save error can carry the config path, P4 code).
  - F4: `layout.json` holds the dock size in the Dockview grid: it is not the window size, which is only in `settings.json` (N2); Dockview needs it for the proportions. Track ids after a cache restore, a channel deadlock, the missing-folder path, pending entries, concurrent layout writes, the destroy permission, the P9.4 order, the single instance and lock times: none hold.

**Follow-ups:** F-13, F-14 and F-15 (open).

---

#### P10. Local artwork and thumbnails (October 11, 2026)

- **Status:** Done with exceptions.
- **Commits:** branch `clawd/determined-ramanujan-3gm3n1`, from `5b9c82a`. Messages start with `P10:`.
- **Packages:** none added.

| Criterion | Result | Evidence |
|---|---|---|
| P10-AC1 | Pass | `crates/clawdio-core/src/artwork.rs`: cover files rank `COVER.JPG`, `cover.png`, `Folder.PNG`, `front.jpg` (names without case); `cover.jpg` beats `folder.png` and embedded art; the third song's embedded art shows when it is the only art; a front cover beats an earlier picture of another type. |
| P10-AC2 | Pass | `a_broken_cover_file_is_skipped_for_embedded_art`: the broken cover logs a warning and the embedded art shows. |
| P10-AC3 | Pass | `src-tauri/src/thumbs.rs` service tests: files appear in the thumbnail folder on request and again after the folder is deleted. Manual Linux: `data/cache/thumbs` filled with 96 px and 512 px files for the visible albums, and again after the cache was deleted. |
| P10-AC4 | Pass | `tests/e2e/art.spec.ts`: rows and Now playing show the art; "Lemonade" (no art) shows the placeholder in its row and in Now playing. |
| P10-AC5 | Pass with exception (E1) | Rust: a PNG becomes a JPEG `cover.jpg`; a file that is not an image is refused; a read-only folder writes nothing (runs for non-root users: CI). E2E: "Set cover" is on the album menu and a read-only error shows in the status line. |
| P10-AC6 | Pass with exception (E2) | Manual Linux: `playerctl metadata mpris:artUrl` gave the `file://` URL of the 512 px file after the cache was deleted. Unit: the metadata goes out again when the current album's art is ready, once. |
| P10-AC7 | Pass | E2E: 61 albums; the first view asked art for fewer than 30, and after a scroll to the end the last album was asked while the total stayed below 61. |

**Notes**

- N1: `ArtService` keeps a request queue (newest first, at most 512) and two worker threads. The cache key is a stable FNV-1a hash of the album folder and the name, size and modified time of each art source, so changed art gets new files. Albums with no art are remembered for the session.
- N2: cover files decode by content, so a PNG named `cover.jpg` shows. F-16 aligns the scan's D44 cover state.
- N3: the `thumb` field left `Album` and `AlbumRow`, and `album_of` went: the rows ask `album_art(album, size)` for the visible window only.
- N4: "Set cover" checks that the folder is writable before the picker opens, so a read-only folder fails before the user picks a file.

**Exceptions**

- E1: P10-AC5 manual: the GTK file picker under Xvfb shows no files, and the container runs as root, which can write a read-only folder. The conversion, refusal and confirmation paths are unit tested; the read-only test runs in CI.
- E2: P10-AC6 on Windows: no Windows desktop (P18).

**Blockers:** none.

**TWO-PASS REVIEW:** F1 2, F2 8, F3 2, F4 13. Sources: own audit (in `75cc228`) and a reviewer agent (fixed in the next commit).

- F1: a PNG saved as `cover.jpg` did not decode, because the format came from the extension (now by content).
- F2: `album_of` and the `thumb` field had no caller after the change (removed). The art test helper asserted a tag on a song with no picture.
- F3: F-16 (the scan's cover state decodes by extension).
- F4:
  - A paths leak in `set_cover` errors: the messages are fixed texts (D13).
  - Blocking dialogs in `set_cover`: it is an async command, off the main thread.
  - Many art requests while scrolling: the queue keeps the newest 512 and drops the rest.
- Reviewer:
  - F1: after "Set cover" the OS panel kept the URL of the deleted 512 px file (the publisher now republishes when the URL changes; tested).
  - F2: `album_art` listed the album folder on the main thread and under the library lock (now async, and the folder listing runs after the lock). "Set cover" did not see `Cover.JPG` on a case-sensitive file system and wrote a second cover (any letter case now asks first, and the old name goes after the rename; tested). With only the 512 px file left, a row and a worker looped on `art-ready` (the worker now checks every size). Mounted rows kept old names after a rescan (a library change now refreshes them). The cache key hashed absolute paths, against D27 (now relative to the music folder; tested). The embedded-order test passed with "last picture wins" (now a later song has other art). The `art-ready` refresh had no e2e test (added with a pending album in the mock).
  - F3: F-17 (old thumbnail files stay; two workers can make one album).
  - F4: the source order, blocking dialogs, D19, the read-only path, D13, D41, media lock order, album ids after a rescan, frontend memory and the Set cover invalidation hold.

**Follow-ups:** F-13 to F-17 (open).

---

#### P11. Playlists and Favorites (October 12, 2026)

- **Status:** Done with exceptions.
- **Commits:** branch `clawd/determined-ramanujan-3gm3n1`, from `42a01a7`. Messages start with `P11:`.
- **Packages:** none added.

| Criterion | Result | Evidence |
|---|---|---|
| P11-AC1 | Pass | `playlist/name.rs`: each R12 rejection with its message, including "favorites" in any case, "CON.mix" and "com1.roadtrip"; valid names including Cyrillic and Japanese; D21 taken names in any case. |
| P11-AC2 | Pass | `playlist/mod.rs` `edits_give_golden_files`: create, add with a duplicate, remove and delete against golden text, byte for byte. |
| P11-AC3 | Pass | `a_failed_write_keeps_the_old_file_and_the_set`: the write fails, the error is `Write`, and the old file and the set are unchanged. E2E: the error dialog. |
| P11-AC4 | Pass | `missing_entries_stay_after_every_edit`; E2E: "missing" with its path, and play from an entry skips the missing one. |
| P11-AC5 | Pass | `the_heart_toggles_favorites_and_creates_the_file` (every copy removed, file created on first use). E2E: the Now playing heart (`aria-pressed`) and the row heart. |
| P11-AC6 | Pass | `tests/playlists.rs`: `.m3u8` in three folders (any case) listed; `.m3u`, `.pls` and hidden folders not; a non-UTF-8 file skipped and logged. |
| P11-AC7 | Pass | `a_rescan_writes_no_playlist`: every playlist file is byte-identical after two scans. |
| P11-AC8 | Pass | `tests/e2e/playlists.spec.ts`: Up, Down, Right, Left, Delete (also in Favorites through the same path), Enter and double-click. |
| P11-AC9 | Pass with exception (E1) | Linux: VLC 3.0.20 played an app-written playlist with `../` paths, accents, parentheses and spaces (`docs/release-checklist.md`). Windows VLC and MusicBee: not run. |
| P11-AC10 | Pass with exception (E2) | E2E: a failed write shows the dialog and playback goes on. Rust: the failure path. |
| P11-AC11 | Pass | `a_deleted_cache_gives_the_same_playlists`. A new folder clears the playlists, and its scan loads the new ones (P11.10). |

**Notes**

- N1: the scan collects `.m3u8` paths (`ScanReport.playlists`); the set reads them after each scan. After an incomplete scan the known playlists stay. Ids are kept by path.
- N2: new files from `write_atomic` (playlists, `cover.jpg`, settings) had mode 0600 from the temp file, so other users, media servers and shares could not read them. New files now get 0644 on Unix and a replaced file keeps its mode.
- N3: the row heart is not a button in the accessibility tree (D23 says pointer only): axe reports a control inside a list option as nested-interactive. Keyboard and screen reader users use the Now playing heart.
- N4: "Add to playlist" is a submenu on song, album and artist rows; it lists every playlist but Favorites (D20) and "New playlist…".
- N5: errors from playlist edits show a dialog with a fixed message, no path (D13).

**Exceptions**

- E1: no Windows machine: VLC and MusicBee on Windows did not run. B3 stays open until P18 (the Linux result does not call for the owner).
- E2: P11-AC10 manual: the container runs as root, which can write a read-only folder; the failure path is tested with a folder in place of the file.

**Blockers:** none.

**TWO-PASS REVIEW:** F1 2, F2 11, F3 1, F4 12. Sources: own audit (in `8f51528`) and a reviewer agent (fixed in the next commit).

- F1: new files from `write_atomic` were mode 0600, unreadable for other users and services (N2).
- F2: the row heart broke the listbox pattern for axe (N3). The P7 test expected a disabled "Add to playlist" (now a submenu). The P6-AC4 WebKit race was fixed with the P10 fixes.
- F4:
  - A scan reload losing an edit: edits write the file first, and the scan reads the files after.
  - Lock order: every path takes the playlists lock before the library lock.
  - IPC paths: commands carry ids, positions and names; errors are fixed texts (D13).
- Reviewer:
  - F1: the heart during the startup scan, or "New playlist" with a name the scan skipped, replaced the file on disk with a new one (data loss). Favorites now loads from disk when the set has not read it, and a name with a file on disk in any letter case is taken; tested.
  - F2: a playlist made while a scan ran dropped out of the set at the scan's end (`load` now keeps known files that exist; tested). A missing entry's label sent its path, which can be absolute, against D13 (now the `#EXTINF` title or the file name; tested). The P11-AC3 test wrote the old file back before the check (a read-only folder test now runs for non-root users). A line break in a tag split an entry (now a space; tested). The dialog checked names in every folder and create only in `Playlists/` (one check now, with the disk). The D20 filter matched any playlist named "favorites" (now a flag from Rust). Menu keys were labels, which can repeat. The delete dialog named `<name>.m3u8` for files with another extension case (now the file name from Rust).
  - F3: F-18 (letter case on Windows).
  - F4: a scan reload overwriting an edit, lock order, BOM and CRLF, `..` out of the folder, ids across rescans, every copy removed, Unicode case, "CON .mix", the row heart and play from an entry hold.

**Follow-ups:** F-13 to F-18 (open).

---

#### P12. Playlist import (October 12, 2026)

- **Status:** Done with exceptions.
- **Commits:** branch `clawd/determined-ramanujan-3gm3n1`, from `8348415`. Messages start with `P12:`.
- **Packages:** `plist` 1.10.1 and `encoding_rs` 0.8.42 (section 6.2).

| Criterion | Result | Evidence |
|---|---|---|
| P12-AC1 | Pass | `import/matching.rs`: one test per stage (relative, longest suffix, file name, names), the narrowing of stage 4 to the stage 3 candidates, the ambiguous rule, not found and no location; normalization of drive, UNC, slashes, case and NFD. |
| P12-AC2 | Pass | `tests/import.rs` with `tests/fixtures/import/`: Apple XML (library `Master`, a `Distinguished Kind` list, one user playlist, a track with no `Location`, `file://localhost/C:/` with `%20` and `%C3%B6`), a MusicBee-style M3U8 (absolute Windows and UNC paths), a legacy Windows-1252 `.m3u`; golden `.m3u8` text and reports. |
| P12-AC3 | Pass | Each golden test checks the source file is byte-identical after the import. |
| P12-AC4 | Pass | `parse.rs` and the legacy fixture: "é" from Windows-1252; UTF-8 is tried first. |
| P12-AC5 | Pass | The streaming track is in the report as "no file location" and not in the file. |
| P12-AC6 | Not verified (E1) | No owner export reached this session (Q5). Each format stays "not verified". |

**Notes**

- N1: one stage-2 rule needed a choice: the longest shared path end must hold at least a folder and the file name; a file name alone is stage 3.
- N2: import names follow D21; "..." becomes "_" (".." first, then the edge dots).
- N3: report labels are "artist - title", the title or the file name, never a path (D13).
- N4: "Import playlist" opens the Rust picker; the browser e2e mock returns a fixed report.
- N5: a reserved device name with an extension gets " (imported)" on the device part ("CON.mix" becomes "CON (imported).mix"), because "CON.mix (imported)" is still reserved. This is the D21 rule applied so the result is a valid name.
- N6: a playlist in the file that cannot be written gets its own report line ("Not imported" with the reason); the other playlists still import. `ImportReport.error` carries the reason.

**Exceptions**

- E1: P12-AC6 and gate B4 need the owner's real exports (Q5: Apple XML, MusicBee M3U8, legacy `.m3u`). None was supplied in this session, so each format stays "not verified" and B4 stays open.

**Blockers:** none for the code. B4 waits for the owner's files.

**TWO-PASS REVIEW:** F1 1, F2 8, F3 0, F4 4. Source: own audit, then a reviewer agent on `87941ac`.

- F1: an imported "CON.mix" became "CON.mix (imported)", still reserved, so the import failed (N5).
- F2:
  - Clippy found a complex closure type (now a `Stage` alias) and a `match` that is a `?`. The D21 test expected "Imported playlist" for "..." (the rule gives "_").
  - Stage 2 compared every entry with every track and allocated per track. The matcher now groups tracks by file name and by title, and each stage reads only its group.
  - The first write error stopped the import and dropped the reports of playlists already written (N6).
  - `file://nas/share/a.mp3` lost its host. A host other than `localhost` now gives `//nas/share/a.mp3` (P12.4).
  - Percent-decoding took `%+1` as a byte. It now needs two hex digits.
  - The stage 1 test also passed without stage 1, and the narrowing test also passed without narrowing. Both libraries now have a second candidate that only the tested stage removes.
- F4:
  - The matcher holds the playlist and library locks during an import. With the grouped stages the work is small, so a snapshot copy of the library is not worth its code.
  - Report labels and errors carry no paths (D13).
  - The source file is only read: each golden test hashes it.
  - Matching never leaves the library: the candidates are index tracks.

**Follow-ups:** F-13 to F-18 (open).

#### P13. Local lyrics (October 12, 2026)

- **Status:** Done.
- **Commits:** branch `clawd/determined-ramanujan-3gm3n1`, from `be917f2`. Messages start with `P13:`.
- **Packages:** none new. The core reads tags with lofty 0.25.4.

| Criterion | Result | Evidence |
|---|---|---|
| P13-AC1 | Pass | `lyrics.rs` `lrc_beats_txt_beats_embedded`: an MP3 with USLT, then a `.txt`, then a `.lrc`; removing the `.lrc` gives the `.txt` again. |
| P13-AC2 | Pass | `lyrics.rs`: stamps `[mm:ss]`, `.x`, `.xx`, `.xxx`, `:xx`, 3 minute digits and repeated stamps; the nine tag lines; blank lines and order stay; text that only looks like a stamp stays. |
| P13-AC3 | Pass | Unit test with a USLT frame (checked in the saved tag). Manual Linux: a release build played an MP3 with a hand-written ID3v2.3 USLT frame and no lyrics file; the widget showed both lines. |
| P13-AC4 | Pass | `ogg_lyrics_and_unsyncedlyrics_show`: Vorbis copies with `LYRICS` and with `UNSYNCEDLYRICS`. |
| P13-AC5 | Pass | Playwright `P13-AC5`: lyrics text with no button; no source gives the hint and a disabled "Fetch lyrics"; an empty queue gives the hint with no button. |
| P13-AC6 | Pass | `commands/lyrics.rs` test: add, edit and remove the `.lrc`, then the scan check sends `lyrics-changed` each time and not when nothing changed. Manual Linux: adding and removing the playing song's `.lrc`, then Rescan, changed the widget with no song change. |

**Notes**

- N1: `lyrics_get` returns null when no source has lyrics; the widget shows "Fetch lyrics" only then. A source with only blank text (an empty file, a `.lrc` of tag lines, empty embedded text) is skipped, so the next source shows, the same rule for files and tags.
- N2: the file names are `<base name>.lrc` and `<base name>.txt` in lower case, as R9 states. On Linux a `.LRC` file is not read.
- N3: `.txt` and embedded text show as they are; only `.lrc` loses its stamps (R9).
- N4: the app keeps the last lyrics it sent and checks them after each complete scan (P13.3). A queue event with a new current song sends `lyrics-changed`.
- N5: manual playback used a null ALSA device, which does not pace the audio, so a song ends at once. A one-song queue kept the song current for the check.

**Exceptions:** none.

**Blockers:** none.

**TWO-PASS REVIEW:** F1 0, F2 6, F3 0, F4 3. Source: own audit, then a reviewer agent.

- F2:
  - The lyrics read took the music folder lock, then the index lock: the reverse of the player's resolver. It now takes one at a time.
  - An empty `.lrc` or `.txt` hid the next source (N1).
  - A late answer for the song before could replace the playing song's lyrics in the scan check, so an edit went unannounced. Only the playing song's answer counts now, and the song is known before the queue event goes out.
  - The hint flashed on each song change while the lyrics loaded. The widget now shows nothing until they arrive.
  - The embedded lyrics read also decoded the cover art. It now skips pictures.
  - Weak tests: Windows-1252 used only a byte that Latin-1 decodes the same; it now uses `\x93`, `\x94` and `\x80`. Added tests for blank sources, upper-case tag keys, multi-byte text after a stamp and the late-answer case.
- F4:
  - No size limit on lyrics files: a lyrics file of many megabytes next to a song is not a real case, and the read is async.
  - A song change reads the lyrics twice (the track input and `lyrics-changed`); the second answer replaces the first, and the read is small.
  - No test that the scan calls the lyrics check: the call is one line after the complete-scan return, and the manual Rescan check covers it.

**Follow-ups:** F-13 to F-18 (open).

#### P14. Online lookups and artwork fetch (October 12, 2026)

- **Status:** Done.
- **Commits:** branch `clawd/determined-ramanujan-3gm3n1`, from `074034d`. Messages start with `P14:`.
- **Packages:** `reqwest` 0.13.5 with `rustls-no-provider`, `rustls` 0.23.45 with the `ring` provider, `tokio` 1.53.2, `tokio-util` 0.7.20; dev: `httpmock` 0.8.3.

| Criterion | Result | Evidence |
|---|---|---|
| P14-AC1 | Pass | `net/tests.rs` `the_switch_off_makes_zero_requests` (gate counter and mock hits 0); `online.rs` `the_switch_off_starts_no_job_and_no_retry` (scan end and "Retry lookup" with the switch off: 0 requests). |
| P14-AC2 | Pass | `cancel_or_switch_off_aborts_a_slow_download`: a 10 s mock image; Cancel and switch off each end the lookup in under 1 s with no file. The job loop stops at the first canceled lookup. |
| P14-AC15 | Pass | `the_job_waits_for_the_startup_scan_then_saves_the_cover`: the switch alone starts nothing before the scan ends. `check` lists the cover files again before each request (`the_folder_check_...`: a valid `folder.jpg` skips the album). |
| P14-AC3 | Pass | `normalize.rs` tests and `one_matching_group_saves_the_cover` with the folder "1973 - Album (Remastered)". |
| P14-AC4 | Pass | One match saves the exact JPEG; zero or two matches write `no-match`; 503 and 429 write nothing. |
| P14-AC5 | Pass | `candidates_come_from_the_scan_flags` (embedded art, valid cover, Unknown groups, songs in the artist folder); `check` skips a marker and a read-only folder with a log line. The read-only test skips when it runs as root. |
| P14-AC6 | Pass | `musicbrainz_requests_start_one_second_apart`: three callers, at least 2 s for three starts, User-Agent matched. `online::user_agent` builds `<productName>/<version> ( <repository> )`. |
| P14-AC7 | Pass | `retry_clears_the_marker_and_looks_up` (app) and `a_marker_blocks_the_lookup_until_retry_clears_it` (core); Playwright `P14.7` for the menu item and its off state. |
| P14-AC8 | Pass | Markers live in `sidecar.json` only; a new index plus a marker gives no request (`a_marker_blocks_...`). |
| P14-AC9 | Pass | `a_bad_or_large_body_saves_nothing`: HTML, a fake JPEG and 10 MB + 1 byte. |
| P14-AC10 | Pass | `sidecar.rs` `a_corrupt_sidecar_is_ignored_and_left_unchanged`; `check` skips the album with a log line. |
| P14-AC11 | Pass | `redirects_follow_the_allow_list_and_the_hop_limit`: a redirect to another host is refused; 5 hops pass, 6 fail; HTTPS only and `archive.org` subdomains in the production list. |
| P14-AC12 | Pass | Manual Linux, release build, real services: "Fetching artwork: 9 of 16 albums" with Cancel; artist browsing worked during the job; Cancel stopped it and no later marker was written. |
| P14-AC13 | Pass | `a_service_or_network_error_writes_nothing` (no listener, 503, 429): no file, no marker. The job stops on a network error or 429/5xx and runs at the next start. |
| P14-AC14 | Pass | A broken `folder.jpg` is a candidate; a broken `cover.jpg` (any case) or a corrupt sidecar is skipped and logged, with no request. |

**Notes**

- N1: rustls uses the `ring` provider (D29 names rustls only). The default `aws-lc-rs` provider needs CMake and NASM on Windows; `ring` needs only a C compiler and gives a smaller binary.
- N2: the search sends the D43-normalized names, so "1973 - Album (Remastered)" searches "album". MusicBrainz search ignores case and accents.
- N3: `cover.jpg` is written with a no-replace rename, so a file made at the same moment is never overwritten.
- N4: manual check with the real services: "Björk/Debut" got its cover from Cover Art Archive and the row showed it at once; a made-up album got a `no-match` marker.
- N5: the job runs after each complete scan while the switch is on; a scan that ends during a job queues one more pass.
- N6: "Retry lookup" clears the marker and puts the album first in the artwork job (started at once, or the next pass), so the status line Cancel stops it and the result shows in the status line.

**Exceptions:** none.

**Blockers:** none.

**TWO-PASS REVIEW:** F1 0, F2 9, F3 0, F4 4. Source: own audit, then a reviewer agent.

- F2:
  - A rerun asked for while a canceled job still unwound (switch off and on, a new folder) was lost. The job now runs again when asked, with a new token; Cancel clears the request.
  - `cover.jpg` could not be saved on file systems with no no-replace rename and no hard links (exFAT, FAT). `write_new` now falls back to a create-new write, which still never overwrites.
  - Folder checks, image decoding and the cover write ran on async threads. They now run on blocking threads.
  - "Retry lookup" panicked when the HTTP client could not be built. It now gives an error.
  - "Retry lookup" ran beside the job and Cancel did not stop it. It now goes first in the job (N6).
  - A panic in the job left it marked as running. A guard clears the slot.
  - Two quick switch changes could reach the gate out of order. The gate now changes under the settings lock.
  - The README described P15 lyrics as if done and left out the `no-art` marker. It now covers P14 only and says the names are sent normalized.
  - Weak tests: the 10 MB cap was tested only through Content-Length; a chunked 12 MB body now tests the streaming cap. Added an app test: a 503 stops the queue with no marker.
- F4:
  - A test of the built User-Agent would repeat its own formula; P14-AC6 checks the header the client sends.
  - HTTPS on a redirect hop is checked by the same function as the first request, which has a unit test; an end-to-end HTTPS mock would add a TLS test server for no new path.
  - A cancel during the body read takes the same `select!` path as during `send`.
  - The sidecar marker write stays on the async thread: it is one small atomic file.

**Follow-ups:** F-13 to F-18 (open).

#### P15. Lyrics fetch (October 12, 2026)

- **Status:** Done.
- **Commits:** branch `clawd/determined-ramanujan-3gm3n1`, from `6fe6867`. Messages start with `P15:`.
- **Packages:** none new.

| Criterion | Result | Evidence |
|---|---|---|
| P15-AC1 | Pass | `net/tests.rs` `the_get_request_carries_the_cleaned_title_and_duration`: a scan of an untagged "01 - Title.mp3" gives `track_name=Title`, the folder names and the decoded duration in whole seconds; the mock matches every parameter and `Lrclib-Client`. |
| P15-AC2 | Pass | `two_seconds_off_is_accepted_and_three_is_not`: `/api/get` 2 s off is accepted; 3 s off leads to the search, where 3 s off is rejected and 2 s off is accepted (synced wins). |
| P15-AC3 | Pass | `synced_save_as_lrc_and_plain_as_txt`; app test `fetched_lyrics_are_saved_and_announced`. |
| P15-AC4 | Pass | `no_acceptable_result_is_none`; app test: "No lyrics found" path writes nothing and sends no `lyrics-changed`. |
| P15-AC5 | Pass | `check_writable` runs before any request (`a_read_only_folder_is_found_first`; skips as root). The error goes to the status line. |
| P15-AC6 | Pass | Core and app tests: switch off gives an error and 0 requests. Playwright: the button is disabled with the switch off. |
| P15-AC7 | Pass | App test: `lyrics-changed` after the save and `lyrics_get` gives the new text. Playwright: fetched lyrics replace the hint at once. Manual Linux: a real fetch for "Björk/Debut/01 - Human Behaviour.mp3" (252 s) saved a `.lrc` and the widget showed it with the stamps hidden and "Lyrics saved" in the status line. |

**Notes**

- N1: the duration is the one the scan read from the audio stream properties (lofty, or Symphonia for WAV), rounded to whole seconds. The player sends no duration.
- N2: the fetch code is in `net/lyrics.rs`, beside the other online code, and the gate serializes LRCLIB requests (section 6.11).
- N3: a 404 from the search counts as no result. The search normally answers `[]`. A search answer that is not JSON is an error.
- N5: among accepted search results, synced lyrics win, then the result closest to the song's duration. The 2 s rule compares milliseconds; the request sends whole seconds.
- N6: a blank `.lrc` or `.txt` holds no lyrics (P13), so "Fetch lyrics" replaces it; any other existing file is never replaced.
- N4: in the manual run MusicBrainz answered 503 (its rate-limit answer after earlier runs from the same address). The artwork job stopped with no marker, as R8 requires.

**Exceptions:** none.

**Blockers:** none.

**TWO-PASS REVIEW:** F1 0, F2 7, F3 0, F4 3. Source: own audit, then a reviewer agent.

- F2:
  - A blank lyrics file showed "Fetch lyrics", but the create-new save then failed for good. A blank file is now replaced (N6).
  - The 2 s rule compared against the rounded duration, so a result 2.0 s off a 200.4 s song failed. It now compares milliseconds.
  - The folder check and the save ran on async threads. They now run on blocking threads.
  - The search took the first synced result, not the closest one (N5).
  - A search answer that was not JSON showed "No lyrics found". It is now an error.
  - A fetch kept the button disabled on the next song. The busy state now belongs to its song.
  - Weak tests: added a `/api/get` answer with no lyrics, the 2 s edge on the search alone, the closest result, a bad answer, a blank file and the LRCLIB one-at-a-time rule.
- F4:
  - The writable check makes and removes a temp file, as Set cover (P10) and the artwork job (P14) do; one rule for all three.
  - No command test for a read-only folder: root writes into read-only folders here, and the check runs before the request in the code and in the unit test.
  - The e2e mock always succeeds: the error message path is the same `showMessage` call that P10-AC5 tests.

**Follow-ups:** F-13 to F-18 (open).

#### P16. Metadata fill (October 12, 2026)

- **Status:** Done.
- **Commits:** branch `clawd/determined-ramanujan-3gm3n1`, from `c97d252`. Messages start with `P16:`.
- **Packages:** none new. The cache schema is version 4 (a `sidecars` table); an older cache is rebuilt.

| Criterion | Result | Evidence |
|---|---|---|
| P16-AC1 | Pass | `net/tests.rs` `only_missing_fields_are_proposed` (a tagged title, track or year is never proposed); app test `the_preview_writes_nothing_and_confirm_applies_it` checks the preview rows. |
| P16-AC2 | Pass | The app test compares the album folder (entries, bytes and the folder's modified time) before and after the preview: unchanged. |
| P16-AC3 | Pass | `tests/scan.rs` `the_sidecar_fills_untagged_songs_and_follows_its_changes`: sidecar titles and track numbers for untagged songs, tags win, the same rows after a reload from the cache (a restart); the app test shows the new title in the index right after Confirm. |
| P16-AC4 | Pass | `tests/hash_guard.rs`: MP3, Ogg and WAV files are byte-identical after Set cover, a fetched cover, markers, playlists, the heart, an import, lyrics files, the metadata sidecar and scans. |
| P16-AC5 | Pass | `sidecar.rs` `a_corrupt_sidecar_is_replaced_only_when_confirmed`; app test: the preview names the corrupt file and leaves it, Confirm replaces it. |
| P16-AC6 | Pass | `track_values_merge_and_other_entries_stay` (an entry for a missing song stays); the scan test keeps an orphan entry. |
| P16-AC7 | Pass | Review: no fingerprinting crate in `Cargo.lock` (no chromaprint or AcoustID); the code matches by names and titles only. |
| P16-AC8 | Pass | App test with a 0555 folder: the error shows, 0 requests, the folder is unchanged (skips the write part as root; the permission check itself runs). |
| P16-AC9 | Pass | `the_album_tag_finds_what_the_folder_name_does_not`; `a_tie_or_a_weak_match_gives_no_proposal`; `two_release_groups_give_no_proposal`. |

**Notes**

- N1: the sidecar step of R4 and P5.3 is in the scan now: a changed, new or removed `sidecar.json` makes the scan read that album's songs again. Its stamp lives in the index and the cache.
- N2: P16-AC8 asks for a file-system watch. The test compares the folder's entries, their bytes and the folder's modified time; making and removing a probe file changes that time, so the check catches any file made in the folder.
- N3: D42 says to prefer a track count equal to the song count, then the earliest date, and also that a tie gives no proposal. The preference orders the at most 5 releases that are scored; equal best scores give no proposal (P16-AC9).
- N4: a song with no disc tag maps by track number on a single-medium release (disc 1); otherwise by folded title.
- N5: the preview names each song by its path inside the album folder (the sidecar key), never a full path (D13).
- N6: Confirm while a scan runs shows "A scan is running. Confirm again when it ends", because both write the album's rows.
- N7: the read-only check reads the folder permissions only (P16.1). On Windows the read-only flag of a folder does not block writes (Explorer sets it on customized folders), so Windows skips the check and a failed write shows the same error on Confirm. On Unix a folder that has write bits but belongs to another user also shows the error on Confirm.
- N8: a proposal stays until Confirm succeeds, so a Confirm during a scan can be tried again. A proposal made for another music folder, or a sidecar that turned corrupt after the preview, asks for a new lookup.
- N9 (owner check, not blocking): N3 reads D42 so that P16-AC9 holds. If the owner wants the track count and date preference to break ties between editions with the same track list, D42 and P16-AC9 change together.

**Exceptions:** none.

**Blockers:** none.

**TWO-PASS REVIEW:** F1 0, F2 10, F3 0, F4 5. Source: own audit, then a reviewer agent.

- F2:
  - Confirm removed the proposal before the write, so a Confirm during a scan or after a failed write could not be tried again (N8).
  - Confirm always replaced a corrupt sidecar, also one that turned corrupt after a preview that did not name it. It now replaces only what the preview named.
  - Windows folders with the read-only flag were blocked though writable (N7).
  - A proposal from before a music folder change could be applied to the old folder. It is now refused.
  - The preview table scrolled with no keyboard access and had no name. It is now a focusable named region with a caption.
  - A track tag of 0 counted as missing in the fill but as a value in the scan, so the proposal never showed. Both treat it as a value now.
  - Marker writes changed the sidecar stamp without telling the index, so the next scan read the album's songs again. The job and "Retry lookup" now store the new stamp.
  - `write_tracks` reset a `tracks` value of an unknown form. It now leaves the file and reports it as corrupt.
  - Weak tests: added Confirm with the cache (restart and a scan that reads nothing), Confirm during a scan, a sidecar corrupted after the preview, disc mapping on two discs, and `tracks` of an unknown form.
  - A doc comment in `commands.ts` sat above the wrong command.
- F4:
  - A marker write and a Confirm on the same album at the same moment could lose one update: both are atomic writes of a small file, and the user would need to confirm while that album's lookup writes.
  - No test of the candidate order: it only picks which 5 releases are scored, and P16-AC9 covers ties.
  - No test that a canceled scan keeps the stamps: the sidecar step runs only in the complete-scan branch, which the existing canceled-scan tests cover.
  - `hash_guard` does not call the fill commands: the app test compares the audio bytes before and after Confirm.
  - A Unix folder of another user passes the permission check: P16.1 allows the error on Confirm.

**Follow-ups:** F-13 to F-18 (open).

#### P17. UI quality audit (October 12, 2026)

- **Status:** Done with exceptions.
- **Commits:** branch `clawd/determined-ramanujan-3gm3n1`, from `e3fec36`. Messages start with `P17:`.
- **Packages:** none new.

| Criterion | Result | Evidence |
|---|---|---|
| P17-AC1 | Pass (Chromium); WebKit in CI | `tests/e2e/audit.spec.ts` state sweep: first run, no folder, missing folder, every widget empty, populated, selected, playing, disabled (Transport with no folder, "Fetch lyrics" with lookups off), menus, row menu, every dialog (Settings, New playlist with an error, Import report, Fill missing metadata, Cannot save the change) and a status-line error; axe has no serious or critical violation in any of them. The CI runs the same spec in WebKit. |
| P17-AC2 | Pass on Linux (E1) | `docs/release-checklist.md` keyboard walkthrough in the release build: every R25 key and Ctrl+Shift+L, Delete in the queue and in a playlist, F6 order. Space in the real app is E2. |
| P17-AC3 | Pass (automated) (E3) | Reduced motion emulation in every sweep state: no non-zero transition or animation duration. AC-16: no Magic UI component exists (D6), so the CSS rule covers all motion. |
| P17-AC4 | Pass | `P17-AC4` test at 800 x 560 for Tree, Columns, Top/bottom and a tabbed layout: no control is clipped and none overlaps another; screenshots are attached to the test report. |
| P17-AC5 | Pass on Linux (E1) | Large text emulated with `GDK_DPI_SCALE` 1.25 and 1.4 in the release build: no overlap after the minimum-height fix (N2). `P17-AC5` test: Transport controls and Now playing fit their content at their minimum height. |
| P17-AC6 | Pass (emulation) (E1) | `P17-AC6` test in Chromium forced colors: the focus ring, a pressed toggle, the switch on and off and the slider range show with system colors. |
| P17-AC7 | Pass | `docs/design.md` gains six implementation notes, each with its decision and reason: Geist (D7), the type map (C12), the header strip (D11), album rows (C11), no mute toggle (C3), no Magic UI (D6). |
| P17-AC8 | Pass | `npm run check` (contrast test, source guards, SVG checks) passes. Brand audit: the wordmark is only in the header strip and About, no cat asset is in the UI, the monogram is only in the art placeholder, red appears only for focus, the play ring, active toggles, the slider, the switch, the active drop target and errors. Type and wording audit: sizes follow the 6.12 map after the hint fix (N3); labels are sentence case; every time uses tabular numerals; no uppercase spaced text. |
| P17-AC9 | Pass | `P17-AC9` test: one frame after the click, with the open animation running, End and Enter in the menu run Rescan, and typing in the New playlist dialog fills the name. |

**Notes**

- N1: a narrow tabbed group cut off its active tab under the dock's overflow button. The dock now scrolls each group's active tab into view when it changes and when the tab strip changes size.
- N2: Transport controls and Now playing need 80 px of content under a 32 px header. Their D33 minimum of 88 px clipped them when the bottom row shrank (also under large text, where the saved layout scales down). Both minimums are now 112 px, the default bottom-row height; D33 records the change. When six widgets stack at 800 x 560, the D45 clamp still lowers every minimum in proportion (Transport controls get about 59 px), as it did with 88 px (47 px).
- N3: the empty hints, "Nothing playing" and the playlist name message were 13 px; the 6.12 map gives hints and captions 12 px.
- N4: forced colors had no rule for pressed toggles, the switch or the slider. They now use system colors (`Highlight`, `HighlightText`, `CanvasText`, `GrayText`).
- N5: the e2e settings mock returned one shared object, so the stores missed changes that the real IPC (a new object each time) shows. The mock now returns copies.
- N6: under WebKitGTK, `GDK_DPI_SCALE` sets the device pixel ratio: the whole page scales, as with a display scale.
- N7: a splitter that can move only one way (a neighbor at its minimum) lost its hover and drag line, because the theme styled only dockview's `dv-enabled` state. It now also styles `dv-minimum` and `dv-maximum`. The 112 px minimum made this common for the bottom row, which P2-AC17 caught.

**Exceptions**

- E1: no Windows machine. P17-AC2, P17-AC5 (150 percent display scale) and P17-AC6 (Windows high contrast) are not run on Windows; their traceability rows with MAN-W stay Planned until gate B5.
- E2: the container has no real-time audio sink (null ALSA output), so a song ends at once and Space cannot be observed in the real app. Playwright P7-AC5 covers Space in Chromium and WebKit.
- E3: GNOME is not in the container, so "Reduce animation" and "Large text" are emulated (Playwright reduced motion; `GDK_DPI_SCALE`).

**Blockers:** none for the code. Windows checks wait for gate B5.

**TWO-PASS REVIEW:** F1 0, F2 11, F3 0, F4 4. Source: own audit, then a reviewer agent.

- F2:
  - The active tab of a narrow tabbed group was cut off (N1).
  - Transport controls and Now playing minimums were below their content (N2).
  - Hints and captions were 13 px (N3).
  - Forced colors had no rules for toggles, the switch and the slider (N4).
  - The settings mock returned one shared object (N5).
  - A one-way splitter lost its line (N7).
  - The P17-AC9 test asserted running animations one frame later, which a loaded runner can miss. It now sends the keys as soon as the menu items exist and checks the result.
  - The P17-AC5 test passed when the drag did nothing. It now checks that the row is at its minimum first.
  - The P17-AC6 focus check passed without forced colors. It now checks that the ring color is not the brand red.
  - The tab-strip observer kept strips of rebuilt docks. It now stops watching strips that left the page.
  - N2 did not say that the D45 clamp still lowers the minimums when six widgets stack.
- F4:
  - Resizing the dock scrolls a strip back to its active tab only when that tab is cut off; a strip scrolled by hand to an inactive tab keeps its place until then.
  - The clip check reads overflow clipping only: no control uses absolute or fixed position to leave its widget.
  - The motion check reads elements, not `::before` and `::after`: the reduced-motion rule sets both to 0 s with the same selector.
  - The P17-AC9 menu check presses End: the result it checks is Rescan running, so a menu with another last item fails the test rather than passing it.

**Follow-ups:** F-13 to F-18 (open).

---

#### P18. Release readiness (October 12, 2026)

- **Status:** In progress. Blocked by B3 and B5 (owner input); B9 and B10 closed October 12, 2026. The code and docs work of P18.1 to P18.6, P18.8 and P18.9 is done.
- **Commits:** branch `clawd/determined-ramanujan-3gm3n1`, from `5ab34c2`. Messages start with `P18:`.
- **Packages:** none in the app. CI tools: `cargo-deny` 0.20.2 and `cargo-about` 0.9.2 (prebuilt, SHA-256 checked).

| Criterion | Result | Evidence |
|---|---|---|
| P18-AC1 | Not verified | `.github/workflows/release.yml` (tags `v*`): NSIS and portable zip on windows-latest, `.deb` and AppImage in `ubuntu:22.04`, size check, SHA-256 sums, draft release. No tag was pushed in this session. |
| P18-AC2 | Pass | `measure.yml` run 38204302435: NSIS installer 5.12 MiB, `.deb` 9.25 MiB. Local AppImage 83.65 MiB (recorded). `release.yml` fails at 30 MB or more. |
| P18-AC3 | Not run (E1) | `tauri.conf.json`: NSIS `installMode` `currentUser`, `webviewInstallMode` `downloadBootstrapper`. |
| P18-AC4 | Not run (E1) | D38 holds: Tauri shows "Could not find the WebView2 Runtime" with the download link (`tauri-runtime-wry` 2.12.1 `src/lib.rs:4680`), then `main` exits with code 1. |
| P18-AC5 | Not verified (E2) | No Ubuntu 22.04 desktop and no Debian 12 machine (B5 owner answer). |
| P18-AC6 | Pass | `docs/release-checklist.md` "Footprint": Windows 143 MB (CI VM, run 38208222253; target 200 MB). Linux after D50: 294 MB on the CI VM (run 38208222253) and 298 MB in the container; the owner accepted the Linux value on October 12, 2026 (R20 targets are adjustable). |
| P18-AC7 | Pass on Linux (E3) | The `.deb` holds `LICENSE`, `NOTICE` and both third-party files; the AppImage holds them and the LGPL and GPL texts. `NOTICE`: 3 assets, the Rust crates of both shipped targets and 27 npm packages; CI job `licenses` checks all generated files. |
| P18-AC8 | Pass | `cargo deny check` (licenses, advisories, bans, sources). |
| P18-AC9 | Pass (Linux) | Brand swap demo: only the two inputs and `src-tauri/icons/` changed; reverted. |
| P18-AC10 | Not run (E1) | Drive letters are Windows only. |
| P18-AC11 | Pass in part (E1, E2) | Linux: window title and `.deb` desktop entry show the name. GNOME app grid and every Windows item not run. |
| P18-AC12 | Not met | `docs/release-checklist.md` records all 21 checks and the platform matrix. AC-3 on Windows waits for B3; the manual Windows rows wait for B5. |
| P18-AC13 | Pass | `docs/theming-and-brand.md` (token map, dock chrome, brand inputs, Magic UI: none) and `docs/file-formats.md` (settings, state, arrangement, playlists, lyrics, sidecar). |

**Notes**

- N1: the bundle category is "Music": Tauri 2.12 rejects "Audio" (P18.1). The desktop template `src-tauri/clawdio.desktop` gives `AudioVideo;Audio;Player;`.
- N2: `deny.toml` checks the two shipped targets only (Linux and Windows x86_64).
- N3: the committed `NOTICE` has no AppImage table. `release.yml` makes it from the AppImage with `scripts/appimage-libs.sh` (package, version, the License fields of the Debian copyright file, source package) and builds the AppImage again with it. A library that no package owns fails the job.
- N4: the local packages came from an Ubuntu 24.04 container. `release.yml` builds in Ubuntu 22.04 (glibc 2.35).
- N5: the README gains Features, Install (WebView2, FUSE and SmartScreen notes), Portable mode, Keyboard shortcuts and Data locations.
- N6: B9 reduction (D50). Each lever was measured alone in one Columns run: compositing off 513 to 326 MB, two arenas and a trim 513 to 491 MB, DMABUF renderer off a further 12 MB. The WebKit cache model (document viewer) and `GDK_GL=disable` saved nothing and were not kept. The README tells Linux users how to turn compositing back on.

**Exceptions**

- E1: no Windows machine (B5). Every MAN-W item is "not run". MAN-W rows of the traceability matrix stay Planned.
- E2: no Ubuntu desktop and no Debian 12 machine (B5 owner answer). Manual Linux items ran in a container under Xvfb without GNOME.
- E3: the zip and NSIS contents and the AppImage library table are made by `release.yml`, which did not run.
- E4: the earlier "Done with exceptions" items stay open for the same reasons; `docs/release-checklist.md` lists them per AC.

**Blockers:** B3 (Windows interop) and B5 (Windows machine). B9 and B10 closed. P18 cannot be Done until B3 closes.

**TWO-PASS REVIEW:** F1 0, F2 5, F3 1, F4 8. Source: own audit, then a reviewer agent.

- F2:
  - The AppImage library rows had no license.
  - A library without a package owner left `NOTICE` silently.
  - The release container did not install the toolchain of `rust-toolchain.toml` explicitly.
  - The licenses job ran downloaded tools without a checksum check.
  - The README had no SmartScreen note (K16).
- F3: F-20 (tag and version check in `release.yml`).
- F4:
  - "No WebView2 dialog exists": Tauri shows it (P18-AC4 evidence).
  - The licenses job has no toolchain step: hosted runners install `rust-toolchain.toml` on first use, as every CI job does.
  - No `sudo` in the container: the steps run as root.
  - Node and CA certificates in the container: `setup-node` and the package step supply them.
  - The portable zip has no size gate: the plan gates NSIS and `.deb` only.
  - Unsigned Windows files: K16 and F-01.
  - AC-7 and AC-15 marked Done with Windows "not run": the theme and brand build does not depend on the OS.
  - Scope: nothing outside the P18 task list.

**Final summary (P18.9)**

- Changes with paths: the phase records P0 to P18 list them. P18 adds `deny.toml`, `about.toml`, `about.hbs`, `scripts/frontend-licenses.mjs`, `scripts/notice.mjs`, `scripts/appimage-libs.sh`, `licenses/`, `.github/workflows/release.yml`, the `licenses` CI job, the bundle config and `src-tauri/clawdio.desktop`.
- Assets and export sizes: the SVG masters and `src-tauri/icons/` (PNG 16 to 1024 px; ICO 16, 24, 32, 48, 64 and 256 px), as the P1 record lists.
- Magic UI: none. No component had a function the app needs (D6, `docs/theming-and-brand.md`).
- Tests and builds: `npm run check`, `cargo fmt`, `cargo clippy -D warnings`, `cargo test --workspace` and Chromium e2e pass locally; CI runs WebKit e2e and the Windows tests. The release build, `.deb` and AppImage built locally.
- Limitations and unverified platform checks: `docs/release-checklist.md` (Windows: every manual check; Linux desktop: GNOME, real audio, device unplug).
- Deviations from the reference: `docs/design.md` implementation notes (P17-AC7).

**Follow-ups:** F-20 (new); F-13 to F-18 open. F-19 was done in D50.

#### P19. Bulk import and missing-song repair (October 12, 2026)

- **Status:** Done with exceptions.
- **Start:** P18 is In progress (B3, B5). The owner waived the P18 dependency for P19 on October 12, 2026 ("tested and run on Windows; waive the blocker", section 13 v1.14).
- **Commits:** branch `clawd/practical-galileo-6jmhwb`, from `c1589fa`. Messages start with `P19:`.
- **Packages:** none new.

| Criterion | Result | Evidence |
|---|---|---|
| P19-AC1 | Pass | `import/matching.rs` tests: other extension in stage 1 and stage 2, longest suffix, same extension wins (also over a longer other-extension suffix), other album folder, stage 3 same extension only, two other-format hits ambiguous. Three tests fail with the extension pass removed. |
| P19-AC2 | Pass | `tests/bulk_import.rs` `the_name_rule_skips_existing_names_and_numbers_repeats`; `tests/import.rs` `a_second_import_is_skipped`. |
| P19-AC3 | Pass (Linux) | `a_folder_import_gives_the_golden_combined_report` (subfolders, `.M3U8`, `notes.XML`, a broken link as the unreadable file (Unix only), Apple XML with two playlists, sources byte-identical); `a_write_failure_keeps_the_playlists_written_before_it`. |
| P19-AC4 | Pass | `repair_replaces_matches_in_place_and_writes_nothing_without_a_match` (modified time unchanged), `repair_of_all_playlists_gives_the_golden_combined_report` (Favorites, nested `.m3u8`); `playlist/repair.rs` unit tests for CRLF, BOM and comment lines. |
| P19-AC5 | Pass | `import_and_repair_rescan_first_and_stop_on_a_canceled_scan` (real scan, canceled and failed scan, audio hash guard); `jobs.rs` `a_waiter_gets_the_outcome_of_the_next_scan_end`. |
| P19-AC6 | Not run here (E1) | `repair_on_a_read_only_folder_reports_the_error_and_changes_nothing` skips for root; the container runs as root. CI runs it as a normal user. |
| P19-AC7 | Pass (Chromium); WebKit in CI (E2) | `tests/e2e/playlists.spec.ts`: multi-file import, folder import with the busy state, both "Find missing songs" commands, the canceled report; every playlist call is checked for `/` and `\`. Full Chromium suite: 100 passed. |
| P19-AC8 | Not run (E3) | Manual Windows check with the owner's playlists. |
| P19-AC9 | Pass | `an_unmatched_relative_entry_keeps_its_folder_for_a_later_repair`. |

**Notes**

- N1: a matched missing entry with no `#EXTINF` line gets one before its path, with the path line's line end (R33.4 says "replaces"; the file had no line to replace). `docs/file-formats.md` states it.
- N2: the busy state is a text in the Playlists widget header, and the import buttons are disabled. The status line keeps the scan job, so its Cancel stays the one cancel (R32).
- N3: the "Playlist actions" button opens the widget menu. The name avoids the word "Menu", which the app menu button uses.
- N4: `docs/file-formats.md` said Import reads `.pls`; it never did. Fixed in the same section.

**Exceptions**

- E1: P19-AC6 skips as root in this container. It runs in CI (normal user).
- E2: WebKit e2e runs in CI only (no WebKit here). Local Chromium is build 1194 through `PW_CHROMIUM_PATH`.
- E3: P19-AC8 needs the owner's Windows machine and real playlists (B5).

**Blockers:** none for P19. P18 stays In progress (B3, B5).

**TWO-PASS REVIEW:** F1 1, F2 7, F3 0, F4 5. Source: own audit, a reviewer agent, then the Codex PR review.

- F1: the "Playlists menu" label matched the app's "Menu" button and broke nine e2e tests (strict locator). Renamed to "Playlist actions".
- F2:
  - A status line job for the import hid the running scan's Cancel, the only cancel (R32). The busy state moved to the widget.
  - The folder walk ran while the playlist and library locks were held. It now runs first.
  - A failed source used the raw name, a skipped one the cleaned name. Both use the cleaned name; the `ImportReport` doc says so.
  - An inserted `#EXTINF` line took the file's line end instead of its path line's.
  - The "same extension wins" test survived a no-preference matcher. A case with a longer other-extension suffix was added.
  - Codex: the folder check ran before the playlist lock, so a folder change in between let the work write to the old folder. The check now runs under the lock; a folder change clears the playlists under the same lock.
  - Codex: three text buttons and the menu button did not fit the 200 px minimum width. The header wraps; at 200 px the last control ends at 192 px.
- F4:
  - The Tauri `after_rescan` has no own test: its order comes from the core `after_scan` (tested), whose signature runs `work` only after a true scan result; `wait_for_end` is tested.
  - Lost wakeup in `wait_for_end`: `ACTIVE` goes down inside the `ENDS` lock, then `notify_all`.
  - Lock order: every nested site takes Playlists, then Library; the scan never nests them.
  - An unreadable `.m3u8` outside `Playlists/` is not a known name (D51): the set skips it, so it is not a playlist.
  - Codex: quadratic name checks in a bulk import. N sources cost N reads of `Playlists/`; for the expected hundreds of playlists that is well under a second, next to the matching and the writes. A name cache would add a second source of truth.

**Follow-ups:** none new.

---

#### P20. Microphone ducking (October 12, 2026)

- **Status:** Done with exceptions. K21 closed by the P20.0 probe (D54).
- **Commits:** branch `clawd/practical-galileo-6jmhwb`, from `c0fbc84`. Messages start with `P20:`.
- **Packages:** `windows` 0.62.2 (Windows only), the copy Tauri already uses, with audio, COM, registry and threading features. No new crate.
- **Owner decisions:** build a probe and the rest of P20 while the spike waits (P20.0 order changed); hide the control off Windows (D53).

| Criterion | Result | Evidence |
|---|---|---|
| P20.0 | Pass (owner, Windows) | A probe printed both candidate counts every 250 ms (CI artifact `mic-probe`, run 38289157298). Handy push-to-talk and a WhatsApp call each gave 0, 1, 0 on both signals. D54 keeps the audio sessions; the consent-store code and the probe were removed after the result. |
| P20-AC1 | Pass | `player/duck.rs` tests on a fake clock (Off, both modes, the 1 s wait, busy again, Play, user pause, Stop, mode changes, change to Off, ramps with start, middle, end, duration and an interrupted fade); `player/engine.rs` tests (track change, volume change, Stop during a Pause duck). |
| P20-AC2 | Pass | `settings.rs` tests: a pre-P20 file keeps its values, percentages outside 5 to 90 or off the step are refused; engine test: the snapshot volume (saved by R27) stays the user volume during a duck. |
| P20-AC7 | Pass | `mic.rs` tests: overlapping users, an active user at start, Off resets. |
| P20-AC3 | Pass (Chromium) | `tests/e2e/ducking.spec.ts`: modes, slider only for Lower volume, the saved choice, no control with `?linux=1` (D53). Full Chromium suite: 102 passed. WebKit in CI. |
| P20-AC4 | Not verified (E1) | Not run in the app. Partial evidence: the owner's second probe run showed two overlapping recorders (count 1, 2, 1 at 11.7 s, 26.6 s, 29.2 s), so the signal stays busy while one of two users stops. |
| P20-AC5 | Not verified (E1) | Owner decision, October 12, 2026: left unverified for now. |
| P20-AC6 | Pass in part (E2) | `mic` is compiled only for Windows and tests; `ducking_logs_only_busy_and_free` captures the log. The detector logs busy, free and a Windows error text only. The Windows code passed clippy for `x86_64-pc-windows-msvc` in a scratch crate; the full app check for that target runs in CI (`ring` needs the MSVC compiler). |

**Notes**

- N1: the duck tracks "microphone busy" in Off mode too, so a setting that leaves Off ducks at once; the detector stops reading in Off mode and sends "free" if it was busy.
- N2: fades run in the output source: the ramp is read every 256 samples, not on the 250 ms tick. The player thread also wakes at each duck deadline.
- N3: the requirements text of R34.7 still says "Windows only"; D53 records the owner's change.

**Exceptions**

- E1: P20-AC4 and P20-AC5 are not verified in the app (owner decision to continue). P21 repeats the manual Windows checks (AC-23, AC-24).
- E2: the full Windows clippy and tests run in CI only.

**Blockers:** none. K21 closed (D54).

**TWO-PASS REVIEW:** F1 0, F2 1, F3 0, F4 4. Source: own audit.

- F2: the ducked-volume slider sat in a `label` element with its own accessible name. Now a `div`.
- F4:
  - The duck flag survives a new folder (`Clear`): no Resume runs on a stopped player, and the next Play clears it.
  - A device failure during a Pause duck: the player stops; Resume acts only on Paused.
  - The detector creates the device enumerator on each read: four reads per second, small next to the audio work.
  - Duplicate busy events: the detector sends changes only, and the duck ignores repeats.

**Follow-ups:** none new.

#### P21. Release readiness after v1.6 (October 12, 2026)

- **Status:** Done with exceptions. P18 stays In progress (B3, B5); P21 repeats its checks with the same exceptions.
- **Commits:** branch `clawd/practical-galileo-6jmhwb`, from `907a0e4` (the P20 head). Messages start with `P21:`.
- **Packages:** none new. P20 added no crate: `windows` 0.62.2 was already in `NOTICE`.

| Criterion | Result | Evidence |
|---|---|---|
| P21-AC1 (P18-AC1) | Not run (E1) | No release tag was pushed. |
| P21-AC1 (P18-AC2) | Pass | `.deb` 9.36 MiB, AppImage 83.73 MiB (local release build of `907a0e4`). F-21, `measure.yml` run 38297586103 on `5625ff9`: NSIS installer 5.18 MiB, CI `.deb` 9.34 MiB. |
| P21-AC1 (P18-AC3, AC4, AC10) | Not run (E3) | Windows only. |
| P21-AC1 (P18-AC5) | Not verified (E3) | No Ubuntu desktop and no Debian 12 machine (B5). |
| P21-AC1 (P18-AC6) | Pass | Linux container 315 MB (worst mode median, 50,000 tracks), under the raised 468 MB target; 17 MB more than the P18 container value. F-21, run 38297586103 on `5625ff9`: Linux CI VM 293 MB (P18 294 MB), so the container growth does not show on the CI VM; Windows CI VM 144 MB (target 200 MB). The owner is told the numbers (R20). |
| P21-AC1 (P18-AC7, AC8) | Pass | Package contents checked (`.deb`, AppImage with LGPL texts); CI job `licenses` (cargo deny, `NOTICE` and third-party files) on `907a0e4`, run 38293560366. |
| P21-AC1 (P18-AC9) | Pass (Linux) | Brand swap demo again: only `theme/tokens.json`, the icon SVG and `src-tauri/icons/` changed; reverted. |
| P21-AC1 (P18-AC11) | Pass in part (E3) | As P18: Linux window title and desktop entry; Windows items not run. |
| P21-AC1 (P18-AC12), P21-AC2 | Pass under the P18-AC12 rule, with exceptions | `docs/release-checklist.md` records all 24 checks. Every "not run" names a missing platform; AC-23 and AC-24 are "not verified" by the owner's P20 decision. No check failed. AC-3 on Windows still waits for B3. |
| P21-AC1 (P18-AC13) | Pass | README lists ducking; `docs/file-formats.md` has the P19 and P20 sections. |

**Exceptions**

- E1: no release tag: a tag publishes a draft release, which the owner starts.
- E2 (closed by F-21): the Windows NSIS size and Windows memory need `measure.yml` on a `measure/**` branch, which needs the owner's permission (B10). The owner allowed `measure/p21` on October 12, 2026; run 38297586103 measured both.
- E3: no Windows machine, Ubuntu desktop or Debian 12 machine in this environment (B5).

**Blockers:** none for P21. B3 and B5 keep P18 In progress.

**TWO-PASS REVIEW:** F1 0, F2 1, F3 1, F4 2. Source: own audit.

- F2: the first footprint row mixed kB-based and MiB-based numbers. It now uses the script's MB values like the other rows.
- F3: F-21 (CI VM measurement; run 38297586103 on the P21 head `5625ff9`, which has the same app code as the P20 head `907a0e4`).
- F4:
  - "P19 and P20 change the package contents": the `.deb` and AppImage hold the same license files; only the app grew (`.deb` 9.26 to 9.36 MiB).
  - "Linux memory regression must block": D49 sets the Linux gate at 468 MB; 315 MB passes it, and R20 asks only that the owner is told.

**Follow-ups:** F-21 (done: run 38297586103).

#### P22. Library frame splitters (October 13, 2026)

- **Status:** Done with exceptions.
- **Commits:** branch `clawd/zen-hopper-rszalw`, from `b05f619`. Messages start with `P22:`.
- **Packages:** none new. `SplitviewReact` comes from `dockview-react` 8.5.1 (D56).

| Criterion | Result | Evidence |
|---|---|---|
| P22-AC1 | Pass | `src/store/library.test.ts`: per-group fractions survive a mode switch; `resetFrames`. `src/shell/layouts.test.ts`: each built-in layout and Reset layout restore the defaults of all modes. |
| P22-AC2 | Pass | `src/shell/persistence.test.ts`: a file without `libraryFrames` (defaults, no log), a round trip, four invalid `columns` cases, an unknown property in `topBottom`, an unknown mode key, a non-object value; each with one log line and the dock and the other mode kept. A frame change saves after 500 ms. |
| P22-AC3 | Pass (Chromium) (E1) | `tests/e2e/frames.spec.ts`: Columns and Top/bottom drags, a mode switch keeps the Columns sizes, a reload keeps both modes, Ctrl+Shift+L restores the defaults, Tree mode has no frame splitter; a 1 px drag is saved too. |
| P22-AC4 | Pass (Chromium) (E1) | `frames.spec.ts`: a drag stops at the 96 px minimum; at 800 x 560 with six widgets no frame has zero size and the page has no horizontal scroll; the sash hover line is `border.strong`; the sash has no Tab stop. |

**Notes**

- N1: Dockview's splitview reports a layout change only at the end of a sash drag (`onDidSashEnd`), so only a drag writes the store. The container size drives `layout()` (`disableAutoResizing`), and each resize applies the saved fractions again.
- N2: the store API is `setFrames(group, fractions)` with the groups `columns`, `top` and `rows`, in place of `setFrames(mode, fractions)` (P22.2): Top/bottom has two splitter groups.
- N3: `addPanel` focuses the new panel. `FrameSplit` puts focus back where it was, so the frames do not take focus at start (P2-AC10) or on a keyboard mode switch (new test in `frames.spec.ts`).
- N4: Dockview draws the frame separator over the frame's left edge. The theme adds 1 px padding on each later frame, so the selected-row marker stays visible (P6-AC9).

**Exceptions**

- E1: WebKit is not installed in this environment. The Playwright suite ran in Chromium (106 passed); CI runs WebKit. The manual Windows check of AC-25 is P23-AC7.

**Blockers:** none.

**TWO-PASS REVIEW:** F1 0, F2 8, F3 0, F4 4. Source: own audit, the full e2e run, CI and the PR review (Codex, DeepSource).

- F2:
  - A mode switch reused the splitview of the other mode, so Top/bottom showed three stacked frames. Each mode body now has its own key.
  - The new frames took focus at start, which broke the F6 order (P2-AC10). Fixed (N3).
  - The separator hid the selected-row marker (P6-AC9). Fixed (N4).
  - A doc comment in `persistence.ts` ran past the line width.
  - CI: P22-AC3 measured and dragged before a new splitview had its first layout (empty sizes in Chromium, a missed drag in WebKit). `sizes` now waits until every frame has a size.
  - CI (WebKit): P22-AC3 grabbed the Top/bottom rows sash at its middle, where the Artist and Album sash ends on it; WebKit gave the press to the nested sash. The test now grabs a quarter along the sash and hovers first, so Playwright checks the sash receives the pointer. A user who grabs that junction moves the sash the browser picks, as at any Dockview sash junction (F4).
  - Codex: a sum exactly at the 0.01 tolerance (0.33 + 0.33 + 0.33) failed by floating-point error. A 1e-9 slack fixes it, with a test.
  - DeepSource: a one-child fragment in `FrameContent`. Removed.
- F4:
  - DeepSource: an empty async mock in `persistence.test.ts` follows the file's existing mock pattern (`vi.fn(async () => {})`).
  - DeepSource: the early `return` in a `useEffect` callback is the React idiom; the cleanup return is the only value.
  - `applyMeasureLayout` does not reset frame sizes: the measurement layout is not saved (P3.1).
  - Sashes have no keyboard resize: R28.1 asks for mouse only (K5, section 7 of the requirements).

**Follow-ups:** none new.

#### P23. Bar widgets and Windows build (October 13, 2026)

- **Status:** Done with exceptions. P23.1 to P23.5 are done. P23-AC7 (owner check on Windows) is open (E2).
- **Windows build (P23.5):** Release run 38377951211 (`workflow_dispatch`, Windows only) on `8c78a44`: artifact `windows`, `Clawdio_0.1.0_x64-setup.exe` 5,433,981 bytes (5.18 MiB), under the 30 MB check. Later commits change only a Rust test and docs, so the app code is the same.
- **Commits:** branch `clawd/zen-hopper-rszalw`, after the P22 commit `15e2035`. Messages start with `P23:`.
- **Packages:** none new.
- **K23:** closed before P23.1 (section 9): Dockview 8.5.1 has `preventDefault()` on `onWillShowOverlay` and `onWillDrop`, and group `maximumHeight`.

| Criterion | Result | Evidence |
|---|---|---|
| P23-AC1 | Pass | `src/shell/bar-rules.test.ts`: both bar widgets on every position of a non-bar group, of the other bar group and of the window; a non-bar widget on each position of a bar group (alone and in a shared row) and of a non-bar group; `sharesRow`. |
| P23-AC2 | Pass | `bar-rules.test.ts` (`barViolations`): Transport controls in the Library tab group, beside Library, Now playing in the Play queue tab group, and three valid arrangements. `src/shell/persistence.test.ts`: the repair with one log line, a valid top bar with none. |
| P23-AC3 | Pass | `src/shell/clamp.test.ts`: bar groups locked at the bar height, a shared row at the larger height, a new measured height, non-bar groups shrink first (six widgets in 504 px), at the floor both bar limits fall together, a taller dock restores them. |
| P23-AC4 | Pass (Chromium) (E1) | `tests/e2e/bars.spec.ts`: Transport controls dropped on the window top edge (Library and Play queue side by side) is one full-width row with both below it; dropped on the top zone of Library it is one full-width row at its content height plus the header, and Library is below it; a splitter drag does not change the bar height; a drop on the left of Library shows no overlay and moves nothing; a drop into the Library tab bar is refused; the default bar row has both bars at the larger height; Play queue cannot join the Transport controls group or split the bar row. |
| P23-AC5 | Pass (Chromium) (E1) | `bars.spec.ts`: a saved layout with Transport controls in the Library tab group starts with it in the bottom bar beside Now playing, and the log has the repair line; a top bar survives a reload with no repair line. |
| P23-AC6 | Pass (Chromium) (E1) | `bars.spec.ts` at root font size 100%, 125% and 140%: the content never overflows its bar and leaves at most 4 px empty; the bar follows the change without a reload. |
| P23-AC7 | Not run (E2) | The owner checks AC-25 to AC-27 on Windows with the P23.5 package (run 38377951211, artifact `windows`). |

**Notes**

- N1: the window edge drop is the Dockview root drop target: a 10 px band along the dock edge, with event kind `edge`. Over a group's content the group's own zones take the drop first. `dropAllowed` treats `edge` as the window. The first P23 test missed the band and this note said the zone did not exist; Codex found the gap and a test now drops on it (F2).
- N2: D58 gained a case found in P23: a non-bar widget dropped on the top or bottom of a bar group in a shared row would split the row, so it is refused (`sharesRow`).
- N3: the bar content sits in a block with auto height (`BarContent` in `DockShell.tsx`), so the widgets' own `h-full` falls back to the content height. A `ResizeObserver` reports it; a change runs the clamp again.
- N4: six P2 and P9 tests dragged or tabbed the bar widgets as ordinary widgets. R29.1 now refuses those drops, so the tests use Play queue, Playlists and Library; each keeps its original check (edge dock, tabbed group, splitter, one Library, overlay style, tabbed group restart).
- N5: the e2e mock now records log lines (`window.e2eLog`) for P23-AC5.

**Exceptions**

- E1: WebKit is not installed in this environment. The Playwright suite ran in Chromium (115 passed); CI ran Chromium and WebKit on `5414940` and passed.
- E2: P23-AC7 is a manual check on Windows. This environment has no Windows desktop, so the owner runs it.

**Blockers:** none.

**TWO-PASS REVIEW:** F1 0, F2 8, F3 0, F4 4. Source: own audit, the full e2e run and the PR review (Codex, CodeRabbit, DeepSource).

- F2:
  - Codex: the window top edge drop had no test; the first notes said Dockview had no such zone. It does (N1). A test now drops Transport controls on it over a side-by-side layout. D58 is corrected.
  - Codex: a splitter drag under 0.2% of its group was not saved (`SAME_FRACTION` skip in `FrameSplit.tsx`). Every drag end is saved now, with a test. This is P22 code, fixed in this phase.
  - Codex: the `layout.json` example in `docs/file-formats.md` had Now playing in the Play queue tab group, which rule 5 repairs. The example now gives Now playing its own bottom row.
  - CI (rust, windows-latest): the P15 lyrics cancel test cancelled after a fixed 300 ms sleep, before the fetch had its cancel token on a slow runner. It now cancels once the mock server has the request (commit `99131c9`).
  - A non-bar widget could split a shared bar row (N2). Refused now.
  - Six earlier tests used bar widgets as ordinary drag targets (N4). Updated.
  - Codex and CodeRabbit: the repair re-added a misplaced bar beside its partner even when the partner sat in a top row, so it did not reach the bottom bar. `repairBars` now puts it beside the partner only when the partner is in the bottom bar (`inBottomBar`, which looks through the one-child root Dockview saves), else as a new bottom row. New unit and restore tests.
  - DeepSource: three effects returned early; each now creates its observer first and always returns the cleanup.
- F4:
  - A mixed group from an old file locks its height until the repair a moment later: the repair runs in the same start step.
  - `dropAllowed` serializes the dock on each overlay event: six widgets, small next to the drag itself.
  - The first frame uses the 80 px content default until the measurement arrives: the P17 value, so no visible jump in the default arrangement.
  - A drag from outside the dock (no panel data) passes the rule: it is not a widget, and the app accepts no external drops.

**Follow-ups:** none new.

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
| D21 | A new playlist name that matches an existing file (ignoring case) is rejected with a message. Import names: each forbidden character becomes "_", leading and trailing spaces and dots are removed, a reserved name gets " (imported)" and a taken name gets " (2)", " (3)" and so on. From P19, D51 replaces the taken-name part for imports. | R12 rule applied to R14 output names. |
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
| D33 | Window minimum 800 x 560, default 1200 x 800. Widget minimums (width x height): Library 320 x 240, Transport controls 320 x 112, Now playing 240 x 112 (P17 raised both from 88: their content needs 80 px under the 32 px header), Playlists 200 x 160, Play queue 200 x 160, Lyrics 200 x 160. P3 may tune them and records the change. | Section 5 (window smaller than layout). |
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
| D50 | Linux only: the app sets `WEBKIT_DISABLE_COMPOSITING_MODE=1` and `WEBKIT_DISABLE_DMABUF_RENDERER=1` before GTK starts (a value the user set wins), limits glibc to two malloc arenas and trims the heap after each scan (`src-tauri/src/linux_memory.rs`). | Owner asked for a Linux memory reduction (B9, October 12, 2026). Measured worst mode: 519 MB to 298 MB (container), 450 MB to 294 MB (CI VM); input latency did not get worse (max 24 ms against 64 ms). |
| D51 | Import name rule (R32): a source whose cleaned name matches an existing playlist (ignoring case) is skipped and reported. Inside one import, a name that an earlier source of the same import took gets " (2)", " (3)" and so on. The reserved-name rule of D21 stays. | Owner decisions 17 and 18 (requirements v1.6). A repeat import must not duplicate playlists. |
| D54 | Microphone signal (P20.0, R34.2): the active audio sessions on the active capture endpoints (WASAPI `IAudioSessionManager2`), other than the app's own process, read every 250 ms. The app opens no capture stream. The privacy consent store gave the same result and was dropped: one signal, a documented API. | P20.0 probe on the owner's Windows machine, October 12, 2026: both signals went 0, 1, 0 for Handy push-to-talk (6.1 s to 9.6 s) and for a WhatsApp call (204.3 s to 207.9 s). |
| D53 | Microphone ducking off Windows (R34.7): Settings does not show the ducking control at all, in place of a disabled control with "Windows only". The settings keys still load and save. | Owner decision, October 12, 2026 ("hide the setting on Linux"). |
| D52 | Duck timing (R34.5): fade down 150 ms, wait 1 s after the microphone is free, fade up 500 ms. Fades are linear on the output gain. Pause mode resumes with the same 500 ms fade in. The values are constants, not settings. | Owner decision 26 (short fixed wait, then a fade). R34.5 gives "about" values. |
| D55 | Library frame sizes (R28.1) are an optional `libraryFrames` field in `layout.json`: `columns` holds three fractions (Artist, Album, Songs) and `topBottom` holds `top` (Artist, Album) and `rows` (top row, Songs). Fractions, not pixels, so a window change keeps the proportions. The version stays 1: a file without the field loads with the default sizes, and an older app ignores the field. An invalid entry for one mode, or an unknown property inside it, gives that mode its defaults and one log line. An unknown mode key is ignored with one log line. The other mode and the dock still load (requirements section 5). Defaults are the old fixed ratios: Columns 1:1:2, Top/bottom top row 1:1 and rows 1:1. | R28.1 says frame sizes are part of the arrangement. A version change would make an older app drop the whole arrangement. |
| D56 | Frame splitters use `SplitviewReact` from `dockview-react`, which is already a dependency. Its sashes take the dock splitter styles (P2.10), so no new component and no new dependency. Frame minimums: 96 px wide, 64 px tall (three Columns frames fit the 320 px Library minimum of D33). When the Library is smaller than the sum, the frame minimums scale in proportion, as in D45. Sashes are not in the Tab order (R28.1 mouse only, K5). | Edits rules 4 and 5: reuse the existing splitter code. |
| D57 | **Superseded (October 13, 2026):** the transport band leaves the dock (UD2 in `docs/planning/ui-shell-rework-build-plan.md`); U1 deletes the bar-widget code. Kept as history. Bar height (R29.1): each bar widget's height is its measured content height plus the 32 px header. A `ResizeObserver` on the content measures it, so text scaling (Windows display scale, GNOME Large text, P17.5) changes it. The bar group's minimum and maximum height both equal it. When the two bar widgets share a row, both groups take the larger value. P23-AC6 fails when the content overflows or leaves more than 4 px empty, at the default font and at the P17.5 scales. | "Natural content height" needs a testable value. A fixed constant clips under large text (P17 note N2), and design.md §9 requires text scaling. |
| D58 | **Superseded (October 13, 2026):** the transport band leaves the dock (UD2 in `docs/planning/ui-shell-rework-build-plan.md`); U1 deletes the bar-widget code. Kept as history. Bar drop rules (R29.1) live in one pure function, `allowDrop(source, target, position)` in `src/shell/bar-rules.ts`. A bar widget may drop on a top or bottom edge of a group or of the window, and on the left or right of a group that holds only the other bar widget. It may never drop into the center (tab) or a tab bar. A non-bar widget may not drop into the center of a bar group or on its left or right, and not on its top or bottom while the bar group shares a row (that would split the row), so a bar row holds bar widgets only. All other drops are unchanged. A refused drop shows no overlay and writes no log line. The window edges are the Dockview root drop target (event kind `edge`), a 10 px band along the dock edge. | R29.1 makes bar rows full width at a fixed height. A non-bar widget in the row would take the fixed height too. The shared-row case was found in P23. |
| D59 | **Superseded (October 13, 2026):** the transport band leaves the dock (UD2 in `docs/planning/ui-shell-rework-build-plan.md`); U1 deletes the bar-widget code. Kept as history. Clamp with bar widgets (requirements section 5, v1.7): the D45 clamp lowers the minimums of non-bar groups first. Bar group heights fall only when the non-bar groups are at their D45 floor, and never below 32 px. The clamp then lowers both the minimum and the maximum of each bar group (D57 locks both), and restores both to the D57 height when space returns. | Section 5 says bar widgets keep their heights and the other widgets shrink first. |

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
| B9 | P18.5 Linux idle memory was 519 MB, over the raised Linux target of 468 MB (D49). | P18-AC6 on Linux. | Closed October 12, 2026: the owner asked for a reduction. D50 gives 298 MB in the container and 294 MB on the CI VM (under 468 MB; between 200 and 300 MB, so the owner is told the number, R20). The owner accepted 294 MB (CI VM) as the Linux value on October 12, 2026. |
| B10 | The P18.5 Windows numbers need `measure.yml` on windows-latest, which runs on a push to a `measure/**` branch (as B8). | P18-AC6 on Windows and the NSIS size. | Closed October 12, 2026: the owner allowed a push to `measure/p18`. Run 38204302435: Windows 146 MB, NSIS 5.12 MiB. |

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
| App shell | `tauri` / `tauri-build` | 2.12.3 / 2.7.2 | No extra features; thumbnails use the `thumb://` scheme (D41). Feature `test` in dev-dependencies only |
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

**CI** (`ci.yml`, on push and pull request; a change that touches only `**/*.md` and `docs/**` skips CI):
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
  -> P19 bulk import and repair -> P20 microphone ducking -> P21 release readiness again
  -> P22 Library frame splitters -> P23 bar widgets and Windows build
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

### P19. Bulk import and missing-song repair

**Objective.** Import many playlists in one action, match songs stored in another format and repair playlists that hold missing entries.

**Scope.** R32. R33. R13 (v1.6 note). R14 (v1.6 items). Requirements section 5 (v1.6 import cases). AC-22. D51.

**Depends on.** P18.

**Tasks.**

- **P19.1** Matching (R33.2) in `import/matching.rs`: index each track also by its file name without extension. Stage 1 and stage 2 first look for hits with the same extension; with none, they repeat the stage with the extension of the last part removed. Stage 2 keeps its longest-suffix ranking in that pass (at least a folder and the file name). Stage 3 is unchanged.
- **P19.2** Name rule (D51) in `playlist/name.rs` and `import/mod.rs`: skip a source whose name matches any known playlist, in `Playlists/` or anywhere else in the music folder (today `check_name` sees `Playlists/` only); number names that repeat inside one import. `ImportReport` gets a status: imported, skipped or failed (`ts-rs` bindings).
- **P19.3** Batch import (R32): `playlist_import` uses a multi-file picker (`blocking_pick_files`). A new `playlist_import_folder` command opens a Rust folder picker and walks the folder and all subfolders for `.m3u`, `.m3u8` and `.xml` (extension without case). Sources import in path order. One combined report. The UI shows a busy state; the only cancel is the scan's (P19.4). An unmatched relative entry of the M3U family that resolves inside the music folder is written relative to the new `.m3u8`; other unmatched entries keep their text.
- **P19.4** Rescan first (R33.1): import and repair start the incremental scan, wait for it (or for a running scan) to end, then match against the updated index. A canceled or failed scan stops the import or repair before matching: nothing is written and the report says "Canceled, nothing changed".
- **P19.5** Repair (R33.3 to R33.5) in `playlist/`: for each missing entry, build a source entry from its path and `#EXTINF` text and run the matcher with the playlist file as the stage 1 base. A unique match replaces the path and the `#EXTINF` line at the same position. Other lines stay byte-identical. Atomic write; no write when nothing changed. Commands `playlist_find_missing(id)` and `playlist_find_missing_all()` return the repair report.
- **P19.6** UI: "Import folder" next to "Import playlist" in the Playlists widget. Context menu "Find missing songs" on a playlist with missing entries. Widget menu "Find missing songs in all playlists". Report dialog with imported, skipped, failed and repaired sections. Labels are names only (D13).
- **P19.7** Docs: `docs/file-formats.md` playlist import section (extension rule, name rule, repair).

**Acceptance criteria.**

- **P19-AC1** Unit tests: `Song.m4a` matches `Song.mp3` in the same folder part (stages 1 and 2); `OldRoot/Artist/Album/Song.m4a` matches `Artist/Album/Song.mp3` over `Other/Album/Song.mp3` (longest suffix); a same-extension hit wins; a different album folder does not match; stage 3 does not match across extensions; two other-format hits give "more than one match".
- **P19-AC2** Unit tests for D51: an existing name (other letter case) is skipped and reported, also when the existing playlist is outside `Playlists/` (for example `Artist/Mix.m3u8`); two sources with one name in a batch give "Name" and "Name (2)"; "Favorites" gives "Favorites (imported)".
- **P19-AC3** Folder import of a fixture tree (subfolders, upper-case extensions, a non-Apple `.xml`, an unreadable file, an Apple XML with two playlists) gives the golden combined report and `.m3u8` files. Source files stay byte-identical. With a write failure injected after the first source, the first playlist is on disk and the later ones are not.
- **P19-AC4** Repair of a fixture playlist with `.m4a` entries, an ambiguous entry and a not-found entry: matched entries change in place, the others and all other lines are byte-identical, the report is correct. A playlist with no match is not written (modified time unchanged). "Find missing songs in all playlists" on a tree with several eligible playlists, including Favorites and a nested `.m3u8`, repairs each one and gives the golden combined report and files.
- **P19-AC5** A song added to the folder after the last scan matches during import and repair (rescan first). A canceled or failed prerequisite scan, for import and for repair, writes no playlist and gives the "Canceled, nothing changed" report.
- **P19-AC9** Import of `Artist/Album/list.m3u` with an unmatched `Song.m4a` writes `../Artist/Album/Song.m4a`; after `Song.mp3` is added, "Find missing songs" repairs it. An unmatched absolute entry keeps its text.
- **P19-AC6** Repair on a read-only folder shows the error and changes no file.
- **P19-AC7** Playwright: multi-file import, folder import, both "Find missing songs" commands and the report dialog. IPC payloads hold no path.
- **P19-AC8** Manual on Windows (AC-22): several playlist files picked in one picker action import together; the owner's real playlists import from one folder; repair fixes other-format entries. The files are never committed.

**Verification.** Rust tests (P19-AC1 to P19-AC6, P19-AC9). Playwright (P19-AC7). Manual Windows (P19-AC8).

---

### P20. Microphone ducking (Windows)

**Objective.** Lower or pause the music while another app uses a microphone, on Windows, without the app opening a microphone.

**Scope.** R34. Requirements section 5 (v1.6 ducking cases), section 6 (platform exception, microphone privacy). AC-23. AC-24. D52.

**Depends on.** P19.

**Tasks.**

- **P20.0** Spike (K21): find a Windows API that reports "another process records from a microphone" without opening a capture stream. Candidates to test (unverified assumptions): the per-app microphone `LastUsedTimeStart` and `LastUsedTimeStop` values under the `CapabilityAccessManager\ConsentStore\microphone` registry key (packaged and `NonPackaged` apps), and WASAPI `IAudioSessionManager2` session states on the active capture endpoints. Test each with Handy (push-to-talk) and one call app. Record the choice and the evidence as a new D entry. If no candidate works for both, stop and ask the owner.
- **P20.1** Settings (R34.1, R34.3): `micDucking` (`"off"`, `"lower"`, `"pause"`, default `"off"`) and `micDuckPercent` (5 to 90, step 5, default 20) in `settings.json`, validated in `clawdio-core` settings. Both fields have Serde defaults, so a `settings.json` written before P20 loads with all its values and the version stays 1. Document both in `docs/file-formats.md`.
- **P20.2** Detector in `src-tauri/src/mic.rs` (Windows only, `cfg(windows)`): watches the P20.0 signal, ignores the app's own process and sends "microphone busy" and "microphone free" to the player thread. It is busy while any other app records, so one app stopping while another records sends nothing. It reads the current state at start and when the setting leaves Off, so a microphone that is already in use ducks at once. It logs state changes only, never app names.
- **P20.3** Duck state in the player engine (R34.4 to R34.6, D52): the output gain is user volume times the duck factor. Pause mode keeps a "paused by duck" flag; only that flag resumes playback. Play during a Pause duck clears the flag and blocks a new pause until the next "microphone busy". Stop or a user Pause clears the flag. A change of the setting to Off ends an active duck: the gain fades back, or a duck-paused track resumes. A change between Lower volume and Pause during a duck applies at once (requirements section 5). The saved volume and the volume control use the user volume. The fades follow D52 on their own deadlines, not on the 250 ms player tick (for example a gain ramp in the output source).
- **P20.4** Settings UI: "When the microphone is in use" with Off, Lower volume and Pause, and a percentage slider shown for Lower volume. Help text names tools that keep the microphone open. Other platforms do not show the control (D53).

**Acceptance criteria.**

- **P20-AC1** Unit tests for the duck state machine with a fake clock: Off ignores busy and free (no pause, no gain change, no restore); a change to Off while busy, from Lower volume (gain restored) and from Pause (track resumes); Stop during a Pause duck (no resume when free); Lower volume to Pause while busy (pause, gain back to the user volume) and Pause to Lower volume while busy (resume at the ducked gain); busy and free in both modes, the 1 s wait, busy again during the wait, Play during a Pause duck, a user pause during a duck, a volume change during a duck, a track change during a duck, busy while stopped. Gain assertions: start, middle and end values and the duration of the 150 ms fade down and the 500 ms fade up, and a fade that the other event interrupts.
- **P20-AC2** Unit tests: the saved state (R27) stores the user volume during a duck; settings reject a percentage outside 5 to 90 or off the 5 step; a pre-P20 `settings.json` (no ducking fields) loads with its music folder and other values unchanged and the ducking defaults.
- **P20-AC7** Unit tests for the detector's aggregation with a fake session source: two overlapping users, the first stops (still busy), the second stops (free); a user already active at start gives busy at once.
- **P20-AC3** Playwright: the setting values, the slider only for Lower volume, no control when the platform is not Windows (D53, mocked IPC).
- **P20-AC4** Manual Windows: AC-23 with Handy and one call app, in both modes. Handy used during a call keeps the duck until the call ends. The app started while the call app already records ducks at once.
- **P20-AC5** Manual Windows: AC-24. The Windows microphone privacy page lists no microphone use by the app after P20-AC4.
- **P20-AC6** Review: `cargo clippy` for `x86_64-pc-windows-msvc` passes; Linux builds hold no detector code. A captured-log test and a code review show that the detector logs only busy and free, never an app name, path or id.

**Verification.** Rust tests (P20-AC1, P20-AC2, P20-AC7). Playwright (P20-AC3). Manual Windows (P20-AC4, P20-AC5). Review (P20-AC6).

---

### P21. Release readiness after v1.6

**Objective.** Repeat the release checks on the product with P19 and P20, so the released packages include them.

**Scope.** Same as P18, plus AC-22 to AC-24.

**Depends on.** P20.

**Tasks.**

- **P21.1** Run P18.3 (packages), P18.4 (licenses and `NOTICE` for any new crate, for example Windows API crates from P20), P18.5 (footprint) and P18.6 (docs) again.
- **P21.2** Run AC-1 to AC-24 on the platforms of P18.7 and record the results in `docs/release-checklist.md`.

**Acceptance criteria.**

- **P21-AC1** P18-AC1 to P18-AC13 pass again on the P20 head, or carry a recorded exception as in P18.
- **P21-AC2** `docs/release-checklist.md` records a result for each of the 24 checks under the P18-AC12 rule.

**Verification.** As P18.

---

### P22. Library frame splitters

**Objective.** Let the user resize the Artist, Album and Songs frames in the Library widget, and keep the sizes per mode.

**Scope.** R28.1. Requirements section 5 (v1.7 frame-size case). AC-25. design.md §5 (Library widget). D55. D56.

**Depends on.** P21.

**Tasks.**

- **P22.1** Frames in `src/widgets/library/LibraryWidget.tsx` (D56): Columns uses one horizontal `SplitviewReact` with three views. Top/bottom uses a vertical one with two views; its top view holds a horizontal one with Artist and Album. Tree mode does not change.
- **P22.2** Store: `useLibraryStore` keeps the frame fractions per mode, with `setFrames(mode, fractions)` and `resetFrames()`. A mode switch keeps them. `applyLayout` and `resetLayout` in `src/shell/layouts.ts` call `resetFrames()` for all modes.
- **P22.3** Persistence (D55) in `src/shell/persistence.ts`: `currentLayout` writes `libraryFrames`; `parseLayout` checks it (array lengths, finite positive values, sum within 0.01 of 1). An invalid mode entry gives that mode its defaults and one `layout:` log line. `watchLayout` also saves 500 ms after a frame change.
- **P22.4** Minimums and clamp (D56): 96 px wide and 64 px tall. They scale in proportion when the Library is smaller than their sum.
- **P22.5** Docs: `docs/file-formats.md` `layout.json` section adds `libraryFrames` (R17).

**Acceptance criteria.**

- **P22-AC1** Unit tests: `setFrames` per mode; a mode switch keeps both modes' fractions; `applyLayout` (each built-in layout) and `resetLayout` restore the defaults of all modes.
- **P22-AC2** Unit tests: a version 1 file without `libraryFrames` loads with defaults; a round trip keeps both modes; an invalid `columns` entry gives Columns defaults and one log line, and keeps `topBottom` and the dock; an unknown property inside `topBottom` gives Top/bottom defaults and one log line, and keeps `columns`; an unknown mode key is ignored with one log line, and both known modes load.
- **P22-AC3** Playwright (AC-25): in Columns, drag both splitters; the frame widths change. Switch to Top/bottom and back: the Columns sizes stay. Drag the Top/bottom splitters, reload: both modes keep their sizes. Reset layout restores the defaults. Tree mode shows no frame splitter.
- **P22-AC4** Playwright: a drag cannot take a frame below its minimum. At 800 x 560 with all six widgets, no frame has zero size and the page has no horizontal scroll. The frame splitter colors equal the dock splitter tokens (as P2-AC7). The splitters are not in the Tab order.

**Verification.** Vitest (P22-AC1, P22-AC2). Playwright (P22-AC3, P22-AC4).

---

### P23. Bar widgets and Windows build

**Superseded (October 13, 2026):** the UI shell rework (`docs/planning/ui-shell-rework-build-plan.md`, U1) replaces the bar-widget model of this phase (D57 to D59) with a fixed transport band outside the dock. The tasks and criteria below are history. P23-AC7 stays open only as the owner's check of the Windows package; AC-26 and AC-27 are no longer required.

**Objective.** Keep Transport controls and Now playing as thin full-width bars wherever they dock, repair old arrangements, and build a Windows package with P22 and P23.

**Scope.** R29.1. R5 (v1.7 bar widget notes). R29 (v1.7 tab exception). Requirements section 5 (v1.7 bar cases). AC-26. AC-27. design.md §5 (bar widgets, tabbed groups). D57. D58. D59. K23.

**Depends on.** P22.

**Tasks.**

- **P23.1** Bar height (D57): a measured bar height for `transport` and `nowPlaying`. `addWidget`, every load and drop, and each content size change set the bar group's minimum and maximum height to it; a shared row uses the larger value. If Dockview 8.5.1 cannot lock a group height, stop and ask the owner (K23).
- **P23.2** Drop rules (D58) in `src/shell/bar-rules.ts`, wired to the Dockview drop overlay event in `DockShell.tsx`. If Dockview 8.5.1 cannot refuse an overlay for each drop, stop and ask the owner (K23).
- **P23.3** Repair (R29.1): `restoreLayout` checks each bar panel after `fromJSON` and before the clamp. A bar panel in a tab group with another widget, or in a row with a non-bar widget, is removed and added again at its `showPosition` (the default bottom bar). One log line per repair names the widget id only.
- **P23.4** Clamp (D59) in `src/shell/clamp.ts`.
- **P23.5** Release: run the Release workflow (`workflow_dispatch`) on the P23 head for Windows. Record AC-25 to AC-27 in `docs/release-checklist.md`.

**Acceptance criteria.**

- **P23-AC1** Unit tests for `allowDrop`: each bar widget on the top, bottom, left, right and center of a non-bar group, of the other bar widget's group and of the window; a non-bar widget on each position of a bar group and of a non-bar group. Results follow D58.
- **P23-AC2** Unit tests for the repair: Transport in the Library tab group; Transport beside Library; Now playing in the Play queue tab group; a valid arrangement with a top bar (unchanged, no log line). Each repair writes one log line with the widget id.
- **P23-AC3** Unit tests for D59: with a short dock, non-bar minimums fall first and bar heights stay; at the D45 floor, the minimum and maximum of each bar group fall together, never below 32 px; a taller dock restores both to the D57 height.
- **P23-AC4** Playwright (AC-26): drag Transport controls to the window top edge: one full-width row at the D57 bar height, and Library gets the rest. A drag of that row's splitter does not change its height. A drop on the left of Library shows no overlay and moves nothing. A drop into the Library tab bar is refused. Now playing dropped on the right of Transport controls shares its row at the larger height. Play queue cannot join the Transport controls group.
- **P23-AC5** Playwright (AC-27): a saved layout with Transport controls in the Library tab group starts with Transport controls in the bottom bar and the rest unchanged; the log has the repair line. A top bar survives a reload.
- **P23-AC6** Playwright: at the D57 bar height, each bar widget's content does not overflow and leaves at most 4 px empty. Run at the default font and with the root font size at 125% and 140% (the P17.5 cases); the bar height follows the change without a reload.
- **P23-AC7** Manual Windows: the owner runs the P23.5 package and checks AC-25 to AC-27. `docs/release-checklist.md` records the result.

**Verification.** Vitest (P23-AC1 to P23-AC3). Playwright (P23-AC4 to P23-AC6). Manual Windows (P23-AC7).

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
| K21 | No Windows API may report microphone use by another app without opening the microphone (R34.2 is an unverified assumption) | R34 cannot ship as specified | Closed October 12, 2026: the P20.0 probe found two working signals; D54 | P20 |
| K22 | A tool that keeps the microphone open (Handy "Always-On Microphone") holds the duck | Music stays quiet | Settings help text (P20.4); requirements section 5 | P20 |
| K23 | Dockview 8.5.1 may not refuse a drop overlay for each widget or lock a group height | R29.1 cannot ship as specified | Closed October 13, 2026: `onWillShowOverlay` and `onWillDrop` take `preventDefault()`, and group constraints take `maximumHeight` (8.5.1 typings; P23-AC4 passes) | P23 |

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
| AC-22 | Bulk import and repair of real playlists | P19-AC8 |
| AC-23 | Microphone ducking with Handy and a call app | P20-AC4 |
| AC-24 | No microphone access by the app | P20-AC5 |
| AC-25 | Library frames: per mode, survive restart, Reset restores | P22-AC3, P23-AC7 |
| AC-26 | Bar widgets: top edge row, side and tab drops refused, shared row | P23-AC4, P23-AC7 |
| AC-27 | Old arrangement repaired at start | P23-AC5, P23-AC7 |

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
| F-18 | On Windows, resolve playlist entries without letter case when the exact path is not a library track (`../björk/…` for `Björk/…`). | NTFS ignores case, so VLC opens such an entry, but the app shows it as missing. | P11 review |
| F-17 | Remove thumbnail files whose key no longer matches an album (a changed cover or a rescan leaves old files), for example at the end of a complete scan. Mark an album "in progress" so two workers do not make it twice. | The thumbnail folder grows with each art change; duplicate work costs CPU only. | P10 review |
| F-16 | The scan's cover state (D44) decodes by file extension; the art source decodes by content. A PNG named `cover.jpg` is "broken" for online lookups but shows as art. Decode by content in `scan::update_covers` too. | Two decode rules for one file. | P10 review |
| F-15 | `commands/settings.rs` `io_error` sends the error text to the webview. A failed `settings.json` write (disk full, read-only folder) prints the temp file path, so a config path reaches the webview against D13. Log the full error and return a fixed message, as `layout_save` does. | Found in the P9 review; the code is from P4. | P9 review |
| F-14 | Send the MPRIS `Seeked` signal when the app seeks: patch or replace souvlaki's MPRIS part (K2 fallback). | souvlaki 0.8.3 sends `Seeked` only for a D-Bus `Seek`. GNOME's panel extrapolates the position, so after a seek in the app it shows the old position until the next update. `playerctl position` reads the property and is correct. | P8 review |
| F-13 | `library_tree` returns ids only. The webview fetches artist and album names for the visible rows, or loads tree children when a node opens. | Tree mode keeps every artist and album name in the webview (6,000 rows with the 50,000-track fixture), against D14. P6.1 defines `library_tree` as the full structure. | Codex review of `e896960` |
| F-20 | `release.yml`: fail when the tag `vX.Y.Z` differs from the version in `tauri.conf.json` and `Cargo.toml`. | A wrong tag names the packages and the draft release with different versions. | P18 review |

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

- **1.24 (October 13, 2026):** the owner's UI shell rework (October 13, 2026) gets its own plan, `docs/planning/ui-shell-rework-build-plan.md`, with phases U0 to U7. Owner decision of the same day: the rework wins over requirements v1.7 where they conflict; the widget names and the Library modes stay. D57 to D59 and P23 are marked superseded.
- **1.23 (October 13, 2026):** P23 Done with exceptions. Windows build: Release run 38377951211 (`workflow_dispatch`, Windows only) on `8c78a44`: artifact `windows`, `Clawdio_0.1.0_x64-setup.exe` 5,433,981 bytes (5.18 MiB), under the 30 MB check. Later commits change only a Rust test and docs, so the app code is the same. P23-AC7 stays open for the owner.
- **1.22 (October 13, 2026):** the window edge drop exists (Dockview root target): D58 and P23 note N1 corrected, with a test. Every frame splitter drag is saved.
- **1.21 (October 13, 2026):** P23.1 to P23.4 done. K23 closed. D58 gained the shared-row case and the note that Dockview has no window-edge zone here.
- **1.20 (October 13, 2026):** P22 Done with exceptions (WebKit e2e runs in CI only).
- **1.19 (October 13, 2026):** requirements v1.7 (R28.1, R29.1, AC-25 to AC-27). Added phases P22 and P23, D55 to D59 and K23. F-22 left section 11 (done). The owner skipped the Dockview check before planning; K23 records it.
- **1.18 (October 12, 2026):** owner allowed `measure/p21`. F-21 done (run 38297586103 on `5625ff9`): Linux CI VM 293 MB, Windows 144 MB, NSIS 5.18 MiB. The 17 MB Linux container growth does not show on the CI VM. F-21 left section 11.
- **1.17 (October 12, 2026):** P21 Done with exceptions: packages, licenses, Linux memory (315 MB), brand swap and the 24 checks recorded on the P20 head. F-21 proposed. P18 stays In progress (B3, B5).
- **1.16 (October 12, 2026):** P20.0 result from the owner's Windows probe: D54 (audio sessions). K21 closed. P20 Done with exceptions (P20-AC4 and P20-AC5 are manual Windows checks).
- **1.15 (October 12, 2026):** owner decisions for P20: the P20.0 spike becomes a probe the owner runs on Windows, and the other P20 tasks proceed meanwhile; D53 hides the ducking control off Windows (P20.4 and P20-AC3 changed). P20 In progress, blocked by K21.
- **1.14 (October 12, 2026):** owner decision: P19 may start while P18 waits on B3 and B5 (the owner tested the app on Windows). P18 stays In progress; P21 repeats the release checks. P19 done with exceptions.
- **1.13 (October 12, 2026):** requirements v1.6 (R32 to R34, AC-22 to AC-24). Added phases P19, P20 and P21 (release checks again after P20), D51, D52, K21 and K22. D21 points to D51 for import names. The header now gives the current version. Owner request: `ci.yml` skips changes that touch only `**/*.md` and `docs/**` (section 6.17).
- **1.12 (October 12, 2026):** owner decisions: keep thumbnails across a folder change (Codex finding), reduce Linux memory (B9, new D50), push to `measure/p18` (B10), then accept the Linux value of 294 MB after D50. F-19 left section 11 (done in D50).
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
