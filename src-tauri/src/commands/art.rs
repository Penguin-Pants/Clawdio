//! Album art commands (P10.2, P10.4). IPC carries album ids and file names only (D13, D41).

use clawdio_core::api::IpcError;
use clawdio_core::artwork::{self, CoverError, COVER_FILE, SIZES};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

use super::{lock_error, CommandResult};
use crate::state::MusicRoot;
use crate::thumbs::ArtService;

/// The art file name of an album at `size` (96 or 512), or null while it is made or when
/// the album has no art. `art-ready` follows a made file (P10.2).
/// Async, so the folder listing never runs on the main thread.
#[tauri::command]
pub async fn album_art(
    app: AppHandle,
    service: State<'_, ArtService>,
    album: u32,
    size: u32,
) -> CommandResult<Option<String>> {
    if !SIZES.contains(&size) {
        return Err(IpcError {
            code: "invalid".into(),
            message: format!("unknown art size {size}"),
        });
    }
    Ok(service.file(&app, album, size))
}

fn cover_error(error: CoverError) -> IpcError {
    IpcError {
        code: "set_cover".into(),
        message: error.to_string(),
    }
}

/// "Set cover" (P10.4, D19): picks a JPEG or PNG, converts it to `cover.jpg` (JPEG quality
/// 90) in the album folder, asks before it replaces an existing `cover.jpg`, and makes the
/// album's art again. Returns false when the user cancels. A read-only folder is an error and
/// nothing is written.
#[tauri::command]
pub async fn set_cover(app: AppHandle, album: u32) -> CommandResult<bool> {
    let no_folder = || IpcError {
        code: "set_cover".into(),
        message: "This album has no album folder".into(),
    };
    let root = app
        .state::<MusicRoot>()
        .0
        .read()
        .map_err(|_| lock_error())?
        .clone()
        .ok_or_else(no_folder)?;
    let (input, old_key) = ArtService::input(&app, album).ok_or_else(no_folder)?;
    let folder = root.join(input.folder.ok_or_else(no_folder)?);
    // A read-only folder fails before the picker opens, so the user picks nothing in vain.
    artwork::check_writable(&folder).map_err(cover_error)?;
    let picked = app
        .dialog()
        .file()
        .add_filter("Images", &["jpg", "jpeg", "png"])
        .blocking_pick_file();
    let Some(picked) = picked.and_then(|path| path.into_path().ok()) else {
        return Ok(false);
    };
    let jpeg = artwork::cover_jpeg(&picked).map_err(cover_error)?;
    // Any letter case: `Cover.JPG` is the cover file too (D19).
    if !artwork::existing_covers(&folder).is_empty() {
        let replace = app
            .dialog()
            .message(format!("Replace the {COVER_FILE} file of this album?"))
            .title("Set cover")
            .kind(MessageDialogKind::Warning)
            .buttons(MessageDialogButtons::OkCancelCustom(
                "Replace".into(),
                "Cancel".into(),
            ))
            .blocking_show();
        if !replace {
            return Ok(false);
        }
    }
    artwork::write_cover(&folder, &jpeg).map_err(cover_error)?;
    app.state::<ArtService>()
        .refresh(&app, album, Some(&old_key));
    Ok(true)
}
