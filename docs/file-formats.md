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
| `onlineNoticeVersion` | integer | `1` | The version of the Online lookups notice the user answered (D64). Version 2 names lyrics.ovh. With `onlineLookups` on and a value below 2, the updated notice shows at start, and the app sends nothing to lyrics.ovh until the user answers. An answer to either notice, or turning Online lookups on in Settings, writes 2. A file without the key reads as `1`. |
| `window` | object or `null` | `null` | The last window size: `width` and `height` in logical pixels (numbers), and the optional outer position `x` and `y` in physical pixels (integers, PS-5, UD14). The position applies at start only when a 160 x 40 px title area at that point lies on one available monitor; else the OS places the window. A file without `x` and `y` loads with no position. Sizes below the 800 x 560 minimum are not saved, so the mini player (TR-9) never replaces the normal size. |
| `lastScan` | object or `null` | `null` | Counts of the last scan (R2): `added`, `removed` and `skipped`. Settings shows them. A file without the key reads as `null`. |
| `micDucking` | `"off"`, `"lower"` or `"pause"` | `"off"` | "When the microphone is in use" (R34.1). Windows only; other platforms keep the value and do not use it (D53). A file without the key reads as `"off"`. |
| `micDuckPercent` | integer | `20` | The ducked volume for `"lower"`, as a percentage of the user volume (R34.3): 5 to 90 in steps of 5. A file without the key, or with another value, reads as `20`. |
| `autoLyrics` | boolean | `true` | "Fetch lyrics automatically" (R9.1): the app fetches lyrics for the playing and the next song while Online lookups are on. A file without the key reads as `true`. |

Example:

```json
{
  "version": 1,
  "musicFolder": "../Music",
  "onlineLookups": false,
  "onlineNoticeDone": true,
  "onlineNoticeVersion": 2,
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
  "micDuckPercent": 20,
  "autoLyrics": true
}
```

Rules:

- No file: first run. The app uses the defaults and shows the first-run notice.
- A corrupt file or an unknown `version`: the app writes a warning to `app.log` and uses the defaults. The next change to a setting replaces the file.
- The ducking keys came in v1.6 without a new `version`: an older file loads with all its values and the ducking defaults.
- `autoLyrics` and `onlineNoticeVersion` came in v1.10 without a new `version`: an older file loads with all its values, `autoLyrics` on and notice version 1. With Online lookups on, that user sees the updated notice once (D64).

## `state.json`

Location: the config folder, next to `settings.json`. Source: `crates/clawdio-core/src/state.rs` and `src-tauri/src/persist.rs` (P9.1, P26, P27, R27, R37, D25, D66).

The app writes the file atomically, as compact JSON.

| Key | Type | Meaning |
|---|---|---|
| `version` | integer | Schema version, `1`. Any other value makes the file invalid. |
| `queue` | array of strings | The Play queue in order: each entry is a path relative to the music folder, as the library stores it. |
| `current` | integer or `null` | The current entry, an index into `queue`. |
| `positionMs` | integer | The position in the current entry, in milliseconds. |
| `volume` | integer | From 0 to 100. |
| `shuffle` | boolean | The shuffle mode (P27). Optional: a missing or unreadable value is `false`. |
| `repeat` | string | The repeat mode: `"off"`, `"all"` or `"one"` (P27). Optional: a missing or unreadable value is `"off"`. |
| `librarySelection` | object or `null` | The Library selection (P26, R37): `artist` (the exact artist name), `album` (`{"artist": …, "name": …}`) and `song` (a path relative to the music folder). Each is `null` for "All" or no song. Optional: a missing or unreadable value is no selection. |

Example:

```json
{"version":1,"queue":["Artist/Album/01 Song.mp3","Artist/Album/02 Song.ogg"],"current":1,"positionMs":83000,"volume":80,"shuffle":false,"repeat":"one","librarySelection":{"artist":"Artist","album":{"artist":"Artist","name":"Album"},"song":"Artist/Album/02 Song.ogg"}}
```

Rules:

- Saving: 2 s after a queue or state change (play, pause, seek, track change, volume, shuffle, repeat, queue edit), and at exit with the last position. Position ticks alone do not start a save. An unchanged state is not written again.
- At start the shuffle and repeat modes apply at once; they do not wait for the library. A file from before P27 (no mode keys) keeps its queue and starts with both modes off. The version stays `1`.
- At start the queue comes back paused at the saved position, after the cache loads. Entries not in the library wait until the startup scan ends a complete traversal; then those still missing are dropped with no message. When the current entry went, the next remaining entry is current at position 0.
- Nothing is saved before the restore resolves. A queue change by the user before that drops the saved queue. The queue and the selection are two parts: while one part waits and the other is ready, a save writes the waiting part as the file has it.
- The selection restores after the queue. When the restored queue has a current song, the selection is that song, its artist and its album (R37.9). Else the saved selection applies: a missing artist, album or song waits for a complete traversal, then that level and the levels below it become "All" or no song. A saved song that is not under the restored artist and album is dropped.
- A selection change by the user before the restore drops the saved selection; the saved queue stays. A new music folder drops the saved selection, and the next save writes no selection.
- With the music folder missing, nothing is dropped and the file is not written.
- No file, a corrupt file or an unknown `version`: the queue starts empty; a corrupt file or an unknown version writes a warning to `app.log`.

## `layout.json`

Location: the config folder. Source: `src/shell/persistence.ts` (content) and `crates/clawdio-core/src/layout.rs` (storage) (P9.2 to P9.4, R38.11, P29.1).

The app writes the file atomically. It refuses text that is not one JSON object or is larger than 1 MB.

On load, a file that fails validation is renamed to `layout.json.bak` (an older backup is replaced), one line goes to the log, and the Default preset loads (R38.11). A version 1 file (a `transport` dock panel) or version 2 file (the Dockview arrangement, P23 to P28) is not migrated: it is backed up the same way.

| Key | Type | Meaning |
|---|---|---|
| `version` | integer | Schema version, `3` (R38.11). |
| `transportSlots` | object | Optional (TR-10, UD20). The band slot `order` (array of `previous`, `playPause`, `next`, `nowPlaying`, `seek`, `stop`, `shuffle`, `repeat`, `volume`, `queue`, `search`) and the `hidden` slots. `previous`, `playPause` and `next` stay together in that order (a split group joins at its first slot); `playPause` cannot be hidden. A file without it loads the default order (`nowPlaying`, `seek`, `previous`, `playPause`, `next`, `stop`, `shuffle`, `repeat`, `volume`, `queue`, `search`) with `search` hidden. A file that holds the default order from before requirements v1.9 (`previous` first) loads the new default. |
| `widgets` | object | The shown widgets by id, each a rectangle of whole cells `{ "x", "y", "w", "h" }` in the 12 x 12 grid, 0-based from the top left (R38.2). Ids: `transport`, `search`, `artist`, `album`, `songs`, `tree`, `playlists`, `queue`, `lyrics`, `nowPlaying`. A widget that is not in the object is hidden. |

The file holds no window size: that is in `settings.json` only (P9-AC8). The cells scale with the window (R38.1), so the arrangement keeps its shape at any window size.

Example (the Default preset):

```json
{
  "version": 3,
  "transportSlots": {
    "order": ["nowPlaying", "seek", "previous", "playPause", "next", "stop", "shuffle", "repeat", "volume", "queue", "search"],
    "hidden": ["search"]
  },
  "widgets": {
    "transport": { "x": 0, "y": 0, "w": 12, "h": 1 },
    "search": { "x": 2, "y": 1, "w": 7, "h": 1 },
    "artist": { "x": 2, "y": 2, "w": 3, "h": 4 },
    "album": { "x": 5, "y": 2, "w": 4, "h": 4 },
    "songs": { "x": 2, "y": 6, "w": 10, "h": 6 },
    "playlists": { "x": 0, "y": 1, "w": 2, "h": 11 },
    "nowPlaying": { "x": 9, "y": 1, "w": 3, "h": 5 }
  }
}
```

Rules (R38.11), each with one warning in `app.log`:

1. Not JSON, not an object, another `version`, or no `widgets` object: the file is backed up and Reset layout applies (Default and the default band slots).
2. A widget id this version does not know: it is ignored; the rest loads.
3. A rectangle that is not exactly four whole numbers, leaves the grid, is smaller than the widget minimum (R38.6) or overlaps another widget: the file is backed up and Reset layout applies.
4. No `songs` or no `transport`: the widget is added where it fits (as a show, R38.7). When it does not fit, the file is backed up and Reset layout applies.
5. A `locked` key (Lock layout, removed by owner answer Q13) is ignored. Arrange mode is not saved.
6. `transportSlots`: an unknown slot id is dropped with one warning and a missing slot goes at the end. A hidden `playPause`, or a value that is not an object with `order` and `hidden` arrays, gives the default slots with one warning. The rest loads.

Saving: 500 ms after a widget or band slot change, and at once when the window closes. The mini player (TR-9) is not saved: the app always starts in the normal window. The measurement layout (P3.1) is not saved.

## `columns.json`

Location: the config folder, next to `layout.json`. Source: `src/shell/columns-persistence.ts` (content) and `crates/clawdio-core/src/layout.rs` (storage) (UI shell rework UD13, PS-6).

The Songs table column state, apart from the layout: Reset layout does not change it. The app writes the file atomically and refuses text that is not one JSON object or is larger than 1 MB, like `layout.json`.

| Key | Type | Meaning |
|---|---|---|
| `version` | integer | Schema version, `1`. |
| `density` | string | Row density (TB-14): `regular` (default) or `compact` (View, Compact rows). Compact rows apply to the Songs table, the Tree, the Play queue and playlist entries; album rows keep their height. |
| `views` | object | One entry per Songs view. Since P29 one Songs widget exists (R38.3): `songs.columns`. An older file's `songs.topBottom` is an unknown view: it is ignored. The Tree widget has no table. |
| `views.*.order` | array of strings | Column ids in order: `track`, `title`, `artist`, `album`, `duration`. `track` (#) is always first. |
| `views.*.widths` | object | Width in px per column id. Minimums: `track` 40, `title` 120, `artist` 80, `album` 80, `duration` 56. Title takes the spare width over its saved width. |
| `views.*.hidden` | array of strings | Hidden column ids. `track` and `title` cannot hide. Default: `album`. |
| `views.*.sort` | array | Up to two `{ "column": <id>, "descending": <boolean> }` keys: a header click sets the first, Shift+click adds or flips the second (TB-13). Empty: the R4 default order. |

Example:

```json
{
  "version": 1,
  "density": "regular",
  "views": {
    "songs.columns": {
      "order": ["track", "title", "artist", "album", "duration"],
      "widths": { "track": 48, "title": 240, "artist": 160, "album": 160, "duration": 64 },
      "hidden": ["album"],
      "sort": [{ "column": "title", "descending": false }]
    }
  }
}
```

Rules, each with one warning in `app.log`:

1. Not JSON, not an object, another `version`, or no `views` object: the file is renamed to `columns.json.bak` (an older backup is replaced) and the defaults apply.
2. An unknown view key or column id: it is ignored; a missing column goes at the end of the order.
3. A width that is not a number or is below the column minimum: that column takes its default width.
4. A view that is not an object: that view takes its defaults. A bad `density`: `regular`.

Saving: 500 ms after a column change, and at once when the window closes.

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

Source: `crates/clawdio-core/src/lyrics.rs` (P13, R9). "Fetch lyrics" and the automatic fetch (R9.1, P24) save `<base name>.lrc` for synced lyrics, else `<base name>.txt`; a lyrics.ovh result is always `.txt`. A file with lyrics in it is never replaced. The app reads the first source that exists, next to the song and with the song's base name (`01 Song.mp3` uses `01 Song.lrc`):

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
  },
  "lyrics": {
    "CD2/01 Intro.mp3": { "status": "no-match", "checked": "2026-10-15T09:12:00Z" }
  }
}
```

| Field | Meaning |
|---|---|
| `version` | Schema version. The app writes 1. |
| `artwork.status` | `no-match`: MusicBrainz gave no single release group after name normalization (D43). `no-art`: one release group matched, but Cover Art Archive has no front image. An album with either marker is not looked up again until "Retry lookup" removes `artwork`. |
| `artwork.checked` | UTC time of the lookup, RFC 3339. |
| `tracks` | Track metadata from "Fill metadata" (P16). Entries for songs that no longer exist are ignored and kept. |
| `lyrics` | Lyrics "no match" markers (R9.3, D60), keyed like `tracks` by the song's path inside the album folder. `status` `no-match`: every source of the R9.2 chain gave no result. `checked`: UTC time, RFC 3339. The automatic fetch skips a song with the marker; "Fetch lyrics" removes it and runs the chain again. An error (network, timeout, HTTP 429 or 503) writes no marker. A `lyrics` value that is not an object, or a song entry that is not an object, is the user's data: the app leaves the file as it is. Songs outside an album folder get no marker; the app keeps their result in memory for one app run. |

Song order and titles use the sidecar between the tag and the file name (R4): the title is the tag, then `title`, then the file name without its number prefix; the track number is the tag, then `track`, then the prefix. "Fill missing metadata" proposes only fields that the song's tags lack, shows a preview and writes nothing before Confirm. The scan stores the sidecar's size and modified time and reads the album's songs again when they change.

The app reads the file leniently: unknown fields stay when it writes the file again, and writes are atomic. A file that is not a JSON object is corrupt: the app logs it, ignores it, never rewrites it on its own and does not look up the album (D44). The scan never treats `sidecar.json` as a song. The library cache holds no marker (R19).
