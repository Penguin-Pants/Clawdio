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
  }
}
```

Rules:

- No file: first run. The app uses the defaults and shows the first-run notice.
- A corrupt file or an unknown `version`: the app writes a warning to `app.log` and uses the defaults. The next change to a setting replaces the file.
