//! IPC structs. `cargo test` exports them as TypeScript types (D15).

use serde::Serialize;
use ts_rs::TS;

/// Name and version of the running app.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
}
