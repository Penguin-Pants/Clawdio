# Milestone 0 footprint gate

This file records the R20 Milestone 0 spike (build plan P3): the method, the environment, the numbers per OS, the bundle sizes and the verdict.

## Bottom line

- Linux idle memory: **470 MB** (worst Library mode, median of 3 runs). This is over 300 MB, so D49 applies: the Linux memory target becomes 470 MB and the build continues. The owner is told the number.
- Windows idle memory: **not measured yet**. The `measure.yml` workflow runs it on windows-latest. It needs a push to a `measure/**` branch or the workflow on the default branch (blocker B8).
- Linux `.deb`: **3.3 MB** (3,454,940 bytes) against the 30 MB target: pass. Windows NSIS installer: **2.2 MB** (2,341,082 bytes, `measure.yml` run 38169331542): pass.

## Method

- **Build.** Release build with the `fixtures` Cargo feature (D35): `npm run tauri build -- --features fixtures --no-bundle`. The bundles for the size check are built without the feature.
- **Data.** The `fixtures` feature fills the real library index with 1,000 artists, 5,000 albums and 50,000 songs with accented and numbered names. The real query commands serve it (D14). The app writes 2,000 album thumbnails (96 px JPEG) into the thumbnail folder and loads them through the asset protocol (D41). Play queue: 500 entries. Playlists: 20 with 30 entries each. Lyrics: 60 lines. Now playing and Transport controls show the current entry.
- **Arrangement.** `CLAWDIO_MEASURE_MODE` (`tree`, `columns` or `topBottom`) shows all six widgets in that Library mode. The arrangement is not saved.
- **Metric (D28).** Linux: the sum of PSS over the app process tree (the app, `WebKitWebProcess` and `WebKitNetworkProcess`). Windows: the sum of the private working set over the app process tree, WebView2 processes included.
- **Timing.** 15 s for start-up, then 60 s idle with the window visible and no playback.
- **Runs.** 3 runs per mode. The value per mode is the median. The gate value per OS is the worst mode.
- **Scripts.** `scripts/measure-memory.sh` (Linux) and `scripts/measure-memory.ps1` (Windows). Each writes a JSON file with the per-process values, the total per run, the median per mode and the environment.

## Linux

**Environment:** agent container, Ubuntu 24.04.5 LTS, kernel 6.18.44, 4 CPUs, 16 GB RAM, WebKitGTK 2.52.6, Xvfb display (1200 x 800, 24 bit) with no GPU, so WebKit renders in software. Release build of commit `1990a37` with `--features fixtures`.

| Mode | Run 1 | Run 2 | Run 3 | Median |
|---|---|---|---|---|
| Tree | 454 MB | 448 MB | 450 MB | 450 MB |
| Columns | 466 MB | 474 MB | 470 MB | **470 MB** |
| Top/bottom | 465 MB | 466 MB | 470 MB | 466 MB |

Per process (median run of the worst mode): the app process 109 MB, `WebKitWebProcess` 339 MB, `WebKitNetworkProcess` 21 MB.

## Windows

Not measured yet (B8). The workflow job `memory (windows-latest)` writes `memory-windows.json`. The first run (38169331542) stopped before any sample: in PowerShell `$runs` and the `-Runs` parameter are one variable, so the script failed. Fixed.

## Bundle sizes

| Bundle | Size | Target | Result |
|---|---|---|---|
| Linux `.deb` (release, no fixtures) | 3.3 MB | under 30 MB | Pass |
| Windows NSIS installer (release, no fixtures) | 2.2 MB | under 30 MB | Pass |

## Scrolling

With the fixtures build under Xvfb, each Library mode showed the 50,000 songs in virtualized lists. Only the rows in view are in the DOM; song rows load for the visible window (D14). The browser tests in `tests/e2e/milestone.spec.ts` scroll the Songs list to its end and expand the tree.

## Verdict

- **Memory, Linux:** 470 MB is over 300 MB. Per D49 the Linux target becomes 470 MB. The build continues. K15 applies: the numbers come from a container with Xvfb and software rendering, not from a desktop session; P18.5 measures again.
- **Memory, Windows:** open (B8).
- **Package size:** both bundles pass (3.3 MB `.deb`, 2.2 MB NSIS).
