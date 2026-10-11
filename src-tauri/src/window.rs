//! Main window.

use tauri::{AppHandle, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// Creates the main window. The title is the app name (`productName`, D2).
/// Size and minimum size follow D33.
pub fn create_main(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
        .title(&app.package_info().name)
        .inner_size(1200.0, 800.0)
        .min_inner_size(800.0, 560.0)
        .build()?;
    #[cfg(windows)]
    crate::webview2_keys::disable_in_release(&window)?;
    Ok(window)
}
