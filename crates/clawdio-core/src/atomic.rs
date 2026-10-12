//! Atomic file writes: a temp file in the target folder, then a rename (R13, section 6.14).

use std::io::Write;
use std::path::Path;

/// Writes `bytes` to `path` so a reader sees the old or the new file, never a partial one.
/// A replaced file keeps its permissions. A new file gets the usual mode for a document
/// (0644 on Unix), not the temp file's 0600, so other players, media servers and shares can
/// read playlists and covers in the music folder.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
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
    file.persist(path).map_err(|error| error.error)?;
    Ok(())
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
