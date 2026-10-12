//! Playlist names (P11.3, R12, D21). Each rejection has a message for the name dialog.

/// Windows device names, reserved with any extension too ("CON.mix").
const RESERVED: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// The name of the Favorites playlist (R26). It is reserved for the heart.
pub const FAVORITES: &str = "Favorites";

/// Why a name is refused. The text is the dialog message.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum NameError {
    #[error("Enter a name")]
    Empty,
    #[error("A name cannot contain / or \\")]
    Separator,
    #[error("A name cannot contain ..")]
    DotDot,
    #[error("A name cannot contain < > : \" | ? * or control characters")]
    Character,
    #[error("A name cannot start or end with a space or a dot")]
    Edge,
    #[error("{0} is a name that Windows reserves")]
    Reserved(String),
    #[error("Favorites is the heart's playlist")]
    Favorites,
    #[error("A playlist with this name exists")]
    Taken,
}

/// Checks a new playlist name against R12 and D21. `existing` holds the current names.
pub fn check<'a>(name: &str, existing: impl IntoIterator<Item = &'a str>) -> Result<(), NameError> {
    if name.is_empty() {
        return Err(NameError::Empty);
    }
    if name.contains(['/', '\\']) {
        return Err(NameError::Separator);
    }
    if name.contains("..") {
        return Err(NameError::DotDot);
    }
    if name
        .chars()
        .any(|c| "<>:\"|?*".contains(c) || c.is_control())
    {
        return Err(NameError::Character);
    }
    if name.starts_with([' ', '.']) || name.ends_with([' ', '.']) {
        return Err(NameError::Edge);
    }
    let device = name.split('.').next().unwrap_or(name);
    if let Some(reserved) = RESERVED.iter().find(|r| r.eq_ignore_ascii_case(device)) {
        return Err(NameError::Reserved((*reserved).to_owned()));
    }
    if name.eq_ignore_ascii_case(FAVORITES) {
        return Err(NameError::Favorites);
    }
    if existing
        .into_iter()
        .any(|other| other.to_lowercase() == name.to_lowercase())
    {
        return Err(NameError::Taken);
    }
    Ok(())
}

/// The name of an imported playlist (D21): each forbidden character becomes "_", leading and
/// trailing spaces and dots go, a reserved name gets " (imported)" and a taken name gets
/// " (2)", " (3)" and so on. `taken` says whether a valid name is in use.
pub fn import_name(raw: &str, taken: impl Fn(&str) -> bool) -> String {
    let mut name: String = raw
        .chars()
        .map(|c| {
            if "/\\<>:\"|?*".contains(c) || c.is_control() {
                '_'
            } else {
                c
            }
        })
        .collect();
    while name.contains("..") {
        name = name.replace("..", "_");
    }
    let mut name = name.trim_matches([' ', '.']).to_owned();
    if name.is_empty() {
        name = "Imported playlist".to_owned();
    }
    if matches!(
        check(&name, []),
        Err(NameError::Reserved(_) | NameError::Favorites)
    ) {
        name.push_str(" (imported)");
    }
    let base = name.clone();
    let mut number = 2;
    while taken(&name) {
        name = format!("{base} ({number})");
        number += 1;
    }
    name
}

#[cfg(test)]
mod tests {
    use super::*;

    /// P11-AC1.
    #[test]
    fn each_forbidden_name_is_refused_with_its_message() {
        let cases: &[(&str, NameError)] = &[
            ("", NameError::Empty),
            ("a/b", NameError::Separator),
            ("a\\b", NameError::Separator),
            ("a..b", NameError::DotDot),
            ("a<b", NameError::Character),
            ("a>b", NameError::Character),
            ("a:b", NameError::Character),
            ("a\"b", NameError::Character),
            ("a|b", NameError::Character),
            ("a?b", NameError::Character),
            ("a*b", NameError::Character),
            ("a\tb", NameError::Character),
            (" mix", NameError::Edge),
            ("mix ", NameError::Edge),
            (".mix", NameError::Edge),
            ("mix.", NameError::Edge),
            ("CON", NameError::Reserved("CON".into())),
            ("con", NameError::Reserved("CON".into())),
            ("CON.mix", NameError::Reserved("CON".into())),
            ("com1.roadtrip", NameError::Reserved("COM1".into())),
            ("Lpt9", NameError::Reserved("LPT9".into())),
            ("Aux", NameError::Reserved("AUX".into())),
            ("favorites", NameError::Favorites),
            ("FAVORITES", NameError::Favorites),
        ];
        for (name, error) in cases {
            assert_eq!(check(name, []), Err(error.clone()), "{name:?}");
            assert!(!error.to_string().is_empty());
        }
    }

    #[test]
    fn valid_names_pass_including_non_latin_ones() {
        for name in [
            "Road trip",
            "Mix 2",
            "Пробежка",
            "夜の曲",
            "CONCERT",
            "COM10",
            "a.b",
        ] {
            assert_eq!(check(name, []), Ok(()), "{name}");
        }
    }

    #[test]
    fn import_names_follow_the_d21_rule() {
        let free = |_: &str| false;
        assert_eq!(import_name("Road: trip?", free), "Road_ trip_");
        assert_eq!(import_name("  .Mix.  ", free), "Mix");
        assert_eq!(import_name("a/b\\c", free), "a_b_c");
        assert_eq!(import_name("x..y", free), "x_y");
        assert_eq!(import_name("CON", free), "CON (imported)");
        assert_eq!(import_name("favorites", free), "favorites (imported)");
        assert_eq!(import_name("...", free), "_");
        assert_eq!(import_name(" . ", free), "Imported playlist");
        let taken = |name: &str| name == "Mix" || name == "Mix (2)";
        assert_eq!(import_name("Mix", taken), "Mix (3)");
        for raw in ["Road: trip?", "CON", "a/b", "x..y", " . "] {
            assert_eq!(check(&import_name(raw, free), []), Ok(()), "{raw}");
        }
    }

    /// D21.
    #[test]
    fn a_name_taken_in_any_letter_case_is_refused() {
        assert_eq!(check("road trip", ["Road Trip"]), Err(NameError::Taken));
        assert_eq!(check("Road", ["Road Trip"]), Ok(()));
    }
}
