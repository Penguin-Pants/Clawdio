//! Library, scan, queue, playlist, lyrics, sidecar, online and settings logic.
//! No Tauri and no audio device (D1).

pub mod api;
pub mod artwork;
pub mod atomic;
pub mod cache;
pub mod config;
pub mod error;
pub mod fold;
pub mod layout;
pub mod library;
pub mod paths;
pub mod playlist;
pub mod queue;
pub mod scan;
pub mod settings;
pub mod state;
