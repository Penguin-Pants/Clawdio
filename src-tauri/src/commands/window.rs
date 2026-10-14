//! Window commands (UD19): the mini player. The webview sends a flag and the band height only.

use clawdio_core::api::IpcError;
use tauri::{State, WebviewWindow};

use super::CommandResult;
use crate::window::{set_mini, MiniState};

/// Enters (`on`) or leaves the mini player. `height` is the compact band height in logical px;
/// a height outside 32 to 200 px is refused.
#[tauri::command]
pub fn window_set_mini(
    window: WebviewWindow,
    state: State<'_, MiniState>,
    on: bool,
    height: f64,
) -> CommandResult<()> {
    set_mini(&window, &state, on, height).map_err(|message| IpcError {
        code: "window".into(),
        message,
    })
}
