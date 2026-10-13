# File formats

The files that the app reads and writes. P9.6, P11.1, P14.9 and P16.8 add the other formats.

## `settings.json`

Location: the config folder (plan section 6.8). In portable mode: `<exe dir>/data/config/`. Source: `crates/clawdio-core/src/settings.rs`.

The app writes the file atomically: a temp file in the same folder, then a rename.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `version` | integer | `1` | Schema version. Any other value makes the file invalid. |
| `musicFolder` | string or `null` | `null` | The music folder, absolute. In portable mode (R18.1): relative to the executable folder when both are on the same volume, else absolute. |
| `onlineLookups` | boolean | `false` | The Online lookups switch (R7). |
| `onlineNoticeDone` | boolean | `false` | `true` after the user answers the first-run notice. |
| `window` | object or `null` | `null` | The last window size: `width` and `height` in logical pixels (numbers), and the optional outer position `x` and `y` in physical pixels (integers, PS-5, UD14). The position applies at start only when that point lies on an available monitor; else the OS places the window. A file without `x` and `y` loads with no position. |
| `lastScan` | object or `null` | `null` | Counts of the last scan (R2): `added`, `removed` and `skipped`. Settings shows them. A file without the key reads as `null`. |
| `micDucking` | `"off"`, `"lower"` or `"pause"` | `"off"` | "When the microphone is in use" (R34.1). Windows only; other platforms keep the value and do not use it (D53). A file without the key reads as `"off"`. |
| `micDuckPercent` | integer | `20` | The ducked volume for `"lower"`, as a percentage of the user volume (R34.3): 5 to 90 in steps of 5. A file without the key, or with another value, reads as `20`. |

Example:

```json
{
  "version": 1,
  "musicFolder": "../Music",
  "onlineLookups": false,
  "onlineNoticeDone": true,
  "window": {
    "width": 1200.0,
    "height": 800.0
  },
  "lastScan": {
    "added": 50000,
    "removed": 0,
    "skipped": 12
  },
  "micDucking": "lower",
  "micDuckPercent": 20
}
```

Rules:

- No file: first run. The app uses the defaults and shows the first-run notice.
- A corrupt file or an unknown `version`: the app writes a warning to `app.log` and uses the defaults. The next change to a setting replaces the file.
- The ducking keys came in v1.6 without a new `version`: an older file loads with all its values and the ducking defaults.

## `state.json`

Location: the config folder, next to `settings.json`. Source: `crates/clawdio-core/src/state.rs` and `src-tauri/src/persist.rs` (P9.1, R27, D25).

The app writes the file atomically, as compact JSON.

| Key | Type | Meaning |
|---|---|---|
| `version` | integer | Schema version, `1`. Any other value makes the file invalid. |
| `queue` | array of strings | The Play queue in order: each entry is a path relative to the music folder, as the library stores it. |
| `current` | integer or `null` | The current entry, an index into `queue`. |
| `positionMs` | integer | The position in the current entry, in milliseconds. |
| `volume` | integer | From 0 to 100. |

Shuffle and repeat are not saved (D25).

Example:

```json
{"version":1,"queue":["Artist/Album/01 Song.mp3","Artist/Album/02 Song.ogg"],"current":1,"positionMs":83000,"volume":80}
```

Rules:

- Saving: 2 s after a queue or state change (play, pause, seek, track change, volume, queue edit), and at exit with the last position. Position ticks alone do not start a save. An unchanged state is not written again.
- At start the queue comes back paused at the saved position, after the cache loads. Entries not in the library wait until the startup scan ends a complete traversal; then those still missing are dropped with no message. When the current entry went, the next remaining entry is current at position 0.
- Nothing is saved before the restore resolves. A queue change by the user before that drops the saved queue.
- With the music folder missing, nothing is dropped and the file is not written.
- No file, a corrupt file or an unknown `version`: the queue starts empty; a corrupt file or an unknown version writes a warning to `app.log`.

## `layout.json`

Location: the config folder. Source: `src/shell/persistence.ts` (content) and `crates/clawdio-core/src/layout.rs` (storage) (P9.2 to P9.4, R29).

The app writes the file atomically. It refuses text that is not one JSON object or is larger than 1 MB.

On load, a file that fails validation (not JSON, an unknown `version`, no `dock`, an unknown `libraryMode`, a dock that cannot load, or no Library widget) is renamed to `layout.json.bak` (an older backup is replaced), one line goes to the log, and the default preset loads (PS-4). A version 1 file (the app before the UI shell rework, with a `transport` dock panel) is not migrated: it is backed up the same way, with the log line `layout: version 1 backed up as layout.json.bak`.

| Key | Type | Meaning |
|---|---|---|
| `version` | integer | Schema version, `2` (UI shell rework UD5). |
| `transport` | string | Transport band position: `top` (default) or `bottom` (SH-6). Another value loads as `top` with a log line. |
| `locked` | boolean | Lock layout (DK-5). Another value loads as `false` with a log line. |
| `libraryMode` | string | `tree`, `columns` or `topBottom`. |
| `libraryFrames` | object | Optional (P22.3, D55). Library frame sizes as fractions that add up to 1. `columns`: Artist, Album and Songs. `topBottom.top`: Artist and Album. `topBottom.rows`: the top row and Songs. A file without it loads with the defaults: Columns 0.25, 0.25, 0.5; Top/bottom 0.5, 0.5 and 0.5, 0.5. |
| `dock` | object | The Dockview arrangement (`toJSON`): the grid of groups with their sizes, the panels with their widget ids, titles and minimum sizes, the active group, and `floatingGroups` (DK-3): each floating group's panels and its position and size over the dock. A floating group outside a smaller window moves back inside. |

The file holds no window size: that is in `settings.json` only (P9-AC8). The grid `width` and `height` are the dock size when saved; the app fits the grid to the current window at start.

Example (shortened):

```json
{
  "version": 2,
  "transport": "top",
  "locked": false,
  "libraryMode": "tree",
  "libraryFrames": { "columns": [0.25, 0.25, 0.5], "topBottom": { "top": [0.5, 0.5], "rows": [0.5, 0.5] } },
  "dock": {
    "grid": {
      "root": {
        "type": "branch",
        "data": [
          { "type": "leaf", "data": { "views": ["library"], "activeView": "library", "id": "1" }, "size": 430 },
          { "type": "leaf", "data": { "views": ["queue"], "activeView": "queue", "id": "2" }, "size": 200 },
          { "type": "leaf", "data": { "views": ["nowPlaying"], "activeView": "nowPlaying", "id": "3" }, "size": 112 }
        ],
        "size": 1200
      },
      "width": 1200,
      "height": 742,
      "orientation": "VERTICAL"
    },
    "panels": {
      "library": { "id": "library", "contentComponent": "library", "tabComponent": "library", "title": "Library" },
      "nowPlaying": { "id": "nowPlaying", "contentComponent": "nowPlaying", "tabComponent": "widget", "title": "Now playing" },
      "queue": { "id": "queue", "contentComponent": "queue", "tabComponent": "widget", "title": "Play queue" }
    },
    "activeGroup": "2"
  }
}
```

Rules (P9.4), each with one warning in `app.log`:

1. Not JSON, another `version`, no `dock` object, or a missing or unknown `libraryMode`: the file is backed up and the default preset applies (Reset layout: Columns mode, the band at the top, unlocked).
2. A widget id this version does not know: its panel is removed; the rest stays. (Version 2 has no `transport` widget: the transport band is not a dock panel.)
3. No Library panel: the file is backed up and the default preset applies.
4. Any error while the dock loads: the file is backed up and the default preset applies.
5. A bad `transport` or `locked` value: that key takes its default; the rest loads.
6. `libraryFrames` (D55): an invalid `columns` or `topBottom` entry, or one with an unknown property, gives that mode its default sizes. An unknown mode key is ignored. A value that is not an object gives the defaults of all modes. The dock and the other mode still load.

Reset layout and each built-in layout restore the default frame sizes of all modes (R28.1).

Saving: 500 ms after a layout, Library mode, frame size, band position or lock change, and at once when the window closes. The measurement layout (P3.1) is not saved.

## Playlists (`.m3u8`)

Location: anywhere in the music folder. New playlists and Favorites go to `Playlists/` at the folder root (R13). Source: `crates/clawdio-core/src/playlist/` (P11).

Reading:

- UTF-8; a BOM is removed. A file that is not UTF-8 text is skipped and logged.
- Each line that is not empty and does not start with `#` is an entry. An `#EXTINF:` line belongs to the next entry. Other comment lines are ignored.
- Entries resolve relative to the playlist file; a backslash counts as a separator. An entry that is absolute, leaves the music folder or is not a library track shows as "missing" and stays in the file.
- `.m3u` and `.pls` files are not listed; Import reads `.m3u` (P12).
- A rescan never writes a playlist. Only import and "Find missing songs" write matches (R13).

Writing (create, add, remove, the heart):

- `#EXTM3U` on the first line, then for each entry `#EXTINF:<seconds>,<artist> - <title>` and the path relative to the playlist file, with forward slashes. An entry the app did not write keeps its `#EXTINF` text; one with none gets `-1,<file name>`.
- A rewrite keeps every entry, missing ones too, and drops other comment lines.
- Lines end with `\n`. The file is written to a temp file in the same folder, then renamed. A new file is readable by other users (mode 0644 on Unix); a replaced file keeps its mode.
- The file name is the playlist name (R12): no `/`, `\`, `..`, `< > : " | ? *` or control characters; no leading or trailing space or dot; not a Windows device name (CON, PRN, AUX, NUL, COM1 to COM9, LPT1 to LPT9, also with an extension such as "CON.mix"); not "Favorites" in any letter case; not the name of another playlist in `Playlists/` in any letter case (D21).

Example (`Playlists/Road trip.m3u8`):

```text
#EXTM3U
#EXTINF:183,Björk - Human Behaviour
../Björk/Debut/01 Human Behaviour.mp3
#EXTINF:-1,Song 5.mp3
../Missing/Song 5.mp3
```

`Playlists/Favorites.m3u8` is a normal playlist (R26). The heart adds the song or removes every copy of it; the first use creates the file.

## Playlist import

Source: `crates/clawdio-core/src/import/` (P12, R14, R32). The source files are only read; each playlist in them becomes a new `.m3u8` in `Playlists/`.

Entry points (R32): "Import playlist" opens a picker that takes one or more files. "Import folder" takes one folder and reads every `.m3u`, `.m3u8` and `.xml` file in it and in all its subfolders; the extension comparison ignores case. Both pickers run in Rust. The sources import in path order.

Rescan first (R33.1): import and "Find missing songs" run the incremental scan first, or wait for the running one, then match against the updated library. If the user cancels that scan, or it fails, nothing is matched or written and the report says "Canceled, nothing changed". The import has no Cancel of its own.

| Format | Reading |
|---|---|
| `.m3u` | UTF-8 when valid, else Windows-1252. A BOM is removed. |
| `.m3u8` | UTF-8. |
| Apple XML (`.xml`) | The export of the Apple Music app or iTunes. Each playlist with no `Master` key and no `Distinguished Kind` key (D22). A track's `Location` URL becomes a path: the host goes and `%xx` is decoded (`file://localhost/C:/A%20B.mp3` gives `C:/A B.mp3`). A track with no `Location` goes to the report only. An `.xml` file that is not such an export fails in the report; the other files still import. |

Matching runs on normalized paths: backslashes become slashes, a drive letter or UNC prefix goes, the text is NFC normalized and compared without case. The stages, in order:

1. Relative to the playlist file, inside the music folder (M3U family only).
2. The longest path end shared with a library track (at least a folder and the file name).
3. The file name.
4. The title, plus the artist and album the source has (`#EXTINF` "artist - title", or the Apple fields), compared like search (D4).

A stage with one hit matches. A stage with more than one hit passes only those to the next stage. More than one after the last stage is "ambiguous".

Extension rule (R33.2): stages 1 and 2 first look for tracks with the entry's extension. With none, they run again with the extension of the last part removed, so `Artist/Album/Song.m4a` matches `Artist/Album/Song.mp3`. Stage 1 still needs the same relative path; stage 2 still ranks by the longest shared path end, which must hold at least the album folder and the file name. A same-extension hit wins over other-extension hits. Stage 3 needs the same extension. Two other-format hits (`Song.mp3` and `Song.ogg` for `Song.m4a`) narrow like other hits and can end as "more than one match".

Output: each playlist is written when it is ready, so a crash keeps the playlists already written. Matched entries are written like an app playlist. Unmatched entries keep their `#EXTINF` text and show as missing. An unmatched relative entry of an `.m3u` or `.m3u8` that points inside the music folder is written relative to the new file (`Song.m4a` in `Artist/Album/list.m3u` becomes `../Artist/Album/Song.m4a`), so a later "Find missing songs" keeps its folder. Other unmatched entries keep their entry text (for Apple XML, the decoded path).

Name rule (D21, D51): the name comes from the file name or the Apple playlist name. Forbidden characters become `_`, edge spaces and dots go and a reserved name gets ` (imported)` ("Favorites" gives "Favorites (imported)"). When a playlist of that name exists anywhere in the music folder (ignoring case), the source is skipped and nothing is written. A name that an earlier source of the same import took gets ` (2)`, ` (3)` and so on.

The combined report lists each source playlist as imported (the matched count and each missing entry with its reason: not found, more than one match, or no file location), skipped (name exists) or failed (the file cannot be read or is not an Apple export, or the playlist cannot be written). Report labels are playlist names, file names or titles, never paths (D13).

## Find missing songs

Source: `crates/clawdio-core/src/playlist/repair.rs` (R33.3 to R33.5). "Find missing songs" runs on one playlist that has missing entries; "Find missing songs in all playlists" runs on each of them, Favorites and `.m3u8` files anywhere in the music folder included. Both rescan first (see Playlist import).

- Each missing entry goes through the matching stages above with its path text and its `#EXTINF` artist and title. Stage 1 resolves against the playlist file.
- A unique match replaces the entry at the same position: the path line (relative to the playlist file) and its `#EXTINF` line. A matched entry with no `#EXTINF` line gets one before its path. Every other line stays byte for byte, line ends and comments included.
- Entries with no match or more than one match stay unchanged.
- The write is atomic (temp file, then rename). A playlist with no match is not written. A write failure (for example a read-only folder) changes no file and shows in the report.
- The report lists, per playlist, the number of fixed entries and each entry that is still missing with its reason (not found or more than one match).
- A bare entry from an import before v1.6 (for example `Song.m4a` with no folder) cannot match by folder. Delete that playlist and import the source again.

## Lyrics (`.lrc`, `.txt`)

Source: `crates/clawdio-core/src/lyrics.rs` (P13, R9). The app reads the first source that exists, next to the song and with the song's base name (`01 Song.mp3` uses `01 Song.lrc`):

1. `<base name>.lrc`
2. `<base name>.txt`
3. Embedded lyrics: ID3v2 `USLT`, or the Vorbis comment `LYRICS` or `UNSYNCEDLYRICS`. Empty embedded text counts as no lyrics.

Files are read as UTF-8 (a BOM is removed), else as Windows-1252 (D26). For a `.lrc` file the widget hides each leading time stamp (`[mm:ss]`, with 1 to 3 minute digits and an optional fraction of 1 to 3 digits after `.` or `:`) and the tag lines `[ar:]`, `[ti:]`, `[al:]`, `[au:]`, `[by:]`, `[length:]`, `[offset:]`, `[re:]` and `[ve:]`. Line order and blank lines stay. A `.txt` file and embedded text show as they are. Changes to these files show after Rescan.

## Album sidecar (`sidecar.json`)

Source: `crates/clawdio-core/src/sidecar.rs` (P14, R10, R11). One file per album folder, next to the songs. Schema version 1:

```json
{
  "version": 1,
  "artwork": { "status": "no-match", "checked": "2026-10-12T07:45:09Z" },
  "tracks": {
    "01 Human Behaviour.mp3": { "title": "Human Behaviour", "track": 1, "year": 1993 },
    "CD2/01 Intro.mp3": { "title": "Intro" }
  }
}
```

| Field | Meaning |
|---|---|
| `version` | Schema version. The app writes 1. |
| `artwork.status` | `no-match`: MusicBrainz gave no single release group after name normalization (D43). `no-art`: one release group matched, but Cover Art Archive has no front image. An album with either marker is not looked up again until "Retry lookup" removes `artwork`. |
| `artwork.checked` | UTC time of the lookup, RFC 3339. |
| `tracks` | Track metadata from "Fill metadata" (P16). Entries for songs that no longer exist are ignored and kept. |

Song order and titles use the sidecar between the tag and the file name (R4): the title is the tag, then `title`, then the file name without its number prefix; the track number is the tag, then `track`, then the prefix. "Fill missing metadata" proposes only fields that the song's tags lack, shows a preview and writes nothing before Confirm. The scan stores the sidecar's size and modified time and reads the album's songs again when they change.

The app reads the file leniently: unknown fields stay when it writes the file again, and writes are atomic. A file that is not a JSON object is corrupt: the app logs it, ignores it, never rewrites it on its own and does not look up the album (D44). The scan never treats `sidecar.json` as a song. The library cache holds no marker (R19).
