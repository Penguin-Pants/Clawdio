//! Tauri app: window, commands, audio output and media controls (D1).

mod commands;
mod events;
mod jobs;
#[cfg(target_os = "linux")]
mod linux_memory;
mod media_controls;
mod online;
mod persist;
mod player;
mod state;
mod thumbs;
#[cfg(windows)]
mod webview2_keys;
mod window;

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use clawdio_core::paths::{base_dir, is_portable, resolve_music_path, DataDirs};
use clawdio_core::settings::load_or_default;
use tauri::{AppHandle, Manager};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

use events::AppEvents;
use player::output::RodioOutput;
use player::{PlayerHandle, Resolve};
use state::{AppState, Library, MusicRoot};
use thumbs::ArtService;

/// Log file size before rotation, and rotated files kept (D40).
const LOG_FILE_BYTES: u128 = 1_000_000;
const LOG_FILES_KEPT: usize = 5;

/// The base folder for portable mode (R18.1, D47) and the data folders.
fn data_dirs(app: &AppHandle) -> tauri::Result<(DataDirs, PathBuf)> {
    let executable = std::env::current_exe()?;
    let appimage = std::env::var_os("APPIMAGE").map(PathBuf::from);
    let base = base_dir(
        &executable,
        if cfg!(target_os = "linux") {
            appimage.as_deref()
        } else {
            None
        },
    )
    .ok_or_else(|| std::io::Error::other("the executable has no folder"))?;
    let dirs = if is_portable(&base) {
        DataDirs::portable(&base)
    } else {
        let paths = app.path();
        DataDirs::normal(
            paths.app_config_dir()?,
            paths.app_cache_dir()?,
            paths.app_log_dir()?,
        )
    };
    Ok((dirs, base))
}

/// The log setup: `app.log` in `folder`, rotated at `max_bytes`, five old files kept (R23).
fn log_builder(folder: &Path, max_bytes: u128) -> tauri_plugin_log::Builder {
    tauri_plugin_log::Builder::new()
        .clear_targets()
        .target(Target::new(TargetKind::Folder {
            path: folder.to_path_buf(),
            file_name: Some("app".into()),
        }))
        .target(Target::new(TargetKind::Stdout))
        .max_file_size(max_bytes)
        .rotation_strategy(RotationStrategy::KeepSome(LOG_FILES_KEPT))
        .level(log::LevelFilter::Info)
}

/// Builds and runs the app until it quits.
pub fn run() -> tauri::Result<()> {
    #[cfg(target_os = "linux")]
    linux_memory::configure();
    tauri::Builder::default()
        // First plugin (P9.5): a second launch focuses the first window and exits.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            window::bring_to_front(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // Thumbnails load by name from the thumbnail folder only (D41, D13).
        .register_uri_scheme_protocol(thumbs::SCHEME, |ctx, request| {
            let service = ctx.app_handle().state::<ArtService>();
            thumbs::respond(service.folder(), request.uri().path())
        })
        .setup(|app| {
            let (dirs, base) = data_dirs(app.handle())?;
            app.handle()
                .plugin(log_builder(&dirs.logs, LOG_FILE_BYTES).build())?;
            let settings = load_or_default(&dirs.config);
            let root = settings
                .music_folder
                .as_deref()
                .map(|stored| resolve_music_path(stored, &base));
            let thumbs = dirs.thumbs();
            let library = Library::default();
            let music_root = MusicRoot(Arc::new(std::sync::RwLock::new(root.clone())));

            let resolve: Resolve = {
                let index = library.0.clone();
                let root = music_root.0.clone();
                Arc::new(move |id| {
                    let index = index.read().ok()?;
                    let root = root.read().ok()?;
                    Some(root.as_ref()?.join(index.rel_path(id)?))
                })
            };
            let (player, _thread) = PlayerHandle::spawn(
                RodioOutput::default,
                AppEvents::new(app.handle().clone()),
                resolve,
            );

            // The saved queue waits for the library; the saver starts now (P9.1).
            app.manage(persist::StateStore::load(dirs.config.clone()));
            persist::StateStore::spawn_saver(app.handle().clone());
            // Online lookups (P14): the gate follows the stored switch.
            if let Some(gate) = online::gate(app.handle(), settings.online_lookups) {
                app.manage(online::Online::new(gate));
            }
            app.manage(AppState {
                dirs,
                base,
                settings: Mutex::new(settings),
                scan_cancel: Mutex::new(None),
            });
            app.manage(library);
            app.manage(music_root);
            app.manage(ArtService::new(thumbs));
            app.manage(media_controls::Publisher::default());
            ArtService::spawn_workers(app.handle());
            app.manage(state::LyricsState::default());
            app.manage(commands::metadata::MetadataFills::default());
            app.manage(state::Playlists::default());
            app.manage(player);
            let window = window::create_main(app.handle())?;
            // Media keys and the OS now-playing panel (P8). A failure is logged only.
            media_controls::attach(app.handle(), &window);

            // Startup sync of the stored folder (R2). A missing folder leaves the cache alone
            // (D30).
            if let Some(root) = root.filter(|path| path.is_dir()) {
                jobs::start_scan(app.handle(), root, jobs::ScanKind::Startup);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::layout::layout_load,
            commands::layout::layout_save,
            commands::library::library_artists,
            commands::library::library_artist_rows,
            commands::library::library_albums,
            commands::library::library_album_rows,
            commands::library::library_song_ids,
            commands::library::library_rows,
            commands::library::library_tree,
            commands::art::album_art,
            commands::art::set_cover,
            commands::art::album_retry_lookup,
            commands::metadata::metadata_preview,
            commands::metadata::metadata_apply,
            commands::player::player_play_list,
            commands::player::player_play,
            commands::player::player_pause,
            commands::player::player_toggle,
            commands::player::player_stop,
            commands::player::player_next,
            commands::player::player_previous,
            commands::player::player_seek,
            commands::player::player_set_volume,
            commands::player::player_set_shuffle,
            commands::player::player_set_repeat,
            commands::player::queue_append,
            commands::player::queue_remove,
            commands::player::queue_clear,
            commands::player::queue_get,
            commands::player::player_state,
            commands::settings::settings_get,
            commands::settings::set_online_lookups,
            commands::settings::first_run_notice_done,
            commands::settings::choose_music_folder,
            commands::settings::rescan,
            commands::settings::cancel_job,
            commands::settings::open_log_folder,
            commands::settings::open_notice,
            commands::playlists::playlists_list,
            commands::playlists::playlist_entries,
            commands::playlists::playlist_name_check,
            commands::playlists::playlist_create,
            commands::playlists::playlist_add,
            commands::playlists::playlist_remove_entry,
            commands::playlists::playlist_delete,
            commands::playlists::favorite_toggle,
            commands::playlists::favorites,
            commands::playlists::playlist_import,
            commands::lyrics::lyrics_get,
            commands::lyrics::lyrics_fetch,
            commands::measure::measure_mode,
            commands::measure::measure_ready,
            commands::measure::scan_running,
            commands::measure::perf_mode,
        ])
        .build(tauri::generate_context!())?
        .run(|app, event| {
            // Stop the audio thread before the process ends.
            if let tauri::RunEvent::Exit = event {
                // Queue and volume commands sent just before the close reach the state first.
                app.state::<PlayerHandle>()
                    .sync(std::time::Duration::from_secs(1));
                app.state::<persist::StateStore>().flush(app);
                media_controls::detach();
                app.state::<ArtService>().stop();
                app.state::<PlayerHandle>().send(player::Command::Shutdown);
            }
        });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn log_files(folder: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(folder)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    fn write_record(logger: &dyn log::Log, message: &str) {
        logger.log(
            &log::Record::builder()
                .level(log::Level::Info)
                .target("test")
                .args(format_args!("{message}"))
                .build(),
        );
        logger.flush();
    }

    #[test]
    fn the_log_rotates_at_the_limit_and_keeps_five_old_files() {
        let folder = tempfile::tempdir().unwrap();
        for day in 1..=7 {
            fs::write(
                folder
                    .path()
                    .join(format!("app_2026-01-0{day}_00-00-00.log")),
                "old",
            )
            .unwrap();
        }
        fs::write(folder.path().join("app.log"), "x".repeat(300)).unwrap();

        let app = tauri::test::mock_app();
        let (_plugin, _level, logger) =
            log_builder(folder.path(), 200).split(app.handle()).unwrap();

        // The full file rotates on start. The three oldest files go.
        let names = log_files(folder.path());
        assert_eq!(names.len(), LOG_FILES_KEPT + 1, "{names:?}");
        assert!(!names.contains(&"app_2026-01-03_00-00-00.log".to_string()));
        assert!(names.contains(&"app_2026-01-04_00-00-00.log".to_string()));
        assert_eq!(
            fs::metadata(folder.path().join("app.log")).unwrap().len(),
            0
        );

        // A record that goes over the limit starts a new file. Rotated names have one-second precision.
        write_record(logger.as_ref(), &"a".repeat(150));
        std::thread::sleep(std::time::Duration::from_millis(1100));
        write_record(logger.as_ref(), "b");
        let names = log_files(folder.path());
        assert_eq!(names.len(), LOG_FILES_KEPT + 1, "{names:?}");
        assert!(!names.contains(&"app_2026-01-04_00-00-00.log".to_string()));
        let current = fs::read_to_string(folder.path().join("app.log")).unwrap();
        assert!(
            current.contains('b') && !current.contains("aaa"),
            "{current}"
        );
    }
}
