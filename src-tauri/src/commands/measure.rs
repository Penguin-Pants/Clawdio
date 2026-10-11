//! Measurement mode (P3.1): `CLAWDIO_MEASURE_MODE` names a Library mode. The UI then shows all
//! six widgets in that mode and does not save the arrangement. Release builds keep it.

use clawdio_core::api::LibraryMode;

pub const MEASURE_MODE_VAR: &str = "CLAWDIO_MEASURE_MODE";

#[tauri::command]
pub fn measure_mode() -> Option<LibraryMode> {
    std::env::var(MEASURE_MODE_VAR)
        .ok()
        .and_then(|value| LibraryMode::parse(&value))
}
