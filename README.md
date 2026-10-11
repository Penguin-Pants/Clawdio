<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/branding/export/clawdio-wordmark-primary.svg">
    <img alt="Clawdio" src="assets/branding/export/clawdio-wordmark-light.svg" height="72">
  </picture>
</h1>

Minimalist local music player

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

The theme comes from `theme/tokens.json`. The build compiles it to CSS. See `docs/theming-and-brand.md`.

## License

MIT. See `LICENSE`. Third-party components and their licenses are in `NOTICE`.
