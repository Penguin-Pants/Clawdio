# Milestone 0 footprint gate

This file records the R20 Milestone 0 spike (build plan P3): the method, the environment, the numbers per OS, the bundle sizes and the verdict.

## Bottom line

- Linux idle memory: **468 MB** (worst Library mode, median of 3 runs). This is over 300 MB, so D49 applies: the Linux memory target becomes 468 MB and the build continues. The owner is told the number.
- Windows idle memory: **112 MB** (worst Library mode, median of 3 runs, `measure.yml` run 38171140952 on windows-latest). This is under 200 MB: pass. Windows keeps the 200 MB target.
- Linux on the CI runner (ubuntu-22.04, Xvfb): **390 MB** in the same run. The Linux gate value is the worst Linux measurement, 468 MB from the agent container.
- Linux `.deb`: **3.3 MB** (3,454,940 bytes) against the 30 MB target: pass. Windows NSIS installer: **2.2 MB** (2,341,082 bytes, `measure.yml` run 38169331542): pass.

## Method

- **Build.** Release build with the `fixtures` Cargo feature (D35): `npm run tauri build -- --features fixtures --no-bundle`. The bundles for the size check are built without the feature.
- **Data.** The `fixtures` feature fills the real library index with 1,000 artists, 5,000 albums and 50,000 songs with accented and numbered names. The real query commands serve it (D14). The app writes 2,000 album thumbnails (96 px JPEG) into the thumbnail folder and loads them through the `thumb://` scheme (D41). Play queue: 500 entries. Playlists: 20 with 30 entries each. Lyrics: 60 lines. Now playing and Transport controls show the current entry.
- **Arrangement.** `CLAWDIO_MEASURE_MODE` (`tree`, `columns` or `topBottom`) shows all six widgets in that Library mode. The arrangement is not saved.
- **Metric (D28).** Linux: the sum of PSS over the app process tree (the app, `WebKitWebProcess` and `WebKitNetworkProcess`). Windows: the sum of the private working set over the app process tree, WebView2 processes included.
- **Timing.** The app writes a ready file once all six widgets show data and the Now playing thumbnail has loaded through `thumb://` (`CLAWDIO_MEASURE_READY`, at most 60 s). Then 60 s idle with the window visible and no playback. A run fails when the app exits or never signals. `measure.yml` run 38172605144 on `e896960` (the first build with `thumb://`) passed on Linux and Windows, so the scheme loads thumbnails on both. The numbers below come from `e62ddca`.
- **Runs.** 3 runs per mode. The value per mode is the median. The gate value per OS is the worst mode.
- **Scripts.** `scripts/measure-memory.sh` (Linux) and `scripts/measure-memory.ps1` (Windows). Each writes a JSON file with the per-process values, the total per run, the median per mode and the environment.

## Linux

**Environment:** agent container, Ubuntu 24.04.5 LTS, kernel 6.18.44, 4 CPUs, 16 GB RAM, WebKitGTK 2.52.6, Xvfb display (1200 x 800, 24 bit) with no GPU, so WebKit renders in software. Release build of commit `e62ddca` with `--features fixtures` (rows per window, ready signal).

| Mode | Run 1 | Run 2 | Run 3 | Median |
|---|---|---|---|---|
| Tree | 446 MB | 446 MB | 451 MB | 446 MB |
| Columns | 468 MB | 469 MB | 466 MB | **468 MB** |
| Top/bottom | 465 MB | 464 MB | 464 MB | 464 MB |

Per process (median run of the worst mode): the app process 108 MB, `WebKitWebProcess` 338 MB, `WebKitNetworkProcess` 21 MB.

## Windows

**Environment:** GitHub-hosted windows-latest runner: Microsoft Windows Server 2025 Datacenter 10.0.26100, 4 CPUs, 16 GB RAM, WebView2 Runtime 153.0.4234.48. Release build of commit `e62ddca` with `--features fixtures`. `measure.yml` run 38171140952.

| Mode | Run 1 | Run 2 | Run 3 | Median |
|---|---|---|---|---|
| Tree | 106 MB | 112 MB | 107 MB | 107 MB |
| Columns | 114 MB | 111 MB | 112 MB | **112 MB** |
| Top/bottom | 109 MB | 108 MB | 110 MB | 109 MB |

Per process (Columns run 2): the app process 21 MB and six `msedgewebview2` processes (41, 28, 8, 5, 2 and 1 MB).

The first run (38169331542) stopped before any sample: in PowerShell `$runs` and the `-Runs` parameter are one variable, so the script failed. Fixed.

## Linux on the CI runner

`measure.yml` run 38171140952, ubuntu-22.04 runner with Xvfb, same build: Tree 389 MB, Columns 389 MB, Top/bottom 390 MB (medians). Gate value 390 MB.

## Bundle sizes

| Bundle | Size | Target | Result |
|---|---|---|---|
| Linux `.deb` (release, no fixtures) | 3.3 MB | under 30 MB | Pass |
| Windows NSIS installer (release, no fixtures) | 2.2 MB | under 30 MB | Pass |

## Scrolling

With the fixtures build under Xvfb, each Library mode showed the 50,000 songs in virtualized lists. Only the rows in view are in the DOM; song rows load for the visible window (D14). The browser tests in `tests/e2e/milestone.spec.ts` scroll the Songs list to its end and expand the tree.

## Verdict

- **Memory, Linux:** 468 MB is over 300 MB. Per D49 the Linux target becomes 468 MB. The build continues. K15 applies: the numbers come from a container with Xvfb and software rendering, not from a desktop session; P18.5 measures again.
- **Memory, Windows:** 112 MB, under 200 MB: pass. The Windows target stays 200 MB (D49).
- **Package size:** both bundles pass (3.3 MB `.deb`, 2.2 MB NSIS).
