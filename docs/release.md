# Releasing

How to publish a release. The release ships the Windows portable zip only (R21 v1.15, owner decision 49). The workflow is `.github/workflows/release.yml`.

## Rules

- **Every release has a higher version than all earlier ones.** A fix for a bad release is a new, higher version.
- **The version is in four places:** `src-tauri/tauri.conf.json`, `package.json` (with `package-lock.json`), `src-tauri/Cargo.toml` and `crates/clawdio-core/Cargo.toml` (with `Cargo.lock`). The workflow stops when they differ.
- **Every version needs its release notes** in `docs/release-notes/<version>.md`. The workflow stops when the file is missing.
- **The workflow runs on `main` only.** A run on another branch does nothing.

The version in the requirements document (for example, v1.15) is a document
revision, not the app version. Read the app version from
`src-tauri/tauri.conf.json`. Release `0.1.0` needs
`docs/release-notes/0.1.0.md`. `npm run check` checks the version
files, their lock files and the notes for the current app version before merge.

## Steps

1. **Release PR.** Set the new version in the four files, run `npm install` and `cargo check` so the lock files follow, run `npm run licenses` (needs `cargo-about`) so `THIRD_PARTY_LICENSES_RUST.html` names the app crates at the new version, and add `docs/release-notes/<version>.md`. The CI `licenses` job fails when that file still names the old version. Merge the PR into `main` once CI is green.
2. **Build.** In GitHub, open Actions > "Release" > "Run workflow" on `main`. The workflow:
   1. checks the version files, refuses a version that already has a release and needs the release notes;
   2. runs `npm run check` and `cargo test --workspace` on Windows;
   3. builds the executable and packs the portable zip: the executable, the `portable` marker (R18.1), `LICENSE`, `NOTICE` and the third-party license files;
   4. writes `SHA256SUMS-windows.txt`;
   5. drafts the GitHub release `v<version>` on the built commit, with the release notes as its text and the zip and checksums as its files.
3. **Check.** Download the zip from the draft, unzip it on Windows and start the executable. Settings, the arrangement and the queue go to the `data` folder next to it.
4. **Publish.** Open the draft release and press "Publish release". Publishing creates the tag `v<version>`.

## When a run fails

- **Version mismatch, existing release or missing notes:** fix it in a PR and run the workflow again.
- **After a fix is merged:** start a new run on `main`. Re-running a failed job uses the old commit, so it does not include the fix.
- **A check or the build fails:** the run makes no release. Fix the cause in a PR and run again.
- **A draft exists but is wrong:** delete the draft (no tag exists until it is published) and run again.
