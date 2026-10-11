//! Generates a test music library from the seed files (plan P4.12). Test data only.
//!
//! Usage: `cargo run -p clawdio-core --example gen_test_library -- <dir> --tracks N`
//!
//! Each artist folder holds 5 albums of 10 songs. Files are copies of the seed tones with
//! title, artist, album and track number tags.

use std::path::{Path, PathBuf};

use lofty::config::WriteOptions;
use lofty::prelude::*;
use lofty::tag::Tag;

const SEEDS: [&str; 3] = ["tone.mp3", "tone-vorbis.ogg", "tone-pcm16.wav"];
const SONGS_PER_ALBUM: usize = 10;
const ALBUMS_PER_ARTIST: usize = 5;

fn seed_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/seed")
}

fn write_tags(
    path: &Path,
    title: &str,
    artist: &str,
    album: &str,
    track: u32,
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
    tag.save_to_path(path, WriteOptions::default())
        .map_err(|error| error.to_string())
}

/// Writes `tracks` songs under `root`. Returns the number written.
pub fn generate(root: &Path, tracks: usize) -> std::io::Result<usize> {
    let mut written = 0;
    let mut artist = 0;
    while written < tracks {
        let artist_name = format!("Artist {artist:04}");
        for album in 0..ALBUMS_PER_ARTIST {
            let album_name = format!("Album {album} of {artist:04}");
            let folder = root.join(&artist_name).join(&album_name);
            std::fs::create_dir_all(&folder)?;
            for song in 1..=SONGS_PER_ALBUM {
                if written >= tracks {
                    return Ok(written);
                }
                let seed = SEEDS[written % SEEDS.len()];
                let extension = Path::new(seed)
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("mp3");
                let title = format!("Song {song} of {album_name}");
                let path = folder.join(format!("{song:02} {title}.{extension}"));
                std::fs::copy(seed_dir().join(seed), &path)?;
                write_tags(&path, &title, &artist_name, &album_name, song as u32)
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
        eprintln!("usage: gen_test_library <dir> --tracks N");
        std::process::exit(2);
    };
    let tracks = args
        .iter()
        .position(|arg| arg == "--tracks")
        .and_then(|index| args.get(index + 1))
        .and_then(|value| value.parse().ok())
        .unwrap_or(100);
    match generate(Path::new(root), tracks) {
        Ok(written) => println!("wrote {written} tracks to {root}"),
        Err(error) => {
            eprintln!("gen_test_library: {error}");
            std::process::exit(1);
        }
    }
}
