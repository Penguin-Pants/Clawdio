//! Turns off the WebView2 browser accelerator keys (find, reload, print, DevTools) in
//! release builds (D37). Tauri has no option for it.

use tauri::WebviewWindow;
use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
use windows_core::Interface;

/// Does nothing in debug builds, so developers keep reload and DevTools.
pub fn disable_in_release(window: &WebviewWindow) -> tauri::Result<()> {
    if cfg!(debug_assertions) {
        return Ok(());
    }
    window.with_webview(|webview| {
        // SAFETY: `with_webview` runs this on the main thread with a live controller.
        let result = unsafe {
            webview
                .controller()
                .CoreWebView2()
                .and_then(|core| core.Settings())
                .and_then(|settings| settings.cast::<ICoreWebView2Settings3>())
                .and_then(|settings| settings.SetAreBrowserAcceleratorKeysEnabled(false))
        };
        if let Err(error) = result {
            log::warn!("webview: cannot turn off browser accelerator keys: {error}");
        }
    })
}
