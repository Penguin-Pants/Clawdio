//! Main window (P4.2): title, WebView profile folder, saved size and position (PS-5, UD14) and
//! minimum size (D33).

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use clawdio_core::settings::{save, WindowSize};
use tauri::{
    AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
    WindowEvent,
};

use crate::state::AppState;

pub const DEFAULT_SIZE: WindowSize = WindowSize::new(1200.0, 800.0);
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
            ..size
        },
        _ => DEFAULT_SIZE,
    }
}

/// A monitor's physical bounds: left, top, width and height.
type MonitorRect = (i32, i32, u32, u32);

/// The part of the window at its saved origin that must be on one monitor, in physical px: enough
/// of the title bar to see and drag it.
const VISIBLE: (i32, i32) = (160, 40);

/// True when the area of `VISIBLE` size at the physical point lies inside one of the monitors
/// (UD14). No scale factor math: the saved point and the monitor bounds are both physical pixels.
fn inside_a_monitor(x: i32, y: i32, monitors: &[MonitorRect]) -> bool {
    monitors.iter().any(|&(left, top, width, height)| {
        let (x, y) = (i64::from(x), i64::from(y));
        let (left, top) = (i64::from(left), i64::from(top));
        let (grip_x, grip_y) = (i64::from(VISIBLE.0), i64::from(VISIBLE.1));
        x >= left
            && y >= top
            && x + grip_x <= left + i64::from(width)
            && y + grip_y <= top + i64::from(height)
    })
}

/// Moves the window to its saved position when that point is on an available monitor; else
/// the OS position stays (a monitor was unplugged).
fn restore_position(window: &WebviewWindow, size: WindowSize) {
    let (Some(x), Some(y)) = (size.x, size.y) else {
        return;
    };
    let monitors: Vec<MonitorRect> = window
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|monitor| {
            let (position, size) = (monitor.position(), monitor.size());
            (position.x, position.y, size.width, size.height)
        })
        .collect();
    if !inside_a_monitor(x, y, &monitors) {
        log::info!("window: the saved position is on no monitor; the OS places the window");
        return;
    }
    if let Err(error) = window.set_position(PhysicalPosition::new(x, y)) {
        log::warn!("window: cannot restore the position: {error}");
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
        log::warn!("window: cannot save the size and position: {error}");
    }
}

/// The logical inner size and the physical outer position of the window now.
fn current_window(window: &WebviewWindow) -> Option<WindowSize> {
    let scale = window.scale_factor().ok()?;
    let size = window.inner_size().ok()?.to_logical::<f64>(scale);
    let position = window.outer_position().ok();
    Some(WindowSize {
        width: size.width,
        height: size.height,
        x: position.map(|point| point.x),
        y: position.map(|point| point.y),
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
    restore_position(&window, size);
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

/// Saves the size and position 1 s after the last resize or move, and at once when the window
/// closes.
fn watch_size(app: &AppHandle, window: &WebviewWindow) {
    let pending: Arc<Mutex<Option<Instant>>> = Arc::default();
    let watched = window.clone();
    let events_app = app.clone();
    let events_pending = pending.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Resized(_) | WindowEvent::Moved(_) => {
            if let Ok(mut changed) = events_pending.lock() {
                *changed = Some(Instant::now());
            }
        }
        WindowEvent::CloseRequested { .. } => {
            if let Some(size) = current_window(&watched) {
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
                match current_window(&timer_window) {
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
        let zero = WindowSize::new(0.0, 0.0);
        assert!(!worth_saving(zero, false));
    }

    #[test]
    fn opens_with_the_saved_size_but_never_below_the_minimum() {
        assert_eq!(start_size(None), DEFAULT_SIZE);
        let saved = WindowSize::new(1000.0, 700.0);
        assert_eq!(start_size(Some(saved)), saved);
        let small = WindowSize::new(300.0, 200.0);
        assert_eq!(
            start_size(Some(small)),
            WindowSize::new(MIN_WIDTH, MIN_HEIGHT)
        );
        let broken = WindowSize::new(f64::NAN, 700.0);
        assert_eq!(start_size(Some(broken)), DEFAULT_SIZE);
    }

    #[test]
    fn a_position_outside_every_monitor_is_not_applied() {
        let monitors = [(0, 0, 1920, 1080), (1920, -200, 2560, 1440)];
        assert!(inside_a_monitor(100, 100, &monitors));
        assert!(
            inside_a_monitor(1920, -200, &monitors),
            "the left top corner belongs to the monitor"
        );
        assert!(inside_a_monitor(4000, 1000, &monitors));
        assert!(!inside_a_monitor(-10, 100, &monitors));
        assert!(!inside_a_monitor(1919, 1080, &monitors));
        assert!(!inside_a_monitor(100, 100, &[]));
        // The origin is on the monitor but the title bar is not: the window would be lost.
        assert!(!inside_a_monitor(1919, 100, &monitors[..1]));
        assert!(!inside_a_monitor(100, 1060, &monitors[..1]));
        assert!(inside_a_monitor(
            1920 - VISIBLE.0,
            1080 - VISIBLE.1,
            &monitors[..1]
        ));
    }

    #[test]
    fn the_saved_position_stays_with_the_start_size() {
        let saved = WindowSize {
            x: Some(50),
            y: Some(60),
            ..WindowSize::new(300.0, 200.0)
        };
        let size = start_size(Some(saved));
        assert_eq!((size.x, size.y), (Some(50), Some(60)));
        assert_eq!((size.width, size.height), (MIN_WIDTH, MIN_HEIGHT));
    }
}
