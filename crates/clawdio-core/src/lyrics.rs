//! Local lyrics (P13, R9): `<base name>.lrc` next to the song, else `<base name>.txt`, else
//! embedded lyrics. Files are read as UTF-8 with a Windows-1252 fallback (D26).

use std::path::Path;

use lofty::config::ParseOptions;
use lofty::file::TaggedFileExt;
use lofty::probe::Probe;
use lofty::tag::ItemKey;

use crate::api::Lyrics;
use crate::import::parse::decode_m3u;

/// LRC tag lines that hold no lyrics (P13.2).
const LRC_TAGS: [&str; 9] = ["ar", "ti", "al", "au", "by", "length", "offset", "re", "ve"];

/// The lyrics of the song at `path`, or None when no source has lyrics. A source that cannot
/// be read, or holds only blank lines (an empty file, a `.lrc` of tag lines), is skipped.
pub fn load(path: &Path) -> Option<Lyrics> {
    read_file(&path.with_extension("lrc"))
        .map(|text| clean_lrc(&text))
        .filter(|text| !text.trim().is_empty())
        .or_else(|| read_file(&path.with_extension("txt")).filter(|text| !text.trim().is_empty()))
        .or_else(|| embedded(path))
        .map(|text| Lyrics { text })
}

fn read_file(path: &Path) -> Option<String> {
    match std::fs::read(path) {
        Ok(bytes) => Some(decode_m3u(&bytes)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => {
            log::warn!("lyrics: cannot read {}: {error}", path.display());
            None
        }
    }
}

/// Embedded unsynced lyrics: ID3v2 USLT, Vorbis `LYRICS` or `UNSYNCEDLYRICS`. Empty text is
/// no lyrics.
fn embedded(path: &Path) -> Option<String> {
    // Lyrics need no pictures.
    let options = ParseOptions::new().read_cover_art(false);
    let file = Probe::open(path)
        .and_then(|probe| probe.options(options).read())
        .inspect_err(|error| log::warn!("lyrics: cannot read tags of {}: {error}", path.display()))
        .ok()?;
    file.tags().iter().find_map(|tag| {
        [ItemKey::UnsyncLyrics, ItemKey::Lyrics]
            .iter()
            .filter_map(|key| tag.get_string(*key))
            .find(|text| !text.trim().is_empty())
            .map(str::to_owned)
    })
}

/// The length of one leading time stamp: `[m:ss]` with 1 to 3 minute digits, and an optional
/// fraction of 1 to 3 digits after `.` or `:`.
fn stamp_len(line: &str) -> Option<usize> {
    let bytes = line.as_bytes();
    let digits = |from: usize, max: usize| {
        bytes[from..]
            .iter()
            .take(max + 1)
            .take_while(|byte| byte.is_ascii_digit())
            .count()
    };
    if bytes.first() != Some(&b'[') {
        return None;
    }
    let minutes = digits(1, 3);
    if !(1..=3).contains(&minutes) || bytes.get(1 + minutes) != Some(&b':') {
        return None;
    }
    let mut at = 2 + minutes;
    if digits(at, 2) != 2 {
        return None;
    }
    at += 2;
    if matches!(bytes.get(at), Some(b'.' | b':')) {
        let fraction = digits(at + 1, 3);
        if !(1..=3).contains(&fraction) {
            return None;
        }
        at += 1 + fraction;
    }
    (bytes.get(at) == Some(&b']')).then_some(at + 1)
}

/// True for a whole-line LRC tag such as `[ar: Artist]`.
fn is_tag_line(line: &str) -> bool {
    let Some(inner) = line
        .trim()
        .strip_prefix('[')
        .and_then(|rest| rest.strip_suffix(']'))
    else {
        return false;
    };
    inner.split_once(':').is_some_and(|(key, _)| {
        LRC_TAGS
            .iter()
            .any(|tag| tag.eq_ignore_ascii_case(key.trim()))
    })
}

/// LRC text for display (P13.2): each leading time stamp goes, tag lines go, the line order
/// and blank lines stay.
pub fn clean_lrc(text: &str) -> String {
    let mut lines = Vec::new();
    for line in text.lines() {
        let line = line.trim_end_matches('\r');
        if is_tag_line(line) {
            continue;
        }
        let mut rest = line;
        while let Some(len) = stamp_len(rest) {
            rest = rest[len..].trim_start();
        }
        lines.push(rest);
    }
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use lofty::config::WriteOptions;
    use lofty::file::AudioFile;
    use lofty::ogg::tag::VorbisComments;
    use lofty::tag::{Tag, TagExt, TagType};
    use std::path::PathBuf;

    /// A copy of a seed file in `folder`.
    fn song(folder: &Path, seed: &str, name: &str) -> PathBuf {
        let path = folder.join(name);
        let source = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/seed")
            .join(seed);
        std::fs::copy(source, &path).unwrap();
        path
    }

    /// An MP3 copy whose ID3v2 tag holds a USLT frame.
    fn mp3_with_uslt(folder: &Path, text: &str) -> PathBuf {
        let path = song(folder, "tone.mp3", "01 Song.mp3");
        let mut tag = Tag::new(TagType::Id3v2);
        tag.insert_text(ItemKey::UnsyncLyrics, text.into());
        tag.save_to_path(&path, WriteOptions::default()).unwrap();
        let file = lofty::mpeg::MpegFile::read_from(
            &mut std::fs::File::open(&path).unwrap(),
            lofty::config::ParseOptions::new(),
        )
        .unwrap();
        let frames = file.id3v2().map(|tag| tag.unsync_text().count());
        assert_eq!(frames, Some(1), "the tag holds a USLT frame");
        path
    }

    fn text(path: &Path) -> Option<String> {
        load(path).map(|lyrics| lyrics.text)
    }

    /// P13-AC1.
    #[test]
    fn lrc_beats_txt_beats_embedded() {
        let folder = tempfile::tempdir().unwrap();
        let path = mp3_with_uslt(folder.path(), "embedded");
        assert_eq!(text(&path).as_deref(), Some("embedded"));
        std::fs::write(folder.path().join("01 Song.txt"), "plain").unwrap();
        assert_eq!(text(&path).as_deref(), Some("plain"));
        std::fs::write(folder.path().join("01 Song.lrc"), "[00:01.00]timed").unwrap();
        assert_eq!(text(&path).as_deref(), Some("timed"));
        std::fs::remove_file(folder.path().join("01 Song.lrc")).unwrap();
        assert_eq!(text(&path).as_deref(), Some("plain"));
    }

    /// P13-AC3 (AC-21).
    #[test]
    fn an_mp3_with_uslt_and_no_file_shows_the_embedded_lyrics() {
        let folder = tempfile::tempdir().unwrap();
        let path = mp3_with_uslt(folder.path(), "Line one\nLine two");
        assert_eq!(text(&path).as_deref(), Some("Line one\nLine two"));
    }

    /// P13-AC4.
    #[test]
    fn ogg_lyrics_and_unsyncedlyrics_show() {
        let folder = tempfile::tempdir().unwrap();
        for (index, key) in ["LYRICS", "UNSYNCEDLYRICS"].into_iter().enumerate() {
            let path = song(folder.path(), "tone-vorbis.ogg", &format!("{index}.ogg"));
            let mut comments = VorbisComments::default();
            comments.push(key.into(), format!("from {key}"));
            comments
                .save_to_path(&path, WriteOptions::default())
                .unwrap();
            assert_eq!(text(&path), Some(format!("from {key}")), "{key}");
        }
    }

    #[test]
    fn no_source_and_empty_embedded_text_are_none() {
        let folder = tempfile::tempdir().unwrap();
        let plain = song(folder.path(), "tone.mp3", "plain.mp3");
        assert_eq!(load(&plain), None);
        let empty = mp3_with_uslt(folder.path(), "  ");
        assert_eq!(load(&empty), None);
    }

    /// An empty file or a `.lrc` of tag lines holds no lyrics: the next source shows.
    #[test]
    fn a_source_with_only_blank_text_gives_way_to_the_next() {
        let folder = tempfile::tempdir().unwrap();
        let path = mp3_with_uslt(folder.path(), "embedded");
        std::fs::write(folder.path().join("01 Song.txt"), " \n").unwrap();
        std::fs::write(folder.path().join("01 Song.lrc"), "[ar:X]\n[AR:Y]\n").unwrap();
        assert_eq!(text(&path).as_deref(), Some("embedded"));
        std::fs::write(folder.path().join("01 Song.txt"), "plain").unwrap();
        assert_eq!(text(&path).as_deref(), Some("plain"));
        let bare = song(folder.path(), "tone.mp3", "bare.mp3");
        std::fs::write(folder.path().join("bare.lrc"), "").unwrap();
        assert_eq!(load(&bare), None, "Fetch lyrics shows");
    }

    /// D26: UTF-8 with a BOM, else Windows-1252.
    #[test]
    fn lyrics_files_decode_utf8_or_windows_1252() {
        let folder = tempfile::tempdir().unwrap();
        let path = song(folder.path(), "tone.mp3", "a.mp3");
        std::fs::write(folder.path().join("a.txt"), b"\xef\xbb\xbfCaf\xc3\xa9").unwrap();
        assert_eq!(text(&path).as_deref(), Some("Café"));
        std::fs::write(folder.path().join("a.txt"), b"\x93Caf\xe9\x94 \x80").unwrap();
        assert_eq!(text(&path).as_deref(), Some("\u{201c}Café\u{201d} €"));
    }

    #[test]
    fn stamps_in_every_form_go() {
        let text = "[01:02]a\n[01:02.3]b\n[01:02.34]c\n[01:02.345]d\n[01:02:34]e\n\
                    [123:45.67] f\n[00:01.00][00:30.00]g\n[00:01.00]日本 é";
        assert_eq!(clean_lrc(text), "a\nb\nc\nd\ne\nf\ng\n日本 é");
    }

    #[test]
    fn tag_lines_go_and_blank_lines_and_order_stay() {
        let text = "[ar: Artist]\r\n[ti:Title]\r\n[al:Album]\r\n[au:Writer]\r\n[by:Me]\r\n\
                    [length: 03:20]\r\n[offset:+100]\r\n[re:Tool]\r\n[ve:1.0]\r\n\
                    [00:01.00]one\r\n\r\n[00:05.00]\r\n[00:09.00]two\r\n";
        assert_eq!(clean_lrc(text), "one\n\n\ntwo");
    }

    #[test]
    fn text_that_only_looks_like_a_stamp_stays() {
        let text = "[1234:00]a\n[01:2]b\n[01:02.1234]c\n[chorus]\n[x:y] text";
        assert_eq!(clean_lrc(text), text);
    }
}
