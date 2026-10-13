//! Layout commands (P9.2): `layout.json` and `columns.json` (PS-6) in the config folder. The
//! webview sends the JSON text only; the file names are fixed here (D13).

use tauri::State;

use clawdio_core::layout::{backup, load, save, COLUMNS_FILE, LAYOUT_FILE};

use super::CommandResult;
use crate::state::AppState;

#[tauri::command]
pub fn layout_load(state: State<'_, AppState>) -> CommandResult<Option<String>> {
    Ok(load(&state.dirs.config, LAYOUT_FILE))
}

#[tauri::command]
pub fn layout_save(state: State<'_, AppState>, json: String) -> CommandResult<()> {
    save(&state.dirs.config, LAYOUT_FILE, &json).map_err(Into::into)
}

/// Backs up a `layout.json` that failed validation as `layout.json.bak` (PS-4, UD5).
#[tauri::command]
pub fn layout_backup(state: State<'_, AppState>) -> CommandResult<()> {
    backup(&state.dirs.config, LAYOUT_FILE)
        .map(|_| ())
        .map_err(Into::into)
}

/// The saved `columns.json` text, or null (PS-6, UD13).
#[tauri::command]
pub fn columns_load(state: State<'_, AppState>) -> CommandResult<Option<String>> {
    Ok(load(&state.dirs.config, COLUMNS_FILE))
}

#[tauri::command]
pub fn columns_save(state: State<'_, AppState>, json: String) -> CommandResult<()> {
    save(&state.dirs.config, COLUMNS_FILE, &json).map_err(Into::into)
}

/// Backs up a `columns.json` that failed validation as `columns.json.bak` (PS-4, UD13).
#[tauri::command]
pub fn columns_backup(state: State<'_, AppState>) -> CommandResult<()> {
    backup(&state.dirs.config, COLUMNS_FILE)
        .map(|_| ())
        .map_err(Into::into)
}
