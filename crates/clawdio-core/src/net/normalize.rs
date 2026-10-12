//! Name normalization for online matching (P14.4, R8, D43).

use crate::fold::fold;

/// Words that mark an edition group: "(Remastered)", "[Deluxe Edition]".
const EDITION_WORDS: [&str; 12] = [
    "remaster",
    "remastered",
    "deluxe",
    "edition",
    "expanded",
    "anniversary",
    "bonus",
    "special",
    "reissue",
    "version",
    "mono",
    "stereo",
];

fn is_year(text: &str) -> bool {
    text.len() == 4 && text.bytes().all(|byte| byte.is_ascii_digit())
}

/// True when a bracket group holds a 4-digit year or an edition word.
fn is_edition_group(inner: &str) -> bool {
    inner
        .split(|c: char| !c.is_alphanumeric())
        .any(|word| is_year(word) || EDITION_WORDS.contains(&word))
}

/// "1973 - ", "1973. ", "(1973) " and "1973 " at the start go. The rest must not be empty,
/// so an album named "1984" stays.
fn strip_leading_year(text: &str) -> &str {
    let (year, rest) = match text.strip_prefix('(') {
        Some(inner) => match inner.get(..4).zip(inner.get(4..)) {
            Some((year, rest)) if rest.starts_with(')') => (year, &rest[1..]),
            _ => return text,
        },
        None => match text.get(..4).zip(text.get(4..)) {
            Some(parts) => parts,
            None => return text,
        },
    };
    if !is_year(year) {
        return text;
    }
    let after_separator = rest.trim_start_matches([' ', '-', '.', ':', '_']);
    // A separator or a space must follow the year: "1973abc" is a name.
    if after_separator.len() == rest.len() || after_separator.trim().is_empty() {
        return text;
    }
    after_separator
}

/// Removes each `(...)` or `[...]` group that holds a year or an edition word.
fn strip_edition_groups(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find(['(', '[']) {
        let close = if rest[start..].starts_with('(') {
            ')'
        } else {
            ']'
        };
        let Some(length) = rest[start + 1..].find(close) else {
            break;
        };
        let end = start + 1 + length;
        out.push_str(&rest[..start]);
        if !is_edition_group(&rest[start + 1..end]) {
            out.push_str(&rest[start..=end]);
        }
        rest = &rest[end + 1..];
    }
    out.push_str(rest);
    out
}

/// A name for comparison (D43): folded, without a leading year, edition groups or a leading
/// "the ", with single spaces.
pub fn normalize(name: &str) -> String {
    let folded = fold(name);
    let text = strip_edition_groups(strip_leading_year(folded.trim()));
    let words: Vec<&str> = text.split_whitespace().collect();
    let words = match words.split_first() {
        Some((&"the", rest)) if !rest.is_empty() => rest,
        _ => &words[..],
    };
    words.join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// P14-AC3 (AC-6).
    #[test]
    fn a_year_and_an_edition_group_go() {
        assert_eq!(normalize("1973 - Album (Remastered)"), normalize("Album"));
        assert_eq!(normalize("1973. Album [Deluxe Edition]"), "album");
        assert_eq!(normalize("(1973) Album (2011 Remaster)"), "album");
        assert_eq!(normalize("1973 Album"), "album");
    }

    #[test]
    fn the_case_and_accents_go() {
        assert_eq!(normalize("The Beatles"), normalize("beatles"));
        assert_eq!(normalize("Björk"), "bjork");
        assert_eq!(normalize("  Two   Spaces "), "two spaces");
    }

    #[test]
    fn other_text_stays() {
        assert_eq!(normalize("1984"), "1984", "a year alone is the name");
        assert_eq!(normalize("1999abc"), "1999abc");
        assert_eq!(normalize("Album (Live)"), "album (live)");
        assert_eq!(normalize("The"), "the");
        assert_eq!(normalize("Theatre"), "theatre");
        assert_eq!(normalize("Album (unclosed"), "album (unclosed");
        assert_eq!(normalize("Mixed [Mono] (Part 2)"), "mixed (part 2)");
    }
}
