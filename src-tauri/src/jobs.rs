//! Background jobs: the scan (P4.7). The status line shows progress with Cancel (R5).

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use clawdio_core::api::JobProgress;
use clawdio_core::cache::Cache;
use clawdio_core::scan;
use tauri::{AppHandle, Manager};

use crate::events::{emit, JOB_PROGRESS, LIBRARY_CHANGED, STATUS_MESSAGE};
use crate::state::{AppState, Library};

pub const SCAN_JOB: &str = "scan";
/// `library-changed` goes out at most twice per second (section 6.9).
const LIBRARY_EVENT_GAP: Duration = Duration::from_millis(500);
/// One scan at a time: a new scan waits until the canceled one has stopped, so the old one
/// cannot write after the new one clears the index.
static SCAN_GATE: Mutex<()> = Mutex::new(());

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

/// Starts a scan of `root` on a background thread. A running scan is canceled first. With
/// `fresh`, the index and the cache are cleared first (a new music folder).
pub fn start_scan(app: &AppHandle, root: PathBuf, fresh: bool) {
    let state = app.state::<AppState>();
    let cancel = Arc::new(AtomicBool::new(false));
    if let Ok(mut slot) = state.scan_cancel.lock() {
        if let Some(previous) = slot.replace(cancel.clone()) {
            previous.store(true, Ordering::Relaxed);
        }
    }
    let cache_dir = state.dirs.cache.clone();
    let library = app.state::<Library>().0.clone();
    let app = app.clone();
    let spawned = std::thread::Builder::new()
        .name("scan".into())
        .spawn(move || {
            let _gate = SCAN_GATE
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if cancel.load(Ordering::Relaxed) {
                return;
            }
            // Without the cache the scan still fills the index (D14).
            let mut cache = Cache::open(&cache_dir)
                .inspect_err(|error| log::warn!("cache: cannot open: {error}"))
                .ok();
            if fresh {
                if let Some(Err(error)) = cache.as_mut().map(Cache::clear) {
                    log::warn!("cache: cannot clear: {error}");
                }
                if let Ok(mut index) = library.write() {
                    index.clear_tracks();
                }
                emit(&app, LIBRARY_CHANGED, ());
            }
            progress(&app, Some("Scanning".into()));
            let mut last = Instant::now();
            let report = scan::scan(&root, &library, cache.as_mut(), &cancel, |added| {
                progress(&app, Some(format!("Scanning: {added} files")));
                if last.elapsed() >= LIBRARY_EVENT_GAP {
                    last = Instant::now();
                    emit(&app, LIBRARY_CHANGED, ());
                }
            });
            emit(&app, LIBRARY_CHANGED, ());
            progress(&app, None);
            let text = if report.canceled {
                format!("Scan canceled: {} added", report.added)
            } else {
                format!(
                    "Scan complete: {} added, {} skipped",
                    report.added, report.skipped
                )
            };
            log::info!("scan: {text}");
            emit(&app, STATUS_MESSAGE, text);
        });
    if let Err(error) = spawned {
        log::warn!("scan: cannot start: {error}");
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
