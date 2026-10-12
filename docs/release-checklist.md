# Release checklist

Manual and interop checks that the release (P18, and P21 after v1.6) repeats or completes. Each phase adds its
rows when it runs a check. A row names the check, the date, the platform and the result.

## Playlist interop (P11.9, AC-3, B3)

The app writes `.m3u8` files in `Playlists/` with paths relative to the playlist file, so the
paths start with `../` (R13). If a tested player fails on `..` paths, the owner decides
whether playlists move to the folder root (B3).

Test playlist: written by the app's playlist code (`PlaylistSet::create` and `add`), with one
entry in each of two artist folders. The names hold accents, parentheses and spaces:

```text
#EXTM3U
#EXTINF:1,Björk - Human Behaviour
../Björk/Début (1993)/01 Human Behaviour.mp3
#EXTINF:1,Nina Simone - Sinner man
../Nina Simone/Pastel Blues/02 Sinner man.ogg
```

| Player | Platform | Date | Result |
|---|---|---|---|
| VLC 3.0.20 (`cvlc -I dummy -A dummy --play-and-exit -vv`) | Linux (Ubuntu, container) | October 12, 2026 | Pass: VLC created an input for both entries and reached EOF for each; the log has no "cannot open". |
| VLC | Windows | Not run | No Windows machine (P11 E1). B3 stays open until P18. |
| MusicBee | Windows | Not run | No Windows machine. |

## Keyboard walkthrough (P17.2, R25, P17-AC2)

Every R25 key and Ctrl+Shift+L in the release build, with a real music folder. Playwright
covers the same keys with mocked IPC in Chromium and WebKit (P2-AC10, P6-AC5, P7-AC5,
P7-AC12, P11-AC8).

| Key | Check | Linux (Xvfb, release build, October 12, 2026) | Windows |
|---|---|---|---|
| Up, Down | Move through the Artist list | Pass | Not run |
| Right, Left | Expand and collapse a Tree artist and album | Pass | Not run |
| Enter | Play the selected song in Tree mode | Pass: Now playing shows the song | Not run |
| Space | Toggle play and pause | Not run here: the container has no real-time audio sink, so a song ends at once. Playwright P7-AC5 passes in WebKit. | Not run |
| Ctrl+F, Esc | Focus the search, type, then clear it and return to the Library | Pass | Not run |
| F6, Shift+F6 | Move focus between visible widgets in reading order | Pass: Library, Now playing, Transport controls and back | Not run |
| Delete | Remove the selected Play queue entry | Pass | Not run |
| Delete | Remove the selected playlist entry | Pass: the entry left `Mix.m3u8` on disk | Not run |
| Ctrl+Shift+L | Reset layout | Pass: the Columns layout with the default widgets | Not run |

## Text scaling, reduced motion and high contrast (P17.3, P17.5, P17.6)

| Check | Linux | Windows |
|---|---|---|
| Large text (P17-AC5) | Pass with `GDK_DPI_SCALE` 1.25 and 1.4 (October 12, 2026): no overlap and no clipped control. The first run clipped Transport controls and Now playing at their 88 px minimum; P17 raised both minimums to 112 px. GNOME itself is not in the container. | Not run (150 percent display scale) |
| Reduced motion (P17-AC3) | Playwright emulation: every state of the sweep has no transition or animation. GNOME "Reduce animation" not run (no GNOME). | Not run ("Animation effects" off) |
| Forced colors (P17-AC6) | Playwright (Chromium emulation): focus ring, pressed toggles, the switch and the slider show. | Not run (Windows high contrast) |

## Platform matrix (P18.7, B5)

| Platform | Machine | Used for |
|---|---|---|
| Ubuntu 24.04 (container) | Agent container (WebKitGTK 2.52.6, 4 CPUs, 16 GB), Xvfb, software rendering, ALSA null output, a private D-Bus session, no window manager, root user | Release build, `.deb` and AppImage builds, manual Linux checks, memory |
| Ubuntu 22.04 and Windows (CI) | GitHub-hosted runners | `cargo test` on Linux and Windows, Playwright in Chromium and WebKit, debug builds, license checks |
| Windows 10 or 11 desktop | Not available (B5: the owner supplies one) | Every manual Windows check |
| Ubuntu 22.04 desktop, Debian 12 | Not available (B5 owner answer: Windows machine only) | Not verified: no Ubuntu desktop |

## Packages (P18.1 to P18.3, October 12, 2026)

| Check | Linux | Windows |
|---|---|---|
| `.deb` builds, under 30 MB | Pass: 9.26 MiB (local release build, Ubuntu 24.04 container; `release.yml` builds in Ubuntu 22.04) | Not applicable |
| AppImage builds, size recorded | Pass: 83.65 MiB (local, Ubuntu 24.04 libraries; it holds the LGPL and GPL texts) | Not applicable |
| NSIS installer and portable zip, under 30 MB | Not applicable | Pass for NSIS: 5.12 MiB (`measure.yml` run 38204302435). Portable zip: `release.yml` builds it on a tag. |
| One tag builds all four packages (P18-AC1) | Not run: no tag was pushed in this session. | Not run |
| Desktop entry: name, icon, `AudioVideo;Audio;Player;` | Pass: `.deb` desktop file read with `dpkg-deb` | Not applicable |
| Each package holds `LICENSE`, `NOTICE` and the third-party files | Pass: `.deb` (`/usr/lib/Clawdio`) and AppImage | Not run (zip layout is in `release.yml`) |
| `.deb` installs on Debian 12 and Ubuntu 22.04; AppImage runs (P18-AC5) | Not verified: no Ubuntu desktop and no Debian 12 machine | Not applicable |
| Installer: current user, no admin prompt; WebView2 bootstrapper (P18-AC3) | Not applicable | Not run |
| Portable exe without WebView2 shows the download link (P18-AC4, D38) | Not applicable | Not run |
| Taskbar and app grid icon, executable metadata (P18-AC11) | Not verified: no GNOME | Not run |

## Footprint (P18.5, AC-1, October 12, 2026)

Release build without fixtures, portable folder, a library made by `gen_test_library` with
50,000 tracks and `--covers 2000`, `scripts/measure-memory.sh` or `.ps1` with 3 runs per mode
and 60 s idle. Value: sum of PSS (Linux) or private working set (Windows) over the app process
tree, worst mode median (D28).

| OS and build | Tree | Columns | Top/bottom | Gate value | Target | Result |
|---|---|---|---|---|---|---|
| Linux container, `ddc97bd` (before D50) | 496 MB | 519 MB | 517 MB | 519 MB | 468 MB (raised at P3, D49) | Over the target. The owner asked for a reduction (B9). |
| Linux CI VM, `ddc97bd` (`measure.yml` run 38204302435) | 440 MB | 450 MB | 445 MB | 450 MB | 468 MB | Under the raised target |
| Linux container, D50 build | 294 MB | 298 MB | 297 MB | 298 MB | 468 MB; R20 200 MB | Under the raised target. 200 to 300 MB: the owner is told the number (R20). |
| Linux CI VM, `c0a0a40` with D50 (`measure.yml` run 38208222253) | 290 MB | 294 MB | 292 MB | 294 MB | 468 MB; R20 200 MB | Accepted by the owner (October 12, 2026) |
| Linux container, P20 head `907a0e4` (P21.1) | 309 MB | 315 MB | 313 MB | 315 MB | 468 MB; R20 200 MB | Under the raised target. 17 MB over the P18 container value (Columns run 3: web process 161 MB, was 150; `clawdio` 131 MB, was 127). The owner is told the number (R20). |
| Windows CI VM, `ddc97bd` (`measure.yml` run 38204302435) | 133 MB | 146 MB | 140 MB | 146 MB | 200 MB | Pass |
| Windows CI VM, `c0a0a40` (`measure.yml` run 38208222253) | 134 MB | 143 MB | 139 MB | 143 MB | 200 MB | Pass (D50 is Linux only) |

D50 (the B9 reduction) turns off WebKitGTK's accelerated compositing and DMABUF renderer and
limits glibc to two malloc arenas, with a trim after each scan. Columns run, Linux container:

| Process | Before | After |
|---|---|---|
| `WebKitWebProcess` | 338 MB | 150 MB |
| `clawdio` | 157 MB | 127 MB |
| `WebKitNetworkProcess` | 22 MB | 21 MB |

Input latency with `CLAWDIO_PERF=1` (select a song, then 30 Down keys): max 24 ms with D50 and
64 ms with compositing on; no event over 100 ms in either case. The UI renders the same (theme,
thumbnails, focus ring). `WEBKIT_DISABLE_COMPOSITING_MODE=0 WEBKIT_DISABLE_DMABUF_RENDERER=0`
turns both back on (the web process then uses 333 MB).

Package sizes (`measure.yml` run 38204302435): NSIS installer 5.12 MiB (5,365,658 bytes) and
`.deb` 9.25 MiB (9,696,204 bytes), both under 30 MB.

## Packages after v1.6 (P21.1, October 12, 2026, P20 head `907a0e4`)

| Check | Linux | Windows |
|---|---|---|
| `.deb` builds, under 30 MB | Pass: 9.36 MiB (local release build, Ubuntu 24.04 container) | Not applicable |
| AppImage builds, size recorded | Pass: 83.73 MiB; holds `LICENSE`, `NOTICE`, both third-party files and the LGPL 2.1 and 3.0 texts | Not applicable |
| `.deb` holds `LICENSE`, `NOTICE` and the third-party files | Pass (`dpkg-deb -c`, `/usr/lib/Clawdio`) | Not applicable |
| NSIS installer under 30 MB | Not applicable | Not run: `measure.yml` runs only on a push to a `measure/**` branch, which needs the owner's permission (B10). CI `tauri-build (windows-latest)` builds the app on `907a0e4` (run 38293560366). |
| One tag builds all four packages (P18-AC1) | Not run: no release tag was pushed | Not run |
| Licenses (P18.4): `cargo deny`, `NOTICE` and third-party files current | Pass: CI job `licenses` on `907a0e4` (run 38293560366). P20 adds no crate: `windows` 0.62.2 was already in `NOTICE`. | Same CI job |

## Licenses (P18.4)

| Check | Result |
|---|---|
| `cargo deny check` (P18-AC8) | Pass (local, cargo-deny 0.20.2). CI job `licenses` runs it. |
| `THIRD_PARTY_LICENSES_RUST.html` current | Pass (cargo-about 0.9.2) |
| `THIRD_PARTY_LICENSES_WEB.txt` current | Pass (27 production npm packages) |
| `NOTICE` current | Pass: assets, Rust crates of both shipped targets and npm packages. The release workflow adds the AppImage libraries from `dpkg-query` in the build container. |

## Brand swap demo (P18.8, AC-15, October 12, 2026)

Pass on Linux. A test `theme/tokens.json` and a test `clawdio-icon-full.svg` changed the CSS colors and the generated icons. Only the two inputs and `src-tauri/icons/` changed. The Q8 fallback is off, so `clawdio-icon-simple.svg` was not used. The swap was reverted.

## Acceptance checks (AC-1 to AC-24)

P21 (October 12, 2026) ran the checks again on the P20 head `907a0e4`. Rows that P19 and P20 did not touch keep their P18 result; CI run 38293560366 repeats every automated check on Linux and Windows.

"Auto" means the automated tests named in the plan pass on that OS in CI. "Not run" names the reason.

| Check | Linux | Windows |
|---|---|---|
| AC-1 Footprint | Pass against the raised target (D49): P21 315 MB in the container (P18: 298 MB container, 294 MB CI VM accepted by the owner); see "Footprint" | Pass at P18: 143 MB (CI VM); not measured again at P21 (B10) |
| AC-2 Responsive first scan | Exception: 2 of 3 runs under 100 ms (container, software rendering) | Not run |
| AC-3 Playlist interop | Pass (VLC, see above) | Not run: no Windows machine. B3 stays open. |
| AC-4 Import of real exports | Not run: the owner did not supply exports (Q5, B4) | Not run (Q5) |
| AC-5 Lyrics query | Pass (auto) | Pass (auto, CI) |
| AC-6 Artwork | Pass (auto); the Set cover picker did not run under Xvfb | Auto pass; manual not run |
| AC-7 Theme build | Pass (`npm run check`, CI on Linux) | Not run: the build does not depend on the OS |
| AC-8 Missing folder | Pass (manual Linux) | Not run |
| AC-9 Cache rebuild | Pass (manual Linux and auto) | Auto pass; manual not run |
| AC-10 Device unplugged | Not run: no device in the container (unit test passes) | Not run |
| AC-11 Docking per mode | Pass (Playwright Chromium and WebKit) | Not run in the app |
| AC-12 Layouts, tabs | Pass (Playwright) | Not run in the app |
| AC-13 Hidden Transport, media keys, Reset | Pass: keys (Playwright), MPRIS (`playerctl`), Ctrl+Shift+L | Not run: media keys need a Windows desktop |
| AC-14 Library cannot close, mode switch | Pass (Playwright) | Not run in the app |
| AC-15 Brand swap | Pass (above) | Not run |
| AC-16 Reduced motion | Pass (Playwright emulation); GNOME setting not run | Not run |
| AC-17 Portable copy to another drive | Exception: data in `data/` checked; drive letters are Windows only | Not run |
| AC-18 Two-disc order | Pass (auto) | Pass (auto, CI) |
| AC-19 Decode error skip | Pass (auto) | Pass (auto, CI) |
| AC-20 First song before the scan ends | Pass (P4-AC3, cold cache); P7-AC10 exception (warm scan ends in 2 s) | Not run |
| AC-21 Embedded lyrics | Pass (auto and manual Linux) | Pass (auto, CI) |
| AC-22 Bulk import and repair | Pass (auto: P19-AC1 to P19-AC6, P19-AC9; Playwright P19-AC7) | Auto pass (CI); manual with the owner's playlists not run (P19-AC8) |
| AC-23 Microphone ducking | Not applicable: Windows only (D53) | Not verified (owner decision at P20): the P20.0 probe showed the signal follows Handy and a WhatsApp call, and two overlapping users; the app itself was not run. Unit tests pass (P20-AC1, P20-AC7). |
| AC-24 No microphone use by the app | Not applicable: Windows only | Not verified (owner decision at P20). The detector reads audio sessions only and opens no capture stream (D54, code review P20-AC6). |
