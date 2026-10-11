//! Atomic file writes: a temp file in the target folder, then a rename (R13, section 6.14).

use std::io::Write;
use std::path::Path;

/// Writes `bytes` to `path` so a reader sees the old or the new file, never a partial one.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let folder = path
        .parent()
        .ok_or_else(|| std::io::Error::other("no parent folder"))?;
    std::fs::create_dir_all(folder)?;
    let mut file = tempfile::NamedTempFile::new_in(folder)?;
    file.write_all(bytes)?;
    file.as_file().sync_all()?;
    file.persist(path).map_err(|error| error.error)?;
    Ok(())
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
}
