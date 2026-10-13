# UI Shell Rework: Transport Bar, Panes, Docking and Columns

**Audience:** Claude Code
**Written:** 2026-10-13
**Scope:** UI shell only (layout, transport bar, docking, splitters, library table). No audio engine changes.

---

## 1. Bottom line

- Put the transport bar in a **fixed-height band outside the free-resize system**. Apple Music, iTunes and MusicBee all do this.
- MusicBee has the most layout freedom of the three. It still limits Player Controls to the **Top Panel or the Bottom Panel** [S1]. Copy that rule.
- Make the bar **adapt to its own width** (size classes). Do not make it stretch to fill height.
- Let the **dock area** hold everything else as free-form, draggable widgets with a minimum size.
- Give the long list (library table) **virtualized rows**, **resizable and reorderable columns** and **per-view saved state**.
- Do **not** float the transport bar over list content. Apple did this in macOS 26 and critics disliked it [S10].
- Do **not** hide primary navigation by default. Apple did this in iTunes 12 and reversed it in 12.4 [S6][S7][S8].

---

## 2. Read this first

### 2.1 Assumed stack (confirm in the repo before you code)

- Tauri v2 with a Rust backend
- React and Tailwind. Magic UI for components
- Theme tokens from a `DESIGN.md` file. Dark theme is the default
- Targets: Windows and Linux

### 2.2 Existing project documents

Read these before you change anything:

1. `REQUIREMENTS.md` (owner says v1.3)
2. The six layout mockups
3. `DESIGN.md`
4. `src-tauri/tauri.conf.json`, `package.json` and the current layout components

If this plan conflicts with `REQUIREMENTS.md`, **stop and ask the owner**. Do not overwrite the older document silently.

### 2.3 State of the code

The owner calls the app "existing". Some project notes describe it as planned. Run Phase 0 (section 8) to find out what exists. Write the result to `docs/ui-audit.md`.

---

## 3. Research findings

### 3.1 Reference comparison

| Topic | iTunes 12 (to 12.4) | Apple Music (macOS Catalina to Sequoia) | Apple Music (macOS 26 Tahoe) | MusicBee 3.x |
|---|---|---|---|---|
| Transport location | Top bar [S6] | Top toolbar [S9] | Bottom floating pill [S10] | Bottom panel by default. Top panel is the only alternate [S1] |
| Contents of bar | Play, previous, next, volume, AirPlay, search, Up Next [S6] | Playback controls, volume, track info, Up Next, Lyrics [S9] | Same functions in a pill [S10] | Buttons, seek bar, volume, track text. Options by right-click [S2] |
| Now Playing display | "LCD" in the center of the bar [S6][S7] | Center of the toolbar [S9] | Cover art in the bar opens a larger Now Playing view [S12] | Track details inside Player Controls [S2] |
| Sidebar | Hidden by default in 12.0. Restored as core navigation in 12.4 [S6][S7] | Left sidebar [S9] | Glass sidebar [S10] | Navigator on the left. Can auto-hide with a pin icon [S1][S2] |
| Up Next / queue | Button next to the LCD in 12.4 [S7] | Toolbar button [S9] | Playing Next [S5] | Playing Tracks list in right sidebar by default [S1] |
| Mini mode | MiniPlayer. Click the art to switch [S6] | MiniPlayer [S5] | MiniPlayer [S5] | Compact Player and Mini Player [S2] |
| List columns | Show, hide, reorder, resize. Auto Size commands [S19] | Same family | Same family | Per-view column and sort state [S3] |
| Layout freedom | Low. Sidebar toggle and column browser [S4] | Low | Low | Very high. 21 elements in 9 locations [S1] |
| Small window | Not verified | Not verified | Not verified | Panels can be hidden per view [S3] |

Other apps worth a look:

- **Apple Music for Windows:** the sidebar shrinks to an icon rail in a small window and expands in a large one [S11].
- **Tauon Music Box:** the seek bar runs along the top edge of the bottom panel. The right panel switches to a large-art layout when you widen it [S20].

### 3.2 Why the thin bar and the long list clash

Three root causes:

1. A docking system treats every panel as a resizable rectangle. A thin bar has a fixed natural height. A tall list wants all spare height. They cannot share one resize model.
2. The bar needs more width than height. Its content must change with width, not scale with the box.
3. A flex or grid child without `min-height: 0` grows to fit its content. A long list then pushes the bar off screen or scrolls the whole page.

The three reference apps avoid all three. The transport band has a fixed height and sits outside the resize system. The content area flexes. Lists scroll inside their own box.

### 3.3 What is verified and what is not

**Verified from sources (see section 13):**

- Layout of MusicBee panels and the Player Controls placement rule
- iTunes and Apple Music toolbar contents, MiniPlayer, sidebar toggle, column behavior
- iTunes 12 sidebar removal and 12.4 reversal
- Apple Music bottom bar in macOS 26 and the critique of it
- Dockview feature set and group constraints
- Tauri webview differences and the drag and drop setting
- W3C window splitter keyboard pattern

**Not verified. Treat as design choices to tune:**

- Pixel sizes in this document (bar height, breakpoints, hit areas)
- Internal implementation of the Apple apps
- Exact dockview API names in the installed version
- Which CSS features each Linux WebKitGTK build supports

---

## 4. What works (copy these)

1. **Fixed transport band, full width.** All three apps.
2. **Center "now playing" display** between transport buttons and volume (iTunes and Apple Music).
3. **Left sidebar plus main list** as the base layout. Users know it.
4. **Up Next as a toggled panel.** It does not need a permanent slot.
5. **Mini player** for small screens. Click the art to enter it (iTunes 12) [S6].
6. **Column controls:** drag the divider to resize. Control-click or right-click the header to show or hide columns. Drag headers to reorder. Auto Size Column and Auto Size All [S19].
7. **Sidebar auto-hide with a pin icon** (MusicBee) [S2].
8. **Per-view layout and column state** (MusicBee) [S3].
9. **Icon-only sidebar at small widths** (Apple Music for Windows) [S11].
10. **Player options by context menu**, not by free dragging (MusicBee right-click Panel Layout) [S2].

## 5. What to avoid

1. **Hidden primary navigation.** iTunes 12 hid the sidebar. Users complained. Apple restored it [S6][S7][S8].
2. **Scattered view controls.** iTunes 12 split view options across three controls. Reviewers called it confusing [S8].
3. **Translucent transport bar over list rows.** The macOS 26 Music bar overlays busy content and is hard to read [S10].
4. **Transport bar as a normal resizable dock panel.** It will stretch or squash.
5. **Copying all of MusicBee's options.** 21 elements in 9 locations is too much for this app [S1]. The owner wants simpler.
6. **Percent-based sidebar widths.** They drift when the window resizes. Use pixels.
7. **A real `<table>` with tens of thousands of rows.** Use virtualization.
8. **No way back.** Never let a user close a widget with no menu item to reopen it.
9. **Layout saved only in `localStorage`.** Use a file in the app config directory.
10. **Two separate codebases for mini player and main player.** Share one player state.

---

## 6. Target design

### 6.1 Zones

The window has three zones. Only the dock area uses the docking library.

```
+------------------------------------------------------------------------------+
| TRANSPORT BAND   fixed height, full width, NOT a dock panel                  |
+-------------+------------------------------------------+---------------------+
| Navigator   | Library table                            | Up Next | Info      |
| (widget)    |  +------------------------------------+  | (tabs in one group) |
|             |  | # | Title (flex) | Artist | Time   |  |                     |
|             |  | virtualized rows, scrolls inside   |  |                     |
|             |  +------------------------------------+  |                     |
+-------------+------------------------------------------+---------------------+
| STATUS BAND      fixed height                                                |
+------------------------------------------------------------------------------+
        ^---------- DOCK AREA: every widget here can be dragged, split, tabbed or floated
```

The default preset copies the Apple Music classic layout. The user can rearrange it.

### 6.2 Transport bar size classes

The bar measures its own width with `ResizeObserver`. It shows more controls as width grows. The thresholds below are starting values. Tune them.

```
XL  >= 1200 px
[|<][>][>|]  [art] Title - Artist   ---o-------- 1:23 / 3:45   [shuf][rep]  [vol ---o-]  [queue]  [search....]

LG  900 to 1199
[|<][>][>|]  [art] Title - Artist   ---o-------- 1:23 / 3:45   [shuf][rep]  [vol ---o-]  [queue]

MD  640 to 899
[|<][>][>|]  [art] Title - Artist   ---o--------   [vol ---o-]   [...]

SM  420 to 639
[|<][>][>|]  Title - Artist                                      [...]
(thin progress line along the bottom edge of the bar)

XS  < 420
[>]  Title - Artist                                              [...]
```

Rules:

- Hidden controls move to the `[...]` overflow menu. They never disappear with no way to reach them.
- Drop order when width shrinks: search, shuffle and repeat, queue button, volume slider (becomes an icon with a popover), seek bar (becomes a thin progress line), previous and next. Play and pause stays last.
- Height comes from a token. Starting value: 56 px regular and 40 px compact.

### 6.3 Dock area rules

- Use **dockview** (`dockview-react`, MIT). It supports tabs, groups, drag and drop, floating groups and JSON save and restore [S14]. Check the current version on npm before you install.
- Each widget sets a minimum width and height. Dockview groups accept constraints and a `locked` option [S14]. Verify exact names in the installed version.
- Use `hideHeader` on single-panel groups that do not need a tab strip.
- Disable **popout windows** in v1. They are not tested in Tauri webviews.
- Add a **Now Playing card** widget. It has art, title, seek bar and buttons in a stacked layout. It is the free-dock answer to "I want controls in a tall panel". It uses the same player state as the transport bar.

If you later want the transport bar inside the dock, set all of these on its group: min height equals max height, `hideHeader`, `locked: 'no-drop-target'` and root-edge placement only. Do not do this in v1.

### 6.4 Library table rules

- Row virtualization with a fixed row height. TanStack Virtual works with TanStack Table [S17].
- Column sizing, order and visibility. TanStack Table v8 has all three [S17]. A v9 release appeared in 2026 coverage. Check which one is stable before you pick.
- `Title` is the flexible column. It takes spare width. Numeric columns have fixed widths and align right.
- If the sum of column minimum widths is more than the container, show a horizontal scrollbar. The header scrolls with the body.
- Save column state per view (Songs, Albums, each playlist).

### 6.5 Shell CSS (starting point)

```css
html, body, #root { height: 100%; margin: 0; overflow: hidden; }

.app-shell {
  display: grid;
  height: 100%;
  grid-template-rows: var(--transport-h, 56px) minmax(0, 1fr) var(--status-h, 24px);
  grid-template-areas: "transport" "dock" "status";
}
.app-shell[data-transport="bottom"] {
  grid-template-rows: minmax(0, 1fr) var(--transport-h, 56px) var(--status-h, 24px);
  grid-template-areas: "dock" "transport" "status";
}
.transport { grid-area: transport; }
.dock-host { grid-area: dock; min-width: 0; min-height: 0; position: relative; }
.status    { grid-area: status; }
```

`minmax(0, 1fr)` and `min-height: 0` stop a long list from pushing the bar off screen.

### 6.6 Size class hook (starting point)

```ts
import { useLayoutEffect, useState, type RefObject } from "react";

export type SizeClass = "xs" | "sm" | "md" | "lg" | "xl";
const STEPS: [number, SizeClass][] = [[1200, "xl"], [900, "lg"], [640, "md"], [420, "sm"]];

export function useSizeClass(ref: RefObject<HTMLElement | null>): SizeClass {
  const [size, setSize] = useState<SizeClass>("md");
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const ro = new ResizeObserver(([entry]) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const w = entry.contentRect.width;
        setSize(STEPS.find(([min]) => w >= min)?.[1] ?? "xs");
      });
    });
    ro.observe(el);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [ref]);
  return size;
}
```

Use `ResizeObserver` and not CSS container queries as the first choice. Webview versions differ by OS and Linux distro [S15]. `ResizeObserver` is safer. Add container queries only after a feature check.

---

## 7. Requirements

Priority: **MUST** = required for v1. **SHOULD** = plan for it, ship if time allows. **MAY** = optional.

### 7.1 Shell (SH)

| ID | Pri | Requirement |
|---|---|---|
| SH-1 | MUST | The window has three zones: transport band, dock area and status band. |
| SH-2 | MUST | The transport band and status band are not dock panels in v1. |
| SH-3 | MUST | The dock area fills all space between the bands. Use `minmax(0, 1fr)`. |
| SH-4 | MUST | No widget makes the page body scroll. Each widget scrolls inside its own container. |
| SH-5 | MUST | Set a minimum window size in `tauri.conf.json`. At minimum size the bar must show the XS class. |
| SH-6 | SHOULD | A setting puts the transport band at the top or the bottom. Default: top (owner decision). No left or right placement. |
| SH-7 | MAY | If the app uses a custom title bar, make empty transport space a window drag region. Check the Tauri v2 docs for the attribute. |

### 7.2 Transport bar (TR)

| ID | Pri | Requirement |
|---|---|---|
| TR-1 | MUST | Bar height comes from `--transport-h`. The user cannot resize it by dragging. |
| TR-2 | MUST | Bar content changes by size class. Measure the bar, not the window. |
| TR-3 | MUST | Play and pause is always visible. Hidden controls go to an overflow menu. |
| TR-4 | MUST | The seek bar supports click, drag and keyboard. It shows elapsed and total time when space allows. |
| TR-5 | MUST | The bar shows art, title and artist. Each text line uses one line with an ellipsis. |
| TR-6 | MUST | The bar never overlays list content. The list ends above the bar. |
| TR-7 | MUST | The bar background is opaque or nearly opaque. Text must stay readable on any theme. |
| TR-8 | MUST | Buttons have a hit area of at least 32 by 32 px, a focus ring and a tooltip with the shortcut. |
| TR-9 | SHOULD | Click the art to switch to the mini player. |
| TR-10 | SHOULD | A "Customize transport" mode lets the user reorder slots and hide optional controls by drag and drop. Play and pause cannot be hidden. |
| TR-11 | SHOULD | A dockable Now Playing card widget shares state with the bar. |

### 7.3 Docking (DK)

| ID | Pri | Requirement |
|---|---|---|
| DK-1 | MUST | Use one docking library for all widgets in the dock area. |
| DK-2 | MUST | Every widget declares a minimum width and a minimum height. |
| DK-3 | MUST | The user can drag a widget to any edge, merge it into a tab group or float it. |
| DK-4 | MUST | A drop preview shows during drag. |
| DK-5 | MUST | A "Lock layout" toggle disables dragging and group resizing. Column resizing and scrolling still work. |
| DK-6 | MUST | A View menu lists every widget with a toggle. A closed widget can always be reopened. |
| DK-7 | MUST | A "Reset layout" command restores the default preset. |
| DK-8 | MUST | The default preset is Navigator left, Library center, Up Next and Info right. |
| DK-9 | SHOULD | Add presets: "Apple Music classic", "MusicBee style" and "Compact". |
| DK-10 | MUST | Popout windows are off in v1. |

### 7.4 Splitters and sidebars (SP)

| ID | Pri | Requirement |
|---|---|---|
| SP-1 | MUST | A splitter has a visible 1 px line and a hit area of at least 6 px. The cursor changes on hover. |
| SP-2 | MUST | Double-click a splitter to reset it to the default size. |
| SP-3 | MUST | Splitters work with the keyboard. Follow the W3C window splitter pattern: role `separator`, `aria-valuenow`, arrow keys, Home, End and Enter to collapse or restore [S18]. Check whether the docking library already does this. |
| SP-4 | MUST | Sidebar widths use pixels. The center group absorbs window resize. Check the group priority option in the library. |
| SP-5 | SHOULD | A sidebar collapses to an icon rail below a width threshold [S11]. |
| SP-6 | SHOULD | A drag cannot shrink a group to zero. Collapse needs an explicit action and a restore button. |
| SP-7 | MAY | Sidebar auto-hide with a pin icon [S2]. |

### 7.5 Library table (TB)

| ID | Pri | Requirement |
|---|---|---|
| TB-1 | MUST | Rows are virtualized with a fixed row height. |
| TB-2 | MUST | Drag a column divider to resize. Each column has a minimum width. |
| TB-3 | MUST | Double-click a divider to auto-size the column. The header menu has "Auto size column" and "Auto size all columns" [S19]. |
| TB-4 | MUST | Drag a header to reorder columns. |
| TB-5 | MUST | Right-click a header to show or hide columns [S19]. |
| TB-6 | MUST | `Title` is the flexible column. Numeric columns have fixed widths and align right. |
| TB-7 | MUST | The header is sticky. Horizontal scroll moves header and body together. |
| TB-8 | MUST | Click a header to sort. Show a direction arrow. |
| TB-9 | MUST | Save widths, order, visibility and sort per view [S3]. |
| TB-10 | MUST | Keyboard: arrow keys move selection. Enter plays. Shift and Ctrl extend selection. |
| TB-11 | MUST | The playing row shows an indicator in the first column. |
| TB-12 | SHOULD | Drag rows to a playlist in the Navigator or to Up Next. |
| TB-13 | SHOULD | Shift-click a header for a secondary sort. |
| TB-14 | SHOULD | A density option (compact or regular) changes row height by token. |

### 7.6 Persistence (PS)

| ID | Pri | Requirement |
|---|---|---|
| PS-1 | MUST | Save the dock layout as JSON with a schema version. Dockview provides `toJSON()` and `fromJSON()` [S14]. |
| PS-2 | MUST | Store the file in the app config directory through the Rust side or a Tauri store plugin. |
| PS-3 | MUST | Debounce saves by about 500 ms. Also save on window close. |
| PS-4 | MUST | On load, validate the file. If it fails, back up the bad file and load the default preset. |
| PS-5 | MUST | Save window size, window position, transport position and sidebar collapse state. |
| PS-6 | MUST | Save column state apart from dock layout. |

### 7.7 Theme, performance and access (TH, PF, AX)

| ID | Pri | Requirement |
|---|---|---|
| TH-1 | MUST | All colors, spacing, row height and bar height come from `DESIGN.md` tokens as CSS variables. No hard-coded colors. |
| TH-2 | MUST | Dark theme is the default. |
| PF-1 | MUST | Resizing a panel does not re-render list rows. Memoize rows. |
| PF-2 | MUST | Size observers update on `requestAnimationFrame`. |
| PF-3 | MUST | Scrolling a 50,000-row library has no visible stutter on the reference machine. Measure it. |
| AX-1 | MUST | Every control is reachable by keyboard and has an accessible name. |
| AX-2 | SHOULD | Respect `prefers-reduced-motion`. No animated panel transitions when it is set. |

### 7.8 Tauri (TA)

| ID | Pri | Requirement |
|---|---|---|
| TA-1 | MUST | If the docking or column code uses HTML5 drag events, set `dragDropEnabled: false` on the main window in `tauri.conf.json`. On Windows, Tauri otherwise intercepts drag events before the page sees them [S16]. |
| TA-2 | MUST | Accept the cost of TA-1. Tauri file-drop events stop. Folder selection must use a dialog. Test on Windows and Linux. |
| TA-3 | MUST | Test on both webviews: WebView2 on Windows and WebKitGTK on Linux [S15]. |
| TA-4 | MUST | Do not store layout only in `localStorage`. |

---

## 8. Implementation plan

Do the phases in order. Run the app after each phase. Do not start the next phase until the acceptance checks pass.

### Phase 0: Audit (no code changes)

1. Read the files listed in section 2.2.
2. Capture "before" screenshots of the current app at 3 window sizes: 800x500, 1280x720 and 1920x1080.
3. Write `docs/ui-audit.md`: what exists, what breaks, which requirements from section 7 already pass.
4. List conflicts with `REQUIREMENTS.md`. Ask the owner.

**Accept:** audit file exists. Screenshots saved in `docs/ui-reference/before/`.

### Phase 1: Shell and transport bar

1. Build the grid shell (section 6.5).
2. Build the transport bar with the size class hook (section 6.6).
3. Set the minimum window size.
4. Put a placeholder in the dock area.

**Accept:** SH-1 to SH-5 and TR-1 to TR-8 pass. Drag the window from 800 px to 2560 px wide. The bar never wraps, never changes height and never loses Play.

### Phase 2: Docking

1. Add dockview. Wire the default preset (DK-8).
2. Set minimum sizes on every widget.
3. Add Lock layout, View menu and Reset layout.
4. Add save and restore (PS-1 to PS-5).
5. Apply `dragDropEnabled` (TA-1) and test drag on Windows and Linux.

**Accept:** DK-1 to DK-8, DK-10 and PS-1 to PS-5 pass. Corrupt the layout file by hand. The app starts with the default preset.

### Phase 3: Library table

1. Build the virtualized table with TanStack Table and TanStack Virtual (or confirm a better choice with the owner).
2. Add column resize, auto-size, reorder and visibility.
3. Add sort, selection and the playing indicator.
4. Add per-view state (TB-9, PS-6).

**Accept:** TB-1 to TB-11 pass. Test with 50,000 generated rows.

### Phase 4: Splitters and sidebars

1. Add splitter polish: hit area, double-click reset, keyboard.
2. Add icon-rail collapse for the Navigator.
3. Check group priority so the center absorbs resize.

**Accept:** SP-1 to SP-4 pass.

### Phase 5: Extras

1. Customize transport mode (TR-10).
2. Now Playing card widget (TR-11).
3. Layout presets (DK-9).
4. Mini player (TR-9).
5. Transport at bottom option (SH-6).

**Accept:** each SHOULD item passes or the owner defers it in writing.

---

## 9. Test checklist

- [ ] Window sizes: 800x500, 1280x720, 1920x1080, 2560x1440
- [ ] Display scaling: 100%, 150%, 200%
- [ ] Windows 11 (WebView2) and one Linux distro (WebKitGTK)
- [ ] 50,000-row library: scroll, sort, resize a column, resize a panel
- [ ] Drag every widget to every edge. Merge as a tab. Float it. Dock it again
- [ ] Close every widget. Reopen each from the View menu
- [ ] Lock layout on: drag is off, column resize still works
- [ ] Corrupt or delete the layout file. App starts with defaults
- [ ] Change the transport position to bottom and back
- [ ] Tab through all controls with the keyboard. Move a splitter with arrow keys
- [ ] Resize the window while a track plays. Audio does not glitch

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| `dragDropEnabled: false` stops OS file drop events [S16] | Use the folder dialog. Document it. |
| Webview differences between Windows and Linux [S15] | Use `ResizeObserver`. Test early on both. |
| Dockview API names differ in the installed version | Read the installed typings. Do not trust this document for names. |
| Dockview popout windows in Tauri | Off in v1. |
| TanStack Table v8 vs v9 | Check the stable release. Ask the owner if unsure. |
| Over-building customization | Keep v1 to the MUST list. |

---

## 11. Decisions

| # | Decision | Status and answer |
|---|---|---|
| 1 | Default transport position: top or bottom | **DECIDED by owner: top.** It matches iTunes and Apple Music before macOS 26. Keep the bottom option as a setting (SH-6). |
| 2 | Allow the transport band on left or right edges | **DECIDED by owner: top or bottom only** (MusicBee rule [S1]). Do not build left or right placement. |
| 3 | Lock layout default | **DECIDED by owner: unlocked on a fresh install.** Show a clear lock toggle and a "Reset layout" command (DK-5, DK-7). |
| 4 | Accept loss of OS file drop (TA-1) | **DECIDED by owner: accept the loss.** Set `dragDropEnabled: false`. Folder selection uses a dialog. Do not build a custom OS file drop path. |
| 5 | Popout windows | **DECIDED by owner: off in v1** (DK-10). Floating panels inside the main window stay allowed. |

---

## 12. Screenshots

This document has no embedded third-party screenshots. Copyright and network limits prevent it. Use these steps instead.

Save images to `docs/ui-reference/`. Claude Code can read PNG files.

| File name | What to capture |
|---|---|
| `itunes12-main.png` | iTunes 12 or Apple Music (pre-macOS 26): full window, Songs view |
| `itunes12-miniplayer.png` | MiniPlayer, small and large art |
| `applemusic-tahoe-main.png` | Apple Music on macOS 26: bar at the bottom over a long list |
| `applemusic-win-narrow.png` | Apple Music for Windows at a narrow window (icon rail) |
| `musicbee-default.png` | MusicBee default layout |
| `musicbee-arrange-panels.png` | MusicBee Panels Configuration window |
| `musicbee-playercontrols-menu.png` | Right-click menu on Player Controls |
| `before/*.png` | Current app at 800x500, 1280x720 and 1920x1080 |
| `after/*.png` | Same sizes after each phase |

Public pages with screenshots:

- MusicBee layout: https://musicbee.fandom.com/wiki/The_Anatomy_of_MusicBee
- Apple iTunes window guide: https://support.apple.com/en-au/guide/itunes/itns0c1999db/mac
- macOS 26 Music critique with side-by-side shots: https://www.macstories.net/stories/macos-26-tahoe-the-macstories-review/2/
- iTunes 12 interface review: https://tidbits.com/2014/10/20/examining-itunes-12s-new-interface/

---

## 13. Sources

Checked on 2026-10-13.

- **[S1]** MusicBee wiki, The Anatomy of MusicBee: https://musicbee.fandom.com/wiki/The_Anatomy_of_MusicBee
- **[S2]** MusicBee version history and release notes: https://videohelp.com/software/MusicBee/version-history and https://www.neowin.net/software/musicbee-305994-update-1/
- **[S3]** MusicBee wiki, Panel Layout Overrides: https://musicbee.fandom.com/wiki/Panel_Layout_Overrides
- **[S4]** Apple, Customize the iTunes window on Mac: https://support.apple.com/en-au/guide/itunes/itns0c1999db/mac
- **[S5]** Apple, Use Music MiniPlayer on Mac: https://support.apple.com/en-la/guide/music/mus71d7dcfce/1.3/mac/13.0
- **[S6]** TidBITS, Examining iTunes 12's New Interface: https://tidbits.com/2014/10/20/examining-itunes-12s-new-interface/
- **[S7]** Macworld, Apple simplifies navigation with iTunes 12.4: https://www.macworld.com/article/228009/apple-simplifies-navigation-with-itunes-12-4.html
- **[S8]** Intego, How to Fix iTunes 12's Biggest Annoyances: https://www.intego.com/mac-security-blog/how-to-fix-itunes-12-biggest-annoyances/
- **[S9]** MacSales, Using the Apple Music app: https://eshop.macsales.com/blog/wp-json/wp/v2/posts/51611
- **[S10]** MacStories, macOS 26 Tahoe review, page 2: https://www.macstories.net/stories/macos-26-tahoe-the-macstories-review/2/
- **[S11]** MacStories, Hands-On with Apple Music for Windows: https://www.macstories.net/stories/hands-on-with-apple-music-for-windows/
- **[S12]** hicks.design, Apple Music in Tahoe: https://hicks.design/journal/apple-music-in-tahoe
- **[S14]** Dockview: https://dockview.dev/ and https://dockview.dev/typedocs/interfaces/dockview-core.DockviewGroupPanelApi.html
- **[S15]** Tauri v2, Webview Versions: https://v2.tauri.app/reference/webview-versions/
- **[S16]** Tauri drag and drop setting: https://react-dropzone.js.org/guide/tauri/ and https://github.com/tauri-apps/tauri/issues/2768
- **[S17]** TanStack Table docs: https://tanstack.com/table/latest/docs/guide/features and https://tanstack.com/table/latest/docs/guide/virtualization
- **[S18]** W3C APG, Window Splitter Pattern: https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter
- **[S19]** Kirkville, iTunes: How to Show and Hide Columns in List Views: https://kirkville.com/category/tech/page/193
- **[S20]** Tauon Music Box, Interface Overview: https://tauonmusicbox.rocks/manual/interface/

---

## 14. Definition of done

- Every MUST in section 7 passes.
- Every phase has its acceptance check recorded in `docs/ui-audit.md` or a changelog.
- Before and after screenshots exist for the three window sizes.
- All five decisions in section 11 are closed. Do not reopen them without the owner.
