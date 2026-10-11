//! Tauri app: window, commands, audio output and media controls (D1).

mod commands;
#[cfg(feature = "fixtures")]
mod fixtures;
mod state;
#[cfg(windows)]
mod webview2_keys;
mod window;

use tauri::Manager;

use state::{Library, Thumbs};

/// Builds and runs the app until it quits.
pub fn run() -> tauri::Result<()> {
    tauri::Builder::default()
        .setup(|app| {
            let thumbs = app.path().app_cache_dir()?.join("thumbs");
            // The webview reads thumbnails through the asset protocol, from this folder only (D41).
            app.asset_protocol_scope().allow_directory(&thumbs, false)?;
            let library = Library::default();
            #[cfg(feature = "fixtures")]
            let widgets = {
                let mut index = library
                    .0
                    .write()
                    .map_err(|_| std::io::Error::other("index lock"))?;
                fixtures::fill_library(&mut index);
                fixtures::write_thumbnails(&mut index, &thumbs)?;
                fixtures::widgets()
            };
            #[cfg(not(feature = "fixtures"))]
            let widgets = state::Widgets::default();
            app.manage(library);
            app.manage(Thumbs(thumbs));
            app.manage(widgets);
            window::create_main(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::library::library_artists,
            commands::library::library_artist_rows,
            commands::library::library_albums,
            commands::library::library_album_rows,
            commands::library::library_song_ids,
            commands::library::library_rows,
            commands::library::library_tree,
            commands::library::album_art,
            commands::widgets::queue_get,
            commands::widgets::player_state,
            commands::widgets::playlists_list,
            commands::widgets::playlist_entries,
            commands::widgets::lyrics_get,
            commands::measure::measure_mode,
            commands::measure::measure_ready,
        ])
        .run(tauri::generate_context!())
}
