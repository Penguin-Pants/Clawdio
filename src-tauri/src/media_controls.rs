//! OS media controls (P8, R24, D39): media keys, the Windows media flyout and Linux MPRIS
//! through souvlaki. The controls live on the main thread (Windows ties them to the window);
//! the player's events reach them through `run_on_main_thread`. Every failure is logged and
//! the app continues (P8.4).

use std::cell::RefCell;
use std::sync::mpsc::Sender;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use clawdio_core::api::{PlayerSnapshot, PlayerStatus, QueueSnapshot, SongRow};
use souvlaki::{
    MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, MediaPosition, PlatformConfig,
};
use tauri::{AppHandle, Manager, WebviewWindow};

use crate::player::{Command, PlayerHandle};
use crate::state::Library;
use crate::thumbs::ArtService;

/// The playing position goes to the OS this often. MPRIS reads the last value, so the OS
/// position stays within this of the app (P8-AC1, P8-AC2: 2 s).
const POSITION_EVERY: Duration = Duration::from_secs(1);

thread_local! {
    /// The controls, on the main thread only.
    static CONTROLS: RefCell<Option<MediaControls>> = const { RefCell::new(None) };
}

/// Wakes the souvlaki D-Bus thread once per update (Linux).
static WAKE: OnceLock<Sender<()>> = OnceLock::new();

/// souvlaki 0.8.3's D-Bus thread handles one update per loop, and the loop waits up to 1 s
/// for a D-Bus message. One property read per update ends that wait, so each update reaches
/// the bus at once and none queue up behind the position updates (P8-AC2).
#[cfg(target_os = "linux")]
fn start_waker(bus_name: String) -> Option<Sender<()>> {
    use dbus::blocking::stdintf::org_freedesktop_dbus::Properties;
    let (sender, updates) = std::sync::mpsc::channel::<()>();
    let spawned = std::thread::Builder::new()
        .name("media-wake".into())
        .spawn(move || {
            let connection = match dbus::blocking::Connection::new_session() {
                Ok(connection) => connection,
                Err(error) => {
                    log::warn!("media: no D-Bus connection to wake the controls: {error}");
                    return;
                }
            };
            let proxy = connection.with_proxy(
                bus_name,
                "/org/mpris/MediaPlayer2",
                Duration::from_millis(500),
            );
            while updates.recv().is_ok() {
                let read: Result<String, dbus::Error> =
                    proxy.get("org.mpris.MediaPlayer2.Player", "PlaybackStatus");
                if let Err(error) = read {
                    log::debug!("media: wake read failed: {error}");
                }
            }
        });
    match spawned {
        Ok(_) => Some(sender),
        Err(error) => {
            log::warn!("media: cannot start the wake thread: {error}");
            None
        }
    }
}

#[cfg(not(target_os = "linux"))]
fn start_waker(_bus_name: String) -> Option<Sender<()>> {
    // Windows updates apply at once; there is no loop to wake.
    None
}

/// The player command for an OS event (P8.2). Other events are ignored.
pub fn command_for(event: &MediaControlEvent) -> Option<Command> {
    match event {
        MediaControlEvent::Play => Some(Command::Play),
        MediaControlEvent::Pause => Some(Command::Pause),
        MediaControlEvent::Toggle => Some(Command::Toggle),
        MediaControlEvent::Next => Some(Command::Next),
        MediaControlEvent::Previous => Some(Command::Previous),
        MediaControlEvent::Stop => Some(Command::Stop),
        _ => None,
    }
}

/// The D-Bus name from the app identifier: dots become underscores (P8.1).
pub fn dbus_name(identifier: &str) -> String {
    identifier.replace('.', "_")
}

/// The OS playback state with its position (P8.3).
pub fn playback(status: PlayerStatus, position_ms: u32) -> MediaPlayback {
    let progress = Some(MediaPosition(Duration::from_millis(u64::from(position_ms))));
    match status {
        PlayerStatus::Playing => MediaPlayback::Playing { progress },
        PlayerStatus::Paused => MediaPlayback::Paused { progress },
        PlayerStatus::Stopped => MediaPlayback::Stopped,
    }
}

/// Creates and attaches the controls. Call on the main thread after the main window exists.
pub fn attach(app: &AppHandle, window: &WebviewWindow) {
    let name = dbus_name(&app.config().identifier);
    let display = app.package_info().name.clone();
    #[cfg(windows)]
    let hwnd = match window.hwnd() {
        Ok(hwnd) => Some(hwnd.0),
        Err(error) => {
            log::warn!("media: no window handle: {error}");
            return;
        }
    };
    #[cfg(not(windows))]
    let hwnd = {
        let _ = window;
        None
    };
    let config = PlatformConfig {
        display_name: &display,
        dbus_name: &name,
        hwnd,
    };
    let mut controls = match MediaControls::new(config) {
        Ok(controls) => controls,
        Err(error) => {
            log::warn!("media: cannot create the media controls: {error:?}");
            return;
        }
    };
    let player = app.state::<PlayerHandle>().inner().clone();
    let attached = controls.attach(move |event| match command_for(&event) {
        Some(command) => player.send(command),
        None => log::debug!("media: ignored {event:?}"),
    });
    if let Err(error) = attached {
        log::warn!("media: cannot attach the media controls: {error:?}");
        return;
    }
    CONTROLS.with(|slot| *slot.borrow_mut() = Some(controls));
    if let Some(sender) = start_waker(format!("org.mpris.MediaPlayer2.{name}")) {
        let _ = WAKE.set(sender);
    }
}

/// Detaches the controls when the app exits, so no OS entry stays behind.
pub fn detach() {
    CONTROLS.with(|slot| {
        if let Some(mut controls) = slot.borrow_mut().take() {
            if let Err(error) = controls.detach() {
                log::warn!("media: cannot detach the media controls: {error:?}");
            }
        }
    });
}

/// What the OS last got, to send only changes.
#[derive(Default)]
struct Sent {
    track: Option<u32>,
    /// The current song, and the cover URL that went out with it.
    song: Option<SongRow>,
    cover_url: Option<String>,
    status: Option<PlayerStatus>,
    position_at: Option<Instant>,
}

/// The current song for the OS panel, with the `file://` URL of its 512 px art (P10.5).
#[derive(Debug, Clone, PartialEq)]
pub struct NowPlaying {
    pub song: SongRow,
    pub cover_url: Option<String>,
}

/// One update for the OS controls.
#[derive(Debug, Clone, PartialEq)]
pub enum Update {
    Metadata(Option<NowPlaying>),
    Playback(MediaPlayback),
}

/// Turns player events into OS updates (P8.3): metadata on each track change, the state on
/// each state change, and the position once per `POSITION_EVERY` while playing.
#[derive(Default)]
pub struct Publisher {
    sent: Mutex<Sent>,
}

impl Publisher {
    /// The current track changed or not. `row` looks up the song of an id, `cover` the art
    /// URL of an album (none while the file is made).
    pub fn queue(
        &self,
        queue: &QueueSnapshot,
        row: impl Fn(u32) -> Option<SongRow>,
        cover: impl Fn(u32) -> Option<String>,
    ) -> Option<Update> {
        let track = queue
            .current
            .and_then(|index| queue.entries.get(index as usize).copied());
        let mut sent = self.sent.lock().ok()?;
        if sent.track == track {
            return None;
        }
        sent.track = track;
        let now = track.and_then(row).map(|song| NowPlaying {
            cover_url: cover(song.album_id),
            song,
        });
        sent.song = now.as_ref().map(|now| now.song.clone());
        sent.cover_url = now.as_ref().and_then(|now| now.cover_url.clone());
        Some(Update::Metadata(now))
    }

    /// An album's art file appeared (`art-ready`): the current song's metadata goes out again
    /// when it is that album and its cover URL changed: new art, or art after "Set cover",
    /// whose old file is gone (P10.5).
    pub fn art_ready(&self, album: u32, cover: impl Fn(u32) -> Option<String>) -> Option<Update> {
        let mut sent = self.sent.lock().ok()?;
        let song = sent.song.clone().filter(|song| song.album_id == album)?;
        let cover_url = cover(album)?;
        if sent.cover_url.as_deref() == Some(cover_url.as_str()) {
            return None;
        }
        sent.cover_url = Some(cover_url.clone());
        Some(Update::Metadata(Some(NowPlaying {
            song,
            cover_url: Some(cover_url),
        })))
    }

    pub fn state(&self, player: &PlayerSnapshot) -> Option<Update> {
        let mut sent = self.sent.lock().ok()?;
        sent.status = Some(player.status);
        sent.position_at = Some(Instant::now());
        Some(Update::Playback(playback(
            player.status,
            player.position_ms,
        )))
    }

    pub fn position(&self, position_ms: u32) -> Option<Update> {
        let mut sent = self.sent.lock().ok()?;
        if sent.status != Some(PlayerStatus::Playing) {
            return None;
        }
        let now = Instant::now();
        if sent
            .position_at
            .is_some_and(|at| now.duration_since(at) < POSITION_EVERY)
        {
            return None;
        }
        sent.position_at = Some(now);
        Some(Update::Playback(playback(
            PlayerStatus::Playing,
            position_ms,
        )))
    }
}

/// Sends an update to the controls on the main thread.
pub fn apply<R: tauri::Runtime>(app: &AppHandle<R>, update: Update) {
    let result = app.run_on_main_thread(move || {
        CONTROLS.with(|slot| {
            let mut slot = slot.borrow_mut();
            let Some(controls) = slot.as_mut() else {
                return;
            };
            let result = match &update {
                Update::Metadata(Some(now)) => controls.set_metadata(MediaMetadata {
                    title: Some(&now.song.title),
                    artist: Some(&now.song.artist_name),
                    album: Some(&now.song.album_name),
                    cover_url: now.cover_url.as_deref(),
                    duration: Some(Duration::from_millis(u64::from(now.song.duration_ms))),
                }),
                Update::Metadata(None) => controls.set_metadata(MediaMetadata::default()),
                Update::Playback(playback) => controls.set_playback(playback.clone()),
            };
            match result {
                Ok(()) => {
                    if let Some(wake) = WAKE.get() {
                        let _ = wake.send(());
                    }
                }
                Err(error) => {
                    // The OS side is gone (for example D-Bus stopped): stop sending.
                    log::warn!("media: cannot update the media controls: {error:?}");
                    *slot = None;
                }
            }
        });
    });
    if let Err(error) = result {
        log::warn!("media: cannot reach the main thread: {error}");
    }
}

/// The `file://` URL of an album's 512 px art (P10.5), or None while it is made.
pub fn cover_url<R: tauri::Runtime>(app: &AppHandle<R>, album: u32) -> Option<String> {
    let path = app.try_state::<ArtService>()?.display_path(app, album)?;
    tauri::Url::from_file_path(path).ok().map(String::from)
}

/// An album's art is ready: republish the current song when it needs the cover.
pub fn art_ready<R: tauri::Runtime>(app: &AppHandle<R>, album: u32) {
    let Some(publisher) = app.try_state::<Publisher>() else {
        return;
    };
    if let Some(update) = publisher.art_ready(album, |album| cover_url(app, album)) {
        apply(app, update);
    }
}

/// The song row of a track id from the library, for metadata.
pub fn song<R: tauri::Runtime>(app: &AppHandle<R>, id: u32) -> Option<SongRow> {
    let library = app.state::<Library>();
    let index = library.0.read().ok()?;
    index.rows(&[id]).ok()?.into_iter().next()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(id: u32) -> Option<SongRow> {
        Some(SongRow {
            id,
            artist_id: 0,
            album_id: 0,
            title: format!("Song {id}"),
            artist_name: "Artist".into(),
            album_name: "Album".into(),
            tag_artist: None,
            duration_ms: 1000,
        })
    }

    fn snapshot(status: PlayerStatus, position_ms: u32) -> PlayerSnapshot {
        PlayerSnapshot {
            status,
            position_ms,
            ..PlayerSnapshot::default()
        }
    }

    #[test]
    fn os_events_map_to_player_commands_and_others_are_ignored() {
        let mapped = |event| command_for(&event).map(|command| format!("{command:?}"));
        assert_eq!(mapped(MediaControlEvent::Play).as_deref(), Some("Play"));
        assert_eq!(mapped(MediaControlEvent::Pause).as_deref(), Some("Pause"));
        assert_eq!(mapped(MediaControlEvent::Toggle).as_deref(), Some("Toggle"));
        assert_eq!(mapped(MediaControlEvent::Next).as_deref(), Some("Next"));
        assert_eq!(
            mapped(MediaControlEvent::Previous).as_deref(),
            Some("Previous")
        );
        assert_eq!(mapped(MediaControlEvent::Stop).as_deref(), Some("Stop"));
        assert_eq!(mapped(MediaControlEvent::Raise), None);
        assert_eq!(mapped(MediaControlEvent::Quit), None);
        assert_eq!(mapped(MediaControlEvent::SetVolume(0.5)), None);
    }

    #[test]
    fn the_dbus_name_replaces_dots() {
        assert_eq!(
            dbus_name("io.github.penguinpants.clawdio"),
            "io_github_penguinpants_clawdio"
        );
    }

    #[test]
    fn metadata_goes_out_only_when_the_track_changes() {
        let publisher = Publisher::default();
        let queue = QueueSnapshot {
            entries: vec![4, 5],
            current: Some(0),
        };
        let now = |id| {
            row(id).map(|song| NowPlaying {
                song,
                cover_url: None,
            })
        };
        let no_cover = |_| None;
        assert_eq!(
            publisher.queue(&queue, row, no_cover),
            Some(Update::Metadata(now(4)))
        );
        assert_eq!(publisher.queue(&queue, row, no_cover), None, "same track");
        let next = QueueSnapshot {
            current: Some(1),
            ..queue
        };
        assert_eq!(
            publisher.queue(&next, row, no_cover),
            Some(Update::Metadata(now(5)))
        );
        assert_eq!(
            publisher.queue(&QueueSnapshot::default(), row, no_cover),
            Some(Update::Metadata(None)),
            "an empty queue clears the OS entry"
        );
    }

    /// P10.5: art made after the track started goes out without a track change.
    #[test]
    fn the_cover_goes_out_when_the_current_album_art_is_ready() {
        let publisher = Publisher::default();
        let queue = QueueSnapshot {
            entries: vec![4],
            current: Some(0),
        };
        publisher.queue(&queue, row, |_| None);
        let url = |_| Some("file:///art.jpg".to_owned());
        assert_eq!(publisher.art_ready(7, url), None, "another album");
        let Some(Update::Metadata(Some(now))) = publisher.art_ready(0, url) else {
            panic!("no republish");
        };
        assert_eq!(now.cover_url.as_deref(), Some("file:///art.jpg"));
        assert_eq!(now.song.id, 4);
        assert_eq!(publisher.art_ready(0, url), None, "sent once");
        // "Set cover" makes a new file with a new name: it goes out again.
        let new_url = |_| Some("file:///new.jpg".to_owned());
        let Some(Update::Metadata(Some(now))) = publisher.art_ready(0, new_url) else {
            panic!("no republish after a new cover");
        };
        assert_eq!(now.cover_url.as_deref(), Some("file:///new.jpg"));
    }

    #[test]
    fn each_state_goes_out_with_its_position() {
        let publisher = Publisher::default();
        assert_eq!(
            publisher.state(&snapshot(PlayerStatus::Paused, 1500)),
            Some(Update::Playback(MediaPlayback::Paused {
                progress: Some(MediaPosition(Duration::from_millis(1500)))
            }))
        );
        assert_eq!(
            publisher.state(&snapshot(PlayerStatus::Stopped, 0)),
            Some(Update::Playback(MediaPlayback::Stopped))
        );
    }

    #[test]
    fn the_position_goes_out_once_per_second_while_playing() {
        let publisher = Publisher::default();
        assert_eq!(publisher.position(500), None, "nothing plays");
        publisher.state(&snapshot(PlayerStatus::Playing, 0));
        assert_eq!(publisher.position(250), None, "too soon after the state");
        publisher.sent.lock().unwrap().position_at = Some(Instant::now() - POSITION_EVERY);
        assert_eq!(
            publisher.position(1000),
            Some(Update::Playback(MediaPlayback::Playing {
                progress: Some(MediaPosition(Duration::from_millis(1000)))
            }))
        );
        assert_eq!(publisher.position(1250), None);
    }
}
