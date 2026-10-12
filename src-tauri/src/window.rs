//! Main window (P4.2): title, WebView profile folder, saved size and minimum size (D33).

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use clawdio_core::settings::{save, WindowSize};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

use crate::state::AppState;

pub const DEFAULT_SIZE: WindowSize = WindowSize {
    width: 1200.0,
    height: 800.0,
};
pub const MIN_WIDTH: f64 = 800.0;
pub const MIN_HEIGHT: f64 = 560.0;
/// A resize is saved once the size has not changed for this long.
const SAVE_DELAY: Duration = Duration::from_secs(1);

/// The size to open with: the saved size, at least the minimum, else the default.
pub fn start_size(saved: Option<WindowSize>) -> WindowSize {
    match saved {
        Some(size) if size.width.is_finite() && size.height.is_finite() => WindowSize {
            width: size.width.max(MIN_WIDTH),
            height: size.height.max(MIN_HEIGHT),
        },
        _ => DEFAULT_SIZE,
    }
}

fn store_size(app: &AppHandle, size: WindowSize) {
    let state = app.state::<AppState>();
    let Ok(mut settings) = state.settings.lock() else {
        return;
    };
    if settings.window == Some(size) {
        return;
    }
    settings.window = Some(size);
    if let Err(error) = save(&state.dirs.config, &settings) {
        log::warn!("window: cannot save the size: {error}");
    }
}

fn logical_size(window: &WebviewWindow) -> Option<WindowSize> {
    let scale = window.scale_factor().ok()?;
    let size = window.inner_size().ok()?.to_logical::<f64>(scale);
    Some(WindowSize {
        width: size.width,
        height: size.height,
    })
}

/// A size worth saving: not minimized, and not below the minimum (a minimized window on
/// Windows reports 0 x 0).
fn worth_saving(size: WindowSize, minimized: bool) -> bool {
    !minimized && size.width >= MIN_WIDTH && size.height >= MIN_HEIGHT
}

/// Saves the window size when it is worth saving.
fn save_size(app: &AppHandle, window: &WebviewWindow, size: WindowSize) {
    if worth_saving(size, window.is_minimized().unwrap_or(false)) {
        store_size(app, size);
    }
}

/// Creates the main window. The title is the app name (`productName`, D2).
pub fn create_main(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let (size, webview_dir) = {
        let state = app.state::<AppState>();
        let saved = state
            .settings
            .lock()
            .ok()
            .and_then(|settings| settings.window);
        (start_size(saved), state.dirs.webview.clone())
    };
    let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
        .title(&app.package_info().name)
        .inner_size(size.width, size.height)
        .min_inner_size(MIN_WIDTH, MIN_HEIGHT);
    if let Some(folder) = webview_dir {
        builder = builder.data_directory(folder);
    }
    let window = builder.build()?;
    #[cfg(windows)]
    crate::webview2_keys::disable_in_release(&window)?;
    watch_size(app, &window);
    Ok(window)
}

/// Unminimizes, shows and focuses the main window (a second launch, P9.5).
pub fn bring_to_front(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let shown = window
        .unminimize()
        .and_then(|()| window.show())
        .and_then(|()| window.set_focus());
    if let Err(error) = shown {
        log::warn!("window: cannot bring the window to the front: {error}");
    }
}

/// Saves the size 1 s after the last resize, and at once when the window closes.
fn watch_size(app: &AppHandle, window: &WebviewWindow) {
    let pending: Arc<Mutex<Option<Instant>>> = Arc::default();
    let watched = window.clone();
    let events_app = app.clone();
    let events_pending = pending.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Resized(_) => {
            if let Ok(mut changed) = events_pending.lock() {
                *changed = Some(Instant::now());
            }
        }
        WindowEvent::CloseRequested { .. } => {
            if let Some(size) = logical_size(&watched) {
                save_size(&events_app, &watched, size);
            }
        }
        _ => {}
    });
    let timer_app = app.clone();
    let timer_window = window.clone();
    let spawned = std::thread::Builder::new()
        .name("window-size".into())
        .spawn(move || loop {
            std::thread::sleep(Duration::from_millis(250));
            let due = pending
                .lock()
                .map(|mut changed| match *changed {
                    Some(at) if at.elapsed() >= SAVE_DELAY => {
                        *changed = None;
                        true
                    }
                    _ => false,
                })
                .unwrap_or(false);
            if due {
                match logical_size(&timer_window) {
                    Some(size) => save_size(&timer_app, &timer_window, size),
                    None => break,
                }
            }
        });
    if let Err(error) = spawned {
        log::warn!("window: cannot watch the size: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_minimized_or_zero_size_is_not_saved() {
        assert!(worth_saving(DEFAULT_SIZE, false));
        assert!(!worth_saving(DEFAULT_SIZE, true));
        let zero = WindowSize {
            width: 0.0,
            height: 0.0,
        };
        assert!(!worth_saving(zero, false));
    }

    #[test]
    fn opens_with_the_saved_size_but_never_below_the_minimum() {
        assert_eq!(start_size(None), DEFAULT_SIZE);
        let saved = WindowSize {
            width: 1000.0,
            height: 700.0,
        };
        assert_eq!(start_size(Some(saved)), saved);
        let small = WindowSize {
            width: 300.0,
            height: 200.0,
        };
        assert_eq!(
            start_size(Some(small)),
            WindowSize {
                width: MIN_WIDTH,
                height: MIN_HEIGHT
            }
        );
        let broken = WindowSize {
            width: f64::NAN,
            height: 700.0,
        };
        assert_eq!(start_size(Some(broken)), DEFAULT_SIZE);
    }
}
