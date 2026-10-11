# Minimalist Open Source Music Player: Requirements

**Status:** Decision-complete. Version 1.3, October 11, 2026.
**Open questions:** None.

**How to read this file**
- `[D]` marks a detail derived from the owner's answers. The owner did not state it. It is not yet explicitly confirmed. Change any `[D]` item freely.
- `(v1.3)` marks an item changed or added in version 1.3. The change log at the end lists each change. Items marked `(v1.1)` or `(v1.2)` changed in earlier versions.
- Items with neither mark come from the owner's own words or from approved defaults 1 to 18.

---

## 1. Problem and desired outcome

The closest open source player (Strawberry) has many features the owner does not want. Its Windows releases are sponsor-only.

**Outcome:** a small, open source music player for Windows and Linux.
- The user points it at one music folder.
- It shows artist, album and song, and plays mp3, ogg and wav.
- The UI is made of widgets. The user docks, resizes, hides and saves them as named layouts.
- It adds artwork, lyrics and missing metadata.
- It keeps playlists as portable files.
- It takes its theme from one DESIGN.md file.
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
  - Tabbed groups, floating panels and pop-out windows are not in v1.
  - **Built-in layouts:** Columns (default at first run), Tree and Top/bottom. Each sets the Library mode and a widget arrangement. `[D]` Built-in layouts cannot be changed or deleted.
  - `[D]` **Default arrangement:** Library in the main area, Search in a top bar, Now playing and Transport controls in a bottom bar. Playlists, Play queue and Lyrics are hidden and available in the Widgets menu. The Tree and Top/bottom layouts use the same arrangement with their own Library mode.
  - **User-saved named layouts:** "Save layout as..." stores the current arrangement, widget visibility and Library mode under a name. The user can apply, rename and delete saved layouts. `[D]` Saving over an existing name asks for confirmation.
  - `[D]` Each saved layout is one JSON file in a `layouts` folder in the OS config directory, per machine. Layout files do not store window size. They are versioned. Import and export are deferred.
  - `[D]` The current arrangement saves automatically and restores at startup. Applying a layout replaces the current arrangement.
  - `[D]` **Reset layout** applies the built-in Columns layout. The menu button offers it, and a documented keyboard shortcut also runs it. Layouts cannot hide either.
  - `[D]` **Non-drag path:** the menu button offers show and hide for each widget, switching the Library mode and applying layouts. Moving a widget needs drag in v1.
  - `[D]` Corrupt layout file: ignore it and log it. Unknown widget in a layout: ignore that widget. Layout without the Library widget: apply the built-in Columns layout.
- **R30 (v1.3).** UI framework: Magic UI (https://github.com/magicuidesign/magicui).
  - Magic UI is a copy-and-paste component library on React, Tailwind CSS and Motion, in the shadcn/ui style, under the MIT license. Using it fixes the UI layer: React, Tailwind CSS, Motion and the shadcn/ui conventions (`cn` helper, `components.json`). The docking library must offer React bindings. `[D]`
  - `[D]` Standard controls (buttons, sliders, menus, dialogs, inputs) come from shadcn/ui. Magic UI supplies the animated components. Only components that serve a function in R5, R6 and R29 are copied into the repo. Decorative effects (backgrounds, marquees, shimmer, confetti) are out under the "few features" rule.
  - `[D]` Every animation honors the OS "reduce motion" setting. Animations never block input.
  - `[D]` Theme tokens from the DESIGN.md file (R16) map to Tailwind CSS variables. The DESIGN.md CLI's `css-tailwind` export is the reference mapping.
  - `[D]` Milestone 0 (R20) includes React, Tailwind, Motion and the copied components.
  - Copied components keep their MIT notice in the repo.
- **R31 (v1.3).** Branding package (to be supplied by the owner later).
  - The owner will deliver a branding package with icons and a DESIGN.md file. The app must accept it without code changes to features.
  - `[D]` The repo has one `brand/` folder with: `DESIGN.md` (the built-in theme), `icon.svg` (the app icon source), and an optional UI icon set. The build generates platform icons (Windows `.ico`, Linux PNG sizes) from `icon.svg`.
  - `[D]` The built-in dark theme (R15) is `brand/DESIGN.md`, compiled at build time. Until the branding package arrives, the repo ships a placeholder dark DESIGN.md and a placeholder icon. Dropping in the branding package replaces both.
  - `[D]` The app name, window title, bundle identifier and the User-Agent string (R8) read from one build config value, so the final name is a one-line change.
  - `[D]` UI icons default to the icon set shadcn/ui uses (Lucide). A brand icon set, if supplied, replaces individual icons by name.
  - `[D]` A theme the user picks in Settings (R16) overrides the brand theme. Reset theme returns to the brand theme.
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

- **R7.** One "Online lookups" switch in Settings. On by default. Off means zero network calls. First run shows a notice that the app writes sidecar files and contacts these services.
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
- **R14 (v1.1).** Import M3U, M3U8, PLS, XSPF, Apple XML and Apple text.
  - The app writes a new `.m3u8` in `Playlists/`. The original file stays untouched.
  - Apple XML is the playlist export from the Apple Music app or iTunes. Apple text is the plain-text or Unicode-text export (tab-delimited, with a header row). `[D]`
  - Matching order: relative to the playlist file (M3U family only), then longest path suffix, then file name, then name plus artist plus album against the library (when the source has them). `[D]`
  - For Apple XML, convert each track's `file://` location to a path first. For Apple text, use the Location column when present. `[D]`
  - Unmatched entries stay in the file as "missing" and appear in an import report.
  - `[D]` A track with no file location (for example a streaming-only track) appears in the import report only. The app does not write it to the `.m3u8`.
  - Encodings: M3U8 is UTF-8. Legacy `.m3u` reads as UTF-8 first, then Windows-1252. Apple text reads UTF-16 (with byte order mark), then UTF-8, then Windows-1252. `[D]`
  - `[D]` Entry point: a file picker. Matching searches only inside the library.
  - Assumption to verify: MusicBee exports a format on this list. Only XSPF is confirmed (third-party source). Test M3U8 in the owner's version.
- **R26 (v1.2).** Favorites. A heart button on the Now playing widget and on song rows adds or removes the song in `Playlists/Favorites.m3u8`.
  - `[D]` The app creates the file on first use. It is a normal playlist and appears in the Playlists widget.

### Theme

- **R15.** The app starts in a built-in dark theme.
- **R16 (v1.2).** The theme is a Google DESIGN.md file (spec version alpha).
  - The user picks the file in Settings. The app remembers the path and reloads on file change.
  - The app reads colors, typography, rounded and spacing. It ignores components.
  - It accepts `version: alpha` and warns on other versions.
  - Fonts: locally installed only, with a fallback to the system font.
  - Invalid file: keep the last good theme and show the error.
  - Duplicate section heading: reject the file (per the spec).
  - `[D]` Validate each token by type (color, dimension, font family). Ignore invalid tokens with a warning. Never load a `url()` or any remote resource from a theme file.
  - `[D]` If primary text on the background has a contrast ratio below 3:1, reject the theme and keep the last good theme (or default dark). Show the error.
  - `[D]` A "Reset theme" control always uses built-in colors, so a theme cannot hide it. A documented keyboard shortcut also resets the theme.
  - `[D]` The theme styles widget headers, splitters and drop zones with its color, rounded and spacing tokens. The theme sets no layout.
- **R17 (v1.2) `[D]`.** Docs list which tokens the app reads and which UI part each token controls, including widget headers, splitters and drop zones. Docs also describe the JSON sidecar schema (R10), the layout file schema (R29) and the `brand/` folder contents (R31). `(v1.3)` The repo includes a sample DESIGN.md of the default dark theme.

### State, footprint and release

- **R18.** Settings (music folder path, theme path, Online lookups switch) live in the OS config directory, per machine. `[D]` Window size is saved there too.
- **R19 `[D]`.** The SQLite database is a rebuildable cache. Deleting it loses nothing. A schema change triggers a rebuild, with no migrations. The cache holds no lookup markers, so a rebuild causes no new lookups.
- **R20 (v1.2).** Footprint targets, measured in the first build and adjustable:
  - Windows installer under 30 MB.
  - Linux `.deb` under 30 MB.
  - Idle memory under 200 MB across all processes with 50,000 tracks.
  - The AppImage is exempt (expected size is 70 MB or more).
  - **Milestone 0 (before feature work):** a footprint spike. It includes the docking code and every widget populated with test data: the Library widget in all three modes with a virtualized 50,000-track list, 2,000 art thumbnails, Play queue, Playlists, Lyrics, Now playing, Transport controls and Search. Measure memory across all processes on Windows and Linux. `(v1.3)` The spike uses the real UI stack (React, Tailwind, Motion, Magic UI components, docking library).
  - `[D]` If idle memory is more than 50% over target (above 300 MB), stop. The owner decides whether to switch to a native UI, drop Motion, or cut layout freedom.
- **R21 (v1.1).** Distribution: Windows installer, Linux `.deb` and AppImage. Build the AppImage on the oldest supported base system.
- **R22 (v1.1) `[D]`.** Minimum OS: Windows 10 or later. Linux: any distro that ships WebKitGTK 4.1. The owner may tighten these.
- **R23 (v1.1) `[D]`.** The app writes a log file to the OS log directory, with size-based rotation. Settings has an "Open log folder" command. Every "skip and log" event goes there (scan, playlists, sidecars, lookups, layouts).

---

## 3. Preferences and examples (not requirements)

- "Similar to MusicBee" is a feel reference. It does not mean feature parity.
- "See MusicBee" for the layout idea is a reference only. "Massively simpler" is a constraint (section 6).
- "Look at Strawberry" is a reference only. Do not copy Strawberry code.
- Magic UI is a requirement (R30). Which of its components to use is the implementer's choice within the rule in R30.
- `/music/` is an example path.
- `markdown.md` is an example name. Any file name works if the content is valid DESIGN.md.
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
- Tabbed widget groups, floating panels and pop-out windows (not selected for v1).
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
- **Theme file missing at startup:** use default dark and show a notice.
- **Theme rejected for low contrast or invalid content `[D]`:** keep the last good theme and show the error. Reset theme always works.
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

- **Stack:** Tauri v2 with a Rust backend (audio decoding and playback), SQLite, and a React UI with Tailwind CSS, Motion and Magic UI (owner's choice, R30). Revisit if Milestone 0 fails (R20).
- **Branding `[D]`:** no feature code depends on the placeholder name, icon or theme. All brand inputs live in `brand/` (R31).
- **Docking `[D]`:** a docking library may be used if its license is MIT or compatible, it has React bindings and it passes Milestone 0. One example is the MIT Dockview with its React package. Do not use commercial add-ons (Dockview Enterprise is commercial). Turn off tabs, floating panels and pop-out windows (section 4).
- **Complexity budget (the owner's "massively simpler than MusicBee"):** a fixed widget list (R5), no per-view overrides, no tabbed groups, no floating panels, no pop-out windows and no layout import or export in v1. Adding any of these needs an owner decision.
- **Audio engine `[D]`:** design it so gapless playback can be added later (decode the next track ahead of time). Gapless is not in v1.
- **License:** MIT unless a dependency forces GPL. Strawberry is GPL-3.0, so do not copy its code into an MIT project.
- **Platforms:** Windows and Linux (R22).
- **Formats:** mp3, ogg (Vorbis) and wav.
- **Source of truth:** the music folder.
- **Audio files:** never modified.
- **Network:** only the R7 services. No accounts and no API keys.
- **Theme spec:** DESIGN.md at alpha, which can change.

---

## 7. Deferred ideas

- Gapless playback (the engine must allow it later).
- Synced lyrics line highlighting.
- Volume normalization (ReplayGain).
- Equalizer and crossfade.
- Customizable keyboard shortcuts.
- Moving widgets by keyboard.
- Layout import and export.
- Tabbed groups, floating panels and pop-out windows.
- Playlist rename and reorder.
- Playlist export UI (the files are already M3U8 and can be copied).
- Bundled themes or a light/dark toggle.
- `components` tokens in themes.
- Accessibility work beyond platform defaults and R25.
- Multiple music folders (likely the first growth request).
- Light theme variant of the brand DESIGN.md.

---

## 8. Open questions

None.

---

## 9. Acceptance checks for v1 `[D]`

1. **Footprint spike (Milestone 0):** passes the R20 targets or triggers the owner decision.
2. **Responsiveness:** the UI stays responsive during a startup scan of a 50,000-track test library.
3. **Playlist interop:** a playlist written by the app opens in at least one other player (MusicBee or VLC) with all paths intact.
4. **Import:** real exports import with a correct matched/missing report. Use one Apple XML, one Apple text, one MusicBee playlist and one legacy `.m3u`.
5. **Lyrics:** a song named "01 - Title.mp3" finds lyrics through the cleaned title and the decoded duration.
6. **Artwork:** an album folder named "1973 - Album (Remastered)" matches after normalization. "Set cover" and "Retry lookup" both work.
7. **Theme lockout:** a theme with text color equal to background color is rejected. Reset theme works.
8. **Missing folder:** startup with the folder missing loses no data. Change folder works.
9. **Cache rebuild:** deleting the cache restores the same library and playlists, with no new lookups for albums that have a "no match" marker.
10. **Audio device:** unplugging the output device mid-song pauses playback with a message.
11. **Docking:** in each Library mode, the user can dock, resize, hide and show widgets. The arrangement survives a restart.
12. **Named layouts:** save, apply, rename and delete work. Built-in layouts cannot be changed or deleted.
13. **Layout lockout:** with Transport controls and Search hidden, keyboard shortcuts and media keys still work. Reset layout restores the default.
14. **Library widget:** it cannot be closed. Switching its mode keeps the selection and search text.
15. **Branding swap `(v1.3)`:** replacing the files in `brand/` and rebuilding changes the app icon, theme and name with no other code changes.
16. **Reduced motion `(v1.3)`:** with the OS reduce-motion setting on, no Magic UI animation plays.

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
