//! Atomic file writes: a temp file in the target folder, then a rename (R13, section 6.14).

use std::io::Write;
use std::path::Path;

/// Writes `bytes` to `path` so a reader sees the old or the new file, never a partial one.
/// A replaced file keeps its permissions. A new file gets the usual mode for a document
/// (0644 on Unix), not the temp file's 0600, so other players, media servers and shares can
/// read playlists and covers in the music folder.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let file = temp_with(path, bytes)?;
    file.persist(path).map_err(|error| error.error)?;
    Ok(())
}

/// Like [`write_atomic`], but never replaces a file: returns false when `path` exists.
/// A file system with no no-replace rename and no hard links (exFAT, FAT, some shares) gets
/// a direct create-new write instead: still no overwrite, but a crash can leave a part.
pub fn write_new(path: &Path, bytes: &[u8]) -> std::io::Result<bool> {
    let file = temp_with(path, bytes)?;
    match file.persist_noclobber(path) {
        Ok(_) => Ok(true),
        Err(error) if error.error.kind() == std::io::ErrorKind::AlreadyExists => Ok(false),
        Err(error) => {
            drop(error.file);
            let created = std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(path);
            let mut created = match created {
                Ok(created) => created,
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                    return Ok(false)
                }
                Err(_) => return Err(error.error),
            };
            created.write_all(bytes)?;
            created.sync_all()?;
            Ok(true)
        }
    }
}

/// A synced temp file next to `path` with `bytes` and the permissions `path` gets.
fn temp_with(path: &Path, bytes: &[u8]) -> std::io::Result<tempfile::NamedTempFile> {
    let folder = path
        .parent()
        .ok_or_else(|| std::io::Error::other("no parent folder"))?;
    std::fs::create_dir_all(folder)?;
    let mut file = tempfile::NamedTempFile::new_in(folder)?;
    file.write_all(bytes)?;
    let permissions = match std::fs::metadata(path) {
        Ok(existing) => Some(existing.permissions()),
        Err(_) => new_file_permissions(),
    };
    if let Some(permissions) = permissions {
        file.as_file().set_permissions(permissions)?;
    }
    file.as_file().sync_all()?;
    Ok(file)
}

#[cfg(unix)]
fn new_file_permissions() -> Option<std::fs::Permissions> {
    use std::os::unix::fs::PermissionsExt;
    Some(std::fs::Permissions::from_mode(0o644))
}

/// Windows temp files already get the folder's default access.
#[cfg(not(unix))]
fn new_file_permissions() -> Option<std::fs::Permissions> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replaces_the_file_and_leaves_no_temp_file() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("sub/settings.json");
        write_atomic(&path, b"one").unwrap();
        write_atomic(&path, b"two").unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"two");
        assert_eq!(
            std::fs::read_dir(path.parent().unwrap()).unwrap().count(),
            1
        );
    }

    #[test]
    fn write_new_never_replaces_a_file() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("cover.jpg");
        assert!(write_new(&path, b"one").unwrap());
        assert!(!write_new(&path, b"two").unwrap());
        assert_eq!(std::fs::read(&path).unwrap(), b"one");
        assert_eq!(std::fs::read_dir(folder.path()).unwrap().count(), 1);
    }

    #[cfg(unix)]
    #[test]
    fn a_new_file_is_readable_by_others_and_a_replaced_one_keeps_its_mode() {
        use std::os::unix::fs::PermissionsExt;
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("cover.jpg");
        write_atomic(&path, b"one").unwrap();
        let mode = |path: &Path| std::fs::metadata(path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode(&path), 0o644);
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o640)).unwrap();
        write_atomic(&path, b"two").unwrap();
        assert_eq!(mode(&path), 0o640);
    }
}
