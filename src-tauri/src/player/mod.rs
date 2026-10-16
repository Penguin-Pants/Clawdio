//! The player (P4.9, P7, section 6.10). One audio thread owns the queue and the output (D46);
//! commands reach it through a channel.

pub mod duck;
pub mod engine;
pub mod output;
pub mod source;

use std::path::PathBuf;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use clawdio_core::api::{PlayerSnapshot, QueueSnapshot};

pub use engine::{Command, Engine};
use output::AudioOutput;

/// Position events while playing: 4 per second (section 6.10).
pub const TICK: Duration = Duration::from_millis(250);
/// Consecutive files that cannot play before playback stops (R6, AC-19).
pub const MAX_FAILURES: u32 = 3;
/// The status line text when the audio device fails (section 5, P7.4).
pub const DEVICE_MESSAGE: &str = "Audio output not available. Press Play to try again.";

/// Where the player reports to: the app emits Tauri events; tests record them.
pub trait PlayerEvents: Send {
    /// `player-state`: status, position, volume, shuffle and repeat.
    fn state(&self, player: PlayerSnapshot);
    /// `queue-changed`: the entries and the current entry.
    fn queue(&self, queue: &QueueSnapshot);
    /// `player-position`, 4 times per second while playing.
    fn position(&self, position_ms: u32);
    /// A transient status line message (D18).
    fn message(&self, text: String);
    /// The playing song and the next song in play order (P24.5), or none while stopped, and
    /// the count of files the player started, so a restart of the same song is a new play.
    /// The engine sends it with every state and queue event; the receiver drops repeats.
    fn songs(&self, _playing: Option<u32>, _next: Option<u32>, _play: u64) {}
}

/// The absolute file of a track id, or `None` for an unknown or removed id.
pub type Resolve = Arc<dyn Fn(u32) -> Option<PathBuf> + Send + Sync>;

/// Runs the engine until Shutdown or until every sender is gone.
fn run<O: AudioOutput, E: PlayerEvents>(mut engine: Engine<O, E>, commands: Receiver<Command>) {
    loop {
        // A duck timer (D52) wakes the thread before the next tick.
        let wait = engine.next_deadline().map_or(TICK, |at| {
            at.saturating_duration_since(Instant::now()).min(TICK)
        });
        match commands.recv_timeout(wait) {
            Ok(command) => {
                if !engine.handle(command) {
                    break;
                }
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => break,
        }
        engine.tick();
    }
    engine.stop();
}

/// The command side of the player thread.
#[derive(Clone)]
pub struct PlayerHandle {
    commands: Sender<Command>,
}

impl PlayerHandle {
    /// Starts the audio thread. `make_output` runs on that thread, because a device stream
    /// may not move between threads.
    pub fn spawn<O, E, F>(make_output: F, events: E, resolve: Resolve) -> (Self, JoinHandle<()>)
    where
        O: AudioOutput,
        E: PlayerEvents + 'static,
        F: FnOnce() -> O + Send + 'static,
    {
        let (sender, receiver) = mpsc::channel();
        let thread = std::thread::Builder::new()
            .name("player".into())
            .spawn(move || run(Engine::new(make_output(), events, resolve), receiver))
            .expect("the player thread starts");
        (PlayerHandle { commands: sender }, thread)
    }

    pub fn send(&self, command: Command) {
        if self.commands.send(command).is_err() {
            log::warn!("player: the audio thread has stopped");
        }
    }

    pub fn queue(&self) -> QueueSnapshot {
        let (reply, answer) = mpsc::channel();
        self.send(Command::GetQueue(reply));
        answer.recv().unwrap_or_default()
    }

    pub fn state(&self) -> PlayerSnapshot {
        let (reply, answer) = mpsc::channel();
        self.send(Command::GetState(reply));
        answer.recv().unwrap_or_default()
    }

    /// Waits until the player thread has handled every command sent before, at most
    /// `limit`. Its events have then updated the saved state (exit flush).
    pub fn sync(&self, limit: std::time::Duration) {
        let (reply, answer) = mpsc::channel();
        self.send(Command::GetState(reply));
        let _ = answer.recv_timeout(limit);
    }

    /// Stops playback and empties the queue, and waits until the player thread is done.
    pub fn clear(&self) {
        let (reply, answer) = mpsc::channel();
        self.send(Command::Clear(reply));
        let _ = answer.recv();
    }
}
