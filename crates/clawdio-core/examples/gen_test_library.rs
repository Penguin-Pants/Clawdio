//! Generates a test music library from the seed files (plan P4.12). Test data only.
//!
//! Usage: `cargo run -p clawdio-core --example gen_test_library -- <dir> --tracks N
//! [--edge-cases] [--covers N]`
//!
//! Each artist folder holds 5 albums of 10 songs. Files are copies of the seed tones with
//! title, artist, album and track number tags. `--edge-cases` (P5.13) puts one P5.11 edge-case
//! file into 1 percent of the albums and splits 1 percent into two discs. `--covers N` writes a
//! generated `cover.jpg` into the first N albums.

use std::path::{Path, PathBuf};

use lofty::config::WriteOptions;
use lofty::prelude::*;
use lofty::tag::Tag;

const SEEDS: [&str; 3] = ["tone.mp3", "tone-vorbis.ogg", "tone-pcm16.wav"];
/// The P5.11 edge-case seeds, written without tags.
const EDGE_SEEDS: [&str; 7] = [
    "tone-opus.ogg",
    "tone-float.wav",
    "tone-adpcm.wav",
    "tone-alaw.wav",
    "corrupt.mp3",
    "truncated.mp3",
    "damaged.ogg",
];
const SONGS_PER_ALBUM: usize = 10;
const ALBUMS_PER_ARTIST: usize = 5;

fn seed_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/seed")
}

/// What to generate.
#[derive(Debug, Default, Clone, Copy)]
pub struct Options {
    pub tracks: usize,
    pub edge_cases: bool,
    pub covers: usize,
}

fn write_tags(
    path: &Path,
    title: &str,
    artist: &str,
    album: &str,
    track: u32,
    disc: Option<u32>,
) -> Result<(), String> {
    let mut file = lofty::read_from_path(path).map_err(|error| error.to_string())?;
    let tag_type = file.primary_tag_type();
    if file.primary_tag().is_none() {
        file.insert_tag(Tag::new(tag_type));
    }
    let Some(tag) = file.primary_tag_mut() else {
        return Ok(());
    };
    tag.set_title(title.to_owned());
    tag.set_artist(artist.to_owned());
    tag.set_album(album.to_owned());
    tag.set_track(track);
    if let Some(disc) = disc {
        tag.set_disk(disc);
    }
    tag.save_to_path(path, WriteOptions::default())
        .map_err(|error| error.to_string())
}

/// A generated 64 px JPEG cover.
fn write_cover(path: &Path, number: usize) -> std::io::Result<()> {
    let shade = (number * 37 % 200) as u8 + 30;
    image::RgbImage::from_pixel(64, 64, image::Rgb([shade, 60, 255 - shade]))
        .save_with_format(path, image::ImageFormat::Jpeg)
        .map_err(std::io::Error::other)
}

/// Writes `tracks` songs under `root`. Returns the number written.
pub fn generate(root: &Path, tracks: usize) -> std::io::Result<usize> {
    generate_with(
        root,
        Options {
            tracks,
            ..Options::default()
        },
    )
}

/// Writes the songs, edge cases and covers that `options` asks for. Returns the songs written.
pub fn generate_with(root: &Path, options: Options) -> std::io::Result<usize> {
    let mut written = 0;
    let mut artist = 0;
    let mut albums = 0;
    let mut edge = 0;
    while written < options.tracks {
        let artist_name = format!("Artist {artist:04}");
        for album in 0..ALBUMS_PER_ARTIST {
            let album_name = format!("Album {album} of {artist:04}");
            let folder = root.join(&artist_name).join(&album_name);
            std::fs::create_dir_all(&folder)?;
            if albums < options.covers {
                write_cover(&folder.join("cover.jpg"), albums)?;
            }
            let edge_album = options.edge_cases && albums % 100 == 0;
            let two_discs = options.edge_cases && albums % 100 == 50;
            albums += 1;
            for song in 1..=SONGS_PER_ALBUM {
                if written >= options.tracks {
                    return Ok(written);
                }
                let title = format!("Song {song} of {album_name}");
                if edge_album && song == SONGS_PER_ALBUM {
                    let seed = EDGE_SEEDS[edge % EDGE_SEEDS.len()];
                    edge += 1;
                    std::fs::copy(
                        seed_dir().join(seed),
                        folder.join(format!("{song:02} {seed}")),
                    )?;
                    written += 1;
                    continue;
                }
                let (song_folder, disc, track) = if two_discs {
                    let disc = if song <= SONGS_PER_ALBUM / 2 { 1 } else { 2 };
                    let track = song - (disc - 1) * SONGS_PER_ALBUM / 2;
                    (
                        folder.join(format!("Disc {disc}")),
                        Some(disc as u32),
                        track,
                    )
                } else {
                    (folder.clone(), None, song)
                };
                std::fs::create_dir_all(&song_folder)?;
                let seed = SEEDS[written % SEEDS.len()];
                let extension = Path::new(seed)
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("mp3");
                let path = song_folder.join(format!("{track:02} {title}.{extension}"));
                std::fs::copy(seed_dir().join(seed), &path)?;
                write_tags(&path, &title, &artist_name, &album_name, track as u32, disc)
                    .map_err(std::io::Error::other)?;
                written += 1;
            }
        }
        artist += 1;
    }
    Ok(written)
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let Some(root) = args.first() else {
        eprintln!("usage: gen_test_library <dir> --tracks N [--edge-cases] [--covers N]");
        std::process::exit(2);
    };
    let number = |flag: &str, default: usize| {
        args.iter()
            .position(|arg| arg == flag)
            .and_then(|index| args.get(index + 1))
            .and_then(|value| value.parse().ok())
            .unwrap_or(default)
    };
    let options = Options {
        tracks: number("--tracks", 100),
        edge_cases: args.iter().any(|arg| arg == "--edge-cases"),
        covers: number("--covers", 0),
    };
    match generate_with(Path::new(root), options) {
        Ok(written) => println!("wrote {written} tracks to {root}"),
        Err(error) => {
            eprintln!("gen_test_library: {error}");
            std::process::exit(1);
        }
    }
}
