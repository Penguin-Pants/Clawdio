//! Audio hash guard (R11, P5.14): every audio file in a tree hashes the same before and after a
//! test. Every integration test that may write into a music folder calls it.

use std::collections::BTreeMap;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::path::{Path, PathBuf};

use walkdir::WalkDir;

pub struct Guard {
    root: PathBuf,
    hashes: BTreeMap<PathBuf, u64>,
}

fn hash_audio(root: &Path) -> BTreeMap<PathBuf, u64> {
    WalkDir::new(root)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file())
        .filter(|entry| clawdio_core::scan::is_audio(entry.path()))
        .map(|entry| {
            let mut hasher = DefaultHasher::new();
            std::fs::read(entry.path()).unwrap().hash(&mut hasher);
            (entry.into_path(), hasher.finish())
        })
        .collect()
}

impl Guard {
    pub fn new(root: &Path) -> Self {
        Guard {
            root: root.to_path_buf(),
            hashes: hash_audio(root),
        }
    }

    /// Panics when an audio file changed, appeared or went away.
    pub fn check(&self) {
        assert_eq!(
            hash_audio(&self.root),
            self.hashes,
            "audio files changed (R11)"
        );
    }
}
