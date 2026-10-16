//! Background jobs: the scan (P4.7, P5.4, P5.9). The status line shows progress with Cancel
//! (R5). One scan runs at a time. Import and repair wait for a scan to end (R33.1).

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

use clawdio_core::api::{JobProgress, ScanCounts};
use clawdio_core::cache::Cache;
use clawdio_core::scan::{self, ScanReport};
use tauri::{AppHandle, Manager};

use crate::events::{emit, JOB_PROGRESS, LIBRARY_CHANGED, PLAYLISTS_CHANGED, STATUS_MESSAGE};
use crate::persist::StateStore;
use crate::player::PlayerHandle;
use crate::state::Playlists;
use crate::state::{AppState, Library};

pub const SCAN_JOB: &str = "scan";
/// `library-changed` goes out at most twice per second (section 6.9).
const LIBRARY_EVENT_GAP: Duration = Duration::from_millis(500);
/// One scan at a time: a new scan waits until the canceled one has stopped, so the old one
/// cannot write after the new one clears the index.
pub(crate) static SCAN_GATE: Mutex<()> = Mutex::new(());
/// Scans started and not yet ended. Rescan does nothing while one runs (R2).
static ACTIVE: AtomicUsize = AtomicUsize::new(0);
/// The number of scans that ended and whether the last one completed (R33.1).
struct Ends {
    count: u64,
    complete: bool,
}

static ENDS: Mutex<Ends> = Mutex::new(Ends {
    count: 0,
    complete: false,
});
/// Wakes the waiters of [`scan_and_wait`] when a scan ends.
static ENDED: Condvar = Condvar::new();
/// Goes up on each folder change. A folder job whose number is not the latest was replaced by
/// a newer one, which clears the old folder itself.
static FOLDER_GENERATION: AtomicU64 = AtomicU64::new(0);

/// True when a newer folder change replaced the job of `generation`.
fn superseded(generation: u64) -> bool {
    generation != FOLDER_GENERATION.load(Ordering::SeqCst)
}

/// Why a scan starts.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScanKind {
    /// Startup sync: fill the index from the cache first (R2, R19).
    Startup,
    /// The Rescan command.
    Rescan,
    /// A new music folder: stop playback, clear the queue, the index and the cache (P5.9).
    NewFolder,
}

fn progress(app: &AppHandle, text: Option<String>) {
    emit(
        app,
        JOB_PROGRESS,
        JobProgress {
            id: SCAN_JOB.into(),
            text,
            cancelable: true,
        },
    );
}

/// Whether a scan runs or waits to run.
pub fn scan_running() -> bool {
    ACTIVE.load(Ordering::SeqCst) > 0
}

/// The status line text for a finished scan (R2, P5.4).
pub fn summary(report: &ScanReport) -> String {
    if report.canceled {
        format!(
            "Scan canceled: {} added, {} skipped",
            report.added, report.skipped
        )
    } else if report.failed {
        format!(
            "Scan incomplete: {} added, {} skipped. Some folders could not be read",
            report.added, report.skipped
        )
    } else {
        format!(
            "Scan complete: {} added, {} removed, {} skipped",
            report.added, report.removed, report.skipped
        )
    }
}

fn counts(report: &ScanReport) -> ScanCounts {
    let small = |n: u64| n.min(u32::MAX as u64) as u32;
    ScanCounts {
        added: small(report.added),
        removed: small(report.removed),
        skipped: small(report.skipped),
    }
}

/// Counts one scan in [`ACTIVE`] until it is dropped, also when the scan thread panics. The
/// drop records the end in [`ENDS`].
#[derive(Default)]
struct ActiveGuard {
    /// True when the scan traversed the whole folder.
    complete: bool,
}

impl Drop for ActiveGuard {
    fn drop(&mut self) {
        let mut ends = ENDS.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        ends.count += 1;
        ends.complete = self.complete;
        ACTIVE.fetch_sub(1, Ordering::SeqCst);
        ENDED.notify_all();
    }
}

fn ends() -> std::sync::MutexGuard<'static, Ends> {
    ENDS.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Waits until a scan that ended after `before` ends were counted, and no scan runs or
/// waits. True when the last one completed.
fn wait_for_end(before: u64) -> bool {
    let mut ends = ends();
    while ends.count == before || ACTIVE.load(Ordering::SeqCst) > 0 {
        ends = ENDED
            .wait(ends)
            .unwrap_or_else(|poisoned| poisoned.into_inner());
    }
    ends.complete
}

/// Rescan first (R33.1): starts the incremental scan, or waits for the running one, then
/// waits for its end. True when it completed; false when it was canceled or failed. Blocks
/// the calling thread.
pub fn scan_and_wait(app: &AppHandle, root: PathBuf) -> bool {
    let before = ends().count;
    if let Some(active) = claim_idle() {
        spawn_scan(app, root, ScanKind::Rescan, active);
    }
    wait_for_end(before)
}

/// Starts a scan of `root` on a background thread. A new folder cancels the running scan
/// first; the other kinds run after it.
pub fn start_scan(app: &AppHandle, root: PathBuf, kind: ScanKind) {
    ACTIVE.fetch_add(1, Ordering::SeqCst);
    spawn_scan(app, root, kind, ActiveGuard::default());
}

/// Starts a Rescan unless a scan runs or waits (R2, P5-AC5). Returns whether it started.
pub fn start_rescan(app: &AppHandle, root: PathBuf) -> bool {
    match claim_idle() {
        Some(active) => {
            spawn_scan(app, root, ScanKind::Rescan, active);
            true
        }
        None => false,
    }
}

/// Counts a scan only when none runs or waits, in one atomic step.
fn claim_idle() -> Option<ActiveGuard> {
    ACTIVE
        .compare_exchange(0, 1, Ordering::SeqCst, Ordering::SeqCst)
        .ok()
        .map(|_| ActiveGuard::default())
}

fn spawn_scan(app: &AppHandle, root: PathBuf, kind: ScanKind, active: ActiveGuard) {
    let state = app.state::<AppState>();
    let cancel = Arc::new(AtomicBool::new(false));
    if let Ok(mut slot) = state.scan_cancel.lock() {
        if let Some(previous) = slot.replace(cancel.clone()) {
            if kind == ScanKind::NewFolder {
                previous.store(true, Ordering::Relaxed);
            }
        }
    }
    // The number is taken in request order, so a job that waits longer for the gate still
    // knows that it was replaced.
    let generation = if kind == ScanKind::NewFolder {
        FOLDER_GENERATION.fetch_add(1, Ordering::SeqCst) + 1
    } else {
        FOLDER_GENERATION.load(Ordering::SeqCst)
    };
    let cache_dir = state.dirs.cache.clone();
    let library = app.state::<Library>().0.clone();
    let app = app.clone();
    let spawned = std::thread::Builder::new()
        .name("scan".into())
        .spawn(move || {
            let mut active = active;
            let _gate = SCAN_GATE
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            active.complete =
                run_scan(&app, &root, kind, generation, &library, &cache_dir, &cancel);
        });
    // On failure the closure, and with it the guard, is dropped.
    if let Err(error) = spawned {
        log::warn!("scan: cannot start: {error}");
    }
}

/// Runs one scan. True when it traversed the whole folder.
fn run_scan(
    app: &AppHandle,
    root: &std::path::Path,
    kind: ScanKind,
    generation: u64,
    library: &std::sync::RwLock<clawdio_core::library::LibraryIndex>,
    cache_dir: &std::path::Path,
    cancel: &AtomicBool,
) -> bool {
    // Without the cache the scan still fills the index (D14).
    let mut cache = Cache::open(cache_dir)
        .inspect_err(|error| log::warn!("cache: cannot open: {error}"))
        .ok();
    match kind {
        ScanKind::Startup if !cancel.load(Ordering::Relaxed) => {
            if let Some(cache) = &cache {
                match scan::load(library, cache) {
                    Ok(count) => log::info!("cache: loaded {count} tracks"),
                    Err(error) => log::warn!("cache: cannot read: {error}"),
                }
                emit(app, LIBRARY_CHANGED, ());
            }
            // Every saved entry may be in the cache already (P9.1).
            app.state::<StateStore>().try_restore(app, false);
        }
        ScanKind::NewFolder if superseded(generation) => {
            // A newer folder change clears and scans; this job must not clear its results.
            log::info!("scan: a newer folder change replaced this one");
            return false;
        }
        ScanKind::NewFolder => {
            // Lookups for the old folder stop (P14.6).
            crate::online::cancel(app);
            // The old folder's entries leave the player first, then the index and the cache.
            // This runs even when the scan is canceled before it starts (P5-AC13).
            app.state::<StateStore>().new_folder();
            app.state::<PlayerHandle>().clear();
            // The old folder's playlists go; the new folder's come with the scan (P11.10).
            if let Ok(mut playlists) = app.state::<Playlists>().0.lock() {
                playlists.clear();
            }
            emit(app, PLAYLISTS_CHANGED, ());
            // A cache that cannot be cleared is deleted, so its old-folder rows never load
            // against the new folder.
            let cleared = match cache.as_mut().map(Cache::clear) {
                Some(Ok(())) => true,
                Some(Err(error)) => {
                    log::warn!("cache: cannot clear: {error}");
                    false
                }
                None => false,
            };
            if !cleared {
                // The connection closes before the files go (Windows).
                drop(cache.take());
                if let Err(error) = Cache::delete_files(cache_dir) {
                    log::warn!("cache: cannot delete: {error}");
                }
                cache = Cache::open(cache_dir)
                    .inspect_err(|error| log::warn!("cache: cannot open: {error}"))
                    .ok();
            }
            if let Ok(mut index) = library.write() {
                index.clear_tracks();
            }
            emit(app, LIBRARY_CHANGED, ());
        }
        ScanKind::Startup | ScanKind::Rescan => {}
    }
    if cancel.load(Ordering::Relaxed) {
        return false;
    }
    progress(app, Some("Scanning".into()));
    let mut last = Instant::now();
    let report = scan::scan(root, library, cache.as_mut(), cancel, |report| {
        progress(app, Some(format!("Scanning: {} files", report.files)));
        if last.elapsed() >= LIBRARY_EVENT_GAP {
            last = Instant::now();
            emit(app, LIBRARY_CHANGED, ());
        }
    });
    emit(app, LIBRARY_CHANGED, ());
    progress(app, None);
    #[cfg(target_os = "linux")]
    crate::linux_memory::trim();
    let text = summary(&report);
    log::info!(
        "scan: {text} ({} read, {} covers decoded)",
        report.read,
        report.covers_decoded
    );
    emit(app, STATUS_MESSAGE, text);
    // Missing saved entries go only after a complete traversal (P9.1).
    let complete = !report.canceled && !report.failed;
    load_playlists(app, root, &report.playlists, complete);
    app.state::<StateStore>().try_restore(app, complete);
    // Settings keeps the counts of the last complete scan (R2).
    if !complete {
        return false;
    }
    crate::commands::lyrics::after_scan(app);
    crate::online::scan_done(app);
    let counts = counts(&report);
    if let Err(error) =
        crate::commands::settings::update(app, |settings| settings.last_scan = Some(counts))
    {
        log::warn!("settings: cannot save the scan counts: {}", error.message);
    }
    true
}

/// Reads the playlists the scan found (P11.2). After an incomplete scan the known ones stay,
/// so a canceled scan does not hide a playlist. A scan never writes a playlist (R13).
fn load_playlists(app: &AppHandle, root: &std::path::Path, found: &[String], complete: bool) {
    let playlists = app.state::<Playlists>();
    let Ok(mut set) = playlists.0.lock() else {
        return;
    };
    let mut paths = found.to_vec();
    if !complete {
        let known: Vec<String> = set.paths().map(str::to_owned).collect();
        for path in known {
            if !paths.contains(&path) {
                paths.push(path);
            }
        }
    }
    set.load(root, &paths);
    drop(set);
    emit(app, PLAYLISTS_CHANGED, ());
}

/// Cancels the running job with this id (R5 status line Cancel).
pub fn cancel(app: &AppHandle, id: &str) {
    if id == crate::online::ARTWORK_JOB {
        crate::online::cancel(app);
        return;
    }
    if id == crate::commands::lyrics::LYRICS_JOB {
        crate::commands::lyrics::cancel_manual(app);
        return;
    }
    if id == crate::commands::metadata::METADATA_JOB {
        crate::commands::metadata::cancel(app);
        return;
    }
    if id != SCAN_JOB {
        return;
    }
    if let Ok(slot) = app.state::<AppState>().scan_cancel.lock() {
        if let Some(cancel) = slot.as_ref() {
            cancel.store(true, Ordering::Relaxed);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_latest_folder_change_is_current() {
        let older = FOLDER_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
        assert!(!superseded(older));
        let newer = FOLDER_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
        assert!(superseded(older), "the older job must not clear (L)");
        assert!(!superseded(newer));
    }

    /// The tests that count scans in [`ACTIVE`] run one at a time.
    static SERIAL: Mutex<()> = Mutex::new(());

    #[test]
    fn a_rescan_claims_only_an_idle_scanner() {
        let _serial = SERIAL
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let first = claim_idle().expect("idle at the start");
        assert!(
            claim_idle().is_none(),
            "a second Rescan starts nothing (P5-AC5)"
        );
        drop(first);
        assert!(claim_idle().is_some(), "the guard releases on drop");
    }

    /// R33.1: a waiter gets the outcome of the scan that ends after it starts to wait, also
    /// when that scan was already running.
    #[test]
    fn a_waiter_gets_the_outcome_of_the_next_scan_end() {
        let _serial = SERIAL
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        for complete in [true, false] {
            let mut running = claim_idle().expect("idle");
            let before = ends().count;
            let scan = std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(50));
                running.complete = complete;
                drop(running);
            });
            assert_eq!(wait_for_end(before), complete);
            scan.join().unwrap();
        }
    }

    #[test]
    fn the_summary_names_the_counts() {
        let report = ScanReport {
            added: 3,
            removed: 2,
            skipped: 1,
            ..ScanReport::default()
        };
        assert_eq!(
            summary(&report),
            "Scan complete: 3 added, 2 removed, 1 skipped"
        );
        let canceled = ScanReport {
            canceled: true,
            ..report.clone()
        };
        assert_eq!(summary(&canceled), "Scan canceled: 3 added, 1 skipped");
        assert_eq!(
            counts(&report),
            ScanCounts {
                added: 3,
                removed: 2,
                skipped: 1
            }
        );
    }
}
