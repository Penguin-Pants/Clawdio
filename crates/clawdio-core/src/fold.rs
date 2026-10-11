//! Text folding for search and sort keys (D4): NFD, combining marks removed, lowercase.
//! P5 adds natural order.

use unicode_normalization::char::is_combining_mark;
use unicode_normalization::UnicodeNormalization;

/// Folds `text` so that search ignores case and accents ("Beyoncé" and "beyonce" match).
pub fn fold(text: &str) -> String {
    text.nfd()
        .filter(|c| !is_combining_mark(*c))
        .flat_map(char::to_lowercase)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removes_case_and_accents() {
        assert_eq!(fold("Beyoncé"), "beyonce");
        assert_eq!(fold("ÅNGSTRÖM"), "angstrom");
        assert_eq!(fold("Mötley Crüe 2"), "motley crue 2");
    }

    #[test]
    fn keeps_non_latin_letters() {
        assert_eq!(fold("東京"), "東京");
        assert_eq!(fold("Ωmega"), "ωmega");
    }
}
