//! Album art (P10.1, D27): where it comes from, its cache key, and the 96 px and 512 px JPEG
//! files in the thumbnail folder. No Tauri here (D1); the app runs it on worker threads.

use std::io::Cursor;
use std::path::{Path, PathBuf};

use image::codecs::jpeg::JpegEncoder;
use image::{DynamicImage, ImageReader};
use lofty::file::TaggedFileExt;
use lofty::picture::PictureType;

use crate::atomic::write_atomic;
use crate::library::{AlbumId, FileStamp, LibraryIndex};
use crate::scan::cover_rank;

/// Thumbnail sizes (D27): album rows and display art (Now playing, the OS panel).
pub const SIZES: [u32; 2] = [96, 512];
/// JPEG quality of thumbnails.
const THUMB_QUALITY: u8 = 85;
/// JPEG quality of a cover written by "Set cover" (P10.4).
pub const COVER_QUALITY: u8 = 90;

/// What decides an album's art: the album folder's cover files in rank order, and the
/// album's songs with an embedded picture (D44 flag) in album order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArtInput {
    /// The album folder relative to the music folder, when the songs are in one.
    pub folder: Option<String>,
    /// Cover files: absolute path and stamp, best rank first.
    pub covers: Vec<(PathBuf, FileStamp)>,
    /// Songs with an embedded picture: absolute path and stamp, in album order.
    pub pictured: Vec<(PathBuf, FileStamp)>,
}

/// The album folder of a track path ("Artist/Album/file.mp3"), or None for a song that is
/// not in an album folder.
pub fn album_folder(rel_path: &str) -> Option<String> {
    let parts: Vec<&str> = rel_path.split('/').collect();
    (parts.len() >= 3).then(|| format!("{}/{}", parts[0], parts[1]))
}

/// The size and modified time of a file, or None when it cannot be read.
pub fn stamp(path: &Path) -> Option<FileStamp> {
    let metadata = std::fs::metadata(path).ok()?;
    let modified_ms = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map_or(0, |since| since.as_millis().min(i64::MAX as u128) as i64);
    Some(FileStamp {
        size: metadata.len(),
        modified_ms,
    })
}

/// Cover files in `folder`, best first: names `cover`, `folder`, `front`, `albumart`, then
/// extensions `.jpg`, `.jpeg`, `.png`, compared without case (P10.1).
pub fn cover_files(folder: &Path) -> Vec<(PathBuf, FileStamp)> {
    let Ok(entries) = std::fs::read_dir(folder) else {
        return Vec::new();
    };
    let mut found: Vec<(usize, PathBuf, FileStamp)> = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let name = entry.file_name();
            let rank = cover_rank(name.to_str()?)?;
            let path = entry.path();
            path.is_file()
                .then(|| stamp(&path).map(|stamp| (rank, path, stamp)))
                .flatten()
        })
        .collect();
    found.sort_by_key(|(rank, _, _)| *rank);
    found
        .into_iter()
        .map(|(_, path, stamp)| (path, stamp))
        .collect()
}

/// What the index knows about an album's art: its folder and its songs with an embedded
/// picture. No file is read, so this runs under the library lock.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AlbumSources {
    pub folder: Option<String>,
    /// Songs with an embedded picture: path relative to the music folder and stamp.
    pub pictured: Vec<(String, FileStamp)>,
}

/// The art sources of an album from the index, or None for an unknown album.
pub fn album_sources(index: &LibraryIndex, album: AlbumId) -> Option<AlbumSources> {
    let ids = index
        .song_ids(
            crate::api::SongScope {
                artist: None,
                album: Some(album),
            },
            "",
            &[],
        )
        .ok()?;
    let tracks: Vec<_> = ids.iter().filter_map(|id| index.track(*id)).collect();
    let folder = tracks
        .first()
        .and_then(|track| album_folder(track.rel_path()));
    let pictured = tracks
        .iter()
        .filter(|track| track.data.has_picture)
        .map(|track| (track.rel_path().to_owned(), track.data.stamp))
        .collect();
    Some(AlbumSources { folder, pictured })
}

/// The art input: lists the album folder's cover files. Run it without the library lock.
pub fn album_input(root: &Path, sources: AlbumSources) -> ArtInput {
    let covers = sources
        .folder
        .as_ref()
        .map(|folder| cover_files(&root.join(folder)))
        .unwrap_or_default();
    ArtInput {
        covers,
        pictured: sources
            .pictured
            .into_iter()
            .map(|(rel_path, stamp)| (root.join(rel_path), stamp))
            .collect(),
        folder: sources.folder,
    }
}

/// FNV-1a, 64 bit: stable across builds, so cache names survive an update.
fn fnv(bytes: &[u8], mut hash: u64) -> u64 {
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0100_0000_01b3);
    }
    hash
}

/// The cache key (D27): the album folder relative to the music folder `root`, and the
/// relative path, size and modified time of each art source. Any change gives a new key, so
/// new art regenerates; a moved music folder keeps its keys.
pub fn cache_key(input: &ArtInput, root: &Path) -> String {
    let mut hash = fnv(
        input.folder.as_deref().unwrap_or("").as_bytes(),
        0xcbf2_9ce4_8422_2325,
    );
    for (path, stamp) in input.covers.iter().chain(&input.pictured) {
        let relative = path.strip_prefix(root).unwrap_or(path);
        hash = fnv(
            relative.to_string_lossy().replace('\\', "/").as_bytes(),
            hash,
        );
        hash = fnv(&stamp.size.to_le_bytes(), hash);
        hash = fnv(&stamp.modified_ms.to_le_bytes(), hash);
    }
    format!("{hash:016x}")
}

/// The thumbnail file name of a key and size: a plain `.jpg` name for the `thumb://` scheme
/// (D41).
pub fn thumb_name(key: &str, size: u32) -> String {
    format!("{key}-{size}.jpg")
}

fn decode(bytes: &[u8]) -> Option<DynamicImage> {
    ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .ok()?
        .decode()
        .ok()
}

/// The first picture in a file that decodes: of type front cover when `front`, else of any
/// type.
fn embedded(path: &Path, front: bool) -> Option<DynamicImage> {
    let file = lofty::read_from_path(path).ok()?;
    file.tags()
        .iter()
        .flat_map(|tag| tag.pictures())
        .filter(|picture| !front || picture.pic_type() == PictureType::CoverFront)
        .find_map(|picture| decode(picture.data()))
}

/// The album's art by the P10.1 order: the first cover file that decodes (a broken one is
/// logged and skipped), else the first embedded front cover that decodes, else the first
/// embedded picture of any type that decodes.
pub fn load(input: &ArtInput) -> Option<DynamicImage> {
    for (path, _) in &input.covers {
        // The content decides the format: a PNG named cover.jpg still decodes.
        let decoded = ImageReader::open(path)
            .and_then(|reader| reader.with_guessed_format())
            .map_err(image::ImageError::IoError)
            .and_then(|reader| reader.decode());
        match decoded {
            Ok(image) => return Some(image),
            Err(error) => log::warn!("art: cannot decode {}: {error}", path.display()),
        }
    }
    let paths = || input.pictured.iter().map(|(path, _)| path.as_path());
    paths()
        .find_map(|path| embedded(path, true))
        .or_else(|| paths().find_map(|path| embedded(path, false)))
}

/// JPEG bytes of `image` at `quality`.
pub fn jpeg(image: &DynamicImage, quality: u8) -> image::ImageResult<Vec<u8>> {
    let mut bytes = Vec::new();
    // JPEG has no alpha channel.
    image
        .to_rgb8()
        .write_with_encoder(JpegEncoder::new_with_quality(&mut bytes, quality))?;
    Ok(bytes)
}

/// Writes the 96 px and 512 px files of `image` for `key` into `folder` (D27). The image
/// keeps its aspect ratio inside the square.
pub fn write_thumbs(image: &DynamicImage, folder: &Path, key: &str) -> std::io::Result<()> {
    std::fs::create_dir_all(folder)?;
    for size in SIZES {
        let scaled = image.thumbnail(size, size);
        let bytes = jpeg(&scaled, THUMB_QUALITY).map_err(std::io::Error::other)?;
        write_atomic(&folder.join(thumb_name(key, size)), &bytes)?;
    }
    Ok(())
}

/// Removes every thumbnail file of `key`.
pub fn remove_thumbs(folder: &Path, key: &str) {
    for size in SIZES {
        let _ = std::fs::remove_file(folder.join(thumb_name(key, size)));
    }
}

/// The file name "Set cover" writes (P10.4).
pub const COVER_FILE: &str = "cover.jpg";

/// Why "Set cover" did not write (P10.4). The messages hold no path (D13).
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum CoverError {
    #[error("The picked file is not a JPEG or PNG image")]
    NotAnImage,
    #[error("The album folder is read-only")]
    ReadOnly,
    #[error("The cover cannot be written")]
    Write,
}

/// The picked image as `cover.jpg` bytes: decoded by content, converted to JPEG quality 90.
pub fn cover_jpeg(picked: &Path) -> Result<Vec<u8>, CoverError> {
    let image = ImageReader::open(picked)
        .and_then(|reader| reader.with_guessed_format())
        .map_err(|_| CoverError::NotAnImage)?
        .decode()
        .map_err(|_| CoverError::NotAnImage)?;
    jpeg(&image, COVER_QUALITY).map_err(|_| CoverError::NotAnImage)
}

/// Whether a file can be created in `folder`: a temp file is made and removed at once.
pub fn check_writable(folder: &Path) -> Result<(), CoverError> {
    tempfile::NamedTempFile::new_in(folder)
        .map(drop)
        .map_err(|_| CoverError::ReadOnly)
}

/// Files in `folder` named `cover.jpg` in any letter case.
pub fn existing_covers(folder: &Path) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(folder) else {
        return Vec::new();
    };
    entries
        .filter_map(Result::ok)
        .filter(|entry| {
            entry
                .file_name()
                .to_str()
                .is_some_and(|name| name.eq_ignore_ascii_case(COVER_FILE))
        })
        .map(|entry| entry.path())
        .collect()
}

/// Writes `cover.jpg` into `folder` atomically: a temp file, then a rename (D19). A cover
/// file in another letter case (`Cover.JPG`) goes after the rename, so the new one wins.
pub fn write_cover(folder: &Path, jpeg: &[u8]) -> Result<(), CoverError> {
    check_writable(folder)?;
    let target = folder.join(COVER_FILE);
    write_atomic(&target, jpeg).map_err(|error| {
        log::warn!("art: cannot write the cover: {error}");
        CoverError::Write
    })?;
    // Two entries exist only on a case-sensitive file system; with one entry, the old name
    // is the new file and stays.
    let covers = existing_covers(folder);
    for other in covers.iter().filter(|_| covers.len() > 1) {
        if other.file_name() != target.file_name() {
            if let Err(error) = std::fs::remove_file(other) {
                log::warn!("art: cannot remove {}: {error}", other.display());
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgb, RgbImage};
    use lofty::config::WriteOptions;
    use lofty::picture::{MimeType, Picture};
    use lofty::tag::{Tag, TagExt, TagType};

    fn png(color: [u8; 3]) -> Vec<u8> {
        let image = DynamicImage::ImageRgb8(RgbImage::from_pixel(8, 8, Rgb(color)));
        let mut bytes = Vec::new();
        image
            .write_to(&mut Cursor::new(&mut bytes), image::ImageFormat::Png)
            .unwrap();
        bytes
    }

    /// The color of the center pixel, to tell sources apart.
    fn color(image: &DynamicImage) -> [u8; 3] {
        image.to_rgb8().get_pixel(4, 4).0
    }

    fn seed(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/seed")
            .join(name)
    }

    /// An MP3 copy with an ID3v2 tag that holds `pictures`.
    fn song(
        folder: &Path,
        name: &str,
        pictures: &[(PictureType, Vec<u8>)],
    ) -> (PathBuf, FileStamp) {
        let path = folder.join(name);
        std::fs::copy(seed("tone.mp3"), &path).unwrap();
        let mut tag = Tag::new(TagType::Id3v2);
        for (kind, data) in pictures {
            tag.push_picture(
                Picture::unchecked(data.clone())
                    .pic_type(*kind)
                    .mime_type(MimeType::Png)
                    .build(),
            );
        }
        tag.save_to_path(&path, WriteOptions::default()).unwrap();
        if !pictures.is_empty() {
            assert!(!lofty::read_from_path(&path).unwrap().tags().is_empty());
        }
        (path.clone(), stamp(&path).unwrap())
    }

    const RED: [u8; 3] = [200, 0, 0];
    const GREEN: [u8; 3] = [0, 200, 0];
    const BLUE: [u8; 3] = [0, 0, 200];

    #[test]
    fn cover_files_rank_by_name_then_extension_without_case() {
        let dir = tempfile::tempdir().unwrap();
        for name in [
            "Folder.PNG",
            "cover.png",
            "COVER.JPG",
            "front.jpg",
            "other.jpg",
        ] {
            std::fs::write(dir.path().join(name), b"x").unwrap();
        }
        let names: Vec<String> = cover_files(dir.path())
            .iter()
            .map(|(path, _)| path.file_name().unwrap().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, ["COVER.JPG", "cover.png", "Folder.PNG", "front.jpg"]);
    }

    #[test]
    fn a_cover_file_beats_folder_png_and_embedded_art() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("cover.jpg"), png(RED)).unwrap();
        std::fs::write(dir.path().join("folder.png"), png(GREEN)).unwrap();
        let pictured = vec![song(
            dir.path(),
            "a.mp3",
            &[(PictureType::CoverFront, png(BLUE))],
        )];
        let input = ArtInput {
            folder: Some("A/B".into()),
            covers: cover_files(dir.path()),
            pictured,
        };
        assert_eq!(color(&load(&input).unwrap()), RED);
    }

    #[test]
    fn embedded_art_of_the_third_song_shows_when_it_is_the_only_art() {
        let dir = tempfile::tempdir().unwrap();
        let pictured = vec![
            song(dir.path(), "1.mp3", &[]),
            song(dir.path(), "2.mp3", &[]),
            song(
                dir.path(),
                "3.mp3",
                &[(PictureType::CoverFront, png(GREEN))],
            ),
            // A later song's art does not win: the first in album order does.
            song(dir.path(), "4.mp3", &[(PictureType::CoverFront, png(RED))]),
        ];
        let input = ArtInput {
            folder: Some("A/B".into()),
            covers: Vec::new(),
            pictured,
        };
        assert_eq!(color(&load(&input).unwrap()), GREEN);
    }

    #[test]
    fn a_front_cover_beats_an_earlier_picture_of_another_type() {
        let dir = tempfile::tempdir().unwrap();
        let pictured = vec![
            song(dir.path(), "1.mp3", &[(PictureType::Artist, png(RED))]),
            song(dir.path(), "2.mp3", &[(PictureType::CoverFront, png(BLUE))]),
        ];
        let input = ArtInput {
            folder: None,
            covers: Vec::new(),
            pictured: pictured.clone(),
        };
        assert_eq!(color(&load(&input).unwrap()), BLUE);
        let only_other = ArtInput {
            pictured: pictured[..1].to_vec(),
            ..input
        };
        assert_eq!(
            color(&load(&only_other).unwrap()),
            RED,
            "any type when no front cover"
        );
    }

    /// P10-AC2.
    #[test]
    fn a_broken_cover_file_is_skipped_for_embedded_art() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("cover.jpg"), b"\xff\xd8 not a jpeg").unwrap();
        let pictured = vec![song(
            dir.path(),
            "a.mp3",
            &[(PictureType::CoverFront, png(BLUE))],
        )];
        let input = ArtInput {
            folder: Some("A/B".into()),
            covers: cover_files(dir.path()),
            pictured,
        };
        assert_eq!(input.covers.len(), 1);
        assert_eq!(color(&load(&input).unwrap()), BLUE);
    }

    #[test]
    fn no_source_gives_no_art() {
        let input = ArtInput {
            folder: None,
            covers: Vec::new(),
            pictured: Vec::new(),
        };
        assert!(load(&input).is_none());
    }

    #[test]
    fn the_key_changes_with_a_source_stamp() {
        let input = ArtInput {
            folder: Some("A/B".into()),
            covers: vec![(PathBuf::from("/m/A/B/cover.jpg"), FileStamp::default())],
            pictured: Vec::new(),
        };
        let key = cache_key(&input, Path::new("/m"));
        assert_eq!(key.len(), 16);
        assert_eq!(key, cache_key(&input.clone(), Path::new("/m")), "stable");
        let mut changed = input.clone();
        changed.covers[0].1.size = 5;
        assert_ne!(cache_key(&changed, Path::new("/m")), key);
        // The same library in another place keeps its key.
        let mut moved = input.clone();
        moved.covers[0].0 = PathBuf::from("/other/A/B/cover.jpg");
        assert_eq!(cache_key(&moved, Path::new("/other")), key);
    }

    #[test]
    fn thumbs_are_jpeg_files_of_96_and_512_px() {
        let dir = tempfile::tempdir().unwrap();
        let image = DynamicImage::ImageRgb8(RgbImage::from_pixel(1000, 500, Rgb(RED)));
        write_thumbs(&image, dir.path(), "abc").unwrap();
        for size in SIZES {
            let thumb = image::open(dir.path().join(thumb_name("abc", size))).unwrap();
            assert_eq!(thumb.width(), size);
            assert_eq!(thumb.height(), size / 2);
        }
        remove_thumbs(dir.path(), "abc");
        assert!(std::fs::read_dir(dir.path()).unwrap().next().is_none());
    }

    #[test]
    fn album_folders_come_from_the_first_two_path_parts() {
        assert_eq!(album_folder("A/B/c.mp3").as_deref(), Some("A/B"));
        assert_eq!(album_folder("A/B/CD1/c.mp3").as_deref(), Some("A/B"));
        assert_eq!(album_folder("A/c.mp3"), None);
    }

    /// P10-AC5 (conversion).
    #[test]
    fn set_cover_writes_a_png_as_a_jpeg_cover() {
        let dir = tempfile::tempdir().unwrap();
        let picked = dir.path().join("picked.png");
        std::fs::write(&picked, png(GREEN)).unwrap();
        let bytes = cover_jpeg(&picked).unwrap();
        write_cover(dir.path(), &bytes).unwrap();
        let written = std::fs::read(dir.path().join(COVER_FILE)).unwrap();
        assert_eq!(
            image::guess_format(&written).unwrap(),
            image::ImageFormat::Jpeg
        );
        let pixel = color(&image::load_from_memory(&written).unwrap());
        assert!(pixel[1] > 150 && pixel[0] < 50, "{pixel:?}");
    }

    #[test]
    fn set_cover_refuses_a_file_that_is_not_an_image() {
        let dir = tempfile::tempdir().unwrap();
        let picked = dir.path().join("notes.png");
        std::fs::write(&picked, b"text").unwrap();
        assert_eq!(cover_jpeg(&picked), Err(CoverError::NotAnImage));
    }

    /// P10-AC5 (read-only). Root can write anywhere, so the check runs only for other users.
    #[cfg(unix)]
    #[test]
    fn set_cover_in_a_read_only_folder_writes_nothing() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path().join("album");
        std::fs::create_dir(&folder).unwrap();
        std::fs::set_permissions(&folder, std::fs::Permissions::from_mode(0o555)).unwrap();
        if tempfile::NamedTempFile::new_in(&folder).is_ok() {
            eprintln!("skipped: this user can write a read-only folder (root)");
            return;
        }
        assert_eq!(write_cover(&folder, b"jpeg"), Err(CoverError::ReadOnly));
        assert!(std::fs::read_dir(&folder).unwrap().next().is_none());
        std::fs::set_permissions(&folder, std::fs::Permissions::from_mode(0o755)).unwrap();
    }

    #[test]
    fn set_cover_replaces_a_cover_in_another_letter_case() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("Cover.JPG"), png(RED)).unwrap();
        assert_eq!(existing_covers(dir.path()).len(), 1);
        write_cover(
            dir.path(),
            &jpeg(
                &DynamicImage::ImageRgb8(RgbImage::from_pixel(8, 8, Rgb(GREEN))),
                90,
            )
            .unwrap(),
        )
        .unwrap();
        let names: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        // On a case-insensitive file system both names are one file.
        assert_eq!(names.len(), 1, "{names:?}");
        let cover = cover_files(dir.path());
        let shown = load(&ArtInput {
            folder: None,
            covers: cover,
            pictured: Vec::new(),
        })
        .unwrap();
        assert!(color(&shown)[1] > 150, "the new cover shows");
    }
}
