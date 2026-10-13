//! Main window (P4.2): title, WebView profile folder, saved size and position (PS-5, UD14) and
//! minimum size (D33).

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use clawdio_core::settings::{save, WindowSize};
use tauri::{
    AppHandle, LogicalSize, Manager, PhysicalPosition, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
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

/// The mini player window width and minimum width in logical px (UD19).
pub const MINI_WIDTH: f64 = 400.0;
pub const MINI_MIN_WIDTH: f64 = 320.0;
/// The band height the webview may send, in logical px (UD19).
pub const MINI_HEIGHT_RANGE: std::ops::RangeInclusive<f64> = 32.0..=200.0;

/// One window change of a mini player switch, in order (UD19).
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum WindowOp {
    Unmaximize,
    Maximize,
    /// The maximum inner size; `None` clears it.
    MaxSize(Option<(f64, f64)>),
    MinSize(f64, f64),
    Size(f64, f64),
    /// The physical outer position.
    Position(i32, i32),
}

/// The normal window size and position, and whether it was maximized, kept while the mini
/// player shows.
#[derive(Default)]
pub struct MiniState(pub Mutex<Option<(WindowSize, bool)>>);

/// The changes that enter the mini player for a band `height`, or `None` for a refused height.
pub fn enter_ops(height: f64) -> Option<Vec<WindowOp>> {
    if !MINI_HEIGHT_RANGE.contains(&height) {
        return None;
    }
    // The minimum goes first, so the smaller size is allowed; the maximum height holds the
    // window to the band (any width up to the largest a window takes).
    Some(vec![
        WindowOp::Unmaximize,
        WindowOp::MinSize(MINI_MIN_WIDTH, height),
        WindowOp::MaxSize(Some((f64::from(u16::MAX), height))),
        WindowOp::Size(MINI_WIDTH, height),
    ])
}

/// The changes that leave the mini player and return to `stored`, maximized again when the
/// window was maximized before.
pub fn exit_ops(stored: Option<WindowSize>, maximized: bool) -> Vec<WindowOp> {
    let size = start_size(stored);
    let mut ops = vec![
        WindowOp::MaxSize(None),
        WindowOp::MinSize(MIN_WIDTH, MIN_HEIGHT),
        WindowOp::Size(size.width, size.height),
    ];
    if let (Some(x), Some(y)) = (size.x, size.y) {
        ops.push(WindowOp::Position(x, y));
    }
    if maximized {
        ops.push(WindowOp::Maximize);
    }
    ops
}

fn apply(window: &WebviewWindow, op: WindowOp) -> tauri::Result<()> {
    match op {
        WindowOp::Unmaximize => window.unmaximize(),
        WindowOp::Maximize => window.maximize(),
        WindowOp::MaxSize(size) => {
            window.set_max_size(size.map(|(width, height)| LogicalSize::new(width, height)))
        }
        WindowOp::MinSize(width, height) => {
            window.set_min_size(Some(LogicalSize::new(width, height)))
        }
        WindowOp::Size(width, height) => window.set_size(LogicalSize::new(width, height)),
        WindowOp::Position(x, y) => window.set_position(PhysicalPosition::new(x, y)),
    }
}

/// Enters or leaves the mini player (UD19, TR-9). Entering keeps the normal size and position
/// once; a second enter (a new band height after a text size change) keeps the first one.
pub fn set_mini(
    window: &WebviewWindow,
    state: &MiniState,
    on: bool,
    height: f64,
) -> Result<(), String> {
    let mut stored = state
        .0
        .lock()
        .map_err(|_| "the window state is not available".to_string())?;
    let ops = if on {
        let ops = enter_ops(height)
            .ok_or_else(|| format!("the band height {height} is outside 32 to 200 px"))?;
        if stored.is_none() {
            let maximized = window.is_maximized().unwrap_or(false);
            *stored = Some((current_window(window).unwrap_or(DEFAULT_SIZE), maximized));
        }
        ops
    } else {
        let normal = stored.take();
        exit_ops(
            normal.map(|(size, _)| size),
            normal.is_some_and(|(_, maximized)| maximized),
        )
    };
    for op in ops {
        apply(window, op).map_err(|error| format!("cannot change the window: {error}"))?;
    }
    Ok(())
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

    #[test]
    fn the_mini_size_follows_the_band_height() {
        assert_eq!(
            enter_ops(40.0),
            Some(vec![
                WindowOp::Unmaximize,
                WindowOp::MinSize(MINI_MIN_WIDTH, 40.0),
                WindowOp::MaxSize(Some((f64::from(u16::MAX), 40.0))),
                WindowOp::Size(MINI_WIDTH, 40.0),
            ])
        );
        // 140% text: a taller band.
        assert!(enter_ops(56.0)
            .unwrap()
            .contains(&WindowOp::Size(MINI_WIDTH, 56.0)));
    }

    #[test]
    fn a_band_height_outside_32_to_200_px_is_refused() {
        assert_eq!(enter_ops(31.9), None);
        assert_eq!(enter_ops(200.1), None);
        assert_eq!(enter_ops(f64::NAN), None);
        assert!(enter_ops(32.0).is_some());
        assert!(enter_ops(200.0).is_some());
    }

    #[test]
    fn exit_clears_the_maximum_then_restores_the_minimum_size_and_position() {
        let stored = WindowSize {
            x: Some(10),
            y: Some(20),
            ..WindowSize::new(1000.0, 700.0)
        };
        assert_eq!(
            exit_ops(Some(stored), false),
            vec![
                WindowOp::MaxSize(None),
                WindowOp::MinSize(MIN_WIDTH, MIN_HEIGHT),
                WindowOp::Size(1000.0, 700.0),
                WindowOp::Position(10, 20),
            ]
        );
        assert_eq!(
            exit_ops(None, false),
            vec![
                WindowOp::MaxSize(None),
                WindowOp::MinSize(MIN_WIDTH, MIN_HEIGHT),
                WindowOp::Size(DEFAULT_SIZE.width, DEFAULT_SIZE.height),
            ]
        );
    }

    #[test]
    fn exit_maximizes_again_a_window_that_was_maximized() {
        let ops = exit_ops(Some(WindowSize::new(1920.0, 1040.0)), true);
        assert_eq!(ops.last(), Some(&WindowOp::Maximize));
        assert!(
            !exit_ops(Some(WindowSize::new(1920.0, 1040.0)), false).contains(&WindowOp::Maximize)
        );
    }

    #[test]
    fn a_mini_size_is_never_worth_saving() {
        for height in [32.0, 40.0, 200.0] {
            assert!(!worth_saving(WindowSize::new(MINI_WIDTH, height), false));
        }
    }
}
