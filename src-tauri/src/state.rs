//! Managed app state.

use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex, RwLock};

use clawdio_core::api::Lyrics;
use clawdio_core::library::LibraryIndex;
use clawdio_core::paths::DataDirs;
use clawdio_core::settings::Settings;

/// The library index. The scan writes; commands read (section 6.9).
#[derive(Default, Clone)]
pub struct Library(pub Arc<RwLock<LibraryIndex>>);

/// The absolute music folder, shared with the player thread. None when not set.
#[derive(Default, Clone)]
pub struct MusicRoot(pub Arc<RwLock<Option<PathBuf>>>);

/// Data folders, the base folder for the R18.1 path rule, and the settings.
pub struct AppState {
    pub dirs: DataDirs,
    pub base: PathBuf,
    pub settings: Mutex<Settings>,
    /// Cancels the running scan, if any.
    pub scan_cancel: Mutex<Option<Arc<AtomicBool>>>,
}

/// Widget data that a later phase owns: lyrics (P13). Empty until then.
#[derive(Default)]
pub struct Widgets {
    pub lyrics: Option<Lyrics>,
}

/// The playlists of the music folder (P11). Lock order: this, then the library index.
#[derive(Default)]
pub struct Playlists(pub Mutex<clawdio_core::playlist::PlaylistSet>);
