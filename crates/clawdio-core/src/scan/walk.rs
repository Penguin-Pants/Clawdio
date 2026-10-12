//! Traversal rules (R2, P5.1): names that start with "." are skipped, links and junctions to
//! folders are not entered, a link to a file is a file, and a name that is not valid UTF-8 is
//! skipped and logged.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use walkdir::{DirEntry, WalkDir};

/// A file that the scan may read.
#[derive(Debug, Clone)]
pub struct WalkedFile {
    pub path: PathBuf,
    /// The path relative to the root with "/" separators.
    pub rel_path: String,
    pub metadata: std::fs::Metadata,
}

/// How a traversal ended.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct WalkEnd {
    pub canceled: bool,
    /// Folders or files that could not be read. Missing files must not be removed then.
    pub errors: u64,
    /// Audio files skipped because their name is not valid UTF-8.
    pub bad_names: u64,
}

impl WalkEnd {
    /// The traversal saw the whole folder, so missing files can be removed (R2).
    pub fn complete(&self) -> bool {
        !self.canceled && self.errors == 0
    }
}

fn hidden(entry: &DirEntry) -> bool {
    entry.depth() > 0 && entry.file_name().as_encoded_bytes().first() == Some(&b'.')
}

/// The path relative to `root` with "/" separators, or None when a part is not valid UTF-8.
pub fn rel_string(root: &Path, path: &Path) -> Option<String> {
    let relative = path.strip_prefix(root).ok()?;
    let parts: Option<Vec<&str>> = relative
        .components()
        .map(|part| part.as_os_str().to_str())
        .collect();
    Some(parts?.join("/"))
}

/// Walks `root` in file name order and calls `visit` for each file that `wanted` accepts.
/// `wanted` sees the file name bytes before any metadata is read.
pub fn walk(
    root: &Path,
    cancel: &AtomicBool,
    wanted: impl Fn(&Path) -> bool,
    mut visit: impl FnMut(WalkedFile),
) -> WalkEnd {
    let mut end = WalkEnd::default();
    let entries = WalkDir::new(root)
        .follow_links(false)
        .sort_by_file_name()
        .into_iter()
        .filter_entry(|entry| !hidden(entry));
    for entry in entries {
        if cancel.load(Ordering::Relaxed) {
            end.canceled = true;
            break;
        }
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                end.errors += 1;
                log::warn!("scan: cannot read {}", describe(root, &error));
                continue;
            }
        };
        let file_type = entry.file_type();
        if file_type.is_dir() || !wanted(entry.path()) {
            continue;
        }
        let Some(rel_path) = rel_string(root, entry.path()) else {
            end.bad_names += 1;
            log::warn!(
                "scan: skipped (name is not valid UTF-8): {}",
                entry
                    .path()
                    .strip_prefix(root)
                    .unwrap_or(entry.path())
                    .display()
            );
            continue;
        };
        // A link is read through: a link to a file is a file, a link to a folder is skipped.
        let metadata = match std::fs::metadata(entry.path()) {
            Ok(metadata) => metadata,
            // A link whose target is gone is not part of the music: skip it. It must not make
            // the scan incomplete, or missing files would never be removed.
            Err(error) if entry.path_is_symlink() => {
                log::warn!("scan: skipped (broken link): {rel_path}: {error}");
                continue;
            }
            Err(error) => {
                end.errors += 1;
                log::warn!("scan: cannot read {rel_path}: {error}");
                continue;
            }
        };
        if !metadata.is_file() {
            continue;
        }
        visit(WalkedFile {
            path: entry.into_path(),
            rel_path,
            metadata,
        });
    }
    end
}

fn describe(root: &Path, error: &walkdir::Error) -> String {
    let path = error
        .path()
        .map(|path| {
            path.strip_prefix(root)
                .unwrap_or(path)
                .display()
                .to_string()
        })
        .unwrap_or_default();
    format!("{path}: {error}")
}
