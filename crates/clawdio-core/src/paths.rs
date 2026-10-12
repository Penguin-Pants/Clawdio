//! Data folders and the music folder path rule (R18, R18.1, D47).

use std::path::{Component, Path, PathBuf};

/// Name of the portable-mode marker file next to the executable (R18.1).
pub const PORTABLE_MARKER: &str = "portable";

/// The four per-machine folders (section 6.8).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DataDirs {
    pub config: PathBuf,
    pub cache: PathBuf,
    pub logs: PathBuf,
    /// WebView profile. `None` keeps the engine default (normal mode).
    pub webview: Option<PathBuf>,
    pub portable: bool,
}

impl DataDirs {
    /// Portable mode: every folder under `<base>/data/` (R18.1).
    pub fn portable(base: &Path) -> Self {
        let data = base.join("data");
        DataDirs {
            config: data.join("config"),
            cache: data.join("cache"),
            logs: data.join("logs"),
            webview: Some(data.join("webview")),
            portable: true,
        }
    }

    /// Normal mode: the OS folders from the Tauri path resolver.
    pub fn normal(config: PathBuf, cache: PathBuf, logs: PathBuf) -> Self {
        DataDirs {
            config,
            cache,
            logs,
            webview: None,
            portable: false,
        }
    }

    /// The thumbnail folder in the cache folder (D27).
    pub fn thumbs(&self) -> PathBuf {
        self.cache.join("thumbs")
    }
}

/// The folder that counts as "next to the executable": the folder of the AppImage file when
/// `appimage` is set (Linux, D47), else the folder of the executable.
pub fn base_dir(executable: &Path, appimage: Option<&Path>) -> Option<PathBuf> {
    appimage
        .unwrap_or(executable)
        .parent()
        .map(Path::to_path_buf)
}

/// Portable mode is on when the marker file exists in the base folder (R18.1).
pub fn is_portable(base: &Path) -> bool {
    base.join(PORTABLE_MARKER).is_file()
}

/// True when both paths are on the same volume: the same drive or UNC share on Windows, the
/// same device on Linux.
pub fn same_volume(a: &Path, b: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        match (std::fs::metadata(a), std::fs::metadata(b)) {
            (Ok(x), Ok(y)) => x.dev() == y.dev(),
            _ => false,
        }
    }
    #[cfg(windows)]
    {
        let prefix = |path: &Path| match path.components().next() {
            Some(Component::Prefix(prefix)) => Some(prefix.as_os_str().to_ascii_lowercase()),
            _ => None,
        };
        prefix(a).is_some() && prefix(a) == prefix(b)
    }
}

/// The relative path from `base` to `target`, both absolute. `None` when no relative form
/// exists (different roots).
pub fn relative_to(target: &Path, base: &Path) -> Option<PathBuf> {
    let target: Vec<Component> = target.components().collect();
    let base: Vec<Component> = base.components().collect();
    match (target.first(), base.first()) {
        (Some(a), Some(b)) if same_component(a, b) => {}
        _ => return None,
    }
    let common = target
        .iter()
        .zip(&base)
        .take_while(|(a, b)| same_component(a, b))
        .count();
    let mut relative = PathBuf::new();
    for _ in common..base.len() {
        relative.push("..");
    }
    for part in &target[common..] {
        relative.push(part.as_os_str());
    }
    Some(if relative.as_os_str().is_empty() {
        PathBuf::from(".")
    } else {
        relative
    })
}

/// Windows paths ignore letter case (`c:` and `C:` are one drive); Linux paths do not.
fn same_component(a: &Component, b: &Component) -> bool {
    if cfg!(windows) {
        a.as_os_str().eq_ignore_ascii_case(b.as_os_str())
    } else {
        a == b
    }
}

/// How the music folder is stored in `settings.json`. In portable mode a folder on the same
/// volume as the base folder is stored relative to it; otherwise the path is stored as set
/// (R18.1, R27).
pub fn store_music_path(music: &Path, base: &Path, portable: bool) -> String {
    if portable && same_volume(music, base) {
        if let Some(relative) = relative_to(music, base) {
            return relative.to_string_lossy().into_owned();
        }
    }
    music.to_string_lossy().into_owned()
}

/// The absolute music folder from its stored form. A relative path resolves against the base
/// folder, so a portable copy on another drive letter keeps working (AC-17).
pub fn resolve_music_path(stored: &str, base: &Path) -> PathBuf {
    let path = PathBuf::from(stored);
    if path.is_absolute() {
        path
    } else {
        base.join(path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("paths-{name}-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn portable_dirs_live_under_data() {
        let dirs = DataDirs::portable(Path::new("/apps/player"));
        assert_eq!(dirs.config, Path::new("/apps/player/data/config"));
        assert_eq!(dirs.cache, Path::new("/apps/player/data/cache"));
        assert_eq!(dirs.logs, Path::new("/apps/player/data/logs"));
        assert_eq!(
            dirs.webview.as_deref(),
            Some(Path::new("/apps/player/data/webview"))
        );
        assert_eq!(dirs.thumbs(), Path::new("/apps/player/data/cache/thumbs"));
        assert!(dirs.portable);
    }

    #[test]
    fn the_appimage_file_sets_the_base_folder() {
        let exe = Path::new("/tmp/.mount_abc/usr/bin/app");
        assert_eq!(
            base_dir(exe, None).unwrap(),
            Path::new("/tmp/.mount_abc/usr/bin")
        );
        let appimage = Path::new("/home/me/Apps/Player.AppImage");
        assert_eq!(
            base_dir(exe, Some(appimage)).unwrap(),
            Path::new("/home/me/Apps")
        );
    }

    #[test]
    fn the_marker_file_turns_portable_mode_on() {
        let base = temp("marker");
        assert!(!is_portable(&base));
        std::fs::write(base.join(PORTABLE_MARKER), "").unwrap();
        assert!(is_portable(&base));
        std::fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn relative_paths_walk_up_and_down() {
        // Compare paths, not text: the separator differs per system.
        let rel = |a: &str, b: &str| relative_to(Path::new(a), Path::new(b));
        let path = |parts: &[&str]| Some(parts.iter().collect::<PathBuf>());
        assert_eq!(rel("/a/b/music", "/a/b"), path(&["music"]));
        assert_eq!(rel("/a/music", "/a/b/app"), path(&["..", "..", "music"]));
        assert_eq!(rel("/a/b", "/a/b"), path(&["."]));
    }

    #[cfg(windows)]
    #[test]
    fn windows_roots_and_folders_match_without_letter_case() {
        let rel = |a: &str, b: &str| relative_to(Path::new(a), Path::new(b));
        assert_eq!(
            rel(r"c:\Media\Music", r"C:\media\App"),
            Some(PathBuf::from(r"..\Music"))
        );
        assert_eq!(
            rel(r"\\nas\Share\Music", r"\\NAS\share\App"),
            Some(PathBuf::from(r"..\Music"))
        );
        assert_eq!(rel(r"D:\Music", r"C:\App"), None);
    }

    #[test]
    fn portable_mode_stores_a_same_volume_folder_relative_and_resolves_it() {
        let base = temp("store");
        let music = base.join("Music");
        std::fs::create_dir_all(&music).unwrap();
        let stored = store_music_path(&music, &base, true);
        assert_eq!(stored, "Music");
        assert_eq!(resolve_music_path(&stored, &base), base.join("Music"));
        let moved = temp("moved");
        assert_eq!(resolve_music_path(&stored, &moved), moved.join("Music"));
        std::fs::remove_dir_all(base).unwrap();
        std::fs::remove_dir_all(moved).unwrap();
    }

    #[test]
    fn normal_mode_stores_the_path_as_set() {
        let base = temp("normal");
        let music = base.join("Music");
        std::fs::create_dir_all(&music).unwrap();
        assert_eq!(
            store_music_path(&music, &base, false),
            music.to_string_lossy()
        );
        assert_eq!(
            resolve_music_path(&music.to_string_lossy(), Path::new("/other")),
            music
        );
        std::fs::remove_dir_all(base).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn a_folder_on_another_device_stays_absolute() {
        let base = temp("device");
        // /proc is a separate file system from the temp folder.
        assert_eq!(store_music_path(Path::new("/proc"), &base, true), "/proc");
        std::fs::remove_dir_all(base).unwrap();
    }
}
