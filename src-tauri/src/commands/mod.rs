//! Commands: thin wrappers over the core (section 6.5). IPC carries ids and names, never paths
//! from the webview (D13).

pub mod library;
pub mod measure;
pub mod player;
pub mod settings;
pub mod widgets;

use clawdio_core::api::IpcError;

/// Command result with the typed error shape (section 6.14).
pub type CommandResult<T> = Result<T, IpcError>;

/// The index lock is poisoned only after a panic in a writer.
pub fn lock_error() -> IpcError {
    IpcError {
        code: "internal".into(),
        message: "the library index is not available".into(),
    }
}
