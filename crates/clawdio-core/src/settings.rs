//! `settings.json` (R18): music folder, Online lookups switch, first-run notice and window
//! size. Schema in `docs/file-formats.md`.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::api::ScanCounts;
use crate::atomic::write_atomic;

pub const SETTINGS_FILE: &str = "settings.json";
pub const SETTINGS_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct WindowSize {
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub version: u32,
    /// The music folder as stored by the R18.1 rule. None until the user chooses one.
    pub music_folder: Option<String>,
    /// Off by default (R7).
    pub online_lookups: bool,
    /// True once the user answered the first-run notice (R7).
    pub online_notice_done: bool,
    pub window: Option<WindowSize>,
    /// Counts of the last scan (R2). Older files have no value.
    #[serde(default)]
    pub last_scan: Option<ScanCounts>,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            version: SETTINGS_VERSION,
            music_folder: None,
            online_lookups: false,
            online_notice_done: false,
            window: None,
            last_scan: None,
        }
    }
}

/// What loading found.
#[derive(Debug, Clone, PartialEq)]
pub enum Loaded {
    /// A valid file.
    Read(Settings),
    /// No file: first run.
    Missing,
    /// A corrupt file or an unknown version. Defaults apply and the reason is logged.
    Invalid(String),
}

/// Reads `settings.json` from the config folder.
pub fn load(config_dir: &Path) -> Loaded {
    let path = config_dir.join(SETTINGS_FILE);
    let text = match std::fs::read_to_string(&path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Loaded::Missing,
        Err(error) => return Loaded::Invalid(format!("cannot read {}: {error}", path.display())),
    };
    match serde_json::from_str::<Settings>(&text) {
        Ok(settings) if settings.version == SETTINGS_VERSION => Loaded::Read(settings),
        Ok(settings) => Loaded::Invalid(format!("unknown settings version {}", settings.version)),
        Err(error) => Loaded::Invalid(format!("corrupt settings file: {error}")),
    }
}

/// Settings to use after loading: the file, or defaults with a warning in the log (P4.4).
/// Only a missing file is the first run: after a file that cannot be read, the Online
/// lookups notice stays done (R7).
pub fn load_or_default(config_dir: &Path) -> Settings {
    match load(config_dir) {
        Loaded::Read(settings) => settings,
        Loaded::Missing => Settings::default(),
        Loaded::Invalid(reason) => {
            log::warn!("settings: {reason}; using defaults");
            Settings {
                online_notice_done: true,
                ..Settings::default()
            }
        }
    }
}

/// Writes `settings.json` atomically.
pub fn save(config_dir: &Path, settings: &Settings) -> std::io::Result<()> {
    let bytes = serde_json::to_vec_pretty(settings).map_err(std::io::Error::other)?;
    write_atomic(&config_dir.join(SETTINGS_FILE), &bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_file_is_the_first_run() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(load(dir.path()), Loaded::Missing);
        let settings = load_or_default(dir.path());
        assert!(
            !settings.online_notice_done,
            "the first run shows the notice"
        );
        assert!(
            !settings.online_lookups,
            "Online lookups are off by default (R7)"
        );
    }

    #[test]
    fn settings_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let settings = Settings {
            music_folder: Some("Music".into()),
            online_lookups: true,
            online_notice_done: true,
            window: Some(WindowSize {
                width: 1000.0,
                height: 700.0,
            }),
            last_scan: Some(ScanCounts {
                added: 3,
                removed: 2,
                skipped: 1,
            }),
            ..Settings::default()
        };
        save(dir.path(), &settings).unwrap();
        assert_eq!(load(dir.path()), Loaded::Read(settings));
    }

    #[test]
    fn a_corrupt_file_gives_defaults_with_the_notice_done() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(SETTINGS_FILE), "{ not json").unwrap();
        assert!(matches!(load(dir.path()), Loaded::Invalid(reason) if reason.contains("corrupt")));
        let settings = load_or_default(dir.path());
        assert!(
            settings.online_notice_done,
            "not the first run: no notice (R7)"
        );
        assert_eq!(
            settings,
            Settings {
                online_notice_done: true,
                ..Settings::default()
            }
        );
    }

    #[test]
    fn a_file_without_scan_counts_reads() {
        let dir = tempfile::tempdir().unwrap();
        let text = r#"{"version":1,"musicFolder":null,"onlineLookups":false,"onlineNoticeDone":true,"window":null}"#;
        std::fs::write(dir.path().join(SETTINGS_FILE), text).unwrap();
        assert!(matches!(load(dir.path()), Loaded::Read(s) if s.last_scan.is_none()));
    }

    #[test]
    fn an_unknown_version_is_invalid() {
        let dir = tempfile::tempdir().unwrap();
        let text = r#"{"version":9,"musicFolder":null,"onlineLookups":false,"onlineNoticeDone":true,"window":null}"#;
        std::fs::write(dir.path().join(SETTINGS_FILE), text).unwrap();
        assert!(
            matches!(load(dir.path()), Loaded::Invalid(reason) if reason.contains("version 9"))
        );
    }
}
