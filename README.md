<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/branding/export/clawdio-wordmark-primary.svg">
    <img alt="Clawdio" src="assets/branding/export/clawdio-wordmark-light.svg" height="72">
  </picture>
</h1>

Minimalist local music player

## Features

- Plays MP3, WAV and OGG Vorbis files from one music folder, organized by artist and album folders.
- A Library with three modes: Tree, Columns and Top/bottom, with search that ignores case and accents.
- Dockable widgets: Library, Transport controls, Now playing, Playlists, Play queue and Lyrics. The arrangement is saved and restored.
- Splitters between the Artist, Album and Songs frames, with sizes kept per Library mode. Transport controls and Now playing stay thin bars: drop one on the top or bottom of a widget, or beside the other bar.
- Playlists as `.m3u8` files in the music folder, a Favorites heart, and import of M3U, M3U8 and Apple Music XML playlists: several files or a whole folder at once. "Find missing songs" fixes entries whose song moved or is stored in another format.
- Album art from cover files or embedded pictures, lyrics from `.lrc` and `.txt` files or tags.
- Optional online lookups for album art, lyrics and missing titles (see below).
- OS media keys and the system media panel. Portable mode.
- Windows: the music gets quieter or pauses while another app uses a microphone, for example a dictation tool or a call (Settings, "When the microphone is in use"). The app never opens the microphone.

## Install

| Platform | Package | Notes |
|---|---|---|
| Windows 10 or 11 | `Clawdio_<version>_x64-setup.exe` | Installs for the current user, with no admin prompt. If the WebView2 Runtime is missing (Windows 10 only), the installer downloads it. |
| Windows 10 or 11 | `Clawdio-<version>-windows-portable.zip` | Unzip anywhere and run `Clawdio.exe`. Needs the WebView2 Runtime; without it the app shows a dialog with the download link and exits. |
| Linux (Ubuntu 22.04 or later, Debian 12) | `Clawdio_<version>_amd64.deb` | `sudo apt install ./Clawdio_<version>_amd64.deb` installs the dependencies. |
| Linux (glibc 2.35 or later) | `Clawdio_<version>_amd64.AppImage` | `chmod +x` the file and run it. AppImages need FUSE 2: on Ubuntu 22.04 install `libfuse2`, on 24.04 `libfuse2t64`. Without FUSE, run it with `--appimage-extract-and-run`. |

Each package holds `LICENSE`, `NOTICE` and the third-party license files.

The Windows files are not code-signed. Windows SmartScreen can show "Windows protected your PC": select **More info**, then **Run anyway**.

On Linux the app turns off WebKit's accelerated compositing and DMABUF renderer to use about 200 MB less memory. To turn them on again, start the app with `WEBKIT_DISABLE_COMPOSITING_MODE=0 WEBKIT_DISABLE_DMABUF_RENDERER=0`.

## Portable mode

A file named `portable` next to the executable (next to the `.AppImage` file on Linux) turns on portable mode. Settings, the widget arrangement, the playback state, the cache, the logs and the WebView data then live in `data/` next to the executable. A music folder on the same drive is stored as a relative path, so a copy of the app folder and the music folder to another drive letter keeps working. The portable zip already holds the `portable` file.

## Keyboard shortcuts

| Key | Action |
|---|---|
| Space | Play or pause (not while typing in a field) |
| Up, Down | Move in lists and trees |
| Right, Left | Expand or collapse in trees |
| Enter | Play the selected song or album |
| Ctrl+F | Focus the Library search |
| Esc | Clear the search and return to the Library |
| F6, Shift+F6 | Move focus to the next or previous widget |
| Delete | Remove the selected entry from the Play queue or a playlist |
| Shift+F10, Menu key | Open the menu of the selected row (in the Songs table: Add to Favorites too) |
| Shift+click, Shift+Up, Shift+Down | Select a range of songs |
| Ctrl+click | Add a song to the selection or remove it |
| Tab (from the Songs table) | Move to the column headers |
| Left, Right, Home, End (headers) | Move between column headers |
| Enter, Space (headers) | Sort by the column: ascending, descending, then the default order |
| Shift+Enter, Shift+click (headers) | Add the column as the second sort, or flip a sort key |
| Shift+Left, Shift+Right (headers) | Move the column |
| Ctrl+Left, Ctrl+Right (headers) | Make the column narrower or wider |
| Shift+F10, Menu key (headers) | Open the column menu: show or hide columns, auto size, reset |
| Down (headers) | Return to the songs |
| Ctrl+Shift+L | Reset the layout |

Media keys (play, pause, next, previous, stop) work while the app runs in the background.

## Songs table

- **Drag to a playlist or the queue:** select songs, then drag them onto a playlist in Playlists or onto the Play queue. Escape cancels the drag. The row menu (Shift+F10) does the same by keyboard: Add to queue, Add to playlist.
- **Compact rows:** the menu, View, "Compact rows".

## Transport bar

- **Customize:** the menu, Layout, "Customize transport bar…" (or the More menu of the bar) shows or hides each control and changes their order. Play or pause always shows. Reset layout restores the default.
- **Mini player:** click the album art in the bar, or choose "Mini player" in the menu. The window shrinks to the bar alone. Choose "Exit mini player" in the More menu, or click the art, to return to the normal window.

## Data locations

The music folder holds your music, playlists (`Playlists/*.m3u8`), `cover.jpg` files, lyrics files and `sidecar.json` files. The app never changes audio files.

| Data | Windows | Linux |
|---|---|---|
| Settings, arrangement, playback state | `%APPDATA%\io.github.penguinpants.clawdio` | `~/.config/io.github.penguinpants.clawdio` |
| Library cache and thumbnails (rebuilt when deleted) | `%LOCALAPPDATA%\io.github.penguinpants.clawdio` | `~/.cache/io.github.penguinpants.clawdio` |
| Logs (Settings, "Open log folder") | `%LOCALAPPDATA%\io.github.penguinpants.clawdio\logs` | `~/.local/share/io.github.penguinpants.clawdio/logs` |

In portable mode all of these are in `data/` next to the executable. The formats are in `docs/file-formats.md`.

## Online lookups

The "Online lookups" switch in Settings is off by default. While it is off, the app makes no network request. While it is on, the app looks up missing album art and, on request, lyrics over HTTPS, with no account and no API key:

| Service | Use | Data sent |
|---|---|---|
| MusicBrainz | Find the release group of an album with no art | The artist and album folder names, in lower case and without accents, a leading year, edition words such as "Remastered" or a leading "The" |
| Cover Art Archive | Download the front cover at 500 px | The MusicBrainz release group id |
| LRCLIB | "Fetch lyrics" in the Lyrics widget, for the playing song | The artist and album folder names, the song title and its duration in seconds |

Each request carries a User-Agent with the app name, its version and the project URL. MusicBrainz requests start at least 1 second apart. LRCLIB gets one request at a time.

Files the app writes in the music folder:

- `cover.jpg` in an album folder that has no cover file and no embedded art. The app never replaces an existing file.
- `sidecar.json` in an album folder: a `no-match` marker (no single matching album on MusicBrainz) or a `no-art` marker (no cover on Cover Art Archive), so the album is not looked up again. "Retry lookup" on the album menu removes the marker. See `docs/file-formats.md`.
- `<song>.lrc` (synced lyrics) or `<song>.txt` (plain lyrics) next to the song, after "Fetch lyrics". The app never replaces an existing file.

Turning the switch off cancels the lookups and stops downloads at once.

## Build from source

### Prerequisites

- Node.js 22.12 or later (CI uses Node.js 24).
- Rust 1.97. `rust-toolchain.toml` pins it, so `rustup` installs it on the first build.
- Linux (Debian 12, Ubuntu 22.04 or later):

  ```sh
  sudo apt-get install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev \
    libssl-dev libayatana-appindicator3-dev librsvg2-dev libasound2-dev libdbus-1-dev
  ```

- Windows 10 or 11: Microsoft C++ Build Tools and the WebView2 Runtime (Windows 11 has it).

### Commands

| Task | Command |
|---|---|
| Install dependencies | `npm ci` |
| Run the app with live reload | `npm run tauri dev` |
| Build the app | `npm run tauri build` |
| Frontend checks (lint, types, tests, source and SVG guards) | `npm run check` |
| Rust checks | `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace` |
| UI tests (Playwright, Chromium and WebKit, mocked IPC) | `npx playwright install chromium webkit`, then `npm run test:e2e` |

The theme comes from `theme/tokens.json`. The build compiles it to CSS. See `docs/theming-and-brand.md`.

## License

MIT. See `LICENSE`. Third-party components and their licenses are in `NOTICE`.
