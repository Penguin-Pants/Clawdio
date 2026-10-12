//! Album sidecar (P14.3, R10, R11): `sidecar.json` in the album folder holds the artwork
//! lookup marker and, from P16, track metadata. It is read leniently: unknown fields stay. A
//! corrupt file is logged, ignored and never rewritten automatically (D44).

use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{Map, Value};

use crate::atomic::write_atomic;

pub const SIDECAR_FILE: &str = "sidecar.json";
pub const SIDECAR_VERSION: u64 = 1;

/// The artwork lookup result kept in the sidecar (R8).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArtworkMarker {
    /// No single release group matched.
    NoMatch,
    /// One release group matched, but Cover Art Archive has no front image.
    NoArt,
}

impl ArtworkMarker {
    fn text(self) -> &'static str {
        match self {
            ArtworkMarker::NoMatch => "no-match",
            ArtworkMarker::NoArt => "no-art",
        }
    }
}

/// An album folder's sidecar.
#[derive(Debug, Clone, PartialEq)]
pub enum Sidecar {
    Missing,
    /// It exists but cannot be read as a JSON object. It is left as it is.
    Corrupt,
    Valid(Map<String, Value>),
}

/// Why the sidecar was not written.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum SidecarError {
    #[error("The album's sidecar.json is corrupt and stays unchanged")]
    Corrupt,
    #[error("The album's sidecar.json cannot be written")]
    Write,
}

/// Reads `sidecar.json` of `folder`. A corrupt or unreadable file is logged.
pub fn read(folder: &Path) -> Sidecar {
    let path = folder.join(SIDECAR_FILE);
    let bytes = match std::fs::read(&path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Sidecar::Missing,
        Err(error) => {
            log::warn!("sidecar: cannot read {}: {error}", path.display());
            return Sidecar::Corrupt;
        }
    };
    match serde_json::from_slice::<Value>(&bytes) {
        Ok(Value::Object(map)) => Sidecar::Valid(map),
        _ => {
            log::warn!("sidecar: {} is corrupt; it is ignored", path.display());
            Sidecar::Corrupt
        }
    }
}

impl Sidecar {
    /// The artwork marker, if the sidecar holds one. Unknown status text is no marker.
    pub fn marker(&self) -> Option<ArtworkMarker> {
        let Sidecar::Valid(map) = self else {
            return None;
        };
        match map.get("artwork")?.get("status")?.as_str()? {
            "no-match" => Some(ArtworkMarker::NoMatch),
            "no-art" => Some(ArtworkMarker::NoArt),
            _ => None,
        }
    }
}

/// Writes `map` back with the schema fields set.
fn write(folder: &Path, mut map: Map<String, Value>) -> Result<(), SidecarError> {
    map.insert("version".into(), SIDECAR_VERSION.into());
    map.entry("tracks")
        .or_insert_with(|| Value::Object(Map::new()));
    let mut text =
        serde_json::to_string_pretty(&Value::Object(map)).map_err(|_| SidecarError::Write)?;
    text.push('\n');
    write_atomic(&folder.join(SIDECAR_FILE), text.as_bytes()).map_err(|error| {
        log::warn!("sidecar: cannot write in {}: {error}", folder.display());
        SidecarError::Write
    })
}

fn current(folder: &Path) -> Result<Map<String, Value>, SidecarError> {
    match read(folder) {
        Sidecar::Missing => Ok(Map::new()),
        Sidecar::Valid(map) => Ok(map),
        Sidecar::Corrupt => Err(SidecarError::Corrupt),
    }
}

/// Records an artwork marker with the time of the check. Other fields stay.
pub fn write_marker(
    folder: &Path,
    marker: ArtworkMarker,
    checked: SystemTime,
) -> Result<(), SidecarError> {
    let mut map = current(folder)?;
    let mut artwork = Map::new();
    artwork.insert("status".into(), marker.text().into());
    artwork.insert("checked".into(), rfc3339(checked).into());
    map.insert("artwork".into(), Value::Object(artwork));
    write(folder, map)
}

/// "Retry lookup" (R8): removes the artwork marker. Returns false when there was none.
pub fn clear_marker(folder: &Path) -> Result<bool, SidecarError> {
    let sidecar = read(folder);
    if sidecar == Sidecar::Corrupt {
        return Err(SidecarError::Corrupt);
    }
    let Sidecar::Valid(mut map) = sidecar else {
        return Ok(false);
    };
    if map.remove("artwork").is_none() {
        return Ok(false);
    }
    write(folder, map)?;
    Ok(true)
}

/// A UTC time as RFC 3339 with seconds ("2026-10-12T08:05:09Z").
pub fn rfc3339(time: SystemTime) -> String {
    let seconds = time
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_secs());
    let days = (seconds / 86_400) as i64;
    let rest = seconds % 86_400;
    // Days to a civil date (Howard Hinnant's algorithm).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let day_of_era = z.rem_euclid(146_097);
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_index = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_index + 2) / 5 + 1;
    let month = if month_index < 10 {
        month_index + 3
    } else {
        month_index - 9
    };
    let year = year_of_era + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        rest / 3600,
        rest % 3600 / 60,
        rest % 60
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn times_are_rfc3339_utc() {
        assert_eq!(rfc3339(UNIX_EPOCH), "1970-01-01T00:00:00Z");
        let time = UNIX_EPOCH + Duration::from_secs(1_791_791_109);
        assert_eq!(rfc3339(time), "2026-10-12T07:45:09Z");
        let leap = UNIX_EPOCH + Duration::from_secs(951_782_400);
        assert_eq!(rfc3339(leap), "2000-02-29T00:00:00Z");
    }

    #[test]
    fn a_marker_is_written_read_and_cleared_and_other_fields_stay() {
        let folder = tempfile::tempdir().unwrap();
        assert_eq!(read(folder.path()), Sidecar::Missing);
        assert_eq!(clear_marker(folder.path()), Ok(false));
        std::fs::write(
            folder.path().join(SIDECAR_FILE),
            r#"{"version":1,"tracks":{"01 a.mp3":{"title":"A"}},"future":true}"#,
        )
        .unwrap();
        write_marker(folder.path(), ArtworkMarker::NoMatch, UNIX_EPOCH).unwrap();
        let sidecar = read(folder.path());
        assert_eq!(sidecar.marker(), Some(ArtworkMarker::NoMatch));
        let Sidecar::Valid(map) = &sidecar else {
            panic!("valid")
        };
        assert_eq!(map["artwork"]["checked"], "1970-01-01T00:00:00Z");
        assert_eq!(map["tracks"]["01 a.mp3"]["title"], "A");
        assert_eq!(map["future"], true);
        assert_eq!(clear_marker(folder.path()), Ok(true));
        assert_eq!(read(folder.path()).marker(), None);
        write_marker(folder.path(), ArtworkMarker::NoArt, UNIX_EPOCH).unwrap();
        assert_eq!(read(folder.path()).marker(), Some(ArtworkMarker::NoArt));
    }

    #[test]
    fn a_new_sidecar_has_the_schema_fields() {
        let folder = tempfile::tempdir().unwrap();
        write_marker(folder.path(), ArtworkMarker::NoMatch, UNIX_EPOCH).unwrap();
        let text = std::fs::read_to_string(folder.path().join(SIDECAR_FILE)).unwrap();
        let value: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(value["version"], 1);
        assert_eq!(value["tracks"], Value::Object(Map::new()));
        assert_eq!(value["artwork"]["status"], "no-match");
    }

    /// P14-AC10.
    #[test]
    fn a_corrupt_sidecar_is_ignored_and_left_unchanged() {
        let folder = tempfile::tempdir().unwrap();
        for text in ["{not json", "[1, 2]"] {
            std::fs::write(folder.path().join(SIDECAR_FILE), text).unwrap();
            assert_eq!(read(folder.path()), Sidecar::Corrupt);
            assert_eq!(read(folder.path()).marker(), None);
            assert_eq!(
                write_marker(folder.path(), ArtworkMarker::NoMatch, UNIX_EPOCH),
                Err(SidecarError::Corrupt)
            );
            assert_eq!(clear_marker(folder.path()), Err(SidecarError::Corrupt));
            assert_eq!(
                std::fs::read_to_string(folder.path().join(SIDECAR_FILE)).unwrap(),
                text
            );
        }
    }
}
