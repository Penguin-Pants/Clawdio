# Requirements Review: Minimalist Music Player

**Reviewed document:** `MusicPlayer_REQUIREMENTS.md`, version 1.3 (October 11, 2026). A verbatim copy of the reviewed version is at `docs/MusicPlayer_REQUIREMENTS.md`.
**Review date:** October 11, 2026
**Scope:** Review only. No code. No edits to the requirements document.

## How to read this review

- Each finding names the requirement (R1 to R31) or section (1 to 9) it applies to.
- **Verified** means the claim was checked against the official source on the review date. **Assumed** means the source was not reachable from the review environment. Assumptions are marked.
- **Priority:** Critical blocks implementation. High changes scope, cost or feasibility. Medium changes behavior that users will notice. Low is wording.
- **Effort:** S is hours. M is days. L is weeks. One developer.
- **Owner decision** marks a recommendation that reverses a decision the owner made in 1.1 or 1.2. The recommendation stands. The owner decides.

## Sources checked

| Source | Status | What it confirmed |
|---|---|---|
| Tauri v2 docs (Windows installer, prerequisites, AppImage) | Verified | WebView2 install modes and sizes. Per-user NSIS install needs no admin. No portable mode documented. AppImage is 70 MB or more and runs without installation. |
| Dockview repository and package metadata | Verified | Core, floating groups, popout and React bindings are MIT (dockview-react 8.5.1). `dockview-enterprise` is commercial. Options `disableFloatingGroups`, `disableDnd`, `locked`, `singleTabMode` exist. No option disables tab grouping. |
| Magic UI repository and registry | Verified | MIT. The registry lists more than 50 animated and decorative components. More than 25 depend on `motion`. |
| DESIGN.md spec and README | Verified | Version `alpha`. Front matter keys: colors, typography, rounded, spacing, components. Duplicate headings reject the file. CLI `@google/design.md` exports `css-tailwind` (Tailwind v4). Spec, schema and CLI are "under active development". |
| souvlaki source | Verified | Windows, Linux (MPRIS), macOS. Needs an HWND on Windows. Reports position, cover URL and duration. |
| Symphonia README | Verified | MP3, Vorbis and WAV PCM are "Excellent". MP3 needs the non-default `mp3` feature. License MPL-2.0. |
| lofty README and item keys | Verified | MP3 (ID3v2), Ogg Vorbis (Vorbis comments), WAV (ID3v2 and RIFF INFO). Maps USLT, LYRICS and UNSYNCEDLYRICS, TPOS disc number. MIT or Apache-2.0. |
| rodio source (master) | Verified | Default decoder is Symphonia. Playback uses cpal. The core is being rewritten (`Sink` is now `Player` on master). Seek exists with limits. |
| cpal error types | Verified | `DeviceNotAvailable` on disconnect. `DeviceChanged` only for default-device streams on backends that support following. |
| tauri-plugin-single-instance | Verified | Windows, Linux, macOS. |
| MusicBrainz rate limiting | Verified (search snippets of the official page) | One request per second per IP. User-Agent required. 503, then IP block. |
| Cover Art Archive | Partly verified | Thumbnail sizes 250, 500 and 1200 and the 307 redirect are verified. The release-group route is assumed. |
| lrclib API docs | Assumed | Site not reachable. R9 parameters stand as assumptions. |

---

## A. Executive summary

**Overall assessment.** The document is detailed, mostly testable and consistent on library, playback and playlists. It is too large for the owner's own constraints: "massively simpler", "few features" and one maintainer. About half of the specified behavior is UI chrome (docking, named layouts, a runtime theme engine) and import or online features. The core player (R1 to R6, R24 to R27, R12, R13, R26) is sound and should stay.

**Biggest gaps.**
- No portable distribution. R21 ships installers only. R18, R23, R27 and R29 put all per-machine data in OS directories. This conflicts with the "portable, no installation" principle.
- No first-run flow when no music folder is set. No behavior for a decode error during playback.
- Undefined behavior that users hit daily: artist and album sort order, multi-disc track order, shuffle, repeat one, end of queue and Previous.
- Embedded lyrics (ID3 USLT, Vorbis LYRICS) are not read. The owner's brief prefers embedded and local lyrics.
- "Online lookups" are on by default and write files into the library on first run. This conflicts with "local-first".

**Main sources of unnecessary complexity.**
1. Runtime DESIGN.md theme engine on an alpha spec (R16, R17): parser, validator, contrast check, file watcher, reset shortcut, docs, three edge cases, one acceptance check.
2. Metadata fill with sidecars (R10, R11): MusicBrainz track matching, preview dialog, sidecar schema and docs. It fills "year", which no widget shows.
3. Six playlist import formats (R14) with three encodings and four matching passes.
4. Magic UI plus Motion (R30): the document's own rule ("only components with a function") selects close to zero components, so Motion is a dependency for nothing.
5. Named layouts and the "no tabs" rule (R29, section 6): file management, versioning, confirmations and code to forbid a library feature that is free.

**Top simplification opportunities.** Defer R16 and keep the build-time brand theme. Defer R10. Cut R14 to M3U, M3U8 and Apple XML. Drop Motion unless a Magic UI component is named. Defer named layouts and the no-tabs rule. Move Search into the Library header. Together these remove about a third of the specified behavior and most of the alpha-spec maintenance risk.

**Technical feasibility concerns.**
- Windows: a single executable, no external runtime and under 30 MB cannot all hold. WebView2 is an external runtime. Bundling a fixed version adds about 180 MB. Accept WebView2 as a prerequisite (preinstalled on Windows 10 from 1803 and on Windows 11).
- Memory: 200 MB idle across all processes with WebView2 and React is at risk. The Milestone 0 gate is the right control. Keep it.
- rodio is mid-rewrite. Pin the version.
- The "device unplugged, pause and resume" edge case depends on backend support. Soften it to "stop with a message".
- lrclib parameters could not be verified from this environment.

---

## B. Findings table

| Priority | Requirement / section | Finding | Evidence | Recommendation | Effort |
|---|---|---|---|---|---|
| High | R21, R18, R23, R27, R29 | No portable build. All per-machine data lives in OS directories. Moving the app loses settings, layouts, queue and cache. | R21 lists installer, .deb and AppImage only. R18: "OS config directory". Tauri docs (verified) document NSIS and MSI only and no portable mode. The bare `.exe` from `tauri build` runs without an installer when WebView2 is present. | **Add:** a Windows portable zip of the bare executable. **Add:** a portable mode (marker file next to the executable; data folder next to it). | S (zip) + M (portable mode) |
| High | R22, R20 | WebView2 is an external runtime. The document does not state it as a prerequisite. A bundled fixed runtime breaks the 30 MB target. | Tauri docs (verified): WebView2 "is already installed on Windows 10 (from version 1803 onward)". `fixedRuntime` adds about 180 MB. `offlineInstaller` adds about 127 MB. | **Clarify:** state WebView2 as a prerequisite. Keep `downloadBootstrapper` in the installer. The portable build must show an error with a download link when WebView2 is missing. | S |
| High | R30, acceptance check 16 | The rule "only components that serve a function in R5, R6 and R29" selects close to zero Magic UI components. Motion then ships for nothing. Check 16 becomes vacuous. | Magic UI registry (verified): components are marquee, meteors, shimmer-button, confetti, globe, particles and similar. Candidates with a function (`dock`, `animated-list`, `file-tree`) are demo widgets and are not virtualized. | **Clarify:** the owner names the components. If the list is empty, remove Motion from the stack and from Milestone 0. shadcn/ui and Tailwind stay. | S |
| High | R16, R17, section 5, check 7 | Runtime theme loading from an alpha spec is high cost and low value for a personal player. R31 already compiles the brand DESIGN.md at build time. | DESIGN.md README (verified): "spec, token schema, and CLI are under active development". R16 needs a parser, type validation, contrast check, file watcher, reset shortcut and docs. | **Defer** the user-selected theme. Keep the build-time brand theme (R31). If kept, remove the contrast check (Reset theme already prevents lockout) and the file watcher. | Saves M to L |
| High | R10, R11, R17 | Metadata fill has low visible value. It fills title, track number and year. R4 already derives title and track number from file names. No widget shows year. | R5 Now playing: art, title, artist, album. Library: artist, album, song. "Year" appears nowhere in R5 or R28. | **Defer** R10 (owner decision). Keep a minimal album sidecar only for the R8 "no match" marker. | Saves L |
| High | R14, check 4 | Six formats, three encodings and four matching passes for a one-time migration. | R14 lists M3U, M3U8, PLS, XSPF, Apple XML and Apple text. UTF-16 detection and a tab-delimited parser exist only for Apple text. Apple XML carries the same data. | **Simplify** to M3U, M3U8 and Apple XML (owner decision). Defer PLS, XSPF and Apple text. | Saves M |
| High | R7, R8 | Online lookups are on by default. On first run the app contacts MusicBrainz and writes `cover.jpg` into the library for every album without art. This conflicts with "local-first" and "minimal configuration". | R7: "On by default." R8: "Artwork fetches automatically in the background." | **Simplify:** default off. Turn the first-run notice into a choice ("Turn on" or "Keep off"). Automatic fetch stays once the switch is on. (Owner decision.) | S |
| Medium | R4, R3 | Multi-disc albums play out of order. Deeper folders fold into the album, and track numbers restart on each disc. Sorting by track number then file name interleaves discs. | R3: "Deeper folders (for example Disc 1) fold into the album." R4: "Songs sort by track number, then file name." | **Add:** sort by disc order (the disc tag, else the sub-folder order), then track number, then file name. | S |
| Medium | R3, R28 | Artist and album sort order is undefined. Placement of "Unknown Artist" and "Unknown Album" is undefined. | No sort rule exists for artists or albums. | **Add:** sort by folder name, ignore case and accents, natural numeric order. Unknown groups sort last. | S |
| Medium | R6 | Shuffle, repeat one, end of queue and Previous are undefined. Double-click replacing a user-built queue is implied, not stated. | R6: "Shuffle applies to the queue." No rule for what plays after the last entry. | **Clarify** with the wording in section G. | S |
| Medium | R1, section 5 | No first-run state. The document covers "folder missing" but not "no folder set yet". | Section 5 starts at "Music folder missing at startup". | **Add:** first-run prompt and empty state. | S |
| Medium | R6, section 5 | No behavior for a decode error during playback. A corrupt file that passed the scan stops the queue. | Section 5 covers corrupt files at scan time only. Scan reads tags, not audio. | **Add:** skip with a status message. Stop after three consecutive failures. | S |
| Medium | Section 5, check 10 | "Audio device unplugged: pause, show a message, resume on the default device" depends on the backend. | cpal (verified): `DeviceChanged` applies "only to streams built from the default device, on backends that support following it". Otherwise `DeviceNotAvailable`. | **Simplify:** on an output stream error, stop, show a message and open the current default device on the next Play. Reword check 10. | S |
| Medium | Section 6, R29 | "Turn off tabs" needs custom code to reject drops. Allowing tabs costs nothing. | Dockview options (verified): `disableFloatingGroups` exists. No option disables tab grouping. Popout happens only through an API call. | **Simplify:** "not required and not tested", not "prevented". | Saves S |
| Medium | R29 | Named layouts add file management, versioning, rename, delete, overwrite confirmation and three edge cases. Three built-in layouts plus auto-save cover the stated outcome for one user. | R29 bullets 5 to 8. Check 12. | **Defer** named layouts (owner decision). Keep built-ins, show/hide and auto-save. | Saves M |
| Medium | R5, R25 | Search as a separate dockable widget adds a widget, a "show if hidden" rule and an edge case. | R5: "Search: movable and hideable." Section 5: "Controls or Search hidden". | **Simplify:** a search field in the Library widget header. Ctrl+F focuses it. | Saves S |
| Medium | R2 | The scan has no rule for hidden folders, symbolic links or junctions. A link loop hangs the scan. | R2 defines incremental keys only. | **Add:** skip names that start with "."; do not follow links to folders. | S |
| Medium | R9 | Embedded lyrics are not read. | R9 reads `.lrc` and `.txt` only. lofty (verified) maps USLT, LYRICS and UNSYNCEDLYRICS. | **Add:** embedded lyrics after local files and before "Fetch lyrics". | S |
| Medium | R19, R27 | Cache and state key on absolute paths. A drive letter change or a folder move drops the queue and forces a full rescan. | R2: "incremental (path, size, modified time)". R27 drops missing entries silently. | **Clarify:** store paths relative to the music folder root in cache and state. | S |
| Medium | Section 6 (audio engine) | rodio is mid-rewrite. An unpinned dependency breaks the build. | rodio README (verified): "The current state should be working but under documented." Master renames `Sink` to `Player`. | **Clarify:** pin rodio, Symphonia (with the `mp3` feature) and lofty. | S |
| Low | Section 1 vs R18, R29 | "The music folder holds all user data" is false. Settings, layouts, state and logs live elsewhere. | R18, R23, R27, R29. | **Clarify:** "all music-related user data". | S |
| Low | Section 8 vs R13, R14, R20 | "Open questions: None" while three items say "the owner decides" or "assumption to verify". | R13 bullet 3, R14 last bullet, R20 last bullet. | **Clarify:** list them in section 8. | S |
| Low | R29 | "Layouts cannot hide either" is ambiguous. "They are versioned" has no behavior. | R29 bullets 6 and 8. | **Clarify:** "No layout can hide the menu button or the status line." "Unknown version: ignore and log." | S |
| Low | R8 | No rule for "Unknown Artist" or "Unknown Album" groups, or albums with no album folder to write `cover.jpg` into. | R3 and R8. | **Add:** never look up unknown groups. | S |
| Low | R9, R10 | File naming is not stated. Lyrics "next to the song" has no base-name rule. The sidecar has no file name. `.lrc` versus `.txt` precedence is not stated. | R9, R10, R17. | **Clarify** names and precedence. | S |
| Low | R7 | "Off means zero network calls" is not fully in the app's control. The WebView2 runtime updates itself. | WebView2 is an OS component. | **Clarify:** "zero network calls by the app's own code". | S |
| Low | Check 2 | "The UI stays responsive" is not testable. | Section 9, check 2. | **Clarify** with a measurable condition. | S |
| Medium | Section 6 (license), R21 | Symphonia is MPL-2.0, not MIT. The AppImage bundles WebKitGTK and GTK (LGPL), so a release must ship the license texts and state where the corresponding source of the bundled libraries is available. A NOTICE entry alone is not enough. | Symphonia README (verified). Tauri AppImage docs (verified): the AppImage "bundles all dependencies and files needed by the application". | **Clarify:** both licenses are compatible with an MIT app. Add a release license plan (section E, item 13). | S |
| Low | R24 | No fail-soft rule when OS media controls cannot register (no D-Bus session on Linux). | souvlaki (verified) needs `dbus_name` on Linux and an HWND on Windows. | **Add:** log and continue. | S |
| Low | R12 | Duplicate entries in playlists are undefined. | R12. | **Clarify:** duplicates allowed; Favorites toggles. | S |

---

## C. Missing essential functionality

**Essential** (ordinary use is unreliable without it):

1. **First-run state.** The app must work from an empty configuration. Without a stated prompt, the first screen is undefined.
2. **Decode error during playback.** The scan reads tags, not audio. A file that fails to decode mid-queue must not stop playback silently.
3. **Sort order for artists and albums, and multi-disc track order.** Every library view depends on them. The current rule interleaves discs.
4. **Defined shuffle, repeat one, end of queue and Previous.** These are the controls in R6. Their behavior must be testable.

**Useful** (clear value, small cost):

5. **Embedded lyrics.** Many files carry USLT or LYRICS tags. lofty reads them. This also matches the owner's brief.
6. **Delete key** removes the selected entry from the Play queue or a playlist.
7. **Previous restarts the current song** after 3 seconds. This is the behavior users expect from every player.
8. **Hidden folders and links** are skipped in the scan. Synology, Syncthing and dot-folders are common in music libraries.
9. **Relative paths in cache and state.** A moved folder keeps its queue and avoids a full rescan.

**Optional** (defer):

10. Keyboard seek and volume (Ctrl+Left, Ctrl+Right, Ctrl+Up, Ctrl+Down). Media keys and the transport widget cover the need.
11. Mute.
12. Drag reorder of the Play queue.
13. Playlist rename (already deferred; it is a file rename).

**Out of scope** (do not add):

- "Play next", drag and drop from the OS, year display, column sorting, multiple folders, ratings, play counts, smart playlists, crossfade, equalizer.

---

## D. Simplification and removal candidates

| Item | Action | Complexity saved | Functionality lost |
|---|---|---|---|
| R16 runtime theme + R17 token docs + section 5 theme cases + check 7 | Defer | L. Parser, type validation, contrast check, file watcher, reset shortcut, docs, 3 edge cases, 1 check. Removes the alpha-spec runtime risk. | The user cannot switch themes in Settings. The brand theme still comes from one DESIGN.md at build time. |
| R10 metadata fill + full sidecar schema | Defer (owner decision) | L. MusicBrainz track matching, preview dialog, schema, docs, orphan and corrupt rules. | Better titles and track numbers for untagged files with poor file names. Year (not shown anywhere). |
| R14 PLS, XSPF, Apple text | Defer (owner decision) | M. Three parsers, UTF-16 detection, tab-delimited header parsing. | Direct import of those files. Workaround: export M3U8 from MusicBee or VLC. |
| R30 Motion and Magic UI | Remove unless a component is named | S to M. One dependency, reduce-motion handling, check 16. | None that R5, R6 or R29 needs. |
| R29 named layouts (save, rename, delete, overwrite confirm, JSON versioning) | Defer (owner decision) | M. Layout file management, 3 edge cases, check 12. | More than one saved arrangement per machine. Built-ins and auto-save stay. |
| Section 6 "turn off tabs" | Reword to "not required, not tested" | S. Drop filtering code. | Nothing. |
| R5 Search widget | Merge into the Library header | S. One widget, one show-if-hidden rule, one edge case. | Placing search away from the Library. |
| R16 contrast check (if R16 stays) | Remove | S. | Nothing. Reset theme covers lockout. |
| R2 scan report screen in Settings | Simplify to counts plus "Open log folder" | S. | A per-file list in the UI. The log keeps it. |
| R5 status line "pause" for lookups | Remove; keep cancel | S. | Pausing a fetch. Cancel plus Retry covers it. |
| R31 brand UI icon set override by name | Defer | S. | Custom UI icons. Lucide stays. The app icon still comes from `brand/`. |

---

## E. Technical decisions and trade-offs

Resolve these before Milestone 0.

1. **Windows distribution.** Recommended: per-user NSIS installer (no admin, `downloadBootstrapper`) plus a portable zip of the bare executable. Do not bundle a fixed WebView2 runtime (about 180 MB). State WebView2 as a prerequisite. Trade-off: a machine without WebView2 needs a one-time download.
2. **Three portability properties.** They are different. (a) Single file: Windows bare `.exe` and Linux AppImage. (b) Data travels with the app: needs portable mode (marker file, data folder next to the executable, WebView profile folder next to it, music folder path relative to the executable when on the same volume). (c) No installation: the bare `.exe` and the AppImage. The `.deb` is an installation. Recommended: deliver all three on Windows, (a) and (c) on Linux via AppImage.
3. **Linux packaging.** AppImage first (no install, bundles WebKitGTK, 70 MB or more, exempt from the size target). `.deb` second. Note: AppImage needs FUSE 2 or 3 on the host or the `--appimage-extract-and-run` fallback.
4. **Audio stack.** Recommended: rodio pinned to a release, Symphonia with the `mp3` feature, cpal output. Alternative: Symphonia plus cpal directly, which gives control for gapless later but is custom audio code. Pick rodio now. Revisit at rodio 1.0.
5. **Tag reading.** Recommended: lofty, not Symphonia's metadata readers. It covers ID3v2, Vorbis comments, RIFF INFO, pictures, lyrics and duration in one crate.
6. **Docking.** Dockview MIT core with `disableFloatingGroups: true`, `singleTabMode: 'fullwidth'` and no popout calls. Allow tab groups. Do not use `dockview-enterprise`.
7. **UI stack.** React, Tailwind CSS v4, shadcn/ui. Magic UI only by named component. Motion only if such a component needs it.
8. **Theme.** Build-time compile of `brand/DESIGN.md` with the official CLI (`export css-tailwind`). Runtime theme deferred.
9. **Online lookups default.** Off, with a first-run choice.
10. **Playlist import formats.** M3U, M3U8, Apple XML.
11. **Paths.** Relative to the music folder root in cache and state. Relative to the playlist file in playlists, as R13 requires and as M3U players expect. Forward slashes in files.
12. **Device change.** Stop on stream error. Open the current default device on the next Play.
13. **License.** MIT application. Symphonia is MPL-2.0: ship its license text and keep any modified Symphonia source available under the MPL. The AppImage bundles WebKitGTK and GTK, which are LGPL: ship their license texts inside the AppImage and in the repo, and publish where the corresponding source of the bundled versions is available (the base distribution's source packages for those exact versions) or an equivalent written offer. The `.deb` and the Windows builds do not bundle them, so only the notices apply there.

---

## F. Recommended scope

**v1 (minimal, complete):**

- **Library:** one folder, mp3, ogg (Vorbis), wav. Folder grouping (R3). Incremental non-blocking scan, 50,000 tracks, Rescan, counts in Settings, log. Skip hidden names and links. Defined sort order and multi-disc order. First-run prompt.
- **Playback:** play/pause, stop, previous, next, seek with elapsed and total time, volume, shuffle, repeat (off, all, one), play queue (add, remove, clear). Defined semantics. Decode error skip.
- **Library widget:** Tree, Columns, Top/bottom with the header switch. Search field in the header.
- **Widgets and layout:** Now playing, Transport, Playlists, Play queue, Lyrics. Drag docking, resize, show and hide. Three built-in layouts. Auto-save and restore. Reset layout. Status line and menu button.
- **OS integration:** media keys, now-playing metadata, single instance, close quits.
- **Keyboard:** R25 plus Delete.
- **Playlists:** M3U8 in `Playlists/`, create, add, remove, delete, Favorites. Import M3U, M3U8 and Apple XML with a report.
- **Artwork:** cover file, embedded art, Set cover. Fetch (opt-in) with Retry lookup and a "no match" marker.
- **Lyrics:** `.lrc`, `.txt`, embedded, Fetch lyrics (opt-in).
- **Theme:** brand DESIGN.md at build time. Reduce-motion honored.
- **State:** settings, queue, position, volume, window size. Portable mode.
- **Distribution:** Windows installer, Windows portable zip, AppImage, `.deb`. Logging with rotation.
- **Gate:** Milestone 0 footprint spike.

**Defer or exclude:**

- R10 metadata fill and the full sidecar schema.
- R16 user-selected theme and R17 token docs.
- PLS, XSPF and Apple text import.
- Named layouts (owner decision).
- Magic UI and Motion unless a component is named.
- Brand UI icon override. Status line pause.
- Everything already in section 7 (gapless, synced highlighting, ReplayGain, equalizer, custom shortcuts, keyboard widget moves, layout import and export, tabbed groups, floating panels, pop-out, playlist rename and reorder, bundled themes, components tokens, multiple folders).
- Keyboard seek and volume, mute, queue drag reorder.

---

## G. Requirements document changes

Wording is ready to insert. "Must" marks a requirement.

### Section 1. Problem and desired outcome

- **Rewrite** bullet 7: "The music folder holds all music-related user data: playlists, Favorites, artwork, lyrics and sidecars. Per-machine settings, layouts, playback state, cache and logs live in the OS config directory, or next to the executable in portable mode (R18)."
- **Rewrite** bullet 3 (if named layouts are deferred): "The UI is made of widgets. The user docks, resizes, hides and shows them. Three built-in layouts exist."

### Section 2. Library

- **Add R1.1.** "First run: if no music folder is set, the main area shows a 'Choose music folder' button. Other widgets show their empty hints. Transport controls are disabled until a folder is set."
- **Add to R2.** "The scan skips files and folders whose names start with '.'. The scan does not follow symbolic links or junctions to folders. If a scan is running, Rescan does nothing."
- **Add to R2.** "If the root folder is readable and empty, the scan removes all tracks. This is accepted. Playlists and Favorites are files and are not affected."
- **Rewrite R2 report.** "The status line shows counts (added, removed, skipped) when a scan ends. Settings shows the last counts and an 'Open log folder' button. The log holds the per-file reasons."
- **Add to R3.** "Display names are folder names, unchanged. Artist and album lists sort by folder name. The sort ignores case and accents and uses natural numeric order (2 before 10). 'Unknown Artist' and 'Unknown Album' sort last."
- **Rewrite R4 prefix rule.** "A track-number prefix is: one to three digits, then an optional group of a separator ('-' or '.') and one to three more digits, then one or more of space, '.', '-' or '_'. Examples: '01 - ', '01. ', '1-01 ', '001_'."
- **Rewrite R4 order.** "Songs in an album sort by: (1) disc order, (2) the track number, (3) the file name. Disc order is the disc number tag when present. Otherwise it is the position of the song's sub-folder in a natural-order sort of the album's sub-folders. Files directly in the album folder sort as disc 0. Comparison ignores case."

### Section 2. Widgets and layout

- **Rewrite R5 Search.** "Search: a text field in the Library widget header. It is not a separate widget." Remove "Search" from the hideable list and from the section 5 "Controls or Search hidden" case.
- **Add to R5 Transport.** "The transport widget shows elapsed time and total time next to the seek bar."
- **Clarify R5 album art.** "Album art shows in the Now playing widget and as a thumbnail in Album rows. Thumbnails are stored in the cache (R19)."
- **Rewrite R29 bullet 6.** "No layout can hide the menu button or the status line."
- **Rewrite R29 bullet 8.** "A layout file with an unknown version is ignored and logged, like a corrupt file."
- **If named layouts are deferred, remove** R29 bullets 5 and 6 (user-saved layouts and layout files) and acceptance check 12. Keep auto-save of the current arrangement.
- **Rewrite R30.** "UI: React, Tailwind CSS v4 and shadcn/ui. Magic UI components may be copied in only when a named component serves R5, R6 or R29. The docs list the copied components. If the list is empty, Motion is not a dependency and Milestone 0 does not include it."
- **Rewrite check 16.** "Applies only if the Magic UI component list is not empty."

### Section 2. Playback

- **Add to R6.** "Play (context menu) and double-click replace the queue with the list the song appears in and start at that song. Add to queue appends to the end and does not change the playing song."
- **Add to R6.** "Repeat off: playback stops after the last queue entry; the position shows the start of the last song. Repeat all: after the last entry, playback continues from the first. Repeat one: the current song restarts when it ends. Next and Previous still move through the queue."
- **Add to R6.** "Shuffle on: the app plays the remaining entries in random order. Each entry plays once before any entry repeats. The queue display keeps its order. Shuffle off: playback continues in queue order from the current song."
- **Add to R6.** "Previous: if the position is more than 3 seconds, Previous restarts the current song. Otherwise it goes to the previous entry in play order. With shuffle on, the previous entry is the last song played in this shuffle run. With no previous entry, Previous restarts the current song."
- **Add to R6.** "Decode error: the app logs it, shows 'Cannot play <file name>' in the status line and continues with the next entry. After three consecutive failures, playback stops."
- **Add to R6 search.** "In Tree mode the tree shows artists and albums that contain a match, and the matching songs. A match on an artist or album name shows all of its songs."
- **Add to R24.** "The app accepts play, pause, toggle, next, previous and stop from the OS. If OS media controls cannot register, the app logs it and continues."
- **Add to R25.** "Delete removes the selected entry from the Play queue or from a playlist, without confirmation."
- **Rewrite R25 Ctrl+F.** "Ctrl+F focuses the search field in the Library header."
- **Add to R27.** "State stores paths relative to the music folder root. The music folder path is stored as set, except in portable mode (R18)."

### Section 2. Online and sidecars

- **Rewrite R7.** "One 'Online lookups' switch in Settings. Off by default. Off means the app's own code makes zero network calls. The first run shows a notice that explains sidecar files and names the services. It offers 'Turn on' and 'Keep off'."
- **Add to R8.** "The app never looks up 'Unknown Artist' or 'Unknown Album' groups, or an album whose songs are directly in the artist folder. It queries a MusicBrainz release group by artist and album and requests the Cover Art Archive front image at 500 px."
- **Add to R9.** "Lyrics sources in order: a `.lrc` file with the song's base name next to the song, then a `.txt` file with the same base name, then embedded lyrics (ID3v2 USLT, Vorbis comment LYRICS or UNSYNCEDLYRICS). The Fetch lyrics button shows only when none exists."
- **Rewrite R10 (recommended).** "R10 (deferred). Metadata fill is deferred. The album sidecar `sidecar.json` holds only the artwork lookup marker (R8)." Update R11 and R17 to match.
- **If R10 stays, add.** "The sidecar file name is `sidecar.json` in the album folder."

### Section 2. Playlists

- **Add to R12.** "Add to playlist appends the song. Duplicates are allowed. Favorites is the exception: the heart toggles membership."
- **Add to R13.** "The app lists `.m3u8` files it finds. Entries resolve relative to the playlist file. Other playlist files (`.m3u`, `.pls`) are not listed; use Import."
- **Rewrite R14 (recommended).** "Import M3U, M3U8 and Apple XML. PLS, XSPF and Apple text are deferred." Remove the Apple text encoding bullet. Update acceptance check 4 to "one Apple XML, one MusicBee M3U8 and one legacy `.m3u`".

### Section 2. Theme

- **Rewrite R16 (recommended).** "R16 (deferred). The v1 theme is `brand/DESIGN.md`, compiled at build time (R31). A user-selected theme file is deferred." Remove the three theme edge cases in section 5 and acceptance check 7. Keep "Reduce motion" (R30).
- **If R16 stays:** remove the contrast-ratio bullet and the "reloads on file change" sentence. Add "Settings has a 'Reload theme' button."
- **Rewrite R17.** "Docs describe the layout file schema (R29), the sidecar marker (R8) and the `brand/` folder (R31)."

### Section 2. State, footprint and release

- **Add R18.1 Portable mode.** "If a file named `portable` exists next to the executable, the app stores settings, layouts, playback state, cache, logs and the WebView profile in a `data` folder next to the executable. The music folder path is stored relative to the executable's folder when both are on the same volume, else absolute."
- **Add to R19.** "The cache stores paths relative to the music folder root. Thumbnails live in the cache directory."
- **Rewrite R21.** "Distribution: Windows per-user installer (no admin), Windows portable zip (the bare executable), Linux AppImage and `.deb`. Build the AppImage on the oldest supported base system."
- **Add to R22.** "Windows: the WebView2 Runtime must be present. It ships with Windows 10 from version 1803 and with Windows 11. The installer downloads it if missing. The portable build must show an error with a download link if it is missing."

### Section 5. Edge cases

- **Add.** "No music folder set: R1.1 applies."
- **Add.** "Music folder changed in Settings: the app stops playback, resets the position, clears the queue, rescans and reloads playlists from the new folder."
- **Rewrite** "Audio device unplugged": "On an output stream error, the app stops playback and shows a message. The next Play opens the current default device."
- **Rewrite** "Read-only music folder": "Fetch features, playlist edits and Favorites show an error. Playback and browsing work."
- **Add.** "File name that is not valid UTF-8 (Linux): skip it and log it."
- **Add.** "Decode error during playback: R6 applies."
- **Remove** "Controls or Search hidden" and the three theme cases if the related changes above are accepted.

### Section 6. Confirmed constraints

- **Rewrite Docking.** "Dockview (MIT core) with React bindings. `disableFloatingGroups` on. No popout calls. Tabbed groups are not required and not tested in v1; the app adds no code to prevent them. Do not use `dockview-enterprise`."
- **Rewrite Audio engine.** "rodio pinned to a release, Symphonia with the `mp3` feature, lofty for tags. Decode the next track ahead of time so gapless can be added later."
- **Rewrite License.** "MIT application. Symphonia is MPL-2.0. The AppImage bundles WebKitGTK and GTK (LGPL). Each release ships the license texts of bundled and linked third-party components and states where the corresponding source of bundled LGPL libraries is available. The repo keeps this list in a NOTICE file."
- **Rewrite Stack** to match R30 (Motion only by named component).

### Section 8. Open questions

- **Replace "None" with:** (1) R13 path base after the interop test. (2) R14 MusicBee export format. (3) R20 Milestone 0 outcome. (4) Owner decisions from this review: R7 default, R10 defer, R14 formats, R16 defer, R29 named layouts, R30 Motion.

### Section 9. Acceptance checks

- **Rewrite check 2.** "During the first scan of the 50,000-track test library, the user can select and play an already-scanned song, and the window redraws within 100 ms of input."
- **Rewrite check 10.** "Unplugging the output device mid-song stops playback with a message. Play resumes on the default device."
- **Add check 17.** "Portable mode: after use, copy the whole portable folder (executable, `portable` marker and `data` folder) and the music folder to another drive letter. Start it. Settings, layouts and the queue survive."
- **Add check 18.** "A two-disc album plays disc 1 then disc 2 in track order."
- **Add check 19.** "A corrupt file in the queue is skipped with a status message. Playback continues."
- **Add check 20.** "First run shows the folder prompt. After choosing a folder, the user can play a song before the scan ends."
- **Add check 21.** "A song with ID3 USLT lyrics and no lyric file shows the embedded lyrics."
- **Remove** checks 7 and 12 if R16 and named layouts are deferred. Make check 16 conditional (see R30).

---

## H. Addendum: branding package on `main`

While this review was in progress, `main` received a branding package (commit "Add files via upload"): `docs/design.md`, `docs/asset-manifest.md`, `docs/claude-code-implementation-prompt.md`, `theme/tokens.json` and `assets/reference/clawdio-approved-mockup.png`. It changes the R16, R30 and R31 findings and adds a shell decision. The requirements document still says in R31 that the package "will be supplied later". It is here now.

| Priority | Requirement / source | Finding | Evidence | Recommendation | Effort |
|---|---|---|---|---|---|
| High | R16, R31, section 6 vs `docs/design.md` and `theme/tokens.json` | The delivered brand theme is not a Google DESIGN.md file. The token source is a plain JSON file with colors, radii and motion. R31's "brand/DESIGN.md compiled at build time" and R16's spec handling have no input in that format. | `docs/design.md` front matter has product, owner, document, status, reference and theme keys. It has no `version: alpha`, `colors` or `typography` keys. `theme/tokens.json` is a custom structure. | **Rewrite R31:** the brand theme is `theme/tokens.json`, mapped to Tailwind CSS variables at build time. **Defer R16.** This is simpler than the original plan and removes the alpha-spec dependency. | S |
| High | R5, R28, R29 vs `docs/design.md` sections 5 and 6 and the mockup | The two documents describe different shells. The design spec and the mockup show a fixed layout: a left sidebar (Library, Artists, Albums, Tracks, Playlists), a now-playing panel with art, title, artist, elapsed and total time, and a transport bar. The requirements specify dockable widgets with three Library modes and no sidebar views. | `docs/design.md` section 5: "Suggested narrow left sidebar: Library, Artists, Albums, Tracks, Playlists". R28 has no Artists, Albums or Tracks views. The mockup shows no Play queue, Lyrics widget or dock chrome. The design spec marks itself "subject to repository review". | **Owner decision:** pick one shell. The fixed shell in the mockup is the smaller build. It removes the docking library, named layouts, the R29 edge cases and acceptance checks 11 to 14. If docking stays, rewrite `docs/design.md` section 5 to name the R5 widgets and the R28 modes instead of sidebar views. | Saves L with the fixed shell |
| Medium | R6 vs the mockup | The mockup transport has shuffle, previous, play/pause, next and repeat. It has no Stop button. R6 requires Stop. | Mockup, bottom-left panel. | **Clarify:** keep Stop (owner request in R6) and add it to `docs/design.md` section 6, or remove it from R6. | S |
| Medium | R30 vs `docs/design.md` section 7 | The design spec agrees with the R30 finding: "A normal CSS transition is preferable to a full motion dependency." It names Blur Fade (About or empty state) and Magic Card as the only candidates. Both are decorative under R30's own rule. | `docs/design.md` section 7. | **Clarify R30:** Magic UI is optional. Motion is not a dependency unless the owner names a component that needs it. | S |
| Medium | R16 vs `docs/design.md` section 4 | The design spec names Geist Sans or Inter for the UI font. R16 allows locally installed fonts only. A bundled UI font is a build decision. | `docs/design.md` section 4. R16: "Fonts: locally installed only". | **Add to R31:** bundle one UI font (Inter or Geist Sans, both under the SIL Open Font License) or use the system font. Record the choice. | S |
| Low | R31 paths | R31 defines one `brand/` folder. The package uses `docs/`, `theme/` and `assets/`. The asset checklist proposes `assets/branding/`. | `docs/asset-manifest.md`. | **Rewrite R31** to the package paths. Drop the placeholder step. Update acceptance check 15 to the new paths. | S |
| Low | R18, R21 vs `docs/design.md` section 9 | The design spec states the same three portability properties as section E and says "do not silently assume user-profile paths". The requirements still lack a portable mode. | `docs/design.md` section 9. | Supports R18.1 and the R21 rewrite in section G. | S |
| Low | `docs/claude-code-implementation-prompt.md` | The implementation prompt assumes an existing working player, an `AGENTS.md` file and existing tests. The repository has none yet. It also forbids playlist editing and Favorites "unless supported by existing requirements". R12 and R26 support them. | Prompt phases 1 and 3. `docs/design.md` section 11. | **Clarify sequencing:** build v1 with the brand inputs from the start. Add `AGENTS.md` or drop the reference. State in the prompt that R12 and R26 are in scope. | S |

**Notes.**
- The design spec requires original vector artwork and forbids copies of third-party characters or logos. Keep that rule. It protects open-source distribution.
- The mockup shows macOS window controls. The design spec already calls them conceptual. Windows and Linux use native title bars.
- The mockup's elapsed and total time display matches the R5 addition in section G.

**Changes to sections D, F and G from this addendum.**
- Section D: the "R16 runtime theme" row now also removes the build-time DESIGN.md compile. The build maps `theme/tokens.json` to CSS variables instead.
- Section F: "Theme: brand DESIGN.md at build time" becomes "Theme: `theme/tokens.json` mapped at build time".
- Section G, R31 rewrite: "R31. Brand inputs: `docs/design.md` (design spec), `theme/tokens.json` (theme tokens), `assets/branding/` (icon and wordmark sources and exports). The build maps `theme/tokens.json` to Tailwind CSS variables and generates platform icons from `assets/branding/export/clawdio-icon-full.svg`. The app name, window title, bundle identifier and User-Agent read from one build config value."
- Section G, acceptance check 15: "Replacing `theme/tokens.json` and the icon sources and rebuilding changes the theme and the app icon with no other code changes."
