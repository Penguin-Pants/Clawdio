//! Managed app state.

use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex, RwLock};

use clawdio_core::api::{Lyrics, PlaylistEntry, PlaylistRow};
use clawdio_core::library::LibraryIndex;
use clawdio_core::paths::DataDirs;
use clawdio_core::settings::Settings;

/// The library index. The scan writes; commands read (section 6.9).
#[derive(Default, Clone)]
pub struct Library(pub Arc<RwLock<LibraryIndex>>);

/// The absolute music folder, shared with the player thread. None when not set.
#[derive(Default, Clone)]
pub struct MusicRoot(pub Arc<RwLock<Option<PathBuf>>>);

/// The thumbnail folder in the cache folder (D27, D41).
pub struct Thumbs(pub PathBuf);

/// Data folders, the base folder for the R18.1 path rule, and the settings.
pub struct AppState {
    pub dirs: DataDirs,
    pub base: PathBuf,
    pub settings: Mutex<Settings>,
    /// Cancels the running scan, if any.
    pub scan_cancel: Mutex<Option<Arc<AtomicBool>>>,
}

/// Widget data that later phases own: playlists (P11) and lyrics (P13). Empty until then, or
/// Empty until those phases.
#[derive(Default)]
pub struct Widgets {
    pub playlists: Vec<(PlaylistRow, Vec<PlaylistEntry>)>,
    pub lyrics: Option<Lyrics>,
}
