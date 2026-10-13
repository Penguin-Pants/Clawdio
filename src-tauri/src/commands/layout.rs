//! Layout commands (P9.2): `layout.json` in the config folder. The webview sends the JSON
//! text only; the path is fixed here (D13).

use tauri::State;

use super::CommandResult;
use crate::state::AppState;

#[tauri::command]
pub fn layout_load(state: State<'_, AppState>) -> CommandResult<Option<String>> {
    Ok(clawdio_core::layout::load(&state.dirs.config))
}

#[tauri::command]
pub fn layout_save(state: State<'_, AppState>, json: String) -> CommandResult<()> {
    clawdio_core::layout::save(&state.dirs.config, &json).map_err(Into::into)
}

/// Backs up a `layout.json` that failed validation as `layout.json.bak` (PS-4, UD5).
#[tauri::command]
pub fn layout_backup(state: State<'_, AppState>) -> CommandResult<()> {
    clawdio_core::layout::backup(&state.dirs.config, clawdio_core::layout::LAYOUT_FILE)
        .map(|_| ())
        .map_err(Into::into)
}
