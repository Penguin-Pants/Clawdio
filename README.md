<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/branding/export/clawdio-wordmark-primary.svg">
    <img alt="Clawdio" src="assets/branding/export/clawdio-wordmark-light.svg" height="72">
  </picture>
</h1>

Minimalist local music player

## Online lookups

The "Online lookups" switch in Settings is off by default. While it is off, the app makes no network request. While it is on, the app looks up missing album art over HTTPS, with no account and no API key:

| Service | Use | Data sent |
|---|---|---|
| MusicBrainz | Find the release group of an album with no art | The artist and album folder names, in lower case and without accents, a leading year, edition words such as "Remastered" or a leading "The" |
| Cover Art Archive | Download the front cover at 500 px | The MusicBrainz release group id |

Each request carries a User-Agent with the app name, its version and the project URL. MusicBrainz requests start at least 1 second apart.

Files the app writes in the music folder:

- `cover.jpg` in an album folder that has no cover file and no embedded art. The app never replaces an existing file.
- `sidecar.json` in an album folder: a `no-match` marker (no single matching album on MusicBrainz) or a `no-art` marker (no cover on Cover Art Archive), so the album is not looked up again. "Retry lookup" on the album menu removes the marker. See `docs/file-formats.md`.

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
