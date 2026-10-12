//! Album art files (P10.2, D27) and the `thumb://` scheme (D41, owner decision October 11,
//! 2026): two worker threads make the 96 px and 512 px JPEG files on request, and the webview
//! loads them by file name. Rust resolves the name inside the thumbnail folder, so IPC carries
//! names, never paths (D13).

use std::collections::{HashSet, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::{Condvar, Mutex};

use clawdio_core::artwork::{self, ArtInput};
use clawdio_core::library::AlbumId;
use tauri::http::{header, Response, StatusCode};
use tauri::{AppHandle, Manager, Runtime};

use crate::events::{emit, ART_READY};
use crate::state::{Library, MusicRoot};

/// Worker threads that make art files (P10.2).
const WORKERS: usize = 2;
/// Most waiting requests. The newest go first; the oldest drop (they scrolled away).
const QUEUE_LIMIT: usize = 512;

#[derive(Default)]
struct Queue {
    albums: VecDeque<AlbumId>,
    stop: bool,
}

/// The art files of the session: the request queue and the keys known to have no art.
pub struct ArtService {
    folder: PathBuf,
    queue: Mutex<Queue>,
    wake: Condvar,
    /// Cache keys with no art source that decodes, so they are not tried again.
    no_art: Mutex<HashSet<String>>,
}

impl ArtService {
    pub fn new(folder: PathBuf) -> Self {
        ArtService {
            folder,
            queue: Mutex::default(),
            wake: Condvar::new(),
            no_art: Mutex::default(),
        }
    }

    pub fn folder(&self) -> &Path {
        &self.folder
    }

    /// The album's art input and key, or None for an unknown album or no music folder. The
    /// library lock covers the index read only; the folder listing runs after it.
    pub fn input<R: Runtime>(app: &AppHandle<R>, album: AlbumId) -> Option<(ArtInput, String)> {
        let root = app.state::<MusicRoot>().0.read().ok()?.clone()?;
        let sources = {
            let library = app.state::<Library>();
            let index = library.0.read().ok()?;
            artwork::album_sources(&index, album)?
        };
        let input = artwork::album_input(&root, sources);
        let key = artwork::cache_key(&input, &root);
        Some((input, key))
    }

    /// The art file name of an album at `size` (96 or 512) when it exists. Else the album
    /// joins the request queue and `art-ready` follows when the file is made (P10.2).
    pub fn file<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        album: AlbumId,
        size: u32,
    ) -> Option<String> {
        let (_, key) = Self::input(app, album)?;
        let name = artwork::thumb_name(&key, size);
        if self.folder.join(&name).is_file() {
            return Some(name);
        }
        if !self.no_art.lock().ok()?.contains(&key) {
            self.request(album);
        }
        None
    }

    /// The absolute 512 px file of an album for the OS panel (P10.5), when it exists.
    pub fn display_path<R: Runtime>(&self, app: &AppHandle<R>, album: AlbumId) -> Option<PathBuf> {
        self.file(app, album, 512)
            .map(|name| self.folder.join(name))
    }

    fn request(&self, album: AlbumId) {
        let Ok(mut queue) = self.queue.lock() else {
            return;
        };
        if let Some(at) = queue.albums.iter().position(|id| *id == album) {
            queue.albums.remove(at);
        }
        queue.albums.push_front(album);
        queue.albums.truncate(QUEUE_LIMIT);
        self.wake.notify_one();
    }

    /// Makes the files of one album, or records that it has none.
    fn make<R: Runtime>(&self, app: &AppHandle<R>, album: AlbumId) {
        let Some((input, key)) = Self::input(app, album) else {
            return;
        };
        let all_made = artwork::SIZES
            .iter()
            .all(|size| self.folder.join(artwork::thumb_name(&key, *size)).is_file());
        if all_made {
            emit(app, ART_READY, album);
            crate::media_controls::art_ready(app, album);
            return;
        }
        match artwork::load(&input) {
            Some(image) => match artwork::write_thumbs(&image, &self.folder, &key) {
                Ok(()) => {
                    emit(app, ART_READY, album);
                    crate::media_controls::art_ready(app, album);
                }
                Err(error) => log::warn!("art: cannot write thumbnails: {error}"),
            },
            None => {
                if let Ok(mut no_art) = self.no_art.lock() {
                    no_art.insert(key);
                }
            }
        }
    }

    /// Forgets an album's files and its no-art mark, then makes them again (Set cover).
    pub fn refresh<R: Runtime>(&self, app: &AppHandle<R>, album: AlbumId, old_key: Option<&str>) {
        if let Some(key) = old_key {
            artwork::remove_thumbs(&self.folder, key);
            if let Ok(mut no_art) = self.no_art.lock() {
                no_art.remove(key);
            }
        }
        if let Some((_, key)) = Self::input(app, album) {
            if let Ok(mut no_art) = self.no_art.lock() {
                no_art.remove(&key);
            }
        }
        self.request(album);
    }

    /// Starts the worker threads.
    pub fn spawn_workers<R: Runtime>(app: &AppHandle<R>) {
        for number in 0..WORKERS {
            let app = app.clone();
            let spawned = std::thread::Builder::new()
                .name(format!("art-{number}"))
                .spawn(move || loop {
                    let service = app.state::<ArtService>();
                    let album = {
                        let Ok(mut queue) = service.queue.lock() else {
                            return;
                        };
                        loop {
                            if queue.stop {
                                return;
                            }
                            if let Some(album) = queue.albums.pop_front() {
                                break album;
                            }
                            queue = match service.wake.wait(queue) {
                                Ok(queue) => queue,
                                Err(_) => return,
                            };
                        }
                    };
                    service.make(&app, album);
                });
            if let Err(error) = spawned {
                log::warn!("art: cannot start a worker: {error}");
            }
        }
    }

    /// Stops the workers after their current album (app exit).
    pub fn stop(&self) {
        if let Ok(mut queue) = self.queue.lock() {
            queue.stop = true;
            self.wake.notify_all();
        }
    }
}

/// The URI scheme name.
pub const SCHEME: &str = "thumb";

/// The thumbnail file name in a request path (`/<name>`). Only a plain JPEG file name passes:
/// ASCII letters, digits, "-", "_" and one ".jpg" extension. No separator, no "..".
pub fn requested_name(path: &str) -> Option<&str> {
    let name = path.strip_prefix('/')?;
    let stem = name.strip_suffix(".jpg")?;
    let plain = !stem.is_empty()
        && stem
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    plain.then_some(name)
}

/// The response for a request path: the JPEG from `folder`, or 404 for any other path.
pub fn respond(folder: &Path, path: &str) -> Response<Vec<u8>> {
    let file = requested_name(path).and_then(|name| std::fs::read(folder.join(name)).ok());
    let builder = Response::builder();
    let response = match file {
        Some(bytes) => builder
            .header(header::CONTENT_TYPE, "image/jpeg")
            .header(header::CACHE_CONTROL, "max-age=3600")
            .body(bytes),
        None => builder.status(StatusCode::NOT_FOUND).body(Vec::new()),
    };
    response.unwrap_or_else(|_| Response::new(Vec::new()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_plain_jpeg_names_only() {
        assert_eq!(
            requested_name("/fixture-0001.jpg"),
            Some("fixture-0001.jpg")
        );
        assert_eq!(requested_name("/a_B-9.jpg"), Some("a_B-9.jpg"));
        for path in [
            "fixture-0001.jpg",
            "/../secret.jpg",
            "/a/b.jpg",
            "/a%2Fb.jpg",
            "/a\\b.jpg",
            "/.jpg",
            "/a.jpeg",
            "/a.jpg.png",
            "/C:x.jpg",
        ] {
            assert_eq!(requested_name(path), None, "{path}");
        }
    }

    #[test]
    fn serves_a_thumbnail_and_refuses_everything_else() {
        let root = tempfile::tempdir().unwrap();
        let folder = root.path().join("thumbs");
        std::fs::create_dir_all(&folder).unwrap();
        std::fs::write(folder.join("x.jpg"), b"jpeg").unwrap();
        std::fs::write(root.path().join("outside.jpg"), b"no").unwrap();
        let ok = respond(&folder, "/x.jpg");
        assert_eq!(ok.status(), StatusCode::OK);
        assert_eq!(ok.headers()[header::CONTENT_TYPE], "image/jpeg");
        assert_eq!(ok.body(), b"jpeg");
        assert_eq!(
            respond(&folder, "/missing.jpg").status(),
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            respond(&folder, "/../outside.jpg").status(),
            StatusCode::NOT_FOUND
        );
    }

    mod service {
        use std::sync::{Arc, RwLock};

        use clawdio_core::library::{FileStamp, LibraryIndex, NewTrack};
        use tauri::test::{mock_app, MockRuntime};

        use super::super::*;

        fn track(rel_path: &str) -> NewTrack {
            NewTrack {
                rel_path: rel_path.into(),
                artist: "Artist".into(),
                album: "Album".into(),
                subfolder: None,
                title: rel_path.into(),
                tag_artist: None,
                track_no: None,
                disc: None,
                duration_ms: 1000,
                stamp: FileStamp::default(),
                has_picture: false,
            }
        }

        /// One album in "Artist/Album" under `music`, with a cover file when `cover`.
        fn app(music: &Path, thumbs: &Path, cover: bool) -> tauri::App<MockRuntime> {
            let folder = music.join("Artist/Album");
            std::fs::create_dir_all(&folder).unwrap();
            if cover {
                // Any JPEG works as a cover; the e2e thumbnail is one.
                let jpeg = Path::new(env!("CARGO_MANIFEST_DIR"))
                    .join("../tests/e2e/public/thumb/album.jpg");
                std::fs::copy(jpeg, folder.join("cover.jpg")).unwrap();
            }
            let mut index = LibraryIndex::default();
            index.insert(track("Artist/Album/a.mp3"));
            let app = mock_app();
            app.manage(Library(Arc::new(RwLock::new(index))));
            app.manage(MusicRoot(Arc::new(RwLock::new(Some(music.to_path_buf())))));
            app.manage(ArtService::new(thumbs.to_path_buf()));
            app
        }

        /// P10-AC3: the files go to the thumbnail folder in the cache, and come back after a
        /// delete.
        #[test]
        fn art_files_are_made_on_request_and_again_after_a_delete() {
            let (music, cache) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
            let thumbs = cache.path().join("thumbs");
            let app = app(music.path(), &thumbs, true);
            let service = app.state::<ArtService>();
            assert_eq!(service.file(app.handle(), 0, 96), None, "requested");
            assert_eq!(service.queue.lock().unwrap().albums, [0]);
            service.make(app.handle(), 0);
            let name = service.file(app.handle(), 0, 96).unwrap();
            assert!(thumbs.join(&name).is_file());
            assert!(service.display_path(app.handle(), 0).unwrap().is_file());
            std::fs::remove_dir_all(&thumbs).unwrap();
            assert_eq!(service.file(app.handle(), 0, 96), None);
            service.make(app.handle(), 0);
            assert_eq!(service.file(app.handle(), 0, 96), Some(name));
        }

        #[test]
        fn an_album_without_art_is_not_requested_again() {
            let (music, cache) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
            let app = app(music.path(), &cache.path().join("thumbs"), false);
            let service = app.state::<ArtService>();
            assert_eq!(service.file(app.handle(), 0, 96), None);
            service.queue.lock().unwrap().albums.clear();
            service.make(app.handle(), 0);
            assert_eq!(service.file(app.handle(), 0, 512), None);
            assert!(service.queue.lock().unwrap().albums.is_empty());
        }

        #[test]
        fn the_newest_request_goes_first() {
            let service = ArtService::new(PathBuf::from("unused"));
            service.request(1);
            service.request(2);
            service.request(1);
            assert_eq!(service.queue.lock().unwrap().albums, [1, 2]);
        }
    }
}
