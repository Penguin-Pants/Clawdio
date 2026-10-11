//! Tauri app: window, commands, audio output and media controls (D1).

#[cfg(windows)]
mod webview2_keys;
mod window;

/// Builds and runs the app until it quits.
pub fn run() -> tauri::Result<()> {
    tauri::Builder::default()
        .setup(|app| {
            window::create_main(app.handle())?;
            Ok(())
        })
        .run(tauri::generate_context!())
}
