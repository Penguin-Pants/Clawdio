# Minimalist Open Source Music Player: Requirements

**Status:** Decision-complete. Version 1.4, October 11, 2026.
**Open questions:** None. Section 8 records the owner decisions of version 1.4.

**How to read this file**
- `[D]` marks a detail derived from the owner's answers. The owner did not state it. It is not yet explicitly confirmed. Change any `[D]` item freely.
- `(v1.4)` marks an item changed in version 1.4 (owner decisions, section 8). `(v1.3)` marks an item changed or added in version 1.3. The change log at the end lists each change. Items marked `(v1.1)` or `(v1.2)` changed in earlier versions.
- Items with neither mark come from the owner's own words or from approved defaults 1 to 18.

---

## 1. Problem and desired outcome

The closest open source player (Strawberry) has many features the owner does not want. Its Windows releases are sponsor-only.

**Outcome:** a small, open source music player for Windows and Linux.
- The user points it at one music folder.
- It shows artist, album and song, and plays mp3, ogg and wav.
- The UI is made of widgets. The user docks, resizes, hides and shows them. Three built-in layouts exist. `(v1.4)`
- It adds artwork, lyrics and missing metadata.
- It keeps playlists as portable files.
- It takes its theme from one token file in the repo (`theme/tokens.json`), compiled at build time. `(v1.4)`
- The music folder holds all user data. The app keeps only a disposable cache.

---

## 2. Confirmed requirements

### Library

- **R1 (v1.1).** One user-chosen music folder. Import mp3, ogg and wav. Ignore other file types.
  - `[D]` "ogg" means Ogg Vorbis. Skip Ogg files with other codecs (for example Opus) and report them (R2).
- **R2 (v1.1).** Startup sync adds new files and removes missing files. The folder wins.
  - The scan is incremental (path, size, modified time).
  - The scan does not block the UI.
  - A manual Rescan command exists.
  - Target: 50,000 tracks.
  - `[D]` Each scan produces a report: files added, removed and skipped, with skip reasons (unsupported type, unsupported codec, corrupt file). Settings shows the latest report.
- **R3.** Grouping uses folder names. Tags never change grouping.
  - The first folder under the root is the artist.
  - The second folder is the album.
  - Deeper folders (for example Disc 1) fold into the album.
  - A file directly under an artist folder goes to "Unknown Album".
  - A file at the root goes to "Unknown Artist".
- **R4 (v1.1) `[D]`.** Song title is the embedded tag, then the sidecar value, then the file name without extension. Remove any leading track-number prefix from the file name (for example "01 - ", "01. " or "1-01 "). Track number is the embedded tag, then the sidecar value, then the prefix removed from the file name. Songs sort by track number, then file name.

### Widgets and layout

- **R5 (v1.2).** The UI is made of widgets that the user can dock, resize, move and hide (R29).
  - **Library:** mandatory (R28).
  - **Transport controls:** movable and hideable. Buttons: play/pause, stop, previous, next, shuffle and repeat. `[D]` The seek bar and volume control are part of this widget.
  - **Now playing:** movable and hideable. Shows album art, title, artist, album and the heart button (R26).
  - **Playlists:** movable and hideable (R12 to R14).
  - **Play queue:** movable and hideable (R6).
  - **Lyrics:** movable and hideable (R9).
  - **Search:** movable and hideable. `[D]`
  - **Status line:** fixed at the bottom edge of the window. It is not dockable. `[D]` It shows "Ready" when idle, and progress text with pause and cancel during scans and lookups (for example "Fetching artwork: 14 of 62 albums"). `(v1.3)`
  - **Menu button:** fixed in the top-right corner. It is not dockable. It opens Widgets, Layouts, Settings and Rescan. `[D]`
  - Album art shows where available. Order: a cover image in the album folder (`cover`, `folder`, `front` or `albumart`, as `.jpg`, `.jpeg` or `.png`), then embedded art. `[D]`
  - `[D]` A song row also shows the tag artist when it differs from the folder artist. This is display only. Grouping does not change.
- **R28 (v1.2).** The Library widget is one widget with a layout switch in its header.
  - `(v1.3) [D]` When the widget is too narrow for the three-button switch, the switch collapses into one dropdown that shows the current mode.
  - **Tree:** a single expandable tree (artist, album, song).
  - **Columns:** Artist, Album and Songs side by side, left to right.
  - **Top/bottom:** Artist and Album side by side on top, Songs below.
  - `[D]` In Columns and Top/bottom modes, the Artist and Album lists each start with an "All" row. An Artist selection filters the Album list. An Album selection filters the Songs list. With nothing selected, Songs shows all songs.
  - `[D]` Switching the mode keeps the current selection and search text.
  - The Library widget can move and resize. It cannot be hidden or closed.
- **R29 (v1.2).** Docking and layouts.
  - Free-form drag-and-drop docking inside the main window. The user drags a widget by its header and drops it on the edge of another widget or of the window. Splitters resize widgets.
  - `(v1.4)` Floating panels and pop-out windows are not in v1. Tabbed groups are allowed. The app adds no code to prevent them. The saved arrangement must round-trip a tabbed group.
  - **Built-in layouts:** Columns (default at first run), Tree and Top/bottom. Each sets the Library mode and a widget arrangement. `[D]` Built-in layouts cannot be changed or deleted.
  - `[D]` **Default arrangement:** Library in the main area, Search in a top bar, Now playing and Transport controls in a bottom bar. Playlists, Play queue and Lyrics are hidden and available in the Widgets menu. The Tree and Top/bottom layouts use the same arrangement with their own Library mode.
  - `(v1.4)` User-saved named layouts are deferred (section 7).
  - `[D]` The current arrangement is one JSON file in the OS config directory, per machine. It does not store window size. It is versioned. Import and export are deferred.
  - `[D]` The current arrangement saves automatically and restores at startup. Applying a layout replaces the current arrangement.
  - `[D]` **Reset layout** applies the built-in Columns layout. The menu button offers it, and a documented keyboard shortcut also runs it. Layouts cannot hide either.
  - `[D]` **Non-drag path:** the menu button offers show and hide for each widget, switching the Library mode and applying layouts. Moving a widget needs drag in v1.
  - `[D]` Corrupt layout file: ignore it and log it. Unknown widget in a layout: ignore that widget. Layout without the Library widget: apply the built-in Columns layout.
- **R30 (v1.4).** UI framework: React, Tailwind CSS v4 and shadcn/ui components. Magic UI (https://github.com/magicuidesign/magicui) is optional.
  - `[D]` A Magic UI component may be copied into the repo only when a named component serves a function in R5, R6 or R29. The docs (R17) list the copied components. If the list is empty, Motion is not a dependency. Decorative effects (backgrounds, marquees, shimmer, confetti) are out under the "few features" rule.
  - `[D]` Every animation honors the OS "reduce motion" setting. Animations never block input.
  - `[D]` Theme tokens from `theme/tokens.json` (R31) map to Tailwind CSS variables at build time. The theme styles widget headers, splitters and drop zones with its color and radii tokens. The theme sets no layout.
  - `[D]` Milestone 0 (R20) includes React, Tailwind, shadcn/ui and the docking library. It includes Motion only if the component list is not empty.
  - Copied components keep their MIT notice in the repo.
- **R31 (v1.3).** Branding package (to be supplied by the owner later).
  - `(v1.4)` The branding package is in the repo: `docs/design.md` (design spec), `theme/tokens.json` (theme tokens), `docs/asset-manifest.md` (asset checklist) and `assets/reference/clawdio-approved-mockup.png` (reference). The app must accept brand changes without code changes to features.
  - `[D] (v1.4)` The build generates platform icons (Windows `.ico`, Linux PNG sizes) from `assets/branding/export/clawdio-icon-full.svg`. Until that file exists, the repo ships a placeholder `icon.svg` and the build uses it.
  - `[D] (v1.4)` The built-in dark theme (R15) is `theme/tokens.json`, compiled to CSS variables at build time.
  - `[D]` The app name, window title, bundle identifier and the User-Agent string (R8) read from one build config value, so the final name is a one-line change.
  - `[D]` UI icons default to the icon set shadcn/ui uses (Lucide). A brand icon set, if supplied, replaces individual icons by name.
  - `(v1.4)` A user-selected theme file (R16) is deferred.
- **R6 (v1.2).** Playback: play/pause, stop, previous/next, seek, volume, shuffle, repeat and a play queue (add, remove, clear). Nothing else.
  - Stop is a requested control. `[D]` Stop ends playback, resets the position to the start and keeps the queue.
  - `[D]` Repeat modes: off, all, one. Shuffle applies to the queue.
  - `[D]` Single click selects. Double-click or Enter on a song plays it. On an album row, it plays the album from the first song.
  - `[D]` Queue rule: playing a song sets the queue to the list it appears in. That is its album in Tree mode, the Songs list as shown in Columns and Top/bottom modes, and the playlist in the Playlists widget.
  - `[D]` Search is incremental, ignores case and accents, matches artist, album and song title, and filters the Library widget.
  - `[D]` Context menu: Play, Add to queue, Add to playlist. "Add to queue" shows "Added to queue" in the status line, because the Play queue widget may be hidden.
- **R24 (v1.1).** OS media keys and now-playing.
  - Play/pause, next and previous media keys work while the app runs, including when the window is in the background.
  - The app sends title, artist, album, artwork and position to the OS now-playing controls (Windows media controls, Linux MPRIS). `[D]`
- **R25 (v1.2) `[D]`.** Minimal keyboard navigation (the owner chose "minimal"; the keys are proposed).
  - Space toggles play/pause (not while typing in search).
  - Up and Down move through lists and the tree. Right expands. Left collapses.
  - Enter plays the selected song or album.
  - Ctrl+F focuses search and shows the Search widget if hidden. Esc clears search and returns focus to the Library widget.
  - F6 and Shift+F6 move focus between visible widgets.
  - Keyboard focus is always visible.
- **R27 (v1.1).** Remember queue, current song, position and volume.
  - The app saves them in the OS config directory.
  - `[D]` At startup it restores them and starts paused. It drops queue entries that no longer exist in the library without a message.

### Online and sidecars

- **R7 (v1.4).** One "Online lookups" switch in Settings. Off by default. Off means the app's own code makes zero network calls. The first run shows a notice that explains sidecar files and names the services. It offers "Turn on" and "Keep off". Turning the switch off cancels queued lookups and aborts in-flight requests.
- **R8 (v1.1).** Artwork fetches automatically in the background for albums with no embedded art and no cover image file.
  - Sources: MusicBrainz and Cover Art Archive.
  - It saves `cover.jpg` in the album folder. It never overwrites existing art.
  - `[D]` Name matching: ignore case and accents. Strip a leading year, year or edition words in brackets or parentheses (for example "Remastered" or "Deluxe Edition") and a leading "The". Save only exact matches after this normalization. Do not save low-confidence matches.
  - `[D]` Request an image of about 500 px, not the original. Check that the download is an image and under 10 MB before saving.
  - `[D]` No match: record "no match" in the album's JSON sidecar (R10). The app does not retry automatically.
  - `[D]` "Retry lookup" per album clears the marker and tries again.
  - `[D]` "Set cover" per album: the user picks an image file. The app saves it as `cover.jpg` (converting if needed).
  - Rate limit: at most 1 request per second to MusicBrainz. The User-Agent has the app name, version and a project contact URL.
  - A status line shows progress with pause and cancel. The UI stays usable.
- **R9 (v1.2).** Lyrics are a per-song action. Source: lrclib. The app saves a `.lrc` file if synced lyrics exist, otherwise a `.txt` file, next to the song.
  - `[D]` Lookup sends the folder artist, the cleaned title (R4), the folder album and the duration from the decoder. If that finds nothing, search by artist and title. Accept a result only if its duration is within 2 seconds.
  - The Lyrics widget shows the lyrics text for the playing song. For `.lrc` files it hides timestamps. If no lyrics file exists, it shows a "Fetch lyrics" button (disabled when Online lookups are off). `[D]`
  - Synced line highlighting is deferred.
- **R10 (v1.1).** Metadata fill is a per-album action with a preview. The app writes nothing until the user confirms.
  - It fills blanks only (title, track number, year).
  - `[D]` A field is "missing" when the embedded tag is absent or empty. The file-name fallbacks in R4 do not count as filled.
  - It looks up by folder names, existing tags and file name.
  - It does not use audio fingerprinting.
  - It writes one JSON sidecar per album folder. `[D]` The same file holds lookup markers (R8).
  - Embedded tags win over sidecar values.
- **R11.** The app never modifies audio files. Sidecars are not library tracks. Orphan sidecars (audio renamed or deleted) are ignored and never auto-deleted.

### Playlists

- **R12 (v1.2) `[D]`.** Create a playlist, add songs, remove songs and delete a playlist. Delete removes the `.m3u8` file after a confirmation.
  - `[D]` The Playlists widget lists playlists. Each playlist expands to show its songs. Double-click plays a playlist. A "New playlist" button and "Add to playlist" in the context menu create playlists. "Remove from playlist" is a context menu action.
- **R13 (v1.1).** Storage is `.m3u8` (UTF-8) in `Playlists/` at the folder root.
  - `[D]` Paths are relative to the playlist file, with forward slashes. A file in `Playlists/` therefore holds paths like `../Artist/Album/Song.mp3`.
  - `[D]` If a target player fails on `..` paths in testing, move playlist files to the folder root. The owner decides.
  - The file name is the playlist name.
  - Writes use a temp file, then a rename.
  - Startup finds `.m3u8` files anywhere in the folder.
  - Rescan never edits playlists.
- **R14 (v1.4).** Import M3U, M3U8 and Apple XML. PLS, XSPF and Apple text are deferred (section 7).
  - The app writes a new `.m3u8` in `Playlists/`. The original file stays untouched.
  - Apple XML is the playlist export from the Apple Music app or iTunes. `[D]`
  - Matching order: relative to the playlist file (M3U family only), then longest path suffix, then file name, then name plus artist plus album against the library (when the source has them). `[D]`
  - For Apple XML, convert each track's `file://` location to a path first. `[D]`
  - Unmatched entries stay in the file as "missing" and appear in an import report.
  - `[D]` A track with no file location (for example a streaming-only track) appears in the import report only. The app does not write it to the `.m3u8`.
  - Encodings: M3U8 is UTF-8. Legacy `.m3u` reads as UTF-8 first, then Windows-1252. `[D]`
  - `[D]` Entry point: a file picker. Matching searches only inside the library.
  - Assumption to verify: MusicBee exports M3U8. Test in the owner's version.
- **R26 (v1.2).** Favorites. A heart button on the Now playing widget and on song rows adds or removes the song in `Playlists/Favorites.m3u8`.
  - `[D]` The app creates the file on first use. It is a normal playlist and appears in the Playlists widget.

### Theme

- **R15.** The app starts in a built-in dark theme.
- **R16 (v1.4).** Deferred. The v1 theme is `theme/tokens.json`, compiled at build time (R31). A user-selected theme file is deferred (section 7).
  - Fonts: locally installed only, with a fallback to the system font. The owner may bundle one UI font under the SIL Open Font License.
- **R17 (v1.4) `[D]`.** Docs list which tokens in `theme/tokens.json` the app reads and which UI part each token controls, including widget headers, splitters and drop zones. Docs also describe the JSON sidecar schema (R10), the arrangement file schema (R29), the brand inputs (R31) and the list of copied Magic UI components (R30).

### State, footprint and release

- **R18 (v1.4).** Settings (music folder path, Online lookups switch) live in the OS config directory, per machine. `[D]` Window size is saved there too.
- **R19 `[D]`.** The SQLite database is a rebuildable cache. Deleting it loses nothing. A schema change triggers a rebuild, with no migrations. The cache holds no lookup markers, so a rebuild causes no new lookups.
- **R20 (v1.2).** Footprint targets, measured in the first build and adjustable:
  - Windows installer under 30 MB.
  - Linux `.deb` under 30 MB.
  - Idle memory under 200 MB across all processes with 50,000 tracks.
  - The AppImage is exempt (expected size is 70 MB or more).
  - **Milestone 0 (before feature work):** a footprint spike. It includes the docking code and every widget populated with test data: the Library widget in all three modes with a virtualized 50,000-track list, 2,000 art thumbnails, Play queue, Playlists, Lyrics, Now playing, Transport controls and Search. Measure memory across all processes on Windows and Linux. `(v1.4)` The spike uses the real UI stack (React, Tailwind, shadcn/ui, docking library, and Motion only if R30 names a component).
  - `[D]` If idle memory is more than 50% over target (above 300 MB), stop. The owner decides whether to switch to a native UI or cut layout freedom.
- **R21 (v1.1).** Distribution: Windows installer, Linux `.deb` and AppImage. Build the AppImage on the oldest supported base system.
- **R22 (v1.1) `[D]`.** Minimum OS: Windows 10 or later. Linux: any distro that ships WebKitGTK 4.1. The owner may tighten these.
- **R23 (v1.1) `[D]`.** The app writes a log file to the OS log directory, with size-based rotation. Settings has an "Open log folder" command. Every "skip and log" event goes there (scan, playlists, sidecars, lookups, layouts).

---

## 3. Preferences and examples (not requirements)

- "Similar to MusicBee" is a feel reference. It does not mean feature parity.
- "See MusicBee" for the layout idea is a reference only. "Massively simpler" is a constraint (section 6).
- "Look at Strawberry" is a reference only. Do not copy Strawberry code.
- Magic UI is optional (R30). Which of its components to use, if any, follows the rule in R30. `(v1.4)`
- `/music/` is an example path.
- `markdown.md` was an example theme file name. The theme now comes from `theme/tokens.json` (R31). `(v1.4)`
- MusicBee and Apple Music are example playlist sources. R14 lists the formats.
- "Any system" means Windows and Linux only.
- "All the basics" is defined by R5, R6, R24, R25, R26 and R27.

---

## 4. Non-goals

These are out under the owner's "few features" rule.

- Streaming services, scrobbling, CD playback, device sync, transcoding, internet radio and podcasts.
- Mobile apps.
- macOS (no promise).
- Audio formats beyond mp3, ogg (Vorbis) and wav. This includes Opus.
- Audio fingerprinting.
- Editing tags inside audio files.
- Multiple music folders.
- Live folder watching.
- Smart playlists, ratings and play counts. `[D]`
- Floating panels and pop-out windows (not selected for v1). `(v1.4)` Tabbed groups are allowed (R29).
- Per-view layout overrides. `[D]`

---

## 5. Edge cases and failure behavior

- **Music folder missing at startup `[D]`:** show "Music folder not found" with a Change folder button. Keep the cache. A false purge cannot lose data, because the cache is rebuildable and playlists live in the folder.
- **Unsupported or corrupt audio file:** skip it, log it and count it in the scan report.
- **Ogg file with an unsupported codec (for example Opus) `[D]`:** skip it, log it and count it in the scan report.
- **Missing tags:** the R4 fallbacks apply.
- **Tag and folder disagree:** the folder wins, with no warning.
- **Folder names that differ only by case (Linux only):** separate entries.
- **Non-ASCII file and folder names:** must work on both systems.
- **Windows paths over 260 characters `[D]`:** must work.
- **No network or service error:** playback and library still work. Fetches retry on the next startup, except albums with a "no match" marker (R8).
- **Existing art:** an embedded image or a cover image file (R5 names) in the album folder blocks the fetch.
- **Read-only music folder:** fetch features turn off with a message.
- **Corrupt sidecar:** ignore it and log it. A later metadata fill may replace it after the preview.
- **Playlist entry with no file:** shown as "missing" and skipped in playback. It is never removed automatically.
- **Unreadable playlist file:** skip it and log it.
- **Playlist write failure:** show the error. The old file stays intact (temp file, then rename).
- **Layout problems `[D]`:** a corrupt layout file, an unknown widget or a missing Library widget follow R29.
- **Controls or Search hidden `[D]`:** keyboard shortcuts (R25) and media keys (R24) still work. Reset layout restores the default.
- **Window smaller than a saved layout needs `[D]`:** the app enforces a minimum window size and a minimum size per widget. It clamps the layout to fit.
- **Empty Play queue, Playlists or Lyrics widget `[D]`:** show a short hint, not a blank area.
- **Audio device unplugged or changed during playback `[D]`:** pause, show a message and resume on the default device when the user presses play.
- **Second app launch `[D]`:** focus the running instance. Do not start a second one.
- **Closing the window `[D]`:** quits the app. Media keys work only while the app runs.
- **Folder edited while the app runs:** changes appear after Rescan or restart.

---

## 6. Confirmed constraints

- **Stack:** Tauri v2 with a Rust backend (audio decoding and playback), SQLite, and a React UI with Tailwind CSS and shadcn/ui (R30). Magic UI and Motion only by named component. Revisit if Milestone 0 fails (R20). `(v1.4)`
- **Branding `[D]`:** no feature code depends on the placeholder name, icon or theme. All brand inputs are the files named in R31. `(v1.4)`
- **Docking `[D]`:** a docking library may be used if its license is MIT or compatible, it has React bindings and it passes Milestone 0. One example is the MIT Dockview with its React package. Do not use commercial add-ons (Dockview Enterprise is commercial). Turn off floating panels and pop-out windows (section 4). Tabbed groups stay on (R29). `(v1.4)`
- **Complexity budget (the owner's "massively simpler than MusicBee"):** a fixed widget list (R5), no per-view overrides, no named layouts, no floating panels, no pop-out windows and no layout import or export in v1. `(v1.4)` Adding any of these needs an owner decision.
- **Audio engine `[D]`:** design it so gapless playback can be added later (decode the next track ahead of time). Gapless is not in v1.
- **License:** MIT unless a dependency forces GPL. Strawberry is GPL-3.0, so do not copy its code into an MIT project.
- **Platforms:** Windows and Linux (R22).
- **Formats:** mp3, ogg (Vorbis) and wav.
- **Source of truth:** the music folder.
- **Audio files:** never modified.
- **Network:** only the R7 services. No accounts and no API keys.
- **Theme source:** `theme/tokens.json`, compiled at build time (R31). `(v1.4)`

---

## 7. Deferred ideas

- Gapless playback (the engine must allow it later).
- Synced lyrics line highlighting.
- Volume normalization (ReplayGain).
- Equalizer and crossfade.
- Customizable keyboard shortcuts.
- Moving widgets by keyboard.
- Layout import and export.
- Floating panels and pop-out windows. `(v1.4)`
- Named layouts: save, apply, rename and delete. `(v1.4)`
- User-selected theme file (R16). `(v1.4)`
- Playlist import of PLS, XSPF and Apple text. `(v1.4)`
- Playlist rename and reorder.
- Playlist export UI (the files are already M3U8 and can be copied).
- Bundled themes or a light/dark toggle.
- `components` tokens in themes.
- Accessibility work beyond platform defaults and R25.
- Multiple music folders (likely the first growth request).
- Light theme variant of the brand tokens.

---

## 8. Open questions

None. The owner made these decisions on October 11, 2026 (version 1.4):

1. **Shell:** the docking shell (R29) stays. `docs/design.md` section 5 must be rewritten to name the R5 widgets and the R28 modes instead of sidebar views (separate task).
2. **Online lookups (R7):** off by default, with a first-run choice.
3. **Metadata fill (R10):** kept as specified.
4. **Playlist import (R14):** M3U, M3U8 and Apple XML. PLS, XSPF and Apple text are deferred.
5. **Theme (R16):** the user-selected theme is deferred. The build compiles `theme/tokens.json`.
6. **Named layouts (R29):** deferred. Built-in layouts and auto-save stay.
7. **Tabbed groups (R29, section 6):** allowed.
8. **Magic UI and Motion (R30):** optional. No Motion unless a named component needs it.

Still to verify: the R13 path base after the interop test, the R14 MusicBee M3U8 export, and the R20 Milestone 0 outcome. Other findings of the requirements review (`docs/REQUIREMENTS_REVIEW.md`, section G) are not yet applied.

---

## 9. Acceptance checks for v1 `[D]`

1. **Footprint spike (Milestone 0):** passes the R20 targets or triggers the owner decision.
2. **Responsiveness:** the UI stays responsive during a startup scan of a 50,000-track test library.
3. **Playlist interop:** a playlist written by the app opens in at least one other player (MusicBee or VLC) with all paths intact.
4. **Import:** real exports import with a correct matched/missing report. Use one Apple XML, one MusicBee M3U8 and one legacy `.m3u`. `(v1.4)`
5. **Lyrics:** a song named "01 - Title.mp3" finds lyrics through the cleaned title and the decoded duration.
6. **Artwork:** an album folder named "1973 - Album (Remastered)" matches after normalization. "Set cover" and "Retry lookup" both work.
7. **Theme build `(v1.4)`:** changing a color in `theme/tokens.json` and rebuilding changes the UI. (Replaces the theme lockout check. R16 is deferred.)
8. **Missing folder:** startup with the folder missing loses no data. Change folder works.
9. **Cache rebuild:** deleting the cache restores the same library and playlists, with no new lookups for albums that have a "no match" marker.
10. **Audio device:** unplugging the output device mid-song pauses playback with a message.
11. **Docking:** in each Library mode, the user can dock, resize, hide and show widgets. The arrangement survives a restart.
12. **Built-in layouts `(v1.4)`:** applying each built-in layout works. A tabbed group survives a restart. (Named layouts are deferred.)
13. **Layout lockout:** with Transport controls and Search hidden, keyboard shortcuts and media keys still work. Reset layout restores the default.
14. **Library widget:** it cannot be closed. Switching its mode keeps the selection and search text.
15. **Branding swap `(v1.4)`:** replacing `theme/tokens.json` and the icon source and rebuilding changes the theme and the app icon with no other code changes.
16. **Reduced motion `(v1.4)`:** with the OS reduce-motion setting on, no animation plays. Applies to Magic UI components only if R30 names any.

---

## References

- Strawberry Music Player: https://github.com/strawberrymusicplayer/strawberry
- DESIGN.md format (Google Labs): https://github.com/google-labs-code/design.md
- DESIGN.md spec: https://github.com/google-labs-code/design.md/blob/main/docs/spec.md
- MusicBrainz rate limiting and User-Agent rules: https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting
- lrclib API: https://lrclib.net/docs
- Tauri AppImage notes: https://v2.tauri.app/de/distribute/appimage/
- Symphonia (Rust audio decoding): https://github.com/pdeljanov/Symphonia
- Apple playlist export (XML and plain text): https://support.apple.com/kb/PH19491
- souvlaki (OS media controls): https://github.com/Sinono3/souvlaki
- MusicBee layout model (for reference): https://musicbee.fandom.com/wiki/The_Anatomy_of_MusicBee
- Dockview (example docking library): https://dockview.dev
- Magic UI: https://github.com/magicuidesign/magicui
- Layout mockups (design canvas): https://claude.ai/artifact/SwcfWxGUmfBkPHwQ3MLs6W

## Change log

- **1.4 (October 11, 2026):** owner decisions after the requirements review (`docs/REQUIREMENTS_REVIEW.md`).
  - **Owner decisions (section 8):** docking shell stays (R29). Online lookups off by default with a first-run choice (R7). R10 kept. Import limited to M3U, M3U8 and Apple XML (R14). User-selected theme deferred; build-time `theme/tokens.json` (R16, R31). Named layouts deferred (R29). Tabbed groups allowed (R29, section 6). Magic UI optional and Motion only by named component (R30).
  - **Updated:** outcome bullets (section 1), R17, R18, R20, section 3, section 4, section 5 (theme cases removed), section 6, section 7, acceptance checks 4, 7, 12, 15 and 16.
  - **Not applied:** the other review findings in section G of the review. They wait for a separate owner pass.
- **1.3 (October 11, 2026):** UI framework and branding.
  - **Owner decisions:** Magic UI as the UI framework (R30), which fixes React, Tailwind CSS and Motion. A branding package (icons and DESIGN.md) will be supplied later (R31).
  - **From the mockups:** status line text (R5), layout switch collapses to a dropdown when narrow (R28).
  - **Updated:** stack and docking constraints (section 6), Milestone 0 scope (R20), docs (R17), acceptance checks 15 and 16.
- **1.2 (October 11, 2026):** widget-based, dockable UI.
  - **Owner decisions:** free-form drag-and-drop docking (R29). Library widget with a layout switch (Tree, Columns, Top/bottom) (R28). Three-column layout as the first-run default. User-saved named layouts. Movable and hideable widgets: Playlists, Play queue, Lyrics, Now playing and Transport controls (R5). A Stop button (R6). Tabbed groups, floating panels and pop-out windows not selected for v1.
  - **Replaced:** the single-tree UI in R5 and the "implementer decides placement" rule.
  - **Gap fixes:** Playlists widget behavior (R12), Play queue as a widget (R6), queue rule for every Library mode (R6), Lyrics widget (R9), heart button location (R26), F6 focus cycling (R25), theme styling of docking chrome (R16, R17), Milestone 0 scope (R20).
  - **Added:** layout recovery and a non-drag path (R29), layout edge cases, a complexity budget, layout acceptance checks 11 to 14.
- **1.1 (October 11, 2026):** review fixes and additions.
  - **Owner decisions:** Apple XML and text import (R14), OS media keys and now-playing (R24), minimal keyboard navigation (R25), Favorites (R26), remember queue, position and volume (R27). R10 kept as specified.
  - **Error fixes:** R20, R21 and R22 (footprint and Linux package), R9 (lyrics view and lookup), R8 (artwork matching, manual fix, status line), R13 (path base), R1 and R2 (Opus and scan report), R16 and R17 (theme safety and recovery).
  - **Gap fixes:** R4 (title cleanup), R10 (definition of "missing"), R5 (track artist), R6 (play and search behavior), R23 (logging), edge cases, the gapless-ready constraint and the acceptance checks.
  - **Moved from Deferred into v1:** OS media keys, Apple XML and text import, minimal keyboard navigation.
- **1.0 (October 11, 2026):** initial version.
