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
| `window` | object or `null` | `null` | The last window size: `width` and `height` in logical pixels (numbers). |
| `lastScan` | object or `null` | `null` | Counts of the last scan (R2): `added`, `removed` and `skipped`. Settings shows them. A file without the key reads as `null`. |

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
  }
}
```

Rules:

- No file: first run. The app uses the defaults and shows the first-run notice.
- A corrupt file or an unknown `version`: the app writes a warning to `app.log` and uses the defaults. The next change to a setting replaces the file.

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

| Key | Type | Meaning |
|---|---|---|
| `version` | integer | Schema version, `1`. |
| `libraryMode` | string | `tree`, `columns` or `topBottom`. |
| `dock` | object | The Dockview arrangement (`toJSON`): the grid of groups with their sizes, the panels with their widget ids, titles and minimum sizes, and the active group. |

The file holds no window size: that is in `settings.json` only (P9-AC8). The grid `width` and `height` are the dock size when saved; the app fits the grid to the current window at start.

Example (shortened):

```json
{
  "version": 1,
  "libraryMode": "tree",
  "dock": {
    "grid": {
      "root": {
        "type": "branch",
        "data": [
          { "type": "leaf", "data": { "views": ["library"], "activeView": "library", "id": "1" }, "size": 630 },
          { "type": "leaf", "data": { "views": ["nowPlaying", "queue"], "activeView": "queue", "id": "2" }, "size": 112 }
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

1. Not JSON, another `version`, no `dock` object, or a missing or unknown `libraryMode`: the Columns layout applies.
2. A widget id this version does not know: its panel is removed; the rest stays.
3. No Library panel: the Columns layout applies.
4. Any error while the dock loads: the Columns layout applies.

Saving: 500 ms after a layout or Library mode change, and at once when the window closes. The measurement layout (P3.1) is not saved.

## Playlists (`.m3u8`)

Location: anywhere in the music folder. New playlists and Favorites go to `Playlists/` at the folder root (R13). Source: `crates/clawdio-core/src/playlist/` (P11).

Reading:

- UTF-8; a BOM is removed. A file that is not UTF-8 text is skipped and logged.
- Each line that is not empty and does not start with `#` is an entry. An `#EXTINF:` line belongs to the next entry. Other comment lines are ignored.
- Entries resolve relative to the playlist file; a backslash counts as a separator. An entry that is absolute, leaves the music folder or is not a library track shows as "missing" and stays in the file.
- `.m3u` and `.pls` files are not listed; Import reads them (P12).
- A rescan never writes a playlist.

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
