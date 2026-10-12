//! Import sources (P12.1, R14): M3U, M3U8 and Apple XML into source entries.

use plist::Value;

/// One entry of a source playlist.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct SourceEntry {
    /// The entry text: the M3U path line, or the decoded path of an Apple `Location`. Empty
    /// for an Apple track with no location.
    pub path: String,
    /// The `#EXTINF` text after the colon (M3U family), kept for a missing entry.
    pub info: Option<String>,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
}

impl SourceEntry {
    /// A track with no file location (a streaming track): it goes to the report only.
    pub fn has_location(&self) -> bool {
        !self.path.is_empty()
    }
}

/// One playlist to import.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Source {
    /// The name for the new file: the source file name, or the Apple playlist name.
    pub name: String,
    /// True for the M3U family, whose entries can be relative to the playlist file.
    pub relative_entries: bool,
    pub entries: Vec<SourceEntry>,
}

/// Text of a legacy `.m3u`: UTF-8 when valid, else Windows-1252 (R14). A BOM is removed.
/// Lyrics files use the same rule (D26).
pub fn decode_m3u(bytes: &[u8]) -> String {
    let bytes = bytes.strip_prefix(b"\xef\xbb\xbf").unwrap_or(bytes);
    match std::str::from_utf8(bytes) {
        Ok(text) => text.to_owned(),
        Err(_) => encoding_rs::WINDOWS_1252.decode(bytes).0.into_owned(),
    }
}

/// Text of an `.m3u8`: UTF-8 (R14). Invalid bytes become U+FFFD.
pub fn decode_m3u8(bytes: &[u8]) -> String {
    let bytes = bytes.strip_prefix(b"\xef\xbb\xbf").unwrap_or(bytes);
    String::from_utf8_lossy(bytes).into_owned()
}

/// "Artist - Title" from `#EXTINF:<seconds>,<text>`, when the text has that form.
fn extinf_names(info: &str) -> (Option<String>, Option<String>) {
    let Some((_, text)) = info.split_once(',') else {
        return (None, None);
    };
    match text.split_once(" - ") {
        Some((artist, title)) => (
            Some(artist.trim().to_owned()).filter(|s| !s.is_empty()),
            Some(title.trim().to_owned()).filter(|s| !s.is_empty()),
        ),
        None => (None, Some(text.trim().to_owned()).filter(|s| !s.is_empty())),
    }
}

/// M3U or M3U8 text into a source named `name`.
pub fn m3u(name: &str, text: &str) -> Source {
    let mut entries = Vec::new();
    let mut info: Option<String> = None;
    for line in text.lines() {
        let line = line.trim_end_matches('\r').trim();
        if line.is_empty() {
            continue;
        }
        if let Some(rest) = line.strip_prefix("#EXTINF:") {
            info = Some(rest.to_owned());
        } else if !line.starts_with('#') {
            let (artist, title) = info.as_deref().map(extinf_names).unwrap_or_default();
            entries.push(SourceEntry {
                path: line.to_owned(),
                info: info.take(),
                title,
                artist,
                album: None,
            });
        }
    }
    Source {
        name: name.to_owned(),
        relative_entries: true,
        entries,
    }
}

/// Percent-decoding of a URL path, as UTF-8. Invalid sequences stay as they are.
fn percent_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        let digit = |at: usize| bytes.get(at).and_then(|&byte| (byte as char).to_digit(16));
        if bytes[index] == b'%' {
            if let (Some(high), Some(low)) = (digit(index + 1), digit(index + 2)) {
                out.push((high * 16 + low) as u8);
                index += 3;
                continue;
            }
        }
        out.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// A `file://` URL to a path (R14): an empty host or "localhost" goes, another host becomes a
/// UNC prefix ("file://nas/share/a.mp3" gives "//nas/share/a.mp3"), the rest is
/// percent-decoded, and a Windows drive keeps its letter ("file://localhost/C:/a%20b.mp3"
/// gives "C:/a b.mp3").
pub fn file_url_to_path(url: &str) -> Option<String> {
    let rest = url.strip_prefix("file://")?;
    let slash = rest.find('/')?;
    let host = &rest[..slash];
    let path = percent_decode(&rest[slash..]);
    if !host.is_empty() && !host.eq_ignore_ascii_case("localhost") {
        return Some(format!("//{}{path}", percent_decode(host)));
    }
    let bytes = path.as_bytes();
    let drive =
        bytes.len() >= 3 && bytes[0] == b'/' && bytes[1].is_ascii_alphabetic() && bytes[2] == b':';
    Some(if drive { path[1..].to_owned() } else { path })
}

/// Why an Apple XML file cannot be read.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("The file is not an Apple Music or iTunes playlist export")]
pub struct NotApple;

fn text(dict: &plist::Dictionary, key: &str) -> Option<String> {
    dict.get(key)
        .and_then(Value::as_string)
        .map(str::to_owned)
        .filter(|text| !text.is_empty())
}

/// Apple XML into one source per user playlist (D22): playlists with a `Master` key or a
/// `Distinguished Kind` key are library-wide system lists and are left out.
pub fn apple_xml(bytes: &[u8]) -> Result<Vec<Source>, NotApple> {
    let value = Value::from_reader_xml(bytes).map_err(|_| NotApple)?;
    let root = value.as_dictionary().ok_or(NotApple)?;
    let tracks = root.get("Tracks").and_then(Value::as_dictionary);
    let playlists = root
        .get("Playlists")
        .and_then(Value::as_array)
        .ok_or(NotApple)?;
    let track = |id: u64| -> SourceEntry {
        let Some(dict) = tracks
            .and_then(|tracks| tracks.get(&id.to_string()))
            .and_then(Value::as_dictionary)
        else {
            return SourceEntry {
                title: Some(format!("Track {id}")),
                ..SourceEntry::default()
            };
        };
        SourceEntry {
            path: text(dict, "Location")
                .and_then(|url| file_url_to_path(&url))
                .unwrap_or_default(),
            info: None,
            title: text(dict, "Name"),
            artist: text(dict, "Artist"),
            album: text(dict, "Album"),
        }
    };
    Ok(playlists
        .iter()
        .filter_map(Value::as_dictionary)
        .filter(|playlist| {
            !playlist.contains_key("Master") && !playlist.contains_key("Distinguished Kind")
        })
        .map(|playlist| Source {
            name: text(playlist, "Name").unwrap_or_else(|| "Imported playlist".to_owned()),
            relative_entries: false,
            entries: playlist
                .get("Playlist Items")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(Value::as_dictionary)
                        .filter_map(|item| {
                            item.get("Track ID").and_then(Value::as_unsigned_integer)
                        })
                        .map(track)
                        .collect()
                })
                .unwrap_or_default(),
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// P12-AC4.
    #[test]
    fn a_windows_1252_m3u_decodes_e_acute() {
        assert_eq!(decode_m3u(b"Caf\xe9.mp3\n"), "Café.mp3\n");
        assert_eq!(
            decode_m3u("Café.mp3\n".as_bytes()),
            "Café.mp3\n",
            "UTF-8 first"
        );
        assert_eq!(decode_m3u(b"\xef\xbb\xbfa.mp3"), "a.mp3");
    }

    #[test]
    fn m3u_entries_take_artist_and_title_from_extinf() {
        let source = m3u(
            "Mix",
            "#EXTM3U\r\n#EXTINF:183,Björk - Joga\r\nC:\\Music\\Björk\\Joga.mp3\r\nplain.mp3\r\n",
        );
        assert_eq!(source.entries.len(), 2);
        assert_eq!(source.entries[0].artist.as_deref(), Some("Björk"));
        assert_eq!(source.entries[0].title.as_deref(), Some("Joga"));
        assert_eq!(source.entries[0].path, "C:\\Music\\Björk\\Joga.mp3");
        assert_eq!(source.entries[1].info, None);
    }

    #[test]
    fn file_urls_become_paths() {
        assert_eq!(
            file_url_to_path("file://localhost/C:/Users/Me/Music/A%20B/01%20Caf%C3%A9.mp3")
                .as_deref(),
            Some("C:/Users/Me/Music/A B/01 Café.mp3")
        );
        assert_eq!(
            file_url_to_path("file:///Users/me/Music/x%2Fy.mp3").as_deref(),
            Some("/Users/me/Music/x/y.mp3")
        );
        assert_eq!(
            file_url_to_path("file://nas/share/Music/a%20b.mp3").as_deref(),
            Some("//nas/share/Music/a b.mp3"),
            "a host other than localhost is a network share"
        );
        assert_eq!(file_url_to_path("https://example.com/a.mp3"), None);
    }

    #[test]
    fn only_two_hex_digits_after_a_percent_decode() {
        assert_eq!(percent_decode("a%+1b%2"), "a%+1b%2");
        assert_eq!(percent_decode("%zz%41"), "%zzA");
    }

    #[test]
    fn a_broken_xml_file_is_not_an_apple_export() {
        assert_eq!(apple_xml(b"<plist><dict>"), Err(NotApple));
        assert_eq!(
            apple_xml(b"<?xml version=\"1.0\"?><plist><array/></plist>"),
            Err(NotApple)
        );
    }
}
