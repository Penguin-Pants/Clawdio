# UI Shell Rework Build Plan

**Version:** 1.7, October 13, 2026.
**Status:** In progress. See section 2.
**Source:** the owner's document "UI Shell Rework: Transport Bar, Panes, Docking and Columns" (October 13, 2026). This plan calls it "the rework" and cites its requirement IDs (SH, TR, DK, SP, TB, PS, TH, PF, AX, TA).
**Parent plan:** `docs/build-plan.md` v1.23. Its decisions (`D`), conflicts (`C`), risks (`K`) and phases (`P`) keep their IDs. This plan adds `UD` decisions, `UC` conflicts, `UK` risks and `U` phases.
**Baseline:** commit `3f747b4` on `main` (P23 Done with exceptions).

**Bottom line**

- Eight phases, U0 to U7. U0 is docs only. U1 to U4 carry every MUST. U5 and U6 carry the SHOULD items. U7 verifies and closes.
- The transport bar leaves the dock. It becomes a fixed band outside Dockview (SH-2). The bar-widget code of P23 (D57 to D59) is deleted in U1.
- Dockview 8.5.1 stays as the one docking library. Floating groups, Lock layout, presets and a View menu are added on top of the current shell.
- The Songs list becomes a column table inside the current Library modes. Sorting runs in Rust (D14). No TanStack Table.
- Owner decision, October 13, 2026: the rework wins where it conflicts with requirements v1.7. The six widget names and the Tree, Columns and Top/bottom modes stay. Playlists, Play queue and Lyrics stand in for Navigator, Up Next and Info.
- Blockers: none. Section 4.4 lists the open owner items. Each has a default, so no phase waits.

---

## 1. How to execute this plan

1. Execute phases in order. Start a phase only when every phase on its "Dependencies" line is Done or Done with exceptions.
2. Before a phase, read the phase, the rework sections it cites, the traceability rows that cite it and the code it changes.
3. Implement only the phase tasks. Record other defects and ideas in `docs/build-plan.md` section 11 (F-proposals).
4. Run TWO-PASS REVIEW (`AGENTS.md`) on the complete phase diff. Record the F1 to F4 counts in the phase record (section 10).
5. Run the validation command set of `AGENTS.md` before every push: `npm run check`, `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, the bindings diff check and `npm run test:e2e`.
6. Commit messages start with the phase ID, for example `U1: add the transport band`.
7. In the same push, update section 2 of this plan, the phase record (section 10), the Status column of section 8 and the pointer row in `docs/build-plan.md` section 2.
8. Stop on a blocker. Record it in section 4.4. Do not invent a solution.
9. Name every check that could not run in the environment, and the reason. Never claim a check that did not run.
10. Run the real app after every phase (rework section 8): `npm run tauri dev` on at least one target platform, then the phase's own smoke list (the band, the dock, the changed widget, the changed Rust command). Record the platform and the result in the phase record. An environment with no display or no Rust build records the exception and the owner runs the smoke check before the next phase starts.

---

## 2. Phase status

| Phase | Name | Dependencies | Status |
|---|---|---|---|
| U0 | Audit and source alignment | none | Done |
| U1 | Shell zones and transport band | U0 | Done |
| U2 | Docking: presets, lock, View menu, persistence v2 | U1 | Done |
| U3 | Splitters and sidebar rail | U2 | Done |
| U4 | Library table | U1 | Not started |
| U5 | Transport extras: card, customize, mini player | U2, U4 | Not started |
| U6 | Table extras: row drag, secondary sort, density | U4, U5 | Not started |
| U7 | Verification, screenshots and release notes | U6 | Not started |

Status values: Not started, In progress, Done, Done with exceptions, Blocked.

---

## 3. Repository baseline

Inspection on October 13, 2026, at commit `3f747b4`.

### 3.1 What exists

| Area | Evidence | State |
|---|---|---|
| Shell zones | `src/App.tsx:43-51`: a flex column with a 32 px header strip (`src/shell/AppHeader.tsx`), the dock in `main` with `min-h-0 flex-1`, and a 24 px status line (`src/shell/StatusLine.tsx`). `html` is `h-screen overflow-hidden`. | Three fixed zones exist: header, dock, status. No transport band. |
| Transport controls | `src/widgets/transport/TransportWidget.tsx`: a dock widget with shuffle, previous, play or pause, stop, next, repeat, a seek slider with elapsed and total time, and a volume slider. Buttons are `IconButton` (`src/components/icon-button.tsx`) with tooltips; the `icon-sm` size is 28 px (`src/components/ui/button.tsx:29`). | Controls and keyboard seeking exist. The bar is a dock panel with a locked height (D57), not a fixed band. Hit area is below 32 px (TR-8). |
| Now playing | `src/widgets/now-playing/NowPlayingWidget.tsx`: art, title, artist, album and the heart, as a bar widget. | Exists as a dock widget. |
| Bar widget rules | `src/shell/bar-rules.ts`, `src/shell/clamp.ts` (D57 to D59), `BarContent` in `src/shell/DockShell.tsx:45-59`, repair in `src/shell/persistence.ts:143-147`, `tests/e2e/bars.spec.ts`. | P23 code that the rework replaces (SH-2). |
| Docking | `src/shell/DockShell.tsx`: `dockview-react` 8.5.1 with `disableFloatingGroups`, `dndStrategy="pointer"`, drop overlays, a Library guard (`guardLibrary`), a D45 clamp on resize. `src/shell/widgets.ts`: six widgets with minimum sizes. | DK-1, DK-2, DK-4 and DK-10 pass. No floating groups, no lock, no presets beyond the three Library-mode layouts. |
| Menu | `src/shell/AppMenu.tsx`: Widgets checkboxes (Library disabled), Library mode radio, Layouts (Columns, Tree, Top/bottom), Reset layout (Ctrl+Shift+L), Settings, Rescan. | DK-6 and DK-7 pass in substance. No Lock layout, no transport position. |
| Layout file | `src/shell/persistence.ts`: `layout.json` version 1 with `libraryMode`, `libraryFrames` and `dock`; 500 ms debounce and a flush on close; validation with a fallback to the Columns layout. Storage in Rust: `crates/clawdio-core/src/layout.rs`, `src-tauri/src/commands/layout.rs`. | PS-1 to PS-3 pass. PS-4 logs and ignores a bad file; it does not back it up. |
| Window | `src-tauri/src/window.rs`: minimum 800 x 560 (`MIN_WIDTH`, `MIN_HEIGHT`), saved size in `settings.json` (`WindowSize` in `crates/clawdio-core/src/settings.rs:35-38`), no saved position. `src-tauri/tauri.conf.json` has `windows: []`; Rust creates the window. | SH-5 passes in Rust, not in `tauri.conf.json`. Window position is not saved (PS-5). |
| Library | `src/widgets/library/LibraryWidget.tsx`: Tree, Columns and Top/bottom modes with a mode switch and the search field. `lists.tsx`: Artist, Album and Songs lists on `VirtualList` (`src/components/virtual-list.tsx`, TanStack Virtual, fixed row height, `aria-activedescendant`). `FrameSplit.tsx`: frame splitters on `SplitviewReact` (D56). `rows.tsx`: `SongCells` with title, tag artist, album, duration and the heart; a playing icon first (P6.4). | TB-1, TB-11 and part of TB-10 pass. No column header, no resize, no reorder, no visibility, no sort, no multi-select. |
| Row data | `SongRow` (`crates/clawdio-core/src/api.rs:74-84`): id, artist id, album id, title, artist name, album name, tag artist, duration. No track number. `library_song_ids(scope, query)` returns ids in R4 order (`crates/clawdio-core/src/library/query.rs:194`). | A `#` column and header sorting need Rust changes (D14). |
| Keyboard | `src/lib/keyboard.ts`: Space, Ctrl+F, F6, Shift+F6, Ctrl+Shift+L. F6 cycles `[data-widget]` regions. | AX-1 base exists. |
| Theme | `theme/tokens.json`: colors, radii, motion. `scripts/build-tokens.mjs` compiles it. No size tokens. `src/styles/globals.css` has the reduced-motion rule. | TH-2 and AX-2 pass. TH-1 needs size tokens for the bar and row heights. |
| Tests | Vitest for stores, shell rules and persistence. Playwright (Chromium and WebKit) with mocked IPC (`tests/e2e/install-mocks.ts`, `test-base.ts`). CI runs both (`.github/workflows/ci.yml`). | TA-3 is covered in CI by Chromium and WebKit; Windows and Linux desktops are manual (`docs/release-checklist.md`). |
| Drag and drop | Build plan P2 note N1: the dock uses pointer events, not HTML5 drag events. `tauri.conf.json` does not set `dragDropEnabled`. | TA-1 does not apply while no HTML5 drag event is used. |

### 3.2 Requirements that already pass

SH-4, SH-5 (in Rust), TR-4, TR-7, DK-1, DK-2, DK-4, DK-6, DK-7, DK-10, TB-1, TB-11, PS-1, PS-2, PS-3, TH-2, AX-2, TA-2, TA-3 (CI part), TA-4. U0 confirms each one in `docs/ui-audit.md`. Section 8 keeps a row for each, with the phase that re-verifies it after the shell change.

### 3.3 Environment of the planning session

Node 24 and npm are present; `npm ci` ran without scripts, so the Dockview 8.5.1 typings were read. The Rust toolchain and the Linux WebKitGTK packages were not exercised. No build ran. This is planning only.

---

## 4. Reconciliation

### 4.1 Precedence

The owner decided on October 13, 2026: **the rework wins where it conflicts with `docs/MusicPlayer_REQUIREMENTS.md` v1.7, with two limits.** The six widget names (Library, Transport controls, Now playing, Playlists, Play queue, Lyrics) and the three Library modes (Tree, Columns, Top/bottom) stay. Playlists, Play queue and Lyrics stand in for the rework's Navigator, Up Next and Info.

Rework section 2.2 names `REQUIREMENTS.md` v1.3 and `DESIGN.md`. In this repository they are `docs/MusicPlayer_REQUIREMENTS.md` v1.7 and `docs/design.md`. Rework section 2.1 names Magic UI; the repository uses shadcn/ui on Base UI with no Magic UI component (D6). Rework section 3.3 lists its pixel values, library API names and webview features as unverified; section 4.3 fixes each one.

### 4.2 Conflicts and resolutions

| ID | Sources | Conflict | Resolution |
|---|---|---|---|
| UC1 | SH-2, TR-1, TR-6 vs R5, R29.1, D57 to D59 | The rework puts the transport bar outside the dock. v1.7 makes it a fixed-height dock widget. | Rework wins. The band leaves the dock in U1. `transport` leaves `WIDGET_IDS`. The bar-widget code is deleted (UD2). Requirements v1.8 records it (U0). |
| UC2 | DK-5 vs requirements section 4 ("an edit lock" is a non-goal) | A Lock layout toggle. | Rework wins. Unlocked on a fresh install (rework decision 3). U2. |
| UC3 | DK-3, rework decision 5 vs requirements section 4 and 6 ("turn off floating panels"), D8 | Floating groups inside the main window. | Rework wins. `disableFloatingGroups` goes away in U2. Pop-out windows stay off (DK-10, D8). |
| UC4 | DK-8, DK-9 vs R29 (Columns, Tree and Top/bottom built-in layouts; default: Library plus a bottom bar), R5 (fixed widget list), design.md section 5 ("no sidebar") | New default preset and three presets with widgets that do not exist. | Rework wins with the owner's limit: presets use the existing widgets (UD6). The Library-mode layouts become a Library mode choice only. design.md section 5 is updated in U0. |
| UC5 | TB-2 to TB-9, TB-13, TB-14 vs R28 (three list modes), R3 and R4 (fixed sort orders), section 4 ("per-view layout overrides"), section 7 (density deferred) | A column table with sorting and per-view state. | Rework wins with the owner's limit: the modes stay, and the Songs list in Columns and Top/bottom modes becomes the table (UD8). Header sorting is a new feature on top of the R4 default order. Density moves from deferred to SHOULD (TB-14). |
| UC6 | SP-3 (MUST) vs owner decision 37 and requirements section 7 (keyboard resize of splitters deferred), K5 | Keyboard splitters. | Rework wins. U3 adds an app-level keyboard layer on the Dockview sashes (UD7). P22's "sashes not in the Tab order" changes. |
| UC7 | SH-5 ("in `tauri.conf.json`") vs `src-tauri/src/window.rs` (the window is built in Rust with `min_inner_size`, D33) | Where the minimum lives. | Keep Rust. The effect is the same, and the saved size logic lives there. U0 records it. |
| UC8 | SH-5 ("at minimum size the bar must show the XS class") vs the 800 px minimum width (D33), which gives the MD class | A literal reading would waste space at 800 px. | At the minimum window size the band shows the MD class with no overflow. XS and SM are exercised by the mini player (U5), by the size-class unit test and by an e2e test that narrows the band. Unverified assumption: the owner confirms this reading (UQ1). |
| UC9 | Rework 6.2 (XL slot `[search....]`) vs R5 and owner decision 10 (the search field lives in the Library header) | Two search fields. | One field, in the Library header. The band's search slot is a button that focuses that field (Ctrl+F). It is hidden by default and can be shown by Customize transport (UD4). |
| UC10 | Rework 8 Phase 0 (screenshots at 800 x 500) vs the 800 x 560 minimum | 800 x 500 cannot be reached. | Screenshots and every row of the rework section 9 checklist use 800 x 560 in place of 800 x 500. |
| UC11 | TR-5 (the bar shows art, title and artist) vs R5 (Now playing is a widget with art, title, artist, album and the heart) | Two homes for the now-playing display. | Both. The band carries the compact display (TR-5). The Now playing widget stays as the dockable card (TR-11), hidden by default. |
| UC12 | Rework 6.1 (no header strip in the zone diagram) vs R5 (fixed menu button), D11 (32 px header strip) | Where the menu button lives. | The header strip stays above the band. Four fixed zones: header, transport band, dock, status. Folding the menu into the band is a later owner choice. |
| UC13 | TA-1 vs P2 note N1 (pointer-event drag in the dock) | `dragDropEnabled: false` is required only when HTML5 drag events are used. | No config change. Column reorder (U4) and row drag (U6) use pointer events too (UD10). A drag guard in `scripts/check-sources.mjs` (U1) fails the build on `dragstart`, `onDragStart`, `onDragOver`, `onDrop` or a truthy `draggable` under `src/`; U7 records the result. |

### 4.3 Plan decisions

The owner may change any of them. Section 11 records changes.

| ID | Decision | Reason and evidence |
|---|---|---|
| UD1 | Size tokens in `theme/tokens.json`, in `rem`: `sizes.transportBar` 3.5rem, `sizes.transportBarCompact` 2.5rem, `sizes.rowRegular` 1.75rem, `sizes.rowCompact` 1.5rem, `sizes.rowAlbum` 3rem (56, 40, 28, 24 and 48 px at the 16 px root font), and `spacing.unit` 0.25rem. `scripts/build-tokens.mjs` adds a `rem` kind next to `px` (`scripts/build-tokens.mjs:42`) and the four keys to `SCHEMA`. They compile to `--size-transport-bar`, `--size-transport-bar-compact`, `--size-row-regular`, `--size-row-compact`, `--size-row-album` and `--spacing-unit`. `src/styles/globals.css` maps Tailwind's `--spacing` to `--spacing-unit`, so every Tailwind spacing utility (`p-2`, `gap-1`, `w-24`) derives from the token and TH-1 spacing holds for the whole UI with one token. The source guard adds a rule: no arbitrary px spacing (`p-[6px]`, `gap-[3px]`) under `src/`. A `useTokenPx(name)` hook (`src/lib/tokens.ts`) resolves the computed px value for the virtualizer and the band and reads it again when the root font size changes (a `ResizeObserver` on a 1 rem probe element, through the shared `observeSize` helper of UD24). | TH-1 wants row height and bar height from tokens. The current row height is a constant (`src/widgets/library/rows.tsx:12`). `rem` follows the root font size, so Windows display scaling and the P17.5 text scales (125%, 140%) grow the band and the rows instead of clipping (D57 history, build plan P17 note N2). |
| UD2 | The band is a React component outside Dockview (`src/shell/TransportBand.tsx`). `transport` leaves `WIDGET_IDS`. Delete `src/shell/bar-rules.ts` and its test, `BarContent` and the bar branches of `src/shell/clamp.ts` (D57 to D59), the repair step 4b of `persistence.ts`, `src/widgets/transport/TransportWidget.tsx` and `tests/e2e/bars.spec.ts`. `nowPlaying` becomes an ordinary hideable widget. | SH-2, TR-1. AGENTS.md Edits rules 6 and 7: a new pattern replaces the old one in the same change. |
| UD3 | Size classes by the band's own width, from rework 6.2: XS below 420 px, SM 420 to 639 px, MD 640 to 899 px, LG 900 to 1199 px, XL 1200 px and above. The lower bound belongs to the class (420 px is SM, 1200 px is XL). Band height by class: `sizes.transportBar` at MD, LG and XL; `sizes.transportBarCompact` at SM and XS. The user cannot drag it. | Rework 6.2 names a regular and a compact height but not when the compact one applies. At SM and XS the seek bar is a thin line, so one row fits in 40 px. At 800 px and wider the class is MD or larger, so the height does not change in the rework's Phase 1 check. |
| UD4 | Band slots, in default order: previous, play or pause, next, now-playing display (art, title, artist), seek bar with times, stop, shuffle, repeat, volume, queue toggle, search button (hidden by default). Drop order as the width shrinks: search button, stop with shuffle and repeat, queue toggle, volume slider (an icon with a popover), seek bar (a thin progress line at the band's bottom edge), previous and next. Play or pause never drops. Hidden slots move to the overflow menu. | TR-2, TR-3 and rework 6.2. Stop is an R6 control, so it is a slot (UC11 keeps R6). The queue toggle shows or hides the Play queue widget. |
| UD5 | `layout.json` version 2: `version`, `transport` ("top" or "bottom"), `locked`, `libraryMode`, `libraryFrames`, `transportSlots` (optional, U5) and `dock` (Dockview `toJSON`, including `floatingGroups`). A version 1 file, or any file that fails validation, is backed up as `layout.json.bak` by a new Rust command and the default preset loads. No migration of version 1. | PS-1, PS-4, PS-5. The app is 0.1.0 and the old file holds a `transport` panel that no longer exists. A backup keeps the user's file for inspection (R29 "ignore and log" becomes "back up, log and reset"). |
| UD6 | Presets on the five remaining widgets. "Apple Music classic" (default, DK-8): Playlists left at 240 px, Library center, Play queue and Lyrics as one tab group right at 280 px, Now playing hidden, transport top. "MusicBee style": Playlists left top at 240 px, Now playing card below it, Library center, Play queue right at 280 px, Lyrics hidden. "Compact": Library only. A preset keeps the current Library mode. Reset layout applies the default preset, Columns mode, default frames, transport top and unlocked. | DK-8, DK-9, DK-7, rework decisions 1 and 3. The owner's limit keeps the widget list. |
| UD7 | Keyboard splitters as an app layer in `src/shell/splitters.ts`: after each layout change it decorates every `.dv-sash` in the dock and in the Library frames with `role="separator"`, `tabindex="0"`, `aria-orientation`, `aria-valuenow` (the first neighbor's share in percent), `aria-valuemin`, `aria-valuemax` and `aria-label` ("Resize Playlists and Library"). Keys: Arrow 16 px, Shift+Arrow 64 px, Home and End to the minimum and maximum, Enter collapses to the minimum and Enter again restores. Double-click resets. The layer moves a sash by dispatching synthetic `pointerdown`, `pointermove` and `pointerup` events on it, so Dockview applies its own constraints, nesting and lock. Fallback if synthetic events fail in WebKit: for a dock sash, `group.api.setSize` on the group after the sash; for a Library frame sash, `useLibraryStore.setFrames(group, fractions)` with the new fractions, which `FrameSplit` applies through `panel.api.setSize` (`src/widgets/library/FrameSplit.tsx`, `applyFractions`). | SP-2, SP-3, SP-6. Dockview 8.5.1 has no keyboard sash API (K5, `dist/cjs/splitview/splitview.d.ts` has `onDidSashEnd` only). Synthetic events reuse the tested drag path. |
| UD8 | The table is the Songs list of Columns and Top/bottom modes (`SongList` in `src/widgets/library/lists.tsx`). Tree mode keeps its indented rows with no column header. Columns: `#` (track number, or the playing indicator for the playing row), Title (flex), Artist, Album, Time (right aligned, fixed). `#` is a fixed leading column: it cannot be moved or hidden, so the playing indicator always sits in the first column (TB-11); Title cannot be hidden. The heart stays as a fixed trailing cell that is not a user column; it remains a pointer target (D23), and the row context menu gains "Add to Favorites" or "Remove from Favorites" so the keyboard reaches the action (Shift+F10 or the context key, `useRowMenu.fromKey`). Column state is kept per mode (`songs.columns`, `songs.topBottom`). ARIA: the table is `role="grid"` with `aria-multiselectable`, a header `row` of `columnheader` cells that carry `aria-sort`, and body `row` elements of `gridcell` elements; `aria-activedescendant` on the grid names the active row (row-selection grid, W3C grid pattern). Because only the rendered window is in the DOM, the grid carries `aria-rowcount` (the full list length plus the header row) and every rendered row carries `aria-rowindex`; `aria-posinset` and `aria-setsize` are for the listbox and tree roles only (W3C grid and table properties). `VirtualList` gains the `grid` role next to `listbox` and `tree`. The Artist and Album lists stay listboxes. | TB-2 to TB-9, TB-11, UC5. R28.1 keeps per-mode frame sizes, so column state follows the same rule. |
| UD9 | No TanStack Table. A small column model in `src/widgets/library/columns.ts` (pure functions: resize with minimums, reorder, visibility, auto-size clamp, sort toggle) and a `TableHeader` component. Rows render as a CSS grid whose `grid-template-columns` comes from the column state. `VirtualList` gains a sticky header slot and a horizontal scroll width. | AGENTS.md Edits rule 4 (fewest moving parts) and rule 5 (reuse `VirtualList`). TanStack Table's row model would hold 50,000 row objects in the webview, against D14. The owner may overturn this (rework 8 Phase 3 step 1). |
| UD10 | Column reorder and row drag use pointer events with `setPointerCapture`, never HTML5 drag events. | UC13, TA-1. The dock already uses pointer drag. |
| UD11 | Sorting runs in Rust. `library_song_ids` takes a `sort` argument: up to two keys (column: track, title, artist, album, duration; descending flag). Text compares with the D4 fold. Ties fall back to the R4 order. No sort means the R4 order. `SongRow` gains `trackNo` and `disc`. | TB-8, TB-13, D14 (the index lives in Rust; the webview never holds all rows). |
| UD12 | Multi-select in the Songs table only: a `Set` of track ids plus an anchor in `useLibraryStore`. Click selects one. Ctrl+click toggles. Shift+click and Shift+Arrow extend from the anchor. Enter plays the active row. Add to queue and Add to playlist act on the selection. The Artist and Album lists stay single-select. | TB-10. R6 queue rule keeps "play from the active row". |
| UD13 | `columns.json` in the config folder: `version` 1, `density` ("regular" or "compact"), `views` keyed by view id with `order`, `widths`, `hidden` and `sort`. Stored by the same Rust path as `layout.json` (the core `layout.rs` functions take the file name). Debounced 500 ms, flushed on close. A bad file is backed up as `columns.json.bak` and the defaults load. | PS-6, PS-4, TB-14. Reuse of the P9 storage code. |
| UD14 | Window position: `settings.json` `window` gains optional `x` and `y` in physical pixels (`outer_position`). Saved with the size. Restored only when the point lies inside the physical bounds of an available monitor; else the OS places the window. | PS-5. Older files load with no position (serde default). Physical coordinates avoid the mixed-DPI case where one logical point maps into two monitors. |
| UD15 | Lock layout: `api.updateOptions({ locked: true, disableDnd: true })` (`DockviewComponentOptions.locked` and `disableDnd`, 8.5.1 typings). Locked separators get `aria-disabled` and ignore keys. Tab close controls, the Library frame splitters, column resizing and scrolling keep working. | DK-5. Verified names in `node_modules/dockview-core/dist/cjs/dockview/options.d.ts`. |
| UD16 | Center absorbs resize: `proportionalLayout: false` on the dock and `LayoutPriority.High` on the Library group when the group exposes `priority` (`gridviewPanel.d.ts` has it). Fallback: after each dock resize the existing `ResizeObserver` in `DockShell.tsx` re-applies the pixel sizes of the non-Library groups. | SP-4. `proportionalLayout` and `LayoutPriority` exist in the 8.5.1 typings. |
| UD17 | Floating: a Float control in the widget tab (`WidgetTab.tsx`, pointer target like the close control) calls `api.addFloatingGroup(panel)`; a floating group's tab shows Dock instead. Keyboard path (AX-1): the Layout menu has "Float widget" and "Dock widget" for the active widget (the Dockview active panel, which F6 and a click set); each is disabled when it does not apply. The Library may float but never closes (R28 guard stays). Floating groups serialize in `dock.floatingGroups`. A floating group outside the window after a resize is moved back inside on load. | DK-3. `addFloatingGroup` and `SerializedDockview.floatingGroups` exist in the typings. |
| UD18 | Sidebar icon rail (SP-5): the Playlists widget below 140 px width shows one icon button per playlist (heart for Favorites) with the name as tooltip and accessible name. Activating one widens its group to the preset width and selects the playlist. The Playlists minimum width in `src/shell/widgets.ts` goes from 200 px to 56 px (the rail width), so a sash drag can reach the rail. | SP-5 on the existing Playlists widget, the stand-in for Navigator. A 200 px minimum would stop the drag before the rail threshold (DK-2 still holds with 56 px). |
| UD19 | Mini player (TR-9): a Rust command `window_set_mini(on, height)` stores the normal size and position, takes the band height in logical px from the webview (`useTokenPx("--size-transport-bar-compact")`, UD1) and sets the window to 400 wide by that height, with a minimum of 320 by that height and a maximum height equal to it, so the 125%, 140%, 150% and 200% scales fit. On exit it first clears the maximum height and restores the 800 x 560 minimum (D33), then restores the stored size and position. A root font change while mini (text scaling) sends the new height. The shell renders only the band (SM or XS class) in mini mode. Click the art to enter; "Exit mini player" in the overflow menu and a click on the art to leave. The window size watcher never saves a mini size (`worth_saving` refuses sizes below the minimum). | TR-9. One player state (rework 5.10). |
| UD20 | Customize transport (TR-10): a dialog with the slot list. Optional slots have a checkbox; play or pause has none. Pointer drag handles and Move up and Move down buttons reorder. Saved as `transportSlots` in `layout.json` v2. Reset layout restores the default. | TR-10 with a keyboard path (AX-1). |
| UD21 | Row drag (TB-12): pointer drag from the selected Songs rows to a playlist row in the Playlists widget or to the Play queue body. A ghost shows "N songs". Escape cancels. The drop calls `addToPlaylist` or `queueAppend`. | TB-12 with the existing store functions. |
| UD22 | Band buttons use a 32 px size (`size-8`, a new `icon` variant of `Button` if the preset has none). Tooltips show the shortcut where one exists ("Play (Space)"). | TR-8. `icon-sm` is 28 px. |
| UD24 | One size-observer helper, `observeSize(element, callback)` in `src/lib/resize.ts`: a `ResizeObserver` whose callback runs once per animation frame (the latest entry wins, a pending frame is cancelled on disconnect). Every observer of the rework and every existing one that does layout work use it: `DockShell.tsx` (clamp), `FrameSplit.tsx` (frame layout), `LibraryWidget.tsx` (narrow switch), `use-size-class.ts`, `useTokenPx`, the Playlists rail (U3) and the Now playing card (U5). | PF-2 covers every size observer. Today `DockShell.tsx` and `FrameSplit.tsx` lay out inside the observer callback. |
| UD25 | Collapse and restore (SP-6): the widget tab gets a Collapse control (pointer target like the close control) that stores the group's size and sets it to its minimum; in the collapsed state the same control reads Restore and puts the size back. Keyboard: Enter on the separator (UD7) and "Collapse widget" or "Restore widget" in the Layout menu for the active widget. The Playlists rail (UD18) is the collapsed look of that one widget; its activation restores too. | SP-6 asks for an explicit action and a restore button for every group, not only the sidebar. |
| UD23 | Phase 0 screenshots come from a committed script `scripts/ui-shots.mjs` that runs Playwright against the mocked app at 800 x 560, 1280 x 720 and 1920 x 1080 and writes PNG files to `docs/ui-reference/before/` or `after/`. | Rework 8 Phase 0 and section 12. The script is reused after each phase, so it is not a one-time script. |

### 4.4 Open owner items

None blocks a phase. Each has a default.

| ID | Item | Default | Needed by |
|---|---|---|---|
| UQ1 | UC8: at 800 px the band shows MD, not XS. | Accept. | U1 sign-off |
| UQ2 | UD9: no TanStack Table. | Accept. | U4 start |
| UQ3 | Reference machine for PF-3 (rework 7.7). | The owner's Windows machine from build plan B5. | U7 |
| UQ4 | Requirements v1.8 text (U0 writes the change list; the owner approves the wording). | The U0 change list as written. | U7 close |

---

## 5. Implementation approach

### 5.1 Zones

`src/App.tsx` renders four fixed zones in a CSS grid: header (32 px, D11), transport band (`--size-transport-bar` or the compact value), dock (`minmax(0, 1fr)`) and status line (24 px). `data-transport="bottom"` on the shell swaps the band and the dock rows (SH-6). The dock host keeps `min-width: 0; min-height: 0; position: relative`, which rework 6.5 requires and which `main` already has. Every list scrolls inside its own container (SH-4, unchanged).

### 5.2 Transport band

`src/shell/TransportBand.tsx` composes small control components in `src/shell/transport/` (play controls, seek bar, volume, now-playing display, overflow menu). They move out of `TransportWidget.tsx` and `NowPlayingWidget.tsx` and read the same stores (`usePlayerStore`, `useLibraryStore`, `useSettingsStore`). `src/shell/use-size-class.ts` measures the band with a `ResizeObserver` on `requestAnimationFrame` (PF-2). The band element carries `data-widget="transport"` so F6 (`widgetRegions` in `src/lib/keyboard.ts`) and the measurement check (`src/shell/measure.ts`) keep working. The volume popover needs a Popover component: `shadcn add popover` into `src/components/ui/popover.tsx` with the P0.10 focus rule. The `shadcn` CLI downloads from `ui.shadcn.com`, which the environment must allow (build plan B6).

### 5.3 Dock

Dockview stays. U2 removes `disableFloatingGroups`, adds Lock layout, presets, the View menu and `layout.json` v2. The D45 clamp stays for non-bar groups. The bar branches go.

### 5.4 Splitters

The theme CSS (`src/styles/dockview-theme.css`) already draws a 1 px line and a resize cursor. U3 widens the sash hit area to 6 px, adds the keyboard layer (UD7) and the double-click reset, and the Playlists icon rail.

### 5.5 Library table

U4 replaces `SongList` with a table on the same `VirtualList`. Column state lives in a new `useColumnsStore` (`src/store/columns.ts`) and persists in `columns.json`. Sorting and the track number come from Rust (UD11).

### 5.6 Persistence and Tauri

Two JSON files in the config folder through Rust (`layout.json` v2, `columns.json`), a backup command, window position in `settings.json`, and the mini-player window command. The webview gets no new permission (D13): every file and window operation is a Rust command.

### 5.7 Dependencies

No new npm package except the shadcn Popover component (copied source, Base UI is already a dependency). No new Cargo crate. `@tanstack/react-virtual` and `dockview-react` stay at their pinned versions.

---

## 6. Phases

### Phase U0: Audit and source alignment

**Goal**

The repository documents its current UI state, the "before" screenshots exist, and the source documents name the rework as the governing source for the shell.

**Requirements covered**

Rework section 8 Phase 0, section 12 (`before/*.png`), section 14 (every phase records its check in `docs/ui-audit.md`). Prerequisite for every other phase.

**Changes**

- Create `docs/ui-audit.md`: what exists (section 3.1 of this plan, re-checked against the code), what breaks (the P23 bar model against SH-2, the 28 px hit area, no column header), which rework requirements pass today (section 3.2), and the conflict list (section 4.2).
- `docs/requirements-traceability.md`: a new section 7 with one row per rework requirement (section 8 of this plan), status Planned, so each later phase updates the Status column in its own push (AGENTS.md workflow).
- Create `scripts/ui-shots.mjs` (UD23) and add `npm run shots -- before` to `package.json`. Capture `docs/ui-reference/before/800x560.png`, `1280x720.png` and `1920x1080.png` from the mocked app (`tests/e2e` harness, default arrangement, a loaded library).
- Update `docs/MusicPlayer_REQUIREMENTS.md` to v1.8: a change log entry and a section 8 entry that record the October 13 owner decision; rewrite R5 (Transport controls is a fixed band, Now playing is a card widget), R29 (presets, Lock layout, floating groups, keyboard splitters), delete R29.1, move "keyboard resize of splitters" and "density" out of section 7, delete the section 4 non-goals "floating panels" and "an edit lock", add TB sorting and multi-select to R28, and add the rework's MUST list as section 2 items or a reference to the rework file. Keep the `[D]` marks.
- Update `docs/design.md` section 5 and 6: four fixed zones, the band, presets, the table, the card. Mark the bar-widget paragraph as superseded.
- No parent-plan work: the pointer row in section 2, the section 13 entry, the superseded marks on D57 to D59 and P23, and the copy of the rework document at `docs/planning/ui-shell-rework.md` (with a note that names this plan as authoritative on conflicts) ship with this plan.

**Implementation notes**

- Docs only, plus the screenshot script. No app code changes.
- The script runs the existing Vite e2e build (`vite.e2e.config.ts`) and Playwright with the mocked IPC, as `npm run test:e2e` does. It takes the folder name as its argument.
- The requirements update is a change list for the owner's approval (UQ4). Do not delete owner decisions 29 to 37; mark them as superseded by the October 13 decision.

**Tests**

- The script produces three PNG files at the three sizes (checked by file existence and image size in a Vitest test that runs only when the files exist, or by the script's own exit code in U7).
- `npm run check` passes (the lint and prettier rules cover `scripts/`).

**Acceptance criteria**

- U0-AC1: `docs/ui-audit.md` exists with the four sections named above and names each rework requirement that passes today, with the file evidence.
- U0-AC2: the three "before" screenshots exist in `docs/ui-reference/before/` at 800 x 560, 1280 x 720 and 1920 x 1080.
- U0-AC3: `docs/MusicPlayer_REQUIREMENTS.md` is v1.8 with the change list; `docs/design.md` section 5 names the four zones.

**Dependencies**

None.

---

### Phase U1: Shell zones and transport band

**Goal**

The transport bar is a fixed band outside the dock. It adapts to its own width. The old bar-widget model is gone. The app starts with a layout that has no `transport` panel.

**Requirements covered**

SH-1, SH-2, SH-3, SH-4, SH-5, TR-1, TR-2, TR-3, TR-4, TR-5, TR-6, TR-7, TR-8, TH-1, TH-2, PF-2 (band observer), AX-1 (band), AX-2 (band). Rework section 8 Phase 1 accept.

**Changes**

- `theme/tokens.json` and `scripts/build-tokens.mjs`: the `sizes` group and the `rem` kind (UD1). New `src/lib/tokens.ts` with `useTokenPx`. `docs/theming-and-brand.md`: the four new rows in the token map and the `rem` kind.
- `src/App.tsx`: the four-zone grid (section 5.1). `data-transport` attribute from `useUiStore` (default "top"; the setting arrives in U2).
- New `src/shell/presets.ts` with the default preset "Apple Music classic" (UD6, DK-8) as the first-run arrangement and the Reset layout target. U2 adds the two other presets.
- `scripts/check-sources.mjs`: a drag guard. Under `src/`, no `dragstart`, `onDragStart`, `onDragOver`, `onDrop` or `draggable` with a value other than `false` or `{false}` (UC13, TA-1). `draggable={false}` on images stays allowed.
- New `src/lib/resize.ts` with `observeSize` (UD24) and its test; `DockShell.tsx`, `FrameSplit.tsx` and `LibraryWidget.tsx` move their observers to it.
- Row heights from tokens (TH-1, UD1): `ROW_HEIGHT` and `ALBUM_ROW_HEIGHT` in `src/widgets/library/rows.tsx` go away; `rows.tsx`, `lists.tsx`, `QueueWidget.tsx` and `PlaylistsWidget.tsx` read `useTokenPx("--size-row-regular")` or `--size-row-album`. `src/styles/globals.css`: `--spacing: var(--spacing-unit)`.
- New `src/shell/TransportBand.tsx`, `src/shell/transport/PlayControls.tsx`, `SeekBar.tsx`, `VolumeControl.tsx`, `NowPlayingDisplay.tsx`, `OverflowMenu.tsx`, `src/shell/use-size-class.ts`, `src/shell/transport/slots.ts` (slot ids, default order, drop order, visibility per class: UD4).
- New `src/components/ui/popover.tsx` (shadcn, Base UI) for the volume icon at MD and below.
- `src/components/ui/button.tsx`: a 32 px icon size if none exists (UD22).
- `src/shell/widgets.ts`: remove `transport`; `nowPlaying` keeps `hideable: true` with minimum 220 x 240.
- Delete `src/widgets/transport/TransportWidget.tsx`, `src/shell/bar-rules.ts`, `src/shell/bar-rules.test.ts`, `tests/e2e/bars.spec.ts`, the fixtures `src/shell/layout-fixtures/bar-*.json`.
- `src/shell/clamp.ts` and `clamp.test.ts`: remove the bar heights and `maxHeight`; keep the D45 proportional clamp.
- `src/shell/DockShell.tsx`: remove `BarContent`, `dropAllowed`, the bar imports and the `onBarHeightChange` wiring.
- `src/shell/layouts.ts`: `defaultArrangement` applies the default preset from `presets.ts`; remove `showPosition` bar branches, `repairBars`, `BOTTOM_ROW_HEIGHT`.
- `src/shell/persistence.ts`: `LAYOUT_VERSION` 2 with the new fields (UD5); a version 1 file is rejected; on rejection call the new `commands.layoutBackup()` before the fallback. Fixtures: add `version-1.json`; update `valid.json`.
- `crates/clawdio-core/src/layout.rs`: `backup(config_dir, file)` renames the file to `<file>.bak` (overwrite) and logs. `src-tauri/src/commands/layout.rs`: `layout_backup`. `src-tauri/src/lib.rs`: register it. `src/lib/ipc/commands.ts`: `layoutBackup`.
- `src/shell/measure.ts` and `applyMeasureLayout` in `src/shell/layouts.ts`: the measurement arrangement shows every widget the default preset hides (Now playing too), so all five dock widgets and the band are in the page; `measurementPopulated` expects the band element and the five widgets. `measure.test.ts` and `layouts.test.ts` cover the complete set.
- `src/lib/keyboard.ts`: no change (the band carries `data-widget`). `tests/e2e/keyboard.spec.ts`: the F6 order with the default preset becomes band, Playlists, Library, then the active tab of the right group (Play queue); `widgetRegions` sorts every visible `[data-widget]` element by position, so a hidden tab (Lyrics) is skipped as today.
- `tests/e2e/install-mocks.ts`: mock `layout_backup`. Update `docking.spec.ts`, `layouts.spec.ts`, `persistence.spec.ts`, `milestone.spec.ts`, `playback.spec.ts` and `audit.spec.ts` for the band (selectors `[data-widget="transport"]` now point at the band).
- `docs/file-formats.md`: `layout.json` version 2 and the backup rule.

**Implementation notes**

- The band measures itself, not the window (TR-2). The hook sets the class on `requestAnimationFrame` and cancels a pending frame on the next observation (rework 6.6).
- Each slot renders in one place. A slot below its class threshold renders in the overflow menu instead (same component, menu variant). The overflow menu is a `DropdownMenu` with a tooltip "More".
- At SM and XS the seek bar is a 2 px progress line along the band's bottom edge, `role="progressbar"` with `aria-valuetext`, and seeking moves to the overflow menu as "Seek" (a menu item that opens a small popover slider) so TR-4 holds at every class.
- Text lines use one line with an ellipsis (TR-5). The band background is `bg-bg-surface` with a bottom border (TR-7). The list area ends above the band because the grid rows do not overlap (TR-6).
- Tooltips carry the shortcut where one exists: "Play (Space)", "Pause (Space)" (TR-8). Other buttons show their name.
- The now-playing display shows the 96 px thumbnail through `useAlbumArt(album, 96)` and `thumbUrl` (D41).
- `nowPlaying` stays a bar-styled widget in this phase (the card restyle is U5). It is hidden by default (UD6).
- The default preset ships in this phase, so a version 1 user who upgrades at U1 gets the final first-run arrangement, and the version 2 file that the close flush writes is already the one U2 expects. No second migration in U2.
- A saved version 1 file from P9 to P23 is backed up and the default preset loads (UD5). Log one line: `layout: version 1 backed up as layout.json.bak`.
- Text scaling: the band height and the row heights are `rem` tokens (UD1). The P23-AC6 cases (root font size 100%, 125% and 140%) move to `transport-band.spec.ts`: the band grows with the font, the content never overflows, and the class rule still applies.

**Tests**

- Vitest `use-size-class.test.ts`: the class per width (UD3): 300 and 419 give XS; 420 and 639 give SM; 640 and 899 give MD; 900 and 1199 give LG; 1200 and 2560 give XL; one state update per frame when two observations arrive in one frame (PF-2).
- Vitest `build-tokens.test.ts` (the existing tokens script test): the `rem` kind accepts `3.5rem` and rejects `56px` for a `sizes` key; a missing `sizes` or `spacing` key names the key path.
- Vitest `resize.test.ts`: two observations in one frame give one callback with the latest size; disconnect cancels a pending frame. Vitest for `DockShell`, `FrameSplit` and `LibraryWidget`: a burst of three observations runs their layout work once (PF-2 per path).
- Vitest `rows.test.tsx`: the row height equals the computed `--size-row-regular` value and follows a root font change. Vitest `tokens.test.ts`: `useTokenPx` resolves 3.5rem to 56 at a 16 px root and to 70 at a 20 px root.
- Vitest `slots.test.ts`: visible slots per class follow UD4; play or pause is visible at every class; every hidden slot appears in the overflow list.
- Vitest `persistence.test.ts`: a version 1 file is rejected with the backup call and one log line; a version 2 round trip keeps `transport` and `locked`; a bad `transport` value falls back.
- Vitest `clamp.test.ts`: the D45 clamp without bar groups; six-widget stack still fits 560 px.
- Playwright `transport-band.spec.ts`: at 1280 x 800 the band spans 1280 px and shows XL; at 1100 x 800 it shows LG; narrow the window to 800 x 560: the band shows MD, Play stays visible, the band height is unchanged, no slot wraps; set the band container to 400 px (test hook) and 600 px: XS and SM, the progress line shows, Previous and Next sit in the overflow at XS; seek by click, by drag and by keyboard on the slider with the mocked player; the band's background is opaque (computed `background-color` has alpha 1); every button has an accessible name and a 32 x 32 px box; the tooltip of Play reads "Play (Space)".
- Playwright `persistence.spec.ts`: a stored version 1 layout starts with the default preset and `layout_backup` was called once.
- Playwright `transport-band.spec.ts` at root font size 100%, 125% and 140%: the band height equals the computed token value, the content never overflows and leaves at most 4 px empty, and the height follows the change without a reload (the P23-AC6 cases).
- Vitest `check-sources.test.ts`: the drag guard flags `onDragStart`, `draggable` and `draggable={true}` and accepts `draggable={false}`.
- Playwright `audit.spec.ts`: axe finds no serious violation with the band (AX-1), and `expectNoMotion` passes under reduced motion (AX-2).
- Playwright `keyboard.spec.ts` (P2-AC10): from the default preset, successive F6 presses focus the transport band, Playlists, Library and the active Play queue tab in that exact order, then wrap to the band; Shift+F6 runs it backwards; the hidden Lyrics tab is not visited.
- `cargo test`: `backup` renames and overwrites; a missing file is not an error.

**Acceptance criteria**

- U1-AC1: SH-1 to SH-5 pass: four zones, the band and status line are not dock panels, the dock row is `minmax(0, 1fr)`, the page never scrolls, and the window minimum is 800 x 560 in `window.rs`.
- U1-AC2: TR-1 to TR-8 pass as the tests above show. Rework Phase 1 accept: from 800 px to 2560 px the band never wraps, never changes height and never loses Play.
- U1-AC3: no file under `src/` references `bar-rules`, `BarContent`, `TransportWidget` or `repairBars` (grep).
- U1-AC4: TH-1: the band height, every row height and Tailwind's spacing scale come from `--size-*` and `--spacing-unit` variables in `rem`; no `ROW_HEIGHT` constant remains under `src/`; the band follows the 125% and 140% root font sizes without overflow; `npm run check:sources` passes with the drag guard and the spacing guard.
- U1-AC6: DK-8: the first start shows the default preset (Playlists left, Library center, Play queue and Lyrics tabbed right, Now playing hidden).
- U1-AC5: the validation command set passes; `tests/e2e` passes in Chromium and WebKit (CI), including the exact default-preset F6 order above.

**Dependencies**

U0.

---

### Phase U2: Docking: presets, lock, View menu, persistence v2

**Goal**

The dock has the default preset, two more presets, floating groups, a Lock layout toggle, a View menu with every widget, Reset layout, the transport position setting and complete persistence of the arrangement and the window.

**Requirements covered**

SH-6, DK-1 to DK-10, SP-4, PS-1 to PS-5, TA-4. Rework section 8 Phase 2 accept.

**Changes**

- `src/shell/presets.ts`: add "MusicBee style" and "Compact" next to the U1 default preset, as functions of `DockviewApi` with pixel sizes (UD6). `src/shell/layouts.ts`: `applyPreset(id)`, `resetLayout()` as UD6 defines, delete `LAYOUTS` and `LAYOUT_TITLES` (the Library-mode layouts).
- `src/shell/AppMenu.tsx`: groups "View" (widget checkboxes, Library disabled), "Library mode" (unchanged), "Layout" (presets, Lock layout checkbox, Transport bar: Top or Bottom radio, Reset layout with its shortcut), then Settings and Rescan.
- `src/store/ui.ts`: `locked`, `transportPosition`, setters. `src/App.tsx` reads `transportPosition`.
- `src/shell/DockShell.tsx`: remove `disableFloatingGroups`; `proportionalLayout={false}`; apply `locked` and `disableDnd` through `api.updateOptions` on change (UD15); set the Library group priority (UD16) in `attachDock` or after each layout; move floating groups back inside the dock bounds after load and on resize (UD17).
- `src/shell/WidgetTab.tsx`: Float and Dock controls (UD17), hidden while locked.
- `src/shell/persistence.ts`: save and restore `transport`, `locked` and `dock.floatingGroups`; `watchLayout` also saves on `locked` and `transportPosition` changes.
- `crates/clawdio-core/src/settings.rs`: `WindowSize` gains optional `x` and `y` in physical pixels (UD14). `src-tauri/src/window.rs`: save `outer_position` with the size (`WindowEvent::Moved`; confirm the event name in the pinned Tauri 2.12.3 source), restore it when inside the physical bounds of an available monitor. `docs/file-formats.md`: the `settings.json` row.
- `tests/e2e/install-mocks.ts`: nothing new (window position is Rust only). Update `docking.spec.ts`, `layouts.spec.ts`, `persistence.spec.ts`. New `presets.spec.ts`, `lock.spec.ts`, `floating.spec.ts`.
- `docs/file-formats.md`: `layout.json` v2 fields `transport`, `locked`, `floatingGroups`.

**Implementation notes**

- Minimum sizes per widget stay in `WIDGETS` (DK-2). The clamp (D45) still protects small windows.
- The default preset applies on first run and after Reset layout. A preset applies with `replaceArrangement` (the Library guard is off meanwhile).
- Lock layout hides no control that reopens a widget (DK-6). While locked, the Widgets checkboxes still work.
- Transport position lives in `layout.json` and in the Layout menu (UC12 keeps the header; SH-6 "setting" is this menu item). Reset layout puts it back to top.
- Window position restore: compare the saved physical point with the physical `position` and `size` of each entry of `app.available_monitors()`; if no monitor contains the point, do not set a position. No scale factor math (UD14).
- Pop-out windows: no `addPopoutGroup` call and no tab context menu (DK-10, unchanged).

**Tests**

- Vitest `presets.test.ts`: each preset adds the expected panels with the expected sizes; "Compact" leaves only Library; `resetLayout` restores the default preset, Columns mode, default frames, top and unlocked.
- Vitest `persistence.test.ts`: round trip of `transport`, `locked` and a floating group; an unknown widget id in `floatingGroups` is removed.
- Vitest `ui.test.ts`: `setLocked`, `setTransportPosition`.
- `cargo test` (`window.rs`, `settings.rs`): a position outside every monitor is not applied; a file without `x` and `y` loads; a saved position round-trips.
- Playwright `presets.spec.ts` (DK-8, DK-9): first start shows Playlists left, Library center, Play queue and Lyrics tabbed right, Now playing hidden, band at top; apply each preset; Reset layout after a drag restores the default.
- Playwright `docking.spec.ts` (DK-3, DK-4): drag Play queue to each window edge and to each edge of Library; drop it on the Library tab bar (a tab group); the drop overlay is visible during the drag; the Library cannot be closed.
- Playwright `floating.spec.ts` (DK-3, AX-1): Float a widget with its tab control, drag the floating group, Dock it again; by keyboard only: F6 to a widget, open the menu, "Float widget", then "Dock widget"; a floating group survives a reload.
- Playwright `lock.spec.ts` (DK-5): with Lock layout on, a tab drag moves nothing and a sash drag changes no size, while a Library frame splitter drag and list scrolling still work; the View menu still shows and hides widgets; the lock state survives a reload.
- Playwright `layouts.spec.ts` (DK-6, DK-7): close every hideable widget with its tab control; reopen each from the View menu; Library has no close control and its View item stays disabled and checked; Ctrl+Shift+L resets.
- Playwright `persistence.spec.ts` (PS-1 to PS-5): a change saves after 500 ms (mock counter) and at once on the Tauri close request (`window.e2e.closeRequest()` in `tests/e2e/entry.ts`, which emits `tauri://close-requested`), which is the production path in `DockShell.tsx` (`onCloseRequested`), not `beforeunload`; a corrupt file starts with the default preset and `layout_backup` was called; Transport bar: Bottom moves the band below the dock and survives a reload.
- Playwright `resize.spec.ts` (SP-4): resize the window from 1280 to 1600 px wide; the Playlists and right groups keep their pixel widths within 1 px and Library takes the difference.

**Acceptance criteria**

- U2-AC1: DK-1 to DK-8 and DK-10 pass as the tests show. Rework Phase 2 accept: a hand-corrupted `layout.json` starts the app with the default preset and leaves `layout.json.bak`.
- U2-AC2: PS-1 to PS-5 pass: the file has `version: 2`, the Rust side stores it, saves are debounced and flushed on close, a bad file is backed up, window size and position, transport position and the visible widgets restore.
- U2-AC3: SP-4 passes (pixel sidebars, center absorbs).
- U2-AC4: SH-6 passes (top or bottom, default top).
- U2-AC5: the validation command set passes.

**Dependencies**

U1.

---

### Phase U3: Splitters and sidebar rail

**Goal**

Every splitter has a 6 px hit area, resets on double-click and works with the keyboard by the W3C pattern. The Playlists widget collapses to an icon rail when narrow. No group can be dragged to zero.

**Requirements covered**

SP-1, SP-2, SP-3, SP-5, SP-6, SP-7 (MAY, not built), AX-1 (splitters). Rework section 8 Phase 4 accept.

**Changes**

- `src/styles/dockview-theme.css`: sash hit area 6 px (override `.dv-sash` width or height and the centering offset), unchanged 1 px line and cursor.
- New `src/shell/splitters.ts` and `splitters.test.ts` (UD7): decoration, key handling, double-click reset, the collapse and restore memory, the locked state.
- `src/shell/DockShell.tsx` and `src/widgets/library/FrameSplit.tsx`: call the layer after `onReady`, after each layout change and after each frame layout. Remove the P22 "sashes not in the Tab order" note from `FrameSplit.tsx`.
- `src/shell/WidgetTab.tsx` and `src/shell/AppMenu.tsx`: the Collapse and Restore control and menu items (UD25).
- `src/widgets/playlists/PlaylistsWidget.tsx`: rail mode below 140 px (UD18), measured with `observeSize` (UD24). `src/shell/widgets.ts`: the Playlists minimum width becomes 56 px (UD18); `widgets.test.ts` and the 800 x 560 clamp case run again.
- `tests/e2e/frames.spec.ts`: the Tab-order assertion flips (sashes are in the order now). New `splitters.spec.ts`, `rail.spec.ts`.
- `docs/design.md` section 5: splitter keyboard rule.

**Implementation notes**

- The reset size on double-click: the size the current preset gives the group before the sash; a group without a preset size takes an equal share with its neighbor. For a Library frame sash: `DEFAULT_FRAMES` of that group.
- The separator label names the widgets on both sides from the `[data-widget]` elements inside the two views, or the frame labels ("Artist", "Album", "Songs").
- Collapse and restore (UD25): the tab control, the Layout menu items and Enter on the separator share one `collapseGroup(id)` and `restoreGroup(id)` pair in `src/shell/splitters.ts` that stores the size before the collapse. Hiding a widget with its tab control and showing it from the View menu stays as the third path (unchanged).
- SP-6 "a drag cannot shrink a group to zero" holds by the `WIDGETS` minimums and the D45 floor of 32 px. The test asserts it.
- SP-7 (MAY) is not built. Record it as not built in the phase record.

**Tests**

- Vitest `splitters.test.ts`: the step sizes per key; Home and End reach the minimum and maximum; Enter collapses and restores; a locked separator ignores keys; the label text for two widgets and for two frames; the reset size rule.
- Playwright `splitters.spec.ts` (SP-1 to SP-3): the sash box is at least 6 px wide; the cursor is `col-resize` or `row-resize` on hover; a double-click after a drag restores the preset width within 1 px; Tab reaches the separator; Arrow keys change the neighbor size; Home, End and Enter behave as UD7 says; the separator has `role="separator"`, `aria-valuenow` and a label; the same for a Library frame sash. Runs in Chromium and WebKit (UD7 fallback check).
- Playwright `docking.spec.ts` (SP-6): a drag past the minimum leaves the group at its minimum, never 0.
- Playwright `splitters.spec.ts` (SP-6): the Collapse control sets Play queue to its minimum and reads Restore; Restore returns the size; the same by keyboard through the Layout menu; a locked layout disables both.
- Playwright `rail.spec.ts` (SP-5): drag the Playlists sash to 120 px: icons with tooltips show; activate one: the group returns to 240 px and the playlist is selected; the rail state survives a reload (the group width is in the dock JSON).

**Acceptance criteria**

- U3-AC1: SP-1 to SP-4 pass (rework Phase 4 accept; SP-4 from U2 re-verified with the keyboard layer present).
- U3-AC2: SP-5 and SP-6 pass as the tests show.
- U3-AC3: axe finds no serious violation with separators in the page.
- U3-AC4: the validation command set passes.

**Dependencies**

U2.

---

### Phase U4: Library table

**Goal**

The Songs list in Columns and Top/bottom modes is a column table: resizable, reorderable, hideable and sortable columns, a sticky header, multi-select, a track number column with the playing indicator, and column state saved per mode in `columns.json`.

**Requirements covered**

TB-1 to TB-11, PS-6, PF-1, PF-3, TH-1 (row height token), AX-1 (table). Rework section 8 Phase 3 accept.

**Changes**

- Rust: `crates/clawdio-core/src/api.rs`: `SongRow` gains `track_no: Option<u32>` and `disc: Option<u32>`; new `SongSort` and `SortKey` with `TS` derives. `crates/clawdio-core/src/library/query.rs`: `song_ids(scope, query, sort)` (UD11). `src-tauri/src/commands/library.rs`: the `sort` argument. `src/lib/ipc/bindings/`: regenerated and committed (D15). `src/lib/ipc/commands.ts`: `librarySongIds(scope, query, sort)`.
- Rust storage: `crates/clawdio-core/src/layout.rs` functions take the file name; `COLUMNS_FILE`. `src-tauri/src/commands/layout.rs`: `columns_load`, `columns_save`, `columns_backup`. Register in `lib.rs`. `commands.ts`: the three wrappers.
- New `src/store/columns.ts` (state per view, density placeholder "regular"), `src/widgets/library/columns.ts` (UD9 pure model), `TableHeader.tsx`, `HeaderMenu.tsx`, `src/shell/columns-persistence.ts` (parse, validate, debounce, flush; same shape as `persistence.ts`).
- `src/components/virtual-list.tsx`: the `grid` role next to `listbox` and `tree` (UD8), a sticky `header` slot inside the scroll element, a `contentWidth` so the body and header scroll together horizontally, `aria-multiselectable`, Shift and Ctrl modifiers passed to `onMove` and a new `onSelectRange`. Stable row props (PF-1): the list owns the positioned wrapper element per row (`transform`, `height`) and passes the row component only primitives (`id`, `index`, `active`, `selected`, `posinset`, `setsize`) and stable callbacks, so `memo` on `Row` compares equal across a container resize. The current `frame` object with its nested `style` (`src/components/virtual-list.tsx`, `renderRow`) goes away.
- `src/widgets/library/lists.tsx`: `SongList` becomes `SongTable`; the Artist and Album lists are unchanged. `rows.tsx`: `Row` and `SongCells` are `memo` components with primitive props (PF-1); the Songs cells render per column as `gridcell` elements; the `#` cell shows the track number or the playing icon (TB-11); the row height comes from `useTokenPx` since U1.
- `src/store/library.ts`: `selectedSongs: Set<number>`, `anchor`, `setSongSelection(ids, anchor)` (UD12). Context menu actions in `lists.tsx` act on the selection.
- `tests/e2e/library-data.ts`: a `LIBRARY_SIZE` environment value (default as today; 50,000 for the perf spec), sort support in the mock `library_song_ids`, `trackNo` and `disc` in the rows. `install-mocks.ts`: the columns commands.
- New `tests/e2e/table.spec.ts`, `table-perf.spec.ts`. Update `library.spec.ts`, `playback.spec.ts` (the playing indicator location).
- `docs/file-formats.md`: `columns.json`. `README.md`: the table keys.

**Implementation notes**

- Column minimums: `#` 40 px, Title 120 px, Artist 80 px, Album 80 px, Time 56 px. Title is `minmax(120px, 1fr)`; the others are fixed widths. Numeric columns (`#`, Time) align right (TB-6).
- When the sum of the fixed widths plus the Title minimum exceeds the container, the content width is that sum and the container scrolls horizontally; the header is `position: sticky; top: 0` inside the same scroll element, so it moves with the body (TB-7).
- Resize: a pointer drag on the divider (`role="separator"` inside the header, keyboard Arrow keys too). Double-click a divider auto-sizes that column to the widest rendered cell in the DOM plus padding; "Auto size all columns" does it for every visible column. The rendered window is the measurement scope (rows outside it are not loaded, D14). Document this in the header menu tooltip.
- Reorder: pointer drag of a header cell with a drop indicator line; keyboard: Shift+Left and Shift+Right on a focused header cell, and "Move left" and "Move right" in the header menu (AX-1). `#` never moves (UD8).
- Keyboard path into the header (AX-1): the grid has two Tab stops, the header row and the body. In the header, Left and Right move between column header cells (roving `tabindex`), Enter or Space sorts, Shift+F10 or the context key opens the header menu, Shift+Left and Shift+Right reorder, Ctrl+Left and Ctrl+Right resize by 8 px (the divider belongs to the header cell), Home and End go to the first and last column, and Down moves to the body. The header menu lists these keys.
- Favorites by keyboard (UD8): the song row menu gains "Add to Favorites" or "Remove from Favorites" (`toggleFavorite`), reachable with Shift+F10 or the context key on the active row. The pointer heart stays (D23).
- Visibility: right-click or Shift+F10 on the header opens the menu with a checkbox per column (`#` and Title cannot be hidden), "Auto size column", "Auto size all columns", "Move left", "Move right".
- Sort: click a header to sort ascending, again for descending, again for the R4 default; `aria-sort` on the header cell and an arrow icon. The ids come sorted from Rust; the queue rule (R6) uses the ids as shown.
- Selection: UD12. The grid keeps `aria-activedescendant` on the active row; selected rows carry `aria-selected` (row-selection grid, UD8). Up and Down move rows; Left and Right scroll the grid horizontally when it overflows and are otherwise unused, because cells are not focus targets. Delete does nothing in the Library (R25 scopes it to the queue and playlists).
- Per-view state (TB-9): the view id is `songs.columns` or `songs.topBottom`. A mode switch loads the other view's state. Reset layout does not touch column state (PS-6 keeps them apart); the header menu gets "Reset columns".
- PF-1: a container resize re-renders the header and the grid template, not the rows. Verify through the real path: mount `SongTable` in Vitest with a mocked `ResizeObserver`, fire a width change on the container, and count `Row` renders with React Profiler `onRender`. A test that passes identical props by hand does not count.
- PF-3: `table-perf.spec.ts` runs with `LIBRARY_SIZE=50000`, scrolls the table by wheel for 3 s, sorts by Title, resizes a column and resizes the dock sash, and records the longest frame gap through `requestAnimationFrame` timestamps. CI asserts no gap over 100 ms (the AC-2 budget). The reference-machine number is recorded manually in U7 (UQ3).
- Tree mode is unchanged: indented rows, no header, no columns (UD8).

**Tests**

- `cargo test`: sort by each column ascending and descending with the D4 fold ("Émile" sorts with "Emile"; "2" before "10"); ties keep the R4 order; two keys; `track_no` and `disc` in `SongRow`; the columns file round trip and backup.
- Vitest `columns.test.ts`: resize respects minimums; reorder moves one column; hide and show; auto-size clamp; the sort cycle; parse of a valid file, a bad width, an unknown column (ignored with one log line), a wrong version (rejected).
- Vitest `library.test.ts`: multi-select rules of UD12.
- Vitest `rows.test.tsx`: a container width change through the mocked `ResizeObserver` re-renders the header and no `Row` (PF-1, real path).
- Playwright `table.spec.ts` (TB-2 to TB-11): drag a divider; a column never goes below its minimum; double-click a divider; the header menu items; drag a header to reorder; `#` has no drag handle and no hide item; hide Album and show it again; keyboard only: Tab to the header, Right to Artist, Enter sorts, Shift+Right moves it after Album, Ctrl+Right widens it by 8 px, Shift+F10 opens the header menu, Down returns to the body; Title takes the spare width; Time is right aligned; at a narrow Library the horizontal scrollbar appears and the header stays aligned with the body after scrolling; click Title to sort and the arrow and `aria-sort` show; Shift+click and Ctrl+click select ranges; Enter plays the active row; Shift+F10 on a row, then "Add to Favorites": the heart fills and the row is in Favorites; the playing row shows the icon in the `#` column; the state survives a mode switch and a reload per mode; Tree mode shows no header.
- Playwright `table-perf.spec.ts` (TB-1, PF-3): 50,000 rows, the DOM holds at most the visible rows plus overscan, no frame gap over 100 ms.
- Playwright `audit.spec.ts`: axe with the table (`grid`, `row`, `columnheader` and `gridcell` roles, `aria-multiselectable`, `aria-sort`); no role-context violation; `aria-rowcount` equals the song count plus one; the header row carries `aria-rowindex="1"`; after a scroll, every rendered body row carries `aria-rowindex` equal to its list position plus two, with no gap and no repeat between consecutive rows.

**Acceptance criteria**

- U4-AC1: TB-1 to TB-11 pass as the tests show. Rework Phase 3 accept: the 50,000-row test passes.
- U4-AC2: PS-6 passes: `columns.json` exists apart from `layout.json`, with backup and defaults on a bad file.
- U4-AC3: PF-1 and PF-3 pass in CI; the reference-machine number is pending until U7.
- U4-AC4: the bindings diff is clean; the validation command set passes.

**Dependencies**

U1. (U2 and U3 are not required. The workflow runs one phase at a time, so U4 follows U3 in practice.)

---

### Phase U5: Transport extras: card, customize, mini player

**Goal**

The Now playing widget is a dockable card that shares the player state with the band. The user can reorder and hide optional band slots. A click on the art switches to a mini player window.

**Requirements covered**

TR-9, TR-10, TR-11 (all SHOULD). Rework section 8 Phase 5 items 1, 2 and 4.

**Changes**

- `src/widgets/now-playing/NowPlayingWidget.tsx`: the stacked card (art, title, artist and album, heart, seek bar with times, previous, play or pause, next; stop, shuffle and repeat in an overflow below 320 px width) on the `src/shell/transport/` components. Minimum 220 x 240 in `widgets.ts`.
- New `src/dialogs/CustomizeTransportDialog.tsx` (UD20). `src/store/ui.ts`: `transportSlots`. `src/shell/transport/slots.ts`: apply the custom order and hidden set before the class rule. `persistence.ts`: `transportSlots` in `layout.json` v2 (optional, validated: known ids, play or pause never hidden). The overflow menu gets "Customize transport bar…" and the Layout menu too.
- Mini player (UD19): `src-tauri/src/window.rs`: `set_mini(window, on, height)` with the band height in logical px; `src-tauri/src/commands/` new `window.rs` with `window_set_mini(on, height)`; register in `lib.rs`; `commands.ts`: `windowSetMini(on, height)`. Rust refuses a height below 32 or above 200. `src/App.tsx`: a `mini` state in `useUiStore` renders only the band. The band's art is a button "Mini player" (TR-9) and "Exit mini player" in the overflow menu.
- `tests/e2e/install-mocks.ts`: `window_set_mini` sets the viewport in the mock (`page.setViewportSize` is the test side). New `card.spec.ts`, `customize.spec.ts`, `mini.spec.ts`.
- `docs/file-formats.md`: `transportSlots`. `README.md`: mini player note.

**Implementation notes**

- The card and the band use the same store and the same control components; no second player state (rework 5.10).
- The customize dialog is keyboard complete: checkboxes, Move up and Move down. Pointer drag reorders the same list. Play or pause has no checkbox and cannot move out of the first group of three (previous, play, next stay together).
- In mini mode F6 has one region, the band. Space, Ctrl+F (no Library: no effect) and media keys keep working.
- The mini window keeps the native title bar (SH-7 does not apply; no custom title bar exists).

**Tests**

- Vitest `slots.test.ts`: a custom order and hidden set apply; a hidden play or pause is refused by the parser; an unknown slot id is dropped with one log line.
- Vitest `persistence.test.ts`: `transportSlots` round trip and validation.
- `cargo test` (`window.rs`): mini size and minimum from the given height; a height below 32 or above 200 logical px is refused; exit clears the maximum height, restores the 800 x 560 minimum and returns the stored size and position; a mini size is never worth saving.
- Playwright `card.spec.ts` (TR-11): show Now playing; it docks like any widget; play in the band and the card's play button shows pause; seek in the card and the band's time changes.
- Playwright `customize.spec.ts` (TR-10): hide Stop and move Volume before Shuffle; the band follows; a reload keeps it; Reset layout restores the default order; the dialog works by keyboard only.
- Playwright `mini.spec.ts` (TR-9): click the art: the mocked `window_set_mini(true, height)` was called with the computed compact band height and the shell shows only the band at the XS or SM class; at root font size 125% and 140% the height argument grows and the band does not clip; "Exit mini player" returns.

**Acceptance criteria**

- U5-AC1: TR-9, TR-10 and TR-11 pass as the tests show, or the owner defers one in writing (rework Phase 5 accept).
- U5-AC2: no second player state exists (grep: `usePlayerStore` is the only player store).
- U5-AC3: the validation command set passes.

**Dependencies**

U2 (layout v2 fields, presets with the card), U4 (the shared row components are stable).

---

### Phase U6: Table extras: row drag, secondary sort, density

**Goal**

The user drags selected songs to a playlist or to the Play queue, sets a secondary sort with Shift+click, and picks compact or regular rows.

**Requirements covered**

TB-12, TB-13, TB-14 (all SHOULD). Rework section 8 Phase 5 (extras list does not name them; they are the SHOULD rows of section 7.5).

**Changes**

- Row drag (UD21): new `src/widgets/library/row-drag.ts` (pointer drag state, ghost element, drop target resolution by `elementFromPoint`), drop targets marked with `data-drop-target="playlist:<id>"` in `PlaylistsWidget.tsx` and `data-drop-target="queue"` in `QueueWidget.tsx`, a highlight class on the target.
- Secondary sort (TB-13): `columns.ts` sort cycle takes a `shift` flag that adds or flips a second key; the header shows "1" and "2" badges with the arrows; `SongSort` already takes two keys (U4).
- Density (TB-14): `src/store/columns.ts` `density`; the row-height readers take `--size-row-compact` when compact; the View menu gets "Compact rows"; `columns.json` saves it; the Album list keeps its 48 px rows.
- New `tests/e2e/row-drag.spec.ts`, `density.spec.ts`; `table.spec.ts` gains the secondary sort case.
- `docs/file-formats.md`: `density`, two sort keys.

**Implementation notes**

- Row drag starts after a 4 px pointer move on a selected row (a plain click still selects). A drag from an unselected row selects it first. Escape cancels. The keyboard path is the context menu (Add to queue, Add to playlist), unchanged (AX-1).
- The drop on a playlist calls `addToPlaylist(id, ids)`; on Favorites it adds only the ids that are not favorites yet through `toggleFavorite` (R12: Favorites toggles and holds no duplicates, D20); on the queue `queueAppend(ids)` and the status message "Added to queue" (R6).
- Shift+click on a header that is already the primary key flips its direction; Shift+click on another header sets it as the second key.
- Density switches `useTokenPx` between `--size-row-regular` and `--size-row-compact` for the Songs table, Tree rows, the Play queue and playlist entries (every row-height reader since U1). The Album list keeps `--size-row-album`.

**Tests**

- Vitest `row-drag.test.ts`: the threshold, the target resolution, cancel on Escape.
- Vitest `columns.test.ts`: the two-key cycle.
- Vitest `columns-persistence.test.ts`: `density` round trip and an invalid value falls back to regular.
- Playwright `row-drag.spec.ts` (TB-12): drag two selected songs to a playlist row: the playlist gains two entries; drag to the Play queue: the queue gains them and the status line says "Added to queue"; drag one favorite and one other song to Favorites: Favorites gains one entry and holds no duplicate; Escape during a drag adds nothing.
- Playwright `table.spec.ts` (TB-13): Shift+click Artist after Title: the mock receives two keys and the badges show.
- Playwright `density.spec.ts` (TB-14): Compact rows: the row box height equals `--size-row-compact`; the setting survives a reload; reduced motion is unaffected.

**Acceptance criteria**

- U6-AC1: TB-12, TB-13 and TB-14 pass as the tests show, or the owner defers one in writing.
- U6-AC2: the validation command set passes.

**Dependencies**

U4, U5.

---

### Phase U7: Verification, screenshots and release notes

**Goal**

Every MUST is verified on the real app, the test checklist of rework section 9 is recorded, the "after" screenshots exist, the docs are complete and the parent plan and traceability files are updated.

**Requirements covered**

PF-3 (reference machine), TA-1, TA-2, TA-3, TA-4, AX-1, AX-2 (whole app), rework sections 9, 12 and 14.

**Changes**

- Run `npm run shots -- after` and commit `docs/ui-reference/after/*.png` at the three sizes.
- Run the rework section 9 checklist (with 800 x 560 in place of 800 x 500, UC10) on Windows 11 (WebView2) and one Linux distribution (WebKitGTK) with the Release workflow packages (`.github/workflows/release.yml`, `workflow_dispatch` as P23.5 did). Record each row in `docs/ui-audit.md` and the manual rows in `docs/release-checklist.md`.
- TA-2: choose the music folder through the native dialog on Windows and on Linux (the Rust picker, D13); record both rows in `docs/release-checklist.md`.
- Display scaling 100%, 150% and 200% (rework section 9): check the band height follows the font scale and nothing clips; record the result.
- TA-1: `npm run check:sources` with the U1 drag guard passes on the final tree (no `dragstart`, `onDragStart`, `onDragOver`, `onDrop` or truthy `draggable` under `src/`); record it in `docs/ui-audit.md`.
- `docs/requirements-traceability.md` section 7 (created in U0): every row Done or the recorded exception.
- `docs/build-plan.md`: section 2 pointer row status, section 13 entry, D57 to D59 marked superseded (done in U0; confirm).
- `README.md`: the keyboard list (separators, table keys, lock shortcut if any) and the new files (`layout.json` v2, `columns.json`).
- `docs/MusicPlayer_REQUIREMENTS.md` v1.8: the owner approves the U0 wording (UQ4) or the change log records the differences.

**Implementation notes**

- No feature work. A defect found here is fixed in this phase when it is in code the U phases changed (F2), else proposed in `docs/build-plan.md` section 11 (F3).
- The reference-machine PF-3 number goes into the U7 phase record with the machine description (UQ3).
- A check that cannot run in the environment is named with its reason (AGENTS.md platform reporting).

**Tests**

- The complete validation command set.
- The rework section 9 checklist, manual, both platforms.

**Acceptance criteria**

- U7-AC1: every MUST row of section 8 is Done, or carries a recorded exception with the reason and the owner's acknowledgement.
- U7-AC2: the three "after" screenshots exist.
- U7-AC3: the section 9 checklist is recorded with a result per row and per platform.
- U7-AC4: `docs/requirements-traceability.md`, `docs/build-plan.md`, `docs/file-formats.md`, `docs/theming-and-brand.md`, `docs/design.md`, `docs/MusicPlayer_REQUIREMENTS.md` and `README.md` are updated.
- U7-AC5: rework section 14: every MUST passes, every phase has its check in `docs/ui-audit.md`, before and after screenshots exist, the five rework decisions are closed and unchanged.

**Dependencies**

U6.

---

## 7. Cross-cutting work

| Concern | Work | Phase |
|---|---|---|
| Migration | `layout.json` v1 is backed up and replaced by the default preset (UD5). `settings.json` keeps version 1; `x` and `y` are optional (UD14). `columns.json` is new. No data outside the config folder changes. | U1, U2, U4 |
| Backwards compatibility | An older app that reads a v2 `layout.json` rejects it by version and applies its Columns layout (`parseLayout` rule 1). An older app ignores `x` and `y`. | U1, U2 |
| Security | No new webview permission (`src-tauri/capabilities/default.json` unchanged, D13). File names are fixed in Rust. `columns.json` has the same 1 MB limit and JSON-object check as `layout.json`. Window commands take a boolean only. | U1, U2, U4, U5 |
| Observability | One `warn` log line per backup, per rejected file, per dropped unknown column or slot id (R23). The e2e mock records them in `window.e2eLog` (P23 note N5). | U1, U4, U5 |
| Accessibility | Band buttons with names and shortcuts, overflow menu, separators with the W3C pattern, column headers with `aria-sort`, a multiselectable listbox, keyboard paths for reorder and customize, reduced motion untouched. axe runs in `audit.spec.ts` after each phase. | U1, U3, U4, U5 |
| Performance | rAF observers (U1), memoized rows and the 50,000-row perf spec (U4), Rust sorting (U4). The idle memory budget (R20, D49) is re-measured in U7 only if the owner asks; the table adds no per-row memory beyond the rendered window. | U1, U4, U7 |
| Rollout | The app is 0.1.0 with no released users. No feature flag. Each phase ships as one PR on the task branch; the release packages come from U7. | U7 |
| Rollback | Revert the phase commits. `layout.json.bak` and `columns.json.bak` keep the previous files. | all |
| Documentation | `docs/ui-audit.md` (U0, every phase), `docs/file-formats.md` (U1, U2, U4, U5, U6), `docs/theming-and-brand.md` (U1), `docs/design.md` (U0, U3), requirements v1.8 (U0, U7), `README.md` (U4, U5, U7), traceability (U7). | as listed |
| Cleanup of replaced code | Bar widgets, `TransportWidget`, `bars.spec.ts`, bar fixtures, the Library-mode layouts and their menu group, the P22 Tab-order note. Each deletion happens in the phase that replaces the code. | U1, U2, U3 |

---

## 8. Traceability

Verification codes: UT Vitest or `cargo test`, E2E Playwright (Chromium and WebKit), MAN manual on Windows and Linux, REV review of code or docs. Status is updated by each phase.

| Requirement | Planned phase | Verification | Status |
|---|---|---|---|
| SH-1 three zones | U1 | E2E `transport-band.spec.ts`; REV `App.tsx` | Done (U1) |
| SH-2 bands are not dock panels | U1 | UT `widgets.test.ts` (no `transport` id); E2E (band is outside `.dv-dockview`) | Done (U1) |
| SH-3 dock fills with `minmax(0, 1fr)` | U1 | REV grid CSS; E2E (dock height equals window minus bands) | Done (U1) |
| SH-4 no page scroll | U1 (re-verify) | E2E `audit.spec.ts` narrow window (P17-AC4 case) | Done (U1) |
| SH-5 minimum window size | U1 (re-verify, UC7, UC8) | UT `window.rs`; E2E at 800 x 560 | Done (U1, UC7, UC8) |
| SH-6 transport top or bottom | U2 | E2E `persistence.spec.ts` | Done (U2) |
| SH-7 drag region (MAY) | none | Not applicable: native title bar | Not applicable |
| TR-1 height from a token, not draggable | U1 | UT tokens script; E2E (no sash touches the band) | Done (U1) |
| TR-2 size classes by bar width | U1 | UT `use-size-class.test.ts`; E2E | Done (U1) |
| TR-3 play always visible, overflow menu | U1 | UT `slots.test.ts`; E2E | Done (U1) |
| TR-4 seek click, drag, keyboard, times | U1 (re-verify at every class) | E2E `transport-band.spec.ts` | Done (U1) |
| TR-5 art, title, artist with ellipsis | U1 | E2E (computed `text-overflow`) | Done (U1) |
| TR-6 never overlays the list | U1 | E2E (band box and dock box do not intersect) | Done (U1) |
| TR-7 opaque background | U1 | E2E (alpha 1) | Done (U1) |
| TR-8 32 px hit area, focus ring, tooltip with shortcut | U1 | E2E | Done (U1) |
| TR-9 mini player (SHOULD) | U5 | UT `window.rs`; E2E `mini.spec.ts` | Planned |
| TR-10 customize transport (SHOULD) | U5 | UT `slots.test.ts`; E2E `customize.spec.ts` | Planned |
| TR-11 Now playing card (SHOULD) | U5 | E2E `card.spec.ts` | Planned |
| DK-1 one docking library | U2 (re-verify) | REV `package.json` | Done (U2) |
| DK-2 minimum width and height per widget | U2 (re-verify) | UT `widgets.test.ts`; E2E `docking.spec.ts` | Done (U2) |
| DK-3 edges, tab groups, float (pointer and keyboard) | U2 | E2E `docking.spec.ts`, `floating.spec.ts` | Done (U2) |
| DK-4 drop preview | U2 (re-verify) | E2E `docking.spec.ts` | Done (U2) |
| DK-5 Lock layout | U2 | E2E `lock.spec.ts` | Done (U2) |
| DK-6 View menu with every widget | U2 | E2E `layouts.spec.ts` | Done (U2) |
| DK-7 Reset layout | U2 | UT `presets.test.ts`; E2E | Done (U2) |
| DK-8 default preset | U2 | E2E `presets.spec.ts` | Done (U2) |
| DK-9 three presets (SHOULD) | U2 | E2E `presets.spec.ts` | Done (U2) |
| DK-10 pop-out off | U2 (re-verify) | REV (no `addPopoutGroup`) | Done (U2) |
| SP-1 1 px line, 6 px hit area, cursor | U3 | E2E `splitters.spec.ts` | Done (U3) |
| SP-2 double-click reset | U3 | UT, E2E | Done (U3) |
| SP-3 keyboard separators | U3 | UT `splitters.test.ts`; E2E in both engines | Done (U3; WebKit in CI) |
| SP-4 pixel sidebars, center absorbs | U2 | E2E `resize.spec.ts` | Done (U2) |
| SP-5 icon rail (SHOULD) | U3 | E2E `rail.spec.ts` | Done (U3) |
| SP-6 no zero size, explicit collapse with a restore button (SHOULD) | U3 | E2E `docking.spec.ts`, `splitters.spec.ts` (UD25) | Done (U3) |
| SP-7 auto-hide with pin (MAY) | none | Not built | Not built |
| TB-1 virtualized fixed rows | U4 (re-verify) | E2E `table-perf.spec.ts` | Passes today |
| TB-2 divider resize with minimums | U4 | UT `columns.test.ts`; E2E | Planned |
| TB-3 auto size, header menu | U4 | E2E `table.spec.ts` | Planned |
| TB-4 header drag reorder | U4 | E2E | Planned |
| TB-5 right-click show or hide | U4 | E2E | Planned |
| TB-6 Title flexible, numeric right | U4 | E2E (computed widths and `text-align`) | Planned |
| TB-7 sticky header, shared horizontal scroll | U4 | E2E | Planned |
| TB-8 click to sort with an arrow | U4 | UT `cargo test` sort; E2E | Planned |
| TB-9 state per view | U4 | UT parse; E2E (per mode, reload) | Planned (two Songs views, UD8) |
| TB-10 arrows, Enter, Shift and Ctrl | U4 | UT `library.test.ts`; E2E | Partly today |
| TB-11 playing indicator in the first column | U4 | E2E | Passes today (moves to `#`) |
| TB-12 row drag to playlist or queue (SHOULD) | U6 | UT, E2E `row-drag.spec.ts` | Planned |
| TB-13 secondary sort (SHOULD) | U6 | UT, E2E | Planned |
| TB-14 density (SHOULD) | U6 | E2E `density.spec.ts` | Planned |
| PS-1 JSON with a schema version | U1, U2 | UT `persistence.test.ts` | Done (U2) |
| PS-2 config directory through Rust | U1 (re-verify) | UT `layout.rs` | Done (U1) |
| PS-3 500 ms debounce and save on close | U2 (re-verify) | UT `watchLayout`; E2E | Done (U2) |
| PS-4 validate, back up, default | U1 | UT; E2E `persistence.spec.ts`; `cargo test` backup | Done (U1) |
| PS-5 window size and position, transport position, collapse state | U2 | `cargo test`; E2E | Done (U3; real-app position check by the owner) |
| PS-6 column state apart from the layout | U4 | UT; E2E | Planned |
| TH-1 tokens for colors, spacing, row and bar height | U1 | UT tokens script; `check:sources` (colors, spacing guard); UT `rows.test.tsx` | Done (U1) |
| TH-2 dark default | U1 (re-verify) | REV `index.html`, `globals.css` | Done (U1) |
| PF-1 resize does not re-render rows | U4 | UT `rows.test.tsx` | Planned |
| PF-2 observers on rAF | U1, U3, U5 | UT `resize.test.ts`; UT per observer path (`DockShell`, `FrameSplit`, `LibraryWidget`, `use-size-class`, `useTokenPx`, rail, card) | In progress (U1, U3 paths done; card U5) |
| PF-3 50,000 rows without stutter | U4, U7 | E2E `table-perf.spec.ts`; MAN reference machine | Planned |
| AX-1 keyboard reach and names | U1, U3, U4, U5 | E2E axe in `audit.spec.ts`; keyboard specs | In progress (U1 band, U3 separators) |
| AX-2 reduced motion (SHOULD) | U1 (re-verify) | E2E `expectNoMotion` | Done (U1) |
| TA-1 `dragDropEnabled` only with HTML5 drag | U1, U7 | CI `check:sources` drag guard (UC13); REV in U7 | Not applicable while pointer drag (U1 guard in check:sources) |
| TA-2 folder selection by dialog | U7 | REV `SettingsDialog.tsx`, D13; MAN on Windows and Linux | Passes today (code); manual rows planned |
| TA-3 WebView2 and WebKitGTK | U7 | CI (Chromium, WebKit); MAN both platforms | Planned |
| TA-4 not only `localStorage` | U1 (re-verify) | REV | Done (U1) |
| Rework 8 Phase 0 accept | U0 | REV | Done (U0) |
| Rework 8 Phase 1 accept | U1 | E2E | Done (U1) |
| Rework 8 Phase 2 accept | U2 | E2E, MAN (hand-corrupted file) | Done (U2) |
| Rework 8 Phase 3 accept | U4 | E2E 50,000 rows | Planned |
| Rework 8 Phase 4 accept | U3 | E2E | Done (U3) |
| Rework 8 Phase 5 accept | U5, U6 | E2E, or an owner deferral in writing | Planned |
| Rework 9 checklist | U7 | MAN | Planned |
| Rework 14 definition of done | U7 | REV | Planned |

### 8.1 Deferred and out of scope

| Item | Reason | Owner of the decision |
|---|---|---|
| SH-7 drag region | The app keeps the native title bar. | Rework (MAY) |
| SP-7 sidebar auto-hide with a pin | MAY. Not built. | Rework (MAY) |
| TB-9 column state for an Albums view and for each playlist | The Album list is a card list (R5, C11) and the Playlists widget is a tree, so neither has columns. The two Songs views carry the state (UD8). | Owner limit of October 13 (modes stay) |
| A search field in the band | One field in the Library header (UC9). The band gets a focus button. | Owner decision 10 (v1.5) |
| Bar height values, breakpoints and hit areas as final numbers | Rework 3.3 marks them as starting values. UD1, UD3 and UD4 fix them; U7 may tune after the checklist. | Implementer |
| Pop-out windows | Off (DK-10, rework decision 5, D8). | Rework |
| Keyboard move of widgets, named layouts, layout import and export, light theme, multiple folders | Requirements section 7 stays. | Requirements v1.7 |

---

## 9. Risks

| ID | Risk | Effect | Mitigation | Phase |
|---|---|---|---|---|
| UK1 | Synthetic pointer events on a Dockview sash do not move it in WebKitGTK. | SP-3 fails on Linux. | UD7 names the `setSize` fallback; `splitters.spec.ts` runs in WebKit in CI. | U3 |
| UK2 | `proportionalLayout: false` changes how the D45 clamp redistributes space at small windows. | A group below its minimum. | `clamp.test.ts` and the 800 x 560 e2e case run again in U2. | U2 |
| UK3 | A floating group saved on a large monitor lands outside a smaller window. | A widget the user cannot reach. | UD17 moves it inside on load and on resize; the View menu re-docks it ("Dock" control, and hide then show). | U2 |
| UK4 | Rust sorting of 50,000 ids on every header click or search keystroke. | Visible delay. | Fold once per track at index build (D4 already folds for R3); measure in `table-perf.spec.ts`; the search debounce of 120 ms stays. | U4 |
| UK5 | Auto-size measures rendered rows only (D14). | A column sized to the visible window, not the whole list. | Documented in the header menu; the same limit as the reference apps on long lists. | U4 |
| UK6 | The requirements v1.8 wording differs from the owner's intent. | Rework of docs. | UQ4: the owner approves the U0 change list before U7 closes. | U0, U7 |
| UK7 | Size tokens widen the brand file. A branding swap (AC-15) without them fails the token script. | Build error after a swap. | The script names the missing key; `docs/theming-and-brand.md` lists the keys; the defaults are documented. | U1 |
| UK8 | Multi-select changes the context menu semantics in e2e tests that assume one selected song. | Test churn. | U4 updates `library.spec.ts` and `playlists.spec.ts` in the same phase. | U4 |

---

## 10. Phase records

Each phase appends its record here when it closes: status, commits, packages, criteria table with evidence, notes, exceptions, blockers, the TWO-PASS REVIEW counts with every F3 and F4 finding, and follow-ups.

### U0. Audit and source alignment (October 13, 2026)

**Status:** Done. **Commit:** `U0: audit, screenshots and source alignment`.

| Criterion | Result | Evidence |
|---|---|---|
| U0-AC1 | Pass | `docs/ui-audit.md` sections 1 to 4: what exists, what breaks, what passes (with file evidence) and the conflict list. |
| U0-AC2 | Pass | `docs/ui-reference/before/800x560.png`, `1280x720.png`, `1920x1080.png` from `npm run shots -- before` (Chromium, mocked app, loaded library); `scripts/ui-shots.test.ts` checks the PNG sizes. |
| U0-AC3 | Pass | `docs/MusicPlayer_REQUIREMENTS.md` v1.8 (change log, decision 38, R5, R28, R28.1, R29, R29.1 deleted, sections 4, 5, 7 and 9); `docs/design.md` section 5 names the four zones. |

**Notes**

- `docs/requirements-traceability.md` gets section 7 with the 74 rows of section 8 of this plan; the old sections 7 and 8 become 8 and 9.
- The parent-plan items (pointer row, superseded marks) shipped with this plan; U0 confirms them. F-12 and F-13 already stand in `docs/build-plan.md` section 11.
- Baseline before U0: `npm run check` passes (253 Vitest tests); 115 of 115 Chromium e2e tests pass; `cargo test --workspace --no-run` builds.

**Rule 10 (real app):** not applicable. U0 changes docs and adds a script; no app code changes. The screenshots ran the mocked e2e app in Chromium.

**Checks that could not run:** WebKit e2e. The environment has no Playwright WebKit build and forbids `playwright install`; CI runs WebKit.

**TWO-PASS REVIEW:** F1 0, F2 1, F3 0, F4 3.

- F2 (fixed): the screenshot could fire before the album thumbnails loaded. The script now waits for network idle.
- F4: a server already on port 4173 is reused by the script. It serves the same `dist-e2e` folder that the script builds first.
- F4: renumbering the traceability sections breaks no reference (grep: no other file cites traceability section 7 or 8).
- F4: v1.8 goes beyond owner wording. It is a change list for the owner's approval (UQ4), as U0 requires.

### U1. Shell zones and transport band (October 13, 2026)

**Status:** Done. **Commit:** `U1: shell zones and transport band`.

| Criterion | Result | Evidence |
|---|---|---|
| U1-AC1 | Pass | `src/App.tsx` and `.app-shell` in `src/styles/globals.css`: header, band, dock (`minmax(0, 1fr)`), status; `widgets.test.ts` (no `transport` id); `transport-band.spec.ts` (band outside `.dv-dockview`, dock height equals the window less the bands); `audit.spec.ts` P17-AC4 at 800 x 560; `window.rs` minimum unchanged (UC7). |
| U1-AC2 | Pass | `transport-band.spec.ts`: XL at 1280, LG at 1100, MD at 800 with the same height and one row; 800 to 2560 px sweep (rework Phase 1 accept); SM and XS at 600 and 400 px with the progress line and the overflow items; seek by click, drag and keyboard (also from the overflow popover); ellipsis, no overlap, alpha 1, 32 x 32 px named buttons, "Play (Space)" tooltip. `slots.test.ts`, `use-size-class.test.tsx`. |
| U1-AC3 | Pass | grep: no `bar-rules`, `BarContent`, `TransportWidget` or `repairBars` under `src/`. |
| U1-AC4 | Pass | `theme/tokens.json` `sizes` and `spacing` in rem; `build-tokens.test.ts`; `tokens.test.tsx`; `rows.test.tsx`; no `ROW_HEIGHT` under `src/`; the 100%, 125% and 140% cases in `transport-band.spec.ts`; `npm run check:sources` with the drag and spacing guards (`check-sources.test.ts`). |
| U1-AC6 | Pass | `docking.spec.ts` DK-8 case: Playlists left, Library center, Play queue and Lyrics tabbed right, Now playing hidden; `layouts.test.ts`. |
| U1-AC5 | Pass (Chromium) | Validation command set passes; Chromium e2e 116 of 116, including the default-preset F6 order (`keyboard.spec.ts`). WebKit runs in CI only (see below). |

**Notes**

- `src/shell/transport/use-current-song.ts` holds the one song lookup that the band and the Now playing widget share (UD2, rework 5.10).
- The band draws its separator as an inset shadow, not a border, so the token height holds the content exactly (TH-1).
- `applyClamp` now also grows a group that sits below its minimum: Dockview caches a column's minimum width, so Now playing below Playlists stayed at 200 px (found by P2-AC6).
- `scripts/check-sources.mjs` guards: HTML5 drag events (UC13, TA-1) and arbitrary px spacing (UD1).
- Unit tests: 283 (282 pass, 1 skipped by design). New helper `src/test/resize.ts` drives `ResizeObserver` and animation frames in jsdom.

**Rule 10 (real app):** Linux, WebKitGTK 2.52 under Xvfb 1280 x 800, `npm run tauri dev`. The window shows the four zones, the band (XL slots, "Nothing playing"), the default preset and the first-run notice. A version 1 `layout.json` in the config folder became `layout.json.bak` at start, and `app.log` has both lines (`layout: version 1 backed up as layout.json.bak` from the webview, `layout: layout.json backed up as layout.json.bak` from the core). Media controls could not attach (no D-Bus session in the container); not related to U1. Windows (WebView2) not run: no Windows machine here; the owner runs it before U2 (rule 10).

**Checks that could not run:** WebKit e2e (no Playwright WebKit build; `playwright install` is not allowed here). CI runs it.

**TWO-PASS REVIEW:** F1 0, F2 3, F3 0, F4 5.

- F2 (fixed): the band border took 1 px of the token height, so the art overflowed (TH-1 case).
- F2 (fixed): a widget that joins a narrower column stayed below its minimum width (DK-2); `applyClamp` enforces it.
- F2 (fixed): the P17-AC4 control sweep counted Base UI's hidden Select input as a clipped control once the Library is narrow at 800 px; the sweep skips `aria-hidden` elements.
- F4: `src/test/resize.ts` lives in `src/` but only tests import it; the mock-file guard does not apply (no "mock" or "fixture" in the name) and Vite does not bundle it.
- F4: `useTokenPx` reads computed style on each render of a list component; the lists do not re-render on scroll (the virtualizer state is inside `VirtualList`).
- F4: the overflow popover has no trigger of its own; Base UI anchors it to the More button and axe finds no violation.
- F4: the drag guard can flag the word "draggable" in a comment; no such comment exists, and the strict rule is intended.
- F4: `layout_backup` runs before the default preset loads; a save happens only 500 ms after a later change, so the rename and the next save do not race.

### U2. Docking: presets, lock, View menu, persistence v2 (October 13, 2026)

**Status:** Done. **Commit:** `U2: presets, lock, floating groups, View menu and window position`.

| Criterion | Result | Evidence |
|---|---|---|
| U2-AC1 | Pass | `presets.spec.ts` (DK-7, DK-8, DK-9); `docking.spec.ts` (DK-3 every window edge and every Library edge, tab group, DK-4 overlay, DK-10 no pop-out, Library guard); `floating.spec.ts` (Float, move, Dock by pointer and keyboard, reload, inside the window); `lock.spec.ts` (DK-5); `layouts.spec.ts` (DK-6 close by tab control, reopen from View, Library disabled and checked); `persistence.spec.ts` (hand-corrupted `layout.json` starts with the default preset and leaves `layout.json.bak`). |
| U2-AC2 | Pass (code and tests); real-app position not exercised | `layout.json` version 2 with `transport`, `locked`, `floatingGroups` (`persistence.test.ts`, `persistence.spec.ts`); debounce and close flush (P9-AC11); backup (U1). `settings.json` `window.x` and `window.y` (`settings.rs`, `window.rs` tests: a position off every monitor is not applied). |
| U2-AC3 | Pass | `resize.spec.ts`: 1280 to 1600 px, Playlists and Play queue keep their widths within 1 px and Library takes the 320 px. |
| U2-AC4 | Pass | `persistence.spec.ts`: Transport bar Bottom puts the band below the dock, survives a reload, Reset puts it back at the top. |
| U2-AC5 | Pass (Chromium) | Validation command set; Chromium e2e 129 of 129. |

**Notes**

- UD16: Dockview 8.5.1 groups expose no layout priority (`priority` exists on Gridview panels only), so the fallback runs: `src/shell/side-widths.ts` puts the side groups back to their pixel widths after each dock resize, with `proportionalLayout={false}`.
- UD17: Float and Dock show on the active tab of a group only, so the 280 px right group keeps both tabs in view; the tab controls are 20 px pointer targets. F6 makes the focused widget the active dock panel, so "Float widget" and "Dock widget" in the Layout menu act on it. Both menu items are disabled while the layout is locked.
- `floatingGroupBounds="boundedWithinViewport"` keeps floating groups inside the dock on load and on resize (UK3).
- The menu groups are now View, Library mode, Layout (presets, Lock layout, Float widget, Dock widget), Transport bar (Top, Bottom) and Reset layout. `LAYOUTS`, `LAYOUT_TITLES` and `applyLayout` are gone.
- Floating group colors come from tokens (`src/styles/dockview-theme.css`).

**Rule 10 (real app):** Linux, WebKitGTK under Xvfb, `npm run tauri dev`: the default preset with the Float controls on the active tabs. Xvfb has no window manager, so no move, resize or close event reached the window and `settings.json` was not written; the window position path is covered by the Rust tests only. The owner checks window position restore on Windows (rule 10).

**Checks that could not run:** WebKit e2e (no Playwright WebKit build here; CI runs it). The real-app window position save and restore (no window manager under Xvfb).

**TWO-PASS REVIEW:** F1 0, F2 2, F3 0, F4 4.

- F2 (fixed): the Float control made the tabs wider, so the 280 px right group lost the Lyrics tab to the overflow list.
- F2 (fixed): the e2e "no float command" assertion contradicted DK-3; it now checks pop-out only (DK-10).
- F4: a moved floating group might not be saved. `floating.spec.ts` shows the new position in `layout.json`.
- F4: the side-width fix can push Library below its minimum at a small window. Dockview clamps `setSize` to the group constraints; the 800 x 560 cases in `layouts.spec.ts` and `persistence.spec.ts` pass (UK2).
- F4: the window shows at the OS position before `restore_position` moves it. It is one frame at start and needs no fix.
- F4: on Wayland `outer_position` fails; the position is then not saved and the OS places the window, which UD14 allows.

### U3. Splitters and sidebar rail (October 13, 2026)

**Status:** Done. **Commit:** `U3: keyboard separators, collapse and restore, Playlists rail`.

| Criterion | Result | Evidence |
|---|---|---|
| U3-AC1 | Pass (Chromium; WebKitGTK real app) | `splitters.spec.ts`: 6 px hit area, 1 px line, resize cursor (SP-1); double-click restores 240 px (SP-2); Tab reaches a separator, arrows, Shift+arrows, Home, End and Enter, `role`, `aria-orientation`, `aria-valuenow`, the name (SP-3), for a dock and a frame separator; `resize.spec.ts` still passes with the layer present (SP-4). `splitters.test.ts` for the keys, the names, the share, the reset rule and the lock. |
| U3-AC2 | Pass | `rail.spec.ts` (SP-5: rail below 140 px, tooltips, a rail button widens to 240 px and selects the playlist, the rail survives a reload); `splitters.spec.ts` and `docking.spec.ts` (SP-6: Collapse and Restore by pointer and by the Layout menu, disabled while locked; a drag past the minimum stops at the minimum). |
| U3-AC3 | Pass | axe in `audit.spec.ts` and `transport-band.spec.ts` with separators in the page: no serious violation. |
| U3-AC4 | Pass (Chromium) | Validation command set; Chromium e2e 136 of 136. |

**Notes**

- `src/shell/splitters.ts` (UD7): one delegated key and double-click handler; `decorateSashes` runs on the next frame after each dock or frame layout. A move dispatches `pointerdown`, `pointermove` and `pointerup` on the sash, so Dockview applies its constraints and the frame save path. The `setSize` fallback was not needed: the real WebKitGTK app moved the Playlists separator from 240 to 320 px with five Right presses (UK1).
- UD17 and UD25 placement: Float or Dock and Collapse or Restore are items of one "Widget options" button (`GroupActions` in `src/shell/WidgetTab.tsx`, Dockview `rightHeaderActionsComponent`) at the right of each tab bar, not controls inside the tab. Controls in the tab made the 280 px right group of the default preset overflow (Lyrics went to the tab overflow list), and hover-only controls moved the drag point onto a control. The button is a real button, so the keyboard reaches it too; the Layout menu items stay.
- Menus, popovers, tooltips and dialogs now use `z-index: var(--z-popup)` (2000): a menu opened from a floating group was under the group's content (Dockview overlays use z-index 40 to 1000 and more).
- The Playlists minimum width is 56 px (UD18); `PlaylistsWidget` keeps one root element in every state, so its size observer (UD24) keeps working when the rail shows.
- SP-7 (MAY, auto-hide with a pin) is not built.
- Process: the `splitters.ts` tests were written together with the code, not before it (AGENTS.md TDD). Each test fails when its behavior is removed (checked by reading each assertion against the code); no code path is untested.

**Rule 10 (real app):** Linux, WebKitGTK under Xvfb with `xdotool`: the first-run notice closes by click; Tab moves through the controls and the "Widget options" buttons show the focus ring; a click on the Playlists separator and five Right presses widen Playlists from 240 to 320 px with the ring on the 6 px hit area. The U2 window position save is still not exercised: without a window manager, `xdotool windowmove` sends no Moved event. The owner checks it on Windows.

**Checks that could not run:** WebKit e2e (CI runs it; `splitters.spec.ts` there is the UD7 WebKit check in CI). Window position save in the real app (no window manager).

**TWO-PASS REVIEW:** F1 1, F2 3, F3 0, F4 4.

- F1 (fixed): a menu opened from a floating group rendered under the group (popups at z-index 50, Dockview floating content at 1000), so Dock widget could not be clicked.
- F2 (fixed): Float and Collapse in the tab overflowed the 280 px right group; they moved to the group options button.
- F2 (fixed): hover-only tab controls moved under the drag start point and stopped a tab drag.
- F2 (fixed): the rail replaced the Playlists root element, so the size observer watched a removed node.
- F4: synthetic pointer events may not move a sash in WebKit (UK1). The real WebKitGTK app moved it; CI runs the e2e in WebKit.
- F4: Restore after a manual drag returns the size from before the collapse. That is the UD25 rule.
- F4: a separator name lists every tab title of a side ("Resize Library and Play queue, Lyrics"). It names both sides, as UD7 asks.
- F4: a decoration pass reads the layout of every sash; it runs once per frame after a layout change only.

### U4 to U7

Not started.

---

## 11. Plan review record

TWO-PASS REVIEW of this plan, October 13, 2026. Pass 1 listed the risks. Pass 2 tested each one against the rework, the requirements, the code and the Dockview 8.5.1 typings.

**Counts:** F1 0, F2 7, F3 2, F4 5.

**F2 (fixed in this plan):**

1. Missing requirement: the first draft had no owner of rework section 9 (the test checklist) and section 12 (screenshots). U0 and U7 now own them.
2. Incorrect assumption: the draft put the window minimum in `tauri.conf.json` (SH-5). The window is built in `window.rs` with `windows: []` in the config. UC7 keeps Rust.
3. Sequencing error: U4 placed `SongSort` in the webview. D14 keeps the index in Rust, so sorting moved to Rust (UD11), with the bindings regenerated.
4. Missing migration: a v1 `layout.json` holds a `transport` panel. The draft migrated it; UD5 now backs it up and resets, which PS-4 also requires.
5. Missing failure handling: an invalid `transportSlots` value that hides play or pause. U5 refuses it in the parser with a test.
6. Acceptance criterion not objective: "no visible stutter" (PF-3). U4 sets the CI threshold at the AC-2 100 ms frame budget and U7 records the reference number.
7. Phase too large: the draft's U1 held all three presets and the lock. The two extra presets and the lock moved to U2. The default preset stays in U1, so a version 1 file migrates once (Codex round, item 4 below).

**Codex review round (PR 21, October 13, 2026): F2 10, F4 0.** All ten findings held and are fixed in version 1.1:

1. The governing rework document and the parent-plan pointer were deferred to U0, so a fresh implementer could not find them. Both ship with this plan (`docs/planning/ui-shell-rework.md`, `docs/build-plan.md` section 2).
2. UD3 named no width ranges. The five ranges and their boundaries are now in UD3 and in the U1 unit test.
3. The UD7 fallback covered dock groups only. Library frame sashes now fall back to `setFrames` through `FrameSplit`.
4. A version 1 user upgrading at U1 would have saved a Library-only version 2 file that U2 never reset. The default preset now ships in U1.
5. Fixed `px` size tokens would clip under text scaling (P17 note N2). The tokens are `rem`, with a `useTokenPx` hook and the 125% and 140% e2e cases in U1.
6. A `listbox` cannot own `columnheader` cells. The Songs table is a `grid` (UD8).
7. A logical window position can map into two monitors on mixed DPI. UD14 saves physical coordinates.
8. `VirtualList` builds a fresh `frame` object per row per render, so `memo` on `Row` would not stop re-renders. U4 passes primitives and tests the real resize path.
9. The 200 px Playlists minimum made the 140 px rail unreachable. UD18 lowers it to 56 px in U3.
10. The TA-1 grep missed JSX forms. U1 adds a drag guard to `scripts/check-sources.mjs`.

**Codex review round 2 (PR 21, head `70ff68c`): F2 10, F4 0.** All ten held and are fixed in version 1.3:

1. Float and Dock had no keyboard path. UD17 adds Layout menu items for the active widget; `floating.spec.ts` tests them.
2. The row heart is pointer only (D23), so a keyboard user could not favorite a song from the table. UD8 adds the action to the row context menu.
3. A fixed 56 px mini window clips a `rem` band under text scaling. UD19 takes the computed band height from the webview.
4. PF-2 covered one observer. UD24 adds `observeSize` and moves every size observer to it, with a test per path.
5. TH-1 names spacing. UD1 adds `spacing.unit` and maps Tailwind's `--spacing` to it, with a guard against arbitrary px spacing.
6. SP-6 asks for a restore button. UD25 adds Collapse and Restore to the widget tab and the Layout menu.
7. The 800 x 500 checklist row was unreachable. UC10 now covers the checklist too.
8. U1-AC4 claimed row heights from tokens while the call sites moved in U4 and U6. U1 migrates every `ROW_HEIGHT` reader.
9. The traceability rows arrived only in U7. U0 creates them so each phase updates its Status column.
10. The close-time save test used `beforeunload`. U2 tests the Tauri close-request path.

**Codex review round 3 (PR 21, head `1834ef1`): F2 7, F4 0.** All seven held and are fixed in version 1.4:

1. The U5 Rust signature lacked the height. `set_mini(window, on, height)` and `windowSetMini(on, height)`.
2. The U1 band test expected LG at a 1280 px band. XL at 1280, LG at 1100.
3. `#` could move or hide, which breaks TB-11. `#` is a fixed leading column.
4. The header had no keyboard path. Two Tab stops, roving header cells, keys for sort, reorder, resize and the menu.
5. A drop on Favorites appended duplicates. Favorites adds only new ids through `toggleFavorite`.
6. The measurement arrangement hid Now playing, so `waitForPopulated` would time out. `applyMeasureLayout` shows every widget.
7. The close-and-reopen test included Library. Hideable widgets only; Library stays.

**Codex review round 4 (PR 21, head `9e0ac07`): F2 5, F4 0.** All five held and are fixed in version 1.5:

1. A virtualized grid needs `aria-rowcount` and `aria-rowindex`, not `posinset` and `setsize`. UD8 and the U4 axe test.
2. UD19 still said `window_set_mini(on)`. Now `(on, height)`.
3. No real-app run between phases. Section 1 rule 10.
4. The U1 F6 case listed only the band and Library. All visible regions of the default preset.
5. TA-2 had no manual rows. U7 chooses the folder on both platforms.

**Codex review round 5 (PR 22, head `3479e56`): F2 1, F4 0.** The U4 axe test checked one body row; it now asserts `aria-rowindex` on the header and on every rendered body row (version 1.6).

**F3 (recorded in `docs/build-plan.md` section 11 by U0):**

1. Dockview `keyboardNavigation` (F-12) could give keyboard moves of widgets after U3; it stays an owner decision.
2. `library_tree` returns the full structure (F-13); the table work does not touch Tree mode, so the finding stays open.

**F4 (rejected):**

1. "TanStack Table is required by the rework." The rework says "or confirm a better choice with the owner" (8 Phase 3). UD9 and UQ2 record the choice.
2. "Floating groups need `dragDropEnabled: false`." Dockview drags floating groups with pointer events (`dndStrategy="pointer"`, P2 N1). No HTML5 drag event is involved.
3. "The header strip must go because the rework diagram has no header." R5 fixes the menu button and D11 places it; the rework does not forbid a header (UC12).
4. "Keyboard splitters are impossible in Dockview (K5)." K5 says Dockview has none; an app layer on the sashes can add it (UD7).
5. "The 800 px minimum must show the XS class (SH-5)." The literal reading wastes space and contradicts the rework's Phase 1 accept (no height change from 800 px). UC8 and UQ1 record the reading.

**Definition of done check (task section 8):** every in-scope requirement maps to a phase (section 8); every acceptance criterion has a verification method; dependencies are explicit (section 2); technical changes cite files that exist at `3f747b4`; no engineering ambiguity blocks a phase; product items are listed (section 4.4) with defaults; another agent can execute U0 to U7 in order.

---

## 12. Change log

- **1.7 (October 13, 2026):** PR 22 review, CodeRabbit: the U1 tests assert the exact default-preset F6 order and U1-AC5 names it.
- **1.6 (October 13, 2026):** PR 22 review, Codex round 5: the U4 axe test asserts `aria-rowindex` on the header and on every rendered body row.
- **1.5 (October 13, 2026):** PR 21 review, Codex round 4: five findings fixed (section 11): grid row-count semantics (UD8), UD19 signature, real-app smoke check per phase (rule 10), F6 order, TA-2 manual rows.
- **1.4 (October 13, 2026):** PR 21 review, Codex round 3: seven findings fixed (section 11): mini command height, XL at 1280 px, fixed `#` column, header keyboard path, Favorites drop, measurement arrangement, hideable-only close test.
- **1.3 (October 13, 2026):** PR 21 review, Codex round 2: ten findings fixed (section 11): keyboard Float and Dock (UD17), Favorites in the row menu (UD8), mini height from the token (UD19), `observeSize` for every observer (UD24), spacing token (UD1), Collapse and Restore (UD25), 800 x 560 in the checklist (UC10), row heights migrated in U1, traceability rows in U0, close-request test in U2.
- **1.2 (October 13, 2026):** PR 21 review, CodeRabbit round 2: D57 to D59 and P23 carry superseded marks in `docs/build-plan.md`; `docs/planning/ui-shell-rework.md` carries a note that names this plan as authoritative on conflicts (UC7, UC8, UC10, UC13). U0 loses both tasks.
- **1.1 (October 13, 2026):** PR 21 review. CodeRabbit: UD19 restores the window limits on mini player exit. Codex: ten findings fixed (section 11, Codex round): rework source and pointer committed, UD3 ranges, UD7 frame fallback, default preset in U1, `rem` size tokens (UD1), grid roles (UD8), physical window position (UD14), stable row props (U4), Playlists minimum 56 px (UD18), drag guard in `check-sources` (U1, UC13).
- **1.0 (October 13, 2026):** first version. Owner decision of the same day: the rework wins over requirements v1.7 where they conflict; widget names and Library modes stay.
