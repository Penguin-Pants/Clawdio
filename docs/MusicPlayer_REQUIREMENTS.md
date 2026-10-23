# Minimalist Open Source Music Player: Requirements

**Status:** Decision-complete. Version 1.12, October 23, 2026. Version 1.8 is a change list for the owner's approval (UQ4 in `docs/planning/ui-shell-rework-build-plan.md`). Version 1.9 holds two owner decisions made after the rework merged. Version 1.10 adds automatic lyrics fetch and a selection that follows the playing song. Version 1.11 adds type-to-find in lists. Version 1.12 restores the Library selection at startup.
**Open questions:** None. Section 8 records the owner decisions of versions 1.4 to 1.12.

**How to read this file**
- `[D]` marks a detail derived from the owner's answers. The owner did not state it. It is not yet explicitly confirmed. Change any `[D]` item freely.
- `(v1.12)` marks an item changed or added in version 1.12 (owner decision 46 in section 8).
- `(v1.11)` marks an item changed or added in version 1.11 (owner decision 45 in section 8).
- `(v1.10)` marks an item changed or added in version 1.10 (owner decisions 41 to 44 in section 8).
- `(v1.9)` marks an item changed in version 1.9 (owner decisions 39 and 40 in section 8).
- `(v1.8)` marks an item changed or added in version 1.8 (the UI shell rework, owner decision 38 in section 8; the source is `docs/planning/ui-shell-rework.md`, called "the rework"). `(v1.7)` marks an item changed or added in version 1.7 (Library frame splitters and fixed-height bar widgets, owner decisions 29 to 37 in section 8). `(v1.6)` marks an item changed or added in version 1.6 (bulk import, missing-song repair and microphone ducking, owner decisions 17 to 28 in section 8). `(v1.5)` marks an item changed in version 1.5 (requirements review, section G, with owner decisions in section 8). `(v1.4)` marks an item changed in version 1.4. `(v1.3)` marks an item changed or added in version 1.3. The change log at the end lists each change. Items marked `(v1.1)` or `(v1.2)` changed in earlier versions.
- Items with neither mark come from the owner's own words or from approved defaults 1 to 18.

---

## 1. Problem and desired outcome

The closest open source player (Strawberry) has many features the owner does not want. Its Windows releases are sponsor-only.

**Outcome:** a small, open source music player for Windows and Linux.
- The user points it at one music folder.
- It shows artist, album and song, and plays mp3, ogg and wav.
- The UI is made of widgets. The user docks, resizes, hides and shows them. Three presets exist. `(v1.8)`
- The user resizes the Artist, Album and Songs frames in the Library. The transport band keeps its height at every window size and never covers the lists. `(v1.8)`
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
  - **Transport controls:** a fixed band across the full window width, between the header and the dock (or below the dock, R29). It is not a dock widget. Its height comes from a theme token and the user cannot drag it. Its content changes with its own width; controls that do not fit move to an overflow menu, and play/pause always shows. It shows the album art, title and artist of the current song. `(v1.8)` Buttons: play/pause, stop, previous, next, shuffle and repeat. `[D]` The seek bar and volume control are part of this widget. `(v1.5)` It shows elapsed time and total time next to the seek bar.
  - **Now playing:** movable and hideable. A dockable card with album art, title, artist, album, the heart button (R26), the seek bar and the play buttons. It shares the player state with the transport band. Hidden by default. `(v1.8)`
  - **Playlists:** movable and hideable (R12 to R14).
  - **Play queue:** movable and hideable (R6).
  - **Lyrics:** movable and hideable (R9).
  - **Search:** a text field in the Library widget header (R28). It is not a separate widget. `(v1.5)`
  - **Status line:** fixed at the bottom edge of the window. It is not dockable. `[D]` It shows "Ready" when idle, and progress text with a cancel control during scans and lookups (for example "Fetching artwork: 14 of 62 albums"). `(v1.5)` Pause is removed; cancel plus "Retry lookup" covers it.
  - **Menu button:** fixed in the top-right corner. It is not dockable. It opens View (the widget list), Library mode, Layout (presets, Lock layout, transport position, Reset layout), Settings and Rescan. `[D]` `(v1.8)`
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
  - `(v1.8)` In Columns and Top/bottom modes the Songs list is a table with the columns #, Title, Artist, Album and Time. Columns resize (with a minimum width), auto-size, reorder and hide; # and Title cannot be hidden and # cannot move. The header is sticky and scrolls horizontally with the rows. A click on a header sorts by that column, a second click reverses it and a third returns to the R4 order; Shift+click adds a second sort key. Column state saves per mode, apart from the arrangement. Tree mode has no table.
  - `(v1.8)` The Songs table has multi-select: click, Ctrl+click, Shift+click and Shift+arrow keys. Enter plays the active row. Add to queue and Add to playlist act on the selection. Selected rows can be dragged to a playlist or to the Play queue. A density setting (regular or compact rows) changes the row height.
- **R28.1 (v1.7).** Library frame splitters.
  - Columns mode has a splitter between Artist and Album and one between Album and Songs.
  - Top/bottom mode has a splitter between Artist and Album and one between the top row and Songs.
  - Tree mode has one frame and no splitter.
  - Each frame has a minimum size, so no frame collapses. The clamp for small windows (section 5) also applies to frames.
  - Splitters work with the mouse and the keyboard (R29). They look and behave like the dock splitters (R30). `(v1.8)`
  - Columns and Top/bottom each keep their own frame sizes. Switching the mode does not reset them.
  - Frame sizes are part of the arrangement (R29). They save automatically and restore at startup.
  - Reset layout and applying any preset restore the default frame sizes of all modes. `(v1.8)`
- **R29 (v1.2).** Docking and layouts.
  - Free-form drag-and-drop docking inside the main window. The user drags a widget by its header and drops it on the edge of another widget or of the window. Splitters resize widgets.
  - `(v1.8)` Floating groups inside the main window are allowed: a widget floats from its tab or the Layout menu and docks again the same way. Pop-out windows are not in v1. Tabbed groups are allowed. `(v1.7)` The saved arrangement must round-trip a tabbed group `(v1.8)` and a floating group.
  - `(v1.8)` **Presets:** "Apple Music classic" (default at first run), "MusicBee style" and "Compact". A preset sets a widget arrangement and keeps the Library mode. `[D]` Presets cannot be changed or deleted. The Library mode (Tree, Columns, Top/bottom) is its own menu choice.
  - `(v1.8)` **Default arrangement:** Playlists at the left, Library in the center, Play queue and Lyrics as tabs at the right, Now playing hidden, the transport band at the top.
  - `(v1.8)` **Lock layout:** a menu toggle that stops widget drag and splitter resize. Column resize, scrolling and the widget show and hide items still work. Unlocked on a fresh install.
  - `(v1.8)` **Transport position:** the band sits at the top (default) or at the bottom. No left or right placement.
  - `(v1.8)` **Splitters:** a 1 px line with a hit area of at least 6 px. Double-click resets the default size. The keyboard follows the W3C window splitter pattern: arrow keys, Home, End, and Enter to collapse or restore. Sidebar widths use pixels and the center absorbs window resize. A narrow Playlists widget shows an icon rail. A drag cannot shrink a widget to zero; collapse is an explicit action with a restore control.
  - `(v1.4)` User-saved named layouts are deferred (section 7).
  - `[D]` The current arrangement is one JSON file in the OS config directory, per machine. It does not store window size. It is versioned. `(v1.8)` A file with an unknown version, or one that fails validation, is backed up as `layout.json.bak`, logged, and the default preset loads. The window size and position save in `settings.json`. `(v1.5)` Import and export are deferred.
  - `[D]` The current arrangement saves automatically and restores at startup. Applying a layout replaces the current arrangement.
  - `[D]` **Reset layout** applies the default preset, the Columns Library mode, the default frame sizes, the band at the top and unlocked. `(v1.8)` The menu button offers it, and a documented keyboard shortcut also runs it. No layout can hide the menu button or the status line. `(v1.5)`
  - `[D]` **Non-drag path:** the menu button offers show and hide for each widget, switching the Library mode and applying presets `(v1.8)`, and float, dock, collapse and restore for the active widget. Moving a widget needs drag in v1.
  - `[D]` Corrupt layout file: back it up, log it and load the default preset `(v1.8)`. Unknown widget in a layout: ignore that widget. Layout without the Library widget: apply the default preset.
- **R29.1 (v1.7).** Removed in v1.8: its bar-widget rules (a fixed natural height for Transport controls and Now playing, no side drops, no tabbing, repair of old arrangements) no longer apply. R5 now defines the transport band and the Now playing card. `(v1.8)`
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
  - Space toggles play/pause (not while typing in search). `(v1.11)` Not while a type-to-find text is active (R36.6).
  - Up and Down move through lists and the tree. Right expands. Left collapses.
  - Enter plays the selected song or album.
  - Ctrl+F focuses the search field in the Library header. `(v1.5)` Esc clears search and returns focus to the Library widget.
  - F6 and Shift+F6 move focus between visible widgets.
  - `(v1.5)` Delete removes the selected entry from the Play queue or from a playlist, without confirmation.
  - Keyboard focus is always visible.
- **R27 (v1.1).** Remember queue, current song, position and volume.
  - The app saves them in the OS config directory.
  - `[D]` At startup it restores them and starts paused. It drops queue entries that no longer exist in the library without a message. `(v1.5)` State stores paths relative to the music folder root. The music folder path is stored as set, except in portable mode (R18.1).
- **R35 (v1.10).** The selection follows the playing song.
  - **R35.1 Lists.** The Library Songs list (the Songs table in Columns and Top/bottom modes, the song rows in Tree mode and the playlist view) and the Play queue. The Artist and Album lists do not follow.
  - **R35.2 Condition.** A list follows only when it already has a selected row.
  - **R35.3 Action.** When the playing song changes, the playing song becomes the only selected row in that list and the list scrolls to show it. A multi-selection is replaced.
  - **R35.4 Focus.** Keyboard focus never moves. If focus is in that list, its active row becomes the playing row.
  - **R35.5 Busy.** A list does not follow while a menu, a dialog or a drag is open, or within 5 s of the user's last input in that list. `[D]` The 5 s value is a starting value.
  - **R35.6 Not in view.** If the playing song is not in the list as shown (another Artist or Album selection, a search, another playlist), that list does not change. No filter, search or Library view changes.
- **R36 (v1.11).** Type-to-find in lists.
  - **R36.1 Lists.** The Artist list, the Album list, the Songs table, the playlist view, the Play queue, the Library tree (Tree mode) and the Playlists widget list. `[D]` The narrow Playlists icon rail (R29) shows no names, so it has no type-to-find.
  - **R36.2 Trigger.** The list has keyboard focus and the user types a printable character with no Ctrl, Alt or Meta key. Shift is allowed.
  - **R36.3 Typed text.** Each character adds to the typed text. After 1 s with no character, the typed text resets. `[D]` The 1 s value is a starting value.
  - **R36.4 Match.** A row matches when its name starts with the typed text. The match ignores case. `[D]` It also ignores accents, as the R3 sort does. The search always starts at the top of the list as shown, and the first match wins. A repeated letter adds to the typed text: "zz" finds a name that starts with "zz".
  - **R36.5 Name.** Artist and Album lists: the display name. `[D]` The "All" row is not a name and never matches. Songs table: the value in the column the table is sorted by (the first sort key), or Title when the table has no column sort. Playlist view and Play queue: Title. Playlists widget: the playlist name. Library tree: the row label, on the rows shown now (expanded), at any level. A collapsed node does not open.
  - **R36.6 Space.** While the typed text is not empty, Space adds a space to it. With no typed text, Space works as R25 says. A focused column header keeps Space for its sort.
  - **R36.7 Jump.** A match moves the active row and the selection as one Down key does, and scrolls the row into view, also when the row was out of view. A multi-selection becomes the matched row. Keyboard focus stays in the list. Exception, the same as for Down: a playlist picked while the Playlists widget and the Library widget share a tab group shows the Library, and focus moves to the playlist view (R12 v1.9).
  - **R36.8 No match.** The active row and the selection do not change. No sound and no status line text.
- **R37 (v1.12).** The Library selection restores at startup.
  - **R37.1 Saved items.** The Artist selection, the Album selection and the active row of the Songs table. "All" and "nothing selected" are saved values too. The other rows of a multi-selection are not saved.
  - **R37.2 Save.** The selection saves automatically with the R27 state. `[D]` After a crash, the last saved selection restores.
  - **R37.3 Restore.** At startup the saved selection applies in the saved Library mode (Columns, Top/bottom or Tree). Each restored row scrolls into view. The search text is not saved, so the lists start with no filter.
  - **R37.4 Tree mode.** Only the artist and album nodes above the restored row open. All other nodes stay closed.
  - **R37.5 Focus.** Keyboard focus does not move. It starts where it starts with no saved selection.
  - **R37.6 Missing.** A saved artist, album or song that is not in the library does not restore. The levels above it restore. That level and the levels below it become "All" (Artist and Album lists) or no selection (Songs). No message. Example: the artist exists and the album is gone; the artist is selected, the Album list shows "All" and no song is selected.
  - **R37.7 Not in view.** A saved song that is in the library but not in the Songs list as shown (for example, it moved to another album) does not restore. No song is selected.
  - **R37.8 Follow.** A restored song is a selected row for R35.2, so the Songs list follows the next song change.

### Online and sidecars

- **R7 (v1.4).** One "Online lookups" switch in Settings. Off by default. Off means the app's own code makes zero network calls. The first run shows a notice that explains sidecar files and names the services. It offers "Turn on" and "Keep off". Turning the switch off cancels queued lookups and aborts in-flight requests.
  - `(v1.10)` The services are MusicBrainz, Cover Art Archive, LRCLIB and lyrics.ovh. The first-run notice names all four.
  - `(v1.10)` `[D]` A user who accepted the notice before version 1.10 sees the updated notice once. Until they answer, the app sends nothing to lyrics.ovh.
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
- **R9.1 (v1.10).** Automatic lyrics fetch.
  - **Setting.** Settings has "Fetch lyrics automatically" under "Online lookups". On by default. It is disabled and does nothing while "Online lookups" is off (R7). It is saved with the other settings (R18).
  - **When.** The app fetches for the playing song (playing or paused, not stopped) when that song has no lyrics from any R9 source. It also fetches for the next song in play order, which follows shuffle, after the playing song's fetch. This is best effort: a quick skip can start the next song before its file exists. With Repeat one there is no next song.
  - **Skip.** It skips a song that has a lyrics "no match" marker (R9.3).
  - **Result.** A fetched file shows in the Lyrics widget at once, as with the manual action.
- **R9.2 (v1.10).** Lyrics source chain. "Fetch lyrics" and the automatic fetch use the same chain, in this order. The first accepted result wins.
  1. LRCLIB `/api/get` with the R9 fields.
  2. LRCLIB `/api/search` by artist and title (R9).
  3. `[D]` More LRCLIB queries: without the album, then with a looser cleaned title. Each one keeps the 2 s rule. The looser-title query runs only when the looser title is not blank and differs from the cleaned title.
  4. lyrics.ovh with the folder artist and the cleaned title. lyrics.ovh sends no duration, so the 2 s rule does not apply. Any result with text that is not blank is accepted and saved as `.txt`.
  - The save rule of R9 stays: `.lrc` for synced lyrics, else `.txt`, next to the song. The app never replaces a file with lyrics in it.
- **R9.3 (v1.10).** Lyrics "no match".
  - When every source in the chain gives no result, the app records a lyrics "no match" marker for that song in the album's `sidecar.json` (R10), keyed by the song's path inside the album folder.
  - `[D]` A song that is not in an album folder (directly in an artist folder or in the music folder root) gets no marker. The automatic fetch tries it at most once per app run.
  - The automatic fetch never retries a song with the marker. "Fetch lyrics" clears the marker and runs the chain again.
  - An error (network, timeout, HTTP 429 or 503) is not "no match". It writes no marker.
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
  - `(v1.9)` The Playlists widget lists playlists. Selecting a playlist shows its songs in the Library widget, in playlist order, in place of the Artist, Album and Songs lists; a "Library" button and Ctrl+F go back. Double-click or Enter on a playlist plays it; on a song, plays the playlist from that song. Delete removes the selected song from the playlist. A "New playlist" button and "Add to playlist" in the context menu create playlists. "Remove from playlist" is a context menu action.
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
- "Keep trying different services" is met by the R9.2 chain. The extra LRCLIB queries in R9.2 step 3 are examples. `(v1.10)`
- "Focus or highlight moves to the playing song" means the selection (R35). Keyboard focus does not move. `(v1.10)`
- "Highlighted" in the R37 request means the selection, as for R35. Keyboard focus does not move. `(v1.12)`
- The file that holds the saved selection (R37) is an implementation choice. `(v1.12)`
- "Like MusicBee" for type-to-find (R36) is a feel reference. It is not a specification to copy. "Chemical Brothers" and "ZZ Top" are examples. `(v1.11)`

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
- Pop-out windows (not selected for v1). `(v1.4)` Tabbed groups are allowed (R29). `(v1.8)` Floating groups inside the main window are allowed (R29).
- Per-view layout overrides beyond the Songs column state (R28). `[D]` `(v1.8)`
- A layout mode or Save and Cancel controls for the arrangement. The arrangement saves automatically (R29). `(v1.7)` `(v1.8)` Lock layout is allowed (R29).
- Playback of `.m4a`, `.flac` or other formats to make a playlist entry play (R33.2 finds another format of the song only). `(v1.6)`
- Fuzzy or typo-tolerant matching of titles and file names. `(v1.6)`
- Opening the microphone or measuring its sound level (R34.2). `(v1.6)`
- Automatic repair of playlists on Rescan (R13). `(v1.6)`
- Replacing an existing playlist on import (R32). `(v1.6)`
- Lyrics fetch for the whole library in the background (R9.1 fetches the playing and the next song only). `(v1.10)`
- Lyrics services that need an API key or an account, for example Musixmatch or Genius. `(v1.10)`
- The Artist and Album lists follow the playing song (R35.1). `(v1.10)`
- Type-to-find filters a list. The Library search (R23) filters; R36 only moves the selection. `(v1.11)`
- Type-to-find opens collapsed tree nodes, or matches text in the middle of a name or in other columns (R36.4, R36.5). `(v1.11)`
- A type-to-find overlay that shows the typed text. `(v1.11)`
- Restore at startup of the search text, the open playlist view, the Tree expand state (other than the path to the restored row), scroll positions (other than the restored row in view), the Play queue selection or the Playlists widget selection (R37). `(v1.12)`
- Keyboard focus on the restored row at startup (R37.5). `(v1.12)`

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
- **Transport band in mini player mode `(v1.8)`:** the window shows only the band. Keyboard shortcuts (R25) and media keys (R24) still work.
- **Window smaller than a saved layout needs `[D]`:** the app enforces a minimum window size and a minimum size per widget. It clamps the layout to fit.
- **Window too short for the widgets `(v1.8)`:** the transport band keeps its height. The dock widgets and the Library frames shrink, down to their minimums. Then the existing clamp applies.
- **Floating group outside the window `(v1.8)`:** after a load or a window resize, it moves back inside the window.
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
- **Lyrics source error `(v1.10)`:** a network error, a timeout or HTTP 429 or 503 from one source moves on to the next source. If no source accepts a result and any source had an error, the app writes no marker and tries again the next time the song plays.
- **Read-only song folder during an automatic lyrics fetch `(v1.10)`:** skip the song and log it (R23). No request, no marker and no status line error.
- **Song changes during a lyrics fetch `(v1.10)`:** the fetch continues and saves its file. The Lyrics widget changes only if that song is playing.
- **Wrong song version from lyrics.ovh `(v1.10)`:** a live or remix version can give other lyrics. The owner accepts this risk. The user deletes the file and uses "Fetch lyrics" again.
- **Online lookups turned off during a lyrics fetch `(v1.10)`:** R7 applies: queued fetches stop and in-flight requests abort. No marker is written.
- **Playing song changes while a list is busy `(v1.10)`:** that list does not follow for this song change (R35.5). It follows at the next song change.
- **Type-to-find in the Artist or Album list `(v1.11)`:** the new selection filters the other lists, as a Down key does (R36.7).
- **Type-to-find and the selection follow `(v1.11)`:** a typed character is input in that list, so R35.5 applies.
- **Type-to-find with an open menu, dialog or row drag `(v1.11)`:** the keys go to that control. No find.
- **Type-to-find in an empty list `(v1.11)`:** nothing changes.
- **Saved selection before the library is ready `(v1.12)` `[D]`:** the restore waits for the library, as the R27 queue restore does. If the user selects a row first, the user's selection wins and the saved one is dropped.
- **Music folder changed `(v1.12)` `[D]`:** the saved selection belongs to the old folder. It is dropped. Nothing is selected.
- **Saved selection that cannot be read `(v1.12)` `[D]`:** it is ignored and logged. Nothing is selected. The rest of the R27 state still restores.
- **Reset layout `(v1.12)`:** the selection does not change. It is not part of the arrangement (R29).
- **Leading articles `(v1.11)`:** a name such as "The Chemical Brothers" matches "t", because names are folder names, unchanged (R3).

---

## 6. Confirmed constraints

- **Stack:** Tauri v2 with a Rust backend (audio decoding and playback), SQLite, and a React UI with Tailwind CSS and shadcn/ui (R30). Magic UI and Motion only by named component. Revisit if Milestone 0 fails (R20). `(v1.4)`
- **Branding `[D]`:** no feature code depends on the placeholder name, icon or theme. All brand inputs are the files named in R31. `(v1.4)`
- **Docking `[D]`:** a docking library may be used if its license is MIT or compatible, it has React bindings and it passes Milestone 0. One example is the MIT Dockview with its React package. Do not use commercial add-ons (Dockview Enterprise is commercial). Turn off pop-out windows (section 4). Tabbed groups and floating groups inside the main window stay on (R29). `(v1.8)`
- **Complexity budget (the owner's "massively simpler than MusicBee"):** a fixed widget list (R5), no per-view overrides, no named layouts, no pop-out windows and no layout import or export in v1. `(v1.4)` Floating groups inside the main window are allowed (R29). `(v1.8)` Adding any of these needs an owner decision.
- **Audio engine `[D] (v1.5)`:** rodio pinned to a release, Symphonia with the `mp3` feature, lofty for tags. Design it so gapless playback can be added later (decode the next track ahead of time). Gapless is not in v1.
- **License `(v1.5)`:** MIT application. Symphonia is MPL-2.0. The AppImage bundles WebKitGTK and GTK (LGPL). Each release ships the license texts of bundled and linked third-party components and states, per component, the exact version and where its source is available. This covers Symphonia in every build and the LGPL libraries bundled in the AppImage. The repo keeps this list in a NOTICE file. Strawberry is GPL-3.0, so do not copy its code into an MIT project.
- **Platforms:** Windows and Linux (R22). `(v1.6)` Exception: microphone ducking (R34) is Windows only in this version.
- **Microphone privacy `(v1.6)`:** the app reads only whether another app uses a microphone. It never records audio and never logs app names.
- **Formats:** mp3, ogg (Vorbis) and wav.
- **Source of truth:** the music folder.
- **Audio files:** never modified.
- **Network:** only the R7 services. No accounts and no API keys. `(v1.10)` lyrics.ovh joins the R7 services. It is unofficial and can stop without notice; the R9.2 chain then ends at the last LRCLIB query.
- **Theme source:** `theme/tokens.json`, compiled at build time (R31). `(v1.4)`

---

## 7. Deferred ideas

- Gapless playback (the engine must allow it later).
- Synced lyrics line highlighting.
- Volume normalization (ReplayGain).
- Equalizer and crossfade.
- Customizable keyboard shortcuts.
- Moving widgets by keyboard.
- A content scale setting (text and thumbnail size). `(v1.7)` `(v1.8)` Row density moved to R28; keyboard resize of splitters moved to R29.
- Layout import and export.
- Pop-out windows. `(v1.4)` `(v1.8)` Floating groups moved to R29.
- Named layouts: save, apply, rename and delete. `(v1.4)`
- User-selected theme file (R16). `(v1.4)`
- Playlist import of PLS, XSPF and Apple text. `(v1.4)`
- Playlist rename and reorder.
- Playlist export UI (the files are already M3U8 and can be copied).
- Bundled themes or a light/dark toggle.
- `components` tokens in themes.
- Accessibility work beyond platform defaults, R25 and R36. `(v1.11)`
- A setting for the R36 timeout. `(v1.11)`
- A repeated letter that steps through the rows that start with it (R36.4). `(v1.11)`
- Type-to-find that skips a leading "The". `(v1.11)`
- Restore of the search text, the open playlist view and the Tree expand state at startup (R37). `(v1.12)`
- Multiple music folders (likely the first growth request).
- Light theme variant of the brand tokens.
- Microphone ducking on Linux (PipeWire and PulseAudio). `(v1.6)`
- More lyrics services that need no key, each after a separate check. `(v1.10)`
- A "Follow playing song" setting (R35). `(v1.10)`
- Automatic retry of lyrics "no match" songs after some time (R9.3). `(v1.10)`
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
30. **Superseded (v1.8, decision 38).** **Layout mode:** none. Normal mode gets the fixes. The current arrangement keeps saving automatically (R29).
31. **Superseded (v1.8, decision 38).** **Bar height (R29.1):** Transport controls get a fixed natural height.
32. **Superseded (v1.8, decision 38).** **Side drops (R29.1):** refused for bar widgets.
33. **Superseded (v1.8, decision 38).** **Tabbing (R29.1):** refused both ways for bar widgets.
34. **Superseded (v1.8, decision 38).** **Now playing (R29.1):** a bar widget too. The two bar widgets can share one row.
35. **Frame sizes (R28.1):** kept per Library mode.
36. **Superseded (v1.8, decision 38).** **Old arrangements (R29.1):** repair only the widget that breaks the rules.
37. **Superseded (v1.8, decision 38).** **Splitter input (R28.1):** mouse only.

The owner reported that a drop of Transport controls on the window top edge gave a large square, not a thin bar. Drop size was the only drag problem named.

Version 1.8 applies the owner's UI shell rework (`docs/planning/ui-shell-rework.md`), with this owner decision made on October 13, 2026:

38. **UI shell rework:** the rework wins where it conflicts with version 1.7, with two limits: the six widget names (Library, Transport controls, Now playing, Playlists, Play queue, Lyrics) and the three Library modes (Tree, Columns, Top/bottom) stay. Playlists, Play queue and Lyrics stand in for the rework's Navigator, Up Next and Info. Decisions 30 to 34, 36 and 37 are superseded by it; decisions 29 and 35 stay. The rework's own decisions hold: the band at the top by default, top or bottom only, unlocked on a fresh install, pop-out windows off. The rework's MUST and SHOULD list (its section 7) is part of these requirements; `docs/planning/ui-shell-rework-build-plan.md` section 4.2 records how each conflict resolves.

Version 1.9 records two owner decisions made on October 14, 2026, after the UI shell rework merged:

39. **Playlist view (R12):** the Playlists widget no longer expands into a tree. A selected playlist shows its songs in the Library widget, and the Artist and Album lists hide while it shows.
40. **Transport band order:** the play controls (Previous, Play or pause, Next) sit in the middle of the band by default, with Now playing and the seek bar on the left. The three move together in Customize transport bar.

Version 1.10 records owner decisions made on October 15, 2026:

41. **Automatic lyrics fetch (R9.1):** a "Fetch lyrics automatically" setting under "Online lookups", on by default. It fetches for the playing song and the next song in play order.
42. **Lyrics sources (R9.2):** more LRCLIB queries, then lyrics.ovh, a service that needs no key. A lyrics.ovh result for the folder artist and the cleaned title is accepted without the 2 s rule. Services that need a key stay out.
43. **Lyrics no match (R9.3):** a per-song marker in the sidecar. No automatic retry. "Fetch lyrics" retries.
44. **Selection follows the playing song (R35):** the Songs list and the Play queue only, only when the list has a selection. The selection is replaced. Keyboard focus does not move. No follow while the user is busy in that list. A song that is not in the list as shown changes nothing.

Version 1.11 records an owner decision made on October 19, 2026:

45. **Type-to-find (R36):** every list and tree. Prefix match from the top of the list. A repeated letter adds to the text. Space adds to an active text. The sorted column, else Title. Visible tree rows only. A 1 s reset. No match changes nothing.

Version 1.12 records an owner decision made on October 23, 2026:

46. **Selection restore (R37):** the Artist, Album and Song selection restores at startup. The layout already restores (R29) and does not change. Only the active song of a multi-selection. A missing level clears that level and the levels below it, with no message. Tree mode opens only the path to the restored row. Keyboard focus does not move. The search text, the playlist view and the other list states are not restored.

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
12. **Presets `(v1.8)`:** applying each preset works. A tabbed group and a floating group survive a restart. (Named layouts are deferred.)
13. **Layout lockout `(v1.8)`:** the transport band cannot be hidden (R5). With every optional widget hidden, keyboard shortcuts and media keys still work. Reset layout restores the default preset.
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
26. **Transport band `(v1.8)`:** from 800 px to 2560 px window width the band never wraps, never changes height and never loses Play. (Replaces the v1.7 bar-widget check.)
27. **Old arrangement `(v1.8)`:** a hand-corrupted or version 1 `layout.json` starts the app with the default preset and leaves `layout.json.bak`. (Replaces the v1.7 repair check.)
28. **Automatic lyrics `(v1.10)`:** with Online lookups on, playing a song with no lyrics saves a lyrics file next to it and shows it without a click. The fetch for the next song in play order starts while the current song plays; when the current song plays long enough, the next song has its file before it starts (best effort). A song in an album folder that no source knows gets a marker and no second request when it plays again. A song outside an album folder gets no marker and no second request in the same app run.
29. **Selection follows `(v1.10)`:** with one song selected in the Songs list and one entry selected in the Play queue, Next moves both selections to the new song. Keyboard focus stays where it was. With a search that hides the new song, the Songs list does not change.
30. **Type-to-find `(v1.11)`:** with focus on "Chemical Brothers" in the Artist list, "z" selects the first artist that starts with Z. After a pause of more than 1 s, "zz top" typed without a 1 s pause selects "ZZ Top" and playback does not toggle. After another pause of more than 1 s, "zzx" leaves "ZZ Top" selected. The same works in each R36.1 list.
31. **Selection restore `(v1.12)`:** in Columns mode, select an artist, one of its albums and one song, then quit and start the app. The three rows show as selected and in view, and keyboard focus is where it is at a start with no saved selection. Quit, remove that album's folder and start: the artist is selected, the Album list shows "All" and no song is selected. In Tree mode, a restored song row shows inside its opened artist and album nodes, and all other nodes are closed.

---

## References

- Strawberry Music Player: https://github.com/strawberrymusicplayer/strawberry
- DESIGN.md format (Google Labs): https://github.com/google-labs-code/design.md
- DESIGN.md spec: https://github.com/google-labs-code/design.md/blob/main/docs/spec.md
- MusicBrainz rate limiting and User-Agent rules: https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting
- lrclib API: https://lrclib.net/docs
- lyrics.ovh API: https://lyricsovh.docs.apiary.io
- Tauri AppImage notes: https://v2.tauri.app/de/distribute/appimage/
- Symphonia (Rust audio decoding): https://github.com/pdeljanov/Symphonia
- Apple playlist export (XML and plain text): https://support.apple.com/kb/PH19491
- souvlaki (OS media controls): https://github.com/Sinono3/souvlaki
- MusicBee layout model (for reference): https://musicbee.fandom.com/wiki/The_Anatomy_of_MusicBee
- Dockview (example docking library): https://dockview.dev
- Magic UI: https://github.com/magicuidesign/magicui
- Layout mockups (design canvas): https://claude.ai/artifact/SwcfWxGUmfBkPHwQ3MLs6W

## Change log

- **1.12 (October 23, 2026):** the Library selection restores at startup, with owner decision 46 (section 8).
  - **Added:** R37, two preferences, two non-goals, four edge cases, one deferred idea, acceptance check 31.
- **1.11 (October 19, 2026):** type-to-find in lists, with owner decision 45 (section 8).
  - **Added:** R36, one preference, three non-goals, five edge cases, three deferred ideas, acceptance check 30.
  - **Changed:** R25 (Space during type-to-find), section 7 (accessibility beyond R25 and R36).
- **1.10 (October 15, 2026):** automatic lyrics fetch and a selection that follows the playing song, with owner decisions 41 to 44 (section 8).
  - **Added:** R9.1, R9.2, R9.3, R35, two preferences, three non-goals, six edge cases, three deferred ideas, acceptance checks 28 and 29, the lyrics.ovh reference.
  - **Changed:** R7 (the service list), section 6 (network).
- **1.9 (October 14, 2026):** owner decisions 39 (playlist view, R12) and 40 (play controls in the middle of the transport band).
- **1.8 (October 13, 2026):** the UI shell rework, with owner decision 38 (section 8). A change list for the owner's approval (UQ4).
  - **Added:** the R28 Songs table (columns, sort, multi-select, row drag, density), the R29 presets, Lock layout, floating groups, transport position and splitter rules, the layout backup, the rework's section 7 list by reference (section 8).
  - **Changed:** R5 (Transport controls is a fixed band; Now playing is a card widget; the menu groups), R28.1 (keyboard splitters), R29 (presets replace the built-in layouts; default arrangement; Reset layout; corrupt file backup), section 4 (floating panels and the edit lock leave the non-goals), section 7 (keyboard splitters and density leave the deferred ideas).
  - **Deleted:** R29.1. Decisions 30 to 34, 36 and 37 are marked superseded (section 8).
  - **Also in 1.8 (PR 23 review):** R28.1 (presets restore frame sizes), the docking and complexity constraints (floating groups inside the window), acceptance checks 12 and 13, and the R29.1 note.
  - **Approval:** open at the U7 close. The owner approves this wording or lists the changes (UQ4).
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
