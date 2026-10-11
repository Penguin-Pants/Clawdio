//! Background jobs: the scan (P4.7, P5.4, P5.9). The status line shows progress with Cancel
//! (R5). One scan runs at a time.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use clawdio_core::api::{JobProgress, ScanCounts};
use clawdio_core::cache::Cache;
use clawdio_core::scan::{self, ScanReport};
use tauri::{AppHandle, Manager};

use crate::events::{emit, JOB_PROGRESS, LIBRARY_CHANGED, STATUS_MESSAGE};
use crate::persist::StateStore;
use crate::player::PlayerHandle;
use crate::state::{AppState, Library};

pub const SCAN_JOB: &str = "scan";
/// `library-changed` goes out at most twice per second (section 6.9).
const LIBRARY_EVENT_GAP: Duration = Duration::from_millis(500);
/// One scan at a time: a new scan waits until the canceled one has stopped, so the old one
/// cannot write after the new one clears the index.
static SCAN_GATE: Mutex<()> = Mutex::new(());
/// Scans started and not yet ended. Rescan does nothing while one runs (R2).
static ACTIVE: AtomicUsize = AtomicUsize::new(0);

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

/// Counts one scan in [`ACTIVE`] until it is dropped, also when the scan thread panics.
struct ActiveGuard;

impl Drop for ActiveGuard {
    fn drop(&mut self) {
        ACTIVE.fetch_sub(1, Ordering::SeqCst);
    }
}

/// Starts a scan of `root` on a background thread. A new folder cancels the running scan
/// first; the other kinds run after it.
pub fn start_scan(app: &AppHandle, root: PathBuf, kind: ScanKind) {
    ACTIVE.fetch_add(1, Ordering::SeqCst);
    spawn_scan(app, root, kind, ActiveGuard);
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
        .map(|_| ActiveGuard)
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
    let cache_dir = state.dirs.cache.clone();
    let library = app.state::<Library>().0.clone();
    let app = app.clone();
    let spawned = std::thread::Builder::new()
        .name("scan".into())
        .spawn(move || {
            let _active = active;
            let _gate = SCAN_GATE
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            run_scan(&app, &root, kind, &library, &cache_dir, &cancel);
        });
    // On failure the closure, and with it the guard, is dropped.
    if let Err(error) = spawned {
        log::warn!("scan: cannot start: {error}");
    }
}

fn run_scan(
    app: &AppHandle,
    root: &std::path::Path,
    kind: ScanKind,
    library: &std::sync::RwLock<clawdio_core::library::LibraryIndex>,
    cache_dir: &std::path::Path,
    cancel: &AtomicBool,
) {
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
        ScanKind::NewFolder => {
            // The old folder's entries leave the player first, then the index and the cache.
            // This runs even when the scan is canceled before it starts (P5-AC13).
            app.state::<StateStore>().new_folder();
            app.state::<PlayerHandle>().clear();
            if let Some(Err(error)) = cache.as_mut().map(Cache::clear) {
                log::warn!("cache: cannot clear: {error}");
            }
            if let Ok(mut index) = library.write() {
                index.clear_tracks();
            }
            emit(app, LIBRARY_CHANGED, ());
        }
        ScanKind::Startup | ScanKind::Rescan => {}
    }
    if cancel.load(Ordering::Relaxed) {
        return;
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
    let text = summary(&report);
    log::info!(
        "scan: {text} ({} read, {} covers decoded)",
        report.read,
        report.covers_decoded
    );
    emit(app, STATUS_MESSAGE, text);
    // Missing saved entries go only after a complete traversal (P9.1).
    let complete = !report.canceled && !report.failed;
    app.state::<StateStore>().try_restore(app, complete);
    // Settings keeps the counts of the last complete scan (R2).
    if report.canceled || report.failed {
        return;
    }
    let counts = counts(&report);
    if let Err(error) =
        crate::commands::settings::update(app, |settings| settings.last_scan = Some(counts))
    {
        log::warn!("settings: cannot save the scan counts: {}", error.message);
    }
}

/// Cancels the running job with this id (R5 status line Cancel).
pub fn cancel(app: &AppHandle, id: &str) {
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
    fn a_rescan_claims_only_an_idle_scanner() {
        let first = claim_idle().expect("idle at the start");
        assert!(
            claim_idle().is_none(),
            "a second Rescan starts nothing (P5-AC5)"
        );
        drop(first);
        assert!(claim_idle().is_some(), "the guard releases on drop");
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
            ..report
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
