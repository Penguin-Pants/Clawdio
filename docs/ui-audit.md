# UI Audit

**Version:** 1.0, October 13, 2026.
**Scope:** the UI shell before and during the UI shell rework (`docs/planning/ui-shell-rework.md`, called "the rework"). The plan is `docs/planning/ui-shell-rework-build-plan.md` (called "the plan"). Requirement IDs (SH, TR, DK, SP, TB, PS, TH, PF, AX, TA) are the rework's.
**Baseline:** commit `5f423cb` on `main` (the plan's baseline `3f747b4` plus the plan documents only).

This file holds rework Phase 0 (section 1 to 4) and the check of every later phase (section 5, rework section 14).

---

## 1. What exists

Checked against the code on October 13, 2026. Each row repeats plan section 3.1 after a new read of the cited files.

| Area | Evidence | State |
|---|---|---|
| Shell zones | `src/App.tsx:45-51`: a flex column with the 32 px header (`src/shell/AppHeader.tsx`), the dock in `main` (`min-h-0 flex-1`) and the 24 px status line (`src/shell/StatusLine.tsx`). The root is `h-screen overflow-hidden`. | Three fixed zones: header, dock, status. No transport band. |
| Transport controls | `src/widgets/transport/TransportWidget.tsx`: shuffle, previous, play or pause, stop, next, repeat, the seek slider with times and the volume slider. `IconButton` (`src/components/icon-button.tsx:25`) defaults to `icon-sm`, which is `size-7` (28 px, `src/components/ui/button.tsx:29`). | A dock widget with a locked height (D57). |
| Now playing | `src/widgets/now-playing/NowPlayingWidget.tsx`: art, title, artist, album and the heart. | A dock widget. |
| Bar widget rules | `src/shell/bar-rules.ts`, `src/shell/clamp.ts` (bar heights, `maxHeight`), `BarContent` and `dropAllowed` in `src/shell/DockShell.tsx:45-59, 169-182`, step 4b in `src/shell/persistence.ts:143-147`, `repairBars` in `src/shell/layouts.ts:137`, `tests/e2e/bars.spec.ts`. | P23 code that the rework replaces (SH-2). |
| Docking | `src/shell/DockShell.tsx:245-255`: `dockview-react` 8.5.1, `disableFloatingGroups`, `dndStrategy="pointer"`, the theme with group drop overlays, `guardLibrary`, the D45 clamp on resize. `src/shell/widgets.ts`: six widgets with minimum sizes. | One docking library; no floating groups, no lock, no presets. |
| Menu | `src/shell/AppMenu.tsx`: Widgets checkboxes (Library disabled), Library mode radio, Layouts (Columns, Tree, Top/bottom), Reset layout (Ctrl+Shift+L), Settings, Rescan. | A View menu in substance; no Lock layout, no transport position. |
| Layout file | `src/shell/persistence.ts`: `LAYOUT_VERSION = 1`, `libraryMode`, `libraryFrames`, `dock`; 500 ms debounce, flush on the close request, a fallback to Columns. Rust storage: `crates/clawdio-core/src/layout.rs`, `src-tauri/src/commands/layout.rs`. | A bad file is logged and ignored; no backup. |
| Window | `src-tauri/src/window.rs:15-16, 81`: `MIN_WIDTH` 800, `MIN_HEIGHT` 560, `min_inner_size`; the size is saved in `settings.json` (`WindowSize`, `crates/clawdio-core/src/settings.rs:35-38`); `tauri.conf.json` has `"windows": []`. | Minimum in Rust; no saved position. |
| Library | `src/widgets/library/LibraryWidget.tsx`: Tree, Columns and Top/bottom. `lists.tsx` lists on `VirtualList` (`src/components/virtual-list.tsx`, TanStack Virtual, fixed row height, `aria-activedescendant`). `FrameSplit.tsx`: frame splitters on `SplitviewReact`. `rows.tsx:12-13`: `ROW_HEIGHT` 28 and `ALBUM_ROW_HEIGHT` 48 as constants. | No column header, resize, reorder, visibility, sort or multi-select. |
| Row data | `SongRow` in `crates/clawdio-core/src/api.rs` has no track number; `library_song_ids(scope, query)` returns the R4 order. | Sorting and `#` need Rust changes. |
| Keyboard | `src/lib/keyboard.ts`: Space, Ctrl+F, F6, Shift+F6, Ctrl+Shift+L; F6 cycles visible `[data-widget]` regions by position. | AX-1 base. |
| Theme | `theme/tokens.json`: colors, radii, motion; no size or spacing token. `src/styles/globals.css:90-98`: the reduced-motion rule. `index.html` sets the dark class. | Colors from tokens; row and bar heights are constants. |
| Tests | Vitest (31 files, 253 tests) and Playwright with mocked IPC in Chromium and WebKit (`playwright.config.ts`). CI runs both (`.github/workflows/ci.yml`). | Baseline green: `npm run check` and 115 Chromium e2e tests pass on October 13, 2026. |
| Drag and drop | The dock uses pointer drag (`dndStrategy="pointer"`). `tauri.conf.json` does not set `dragDropEnabled`. No HTML5 drag event under `src/`. | TA-1 does not apply. |

## 2. What breaks

| Problem | Requirement | Evidence |
|---|---|---|
| The transport bar is a dock panel with a locked height. Drop rules (D58) and a clamp branch (D59) exist only to keep it in a bottom row. | SH-2, TR-1 | `src/shell/bar-rules.ts`, `src/shell/clamp.ts:66-91` |
| The bar content does not change by width; it wraps or clips at small widths instead of moving controls to an overflow menu. | TR-2, TR-3 | `TransportWidget.tsx:63-145` has one fixed layout |
| Band buttons are 28 px, under the 32 px hit area. | TR-8 | `button.tsx:29` (`icon-sm`) |
| The bar height and the row heights are constants, not tokens. | TH-1 | `rows.tsx:12-13`; `bar-rules.ts` measures content |
| No column header: no resize, reorder, visibility or sort; one selected song only. | TB-2 to TB-10 | `lists.tsx` `SongList`, `store/library.ts` `selection.song` |
| A bad layout file is not backed up. | PS-4 | `persistence.ts:120-125` |
| No window position, no transport position, no floating groups, no lock, no presets. | PS-5, SH-6, DK-3, DK-5, DK-8, DK-9 | `window.rs`, `DockShell.tsx:251` |
| Sashes are not in the Tab order and have no keyboard path; the hit area is the Dockview default. | SP-1, SP-3 | `FrameSplit.tsx:46`, `dockview-theme.css` |

## 3. Requirements that pass today

| Requirement | Evidence |
|---|---|
| SH-4 no page scroll | `App.tsx:45` `h-screen overflow-hidden`; `audit.spec.ts` narrow window case (P17-AC4) |
| SH-5 minimum window size (in Rust, UC7) | `window.rs:15-16, 81` |
| TR-4 seek click, drag, keyboard, times (in the widget) | `TransportWidget.tsx:105-124`; `playback.spec.ts` P7-AC9 |
| TR-7 opaque background | `bg-bg-surface` on every widget body (`DockShell.tsx:70`) |
| DK-1 one docking library | `package.json`: `dockview-react` only |
| DK-2 minimum width and height per widget | `widgets.ts` `minWidth`, `minHeight`; `widgets.test.ts` |
| DK-4 drop preview | `DockShell.tsx:32-39` theme `dndPanelOverlay: "group"`; `docking.spec.ts` |
| DK-6 View menu with every widget (as Widgets) | `AppMenu.tsx:47-59` |
| DK-7 Reset layout | `AppMenu.tsx:80-83`, `keyboard.ts:76-79` |
| DK-10 pop-out off | no `addPopoutGroup` under `src/` |
| TB-1 virtualized fixed rows | `virtual-list.tsx` (TanStack Virtual) |
| TB-11 playing indicator in the row | `rows.tsx:102-107` |
| PS-1 JSON with a version (v1) | `persistence.ts:11, 91` |
| PS-2 config folder through Rust | `crates/clawdio-core/src/layout.rs`, `src-tauri/src/commands/layout.rs` |
| PS-3 500 ms debounce and save on close | `persistence.ts:13, 168-202`, `DockShell.tsx:110-115` |
| TH-2 dark default | `index.html` class `dark`, `globals.css:6-15` |
| AX-2 reduced motion | `globals.css:90-98`; `expectNoMotion` in `test-base.ts` |
| TA-2 folder selection by dialog (code) | Rust picker (D13), `SettingsDialog.tsx` `chooseMusicFolder` |
| TA-3 both webviews: not verified | `playwright.config.ts` runs Playwright's own Chromium and WebKit builds, not WebView2 or WebKitGTK. The real-app runs on Windows and Linux (U7) verify TA-3. |
| TA-4 not only `localStorage` | `layout.json` through Rust; no `localStorage` under `src/` |

## 4. Conflicts with the requirements

The owner decided on October 13, 2026 that the rework wins over `docs/MusicPlayer_REQUIREMENTS.md` v1.7 where they conflict, with two limits: the six widget names and the three Library modes stay. The plan's section 4.2 records each conflict and its resolution (UC1 to UC13). Short list:

- UC1: the band leaves the dock (R5, R29.1, D57 to D59).
- UC2, UC3: Lock layout and floating groups (requirements section 4 non-goals).
- UC4: presets on the existing widgets (R29 layouts, design.md section 5).
- UC5: the Songs list becomes a column table inside the current modes (R28, R3, R4, section 7 density).
- UC6: keyboard splitters (section 7, K5).
- UC7: the window minimum stays in `window.rs`.
- UC8: the band shows MD at the 800 px minimum (owner item UQ1).
- UC9: one search field, in the Library header.
- UC10: 800 x 560 replaces 800 x 500 in screenshots and in the checklist.
- UC11: the band shows the compact now-playing display; the Now playing widget stays as a card.
- UC12: the header strip stays above the band.
- UC13: no `dragDropEnabled` change, because every drag uses pointer events.

Requirements v1.8 (U0) records the change list for the owner's approval (UQ4).

## 5. Phase checks

Each phase adds its acceptance check here (rework section 14).

### U0: Audit and source alignment

- Sections 1 to 4 of this file.
- Before screenshots: `docs/ui-reference/before/800x560.png`, `1280x720.png`, `1920x1080.png`, written by `npm run shots -- before` (`scripts/ui-shots.mjs`) in Chromium with the mocked app and a loaded library. `scripts/ui-shots.test.ts` checks the pixel sizes.
- Requirements v1.8 change list and design.md sections 5 and 6 updated.

### U1: Shell zones and transport band

- Four fixed zones (header, band, dock, status); the band is not a dock panel; the bar-widget code is gone.
- `tests/e2e/transport-band.spec.ts` checks the rework Phase 1 accept: from 800 to 2560 px the band never wraps, never changes height and keeps Play. SM and XS at a narrowed band, the overflow menu, seek by click, drag and keyboard, the 32 px buttons, text scaling at 100%, 125% and 140%.
- Real app on Linux (WebKitGTK, Xvfb): the band and the default preset show; a version 1 layout is backed up.

### U2: Docking

- Presets (Apple Music classic, MusicBee style, Compact), Lock layout, floating groups with Float and Dock (pointer and keyboard), the View menu, transport top or bottom, `layout.json` v2 with floating groups, the window position in `settings.json`.
- Rework Phase 2 accept: a hand-corrupted `layout.json` starts the app with the default preset and leaves `layout.json.bak` (`persistence.spec.ts`; the real app backed up a version 1 file in U1).

### U3: Splitters and rail

- Every dock and Library frame splitter is a keyboard separator (W3C pattern) with a 6 px hit area and a double-click reset; Collapse and Restore through the "Widget options" button and the Layout menu; the Playlists icon rail below 140 px.
- Rework Phase 4 accept: SP-1 to SP-4 pass in `splitters.spec.ts` and `resize.spec.ts`; the real WebKitGTK app moves a separator with the arrow keys.

### U4: Library table

- The Songs list of Columns and Top/bottom modes is a `grid`: a sticky header row, `#`, Title, Artist, Album and Time columns, divider resize with minimums, double-click and menu auto size, pointer and keyboard reorder, show or hide in the header menu, sort in Rust with `aria-sort` and an arrow, multi-select (click, Shift, Ctrl), the playing icon in `#`, and Add to Favorites by keyboard. Column state per view in `columns.json`, apart from `layout.json`.
- Rework Phase 3 accept: `tests/e2e/table-perf.spec.ts` with 50,000 rows: the DOM holds the rows in view plus the overscan, and the longest frame gap in Chromium CI is under the 100 ms budget while the table scrolls, sorts and resizes. The reference-machine number is for U7 (UQ3).
- TB-2 to TB-11 and PS-6 in `tests/e2e/table.spec.ts`; PF-1 in `src/widgets/library/table.test.tsx` (a container resize renders no row again); grid roles and row indexes in `audit.spec.ts`.

### U5: Transport extras

- The Now playing card (art, title, artist and album, heart, seek bar with times, previous, play or pause and next; Stop, Shuffle and Repeat in a More menu below 320 px) uses the band's controls and the one player store.
- Customize transport bar: a dialog with a checkbox per optional slot, Move up and Move down and drag handles; the order and hidden set save as `transportSlots` in `layout.json`.
- Mini player: the art (or the menu) shrinks the window to the band at the compact token height; the dock stays mounted and inert; Exit mini player in the More menu returns the stored size and position.
- Rework Phase 5 items 1, 2 and 4: `card.spec.ts`, `customize.spec.ts`, `mini.spec.ts`; `cargo test` for the window sizes.

### U6: Table extras

- Row drag (TB-12): selected songs drag to a playlist row (Favorites adds only new favorites) or to the Play queue, with a "N songs" ghost and a highlighted target; Escape cancels; pointer events only (UD10).
- Secondary sort (TB-13): Shift+click or Shift+Enter adds or flips the second key; the headers show "1" and "2".
- Compact rows (TB-14): the View menu; saved in `columns.json`; album rows keep their height.
- `row-drag.spec.ts`, `density.spec.ts`, `table.spec.ts` (TB-13); `row-drag.test.ts`, `columns.test.ts`, `columns-persistence.test.ts`, `rows.test.tsx`.
