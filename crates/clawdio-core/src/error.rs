//! Typed errors of the core (`thiserror`). Commands map them to `{ code, message }`.

use thiserror::Error;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum CoreError {
    /// An id that the index never issued or that a rescan removed (D46).
    #[error("unknown {kind} id {id}")]
    UnknownId { kind: &'static str, id: u32 },
    /// Input from the webview that the core refuses.
    #[error("{0}")]
    Invalid(String),
    #[error("{0}")]
    Io(String),
}

impl CoreError {
    /// Stable error code for the IPC error shape.
    pub fn code(&self) -> &'static str {
        match self {
            CoreError::UnknownId { .. } => "unknown_id",
            CoreError::Invalid(_) => "invalid",
            CoreError::Io(_) => "io",
        }
    }
}
