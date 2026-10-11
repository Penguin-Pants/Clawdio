//! The `thumb://` scheme (D41, owner decision October 11, 2026): the webview loads album
//! thumbnails by file name. Rust resolves the name inside the thumbnail folder, so IPC carries
//! names, never paths (D13).

use std::path::Path;

use tauri::http::{header, Response, StatusCode};

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
}
