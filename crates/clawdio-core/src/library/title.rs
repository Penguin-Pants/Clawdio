//! Titles and song order (R4): the tag, then the album sidecar (P16), then the file name.

use crate::sidecar::TrackEntry;

/// The file name without a leading track-number prefix (R4), and the number from the prefix.
/// A prefix is one to three digits, an optional "-" or "." with one to three more digits, then
/// one or more of space, ".", "-" or "_". A name that is only a prefix keeps its text.
pub fn strip_number_prefix(stem: &str) -> (&str, Option<u32>) {
    let bytes = stem.as_bytes();
    let digits_at = |from: usize| {
        bytes[from..]
            .iter()
            .take_while(|b| b.is_ascii_digit())
            .count()
    };
    let separators_at = |from: usize| {
        bytes[from..]
            .iter()
            .take_while(|b| matches!(b, b' ' | b'.' | b'-' | b'_'))
            .count()
    };
    let number = |from: usize, len: usize| stem[from..from + len].parse::<u32>().ok();
    // A digit run longer than three cannot match: the next character would be a digit.
    let first = digits_at(0);
    if first == 0 || first > 3 {
        return (stem, None);
    }
    // With the optional "-" or "." group and its one to three digits.
    if matches!(bytes.get(first), Some(b'-' | b'.')) {
        let second = digits_at(first + 1);
        let end = first + 1 + second;
        if (1..=3).contains(&second) && separators_at(end) > 0 {
            let rest = &stem[end + separators_at(end)..];
            // A name that is only a prefix keeps its text.
            return if rest.is_empty() {
                (stem, None)
            } else {
                (rest, number(first + 1, second))
            };
        }
    }
    // Without the group.
    let separators = separators_at(first);
    let rest = &stem[first + separators..];
    if separators == 0 || rest.is_empty() {
        return (stem, None);
    }
    (rest, number(0, first))
}

/// Title and track number (R4): the tag, else the sidecar value, else the file name without
/// its prefix and the number from the prefix.
pub fn title_and_track(
    tag_title: Option<String>,
    tag_track: Option<u32>,
    sidecar: Option<&TrackEntry>,
    stem: &str,
) -> (String, Option<u32>) {
    let (name, number) = strip_number_prefix(stem);
    let sidecar_title = sidecar.and_then(|entry| entry.title.clone());
    let sidecar_track = sidecar.and_then(|entry| entry.track);
    (
        tag_title
            .or(sidecar_title)
            .unwrap_or_else(|| name.to_owned()),
        tag_track.or(sidecar_track).or(number),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removes_every_r4_prefix_example() {
        assert_eq!(strip_number_prefix("01 - Song"), ("Song", Some(1)));
        assert_eq!(strip_number_prefix("01. Song"), ("Song", Some(1)));
        assert_eq!(strip_number_prefix("1-01 Song"), ("Song", Some(1)));
        assert_eq!(strip_number_prefix("2-07 Song"), ("Song", Some(7)));
        assert_eq!(strip_number_prefix("001_Song"), ("Song", Some(1)));
        assert_eq!(strip_number_prefix("12.03 - Song"), ("Song", Some(3)));
    }

    #[test]
    fn keeps_names_that_have_no_prefix() {
        assert_eq!(strip_number_prefix("1984"), ("1984", None));
        assert_eq!(strip_number_prefix("1984 Song"), ("1984 Song", None));
        assert_eq!(strip_number_prefix("Song 01"), ("Song 01", None));
        assert_eq!(strip_number_prefix("01"), ("01", None));
        assert_eq!(strip_number_prefix("01 - "), ("01 - ", None));
        assert_eq!(strip_number_prefix("1-01 "), ("1-01 ", None));
        assert_eq!(strip_number_prefix("1234 - Song"), ("1234 - Song", None));
    }

    #[test]
    fn follows_the_prefix_pattern_exactly() {
        assert_eq!(strip_number_prefix("1-Song"), ("Song", Some(1)));
        assert_eq!(strip_number_prefix("1.Song"), ("Song", Some(1)));
        assert_eq!(strip_number_prefix("1-0123 x"), ("0123 x", Some(1)));
        assert_eq!(strip_number_prefix("05__-. Song"), ("Song", Some(5)));
    }

    #[test]
    fn the_tag_wins() {
        assert_eq!(
            title_and_track(Some("Tag".into()), Some(9), None, "03 - File"),
            ("Tag".to_string(), Some(9))
        );
        assert_eq!(
            title_and_track(None, None, None, "03 - File"),
            ("File".to_string(), Some(3))
        );
    }

    /// P16.6: tag, then sidecar, then file name, for title and track number each.
    #[test]
    fn the_sidecar_comes_between_the_tag_and_the_file_name() {
        let entry = TrackEntry {
            title: Some("Sidecar".into()),
            track: Some(7),
            year: None,
        };
        assert_eq!(
            title_and_track(None, None, Some(&entry), "03 - File"),
            ("Sidecar".to_string(), Some(7))
        );
        assert_eq!(
            title_and_track(Some("Tag".into()), None, Some(&entry), "03 - File"),
            ("Tag".to_string(), Some(7))
        );
        assert_eq!(
            title_and_track(None, Some(9), Some(&entry), "03 - File"),
            ("Sidecar".to_string(), Some(9))
        );
        let title_only = TrackEntry {
            title: Some("Sidecar".into()),
            ..TrackEntry::default()
        };
        assert_eq!(
            title_and_track(None, None, Some(&title_only), "03 - File"),
            ("Sidecar".to_string(), Some(3))
        );
    }
}
