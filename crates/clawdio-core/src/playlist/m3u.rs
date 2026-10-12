//! M3U8 text (P11.1, R13): UTF-8, `#EXTM3U`, then `#EXTINF` and a path per entry. Paths are
//! relative to the playlist file, with forward slashes.

/// One playlist entry: the path as the file holds it, and the `#EXTINF` text after the colon.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entry {
    pub path: String,
    pub info: Option<String>,
}

/// Reads M3U8 text. A BOM is removed. `#EXTINF` belongs to the next path; other comment
/// lines and empty lines are ignored.
pub fn parse(text: &str) -> Vec<Entry> {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let mut entries = Vec::new();
    let mut info = None;
    for line in text.lines() {
        let line = line.trim_end_matches('\r').trim();
        if line.is_empty() {
            continue;
        }
        if let Some(rest) = line.strip_prefix("#EXTINF:") {
            info = Some(rest.to_owned());
        } else if !line.starts_with('#') {
            entries.push(Entry {
                path: line.to_owned(),
                info: info.take(),
            });
        }
    }
    entries
}

/// The `#EXTINF` text of a library track: length in whole seconds, then "artist - title".
/// Line breaks in tags become spaces, so one entry stays two lines.
pub fn info(duration_ms: u32, artist: &str, title: &str) -> String {
    let one_line = |text: &str| text.replace(['\r', '\n'], " ");
    format!(
        "{},{} - {}",
        duration_ms / 1000,
        one_line(artist),
        one_line(title)
    )
}

/// M3U8 text for `entries`. An entry with no `#EXTINF` text gets an unknown length (-1) and
/// its file name. A rewrite keeps every entry and drops other comment lines (P11.1).
pub fn write(entries: &[Entry]) -> String {
    let mut text = String::from("#EXTM3U\n");
    for entry in entries {
        let info = entry.info.clone().unwrap_or_else(|| {
            let name = entry.path.rsplit(['/', '\\']).next().unwrap_or(&entry.path);
            format!("-1,{name}")
        });
        text.push_str("#EXTINF:");
        text.push_str(&info);
        text.push('\n');
        text.push_str(&entry.path);
        text.push('\n');
    }
    text
}

/// The folder of a path relative to the music folder ("Playlists/Mix.m3u8" gives "Playlists").
fn parent(rel_path: &str) -> &str {
    rel_path.rsplit_once('/').map_or("", |(folder, _)| folder)
}

/// The path of `target` as seen from the folder of `playlist`, both relative to the music
/// folder, with forward slashes ("../Artist/Album/Song.mp3" from "Playlists/Mix.m3u8").
pub fn relative_path(playlist: &str, target: &str) -> String {
    let from: Vec<&str> = parent(playlist)
        .split('/')
        .filter(|part| !part.is_empty())
        .collect();
    let to: Vec<&str> = target.split('/').collect();
    let common = from
        .iter()
        .zip(&to)
        .take_while(|(a, b)| a == b)
        .count()
        .min(to.len().saturating_sub(1));
    let mut parts: Vec<&str> = vec![".."; from.len() - common];
    parts.extend(&to[common..]);
    parts.join("/")
}

/// An entry path resolved against the folder of `playlist`, relative to the music folder, or
/// None when it is absolute or leaves the music folder (then the entry is missing). A
/// backslash counts as a separator, for files written on Windows.
pub fn resolve(playlist: &str, entry: &str) -> Option<String> {
    let entry = entry.replace('\\', "/");
    let absolute =
        entry.starts_with('/') || entry.as_bytes().get(1) == Some(&b':') || entry.contains("://");
    if absolute {
        return None;
    }
    let mut parts: Vec<&str> = parent(playlist)
        .split('/')
        .filter(|part| !part.is_empty())
        .collect();
    for part in entry.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            part => parts.push(part),
        }
    }
    (!parts.is_empty()).then(|| parts.join("/"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_reads_entries_with_their_info_and_skips_other_comments() {
        let text = "\u{feff}#EXTM3U\r\n#PLAYLIST:Mix\r\n#EXTINF:183,A - B\r\n../A/B/1.mp3\r\n\r\n../A/B/2.ogg\r\n";
        assert_eq!(
            parse(text),
            [
                Entry {
                    path: "../A/B/1.mp3".into(),
                    info: Some("183,A - B".into())
                },
                Entry {
                    path: "../A/B/2.ogg".into(),
                    info: None
                },
            ]
        );
    }

    #[test]
    fn write_gives_extm3u_and_one_extinf_per_entry() {
        let entries = [
            Entry {
                path: "../A/B/1.mp3".into(),
                info: Some(info(183_900, "A", "One")),
            },
            Entry {
                path: "../Missing/2.ogg".into(),
                info: None,
            },
        ];
        assert_eq!(
            write(&entries),
            "#EXTM3U\n#EXTINF:183,A - One\n../A/B/1.mp3\n#EXTINF:-1,2.ogg\n../Missing/2.ogg\n"
        );
        assert_eq!(parse(&write(&entries))[0], entries[0], "round trip");
    }

    #[test]
    fn paths_are_relative_to_the_playlist_folder() {
        assert_eq!(
            relative_path("Playlists/Mix.m3u8", "A/B/1.mp3"),
            "../A/B/1.mp3"
        );
        assert_eq!(relative_path("Mix.m3u8", "A/B/1.mp3"), "A/B/1.mp3");
        assert_eq!(relative_path("A/B/list.m3u8", "A/B/1.mp3"), "1.mp3");
        assert_eq!(relative_path("A/C/list.m3u8", "A/B/1.mp3"), "../B/1.mp3");
    }

    #[test]
    fn entries_resolve_relative_to_the_playlist_file() {
        assert_eq!(
            resolve("Playlists/Mix.m3u8", "../A/B/1.mp3").as_deref(),
            Some("A/B/1.mp3")
        );
        assert_eq!(
            resolve("A/B/list.m3u8", "./1.mp3").as_deref(),
            Some("A/B/1.mp3")
        );
        assert_eq!(
            resolve("Playlists/Mix.m3u8", "..\\A\\B\\1.mp3").as_deref(),
            Some("A/B/1.mp3")
        );
        assert_eq!(
            resolve("Playlists/Mix.m3u8", "../../out.mp3"),
            None,
            "leaves the folder"
        );
        assert_eq!(resolve("Mix.m3u8", "/home/u/1.mp3"), None);
        assert_eq!(resolve("Mix.m3u8", "C:\\Music\\1.mp3"), None);
    }

    #[test]
    fn line_breaks_in_tags_do_not_split_an_entry() {
        let entry = Entry {
            path: "a.mp3".into(),
            info: Some(info(1000, "A\nB", "T\r\nU")),
        };
        assert_eq!(parse(&write(std::slice::from_ref(&entry))), [entry]);
    }
}
