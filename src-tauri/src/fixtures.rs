//! Milestone 0 test data (P3.1, D35). Built only with the `fixtures` feature, which is an
//! approved exception to "mock data only in tests" (C19). P6.7 deletes this module.

use std::fs;
use std::path::Path;

use clawdio_core::api::{
    Lyrics, PlayerSnapshot, PlayerStatus, PlaylistEntry, PlaylistRow, QueueSnapshot,
};
use clawdio_core::library::{LibraryIndex, NewTrack};
use image::{ImageBuffer, Rgb};

use crate::state::Widgets;

pub const ARTISTS: u32 = 1_000;
pub const ALBUMS_PER_ARTIST: u32 = 5;
pub const SONGS_PER_ALBUM: u32 = 10;
pub const THUMBNAILS: u32 = 2_000;
const THUMB_SIZE: u32 = 96;

const WORDS: [&str; 16] = [
    "Ångström",
    "Beyoncé",
    "Café",
    "Dvořák",
    "Élan",
    "Fjäll",
    "Größe",
    "Hôtel",
    "Ícaro",
    "Jalapeño",
    "Kø",
    "Łódź",
    "Mötley",
    "Naïve",
    "Øresund",
    "Smörgås",
];
const NOUNS: [&str; 8] = [
    "Lights", "Rivers", "Engines", "Echoes", "Signals", "Gardens", "Machines", "Tides",
];

/// Fills the index with 1,000 artists, 5,000 albums and 50,000 songs with deterministic names.
pub fn fill_library(index: &mut LibraryIndex) {
    for a in 0..ARTISTS {
        let artist = format!(
            "{} {} {a:04}",
            WORDS[a as usize % WORDS.len()],
            NOUNS[a as usize % NOUNS.len()]
        );
        for b in 0..ALBUMS_PER_ARTIST {
            let album = format!(
                "{} {} Vol. {}",
                NOUNS[(a + b) as usize % NOUNS.len()],
                1970 + (a + b) % 50,
                b + 1
            );
            for s in 1..=SONGS_PER_ALBUM {
                let title = format!(
                    "{} Nº {s} ({})",
                    WORDS[(a * 7 + s) as usize % WORDS.len()],
                    a * 50 + b * 10 + s
                );
                index.insert(NewTrack {
                    rel_path: format!("{artist}/{album}/{s:02} {title}.mp3"),
                    artist: artist.clone(),
                    album: album.clone(),
                    tag_artist: (s == 3).then(|| format!("{artist} feat. Guest")),
                    title,
                    track_no: Some(s),
                    disc: 0,
                    duration_ms: 120_000 + (a * 13 + b * 7 + s * 11) % 240 * 1_000,
                });
            }
        }
    }
}

/// Writes up to 2,000 album thumbnails (96 px JPEG, generated colors and numbers) and links
/// them to the first 2,000 albums. Existing files are reused.
pub fn write_thumbnails(index: &mut LibraryIndex, folder: &Path) -> std::io::Result<()> {
    fs::create_dir_all(folder)?;
    for album in 0..THUMBNAILS.min(index.album_count() as u32) {
        let name = format!("fixture-{album:04}.jpg");
        let path = folder.join(&name);
        if !path.exists() {
            thumbnail(album)
                .save(&path)
                .map_err(|error| std::io::Error::other(error.to_string()))?;
        }
        index.set_album_thumb(album, Some(name));
    }
    Ok(())
}

/// A colored square with the album number in seven-segment digits.
fn thumbnail(number: u32) -> ImageBuffer<Rgb<u8>, Vec<u8>> {
    let hue = (number * 47 % 360) as f32;
    let (r, g, b) = hsv(hue, 0.45, 0.55);
    let mut image = ImageBuffer::from_pixel(THUMB_SIZE, THUMB_SIZE, Rgb([r, g, b]));
    let digits: Vec<u32> = format!("{number:04}")
        .chars()
        .filter_map(|c| c.to_digit(10))
        .collect();
    for (position, digit) in digits.iter().enumerate() {
        draw_digit(&mut image, 12 + position as u32 * 19, 34, *digit);
    }
    image
}

/// Segments a to g of each digit.
const SEGMENTS: [u8; 10] = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];

fn draw_digit(image: &mut ImageBuffer<Rgb<u8>, Vec<u8>>, x: u32, y: u32, digit: u32) {
    let bars = [
        (2, 0, 10, 3),
        (12, 2, 3, 12),
        (12, 16, 3, 12),
        (2, 27, 10, 3),
        (0, 16, 3, 12),
        (0, 2, 3, 12),
        (2, 13, 10, 3),
    ];
    for (index, (dx, dy, w, h)) in bars.iter().enumerate() {
        if SEGMENTS[digit as usize] & (1 << index) == 0 {
            continue;
        }
        for px in x + dx..x + dx + w {
            for py in y + dy..y + dy + h {
                image.put_pixel(px, py, Rgb([237, 237, 237]));
            }
        }
    }
}

fn hsv(hue: f32, saturation: f32, value: f32) -> (u8, u8, u8) {
    let c = value * saturation;
    let x = c * (1.0 - ((hue / 60.0) % 2.0 - 1.0).abs());
    let m = value - c;
    let (r, g, b) = match hue as u32 / 60 {
        0 => (c, x, 0.0),
        1 => (x, c, 0.0),
        2 => (0.0, c, x),
        3 => (0.0, x, c),
        4 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };
    let channel = |v: f32| ((v + m) * 255.0).round() as u8;
    (channel(r), channel(g), channel(b))
}

/// Queue (500 entries) with the player paused at 1:23.
pub fn queue() -> (QueueSnapshot, PlayerSnapshot) {
    let entries: Vec<u32> = (0..500)
        .map(|i| i * 97 % (ARTISTS * ALBUMS_PER_ARTIST * SONGS_PER_ALBUM))
        .collect();
    (
        QueueSnapshot {
            entries,
            current: Some(3),
        },
        PlayerSnapshot {
            status: PlayerStatus::Paused,
            position_ms: 83_000,
            volume: 80,
        },
    )
}

/// 20 playlists of 30 entries and 60 lyric lines.
pub fn widgets() -> Widgets {
    let playlists = (0..20)
        .map(|p| {
            let entries: Vec<PlaylistEntry> = (0..30)
                .map(|e| {
                    if e % 15 == 14 {
                        PlaylistEntry {
                            track: None,
                            label: format!("../Missing/Song {p}-{e}.mp3"),
                        }
                    } else {
                        PlaylistEntry {
                            track: Some((p * 1_000 + e * 31) % 50_000),
                            label: String::new(),
                        }
                    }
                })
                .collect();
            let row = PlaylistRow {
                id: p,
                name: format!("{} mix {}", NOUNS[p as usize % NOUNS.len()], p + 1),
                entry_count: entries.len() as u32,
            };
            (row, entries)
        })
        .collect();
    let lyrics = (1..=60)
        .map(|line| {
            format!(
                "Line {line}: {} over the {}",
                WORDS[line % WORDS.len()],
                NOUNS[line % NOUNS.len()].to_lowercase()
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    Widgets {
        playlists,
        lyrics: Some(Lyrics { text: lyrics }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fills_the_milestone_0_library() {
        let mut index = LibraryIndex::new();
        fill_library(&mut index);
        assert_eq!(index.len(), 50_000);
        assert_eq!(index.album_count(), 5_000);
        assert_eq!(index.artist_ids("").len(), 1_000);
        assert!(
            index.artist_ids("angstrom").len() > 10,
            "accented names fold for search"
        );
    }

    #[test]
    fn writes_2000_thumbnails() {
        let folder = std::env::temp_dir().join(format!("fixture-thumbs-{}", std::process::id()));
        let mut index = LibraryIndex::new();
        fill_library(&mut index);
        write_thumbnails(&mut index, &folder).unwrap();
        let files = fs::read_dir(&folder).unwrap().count();
        assert_eq!(files, 2_000);
        let albums = index
            .album_rows(&index.album_ids(None, "").unwrap())
            .unwrap();
        assert_eq!(
            albums.iter().filter(|album| album.thumb.is_some()).count(),
            2_000
        );
        let image = image::open(folder.join("fixture-0001.jpg")).unwrap();
        assert_eq!((image.width(), image.height()), (96, 96));
        fs::remove_dir_all(folder).unwrap();
    }

    #[test]
    fn fills_every_widget() {
        let widgets = widgets();
        assert_eq!(queue().0.entries.len(), 500);
        assert_eq!(widgets.playlists.len(), 20);
        assert!(widgets
            .playlists
            .iter()
            .all(|(row, entries)| row.entry_count == 30 && entries.len() == 30));
        assert_eq!(widgets.lyrics.unwrap().text.lines().count(), 60);
    }
}
