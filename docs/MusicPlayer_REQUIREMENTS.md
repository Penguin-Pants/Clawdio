# Minimalist Open Source Music Player: Requirements

**Status:** Decision-complete. Version 1.7, October 12, 2026.
**Open questions:** None. Section 8 records the owner decisions of versions 1.4 to 1.7.

**How to read this file**
- `[D]` marks a detail derived from the owner's answers. The owner did not state it. It is not yet explicitly confirmed. Change any `[D]` item freely.
- `(v1.7)` marks an item changed or added in version 1.7 (Library frame splitters and fixed-height bar widgets, owner decisions 29 to 37 in section 8). `(v1.6)` marks an item changed or added in version 1.6 (bulk import, missing-song repair and microphone ducking, owner decisions 17 to 28 in section 8). `(v1.5)` marks an item changed in version 1.5 (requirements review, section G, with owner decisions in section 8). `(v1.4)` marks an item changed in version 1.4. `(v1.3)` marks an item changed or added in version 1.3. The change log at the end lists each change. Items marked `(v1.1)` or `(v1.2)` changed in earlier versions.
- Items with neither mark come from the owner's own words or from approved defaults 1 to 18.

---

## 1. Problem and desired outcome

The closest open source player (Strawberry) has many features the owner does not want. Its Windows releases are sponsor-only.

**Outcome:** a small, open source music player for Windows and Linux.
- The user points it at one music folder.
- It shows artist, album and song, and plays mp3, ogg and wav.
- The UI is made of widgets. The user docks, resizes, hides and shows them. Three built-in layouts exist. `(v1.4)`
- The user resizes the Artist, Album and Songs frames in the Library. Transport controls and Now playing stay thin bars wherever they dock. `(v1.7)`
- It adds artwork, lyrics and missing metadata.
- It keeps playlists as portable files.
- It imports many playlists at once and finds their songs in the library, also when the source names another format of the song. `(v1.6)`
- It lowers or pauses the music while another app uses the microphone (Windows). `(v1.6)`
- It takes its theme from one token file in the repo (`theme/tokens.json`), compiled at build time. `(v1.4)`
- The music folder holds all music-related user data: playlists, Favorites, artwork, lyrics and sidecars. Per-machine settings, the widget arrangement, playback state, cache and logs live in the OS config directory, or next to the executable in portable mode (R18). `(v1.5)`

---

## 2. Confirmed requirements

### Library

- **R1 (v1.1).** One user-chosen music folder. Import mp3, ogg and wav. Ignore other file types.
  - `[D]` "ogg" means Ogg Vorbis. Skip Ogg files with other codecs (for example Opus) and report them (R2).
  - `(v1.5)` WAV: PCM integer and float, and ADPCM, as the pinned decoder supports. A WAV file with another encoding is skipped and reported as unsupported codec.
- **R1.1 (v1.5).** First run: if no music folder is set, the main area shows a "Choose music folder" button. Other widgets show their empty hints. Transport controls are disabled until a folder is set.
- **R2 (v1.1).** Startup sync adds new files and removes missing files. The folder wins.
  - The scan is incremental (path, size, modified time).
  - The scan does not block the UI.
  - A manual Rescan command exists.
  - Target: 50,000 tracks.
  - `(v1.5)` The status line shows counts (added, removed, skipped) when a scan ends. Settings shows the last counts and an "Open log folder" button. The log holds the per-file reasons (unsupported type, unsupported codec, corrupt file).
  - `(v1.5)` The scan skips files and folders whose names start with ".". The scan does not follow symbolic links or junctions to folders. If a scan is running, Rescan does nothing.
  - `(v1.5)` The scan removes missing files only after a complete traversal of the folder. A canceled or failed scan keeps what it added and removes nothing.
  - `(v1.5)` If the root folder is readable and empty, the scan removes all tracks. This is accepted. Playlists and Favorites are files and are not affected.
- **R3.** Grouping uses folder names. Tags never change grouping.
  - The first folder under the root is the artist.
  - The second folder is the album.
  - Deeper folders (for example Disc 1) fold into the album.
  - A file directly under an artist folder goes to "Unknown Album".
  - A file at the root goes to "Unknown Album" under "Unknown Artist". `(v1.5)`
  - `(v1.5)` Display names are folder names, unchanged. Artist and album lists sort by folder name. The sort ignores case and accents and uses natural numeric order (2 before 10). Names that compare equal after this normalization sort by their exact name in byte order. "Unknown Artist" and "Unknown Album" sort last.
- **R4 (v1.1) `[D]`.** Song title is the embedded tag, then the sidecar value, then the file name without extension. Remove any leading track-number prefix from the file name. `(v1.5)` A track-number prefix is: one to three digits, then an optional group of a separator ("-" or ".") and one to three more digits, then one or more of space, ".", "-" or "_". Examples: "01 - ", "01. ", "1-01 ", "001_". Track number is the embedded tag, then the sidecar value, then the prefix removed from the file name. `(v1.5)` Songs in an album sort by: (1) disc order, (2) the track number, (3) the file name. Disc order is the disc number tag when present. Otherwise it is the position of the song's sub-folder in a natural-order sort of the album's sub-folders. Files directly in the album folder sort as disc 0. Comparison ignores case.

### Widgets and layout

- **R5 (v1.2).** The UI is made of widgets that the user can dock, resize, move and hide (R29).
  - **Library:** mandatory (R28).
  - **Transport controls:** movable and hideable. A bar widget with a fixed height (R29.1). `(v1.7)` Buttons: play/pause, stop, previous, next, shuffle and repeat. `[D]` The seek bar and volume control are part of this widget. `(v1.5)` It shows elapsed time and total time next to the seek bar.
  - **Now playing:** movable and hideable. A bar widget with a fixed height (R29.1). `(v1.7)` Shows album art, title, artist, album and the heart button (R26).
  - **Playlists:** movable and hideable (R12 to R14).
  - **Play queue:** movable and hideable (R6).
  - **Lyrics:** movable and hideable (R9).
  - **Search:** a text field in the Library widget header (R28). It is not a separate widget. `(v1.5)`
  - **Status line:** fixed at the bottom edge of the window. It is not dockable. `[D]` It shows "Ready" when idle, and progress text with a cancel control during scans and lookups (for example "Fetching artwork: 14 of 62 albums"). `(v1.5)` Pause is removed; cancel plus "Retry lookup" covers it.
  - **Menu button:** fixed in the top-right corner. It is not dockable. It opens Widgets, Layouts, Settings and Rescan. `[D]`
  - Album art shows in the Now playing widget and as a thumbnail in Album rows. Order: a cover image in the album folder (`cover`, `folder`, `front` or `albumart`, as `.jpg`, `.jpeg` or `.png`), then embedded art. A cover file that fails to decode is logged and ignored. Thumbnails are stored in the cache (R19). `[D] (v1.5)`
  - `[D]` A song row also shows the tag artist when it differs from the folder artist. This is display only. Grouping does not change.
- **R28 (v1.2).** The Library widget is one widget with a layout switch in its header. `(v1.5)` The header also holds the search field (R5, R6).
  - `(v1.3) [D]` When the widget is too narrow for the three-button switch, the switch collapses into one dropdown that shows the current mode.
  - **Tree:** a single expandable tree (artist, album, song).
  - **Columns:** Artist, Album and Songs side by side, left to right.
  - **Top/bottom:** Artist and Album side by side on top, Songs below.
  - `[D]` In Columns and Top/bottom modes, the Artist and Album lists each start with an "All" row. An Artist selection filters the Album list. An Album selection filters the Songs list. With nothing selected, Songs shows all songs.
  - `[D]` Switching the mode keeps the current selection and search text.
  - The Library widget can move and resize. It cannot be hidden or closed.
- **R28.1 (v1.7).** Library frame splitters.
  - Columns mode has a splitter between Artist and Album and one between Album and Songs.
  - Top/bottom mode has a splitter between Artist and Album and one between the top row and Songs.
  - Tree mode has one frame and no splitter.
  - Each frame has a minimum size, so no frame collapses. The clamp for small windows (section 5) also applies to frames.
  - Splitters work with the mouse only. They look and behave like the dock splitters (R30). Keyboard resize is deferred (section 7).
  - Columns and Top/bottom each keep their own frame sizes. Switching the mode does not reset them.
  - Frame sizes are part of the arrangement (R29). They save automatically and restore at startup.
  - Reset layout and applying any built-in layout restore the default frame sizes of all modes.
- **R29 (v1.2).** Docking and layouts.
  - Free-form drag-and-drop docking inside the main window. The user drags a widget by its header and drops it on the edge of another widget or of the window. Splitters resize widgets.
  - `(v1.4)` Floating panels and pop-out windows are not in v1. Tabbed groups are allowed. The app adds no code to prevent them, except for bar widgets (R29.1). `(v1.7)` The saved arrangement must round-trip a tabbed group.
  - **Built-in layouts:** Columns (default at first run), Tree and Top/bottom. Each sets the Library mode and a widget arrangement. `[D]` Built-in layouts cannot be changed or deleted.
  - `[D]` **Default arrangement:** Library in the main area (search in its header), Now playing and Transport controls in a bottom bar. `(v1.5)` Playlists, Play queue and Lyrics are hidden and available in the Widgets menu. The Tree and Top/bottom layouts use the same arrangement with their own Library mode.
  - `(v1.4)` User-saved named layouts are deferred (section 7).
  - `[D]` The current arrangement is one JSON file in the OS config directory, per machine. It does not store window size. It is versioned. A file with an unknown version is ignored and logged, like a corrupt file. `(v1.5)` Import and export are deferred.
  - `[D]` The current arrangement saves automatically and restores at startup. Applying a layout replaces the current arrangement.
  - `[D]` **Reset layout** applies the built-in Columns layout. The menu button offers it, and a documented keyboard shortcut also runs it. No layout can hide the menu button or the status line. `(v1.5)`
  - `[D]` **Non-drag path:** the menu button offers show and hide for each widget, switching the Library mode and applying layouts. Moving a widget needs drag in v1.
  - `[D]` Corrupt layout file: ignore it and log it. Unknown widget in a layout: ignore that widget. Layout without the Library widget: apply the built-in Columns layout.
- **R29.1 (v1.7).** Bar widgets: Transport controls and Now playing.
  - Each bar widget has a fixed height: its natural content height, header included. No splitter changes it.
  - A drop on a top or bottom edge, of the window or of a widget, gives the bar widget a row at its fixed height and the full width of that edge. The other widgets get the rest of the space.
  - Side drops are refused. Exception: the two bar widgets can share one row, side by side. That row is as tall as the taller of the two.
  - No side drop zone shows for a bar widget, except when the other bar widget is the drop target.
  - Tabbing is refused both ways. A bar widget cannot join a tab group, and no widget can join a bar widget's group.
  - A refused drop shows no drop overlay. The widget stays where it was. Nothing is logged.
  - Other widgets keep their current drop and splitter sizing.
  - At startup, a saved arrangement that breaks these rules is repaired. Only the widget that breaks them moves, to its default bottom-bar position (R29 default arrangement). The rest stays. Each repair is logged (R23).
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
  - `(v1.5)` Repeat off: playback stops after the last queue entry; the position shows the start of the last song. Repeat all: after the last entry, playback continues from the first. Repeat one: the current song restarts when it ends. Next and Previous still move through the queue.
  - `(v1.5)` Shuffle on: the app plays the remaining entries in random order. Each entry plays once before any entry repeats. The queue display keeps its order. Shuffle off: playback continues in queue order from the current song.
  - `(v1.5)` Previous: if the position is more than 3 seconds, Previous restarts the current song. Otherwise it goes to the previous entry in play order. With shuffle on, the previous entry is the last song played in this shuffle run. With no previous entry, Previous restarts the current song.
  - `(v1.5)` Decode error: the app logs it, shows "Cannot play <file name>" in the status line and continues with the next entry. After three consecutive failures, playback stops.
  - `[D]` Single click selects. Double-click or Enter on a song plays it. On an album row, it plays the album from the first song.
  - `[D]` Queue rule: playing a song sets the queue to the list it appears in. That is its album in Tree mode, the Songs list as shown in Columns and Top/bottom modes, and the playlist in the Playlists widget. `(v1.5)` Play (context menu) and double-click replace the queue and start at that song. Add to queue appends to the end and does not change the playing song.
  - `(v1.5)` Queue edits: removing the playing entry stops it and starts the next entry, or stops playback at the end of the queue. Removing an entry before the playing one keeps the playing song and its position. Clear stops playback and empties the queue.
  - `[D]` Search is incremental, ignores case and accents, matches artist, album and song title, and filters the Library widget. `(v1.5)` In Tree mode the tree shows artists and albums that contain a match, and the matching songs. A match on an artist or album name shows all of its songs.
  - `[D]` Context menu: Play, Add to queue, Add to playlist. "Add to queue" shows "Added to queue" in the status line, because the Play queue widget may be hidden.
- **R24 (v1.1).** OS media keys and now-playing.
  - Play/pause, next and previous media keys work while the app runs, including when the window is in the background.
  - The app sends title, artist, album, artwork and position to the OS now-playing controls (Windows media controls, Linux MPRIS). `[D]`
  - `(v1.5)` The app accepts play, pause, toggle, next, previous and stop from the OS. If OS media controls cannot register, the app logs it and continues.
- **R25 (v1.2) `[D]`.** Minimal keyboard navigation (the owner chose "minimal"; the keys are proposed).
  - Space toggles play/pause (not while typing in search).
  - Up and Down move through lists and the tree. Right expands. Left collapses.
  - Enter plays the selected song or album.
  - Ctrl+F focuses the search field in the Library header. `(v1.5)` Esc clears search and returns focus to the Library widget.
  - F6 and Shift+F6 move focus between visible widgets.
  - `(v1.5)` Delete removes the selected entry from the Play queue or from a playlist, without confirmation.
  - Keyboard focus is always visible.
- **R27 (v1.1).** Remember queue, current song, position and volume.
  - The app saves them in the OS config directory.
  - `[D]` At startup it restores them and starts paused. It drops queue entries that no longer exist in the library without a message. `(v1.5)` State stores paths relative to the music folder root. The music folder path is stored as set, except in portable mode (R18.1).

### Online and sidecars

- **R7 (v1.4).** One "Online lookups" switch in Settings. Off by default. Off means the app's own code makes zero network calls. The first run shows a notice that explains sidecar files and names the services. It offers "Turn on" and "Keep off". Turning the switch off cancels queued lookups and aborts in-flight requests.
- **R8 (v1.1).** Artwork fetches automatically in the background for albums with no embedded art and no cover image file.
  - Sources: MusicBrainz and Cover Art Archive.
  - It saves `cover.jpg` in the album folder. It never overwrites existing art.
  - `[D]` Name matching: ignore case and accents. Strip a leading year, year or edition words in brackets or parentheses (for example "Remastered" or "Deluxe Edition") and a leading "The". Save only exact matches after this normalization. Do not save low-confidence matches.
  - `[D]` Request an image of about 500 px, not the original. Check that the download is an image and under 10 MB before saving.
  - `(v1.5)` The app never looks up "Unknown Artist" or "Unknown Album" groups, or an album whose songs are directly in the artist folder. It queries a MusicBrainz release group by artist and album and requests the Cover Art Archive front image at 500 px. A lookup counts as a match only when exactly one release group matches after normalization. Two or more matches count as no match. Before a lookup, the app checks that the album folder is writable. If it is not, the app skips the album and logs it.
  - `[D]` No match: record "no match" in the album's JSON sidecar (R10). The app does not retry automatically.
  - `[D]` "Retry lookup" per album clears the marker and tries again.
  - `[D]` "Set cover" per album: the user picks an image file. The app saves it as `cover.jpg` (converting if needed).
  - Rate limit: at most 1 request per second to MusicBrainz. The User-Agent has the app name, version and a project contact URL.
  - The status line shows progress with cancel (R5). The UI stays usable. `(v1.5)`
- **R9 (v1.2).** Lyrics are a per-song action. Source: lrclib. The app saves a `.lrc` file if synced lyrics exist, otherwise a `.txt` file, next to the song.
  - `[D]` Lookup sends the folder artist, the cleaned title (R4), the folder album and the duration from the decoder. If that finds nothing, search by artist and title. Accept a result only if its duration is within 2 seconds.
  - The Lyrics widget shows the lyrics text for the playing song. For `.lrc` files it hides timestamps. `(v1.5)` Lyrics sources in order: a `.lrc` file with the song's base name next to the song, then a `.txt` file with the same base name, then embedded lyrics (ID3v2 USLT, Vorbis comment LYRICS or UNSYNCEDLYRICS). The "Fetch lyrics" button shows only when none exists (disabled when Online lookups are off). `[D]`
  - Synced line highlighting is deferred.
- **R10 (v1.1).** Metadata fill is a per-album action with a preview. The app writes nothing until the user confirms.
  - It fills blanks only (title, track number, year).
  - `[D]` A field is "missing" when the embedded tag is absent or empty. The file-name fallbacks in R4 do not count as filled.
  - It looks up by folder names, existing tags and file name.
  - It does not use audio fingerprinting.
  - It writes one JSON sidecar per album folder. `[D]` The same file holds lookup markers (R8). `(v1.5)` The sidecar file name is `sidecar.json` in the album folder.
  - Embedded tags win over sidecar values.
- **R11.** The app never modifies audio files. Sidecars are not library tracks. Orphan sidecars (audio renamed or deleted) are ignored and never auto-deleted.

### Playlists

- **R12 (v1.2) `[D]`.** Create a playlist, add songs, remove songs and delete a playlist. Delete removes the `.m3u8` file after a confirmation.
  - `[D]` The Playlists widget lists playlists. Each playlist expands to show its songs. Double-click plays a playlist. A "New playlist" button and "Add to playlist" in the context menu create playlists. "Remove from playlist" is a context menu action.
  - `(v1.5)` Add to playlist appends the song. Duplicates are allowed. Favorites is the exception: the heart toggles membership.
  - `(v1.5)` A playlist name must not contain a path separator ("/" or "\\"), the sequence "..", or a character that Windows rejects (< > : " | ? *). It must not start or end with a space or a dot. It must not be a Windows reserved device name (CON, PRN, AUX, NUL, COM1 to COM9, LPT1 to LPT9). "Favorites" is reserved (R26). The app rejects such a name with a message.
- **R13 (v1.1).** Storage is `.m3u8` (UTF-8) in `Playlists/` at the folder root.
  - `[D]` Paths are relative to the playlist file, with forward slashes. A file in `Playlists/` therefore holds paths like `../Artist/Album/Song.mp3`.
  - `[D]` If a target player fails on `..` paths in testing, move playlist files to the folder root. The owner decides.
  - The file name is the playlist name.
  - Writes use a temp file, then a rename.
  - Startup finds `.m3u8` files anywhere in the folder. `(v1.5)` Entries resolve relative to the playlist file. Other playlist files (`.m3u`, `.pls`) are not listed; use Import.
  - Rescan never edits playlists. `(v1.6)` Only import (R14, R32) and the user command "Find missing songs" (R33) write matches.
- **R14 (v1.4).** Import M3U, M3U8 and Apple XML. PLS, XSPF and Apple text are deferred (section 7).
  - The app writes a new `.m3u8` in `Playlists/`. The original file stays untouched.
  - Apple XML is the playlist export from the Apple Music app or iTunes. `[D]`
  - Matching order: relative to the playlist file (M3U family only), then longest path suffix, then file name, then name plus artist plus album against the library (when the source has them). `[D]`
  - `(v1.5)` Before matching, the app normalizes each entry path: backslashes become slashes, a drive letter or UNC prefix is removed, the text is Unicode NFC normalized, and comparison ignores case.
  - `(v1.5)` Each matching stage must yield exactly one library track. If a stage yields more than one, the next stage runs on those candidates only. If the last stage still yields more than one, the entry is reported as ambiguous and stays in the file as missing.
  - For Apple XML, convert each track's `file://` location to a path first. `[D]`
  - Unmatched entries stay in the file as "missing" and appear in an import report.
  - `[D]` A track with no file location (for example a streaming-only track) appears in the import report only. The app does not write it to the `.m3u8`.
  - Encodings: M3U8 is UTF-8. Legacy `.m3u` reads as UTF-8 first, then Windows-1252. `[D]`
  - `[D]` Entry point: a file picker. Matching searches only inside the library. `(v1.6)` The picker accepts more than one file, and a folder import exists (R32).
  - `(v1.6)` Stages 1 and 2 can also match a song with another extension (R33.2).
  - Assumption to verify: MusicBee exports M3U8. Test in the owner's version.
- **R32 (v1.6).** Bulk playlist import.
  - The Import picker accepts more than one file. A second command, "Import folder", takes one folder. Both dialogs run in Rust.
  - A folder import reads every `.m3u`, `.m3u8` and `.xml` file in the folder and in all its subfolders. The extension comparison ignores case.
  - Name rule for every import, also a single file: when a playlist with the same name exists (ignoring case), the app skips the source and reports it as "skipped, name exists". It does not create "Name (2)" for an existing playlist. A source named "Favorites" still gets " (imported)".
  - Two sources in one import with the same name both import. The second gets " (2)", the third " (3)" and so on.
  - One combined report lists each source playlist as imported (matched count, then each missing entry with its reason), skipped (name exists) or failed (with the reason). Labels are file or playlist names, never paths.
  - `[D]` While the import runs, the UI shows a busy state. The import has no Cancel of its own: canceling its scan (R33.1) cancels the whole import. Each playlist is written when it is ready, so a crash keeps the playlists that were already written.
  - An unmatched relative entry (M3U family) is written relative to the new playlist file when it points inside the music folder, so a later "Find missing songs" keeps its folder. Example: `Song.m4a` in `Artist/Album/list.m3u` is written as `../Artist/Album/Song.m4a`. Other unmatched entries keep their entry text (R14).
- **R33 (v1.6).** Matching repair and "Find missing songs".
  - **R33.1 Rescan first.** Import (R14, R32) and "Find missing songs" first run the normal incremental scan, then match. If a scan is running, they wait for it to end. If the user cancels that scan, or it fails, the import or repair stops before matching, writes nothing and shows "Canceled, nothing changed".
  - **R33.2 Other extension.** Stage 1 (relative to the playlist file) and stage 2 (longest path suffix) can match a library song whose extension differs from the entry. The comparison removes the extension of the last part only: stage 1 needs the same relative path, and stage 2 ranks by the longest shared path end, which must still hold at least the album folder and the file name. Example: `Artist/Album/Song.m4a` and `OldRoot/Artist/Album/Song.m4a` both match `Artist/Album/Song.mp3`. Within a stage, a hit with the same extension wins over hits with another extension. Stage 3 (file name only) still needs the same extension. The other R14 rules stay, including the narrowing and the "more than one match" rule.
  - **R33.3 Command.** "Find missing songs" runs on one playlist that has missing entries, including Favorites and `.m3u8` files found anywhere in the music folder. `[D]` A second command, "Find missing songs in all playlists", runs it on each playlist that has missing entries.
  - **R33.4 Write rule.** Each missing entry goes through the R14 stages with its path text and its `#EXTINF` artist and title. A unique match replaces the entry at the same position: the path (relative to the playlist file) and the `#EXTINF` line. Entries with no match or more than one match stay unchanged. The write is atomic (R13). A playlist with no change is not written.
  - **R33.5 Report.** The report lists, per playlist, the number of fixed entries and each entry that is still missing, with its reason (not found or more than one match). Labels are titles or file names, never paths.
- **R26 (v1.2).** Favorites. A heart button on the Now playing widget and on song rows adds or removes the song in `Playlists/Favorites.m3u8`.
  - `[D]` The app creates the file on first use. It is a normal playlist and appears in the Playlists widget.

### Microphone ducking

- **R34 (v1.6).** Lower or pause the music while another app uses a microphone. Windows only in this version.
  - **R34.1 Setting.** Settings has "When the microphone is in use" with three values: Off, Lower volume and Pause. `[D]` The default is Off.
  - **R34.2 Trigger.** The trigger is any other app that records from a microphone, for example a dictation tool (Handy) or a call (Google Meet, Slack, WhatsApp, Signal). The app never opens a microphone itself and never measures sound level. Detection does not depend on the name of an app.
  - **R34.3 Lower volume.** The output volume becomes a set percentage of the user's current volume. The percentage is adjustable in Settings. Default 20%. `[D]` Range 5% to 90%, steps of 5%. Example: volume 60 with 20% plays at 12.
  - **R34.4 Pause.** Playback pauses. When the microphone is free again, playback resumes only if the duck caused the pause.
  - **R34.5 Timing.** `[D]` The volume fades down in about 150 ms. When the microphone is free, the app waits a fixed time of about 1 s, then fades the volume back up in about 500 ms (Lower volume) or resumes with a fade in (Pause). If the microphone starts again during the wait, the duck stays. There is no setting for the wait.
  - **R34.6 User volume.** `[D]` The volume control and the saved volume (R27) always show the user's own volume, never the ducked value. A volume change during a duck sets the user's volume, and the duck applies to the new value.
  - **R34.7 Linux.** The setting shows as unavailable with the note "Windows only".

### Theme

- **R15.** The app starts in a built-in dark theme.
- **R16 (v1.4).** Deferred. The v1 theme is `theme/tokens.json`, compiled at build time (R31). A user-selected theme file is deferred (section 7).
  - Fonts: locally installed only, with a fallback to the system font. The owner may bundle one UI font under the SIL Open Font License.
- **R17 (v1.4) `[D]`.** Docs list which tokens in `theme/tokens.json` the app reads and which UI part each token controls, including widget headers, splitters and drop zones. Docs also describe the JSON sidecar schema (R10), the arrangement file schema (R29), the brand inputs (R31) and the list of copied Magic UI components (R30).

### State, footprint and release

- **R18 (v1.4).** Settings (music folder path, Online lookups switch) live in the OS config directory, per machine. `[D]` Window size is saved there too.
- **R18.1 (v1.5).** Portable mode: if a file named `portable` exists next to the executable, the app stores settings, the widget arrangement, playback state, cache, logs and the WebView profile in a `data` folder next to the executable. The music folder path is stored relative to the executable's folder when both are on the same volume, else absolute.
- **R19 `[D]`.** The SQLite database is a rebuildable cache. Deleting it loses nothing. A schema change triggers a rebuild, with no migrations. The cache holds no lookup markers, so a rebuild causes no new lookups. `(v1.5)` The cache stores paths relative to the music folder root. Thumbnails live in the cache directory.
- **R20 (v1.2).** Footprint targets, measured in the first build and adjustable:
  - Windows installer under 30 MB.
  - Linux `.deb` under 30 MB.
  - Idle memory under 200 MB across all processes with 50,000 tracks.
  - The AppImage is exempt (expected size is 70 MB or more).
  - **Milestone 0 (before feature work):** a footprint spike. It includes the docking code and every widget populated with test data: the Library widget in all three modes with a virtualized 50,000-track list, 2,000 art thumbnails, Play queue, Playlists, Lyrics, Now playing, Transport controls and Search. Measure memory across all processes on Windows and Linux. `(v1.4)` The spike uses the real UI stack (React, Tailwind, shadcn/ui, docking library, and Motion only if R30 names a component).
  - `[D]` If idle memory is more than 50% over target (above 300 MB), stop. The owner decides whether to switch to a native UI or cut layout freedom.
- **R21 (v1.5).** Distribution: Windows per-user installer (no admin), Windows portable zip (the executable plus the `portable` marker file, R18.1), Linux AppImage and `.deb`. Build the AppImage on the R22 baseline system.
- **R22 (v1.5) `[D]`.** Minimum OS: Windows 10 or later. The WebView2 Runtime must be present. It ships with Windows 10 from version 1803 and with Windows 11. The installer downloads it if missing. The portable build must show an error with a download link if it is missing. Linux: glibc-based distributions only. AppImage: glibc 2.35 or later (built on Ubuntu 22.04). `.deb`: Debian 12, Ubuntu 22.04 or later, which ship WebKitGTK 4.1. The owner may tighten these.
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
- "Twenty percent" is the default duck level (R34.3). It is not a fixed value. `(v1.6)`
- Handy, Google Meet, Slack, WhatsApp and Signal are examples of microphone users (R34.2). Detection must work for any app. `(v1.6)`
- "Automatically scan the music library" means rescan, then match (R33.1). Matching against the library already existed (R14). `(v1.6)`

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
- A layout mode, an edit lock or Save and Cancel controls for the arrangement. The arrangement saves automatically (R29). `(v1.7)`
- Playback of `.m4a`, `.flac` or other formats to make a playlist entry play (R33.2 finds another format of the song only). `(v1.6)`
- Fuzzy or typo-tolerant matching of titles and file names. `(v1.6)`
- Opening the microphone or measuring its sound level (R34.2). `(v1.6)`
- Automatic repair of playlists on Rescan (R13). `(v1.6)`
- Replacing an existing playlist on import (R32). `(v1.6)`

---

## 5. Edge cases and failure behavior

- **No music folder set `(v1.5)`:** R1.1 applies.
- **Music folder changed in Settings `(v1.5)`:** the app stops playback, resets the position, clears the queue and the cache, then scans the new folder and reloads its playlists. Entries from the old folder never remain in the cache.
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
- **Read-only music folder `(v1.5)`:** fetch features, playlist edits and Favorites show an error. Playback and browsing work.
- **Decode error during playback `(v1.5)`:** R6 applies.
- **File name that is not valid UTF-8 (Linux) `(v1.5)`:** skip it and log it.
- **Cover image file that fails to decode `(v1.5)`:** log it and ignore it. Embedded art and, when enabled, the online lookup still apply.
- **Corrupt sidecar:** ignore it and log it. A later metadata fill may replace it after the preview.
- **Playlist entry with no file:** shown as "missing" and skipped in playback. It is never removed automatically.
- **Unreadable playlist file:** skip it and log it.
- **Playlist write failure:** show the error. The old file stays intact (temp file, then rename).
- **Layout problems `[D]`:** a corrupt layout file, an unknown widget or a missing Library widget follow R29.
- **Transport controls hidden `[D] (v1.5)`:** keyboard shortcuts (R25) and media keys (R24) still work. Reset layout restores the default.
- **Window smaller than a saved layout needs `[D]`:** the app enforces a minimum window size and a minimum size per widget. It clamps the layout to fit.
- **Window too short for the bar widgets `(v1.7)`:** the bar widgets keep their fixed heights (R29.1). The other widgets and the Library frames shrink first, down to their minimums. Then the existing clamp applies.
- **One bar widget shown `(v1.7)`:** it keeps its own row. Showing the other one from the Widgets menu puts it in the same row.
- **Corrupt or unknown frame-size data `(v1.7)`:** the default frame sizes apply for that mode and the error is logged. The rest of the arrangement loads.
- **Empty Play queue, Playlists or Lyrics widget `[D]`:** show a short hint, not a blank area.
- **Audio device unplugged or changed during playback `[D] (v1.5)`:** on an output stream error, the app stops playback and shows a message. The next Play opens the current default device.
- **Second app launch `[D]`:** focus the running instance. Do not start a second one.
- **Closing the window `[D]`:** quits the app. Media keys work only while the app runs.
- **Folder edited while the app runs:** changes appear after Rescan or restart.
- **Folder import with other files `(v1.6)`:** an `.xml` file that is not an Apple Music playlist export, or an unreadable file, shows as failed in the report. The other files still import.
- **Same song in two other formats `(v1.6)`:** an entry `Song.m4a` with `Song.mp3` and `Song.ogg` in the same folder gives two hits. The R14 narrowing applies; if the last stage still has more than one, the reason is "more than one match".
- **Find missing songs on a read-only folder `(v1.6)`:** the app shows the error and writes nothing.
- **Bare entries from an import before v1.6 `(v1.6)`:** an entry with no folder part (for example `Song.m4a`) lost its source folder, so "Find missing songs" cannot match it by folder. Delete that playlist and import the source again; the new import matches with the source folder (R32).
- **A tool that keeps the microphone open `(v1.6)`:** the music stays ducked while the tool runs. Example: the Handy setting "Always-On Microphone" (off by default). The Settings help text names this case.
- **Microphone in use while playback is stopped or paused by the user `(v1.6)`:** nothing happens. A later Play plays at the ducked volume (Lower volume) or plays normally until the next microphone start (Pause).
- **Play pressed during a Pause duck `(v1.6)`:** playback continues. The app does not pause again until the microphone is free and then starts again.
- **Track change, seek or queue edit during a duck `(v1.6)`:** the duck stays.
- **Setting changed to Off during a duck `(v1.6)` `[D]`:** the volume fades back at once (Lower volume), or a track that the duck paused resumes (Pause).
- **Stop during a Pause duck `(v1.6)`:** playback stays stopped when the microphone is free.
- **Mode changed during a duck `(v1.6)` `[D]`:** the new mode applies at once. Lower volume to Pause: playback pauses (a duck pause) and the gain returns to the user volume. Pause to Lower volume: a duck-paused track resumes at the ducked volume.

---

## 6. Confirmed constraints

- **Stack:** Tauri v2 with a Rust backend (audio decoding and playback), SQLite, and a React UI with Tailwind CSS and shadcn/ui (R30). Magic UI and Motion only by named component. Revisit if Milestone 0 fails (R20). `(v1.4)`
- **Branding `[D]`:** no feature code depends on the placeholder name, icon or theme. All brand inputs are the files named in R31. `(v1.4)`
- **Docking `[D]`:** a docking library may be used if its license is MIT or compatible, it has React bindings and it passes Milestone 0. One example is the MIT Dockview with its React package. Do not use commercial add-ons (Dockview Enterprise is commercial). Turn off floating panels and pop-out windows (section 4). Tabbed groups stay on (R29). `(v1.4)`
- **Complexity budget (the owner's "massively simpler than MusicBee"):** a fixed widget list (R5), no per-view overrides, no named layouts, no floating panels, no pop-out windows and no layout import or export in v1. `(v1.4)` Adding any of these needs an owner decision.
- **Audio engine `[D] (v1.5)`:** rodio pinned to a release, Symphonia with the `mp3` feature, lofty for tags. Design it so gapless playback can be added later (decode the next track ahead of time). Gapless is not in v1.
- **License `(v1.5)`:** MIT application. Symphonia is MPL-2.0. The AppImage bundles WebKitGTK and GTK (LGPL). Each release ships the license texts of bundled and linked third-party components and states, per component, the exact version and where its source is available. This covers Symphonia in every build and the LGPL libraries bundled in the AppImage. The repo keeps this list in a NOTICE file. Strawberry is GPL-3.0, so do not copy its code into an MIT project.
- **Platforms:** Windows and Linux (R22). `(v1.6)` Exception: microphone ducking (R34) is Windows only in this version.
- **Microphone privacy `(v1.6)`:** the app reads only whether another app uses a microphone. It never records audio and never logs app names.
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
- Keyboard resize of splitters, for the dock and the Library frames (R28.1). `(v1.7)`
- A content scale or density setting (row height, text and thumbnail size). `(v1.7)`
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
- Microphone ducking on Linux (PipeWire and PulseAudio). `(v1.6)`
- An exclusion list of apps that do not trigger ducking. `(v1.6)`
- Picking the right song by hand for a "more than one match" entry. `(v1.6)`
- An adjustable wait time before the music comes back (R34.5). `(v1.6)`

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

Version 1.5 applies section G of the requirements review (`docs/REQUIREMENTS_REVIEW.md`) with these owner decisions, also made on October 11, 2026:

9. **Portable mode (R18.1) and a Windows portable zip (R21):** added.
10. **Search (R5):** a field in the Library header, not a separate widget.
11. **Scan report (R2):** counts in the status line and Settings, per-file reasons in the log.
12. **Lookup progress (R5, R8):** cancel only; pause removed.
13. **Previous (R6):** restarts the current song after 3 seconds.
14. **Playlist duplicates (R12):** allowed; Favorites toggles.
15. **Linux baseline (R22):** Ubuntu 22.04, glibc 2.35.
16. **Brand UI icon set override (R31):** kept for v1.

Defaults applied without a decision, changeable: three consecutive decode failures stop playback (R6); the sidecar file is `sidecar.json` (R10); acceptance check 2 uses a 100 ms redraw limit.

Version 1.6 adds bulk import, missing-song repair and microphone ducking, with these owner decisions made on October 12, 2026:

17. **Bulk import (R32):** several files or one folder, with all subfolders.
18. **Name rule (R32):** an existing name is skipped for every import. Names that repeat inside one import get " (2)".
19. **Matching (R33.2):** another extension matches when the folder and the file name without extension match.
20. **Repair (R33.3):** a "Find missing songs" command on existing playlists, not an automatic repair on Rescan.
21. **Repair writes (R33.4):** unique matches are written, then a report. No preview.
22. **Rescan first (R33.1):** import and repair run the incremental scan first.
23. **Ducking trigger (R34.2):** another app records from a microphone. The app never opens the microphone.
24. **Ducking platform (R34):** Windows first. Linux is deferred.
25. **Duck level (R34.3):** a percentage of the current volume, default 20%.
26. **Resume (R34.5):** a short fixed wait, then a fade. No setting for the wait.
27. **Ducking modes (R34.1):** the user picks Lower volume or Pause.
28. **Bare entries (R32, section 5):** playlists imported before v1.6 with bare entries are fixed by a new import, not by a looser match. New imports write unmatched relative entries relative to the new file.

The owner reported that most missing songs in imports had the reason "not found" and that some sources name `.m4a` or `.flac` files. R33.2 addresses this.

Version 1.7 adds Library frame splitters and fixed-height bar widgets, with these owner decisions made on October 12, 2026:

29. **Component size (R28.1):** splitters between the Library frames. Content scale is deferred.
30. **Layout mode:** none. Normal mode gets the fixes. The current arrangement keeps saving automatically (R29).
31. **Bar height (R29.1):** Transport controls get a fixed natural height.
32. **Side drops (R29.1):** refused for bar widgets.
33. **Tabbing (R29.1):** refused both ways for bar widgets.
34. **Now playing (R29.1):** a bar widget too. The two bar widgets can share one row.
35. **Frame sizes (R28.1):** kept per Library mode.
36. **Old arrangements (R29.1):** repair only the widget that breaks the rules.
37. **Splitter input (R28.1):** mouse only.

The owner reported that a drop of Transport controls on the window top edge gave a large square, not a thin bar. Drop size was the only drag problem named.

Still to verify: the R13 path base after the interop test, the R14 MusicBee M3U8 export, the R20 Milestone 0 outcome, and `(v1.6)` that Windows reports a microphone in use by another app without the app opening the microphone (R34.2).

---

## 9. Acceptance checks for v1 `[D]`

1. **Footprint spike (Milestone 0):** passes the R20 targets or triggers the owner decision.
2. **Responsiveness `(v1.5)`:** during the first scan of the 50,000-track test library, the user can select and play an already-scanned song, and the window redraws within 100 ms of input.
3. **Playlist interop:** a playlist written by the app opens in at least one other player (MusicBee or VLC) with all paths intact.
4. **Import:** real exports import with a correct matched/missing report. Use one Apple XML, one MusicBee M3U8 and one legacy `.m3u`. `(v1.4)`
5. **Lyrics:** a song named "01 - Title.mp3" finds lyrics through the cleaned title and the decoded duration.
6. **Artwork:** an album folder named "1973 - Album (Remastered)" matches after normalization. "Set cover" and "Retry lookup" both work.
7. **Theme build `(v1.4)`:** changing a color in `theme/tokens.json` and rebuilding changes the UI. (Replaces the theme lockout check. R16 is deferred.)
8. **Missing folder:** startup with the folder missing loses no data. Change folder works.
9. **Cache rebuild:** deleting the cache restores the same library and playlists, with no new lookups for albums that have a "no match" marker.
10. **Audio device `(v1.5)`:** unplugging the output device mid-song stops playback with a message. Play resumes on the default device.
11. **Docking:** in each Library mode, the user can dock, resize, hide and show widgets. The arrangement survives a restart.
12. **Built-in layouts `(v1.4)`:** applying each built-in layout works. A tabbed group survives a restart. (Named layouts are deferred.)
13. **Layout lockout `(v1.5)`:** with Transport controls hidden, keyboard shortcuts and media keys still work. Reset layout restores the default.
14. **Library widget:** it cannot be closed. Switching its mode keeps the selection and search text.
15. **Branding swap `(v1.4)`:** replacing `theme/tokens.json` and the icon source and rebuilding changes the theme and the app icon with no other code changes.
16. **Reduced motion `(v1.4)`:** with the OS reduce-motion setting on, no animation plays. Applies to Magic UI components only if R30 names any.
17. **Portable mode `(v1.5)`:** after use, copy the whole portable folder (executable, `portable` marker and `data` folder) and the music folder to another drive letter. Start it. Settings, the arrangement and the queue survive.
18. **Multi-disc `(v1.5)`:** a two-disc album plays disc 1 then disc 2 in track order.
19. **Decode error `(v1.5)`:** a corrupt file in the queue is skipped with a status message. Playback continues.
20. **First run `(v1.5)`:** first run shows the folder prompt. After choosing a folder, the user can play a song before the scan ends.
21. **Embedded lyrics `(v1.5)`:** a song with ID3 USLT lyrics and no lyric file shows the embedded lyrics.
22. **Bulk import and repair `(v1.6)`:** several playlist files picked in one picker action import together, and a folder with the owner's playlists imports in one action. Entries that name `.m4a` or `.flac` files match the `.mp3` copies in the same album folders. "Find missing songs" fixes such entries in playlists imported before.
23. **Microphone ducking `(v1.6)`:** on Windows, with Lower volume at 20%, the music drops while Handy records and comes back about 1 s after it stops. With Pause, the music pauses and resumes. The same works during a call in one call app.
24. **No microphone access `(v1.6)`:** after a ducking test, the Windows microphone privacy settings list no microphone use by the app.
25. **Library frames `(v1.7)`:** in Columns and Top/bottom modes, the user drags each frame splitter. Each mode keeps its sizes after a mode switch and a restart. Reset layout restores the defaults.
26. **Bar widgets `(v1.7)`:** a drop of Transport controls on the window top edge gives a full-width row at its fixed height. A side drop beside Library and a drop into a tab group are refused. Transport controls and Now playing can share one row.
27. **Old arrangement `(v1.7)`:** a saved arrangement with Transport controls in a tab group starts with Transport controls in the bottom bar and the rest unchanged. The log names the repair.

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

- **1.7 (October 12, 2026):** Library frame splitters and fixed-height bar widgets, with owner decisions 29 to 37 (section 8).
  - **Added:** R28.1, R29.1, an outcome bullet (section 1), one non-goal, three edge cases, two deferred ideas, acceptance checks 25 to 27.
  - **Changed:** R5 (Transport controls and Now playing are bar widgets), R29 (tabbed groups exclude bar widgets).
- **1.6 (October 12, 2026):** bulk import, missing-song repair and microphone ducking, with owner decisions 17 to 28 (section 8).
  - **Added:** R32, R33, R34, outcome bullets (section 1), preferences (section 3), five non-goals, eleven edge cases, platform and privacy constraints (section 6), four deferred ideas, acceptance checks 22 to 24.
  - **Changed:** R13 (only import and "Find missing songs" write matches), R14 (multi-file picker, folder import, other extension).
- **1.5 (October 11, 2026):** section G of the requirements review applied, with owner decisions 9 to 16 (section 8).
  - **Added:** R1.1 first run, R18.1 portable mode, WAV encodings (R1), scan rules (R2), sort order and multi-disc order (R3, R4), playback semantics and queue edits (R6), OS command set (R24), Delete key (R25), relative paths (R19, R27), artwork match and writability rules (R8), lyrics source order with embedded lyrics (R9), sidecar name (R10), playlist name rule and duplicates (R12), import normalization and unique-match rule (R14), Linux baseline and WebView2 prerequisite (R22), portable zip (R21), five edge cases, acceptance checks 17 to 21.
  - **Changed:** Search moved into the Library header (R5, R28, R29, R25). Scan report reduced to counts plus log (R2). Lookup pause removed (R5, R8). Audio device case softened (section 5, check 10). Audio engine and license constraints (section 6). Checks 2 and 13.
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
