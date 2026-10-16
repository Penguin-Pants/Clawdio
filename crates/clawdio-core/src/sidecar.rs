//! Album sidecar (P14.3, R10, R11): `sidecar.json` in the album folder holds the artwork
//! lookup marker and, from P16, track metadata. It is read leniently: unknown fields stay. A
//! corrupt file is logged, ignored and never rewritten automatically (D44).

use std::path::Path;
use std::sync::Mutex;
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

/// Metadata for one song (P16.5), keyed in `tracks` by the song path relative to the album
/// folder. Embedded tags win over these values (R10).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TrackEntry {
    pub title: Option<String>,
    pub track: Option<u32>,
    pub year: Option<i32>,
}

impl TrackEntry {
    pub fn is_empty(&self) -> bool {
        self.title.is_none() && self.track.is_none() && self.year.is_none()
    }

    /// Reads one `tracks` value leniently: a field of the wrong type is no value.
    fn from_value(value: &Value) -> Self {
        TrackEntry {
            title: value
                .get("title")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|title| !title.is_empty())
                .map(str::to_owned),
            track: value
                .get("track")
                .and_then(Value::as_u64)
                .filter(|track| (1..=u64::from(u32::MAX)).contains(track))
                .map(|track| track as u32),
            year: value
                .get("year")
                .and_then(Value::as_i64)
                .and_then(|year| i32::try_from(year).ok()),
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

impl Sidecar {
    /// The metadata of one song, by its path relative to the album folder.
    pub fn track(&self, key: &str) -> Option<TrackEntry> {
        let Sidecar::Valid(map) = self else {
            return None;
        };
        let entry = TrackEntry::from_value(map.get("tracks")?.get(key)?);
        (!entry.is_empty()).then_some(entry)
    }
}

impl Sidecar {
    /// The song has the lyrics "no match" marker (R9.3, D60). Unknown status text is no
    /// marker.
    pub fn lyrics_no_match(&self, key: &str) -> bool {
        let Sidecar::Valid(map) = self else {
            return false;
        };
        map.get("lyrics")
            .and_then(|lyrics| lyrics.get(key))
            .and_then(|entry| entry.get("status"))
            .and_then(Value::as_str)
            == Some("no-match")
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

/// One sidecar edit at a time in the process: the artwork job, "Fill missing metadata" and
/// "Retry lookup" each read, change and replace the whole file, so two edits at once could
/// drop one (R11).
static EDIT: Mutex<()> = Mutex::new(());

fn edit<T>(change: impl FnOnce() -> Result<T, SidecarError>) -> Result<T, SidecarError> {
    let _edit = EDIT.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    change()
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
    edit(|| {
        let mut map = current(folder)?;
        let mut artwork = Map::new();
        artwork.insert("status".into(), marker.text().into());
        artwork.insert("checked".into(), rfc3339(checked).into());
        map.insert("artwork".into(), Value::Object(artwork));
        write(folder, map)
    })
}

/// "Fill missing metadata" (P16.5): merges the values into `tracks` and keeps every other
/// field, the artwork marker and entries of songs that no longer exist (R11). A corrupt
/// sidecar is replaced only when `replace_corrupt` is set (after the user confirmed, P16.4).
pub fn write_tracks(
    folder: &Path,
    entries: &[(String, TrackEntry)],
    replace_corrupt: bool,
) -> Result<(), SidecarError> {
    edit(|| write_tracks_now(folder, entries, replace_corrupt))
}

fn write_tracks_now(
    folder: &Path,
    entries: &[(String, TrackEntry)],
    replace_corrupt: bool,
) -> Result<(), SidecarError> {
    let mut map = match current(folder) {
        Err(SidecarError::Corrupt) if replace_corrupt => Map::new(),
        other => other?,
    };
    let tracks = map
        .entry("tracks")
        .or_insert_with(|| Value::Object(Map::new()));
    // A `tracks` that is not an object is the user's data in an unknown form: it stays.
    let Value::Object(tracks) = tracks else {
        return Err(SidecarError::Corrupt);
    };
    for (key, entry) in entries {
        let slot = tracks
            .entry(key.clone())
            .or_insert_with(|| Value::Object(Map::new()));
        let Value::Object(fields) = slot else {
            return Err(SidecarError::Corrupt);
        };
        if let Some(title) = &entry.title {
            fields.insert("title".into(), title.clone().into());
        }
        if let Some(track) = entry.track {
            fields.insert("track".into(), track.into());
        }
        if let Some(year) = entry.year {
            fields.insert("year".into(), year.into());
        }
    }
    write(folder, map)
}

/// Records the lyrics "no match" marker of one song (R9.3, D60), keyed by its path inside the
/// album folder. Other fields and other songs stay. A `lyrics` value of an unknown form is
/// the user's data: the file stays and the result is [`SidecarError::Corrupt`].
pub fn write_lyrics_marker(
    folder: &Path,
    key: &str,
    checked: SystemTime,
) -> Result<(), SidecarError> {
    edit(|| {
        let mut map = current(folder)?;
        let lyrics = map
            .entry("lyrics")
            .or_insert_with(|| Value::Object(Map::new()));
        let Value::Object(lyrics) = lyrics else {
            return Err(SidecarError::Corrupt);
        };
        let entry = lyrics
            .entry(key.to_owned())
            .or_insert_with(|| Value::Object(Map::new()));
        let Value::Object(entry) = entry else {
            return Err(SidecarError::Corrupt);
        };
        entry.insert("status".into(), "no-match".into());
        entry.insert("checked".into(), rfc3339(checked).into());
        write(folder, map)
    })
}

/// "Fetch lyrics" (P24.6): removes the song's lyrics marker. Returns false when there was
/// none. An unknown form is [`SidecarError::Corrupt`] and stays.
pub fn clear_lyrics_marker(folder: &Path, key: &str) -> Result<bool, SidecarError> {
    edit(|| {
        let mut map = match read(folder) {
            Sidecar::Missing => return Ok(false),
            Sidecar::Corrupt => return Err(SidecarError::Corrupt),
            Sidecar::Valid(map) => map,
        };
        let Some(lyrics) = map.get_mut("lyrics") else {
            return Ok(false);
        };
        let Value::Object(entries) = lyrics else {
            return Err(SidecarError::Corrupt);
        };
        let entry = match entries.get_mut(key) {
            None => return Ok(false),
            Some(Value::Object(entry)) => entry,
            Some(_) => return Err(SidecarError::Corrupt),
        };
        // Only the app's own marker goes; an entry of another status is the user's data.
        if entry.get("status").and_then(Value::as_str) != Some("no-match") {
            return Ok(false);
        }
        entry.remove("status");
        entry.remove("checked");
        if entry.is_empty() {
            entries.remove(key);
        }
        if entries.is_empty() {
            map.remove("lyrics");
        }
        write(folder, map)?;
        Ok(true)
    })
}

/// "Retry lookup" (R8): removes the artwork marker. Returns false when there was none.
pub fn clear_marker(folder: &Path) -> Result<bool, SidecarError> {
    edit(|| clear_marker_now(folder))
}

fn clear_marker_now(folder: &Path) -> Result<bool, SidecarError> {
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

    /// The artwork job and "Fill missing metadata" edit the same file from two threads; no
    /// edit may drop the other's field.
    #[test]
    fn concurrent_marker_and_track_edits_keep_both() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path().to_path_buf();
        let marker = {
            let folder = folder.clone();
            std::thread::spawn(move || {
                for _ in 0..200 {
                    write_marker(&folder, ArtworkMarker::NoMatch, SystemTime::now()).unwrap();
                    clear_marker(&folder).unwrap();
                }
                write_marker(&folder, ArtworkMarker::NoMatch, SystemTime::now()).unwrap();
            })
        };
        for number in 0..200u32 {
            let entry = TrackEntry {
                title: Some(format!("Song {number}")),
                track: Some(number),
                year: None,
            };
            write_tracks(&folder, &[(format!("{number:03}.mp3"), entry)], false).unwrap();
        }
        marker.join().unwrap();
        let Sidecar::Valid(map) = read(&folder) else {
            panic!("the sidecar is not valid");
        };
        assert_eq!(
            map["tracks"].as_object().unwrap().len(),
            200,
            "a track edit was lost"
        );
        assert_eq!(read(&folder).marker(), Some(ArtworkMarker::NoMatch));
    }

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

    /// P16.5, P16-AC6: values merge into `tracks`; the marker and entries of missing songs stay.
    #[test]
    fn track_values_merge_and_other_entries_stay() {
        let folder = tempfile::tempdir().unwrap();
        std::fs::write(
            folder.path().join(SIDECAR_FILE),
            r#"{"version":1,"artwork":{"status":"no-match"},"tracks":{"gone.mp3":{"title":"Old"},"a.mp3":{"year":1999}}}"#,
        )
        .unwrap();
        let entry = TrackEntry {
            title: Some("Song A".into()),
            track: Some(3),
            year: None,
        };
        write_tracks(folder.path(), &[("a.mp3".into(), entry)], false).unwrap();
        let sidecar = read(folder.path());
        assert_eq!(sidecar.marker(), Some(ArtworkMarker::NoMatch));
        assert_eq!(
            sidecar.track("a.mp3"),
            Some(TrackEntry {
                title: Some("Song A".into()),
                track: Some(3),
                year: Some(1999),
            })
        );
        assert_eq!(
            sidecar.track("gone.mp3").unwrap().title.as_deref(),
            Some("Old")
        );
        assert_eq!(sidecar.track("other.mp3"), None);
    }

    #[test]
    fn track_values_are_read_leniently() {
        let folder = tempfile::tempdir().unwrap();
        std::fs::write(
            folder.path().join(SIDECAR_FILE),
            r#"{"tracks":{"a.mp3":{"title":"  ","track":"3","year":1973},"b.mp3":5}}"#,
        )
        .unwrap();
        let sidecar = read(folder.path());
        assert_eq!(
            sidecar.track("a.mp3"),
            Some(TrackEntry {
                title: None,
                track: None,
                year: Some(1973),
            })
        );
        assert_eq!(sidecar.track("b.mp3"), None);
    }

    /// P16-AC5: a corrupt sidecar is replaced only with the confirmation flag.
    #[test]
    fn a_corrupt_sidecar_is_replaced_only_when_confirmed() {
        let folder = tempfile::tempdir().unwrap();
        std::fs::write(folder.path().join(SIDECAR_FILE), "{broken").unwrap();
        let entry = || {
            vec![(
                "a.mp3".to_owned(),
                TrackEntry {
                    title: Some("A".into()),
                    ..TrackEntry::default()
                },
            )]
        };
        assert_eq!(
            write_tracks(folder.path(), &entry(), false),
            Err(SidecarError::Corrupt)
        );
        assert_eq!(
            std::fs::read_to_string(folder.path().join(SIDECAR_FILE)).unwrap(),
            "{broken"
        );
        write_tracks(folder.path(), &entry(), true).unwrap();
        assert_eq!(
            read(folder.path()).track("a.mp3").unwrap().title.as_deref(),
            Some("A")
        );
    }

    /// R11: a `tracks` value of an unknown form is kept, not reset.
    #[test]
    fn tracks_of_an_unknown_form_stay() {
        let folder = tempfile::tempdir().unwrap();
        let entry = vec![(
            "a.mp3".to_owned(),
            TrackEntry {
                title: Some("A".into()),
                ..TrackEntry::default()
            },
        )];
        for text in [r#"{"tracks":[1]}"#, r#"{"tracks":{"a.mp3":"note"}}"#] {
            std::fs::write(folder.path().join(SIDECAR_FILE), text).unwrap();
            assert_eq!(
                write_tracks(folder.path(), &entry, true),
                Err(SidecarError::Corrupt)
            );
            assert_eq!(
                std::fs::read_to_string(folder.path().join(SIDECAR_FILE)).unwrap(),
                text
            );
        }
    }

    /// P24-AC3: the lyrics marker goes into the album sidecar, keyed by the song's path in
    /// the album folder; other fields stay; a clear removes only that song's entry.
    #[test]
    fn a_lyrics_marker_is_written_read_and_cleared_and_other_fields_stay() {
        let folder = tempfile::tempdir().unwrap();
        assert!(!read(folder.path()).lyrics_no_match("CD2/01 a.mp3"));
        assert_eq!(
            clear_lyrics_marker(folder.path(), "CD2/01 a.mp3"),
            Ok(false)
        );
        std::fs::write(
            folder.path().join(SIDECAR_FILE),
            r#"{"version":1,"artwork":{"status":"no-art"},"tracks":{"01 a.mp3":{"title":"A"}},"future":true}"#,
        )
        .unwrap();
        write_lyrics_marker(folder.path(), "CD2/01 a.mp3", UNIX_EPOCH).unwrap();
        write_lyrics_marker(folder.path(), "02 b.mp3", UNIX_EPOCH).unwrap();
        let sidecar = read(folder.path());
        assert!(sidecar.lyrics_no_match("CD2/01 a.mp3"));
        assert!(sidecar.lyrics_no_match("02 b.mp3"));
        assert!(!sidecar.lyrics_no_match("01 a.mp3"));
        assert_eq!(sidecar.marker(), Some(ArtworkMarker::NoArt));
        let Sidecar::Valid(map) = &sidecar else {
            panic!("valid")
        };
        assert_eq!(
            map["lyrics"]["CD2/01 a.mp3"],
            serde_json::json!({"status": "no-match", "checked": "1970-01-01T00:00:00Z"})
        );
        assert_eq!(map["tracks"]["01 a.mp3"]["title"], "A");
        assert_eq!(map["future"], true);
        assert_eq!(clear_lyrics_marker(folder.path(), "CD2/01 a.mp3"), Ok(true));
        let sidecar = read(folder.path());
        assert!(!sidecar.lyrics_no_match("CD2/01 a.mp3"));
        assert!(sidecar.lyrics_no_match("02 b.mp3"));
        assert_eq!(clear_lyrics_marker(folder.path(), "02 b.mp3"), Ok(true));
        let Sidecar::Valid(map) = read(folder.path()) else {
            panic!("valid")
        };
        assert!(!map.contains_key("lyrics"), "an empty lyrics object goes");
        assert_eq!(map["artwork"]["status"], "no-art");
    }

    /// R11: a clear removes only the app's marker; other entries and fields stay.
    #[test]
    fn a_clear_keeps_entries_that_are_not_the_marker() {
        let folder = tempfile::tempdir().unwrap();
        let other = r#"{"lyrics":{"a.mp3":{"status":"reviewed","note":"keep"}}}"#;
        std::fs::write(folder.path().join(SIDECAR_FILE), other).unwrap();
        assert_eq!(clear_lyrics_marker(folder.path(), "a.mp3"), Ok(false));
        assert_eq!(
            std::fs::read_to_string(folder.path().join(SIDECAR_FILE)).unwrap(),
            other
        );
        std::fs::write(
            folder.path().join(SIDECAR_FILE),
            r#"{"lyrics":{"a.mp3":{"status":"no-match","checked":"x","note":"keep"}}}"#,
        )
        .unwrap();
        assert_eq!(clear_lyrics_marker(folder.path(), "a.mp3"), Ok(true));
        let Sidecar::Valid(map) = read(folder.path()) else {
            panic!("valid")
        };
        assert_eq!(map["lyrics"]["a.mp3"], serde_json::json!({"note": "keep"}));
    }

    /// P24-AC3, P24-AC5: a corrupt file or a `lyrics` value of an unknown form stays.
    #[test]
    fn lyrics_of_an_unknown_form_or_a_corrupt_file_stay() {
        let folder = tempfile::tempdir().unwrap();
        for text in [
            "{broken",
            r#"{"lyrics":[1]}"#,
            r#"{"lyrics":{"a.mp3":"note"}}"#,
        ] {
            std::fs::write(folder.path().join(SIDECAR_FILE), text).unwrap();
            assert!(!read(folder.path()).lyrics_no_match("a.mp3"));
            assert_eq!(
                write_lyrics_marker(folder.path(), "a.mp3", UNIX_EPOCH),
                Err(SidecarError::Corrupt),
                "{text}"
            );
            assert_eq!(
                clear_lyrics_marker(folder.path(), "a.mp3"),
                Err(SidecarError::Corrupt),
                "{text}"
            );
            assert_eq!(
                std::fs::read_to_string(folder.path().join(SIDECAR_FILE)).unwrap(),
                text
            );
        }
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
