# Clawdio Requirements Traceability

**Version:** 1.12, October 12, 2026.
**Plan:** `docs/build-plan.md` v1.13. Task IDs (`P5.3`), criterion IDs (`P5-AC4`), decisions (`D`), conflicts (`C`), owner questions (`Q`), blockers (`B`) and risks (`K`) refer to that file.

## How to read this file

- **One row per requirement.** Long source items are split into rows, one rule per row.
- **Source** gives the document section. Section 1 of this file covers the requirements, section 2 `design.md`, section 3 the branding prompt, section 4 the asset manifest, section 5 `theme/tokens.json` and section 6 `AGENTS.md`.
- **Verify** codes: UT unit test, IT integration test, E2E Playwright with mocked IPC, CI pipeline job, MAN-L manual on Linux, MAN-W manual on Windows, MEAS measurement, REV review of code or docs.
- **Status** values:
  - Planned: mapped to tasks and criteria. Not started.
  - Done (Pn): every task and criterion of the row passed. Pn is the last phase. A decision or conflict ID stays in the brackets.
  - Planned (Dn): the plan fixes an open detail with decision Dn.
  - Planned (Qn): the task needs owner input Qn to finish.
  - Resolved (Cn): a conflict between sources, resolved as section 5.1 of the plan states.
  - Gate (Bn): the outcome decides later work.
  - Deferred: the source defers it. No task.
  - Non-goal: the source excludes it. No task. AGENTS.md scope rules and reviews keep it out.
  - Reference: not a requirement. No task.
- Phases update the Status column as work completes (AGENTS.md workflow rule).

## Coverage summary

| Source | Rows | Done | Planned | Planned with decision or owner input | Resolved conflict | Gate | Deferred, non-goal or reference | Open gap |
|---|---|---|---|---|---|---|---|---|
| Requirements | 364 | 210 | 82 | 8 | 5 | 5 | 54 | 0 |
| design.md | 76 | 58 | 6 | 1 | 10 | 0 | 1 | 0 |
| Branding prompt | 39 | 27 | 5 | 1 | 5 | 0 | 1 | 0 |
| Asset manifest | 18 | 14 | 3 | 0 | 1 | 0 | 0 | 0 |
| tokens.json | 20 | 18 | 2 | 0 | 0 | 0 | 0 | 0 |
| AGENTS.md | 3 | 2 | 0 | 0 | 1 | 0 | 0 | 0 |

**Unresolved gaps:** none. Every requirement maps to a task and a criterion, or to a recorded deferral, non-goal or reference. Items that need outside input are gates or owner questions, listed in section 8.

---

## 1. `docs/MusicPlayer_REQUIREMENTS.md` (v1.6)

### 1.1 Section 1: desired outcome

| ID | Requirement | Source | Tasks | Criteria | Verify | Status |
|---|---|---|---|---|---|---|
| S1-1 | Small open source player for Windows and Linux | §1 | P0.4, P18.1 | P0-AC1, P18-AC5 | CI, MAN-L, MAN-W | Planned |
| S1-2 | One music folder; shows artist, album and song; plays mp3, ogg and wav | §1 | P4.5, P5.2, P5.6, P6.3, P7.2 | P4-AC3, P5-AC1, P5-AC2 | IT, MAN-L | Done (P7) |
| S1-3 | Widget UI: dock, resize, hide, show; three built-in layouts | §1 | P2.1, P2.4, P2.6 | P2-AC2, P2-AC4 | E2E | Done (P2) |
| S1-4 | Adds artwork, lyrics and missing metadata | §1 | P14.5, P15.1, P16.2 | P14-AC4, P15-AC1, P16-AC3 | IT | Done (P16) |
| S1-5 | Playlists as portable files | §1 | P11.1 | P11-AC2, P11-AC9 | IT, MAN-L, MAN-W | Planned |
| S1-6 | Theme from `theme/tokens.json`, compiled at build time | §1 | P0.6 | P0-AC3 | UT, MAN-L | Done (P0) |
| S1-7 | Music folder holds music data; per-machine data in OS folders or next to the executable in portable mode | §1 | P4.1 | P4-AC4, P9-AC7 | IT, MAN-L, MAN-W | Planned |
| S1-8 | Imports many playlists at once; finds songs also in another format | §1 | P19.1, P19.3 | P19-AC1, P19-AC3 | UT, IT | Done (P19) |
| S1-9 | Lowers or pauses music while another app uses the microphone (Windows) | §1 | P20.2, P20.3 | P20-AC1, P20-AC4 | UT, MAN-W | Done (P20); MAN-W open |

### 1.2 Section 2: library (R1 to R4)

| ID | Requirement | Source | Tasks | Criteria | Verify | Status |
|---|---|---|---|---|---|---|
| R1-1 | One user-chosen folder; import mp3, ogg and wav; ignore other types | §2 R1 | P4.5, P5.2 | P5-AC2 | IT | Done (P5, D16) |
| R1-2 | Ogg means Vorbis; skip and report Opus and other codecs | §2 R1 | P5.2 | P5-AC2 | IT | Done (P5) |
| R1-3 | WAV: PCM integer and float and ADPCM as the pinned decoder supports; others are "unsupported codec" | §2 R1 | P5.2 | P5-AC2 | IT | Done (P5, D3) |
| R1.1-1 | First run: "Choose music folder" in the main area; other widgets show hints; transport disabled | §2 R1.1 | P4.6, P2.9 | P4-AC2, P2-AC12 | E2E | Done (P4) |
| R2-1 | Startup sync adds new files and removes missing files; the folder wins | §2 R2 | P5.3 | P5-AC4, P5-AC15 | IT | Done (P5) |
| R2-2 | Incremental scan by path, size and modified time | §2 R2 | P5.3 | P5-AC7 | IT | Done (P5) |
| R2-3 | The scan does not block the UI | §2 R2 | P4.7, P6.8 | P6-AC6 | MEAS, MAN-L, MAN-W | Planned |
| R2-4 | Manual Rescan command | §2 R2 | P5.4, P2.6 | P5-AC5, P5-AC6 | IT, E2E | Done (P5) |
| R2-5 | Target 50,000 tracks | §2 R2 | P5.13, P3.1, P4.12 | P3-AC1, P6-AC6, P18-AC6 | MEAS | Planned |
| R2-6 | Status line counts at scan end; Settings shows last counts and "Open log folder"; log holds per-file reasons | §2 R2 | P5.4, P4.3, P5.2 | P5-AC6, P5-AC2 | IT, E2E | Done (P5) |
| R2-7 | Skip files and folders whose names start with "."; do not follow links or junctions to folders; Rescan does nothing while a scan runs | §2 R2 | P5.1, P5.4 | P5-AC3, P5-AC5 | IT | Done (P5) |
| R2-8 | Remove missing files only after a complete traversal; cancel or failure removes nothing | §2 R2 | P5.3 | P5-AC4 | IT | Done (P5) |
| R2-9 | Readable, empty root removes all tracks | §2 R2 | P5.3 | P5-AC4 | IT | Done (P5) |
| R3-1 | Grouping by folder names; tags never change grouping | §2 R3 | P5.6 | P5-AC1 | IT | Done (P5) |
| R3-2 | First folder is the artist, second the album, deeper folders fold into the album | §2 R3 | P5.6 | P5-AC1 | UT, IT | Done (P5) |
| R3-3 | File directly under an artist folder goes to "Unknown Album" | §2 R3 | P5.6 | P5-AC1 | UT | Done (P5) |
| R3-4 | File at the root goes to "Unknown Album" under "Unknown Artist" | §2 R3 | P5.6 | P5-AC1 | UT | Done (P5) |
| R3-5 | Display names unchanged; sort ignores case and accents, natural numbers, byte-order ties; Unknown groups last | §2 R3 | P5.5, P5.6 | P5-AC1 | UT | Done (P5, D4) |
| R4-1 | Title: tag, then sidecar, then file name without the prefix | §2 R4 | P5.7, P16.6 | P5-AC10, P16-AC3 | UT, IT | Done (P16) |
| R4-2 | Track-number prefix definition and examples | §2 R4 | P5.7 | P5-AC10 | UT | Done (P5) |
| R4-3 | Track number: tag, then sidecar, then prefix | §2 R4 | P5.7, P16.6 | P5-AC1, P16-AC3 | UT | Done (P16) |
| R4-4 | Song order: disc order, track number, file name; disc order rule; case ignored | §2 R4 | P5.7 | P5-AC11 | UT, IT | Done (P5) |

### 1.3 Section 2: widgets and layout (R5, R28 to R31)

| ID | Requirement | Source | Tasks | Criteria | Verify | Status |
|---|---|---|---|---|---|---|
| R5-1 | Widgets can be docked, resized, moved and hidden | §2 R5 | P2.1, P2.2 | P2-AC2, P2-AC4 | E2E | Done (P2) |
| R5-2 | Library widget is mandatory | §2 R5 | P2.2, P2.3 | P2-AC3 | E2E | Done (P2) |
| R5-3 | Transport controls: movable, hideable; play/pause, stop, previous, next, shuffle, repeat; seek and volume; elapsed and total time | §2 R5 | P2.2, P7.7 | P2-AC4, P7-AC9 | E2E, MAN-L | Done (P7) |
| R5-4 | Now playing: art, title, artist, album, heart | §2 R5 | P7.8, P10.3, P11.7 | P10-AC4, P11-AC5 | E2E | Done (P11) |
| R5-5 | Playlists widget: movable, hideable | §2 R5 | P2.2, P11.5 | P2-AC4 | E2E | Done (P11) |
| R5-6 | Play queue widget: movable, hideable | §2 R5 | P2.2, P7.9 | P2-AC4, P7-AC7 | E2E | Done (P7) |
| R5-7 | Lyrics widget: movable, hideable | §2 R5 | P2.2, P13.4 | P2-AC4, P13-AC5 | E2E | Done (P13) |
| R5-8 | Search is a field in the Library header, not a widget | §2 R5 | P2.8, P6.2 | P2-AC5, P6-AC3 | E2E | Done (P6) |
| R5-9 | Status line fixed at the bottom: "Ready", progress with cancel, no pause | §2 R5 | P2.7, P5.4, P14.6 | P5-AC6, P14-AC12 | E2E, MAN-L | Done (P14, D18) |
| R5-10 | Menu button fixed top-right: Widgets, Layouts, Settings, Rescan | §2 R5 | P2.5, P2.6 | P2-AC4, P2-AC6 | E2E | Done (P2, C14) |
| R5-11 | Album art in Now playing and album rows; cover file order, then embedded; bad cover logged; thumbnails in cache | §2 R5 | P10.1, P10.2, P10.3 | P10-AC1, P10-AC2, P10-AC3 | UT, IT | Done (P10, D27) |
| R5-12 | Song row shows the tag artist when it differs from the folder artist | §2 R5 | P6.4 | P6-AC7 | E2E | Done (P6) |
| R28-1 | One Library widget with a mode switch and the search field in its header | §2 R28 | P2.8 | P2-AC5 | E2E | Done (P2) |
| R28-2 | Narrow widget: the switch becomes a dropdown with the current mode | §2 R28 | P2.8 | P2-AC5 | E2E | Done (P2) |
| R28-3 | Tree mode | §2 R28 | P3.3, P6.3 | P6-AC1 | E2E | Done (P6) |
| R28-4 | Columns mode | §2 R28 | P3.3, P6.3 | P6-AC1 | E2E | Done (P6) |
| R28-5 | Top/bottom mode | §2 R28 | P3.3, P6.3 | P6-AC1 | E2E | Done (P6) |
| R28-6 | "All" rows; Artist filters Album; Album filters Songs; no selection shows all | §2 R28 | P6.3 | P6-AC1 | E2E | Done (P6) |
| R28-7 | Mode switch keeps selection and search text | §2 R28 | P2.8, P6.3 | P2-AC5, P6-AC2 | E2E | Done (P6) |
| R28-8 | Library can move and resize; cannot hide or close | §2 R28 | P2.3 | P2-AC3 | E2E | Done (P2) |
| R29-1 | Drag-and-drop docking by header; splitters resize | §2 R29 | P2.1 | P2-AC2 | E2E, MAN-L | Done (P2, D8) |
| R29-2 | No floating panels or pop-outs; tabbed groups allowed and round-trip | §2 R29 | P2.1, P9.3 | P2-AC2, P9-AC3 | E2E | Done (P9) |
| R29-3 | Built-in layouts Columns (default), Tree, Top/bottom; they cannot change | §2 R29 | P2.4 | P2-AC1, P2-AC4 | E2E, REV | Done (P2) |
| R29-4 | Default arrangement: Library main; Now playing and Transport in a bottom bar; others hidden | §2 R29 | P2.4 | P2-AC1 | E2E | Done (P2) |
| R29-5 | User-saved named layouts | §2 R29 | none | none | REV | Deferred |
| R29-6 | Arrangement: one JSON file per machine, no window size, versioned; unknown version ignored and logged; import and export deferred | §2 R29 | P9.2, P9.3, P9.4 | P9-AC4, P9-AC8 | UT | Done (P9) |
| R29-7 | Auto-save and restore; applying a layout replaces the arrangement | §2 R29 | P9.3, P2.4 | P9-AC2, P2-AC4, P9-AC11 | E2E, MAN-L | Done (P9) |
| R29-8 | Reset layout from the menu and a documented shortcut; no layout hides the menu or status line | §2 R29 | P2.4, P2.6, P2.12, P18.6 | P2-AC4, P2-AC6, P9-AC5 | E2E | Done (P18, D17) |
| R29-9 | Non-drag path: menu shows and hides widgets, switches mode, applies layouts | §2 R29 | P2.6 | P2-AC4 | E2E | Done (P2) |
| R29-10 | Corrupt file, unknown widget, layout without Library | §2 R29 | P9.4 | P9-AC4 | UT | Done (P9) |
| R30-1 | React, Tailwind CSS v4 and shadcn/ui | §2 R30 | P0.3, P0.10 | P0-AC1 | CI, REV | Done (P0) |
| R30-2 | Magic UI only by named component with a function; docs list them; no Motion if the list is empty | §2 R30 | P2.16 | P18-AC13 | REV | Resolved (C8) |
| R30-3 | Animations honor reduce motion and never block input | §2 R30 | P0.7, P2.10 | P2-AC8, P17-AC3, P17-AC9 | E2E, MAN-L, MAN-W | Planned |
| R30-4 | Tokens map to Tailwind variables at build time; theme styles headers, splitters and drop zones; theme sets no layout | §2 R30 | P0.6, P2.10 | P0-AC3, P2-AC7, P2-AC13 | UT, E2E | Done (P2) |
| R30-5 | Milestone 0 uses React, Tailwind, shadcn/ui and the docking library | §2 R30 | P3.3, P3.4, P3.2 | P3-AC1, P3-AC5 | MEAS | Done (P3) |
| R30-6 | Copied components keep their MIT notice | §2 R30 | P18.4 | P18-AC7 | REV | Done (P18) |
| R31-1 | Branding package in the repo; brand changes need no feature code change | §2 R31 | P0.14, P18.8 | P0-AC6, P18-AC9 | UT, MAN-L | Done (P18) |
| R31-2 | Build generates platform icons from `clawdio-icon-full.svg`; placeholder until it exists | §2 R31 | P0.11, P1.6 | P1-AC2, P1-AC5, P1-AC6 | CI, MAN-L | Done (P1, D9) |
| R31-3 | Built-in dark theme is `theme/tokens.json` compiled at build time | §2 R31 | P0.6, P0.7 | P0-AC2, P0-AC3 | UT, MAN-L | Done (P0) |
| R31-4 | Name, window title, bundle identifier and User-Agent from one build value | §2 R31 | P0.4, P0.8 | P0-AC6, P14-AC6, P18-AC11 | UT, REV | Resolved (C10) |
| R31-5 | Lucide icons by default; a brand icon replaces an icon by name | §2 R31 | P2.13 | P2-AC11 | UT, MAN-L | Done (P2) |
| R31-6 | User-selected theme file | §2 R31 | none | none | REV | Deferred |

### 1.4 Section 2: playback and controls (R6, R24, R25, R27)

| ID | Requirement | Source | Tasks | Criteria | Verify | Status |
|---|---|---|---|---|---|---|
| R6-1 | Controls: play/pause, stop, previous, next, seek, volume, shuffle, repeat, queue add, remove, clear; nothing else | §2 R6 | P7.6, P7.7, P7.9 | P7-AC1, P7-AC9 | UT, E2E | Done (P7, C3) |
| R6-2 | Stop ends playback, resets the position, keeps the queue | §2 R6 | P7.1 | P7-AC2 | UT | Done (P7) |
| R6-3 | Repeat modes off, all, one; shuffle applies to the queue | §2 R6 | P7.1, P7.7 | P7-AC1, P7-AC8 | UT, E2E | Done (P7) |
| R6-4 | Repeat off, all and one behavior | §2 R6 | P7.1 | P7-AC1 | UT | Done (P7) |
| R6-5 | Shuffle behavior: each entry once, display order kept; shuffle off continues in order | §2 R6 | P7.1 | P7-AC1 | UT | Done (P7) |
| R6-6 | Previous: over 3 s restarts; else previous in play order; shuffle uses the run history | §2 R6 | P7.1 | P7-AC1 | UT | Done (P7) |
| R6-7 | Decode error: log, "Cannot play <file name>", continue; stop after three in a row | §2 R6 | P7.3, P7.12, P5.11 | P7-AC3 | IT | Done (P7, D32) |
| R6-8 | Single click selects; double-click or Enter plays; album row plays from the first song | §2 R6 | P6.5 | P6-AC4 | E2E | Done (P6) |
| R6-9 | Queue rule per mode and for playlists; Play and double-click replace; Add to queue appends | §2 R6 | P6.5, P7.10, P11.5 | P6-AC4, P7-AC7, P11-AC8 | E2E | Done (P11) |
| R6-10 | Queue edits: remove playing, remove earlier, clear | §2 R6 | P7.1, P7.9 | P7-AC1 | UT | Done (P7) |
| R6-11 | Search: incremental, ignores case and accents, matches artist, album and title; Tree rule | §2 R6 | P6.1, P6.2 | P6-AC3 | UT, E2E | Done (P6) |
| R6-12 | Context menu: Play, Add to queue, Add to playlist; "Added to queue" in the status line | §2 R6 | P7.10, P11.6, P6.6 | P7-AC7, P6-AC10 | E2E | Done (P11, D20) |
| R24-1 | Media keys play/pause, next, previous work with the window in the background | §2 R24 | P8.1, P8.2 | P8-AC1, P8-AC2 | MAN-W, MAN-L | Planned (D39) |
| R24-2 | Title, artist, album, artwork and position go to the OS panel | §2 R24 | P8.3, P10.5 | P8-AC1, P8-AC2, P10-AC6 | MAN-W, MAN-L | Planned |
| R24-3 | Accept play, pause, toggle, next, previous, stop; log and continue if registration fails | §2 R24 | P8.2, P8.4 | P8-AC2, P8-AC3, P8-AC1 | MAN-L, MAN-W | Planned |
| R25-1 | Space toggles play/pause, not while typing | §2 R25 | P7.11 | P7-AC5 | E2E | Done (P7, D17) |
| R25-2 | Up and Down move; Right expands; Left collapses | §2 R25 | P6.6, P11.5 | P6-AC5, P11-AC8 | E2E | Done (P11) |
| R25-3 | Enter plays the selected song or album | §2 R25 | P6.5, P11.5 | P6-AC4, P11-AC8 | E2E | Done (P11, D24) |
| R25-4 | Ctrl+F focuses search; Esc clears it and returns to the Library | §2 R25 | P6.6, P0.13 | P6-AC5, P0-AC8 | E2E | Planned |
| R25-5 | F6 and Shift+F6 move focus between visible widgets | §2 R25 | P2.12 | P2-AC10 | E2E | Done (P2) |
| R25-6 | Delete removes the selected entry from the Play queue or a playlist | §2 R25 | P7.9, P11.5 | P11-AC8, P17-AC2, P7-AC12 | E2E, MAN-L | Done (P17) |
| R25-7 | Keyboard focus is always visible | §2 R25 | P0.7, P2.12 | P2-AC10, P6-AC5, P17-AC2, P2-AC14 | E2E, MAN-L | Done (P17) |
| R27-1 | Remember queue, current song, position and volume in the OS config folder | §2 R27 | P9.1 | P9-AC1 | IT | Done (P9, D25) |
| R27-2 | Restore at startup paused; drop missing entries silently | §2 R27 | P9.1 | P9-AC1, P9-AC10 | IT | Done (P9) |
| R27-3 | State uses paths relative to the music folder; folder path stored as set, except in portable mode | §2 R27 | P9.1, P4.1 | P9-AC7, P4-AC4 | UT, MAN-W | Planned |
| R34-1 | Setting "When the microphone is in use": Off, Lower volume, Pause; default Off | §2 R34.1 | P20.1, P20.4 | P20-AC1, P20-AC2, P20-AC3 | UT, E2E | Done (P20) |
| R34-2 | Trigger: any other app records from a microphone; the app never opens it; no app names | §2 R34.2 | P20.0, P20.2 | P20-AC4, P20-AC5, P20-AC7 | UT, MAN-W | Done (P20, D54); MAN-W open |
| R34-3 | Lower volume: percentage of the current volume; default 20%, range 5% to 90%, step 5% | §2 R34.3 | P20.1, P20.3 | P20-AC1, P20-AC2 | UT | Done (P20) |
| R34-4 | Pause: resume only when the duck caused the pause | §2 R34.4 | P20.3 | P20-AC1 | UT | Done (P20) |
| R34-5 | Timing: fade down, fixed wait of about 1 s, fade up; no wait setting | §2 R34.5 | P20.3 | P20-AC1 | UT | Done (P20, D52) |
| R34-6 | Volume control and saved volume show the user's own volume | §2 R34.6 | P20.3 | P20-AC1, P20-AC2 | UT | Done (P20) |
| R34-7 | Linux: setting unavailable (D53: not shown) | §2 R34.7 | P20.4 | P20-AC3 | E2E | Changed (D53): no control off Windows |

### 1.5 Section 2: online and sidecars (R7 to R11)

| ID | Requirement | Source | Tasks | Criteria | Verify | Status |
|---|---|---|---|---|---|---|
| R7-1 | One "Online lookups" switch in Settings, off by default | §2 R7 | P4.4, P4.10 | P4-AC1 | E2E | Done (P4) |
| R7-2 | Off means zero network calls by the app's own code | §2 R7 | P14.1, P14.8 | P14-AC1, P15-AC6 | IT | Done (P15, D29) |
| R7-3 | First-run notice explains sidecar files, names the services, offers "Turn on" and "Keep off" | §2 R7 | P4.6 | P4-AC1 | E2E | Done (P4) |
| R7-4 | Turning the switch off cancels queued lookups and aborts in-flight requests | §2 R7 | P14.6 | P14-AC2 | IT | Done (P14) |
| R8-1 | Automatic background fetch for albums with no embedded art and no cover file | §2 R8 | P14.5, P14.6, P5.3 | P14-AC4, P14-AC5, P5-AC16, P14-AC15 | IT | Done (P14, D44) |
| R8-2 | Sources: MusicBrainz and Cover Art Archive | §2 R8 | P14.5 | P14-AC4 | IT | Done (P14) |
| R8-3 | Saves `cover.jpg` in the album folder; never overwrites art | §2 R8 | P14.5 | P14-AC4 | IT | Done (P14) |
| R8-4 | Name normalization; save exact matches only | §2 R8 | P14.4 | P14-AC3 | UT | Done (P14, D43) |
| R8-5 | About 500 px image; check it is an image under 10 MB | §2 R8 | P14.5 | P14-AC9 | IT | Done (P14) |
| R8-6 | Exclusions (Unknown groups, artist-level songs); release group query; unique match; writability check | §2 R8 | P14.5 | P14-AC4, P14-AC5 | IT | Done (P14) |
| R8-7 | No match: marker in the album sidecar; no automatic retry | §2 R8 | P14.3, P14.5 | P14-AC4, P14-AC8 | IT | Done (P14) |
| R8-8 | "Retry lookup" per album clears the marker and tries again | §2 R8 | P14.7 | P14-AC7 | IT | Done (P14) |
| R8-9 | "Set cover" per album saves `cover.jpg`, converting if needed | §2 R8 | P10.4 | P10-AC5 | IT, MAN-L | Resolved (C17) |
| R8-10 | MusicBrainz at most 1 request per second; User-Agent with name, version and contact URL | §2 R8 | P14.1, P14.2 | P14-AC6 | IT | Done (P14) |
| R8-11 | Status line progress with cancel; UI stays usable | §2 R8 | P14.6 | P14-AC12 | MAN-L | Done (P14) |
| R9-1 | Per-song action; source LRCLIB; save `.lrc` when synced, else `.txt` | §2 R9 | P15.1, P15.2 | P15-AC3, P15-AC4 | IT | Done (P15) |
| R9-2 | Lookup with folder artist, cleaned title, folder album, decoded duration; fallback search; accept within 2 s | §2 R9 | P15.1, P15.4 | P15-AC1, P15-AC2 | IT | Done (P15) |
| R9-3 | Lyrics widget shows the playing song's lyrics; LRC timestamps hidden | §2 R9 | P13.2, P13.4, P13.3 | P13-AC2, P15-AC7 | UT, E2E | Done (P15) |
| R9-4 | Source order: `.lrc`, `.txt`, embedded (USLT, LYRICS, UNSYNCEDLYRICS) | §2 R9 | P13.1 | P13-AC1, P13-AC3, P13-AC4 | IT | Done (P13, D26) |
| R9-5 | "Fetch lyrics" only when no lyrics exist; disabled when lookups are off | §2 R9 | P13.4, P15.3 | P13-AC5, P15-AC6 | E2E | Done (P15) |
| R9-6 | Synced line highlighting | §2 R9 | none | none | REV | Deferred |
| R10-1 | Per-album action with a preview; nothing written before confirmation | §2 R10 | P16.4, P16.7 | P16-AC2 | IT | Done (P16) |
| R10-2 | Fill blanks only: title, track number, year | §2 R10 | P16.1, P16.4 | P16-AC1 | UT | Done (P16) |
| R10-3 | "Missing" means the embedded tag is absent or empty; file-name fallbacks do not count | §2 R10 | P16.1 | P16-AC1 | UT | Done (P16) |
| R10-4 | Lookup by folder names, tags and file name; no fingerprinting | §2 R10 | P16.2, P16.3 | P16-AC3, P16-AC7, P16-AC9 | IT, REV | Done (P16, D42) |
| R10-5 | One `sidecar.json` per album folder; it also holds lookup markers | §2 R10 | P14.3, P16.5 | P16-AC3, P14-AC4 | IT | Done (P16) |
| R10-6 | Embedded tags win over sidecar values | §2 R10 | P16.6 | P16-AC3 | IT | Done (P16) |
| R11-1 | The app never modifies audio files | §2 R11 | P5.14 | P16-AC4 | IT | Done (P16) |
| R11-2 | Sidecars are not tracks; orphan sidecars are ignored and never deleted | §2 R11 | P14.3 | P14-AC10, P16-AC6 | IT | Done (P16) |

### 1.6 Section 2: playlists (R12 to R14, R26)

| ID | Requirement | Source | Tasks | Criteria | Verify | Status |
|---|---|---|---|---|---|---|
| R12-1 | Create, add, remove, delete (delete after confirmation) | §2 R12 | P11.4, P11.5 | P11-AC2 | IT, E2E | Done (P11) |
| R12-2 | Playlists widget: list, expand, double-click plays, "New playlist", "Add to playlist", "Remove from playlist" | §2 R12 | P11.5, P11.6 | P11-AC8 | E2E | Done (P11) |
| R12-3 | Duplicates allowed; Favorites toggles | §2 R12 | P11.6, P11.7 | P11-AC2, P11-AC5 | IT | Done (P11, D20) |
| R12-4 | Name rule: separators, "..", Windows characters, edge spaces and dots, reserved names, "Favorites" | §2 R12 | P11.3 | P11-AC1 | UT | Done (P11, D21) |
| R13-1 | `.m3u8` (UTF-8) in `Playlists/` at the folder root | §2 R13 | P11.1 | P11-AC2 | IT | Done (P11) |
| R13-2 | Paths relative to the playlist file with forward slashes | §2 R13 | P11.1 | P11-AC2, P11-AC9 | IT, MAN-L, MAN-W | Planned |
| R13-3 | If a player fails on `..` paths in testing, the owner decides on moving playlists | §2 R13 | P11.9 | P11-AC9 | MAN-L, MAN-W | Gate (B3) |
| R13-4 | File name is the playlist name | §2 R13 | P11.1 | P11-AC2 | IT | Done (P11) |
| R13-5 | Writes use a temp file, then a rename | §2 R13 | P11.1 | P11-AC3 | IT | Done (P11) |
| R13-6 | Startup finds `.m3u8` files anywhere; entries resolve relative to the file; other playlist files not listed | §2 R13 | P11.2 | P11-AC6 | IT | Done (P11) |
| R13-7 | Rescan never edits playlists | §2 R13 | P11.2 | P11-AC7 | IT | Done (P11) |
| R14-1 | Import M3U, M3U8 and Apple XML; PLS, XSPF and Apple text deferred | §2 R14 | P12.1 | P12-AC2 | IT | Done (P12) |
| R14-2 | Writes a new `.m3u8` in `Playlists/`; the original stays untouched | §2 R14 | P12.4 | P12-AC3 | IT | Done (P12, D21) |
| R14-3 | Apple XML is the Apple Music or iTunes playlist export | §2 R14 | P12.1 | P12-AC2, P12-AC6 | IT | Planned (D22) |
| R14-4 | Matching order: relative, longest suffix, file name, name plus artist plus album | §2 R14 | P12.3 | P12-AC1 | UT | Done (P12) |
| R14-5 | Path normalization before matching | §2 R14 | P12.2 | P12-AC1 | UT | Done (P12) |
| R14-6 | Each stage must yield one track; narrowing; ambiguous entries stay missing | §2 R14 | P12.3 | P12-AC1 | UT | Done (P12) |
| R14-7 | Apple XML `file://` locations become paths | §2 R14 | P12.1 | P12-AC2 | UT | Done (P12) |
| R14-8 | Unmatched entries stay as missing and appear in a report | §2 R14 | P12.4, P12.5 | P12-AC2 | IT, E2E | Done (P12) |
| R14-9 | Tracks with no file location appear in the report only | §2 R14 | P12.1 | P12-AC5 | UT | Done (P12) |
| R14-10 | M3U8 is UTF-8; legacy `.m3u` UTF-8, then Windows-1252 | §2 R14 | P12.1 | P12-AC4 | UT | Done (P12) |
| R14-11 | Entry point is a file picker; matching searches the library only | §2 R14 | P12.6 | P12-AC2 | E2E | Done (P12) |
| R14-12 | Verify that MusicBee exports M3U8 | §2 R14 | P12.7 | P12-AC6 | MAN-W | Gate (B4) |
| R14-13 | Multi-file picker and folder import (v1.6) | §2 R14 | P19.3 | P19-AC7 | E2E | Done (P19) |
| R32-1 | Import picker accepts more than one file; "Import folder" takes one folder; dialogs in Rust | §2 R32 | P19.3, P19.6 | P19-AC7 | E2E | Done (P19) |
| R32-2 | Folder import reads `.m3u`, `.m3u8`, `.xml` in the folder and all subfolders | §2 R32 | P19.3 | P19-AC3 | IT | Done (P19) |
| R32-3 | Existing name (ignoring case) is skipped and reported, for every import | §2 R32 | P19.2 | P19-AC2 | UT | Done (P19) |
| R32-4 | Names that repeat inside one import get " (2)", " (3)" | §2 R32 | P19.2 | P19-AC2 | UT | Done (P19) |
| R32-5 | One combined report: imported, skipped, failed; no paths | §2 R32 | P19.3, P19.6 | P19-AC3, P19-AC7 | IT, E2E | Done (P19) |
| R32-6 | Busy state; only the scan cancel stops it; each playlist written when ready | §2 R32 | P19.3, P19.4 | P19-AC5, P19-AC7 | IT, E2E | Done (P19) |
| R32-7 | Unmatched relative entries inside the music folder are written relative to the new file | §2 R32 | P19.3 | P19-AC9 | IT | Done (P19) |
| R33-1 | Import and repair run the incremental scan first; a canceled or failed scan stops them with no write | §2 R33.1 | P19.4 | P19-AC5 | IT | Done (P19) |
| R33-2 | Stages 1 and 2 match another extension with the last extension removed; stage 2 keeps longest-suffix ranking; same extension wins; stage 3 unchanged | §2 R33.2 | P19.1 | P19-AC1 | UT | Done (P19) |
| R33-3 | "Find missing songs" on one playlist and on all playlists | §2 R33.3 | P19.5, P19.6 | P19-AC4, P19-AC7 | IT, E2E | Done (P19) |
| R33-4 | Unique matches replace entries in place; others unchanged; atomic; no write without change | §2 R33.4 | P19.5 | P19-AC4 | IT | Done (P19) |
| R33-5 | Repair report: fixed count and remaining missing entries with reasons; no paths | §2 R33.5 | P19.5, P19.6 | P19-AC4, P19-AC7 | IT, E2E | Done (P19) |
| R26-1 | Heart on Now playing and on song rows toggles the song in `Playlists/Favorites.m3u8` | §2 R26 | P11.7 | P11-AC5 | IT, E2E | Done (P11, D23) |
| R26-2 | Favorites file created on first use; a normal playlist in the widget | §2 R26 | P11.7 | P11-AC5 | IT | Done (P11) |

### 1.7 Section 2: theme, state, footprint and release (R15 to R23)

| ID | Requirement | Source | Tasks | Criteria | Verify | Status |
|---|---|---|---|---|---|---|
| R15-1 | Starts in a built-in dark theme | §2 R15 | P0.7 | P0-AC2 | MAN-L | Done (P0) |
| R16-1 | User-selected theme file | §2 R16 | none | none | REV | Deferred |
| R16-2 | Fonts installed locally with a system fallback; the owner may bundle one OFL font | §2 R16 | P0.9 | P0-AC7 | REV | Done (P0, C4) |
| R17-1 | Docs: tokens the app reads and the UI part each controls, including headers, splitters and drop zones | §2 R17 | P0.17, P2.16 | P18-AC13 | REV | Done (P18) |
| R17-2 | Docs: sidecar schema | §2 R17 | P14.9, P16.8 | P18-AC13 | REV | Done (P18) |
| R17-3 | Docs: arrangement file schema | §2 R17 | P9.6 | P18-AC13 | REV | Done (P18) |
| R17-4 | Docs: brand inputs | §2 R17 | P1.10 | P18-AC13 | REV | Done (P18) |
| R17-5 | Docs: copied Magic UI components | §2 R17 | P2.16 | P18-AC13 | REV | Done (P18, D6) |
| R18-1 | Settings (folder path, lookup switch) and window size in the OS config folder | §2 R18 | P4.4, P4.2 | P4-AC6, P4-AC7 | IT, MAN-L | Done (P4) |
| R18.1-1 | Portable marker: settings, arrangement, state, cache, logs and WebView profile in `data/` | §2 R18.1 | P4.1, P4.2, P4.3 | P4-AC4, P9-AC7 | IT, MAN-L, MAN-W | Planned (D47) |
| R18.1-2 | Music folder path relative to the executable folder on the same volume, else absolute | §2 R18.1 | P4.1 | P9-AC7, P18-AC10 | UT, MAN-W | Planned |
| R19-1 | SQLite cache is rebuildable; deleting it loses nothing | §2 R19 | P5.8 | P5-AC8 | IT | Done (P5) |
| R19-2 | Schema change rebuilds, no migrations | §2 R19 | P5.8 | P5-AC9 | IT | Done (P5) |
| R19-3 | No lookup markers in the cache; a rebuild causes no new lookups | §2 R19 | P14.3 | P14-AC8 | IT | Done (P14) |
| R19-4 | Cache paths relative to the music folder; thumbnails in the cache folder | §2 R19 | P5.8, P10.2 | P10-AC3 | IT | Done (P10) |
| R20-1 | Windows installer under 30 MB | §2 R20 | P3.6, P18.3 | P3-AC3, P18-AC2 | CI | Done (P18) |
| R20-2 | Linux `.deb` under 30 MB | §2 R20 | P3.6, P18.3 | P3-AC3, P18-AC2 | CI | Done (P18) |
| R20-3 | Idle memory under 200 MB with 50,000 tracks across all processes | §2 R20 | P3.5, P18.5, P10.3 | P3-AC2, P18-AC6, P10-AC7 | MEAS | Done (P18, D50) |
| R20-4 | AppImage exempt from the size target | §2 R20 | P18.3 | P18-AC2 | CI | Planned |
| R20-5 | Milestone 0 spike before feature work with full test data | §2 R20 | P3.1, P3.3, P3.4, P3.7 | P3-AC1 | MEAS | Done (P3, B2) |
| R20-6 | Over 300 MB: stop; the owner decides | §2 R20 | P3.8 | P3-AC4 | MEAS | Done (P3, D49) |
| R21-1 | Windows per-user installer, no admin | §2 R21 | P18.1 | P18-AC3 | MAN-W | Planned |
| R21-2 | Windows portable zip with the `portable` marker | §2 R21 | P18.2 | P18-AC4 | MAN-W | Planned |
| R21-3 | Linux AppImage (built on the R22 baseline) and `.deb` | §2 R21 | P18.3 | P18-AC1, P18-AC5 | CI, MAN-L | Planned |
| R22-1 | Windows 10 or later; WebView2 required; installer downloads it | §2 R22 | P18.1 | P18-AC3 | MAN-W | Planned |
| R22-2 | Portable build shows an error with a download link when WebView2 is missing | §2 R22 | P18.2 | P18-AC4 | MAN-W | Planned (D38) |
| R22-3 | Linux glibc baseline: AppImage glibc 2.35; `.deb` for Debian 12 and Ubuntu 22.04 | §2 R22 | P18.3 | P18-AC5 | MAN-L | Planned |
| R23-1 | Log file in the OS log folder with size-based rotation | §2 R23 | P4.3 | P4-AC5 | IT | Done (P4, D40) |
| R23-2 | Settings has "Open log folder" | §2 R23 | P4.3, P5.4 | P5-AC6 | E2E, MAN-L | Done (P5) |
| R23-3 | Every skip-and-log event goes to the log | §2 R23 | P5.2, P9.4, P11.2, P14.3, P14.5 | P5-AC2, P9-AC4, P11-AC6, P14-AC5, P14-AC10 | IT | Done (P14) |

### 1.8 Section 3: preferences and examples

| ID | Item | Source | Tasks | Criteria | Verify | Status |
|---|---|---|---|---|---|---|
| S3-1 | "Similar to MusicBee" is a feel reference | §3 | none | none | REV | Reference |
| S3-2 | MusicBee layout is a reference; "massively simpler" is a constraint (see CON-4) | §3 | none | none | REV | Reference |
| S3-3 | Strawberry is a reference; do not copy its code | §3 | P0.1 | P0-AC7 | REV | Reference |
| S3-4 | Magic UI is optional and follows R30 | §3 | P2.16 | P18-AC13 | REV | Reference |
| S3-5 | `/music/` is an example path | §3 | none | none | REV | Reference |
| S3-6 | `markdown.md` was an example theme name; the theme is `theme/tokens.json` | §3 | none | none | REV | Reference |
| S3-7 | MusicBee and Apple Music are example playlist sources | §3 | none | none | REV | Reference |
| S3-8 | "Any system" means Windows and Linux | §3 | none | none | REV | Reference |
| S3-9 | "All the basics" means R5, R6, R24, R25, R26 and R27 | §3 | none | none | REV | Reference |
| S3-10 | "Twenty percent" is the default duck level | §3 | none | none | REV | Reference |
| S3-11 | Handy, Meet, Slack, WhatsApp, Signal are example microphone users | §3 | none | none | REV | Reference |
| S3-12 | "Automatically scan the library" means rescan, then match | §3 | none | none | REV | Reference |

### 1.9 Section 4: non-goals

| ID | Non-goal | Source | Tasks | Criteria | Verify | Status |
|---|---|---|---|---|---|---|
| N-1 | Streaming, scrobbling, CD playback, device sync, transcoding, radio, podcasts | §4 | P0.1 | P14-AC11 | REV | Non-goal |
| N-2 | Mobile apps | §4 | none | none | REV | Non-goal |
| N-3 | macOS | §4 | none | none | REV | Non-goal |
| N-4 | Formats beyond mp3, Ogg Vorbis and wav, including Opus | §4 | P5.2 | P5-AC2 | IT | Non-goal |
| N-5 | Audio fingerprinting | §4 | P16.2 | P16-AC7 | REV | Non-goal |
| N-6 | Editing tags in audio files | §4 | P5.14 | P16-AC4 | IT | Non-goal |
| N-7 | Multiple music folders | §4 | none | none | REV | Non-goal |
| N-8 | Live folder watching | §4 | P5.3 | P5-AC15 | IT | Non-goal |
| N-9 | Smart playlists, ratings, play counts | §4 | none | none | REV | Non-goal |
| N-10 | Floating panels and pop-out windows | §4 | P2.1 | P2-AC2 | E2E | Non-goal |
| N-11 | Per-view layout overrides | §4 | none | none | REV | Non-goal |
| N-12 | Playback of `.m4a`, `.flac` or other formats | §4 | none | none | REV | Non-goal |
| N-13 | Fuzzy or typo-tolerant matching | §4 | none | none | REV | Non-goal |
| N-14 | Opening the microphone or measuring its level | §4 | P20.2 | P20-AC5 | MAN-W | Non-goal |
| N-15 | Automatic playlist repair on Rescan | §4 | P11.2 | P11-AC7 | IT | Non-goal |
| N-16 | Replacing an existing playlist on import | §4 | P19.2 | P19-AC2 | UT | Non-goal |

### 1.10 Section 5: edge cases

| ID | Edge case | Source | Tasks | Criteria | Verify | Status |
|---|---|---|---|---|---|---|
| E-1 | No music folder set: R1.1 applies | §5 | P4.6 | P4-AC2 | E2E | Done (P4) |
| E-2 | Music folder changed: stop, reset, clear queue and cache, scan, reload playlists | §5 | P5.9, P11.10 | P5-AC13, P11-AC11 | IT | Done (P11) |
| E-3 | Music folder missing at startup: message and "Change folder"; keep the cache | §5 | P5.10, P9.1 | P5-AC12, P9-AC10 | IT, MAN-L | Done (P9, D30) |
| E-4 | Unsupported or corrupt audio file: skip, log, count | §5 | P5.2, P5.11 | P5-AC2 | IT | Done (P5, D16) |
| E-5 | Ogg with an unsupported codec: skip, log, count | §5 | P5.2, P5.11 | P5-AC2 | IT | Done (P5) |
| E-6 | Missing tags: R4 fallbacks | §5 | P5.7 | P5-AC1, P5-AC10 | UT | Done (P5) |
| E-7 | Tag and folder disagree: folder wins, no warning | §5 | P5.6 | P5-AC1, P6-AC7 | IT | Done (P6) |
| E-8 | Folders that differ only by case (Linux) are separate | §5 | P5.12 | P5-AC1 | IT | Done (P5) |
| E-9 | Non-ASCII names work on both systems | §5 | P5.12 | P5-AC14 | IT | Done (P5) |
| E-10 | Windows paths over 260 characters work | §5 | P5.1, P5.12 | P5-AC14 | IT | Planned |
| E-11 | No network or service error: playback and library work; retry at next startup except "no match" | §5 | P14.5 | P14-AC4, P14-AC13 | IT | Done (P14) |
| E-12 | Existing art blocks the fetch | §5 | P14.5 | P14-AC5 | IT | Done (P14) |
| E-13 | Read-only music folder: fetches, playlist edits and Favorites show an error; playback works | §5 | P10.4, P11.8, P14.5, P15.2, P16.1 | P10-AC5, P11-AC10, P14-AC5, P15-AC5, P16-AC8 | IT, MAN-L | Done (P16) |
| E-14 | Decode error during playback: R6 applies | §5 | P7.3 | P7-AC3 | IT | Done (P7) |
| E-15 | File name that is not valid UTF-8 (Linux): skip and log | §5 | P5.1 | P5-AC14 | IT | Done (P5) |
| E-16 | Cover file that fails to decode: log, ignore; embedded art and lookup still apply | §5 | P10.1, P14.5 | P10-AC2, P14-AC14 | IT | Resolved (C18) |
| E-17 | Corrupt sidecar: ignore and log; metadata fill may replace it after preview | §5 | P14.3, P16.4 | P14-AC10, P16-AC5 | IT | Done (P16) |
| E-18 | Playlist entry with no file: "missing", skipped, never removed | §5 | P11.2, P11.5 | P11-AC4 | IT, E2E | Done (P11) |
| E-19 | Unreadable playlist file: skip and log | §5 | P11.2 | P11-AC6 | IT | Done (P11) |
| E-20 | Playlist write failure: show the error; old file intact | §5 | P11.1, P11.8 | P11-AC3 | IT | Done (P11) |
| E-21 | Layout problems follow R29 | §5 | P9.4 | P9-AC4 | UT | Done (P9) |
| E-22 | Transport controls hidden: keys and media keys work; Reset layout restores | §5 | P7.11, P8.2, P2.4 | P7-AC5, P8-AC4, P9-AC5 | E2E, MAN-W, MAN-L | Planned |
| E-23 | Window smaller than a layout: minimum sizes and clamping | §5 | P2.11, P9.4 | P2-AC6, P9-AC9 | E2E | Done (P9, D45) |
| E-24 | Empty Play queue, Playlists or Lyrics show a hint | §5 | P2.9 | P2-AC12 | E2E | Done (P2) |
| E-25 | Output stream error: stop with a message; next Play opens the default device | §5 | P7.4 | P7-AC4 | MAN-L, MAN-W | Planned |
| E-26 | Second launch focuses the running instance | §5 | P9.5 | P9-AC6 | MAN-L, MAN-W | Planned |
| E-27 | Closing the window quits; media keys only while running | §5 | P8.5 | P8-AC5 | MAN-L, MAN-W | Planned |
| E-28 | Folder edited while running: changes after Rescan or restart | §5 | P5.3, P13.3 | P5-AC15, P13-AC6 | IT | Done (P13) |
| E-29 | Folder import: non-Apple `.xml` or unreadable file shows as failed; others import | §5 | P19.3 | P19-AC3 | IT | Done (P19) |
| E-30 | Two other-format hits: narrowing, then "more than one match" | §5 | P19.1 | P19-AC1 | UT | Done (P19) |
| E-31 | Find missing songs on a read-only folder: error, no write | §5 | P19.5 | P19-AC6 | IT | Done (P19, CI only: root here) |
| E-36 | Bare entries from imports before v1.6: delete and import again | §5 | P19.3 | P19-AC9 | IT | Done (P19) |
| E-32 | A tool that keeps the microphone open holds the duck; help text names it | §5 | P20.4 | P20-AC3 | E2E | Done (P20) |
| E-33 | Microphone in use while stopped or paused by the user: nothing happens | §5 | P20.3 | P20-AC1 | UT | Done (P20) |
| E-34 | Play during a Pause duck: no new pause until the next microphone start | §5 | P20.3 | P20-AC1 | UT | Done (P20) |
| E-35 | Track change, seek or queue edit during a duck: the duck stays | §5 | P20.3 | P20-AC1 | UT | Done (P20) |
| E-37 | Setting changed to Off during a duck: volume returns or the duck-paused track resumes | §5 | P20.3 | P20-AC1 | UT | Done (P20) |
| E-38 | Stop during a Pause duck: no resume when the microphone is free | §5 | P20.3 | P20-AC1 | UT | Done (P20) |
| E-39 | Mode changed during a duck applies at once | §5 | P20.3 | P20-AC1 | UT | Done (P20) |

### 1.11 Section 6: constraints

| ID | Constraint | Source | Tasks | Criteria | Verify | Status |
|---|---|---|---|---|---|---|
| CON-1 | Stack: Tauri v2, Rust backend, SQLite, React, Tailwind, shadcn/ui; revisit if Milestone 0 fails | §6 | P0.3, P0.4, P3.8 | P0-AC1, P3-AC4 | CI | Done (P3, D1) |
| CON-2 | Branding: no feature code depends on the name, icon or theme | §6 | P0.14 | P0-AC6, P18-AC9 | UT, MAN-L | Done (P18, D34) |
| CON-3 | Docking library MIT, React bindings, passes Milestone 0, no commercial add-ons, no floating or pop-out, tabs on | §6 | P2.1, P3.8, P18.4 | P2-AC2, P3-AC4, P18-AC7 | E2E, REV | Done (P18, D8) |
| CON-4 | Complexity budget: fixed widgets, no per-view overrides, named layouts, floating, pop-out or layout import and export | §6 | P0.1, P2.2 | P2-AC2 | REV | Done (P2) |
| CON-5 | Audio engine: rodio pinned, Symphonia with `mp3`, lofty; gapless-ready design | §6 | P7.2, P7.5 | P7-AC1 | REV | Done (P7, D3) |
| CON-6 | License: MIT app; Symphonia MPL-2.0; LGPL in the AppImage; license texts, versions and sources per release; NOTICE file; no Strawberry code | §6 | P0.2, P18.4 | P18-AC7, P18-AC8 | REV, CI | Planned |
| CON-7 | Platforms: Windows and Linux | §6 | P0.16, P18.3 | P0-AC1, P18-AC5 | CI | Planned |
| CON-8 | Formats: mp3, Ogg Vorbis, wav | §6 | P5.2 | P5-AC2 | IT | Done (P5) |
| CON-9 | The music folder is the source of truth | §6 | P5.3 | P5-AC4 | IT | Done (P5) |
| CON-10 | Audio files are never modified | §6 | P5.14 | P16-AC4 | IT | Done (P16) |
| CON-11 | Network: only the R7 services; no accounts, no API keys | §6 | P14.1, P0.12 | P14-AC1, P14-AC11, P0-AC9 | IT | Done (P14) |
| CON-12 | Theme source: `theme/tokens.json` compiled at build time | §6 | P0.6 | P0-AC3 | UT | Done (P0) |
| CON-13 | Microphone ducking is Windows only in this version | §6 | P20.2, P20.4 | P20-AC3, P20-AC6 | E2E, REV | Planned |
| CON-14 | Microphone privacy: read only the in-use state; never record; never log app names | §6 | P20.2 | P20-AC5, P20-AC6 | MAN-W, REV | Done (P20); MAN-W open |

### 1.12 Section 7: deferred ideas

All rows have status Deferred. No task implements them. P17 and P18 reviews confirm none was added.

| ID | Deferred idea | Plan note |
|---|---|---|
| DEF-1 | Gapless playback | P7.5 keeps the `prepare_next` seam (CON-5) |
| DEF-2 | Synced lyrics highlighting | P13.2 shows plain text |
| DEF-3 | Volume normalization (ReplayGain) | none |
| DEF-4 | Equalizer and crossfade | none |
| DEF-5 | Customizable keyboard shortcuts | Fixed keys (D17) |
| DEF-6 | Moving widgets by keyboard | Follow-up F-02 |
| DEF-7 | Layout import and export | none |
| DEF-8 | Floating panels and pop-out windows | Disabled (P2.1) |
| DEF-9 | Named layouts | none |
| DEF-10 | User-selected theme file | none |
| DEF-11 | PLS, XSPF and Apple text import | none |
| DEF-12 | Playlist rename and reorder | none |
| DEF-13 | Playlist export UI | none |
| DEF-14 | Bundled themes or a light and dark toggle | none |
| DEF-15 | `components` tokens in themes | none |
| DEF-16 | Accessibility work beyond platform defaults and R25 | Basis for D23 |
| DEF-17 | Multiple music folders | none |
| DEF-18 | Light theme variant of the brand tokens | none |
| DEF-19 | Microphone ducking on Linux | P20.4 shows no control off Windows (D53) |
| DEF-20 | Exclusion list of apps that do not trigger ducking | none |
| DEF-21 | Pick the right song by hand for "more than one match" | none |
| DEF-22 | Adjustable wait before the music comes back | D52 fixes the wait |

### 1.13 Section 8: owner decisions and items to verify

| ID | Item | Source | Tasks | Criteria | Verify | Status |
|---|---|---|---|---|---|---|
| DEC-1 | Docking shell stays; design.md §5 rewrite (done in the repo before planning) | §8.1 | P2.1 | P2-AC1 | E2E | Done (P2) |
| DEC-2 | Online lookups off by default with a first-run choice | §8.2 | P4.6 | P4-AC1 | E2E | Done (P4) |
| DEC-3 | Metadata fill kept | §8.3 | P16.2 | P16-AC3 | IT | Done (P16) |
| DEC-4 | Import formats M3U, M3U8, Apple XML | §8.4 | P12.1 | P12-AC2 | IT | Done (P12) |
| DEC-5 | User theme deferred; build compiles `theme/tokens.json` | §8.5 | P0.6 | P0-AC3 | UT | Done (P0) |
| DEC-6 | Named layouts deferred; built-ins and auto-save stay | §8.6 | P2.4, P9.3 | P9-AC2 | E2E | Done (P9) |
| DEC-7 | Tabbed groups allowed | §8.7 | P2.1 | P9-AC3 | E2E | Done (P9) |
| DEC-8 | Magic UI optional; no Motion unless a component needs it | §8.8 | P2.16 | P18-AC13 | REV | Resolved (C8) |
| DEC-9 | Portable mode and Windows portable zip | §8.9 | P4.1, P18.2 | P4-AC4, P18-AC4 | MAN-W | Planned |
| DEC-10 | Search in the Library header | §8.10 | P2.8 | P2-AC5 | E2E | Done (P2) |
| DEC-11 | Scan report: counts in the status line and Settings, reasons in the log | §8.11 | P5.4 | P5-AC6 | E2E | Done (P5) |
| DEC-12 | Lookup progress: cancel only | §8.12 | P14.6 | P14-AC12 | MAN-L | Done (P14) |
| DEC-13 | Previous restarts after 3 s | §8.13 | P7.1 | P7-AC1 | UT | Done (P7) |
| DEC-14 | Playlist duplicates allowed; Favorites toggles | §8.14 | P11.6, P11.7 | P11-AC2, P11-AC5 | IT | Done (P11) |
| DEC-15 | Linux baseline Ubuntu 22.04, glibc 2.35 | §8.15 | P18.3 | P18-AC5 | MAN-L | Planned |
| DEC-16 | Brand UI icon override kept | §8.16 | P2.13 | P2-AC11 | UT | Done (P2) |
| DEC-17 | Bulk import: several files or one folder with subfolders | §8.17 | P19.3 | P19-AC3 | IT | Done (P19) |
| DEC-18 | Existing name skipped for every import; repeats in one import numbered | §8.18 | P19.2 | P19-AC2 | UT | Done (P19) |
| DEC-19 | Another extension matches by folder and file name without extension | §8.19 | P19.1 | P19-AC1 | UT | Done (P19) |
| DEC-20 | Repair is a user command, not automatic on Rescan | §8.20 | P19.5 | P19-AC4 | IT | Done (P19) |
| DEC-21 | Repair writes unique matches, then reports; no preview | §8.21 | P19.5 | P19-AC4 | IT | Done (P19) |
| DEC-22 | Import and repair rescan first | §8.22 | P19.4 | P19-AC5 | IT | Done (P19) |
| DEC-23 | Ducking trigger: another app records from a microphone | §8.23 | P20.0, P20.2 | P20-AC4 | MAN-W | Done (P20, D54) |
| DEC-24 | Ducking on Windows first; Linux deferred | §8.24 | P20.4 | P20-AC3 | E2E | Planned |
| DEC-25 | Duck level: percentage of the current volume, default 20% | §8.25 | P20.3 | P20-AC1 | UT | Done (P20) |
| DEC-26 | Resume: short fixed wait, then a fade | §8.26 | P20.3 | P20-AC1 | UT | Done (P20) |
| DEC-27 | Ducking modes: Lower volume or Pause | §8.27 | P20.1 | P20-AC3 | E2E | Done (P20) |
| DEC-28 | Bare entries fixed by a new import; new imports write unmatched relative entries relative to the new file | §8.28 | P19.3 | P19-AC9 | IT | Done (P19) |
| DEC-A | Default: three decode failures stop playback | §8 | P7.3 | P7-AC3 | IT | Done (P7) |
| DEC-B | Default: sidecar file is `sidecar.json` | §8 | P14.3 | P14-AC4 | IT | Done (P14) |
| DEC-C | Default: AC-2 uses a 100 ms redraw limit | §8 | P6.8 | P6-AC6 | MEAS | Planned |
| VER-1 | Verify the R13 path base after the interop test | §8 | P11.9 | P11-AC9 | MAN-L, MAN-W | Gate (B3) |
| VER-2 | Verify the MusicBee M3U8 export | §8 | P12.7 | P12-AC6 | MAN-W | Gate (B4) |
| VER-3 | Verify the Milestone 0 outcome | §8 | P3.8 | P3-AC4 | MEAS | Done (P3, B2) |
| VER-4 | Verify that Windows reports microphone use by another app without opening the microphone | §8 | P20.0 | P20-AC4, P20-AC5 | MAN-W | Done (P20.0 probe, D54) |

### 1.14 Section 9: acceptance checks

| ID | Check | Source | Tasks | Criteria | Verify | Status |
|---|---|---|---|---|---|---|
| AC-1 | Footprint spike passes R20 or triggers the owner decision | §9.1 | P3.5, P3.8, P18.5 | P3-AC2, P3-AC4, P18-AC6 | MEAS | Done (P18, D50) |
| AC-2 | During the first 50,000-track scan, select and play a scanned song; redraw within 100 ms | §9.2 | P6.8 | P6-AC6 | MEAS | Planned |
| AC-3 | App playlist opens in MusicBee or VLC with paths intact | §9.3 | P11.9 | P11-AC9 | MAN-L, MAN-W | Gate (B3) |
| AC-4 | Real Apple XML, MusicBee M3U8 and legacy `.m3u` import with a correct report | §9.4 | P12.7 | P12-AC6 | MAN-W | Planned (Q5) |
| AC-5 | "01 - Title.mp3" finds lyrics by cleaned title and decoded duration | §9.5 | P15.1 | P15-AC1 | IT | Done (P15) |
| AC-6 | "1973 - Album (Remastered)" matches; Set cover and Retry lookup work | §9.6 | P14.4, P10.4, P14.7 | P14-AC3, P10-AC5, P14-AC7 | UT, IT | Done (P14) |
| AC-7 | Changing a token color and rebuilding changes the UI | §9.7 | P0.6 | P0-AC3, P18-AC9 | MAN-L | Done (P18) |
| AC-8 | Startup with the folder missing loses no data; Change folder works | §9.8 | P5.10, P9.1 | P5-AC12, P9-AC10 | IT, MAN-L | Done (P9) |
| AC-9 | Deleting the cache restores library and playlists with no new lookups for "no match" albums | §9.9 | P5.8, P14.3, P9.1, P11.2 | P5-AC8, P14-AC8, P9-AC10, P11-AC11 | IT | Done (P14) |
| AC-10 | Unplugging the device stops playback with a message; Play resumes on the default device | §9.10 | P7.4 | P7-AC4 | MAN-L, MAN-W | Planned |
| AC-11 | In each mode, dock, resize, hide and show widgets; arrangement survives a restart | §9.11 | P2.1, P9.3 | P2-AC2, P9-AC2 | E2E, MAN-L | Done (P9) |
| AC-12 | Each built-in layout applies; a tabbed group survives a restart | §9.12 | P2.4, P9.3 | P2-AC4, P9-AC3 | E2E, MAN-L | Done (P9) |
| AC-13 | Transport hidden: keys and media keys work; Reset layout restores | §9.13 | P7.11, P8.2, P2.4 | P7-AC5, P8-AC4, P9-AC5 | E2E, MAN-W | Planned |
| AC-14 | Library cannot close; mode switch keeps selection and search | §9.14 | P2.3, P2.8, P6.3 | P2-AC3, P2-AC5, P6-AC2 | E2E | Done (P6) |
| AC-15 | Replacing tokens and the icon source and rebuilding changes theme and icon with no other code change | §9.15 | P1.6, P18.8 | P1-AC5, P18-AC9 | MAN-L | Done (P18) |
| AC-16 | With reduce motion on, no animation plays (Magic UI clause applies only if components are named) | §9.16 | P0.7, P17.3 | P2-AC8, P17-AC3 | E2E, MAN-L, MAN-W | Planned |
| AC-17 | Portable folder and music folder copied to another drive: settings, arrangement, queue survive | §9.17 | P4.1, P9.1 | P9-AC7, P18-AC10 | MAN-W | Planned |
| AC-18 | Two-disc album plays disc 1 then disc 2 in track order | §9.18 | P5.7, P7.1 | P5-AC11, P7-AC6 | IT, MAN-L | Done (P7) |
| AC-19 | Corrupt file in the queue is skipped with a status message | §9.19 | P7.3 | P7-AC3 | IT | Done (P7) |
| AC-20 | First run shows the folder prompt; a song plays before the scan ends | §9.20 | P4.6, P4.7, P4.8, P4.9, P4.11, P4.12 | P4-AC3, P7-AC10 | MAN-L | Planned |
| AC-21 | ID3 USLT lyrics with no lyrics file show | §9.21 | P13.1 | P13-AC3 | IT, MAN-L | Done (P13) |
| AC-22 | Several files in one picker action and the owner's playlist folder import; other-format entries match; repair fixes earlier imports | §9.22 | P19.3, P19.5, P21.2 | P19-AC8, P21-AC2 | MAN-W | Planned |
| AC-23 | Ducking with Handy and one call app, both modes | §9.23 | P20.2, P20.3 | P20-AC4 | MAN-W | Not verified (P20, owner decision); P21 |
| AC-24 | No microphone use by the app in Windows privacy settings | §9.24 | P20.2 | P20-AC5 | MAN-W | Not verified (P20, owner decision); P21 |

---

## 2. `docs/design.md`

| ID | Requirement | Source | Tasks | Criteria | Verify | Status |
|---|---|---|---|---|---|---|
| DES-0 | Dark-only theme (front matter) | front matter | P0.7 | P0-AC2 | MAN-L | Done (P0) |
| DES-1.1 | Local-first player for MP3, WAV, OGG with metadata, art, lyrics and standard controls; not streaming, radio or podcasts | §1 | P4.5, P7.2, P10.1, P13.1 | P4-AC3, P13-AC1 | IT | Done (P13) |
| DES-1.2 | Primary rule: practical minimalist player; style never makes playback harder | §1 | P17.1, P17.8 | P17-AC1, P17-AC8 | E2E, REV | Done (P17, D10) |
| DES-1.3 | Cat silhouette, narrow red eyes, pointed ears, minimal whiskers | §1 | P1.2 | P1-AC3 | MAN-L | Done (P1) |
| DES-1.4 | Wordmark: angled red "Claw", metallic "dio", bars in the final "o" | §1 | P1.1 | P1-AC4 | REV | Done (P1) |
| DES-1.5 | Secondary angular C with cat eye and audio bars | §1 | P1.3 | P1-AC1 | UT, REV | Done (P1) |
| DES-1.6 | Deep black shell, sparse red controls, monochrome utility icons | §1 | P0.7, P2.10 | P2-AC7, P17-AC8 | E2E, REV | Done (P17, D10) |
| DES-1.7 | Lair imagery is promotional, not a feature | §1 | none | none | REV | Resolved (C9) |
| DES-1.8 | Rebuild assets as original vectors; no tracing or embedded crops; recognizable at 16 to 32 px; no third-party copies | §1 | P1.1, P1.2, P1.3, P1.5, P1.7 | P1-AC1, P1-AC3, P1-AC7 | UT, MAN-L, REV | Done (P1) |
| DES-2.1 | Name Clawdio; publisher Dr. Claw Development; positioning; message | §2 | P0.2, P0.4, P18.1 | P18-AC11 | MAN-W, MAN-L | Planned |
| DES-2.2 | Attributes: minimalist, precise, theatrical, self-contained, technical, controlled | §2 | none | none | REV | Reference |
| DES-2.3 | Logo 1: primary wordmark, transparent background | §2 | P1.1, P1.4 | P1-AC4 | REV | Done (P1) |
| DES-2.4 | Logo 2: app icon with cat, faint arc and bars on a dark square; legible at 16 px | §2 | P1.4, P1.7 | P1-AC3 | MAN-L | Done (P1) |
| DES-2.5 | Logo 3: secondary symbol for micro sizes | §2 | P1.3, P1.4 | P1-AC1 | REV | Done (P1) |
| DES-2.6 | Logo 4: monochrome and high-contrast variants | §2 | P1.4 | P1-AC1, P1-AC4 | REV | Done (P1) |
| DES-2.7 | No raster mockup as the icon; no repeated full mascot in the UI | §2 | P1.6, P17.8 | P1-AC2, P17-AC8 | REV | Done (P17) |
| DES-3.1 | `theme/tokens.json` is the machine-readable color source | §3 | P0.6 | P0-AC3 | UT | Done (P0) |
| DES-3.2 | Color table values | §3 | P0.6 | P0-AC5 | UT | Done (P0) |
| DES-3.3 | Red for playback emphasis, current navigation, focus and identity; not every clickable item | §3 | P0.7, P2.10, P17.8 | P2-AC7, P17-AC8 | E2E, REV | Done (P17, D10) |
| DES-3.4 | Adequate contrast; red never the only state cue | §3 | P0.15, P7.7, P6.4, P2.8 | P0-AC5, P7-AC8, P2-AC15, P6-AC9 | UT, E2E | Done (P7, C13) |
| DES-4.1 | UI font Geist Sans or Inter | §4 | P0.9 | P0-AC7 | REV | Done (P0, C4) |
| DES-4.2 | Wordmark is custom vector lettering, no generic font | §4 | P1.1 | P1-AC4 | UT | Done (P1) |
| DES-4.3 | Type sizes 24, 18 to 20, 14, 12 to 13, 11 to 12 px | §4 | P0.7, P17.7 | P17-AC8 | REV | Resolved (C12) |
| DES-4.4 | Tabular numerals for times | §4 | P0.7, P7.7 | P7-AC9 | E2E | Done (P7) |
| DES-4.5 | Sentence case; uppercase spaced text only for brand collateral | §4 | P17.7 | P17-AC8 | REV | Done (P17) |
| DES-5.1 | Six widgets; headers with grip, title and close (hideable only); drag docking; show and hide | §5 | P2.1, P2.2, P2.3, P2.6 | P2-AC1, P2-AC2, P2-AC3, P2-AC4 | E2E | Done (P2) |
| DES-5.2 | Fixed chrome: status line and top-right menu button; no layout hides them | §5 | P2.5, P2.6, P2.7 | P2-AC6 | E2E | Done (P2, C14) |
| DES-5.3 | Library widget: mode switch, search in header, dropdown when narrow | §5 | P2.8 | P2-AC5 | E2E | Done (P2) |
| DES-5.4 | Default arrangement, auto-save, Reset layout, tabbed groups, no floating or pop-out | §5 | P2.4, P9.3 | P2-AC1, P9-AC2, P9-AC3 | E2E | Done (P9) |
| DES-5.5 | Main area prioritizes browsing, metadata and art | §5 | P2.4, P6.4 | P2-AC1 | E2E | Planned |
| DES-5.6 | Persistent, reachable transport controls; keys and media keys when Transport is hidden | §5 | P7.7, P7.11, P8.2 | P7-AC5, P8-AC4 | E2E, MAN-W | Planned |
| DES-5.7 | Clear active, focus and disabled states, including headers, splitters and drop zones | §5 | P0.7, P2.10 | P2-AC7, P2-AC10, P17-AC1, P2-AC14, P2-AC17 | E2E | Done (P17) |
| DES-5.8 | Small windows: minimum window and widget sizes; clamping | §5 | P2.11, P9.4 | P2-AC6, P9-AC9, P17-AC4 | E2E, MAN-L | Done (P17, D45) |
| DES-5.9 | Empty widgets show hints; missing art uses a quiet placeholder | §5 | P2.9, P1.8, P10.3 | P2-AC12, P10-AC4 | E2E | Done (P10) |
| DES-5.10 | Lyrics only as the requirements support; no invented fetching | §5 | P13.1, P15.1 | P13-AC5, P15-AC1 | IT, E2E | Done (P15) |
| DES-6.1 | App shell: matte canvas, subtle boundaries, stable resizing | §6 | P0.7, P2.10 | P2-AC6, P2-AC7 | E2E | Done (P2) |
| DES-6.2 | Widget header flat; drop zones and splitters on border and hover surfaces; red only on the active drop target | §6 | P2.3, P2.10 | P2-AC7, P2-AC17 | E2E | Done (P2) |
| DES-6.3 | Dense, scannable track rows | §6 | P6.4 | P6-AC1 | E2E | Done (P6) |
| DES-6.4 | Album cards: cover, title, artist, quiet hover | §6 | P6.4, P10.3 | P10-AC4 | E2E | Done (P10, C11) |
| DES-6.5 | Transport: large play/pause, neutral stop and skip, shuffle and repeat toggles, clear focus ring | §6 | P7.7 | P7-AC8, P7-AC9 | E2E | Done (P7) |
| DES-6.6 | Timeline: charcoal track, red progress, keyboard seeking | §6 | P7.7 | P7-AC9, P7-AC11 | E2E | Done (P7) |
| DES-6.7 | Volume: neutral icon, clear mute state and level | §6 | P7.7 | P7-AC9, P7-AC11 | E2E | Done (P7, C3) |
| DES-6.8 | Search: dark field, visible focus, no animation | §6 | P2.8 | P2-AC5, P6-AC5 | E2E | Done (P6) |
| DES-6.9 | Settings: few options grouped by task | §6 | P4.10, P5.4 | P4-AC1, P5-AC6 | E2E | Done (P5, D12) |
| DES-6.10 | Dialogs: matte panels, no heavy red glow | §6 | P2.14, P17.8 | P17-AC8 | REV | Done (P17) |
| DES-6.11 | Tooltips: short; shown on keyboard focus | §6 | P2.3, P7.7 | P17-AC2 | E2E, MAN-L | Done (P17) |
| DES-6.12 | Error states: plain, actionable text for missing and invalid files | §6 | P5.10, P11.8 | P5-AC12, P11-AC3, P11-AC10 | E2E, IT | Done (P11) |
| DES-6.13 | Lucide outline icons; no mismatched or decorative icons in navigation | §6 | P2.13 | P2-AC11 | UT, REV | Done (P2) |
| DES-7.1 | Magic UI only if the stack supports it | §7 | P2.16 | P18-AC13 | REV | Resolved (C8) |
| DES-7.2 | Install only components with real value | §7 | P2.16 | P18-AC13 | REV | Resolved (C8) |
| DES-7.3 | Blur Fade or Magic Card may fit About or empty states | §7 | none | none | REV | Resolved (C8) |
| DES-7.4 | No marquees, border beams, animated gradients, confetti, particles or per-track animation | §7 | P17.8 | P17-AC3 | REV, E2E | Done (P17, D6) |
| DES-7.5 | CSS transitions over a motion dependency | §7 | P0.7 | P2-AC13 | E2E | Done (P2, D6) |
| DES-7.6 | Check Magic UI docs before choosing components | §7 | none | none | REV | Planned (D6) |
| DES-7.7 | No new framework only for Magic UI | §7 | none | P0-AC1 | REV | Done (P0, D6) |
| DES-8.1 | Hover and focus feedback 120 to 180 ms | §8 | P0.7 | P2-AC13 | E2E | Done (P2) |
| DES-8.2 | Panel transitions 180 to 240 ms at most | §8 | P0.7 | P2-AC13 | E2E | Done (P2) |
| DES-8.3 | Reduced motion supported; control response first | §8 | P0.7 | P2-AC8, P17-AC3, P17-AC9 | E2E | Done (P17) |
| DES-8.4 | No animation on repeated rows, the seek bar or live times | §8 | P0.7, P6.4, P7.7 | P2-AC13 | E2E | Done (P7, C16) |
| DES-8.5 | No recurring decorative motion during playback | §8 | P17.8 | P17-AC3 | REV | Done (P17, D6) |
| DES-9.1 | Works offline with no account | §9 | P14.1 | P14-AC1, P14-AC13 | IT | Done (P14) |
| DES-9.2 | Respects Windows and Linux controls, text scaling and keyboard access | §9 | P4.2, P17.5 | P17-AC2, P17-AC5 | MAN-W, MAN-L | Planned |
| DES-9.3 | No macOS window buttons in production | §9 | P4.2 | P0-AC2 | MAN-L | Resolved (C9) |
| DES-9.4 | Run without install where possible; single file, no installer and portable data are distinct | §9 | P4.1, P18.2, P18.3 | P18-AC4, P18-AC5, P18-AC10 | MAN-W, MAN-L | Planned |
| DES-9.5 | Data paths follow the requirements; no silent profile-path assumptions | §9 | P4.1 | P4-AC4 | IT | Done (P4) |
| DES-10.1 | Wordmark and icon identifiable at practical sizes | §10 | P1.7 | P1-AC3, P1-AC4 | MAN-L | Done (P1) |
| DES-10.2 | Icons exported and configured for Windows and Linux | §10 | P1.6, P18.1 | P1-AC2, P18-AC11 | CI, MAN-W, MAN-L | Planned |
| DES-10.3 | Contrast and focus visibility tested | §10 | P0.15, P17.1, P2.15 | P0-AC5, P17-AC1, P2-AC9, P2-AC14 | UT, E2E | Done (P17) |
| DES-10.4 | Navigation usable in a narrow window | §10 | P17.4 | P17-AC4 | MAN-L | Done (P17) |
| DES-10.5 | Semantic theme variables, not copied hex values | §10 | P0.14 | P0-AC6 | UT | Done (P0, D34) |
| DES-10.6 | No loss of audio, playlist, library, lyric or metadata behavior | §10 | P0.16 | P0-AC1 | CI | Resolved (C1) |
| DES-10.7 | Offline startup and operation | §10 | P14.1 | P14-AC1, P14-AC13 | IT | Done (P14) |
| DES-10.8 | No unnecessary dependencies or decorative features | §10 | P18.4 | P18-AC8 | CI, REV | Done (P18, D6) |
| DES-10.9 | Mockup-only features kept apart from requirements | §10 | none | none | REV | Resolved (C9) |
| DES-11.1 | Brand work adds no features (online services, accounts, dashboards, analytics, notifications); playlist editing and Favorites only as required | §11 | P0.1 | P0-AC7 | REV | Resolved (C2) |
| DES-11.2 | Preserve the existing playback architecture | §11 | P0.16 | P0-AC1 | CI | Resolved (C1) |

---

## 3. `docs/claude-code-implementation-prompt.md`

| ID | Requirement | Source | Tasks | Criteria | Verify | Status |
|---|---|---|---|---|---|---|
| BRD-M1 | Use design.md, asset-manifest, tokens.json and the mockup | Mission | P0.6, P1.1, P2.10 | P0-AC3, P1-AC1 | REV | Done (P2) |
| BRD-M2 | Follow AGENTS.md and the repo structure; read the requirements in full | Mission | P0.1 | P0-AC7 | REV | Resolved (C1) |
| BRD-1.1 | Inspect README, requirements, AGENTS.md, source, UI, manifests, scripts, icon pipeline, docs, tests | Phase 1.1 | P0.17 | P0-AC7 | REV | Done (P0) |
| BRD-1.2 | Identify framework, wrapper, OS integration, styling, brand files, old names | Phase 1.2 | P0.4 | P0-AC1 | REV | Done (P0) |
| BRD-1.3 | Map package paths into the repo without duplication | Phase 1.3 | P1.4, P1.6 | P1-AC2, P1-AC6 | REV | Done (P1, C5) |
| BRD-1.4 | Check React and Tailwind compatibility for Magic UI | Phase 1.4 | P0.10 | P0-AC1 | REV | Done (P0, C8) |
| BRD-1.5 | Read the current Magic UI docs before using components | Phase 1.5 | P2.16 | P18-AC13 | REV | Planned (D6) |
| BRD-1.6 | Name risks; choose the smallest safe change set; ask only on destructive, licensing or architecture issues | Phase 1.6 | P0.1 | P0-AC7 | REV | Done (P0) |
| BRD-2.1 | Original SVG wordmark: red "Claw", steel "dio", bars in the "o" | Phase 2.1 | P1.1 | P1-AC4 | UT, REV | Done (P1) |
| BRD-2.2 | Original black cat head with narrow red eyes, ears, minimal whiskers | Phase 2.2 | P1.2 | P1-AC3 | MAN-L | Done (P1) |
| BRD-2.3 | Angular C, cat eye and equalizer secondary mark | Phase 2.3 | P1.3 | P1-AC1 | UT | Done (P1) |
| BRD-2.4 | Full-color, monochrome, PNG and launcher icons; check toolchain formats; test small sizes | Phase 2.4 | P1.4, P1.6, P1.7 | P1-AC2, P1-AC3 | CI, MAN-L | Done (P1, D9) |
| BRD-2.5 | No copies of third-party character art; flat SVG, no filters or raster | Phase 2.5 | P1.5 | P1-AC1, P1-AC7 | UT, REV | Done (P1) |
| BRD-3.1 | Tokens map to the styling system as semantic tokens; no scattered hex | Phase 3.1 | P0.6, P0.7, P0.14 | P0-AC6 | UT | Done (P0) |
| BRD-3.2 | Rename consistently in UI, metadata, READMEs and launchers; leave dependencies alone | Phase 3.2 | P0.4, P1.9, P18.1 | P18-AC11 | MAN-W, MAN-L | Planned |
| BRD-3.3 | Dark matte UI, restrained red, muted surfaces, legible type | Phase 3.3 | P0.7 | P0-AC5, P17-AC8 | UT, REV | Done (P17, D10) |
| BRD-3.4 | Style shell, library and album views, now playing, controls, dialogs, lyrics and art views | Phase 3.4 | P2.10, P6.4, P7.7, P10.3, P13.4 | P2-AC7, P17-AC1 | E2E | Done (P17) |
| BRD-3.5 | Keep navigation, keyboard access, focus, contrast, resizing and reduced motion | Phase 3.5 | P17.1, P17.2, P17.3, P17.4 | P17-AC1, P17-AC2, P17-AC3, P17-AC4 | E2E, MAN-L, MAN-W | Planned |
| BRD-3.6 | Minimal Magic UI subset only where it helps | Phase 3.6 | P2.16 | P18-AC13 | REV | Resolved (C8) |
| BRD-3.7 | Promo art, invented song data and reference-only menus are not requirements | Phase 3.7 | none | none | REV | Resolved (C9) |
| BRD-3.8 | No streaming, radio, podcasts, accounts or other new features | Phase 3.8 | P0.1 | P14-AC11 | REV | Non-goal |
| BRD-3.9 | Keep library parsing, playback, queues, lyrics, metadata, settings and portable offline use working | Phase 3.9 | P0.16 | P0-AC1 | CI | Resolved (C1) |
| BRD-4.1 | Run format, lint, typecheck, tests and builds | Phase 4.1 | P0.5, P0.16 | P0-AC1 | CI | Done (P0) |
| BRD-4.2 | Verify SVG syntax, exports, icon sizes and app metadata | Phase 4.2 | P1.5, P1.6, P18.1 | P1-AC1, P1-AC2, P18-AC11 | UT, CI | Planned |
| BRD-4.3 | Check normal and narrow windows, contrast, state and small-icon legibility | Phase 4.3 | P17.4, P1.7 | P17-AC4, P1-AC3 | MAN-L | Done (P17) |
| BRD-4.4 | Two-pass critical self-review; fix confirmed problems only | Phase 4.4 | P0.1 | P0-AC7 | REV | Done (P0) |
| BRD-4.5 | Validate Windows and Linux artifacts; report checks not performed | Phase 4.5 | P18.7 | P18-AC12 | MAN-W, MAN-L | Planned |
| BRD-4.6 | Update design.md only for justified implementation differences | Phase 4.6 | P17.9 | P17-AC7 | REV | Done (P17) |
| BRD-FD1 | Final summary: changes with paths | Final deliverable | P18.9 | P18-AC12 | REV | Done (P18) |
| BRD-FD2 | Final summary: assets and export sizes | Final deliverable | P18.9 | P18-AC12 | REV | Done (P18) |
| BRD-FD3 | Final summary: Magic UI components or the reason for none | Final deliverable | P18.9 | P18-AC13 | REV | Done (P18) |
| BRD-FD4 | Final summary: tests and builds run, with results | Final deliverable | P18.9 | P18-AC12 | REV | Done (P18) |
| BRD-FD5 | Final summary: limitations and unverified platform checks | Final deliverable | P18.9 | P18-AC12 | REV | Planned |
| BRD-FD6 | Final summary: deviations from the reference and why | Final deliverable | P18.9, P17.9 | P17-AC7 | REV | Done (P18) |
| BRD-X1 | Do not rewrite the player architecture for branding | Constraints | none | none | REV | Resolved (C1) |
| BRD-X2 | Do not claim tests that did not run | Constraints | P0.1 | P0-AC7 | REV | Done (P0) |
| BRD-X3 | Respect AGENTS.md | Constraints | P0.1 | P0-AC7 | REV | Done (P0) |
| BRD-X4 | No unnecessary libraries, animations or features | Constraints | P18.4 | P18-AC8 | REV | Done (P18, D6) |
| BRD-X5 | Commit or open PRs only when the workflow requires it | Constraints | P0.1 | P0-AC7 | REV | Done (P0, C15) |

---

## 4. `docs/asset-manifest.md`

| ID | Requirement | Source | Tasks | Criteria | Verify | Status |
|---|---|---|---|---|---|---|
| AST-0 | The mockup is a reference, not a finished logo | Intro | P1.1, P1.2 | P1-AC7 | REV | Done (P1, C9) |
| AST-S | Proposed structure, adapted to the repo | Structure | P1.4, P1.6 | P1-AC2 | REV | Done (P1, C5, C7) |
| AST-1 | Original wordmark SVG: red "Claw", steel "dio", bars in the "o" | Checklist | P1.1 | P1-AC4 | UT, REV | Done (P1) |
| AST-2 | Original red-eyed cat SVG, clear at 16 and 32 px | Checklist | P1.2, P1.7 | P1-AC3 | MAN-L | Done (P1) |
| AST-3 | Angular C, eye and bars monogram SVG | Checklist | P1.3 | P1-AC1 | UT | Done (P1) |
| AST-4 | Full-color and monochrome variants for dark and light backgrounds | Checklist | P1.4 | P1-AC1, P1-AC4 | UT, REV | Done (P1) |
| AST-5 | Vector masters have a viewBox and no embedded raster | Checklist | P1.5 | P1-AC1 | UT | Done (P1) |
| AST-6 | PNG icons 16 to 1024 px where packaging needs them | Checklist | P1.6 | P1-AC2 | CI | Done (P1, C5) |
| AST-7 | Multi-resolution Windows ICO and Linux launcher icon | Checklist | P1.6, P18.1 | P1-AC2, P18-AC11 | CI, MAN-L | Planned |
| AST-8 | README banner and social image only if helpful | Checklist | P1.9 | none | REV | Done (P1, D9) |
| AST-9 | App title, executable metadata, manifests and About show Clawdio | Checklist | P0.4, P4.10, P18.1 | P18-AC11 | MAN-W, MAN-L | Resolved (C6) |
| AST-10 | Icon works in the Windows taskbar and Linux launchers | Checklist | P18.1 | P18-AC11 | MAN-W, MAN-L | Planned |
| AST-11 | Fonts and illustrations compatible with open-source redistribution | Checklist | P0.9, P18.4 | P18-AC7 | REV | Done (P18, D7) |
| AST-12 | Missing-artwork placeholder with quiet branding | Checklist | P1.8, P10.3 | P10-AC4 | E2E | Done (P10) |
| AST-13 | Logo legible at real icon sizes | Checklist | P1.7 | P1-AC3 | MAN-L | Done (P1) |
| AST-14 | Test light backgrounds and high contrast | Checklist | P1.4, P17.6, P2.13 | P1-AC4, P17-AC6, P2-AC16 | REV, MAN-W | Planned |
| AST-15 | No copyrighted MAD or Inspector Gadget artwork | Checklist | P1.1, P1.2, P1.3 | P1-AC7 | REV | Done (P1) |
| AST-16 | Only assets the app needs; no animated mascot or wallpapers | Closing rule | P1.4 | P1-AC1 | REV | Done (P1, D6, D9) |

---

## 5. `theme/tokens.json`

Every token is read by `scripts/build-tokens.mjs` (P0.6). Section 6.12 of the plan gives the UI role of each token.

| ID | Token | Value | Tasks | Criteria | Verify | Status |
|---|---|---|---|---|---|---|
| TOK-1 | `colors.brand.red` | `#E10606` | P0.6, P2.10, P7.7 | P0-AC5, P2-AC7 | UT, E2E | Done (P7, D10) |
| TOK-2 | `colors.brand.steel` | `#4A4A4A` | P0.6, P1.4 | P1-AC4 | UT, REV | Done (P1, D10) |
| TOK-3 | `colors.bg.canvas` | `#0B0B0B` | P0.6, P0.7 | P0-AC2, P0-AC3 | MAN-L | Done (P0) |
| TOK-4 | `colors.bg.surface` | `#111111` | P0.6, P2.10 | P2-AC7 | E2E | Done (P2) |
| TOK-5 | `colors.bg.elevated` | `#171717` | P0.6, P2.10 | P2-AC7 | E2E | Done (P2) |
| TOK-6 | `colors.bg.hover` | `#1D1D1D` | P0.6, P2.10 | P2-AC7 | E2E | Done (P2) |
| TOK-7 | `colors.border.default` | `#292929` | P0.6, P2.10 | P2-AC7 | E2E | Done (P2) |
| TOK-8 | `colors.border.strong` | `#343434` | P0.6, P2.10 | P2-AC7 | E2E | Done (P2) |
| TOK-9 | `colors.text.primary` | `#EDEDED` | P0.6, P0.7 | P0-AC5 | UT | Done (P0) |
| TOK-10 | `colors.text.secondary` | `#B7B7B7` | P0.6 | P0-AC5 | UT | Done (P0) |
| TOK-11 | `colors.text.muted` | `#999999` | P0.6 | P0-AC4, P0-AC5 | UT | Done (P0) |
| TOK-12 | `colors.state.selected` | `#5B1010` | P0.6, P6.4 | P0-AC5 | UT, E2E | Planned |
| TOK-13 | `colors.state.redHover` | `#F01C1C` | P0.6 | P0-AC5 | UT | Done (P0, D10) |
| TOK-14 | `colors.state.redActive` | `#C40404` | P0.6, P0.7 | P0-AC5 | UT | Done (P0, D10) |
| TOK-15 | `radii.control` | `10px` | P0.6, P0.7 | P2-AC7 | E2E | Done (P2) |
| TOK-16 | `radii.card` | `12px` | P0.6 | P2-AC7 | E2E | Done (P2) |
| TOK-17 | `radii.dialog` | `16px` | P0.6 | P2-AC7 | E2E | Done (P2) |
| TOK-18 | `motion.fast` | `140ms` | P0.6, P0.7 | P2-AC13 | E2E | Done (P2) |
| TOK-19 | `motion.panel` | `200ms` | P0.6, P0.7 | P2-AC13 | E2E | Done (P2) |
| TOK-20 | `motion.reduced` | "honor system setting" | P0.6, P0.7 | P2-AC8, P17-AC3 | E2E, MAN-L | Planned |

---

## 6. `AGENTS.md`

| ID | Requirement | Source | Tasks | Criteria | Verify | Status |
|---|---|---|---|---|---|---|
| AGT-1 | Repository instructions for standards, architecture, workflow and conventions | Task brief, prompt mission | P0.1 | P0-AC7 | REV | Done (P0) |
| AGT-2 | TWO-PASS REVIEW procedure and the shared finding classification (now in `AGENTS.md`) | Task brief | P0.1 | P0-AC7 | REV | Done (P0) |
| AGT-3 | Mock data only in tests (Edits rule 9); the Milestone 0 `fixtures` feature is an approved exception | Edits rule 9 | P0.1, P2.15, P3.1, P6.7 | P0-AC7, P2-AC19, P6-AC8 | REV, E2E | Resolved (C19) |

---

## 7. Supporting tasks

These tasks have no single source requirement. They exist so that other rows can be built and verified. They are listed so that every plan task traces somewhere.

| Task | Purpose | Supports |
|---|---|---|
| P0.0 | Install native build packages and Playwright browsers | Every CI and local validation row |
| P0.12 | Security baseline: CSP and minimal capabilities (D13, D48) | CON-11, DES-9.1 |
| P2-AC18 | Confirms that the CSP raises no violation in the e2e run | CON-11 |
| P2.15 | Playwright and mocked IPC infrastructure | Every E2E row |
| P6.7 | Remove Milestone 0 fixture code (D35) | CON-1 (no dead spike code) |
| P6-AC8 | Confirms P6.7 | CON-1 |

## 8. Open items that need outside input

These are not gaps in the plan. Each has a task, a criterion and a path to closure. Closed questions leave this table. Their answers stay in section 5.3 of the plan.

| Item | Rows | What is needed | Owner of the next step |
|---|---|---|---|
| B2 Milestone 0 gate | R20-5, R20-6, AC-1, VER-3 | P3 measurements on Windows and Linux | Agent runs P3; over 300 MB raises the target (D49) |
| B3 Playlist path base | R13-3, AC-3, VER-1 | VLC and MusicBee interop result | Agent runs P11.9; the owner decides if a player fails |
| B4, Q5 Real exports | R14-12, AC-4, VER-2 | The owner's exports for the formats they have (Apple XML, MusicBee M3U8, legacy `.m3u`). Missing formats stay "not verified". | Owner supplies files at P12 |
| B5 Test machines | All MAN-W and MAN-L rows | The owner has a Windows 10 or 11 machine only. MAN-L rows stay "not verified" and P18 records them as exceptions. | Owner runs the MAN-W checks by P18 |
| K21 Microphone API | R34-2, VER-4, AC-23, AC-24 | P20.0 spike result on Windows with Handy and one call app | Closed October 12, 2026 (D54) |
| Real playlists | AC-22 | The owner's playlist folder for the P19-AC8 manual check. The files are never committed. | Owner runs P19-AC8 on Windows |
