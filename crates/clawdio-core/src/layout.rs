//! `layout.json` (P9.2, R29): the dock arrangement and the Library mode. The webview builds
//! and checks the content (P9.4); this side stores it atomically and refuses what is not a
//! JSON object or is too large.

use std::path::Path;

use crate::atomic::write_atomic;
use crate::error::CoreError;

pub const LAYOUT_FILE: &str = "layout.json";
/// A six-widget arrangement is a few KB; anything this large is not a layout.
pub const MAX_LAYOUT_BYTES: usize = 1024 * 1024;

/// The stored layout text, or None when there is none or it cannot be read (logged).
pub fn load(config_dir: &Path) -> Option<String> {
    let path = config_dir.join(LAYOUT_FILE);
    match std::fs::read_to_string(&path) {
        Ok(text) => Some(text),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => {
            log::warn!("layout: cannot read {}: {error}", path.display());
            None
        }
    }
}

/// Writes the layout atomically after checking that it is one JSON object.
pub fn save(config_dir: &Path, json: &str) -> Result<(), CoreError> {
    if json.len() > MAX_LAYOUT_BYTES {
        return Err(CoreError::Invalid("the layout is too large".into()));
    }
    match serde_json::from_str::<serde_json::Value>(json) {
        Ok(serde_json::Value::Object(_)) => {}
        _ => return Err(CoreError::Invalid("the layout is not a JSON object".into())),
    }
    write_atomic(&config_dir.join(LAYOUT_FILE), json.as_bytes()).map_err(|error| {
        // The error text can hold the config path, which never goes to the webview (D13).
        log::warn!("layout: cannot save: {error}");
        CoreError::Io("cannot write the layout".into())
    })
}

/// Renames a bad `file` in the config folder to `<file>.bak`, replacing an older backup (PS-4,
/// UD5). A missing file is not an error. Returns true when a file was backed up.
pub fn backup(config_dir: &Path, file: &str) -> Result<bool, CoreError> {
    let path = config_dir.join(file);
    let target = config_dir.join(format!("{file}.bak"));
    match std::fs::rename(&path, &target) {
        Ok(()) => {
            log::warn!("layout: {file} backed up as {file}.bak");
            Ok(true)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => {
            log::warn!("layout: cannot back up {}: {error}", path.display());
            Err(CoreError::Io(format!("cannot back up {file}")))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_layout_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(load(dir.path()), None);
        let json = r#"{"version":1,"libraryMode":"tree","dock":{}}"#;
        save(dir.path(), json).unwrap();
        assert_eq!(load(dir.path()).as_deref(), Some(json));
    }

    #[test]
    fn non_objects_and_huge_text_are_refused() {
        let dir = tempfile::tempdir().unwrap();
        assert!(save(dir.path(), "[1, 2]").is_err());
        assert!(save(dir.path(), "{ broken").is_err());
        let huge = format!("{{\"a\":\"{}\"}}", "x".repeat(MAX_LAYOUT_BYTES));
        assert!(save(dir.path(), &huge).is_err());
        assert_eq!(load(dir.path()), None, "nothing written");
    }

    #[test]
    fn backup_renames_and_overwrites() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("layout.json.bak"), "old").unwrap();
        save(dir.path(), r#"{"version":1}"#).unwrap();
        assert!(backup(dir.path(), LAYOUT_FILE).unwrap());
        assert_eq!(load(dir.path()), None, "the bad file is gone");
        let saved = std::fs::read_to_string(dir.path().join("layout.json.bak")).unwrap();
        assert_eq!(saved, r#"{"version":1}"#);
    }

    #[test]
    fn backup_of_a_missing_file_is_not_an_error() {
        let dir = tempfile::tempdir().unwrap();
        assert!(!backup(dir.path(), LAYOUT_FILE).unwrap());
        assert!(!dir.path().join("layout.json.bak").exists());
    }
}
