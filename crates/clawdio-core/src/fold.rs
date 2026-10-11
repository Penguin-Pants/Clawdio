//! Text folding for search and sort keys (D4): NFD, combining marks removed, lowercase.
//! Natural order compares digit runs by value (R3: 2 before 10).

use std::cmp::Ordering;

use unicode_normalization::char::is_combining_mark;
use unicode_normalization::UnicodeNormalization;

/// Folds `text` so that search ignores case and accents ("Beyoncé" and "beyonce" match).
pub fn fold(text: &str) -> String {
    text.nfd()
        .filter(|c| !is_combining_mark(*c))
        .flat_map(char::to_lowercase)
        .collect()
}

/// Natural order (D4): `a` and `b` are folded, digit runs compare by value and other text by
/// character. Names that are equal after this compare by their exact bytes.
pub fn natural_cmp(a: &str, b: &str) -> Ordering {
    natural_folded(&fold(a), &fold(b)).then_with(|| a.as_bytes().cmp(b.as_bytes()))
}

/// Natural order of two folded strings.
fn natural_folded(a: &str, b: &str) -> Ordering {
    let (mut a, mut b) = (a.chars().peekable(), b.chars().peekable());
    loop {
        match (a.peek().copied(), b.peek().copied()) {
            (None, None) => return Ordering::Equal,
            (None, Some(_)) => return Ordering::Less,
            (Some(_), None) => return Ordering::Greater,
            (Some(x), Some(y)) if x.is_ascii_digit() && y.is_ascii_digit() => {
                let order = compare_numbers(&digit_run(&mut a), &digit_run(&mut b));
                if order != Ordering::Equal {
                    return order;
                }
            }
            (Some(x), Some(y)) => {
                if x != y {
                    return x.cmp(&y);
                }
                a.next();
                b.next();
            }
        }
    }
}

fn digit_run(chars: &mut std::iter::Peekable<std::str::Chars<'_>>) -> String {
    let mut run = String::new();
    while let Some(c) = chars.next_if(char::is_ascii_digit) {
        run.push(c);
    }
    run
}

/// Compares two digit runs by value, without a size limit.
fn compare_numbers(a: &str, b: &str) -> Ordering {
    let (a, b) = (a.trim_start_matches('0'), b.trim_start_matches('0'));
    a.len().cmp(&b.len()).then_with(|| a.cmp(b))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sorted(names: &[&str]) -> Vec<String> {
        let mut names: Vec<String> = names.iter().map(|name| name.to_string()).collect();
        names.sort_by(|a, b| natural_cmp(a, b));
        names
    }

    #[test]
    fn digit_runs_compare_by_value() {
        assert_eq!(
            sorted(&["Disc 10", "Disc 2", "Disc 1", "disc 3"]),
            ["Disc 1", "Disc 2", "disc 3", "Disc 10"]
        );
        assert_eq!(sorted(&["a10b", "a9b", "a10a"]), ["a9b", "a10a", "a10b"]);
        assert_eq!(sorted(&["007", "7", "6"]), ["6", "007", "7"]);
        assert_eq!(
            sorted(&["99999999999999999999999", "100000000000000000000000"]),
            ["99999999999999999999999", "100000000000000000000000"]
        );
    }

    #[test]
    fn ignores_case_and_accents_then_uses_exact_bytes() {
        assert_eq!(
            sorted(&["Émile", "eagle", "Echo"]),
            ["eagle", "Echo", "Émile"]
        );
        assert_eq!(sorted(&["abba", "ABBA", "Abba"]), ["ABBA", "Abba", "abba"]);
        assert_eq!(natural_cmp("Beyoncé", "Beyonce"), Ordering::Greater);
    }

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
