//! `settings.json` (R18): music folder, Online lookups switch, first-run notice, window size
//! and microphone ducking (R34). Schema in `docs/file-formats.md`.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::api::{MicDucking, ScanCounts};
use crate::atomic::write_atomic;

pub const SETTINGS_FILE: &str = "settings.json";
pub const SETTINGS_VERSION: u32 = 1;
/// The default ducked volume: 20% of the user volume (R34.3).
pub const DEFAULT_DUCK_PERCENT: u8 = 20;

fn default_duck_percent() -> u8 {
    DEFAULT_DUCK_PERCENT
}

/// Why a duck percentage is refused (R34.3).
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("The percentage must be 5 to 90 in steps of 5")]
pub struct BadPercent;

/// A duck percentage: 5 to 90 in steps of 5 (R34.3).
pub fn check_duck_percent(percent: u8) -> Result<u8, BadPercent> {
    if (5..=90).contains(&percent) && percent.is_multiple_of(5) {
        Ok(percent)
    } else {
        Err(BadPercent)
    }
}

/// The main window: logical size, and the outer position in physical pixels (PS-5, UD14).
/// Files written before the UI shell rework have no position; the OS places the window then.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct WindowSize {
    pub width: f64,
    pub height: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub x: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub y: Option<i32>,
}

impl WindowSize {
    /// A size with no saved position.
    pub const fn new(width: f64, height: f64) -> Self {
        Self {
            width,
            height,
            x: None,
            y: None,
        }
    }
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
    /// Off by default (R34.1). Files written before v1.6 have no value.
    #[serde(default)]
    pub mic_ducking: MicDucking,
    /// 5 to 90 in steps of 5 (R34.3). A file value outside that range loads as the default.
    #[serde(default = "default_duck_percent")]
    pub mic_duck_percent: u8,
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
            mic_ducking: MicDucking::Off,
            mic_duck_percent: DEFAULT_DUCK_PERCENT,
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
        Ok(mut settings) if settings.version == SETTINGS_VERSION => {
            if check_duck_percent(settings.mic_duck_percent).is_err() {
                log::warn!(
                    "settings: duck percentage {} is not 5 to 90 in steps of 5; using {DEFAULT_DUCK_PERCENT}",
                    settings.mic_duck_percent
                );
                settings.mic_duck_percent = DEFAULT_DUCK_PERCENT;
            }
            Loaded::Read(settings)
        }
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
            window: Some(WindowSize::new(1000.0, 700.0)),
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

    /// P20-AC2: a file from before P20 keeps its values and gets the ducking defaults.
    #[test]
    fn a_file_without_ducking_fields_keeps_its_values() {
        let dir = tempfile::tempdir().unwrap();
        let text = r#"{"version":1,"musicFolder":"Music","onlineLookups":true,"onlineNoticeDone":true,"window":{"width":900.0,"height":600.0},"lastScan":{"added":1,"removed":0,"skipped":2}}"#;
        std::fs::write(dir.path().join(SETTINGS_FILE), text).unwrap();
        let Loaded::Read(settings) = load(dir.path()) else {
            panic!("the file reads");
        };
        assert_eq!(
            settings,
            Settings {
                music_folder: Some("Music".into()),
                online_lookups: true,
                online_notice_done: true,
                window: Some(WindowSize::new(900.0, 600.0)),
                last_scan: Some(ScanCounts {
                    added: 1,
                    removed: 0,
                    skipped: 2
                }),
                ..Settings::default()
            }
        );
        assert_eq!(settings.mic_ducking, MicDucking::Off);
        assert_eq!(settings.mic_duck_percent, 20);
    }

    /// P20-AC2: 5 to 90 in steps of 5.
    #[test]
    fn a_duck_percent_outside_the_range_or_the_step_is_refused() {
        for bad in [0, 4, 7, 91, 95, 100, 255] {
            assert_eq!(check_duck_percent(bad), Err(BadPercent), "{bad}");
        }
        for good in [5, 20, 45, 90] {
            assert_eq!(check_duck_percent(good), Ok(good));
        }
        let dir = tempfile::tempdir().unwrap();
        let text = r#"{"version":1,"musicFolder":"M","onlineLookups":false,"onlineNoticeDone":true,"window":null,"micDucking":"pause","micDuckPercent":33}"#;
        std::fs::write(dir.path().join(SETTINGS_FILE), text).unwrap();
        let Loaded::Read(settings) = load(dir.path()) else {
            panic!("the file reads");
        };
        assert_eq!(settings.mic_duck_percent, 20, "a bad file value");
        assert_eq!(settings.mic_ducking, MicDucking::Pause, "the rest stays");
        assert_eq!(settings.music_folder.as_deref(), Some("M"));
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

    #[test]
    fn a_window_position_round_trips_and_a_file_without_one_loads() {
        let dir = tempfile::tempdir().unwrap();
        let settings = Settings {
            window: Some(WindowSize {
                x: Some(-1200),
                y: Some(40),
                ..WindowSize::new(1000.0, 700.0)
            }),
            ..Settings::default()
        };
        save(dir.path(), &settings).unwrap();
        let Loaded::Read(read) = load(dir.path()) else {
            panic!("the file reads");
        };
        assert_eq!(read.window, settings.window);
        let text = r#"{"version":1,"musicFolder":null,"onlineLookups":false,"onlineNoticeDone":true,"window":{"width":900.0,"height":600.0}}"#;
        std::fs::write(dir.path().join(SETTINGS_FILE), text).unwrap();
        let Loaded::Read(old) = load(dir.path()) else {
            panic!("the file reads");
        };
        assert_eq!(old.window, Some(WindowSize::new(900.0, 600.0)));
    }
}
