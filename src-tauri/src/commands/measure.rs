//! Measurement mode (P3.1): `CLAWDIO_MEASURE_MODE` names a Library mode. The UI then shows all
//! six widgets in that mode and does not save the arrangement. Release builds keep it.

use clawdio_core::api::LibraryMode;

pub const MEASURE_MODE_VAR: &str = "CLAWDIO_MEASURE_MODE";

/// File that `measure_ready` creates once every widget shows data (P3.5).
pub const MEASURE_READY_VAR: &str = "CLAWDIO_MEASURE_READY";

#[tauri::command]
pub fn measure_mode() -> Option<LibraryMode> {
    std::env::var(MEASURE_MODE_VAR)
        .ok()
        .and_then(|value| LibraryMode::parse(&value))
}

/// Called by the UI when all six widgets show data. With `CLAWDIO_MEASURE_READY` set, it writes
/// that file, so the measurement scripts start the idle period from a populated UI.
#[tauri::command]
pub fn measure_ready() -> Result<(), clawdio_core::api::IpcError> {
    let Ok(path) = std::env::var(MEASURE_READY_VAR) else {
        return Ok(());
    };
    std::fs::write(path, "ready").map_err(|error| clawdio_core::api::IpcError {
        code: "io".into(),
        message: error.to_string(),
    })
}
