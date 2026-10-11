//! Fixture tree (P5.12): a temp music folder with the R1 to R4 cases. `build` makes the part
//! that works on every system; `add_unix_extras` adds links, case-different folders and a name
//! that is not valid UTF-8; `add_long_path` adds a path over 260 characters (Windows).

use std::path::{Path, PathBuf};

use lofty::config::WriteOptions;
use lofty::picture::{MimeType, Picture, PictureType};
use lofty::prelude::*;
use lofty::tag::Tag;

pub fn seed(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/seed")
        .join(name)
}

/// Tags to write into a copied seed file.
#[derive(Default, Clone, Copy)]
pub struct Tags<'a> {
    pub title: Option<&'a str>,
    pub track: Option<u32>,
    pub disc: Option<u32>,
    pub artist: Option<&'a str>,
    pub picture: bool,
}

/// Copies a seed file to `root/rel` and writes `tags` (no tag is written when all are empty).
pub fn put(root: &Path, rel: &str, seed_name: &str, tags: Tags<'_>) -> PathBuf {
    let path = root.join(rel);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::copy(seed(seed_name), &path).unwrap();
    let empty = tags.title.is_none()
        && tags.track.is_none()
        && tags.disc.is_none()
        && tags.artist.is_none()
        && !tags.picture;
    if !empty {
        let mut file = lofty::read_from_path(&path).unwrap();
        let tag_type = file.primary_tag_type();
        if file.primary_tag().is_none() {
            file.insert_tag(Tag::new(tag_type));
        }
        let tag = file.primary_tag_mut().unwrap();
        if let Some(title) = tags.title {
            tag.set_title(title.to_owned());
        }
        if let Some(track) = tags.track {
            tag.set_track(track);
        }
        if let Some(disc) = tags.disc {
            tag.set_disk(disc);
        }
        if let Some(artist) = tags.artist {
            tag.set_artist(artist.to_owned());
        }
        if tags.picture {
            tag.push_picture(
                Picture::unchecked(png_bytes())
                    .pic_type(PictureType::CoverFront)
                    .mime_type(MimeType::Png)
                    .build(),
            );
        }
        tag.save_to_path(&path, WriteOptions::default()).unwrap();
    }
    path
}

/// A valid 1 x 1 PNG.
pub fn png_bytes() -> Vec<u8> {
    let mut bytes = Vec::new();
    image::DynamicImage::new_rgb8(1, 1)
        .write_to(
            &mut std::io::Cursor::new(&mut bytes),
            image::ImageFormat::Png,
        )
        .unwrap();
    bytes
}

fn titled(title: &str, track: u32) -> Tags<'_> {
    Tags {
        title: Some(title),
        track: Some(track),
        ..Tags::default()
    }
}

/// Builds the tree that works on every system.
pub fn build(root: &Path) {
    // Two-disc album with disc tags. The folder names would order the discs the other way.
    for (rel, title, track, disc) in [
        ("Pink Floyd/The Wall/Side A/01.mp3", "Hey You", 1, 2),
        (
            "Pink Floyd/The Wall/Side A/02.mp3",
            "Is There Anybody Out There",
            2,
            2,
        ),
        ("Pink Floyd/The Wall/Side B/02.mp3", "The Thin Ice", 2, 1),
        ("Pink Floyd/The Wall/Side B/01.mp3", "In the Flesh", 1, 1),
    ] {
        put(
            root,
            rel,
            "tone.mp3",
            Tags {
                title: Some(title),
                track: Some(track),
                disc: Some(disc),
                ..Tags::default()
            },
        );
    }
    // Two-disc album without disc tags: natural order of the sub-folders (2 before 10).
    for (rel, title, track) in [
        ("Pink Floyd/Ummagumma/Disc 10/01.ogg", "Sysyphus", 1),
        (
            "Pink Floyd/Ummagumma/Disc 2/02.ogg",
            "Careful with That Axe",
            2,
        ),
        ("Pink Floyd/Ummagumma/Disc 2/01.ogg", "Astronomy Domine", 1),
    ] {
        put(root, rel, "tone-vorbis.ogg", titled(title, track));
    }
    // An artist-level file and a root file.
    put(
        root,
        "Pink Floyd/Loose Single.wav",
        "tone-pcm16.wav",
        Tags::default(),
    );
    put(root, "Root Song.mp3", "tone.mp3", Tags::default());
    // Hidden folders and a hidden file.
    put(
        root,
        ".hidden/Album/Secret.mp3",
        "tone.mp3",
        Tags::default(),
    );
    put(
        root,
        "Pink Floyd/.private/Secret.mp3",
        "tone.mp3",
        Tags::default(),
    );
    put(
        root,
        "Pink Floyd/The Wall/.Secret.mp3",
        "tone.mp3",
        Tags::default(),
    );
    // Accented and non-Latin names.
    put(
        root,
        "Björk/Début/01 Human Behaviour.ogg",
        "tone-vorbis.ogg",
        Tags::default(),
    );
    put(
        root,
        "坂本龍一/音楽図鑑/02 チベタン・ダンス.wav",
        "tone-float.wav",
        Tags::default(),
    );
    // Every R4 prefix example, and a name that keeps its number. No tags.
    for name in [
        "01 - Dash.mp3",
        "02. Dot.mp3",
        "1-03 Disc Dash.mp3",
        "004_Underscore.mp3",
        "1984.mp3",
    ] {
        put(
            root,
            &format!("Prefixes/Examples/{name}"),
            "tone.mp3",
            Tags::default(),
        );
    }
    // WAV encodings and skipped files.
    put(
        root,
        "Formats/Wav/01 Float.wav",
        "tone-float.wav",
        Tags::default(),
    );
    put(
        root,
        "Formats/Wav/02 Adpcm.wav",
        "tone-adpcm.wav",
        Tags::default(),
    );
    put(
        root,
        "Formats/Skipped/opus.ogg",
        "tone-opus.ogg",
        Tags::default(),
    );
    put(
        root,
        "Formats/Skipped/alaw.wav",
        "tone-alaw.wav",
        Tags::default(),
    );
    put(
        root,
        "Formats/Skipped/corrupt.mp3",
        "corrupt.mp3",
        Tags::default(),
    );
    put(
        root,
        "Formats/Skipped/mp3 inside.wav",
        "tone.mp3",
        Tags::default(),
    );
    std::fs::write(root.join("Formats/Skipped/notes.txt"), "not audio").unwrap();
    // Tag and folder disagree: the folder wins (R3).
    put(
        root,
        "Pink Floyd/Animals/01 Dogs.mp3",
        "tone.mp3",
        Tags {
            title: Some("Dogs"),
            track: Some(1),
            artist: Some("Roger Waters"),
            ..Tags::default()
        },
    );
}

/// Links, a link loop, case-different folders and a name that is not valid UTF-8 (Linux).
#[cfg(unix)]
pub fn add_unix_extras(root: &Path, outside: &Path) {
    use std::os::unix::ffi::OsStrExt;
    use std::os::unix::fs::symlink;
    // A folder link loop: never entered.
    symlink(root, root.join("Pink Floyd/Loop")).unwrap();
    // A link to an audio file outside the tree: scanned like a file.
    let target = put(outside, "linked.mp3", "tone.mp3", titled("Linked", 1));
    std::fs::create_dir_all(root.join("Links/Album")).unwrap();
    symlink(&target, root.join("Links/Album/linked.mp3")).unwrap();
    // Case-different folders are two artists.
    put(root, "case/Album/01 Lower.mp3", "tone.mp3", Tags::default());
    put(root, "Case/Album/01 Upper.mp3", "tone.mp3", Tags::default());
    // A name that is not valid UTF-8: skipped and logged.
    let name = std::ffi::OsStr::from_bytes(b"bad \xff name.mp3");
    std::fs::copy(seed("tone.mp3"), root.join("Links/Album").join(name)).unwrap();
}

/// A song whose path is over 260 characters (Windows, R2 edge case).
pub fn add_long_path(root: &Path) -> String {
    let folder = "a".repeat(100);
    let rel = format!("Long/Album/{folder}/{folder}/Long Song.mp3");
    put(root, &rel, "tone.mp3", titled("Long Song", 1));
    rel
}
