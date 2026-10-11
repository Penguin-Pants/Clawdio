//! Managed app state.

use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use clawdio_core::api::{Lyrics, PlayerSnapshot, PlaylistEntry, PlaylistRow, QueueSnapshot};
use clawdio_core::library::LibraryIndex;

/// The library index. The scan writes; commands read (section 6.9).
#[derive(Default, Clone)]
pub struct Library(pub Arc<RwLock<LibraryIndex>>);

/// The thumbnail folder in the cache folder (D27, D41).
pub struct Thumbs(pub PathBuf);

/// Widget data that later phases own: the queue and player (P4, P7), playlists (P11) and
/// lyrics (P13). Until then it is empty, or Milestone 0 data with the `fixtures` feature.
#[derive(Default)]
pub struct Widgets {
    pub queue: QueueSnapshot,
    pub player: PlayerSnapshot,
    pub playlists: Vec<(PlaylistRow, Vec<PlaylistEntry>)>,
    pub lyrics: Option<Lyrics>,
}
