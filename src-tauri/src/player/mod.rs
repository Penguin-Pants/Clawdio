//! The player (P4.9, section 6.10). One audio thread owns the queue and the output (D46);
//! commands reach it through a channel.

pub mod output;

use std::path::PathBuf;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::Duration;

use clawdio_core::api::{PlayerSnapshot, PlayerStatus, QueueSnapshot};

use output::{AudioOutput, OutputError};

/// Position events while playing: 4 per second (section 6.10).
pub const TICK: Duration = Duration::from_millis(250);
/// Consecutive files that cannot play before playback stops (R6).
pub const MAX_FAILURES: u32 = 3;

/// Where the player reports to: the app emits Tauri events; tests record them.
pub trait PlayerEvents: Send {
    fn state(&self, player: PlayerSnapshot, queue: &QueueSnapshot);
    fn position(&self, position_ms: u32);
    /// A transient status line message (D18).
    fn message(&self, text: String);
}

/// The absolute file of a track id, or `None` for an unknown or removed id.
pub type Resolve = Arc<dyn Fn(u32) -> Option<PathBuf> + Send + Sync>;

pub enum Command {
    PlayList {
        ids: Vec<u32>,
        start: usize,
    },
    Toggle,
    Stop,
    /// Stops playback, resets the position and empties the queue (P5.9, a new music folder).
    /// The reply comes when it is done.
    Clear(Sender<()>),
    GetQueue(Sender<QueueSnapshot>),
    GetState(Sender<PlayerSnapshot>),
    Shutdown,
}

/// The playback state machine, independent of threads and of the output kind.
pub struct Engine<O: AudioOutput, E: PlayerEvents> {
    output: O,
    events: E,
    resolve: Resolve,
    queue: QueueSnapshot,
    player: PlayerSnapshot,
}

impl<O: AudioOutput, E: PlayerEvents> Engine<O, E> {
    pub fn new(output: O, events: E, resolve: Resolve) -> Self {
        Engine {
            output,
            events,
            resolve,
            queue: QueueSnapshot::default(),
            player: PlayerSnapshot {
                volume: 100,
                ..PlayerSnapshot::default()
            },
        }
    }

    #[cfg(test)]
    pub fn output_mut(&mut self) -> &mut O {
        &mut self.output
    }

    #[cfg(test)]
    pub fn queue(&self) -> &QueueSnapshot {
        &self.queue
    }

    #[cfg(test)]
    pub fn state(&self) -> PlayerSnapshot {
        self.player
    }

    fn announce(&self) {
        self.events.state(self.player, &self.queue);
    }

    /// Plays entries from `index` on. A file that cannot play is skipped with a message;
    /// after MAX_FAILURES in a row playback stops (R6).
    fn play_from(&mut self, mut index: usize) {
        let mut failures = 0;
        while let Some(&id) = self.queue.entries.get(index) {
            self.queue.current = Some(index as u32);
            let path = (self.resolve)(id);
            let result = match &path {
                Some(path) => self.output.load(path),
                None => Err(OutputError::Decode(format!("unknown track {id}"))),
            };
            match result {
                Ok(()) => {
                    self.player.status = PlayerStatus::Playing;
                    self.player.position_ms = 0;
                    self.announce();
                    return;
                }
                Err(OutputError::Device(reason)) => {
                    log::warn!("player: no audio device: {reason}");
                    self.events.message("Cannot open the audio device".into());
                    break;
                }
                Err(OutputError::Decode(reason)) => {
                    let name = path
                        .as_ref()
                        .and_then(|p| p.file_name())
                        .map(|n| n.to_string_lossy().into_owned())
                        .unwrap_or_else(|| format!("track {id}"));
                    log::warn!("player: cannot play {name}: {reason}");
                    self.events.message(format!("Cannot play {name}"));
                    failures += 1;
                    if failures >= MAX_FAILURES {
                        break;
                    }
                    index += 1;
                }
            }
        }
        self.halt();
    }

    /// Stops playback and resets the position. The queue stays (R6 Stop).
    fn halt(&mut self) {
        self.output.stop();
        self.player.status = PlayerStatus::Stopped;
        self.player.position_ms = 0;
        self.announce();
    }

    /// Replaces the queue with `ids` and plays from `start` (R6 queue rule).
    pub fn play_list(&mut self, ids: Vec<u32>, start: usize) {
        if start >= ids.len() {
            return;
        }
        self.queue = QueueSnapshot {
            entries: ids,
            current: None,
        };
        self.play_from(start);
    }

    pub fn toggle(&mut self) {
        match self.player.status {
            PlayerStatus::Playing => {
                self.output.pause();
                self.player.status = PlayerStatus::Paused;
                self.announce();
            }
            PlayerStatus::Paused => {
                self.output.resume();
                self.player.status = PlayerStatus::Playing;
                self.announce();
            }
            PlayerStatus::Stopped => {
                let start = self.queue.current.unwrap_or(0) as usize;
                if start < self.queue.entries.len() {
                    self.play_from(start);
                }
            }
        }
    }

    pub fn stop(&mut self) {
        if self.player.status != PlayerStatus::Stopped {
            self.halt();
        }
    }

    /// Stops playback and empties the queue (P5.9).
    pub fn clear(&mut self) {
        self.output.stop();
        self.queue = QueueSnapshot::default();
        self.player.status = PlayerStatus::Stopped;
        self.player.position_ms = 0;
        self.announce();
    }

    /// One tick while playing: report the position and move on at the end of a file. After
    /// the last entry playback stops at the start of the last song (R6 repeat off).
    pub fn tick(&mut self) {
        if self.player.status != PlayerStatus::Playing {
            return;
        }
        if self.output.finished() {
            let next = self.queue.current.map_or(0, |current| current as usize + 1);
            if next < self.queue.entries.len() {
                self.play_from(next);
            } else {
                self.halt();
            }
            return;
        }
        self.player.position_ms = self.output.position().as_millis().min(u32::MAX as u128) as u32;
        self.events.position(self.player.position_ms);
    }

    /// Handles one command. Returns false on Shutdown.
    pub fn handle(&mut self, command: Command) -> bool {
        match command {
            Command::PlayList { ids, start } => self.play_list(ids, start),
            Command::Toggle => self.toggle(),
            Command::Stop => self.stop(),
            Command::Clear(done) => {
                self.clear();
                let _ = done.send(());
            }
            Command::GetQueue(reply) => {
                let _ = reply.send(self.queue.clone());
            }
            Command::GetState(reply) => {
                let _ = reply.send(self.player);
            }
            Command::Shutdown => return false,
        }
        true
    }
}

/// Runs the engine until Shutdown or until every sender is gone.
fn run<O: AudioOutput, E: PlayerEvents>(mut engine: Engine<O, E>, commands: Receiver<Command>) {
    loop {
        match commands.recv_timeout(TICK) {
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

    /// Stops playback and empties the queue, and waits until the player thread is done.
    pub fn clear(&self) {
        let (reply, answer) = mpsc::channel();
        self.send(Command::Clear(reply));
        let _ = answer.recv();
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;
    use std::sync::Mutex;

    use super::output::TestOutput;
    use super::*;

    #[derive(Clone, Default)]
    struct Recorder(Arc<Mutex<Vec<String>>>);

    impl PlayerEvents for Recorder {
        fn state(&self, player: PlayerSnapshot, queue: &QueueSnapshot) {
            self.0
                .lock()
                .unwrap()
                .push(format!("{:?} {:?}", player.status, queue.current));
        }
        fn position(&self, position_ms: u32) {
            self.0.lock().unwrap().push(format!("at {position_ms}"));
        }
        fn message(&self, text: String) {
            self.0.lock().unwrap().push(text);
        }
    }

    fn seed(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../crates/clawdio-core/tests/fixtures/seed")
            .join(name)
    }

    /// Ids 0 to 2 are the seed tones; id 9 is a file that does not decode.
    fn engine() -> (Engine<TestOutput, Recorder>, Recorder) {
        let recorder = Recorder::default();
        let resolve: Resolve = Arc::new(|id| match id {
            0 => Some(seed("tone.mp3")),
            1 => Some(seed("tone-vorbis.ogg")),
            2 => Some(seed("tone-pcm16.wav")),
            9 => Some(seed("README.md")),
            _ => None,
        });
        (
            Engine::new(TestOutput::default(), recorder.clone(), resolve),
            recorder,
        )
    }

    #[test]
    fn decodes_each_seed_format() {
        for name in ["tone.mp3", "tone-vorbis.ogg", "tone-pcm16.wav"] {
            let length = output::decoded_duration(&seed(name)).unwrap();
            assert!(
                length > Duration::from_millis(900) && length < Duration::from_millis(1200),
                "{name}: {length:?}"
            );
        }
    }

    #[test]
    fn plays_the_queue_in_order_and_stops_after_the_last_entry() {
        let (mut engine, recorder) = engine();
        engine.play_list(vec![0, 1, 2], 1);
        assert_eq!(engine.state().status, PlayerStatus::Playing);
        assert_eq!(engine.queue().current, Some(1));
        engine.output_mut().advance(Duration::from_millis(500));
        engine.tick();
        assert_eq!(engine.state().position_ms, 500);
        engine.output_mut().advance(Duration::from_secs(2));
        engine.tick();
        assert_eq!(engine.queue().current, Some(2));
        engine.output_mut().advance(Duration::from_secs(2));
        engine.tick();
        assert_eq!(engine.state().status, PlayerStatus::Stopped);
        assert_eq!(engine.state().position_ms, 0);
        assert_eq!(
            engine.queue().current,
            Some(2),
            "the position shows the start of the last song (R6)"
        );
        assert!(recorder.0.lock().unwrap().contains(&"at 500".to_owned()));
    }

    #[test]
    fn clear_stops_and_empties_the_queue() {
        let (mut engine, _) = engine();
        engine.play_list(vec![0, 1], 1);
        engine.output_mut().advance(Duration::from_millis(300));
        engine.clear();
        assert_eq!(engine.state().status, PlayerStatus::Stopped);
        assert_eq!(engine.state().position_ms, 0);
        assert_eq!(*engine.queue(), QueueSnapshot::default());
    }

    #[test]
    fn toggle_pauses_and_resumes_and_stop_keeps_the_queue() {
        let (mut engine, _) = engine();
        engine.play_list(vec![0, 1], 0);
        engine.toggle();
        assert_eq!(engine.state().status, PlayerStatus::Paused);
        engine.output_mut().advance(Duration::from_millis(300));
        assert_eq!(
            engine.output_mut().position(),
            Duration::ZERO,
            "the clock waits while paused"
        );
        engine.toggle();
        assert_eq!(engine.state().status, PlayerStatus::Playing);
        engine.stop();
        assert_eq!(engine.state().status, PlayerStatus::Stopped);
        assert_eq!(engine.queue().entries, [0, 1]);
        engine.toggle();
        assert_eq!(
            engine.state().status,
            PlayerStatus::Playing,
            "Play after Stop starts the current entry"
        );
        assert_eq!(engine.queue().current, Some(0));
    }

    #[test]
    fn a_file_that_cannot_play_is_skipped_with_a_message() {
        let (mut engine, recorder) = engine();
        engine.play_list(vec![9, 0], 0);
        assert_eq!(engine.queue().current, Some(1));
        assert_eq!(engine.state().status, PlayerStatus::Playing);
        assert!(recorder
            .0
            .lock()
            .unwrap()
            .contains(&"Cannot play README.md".to_owned()));
    }

    #[test]
    fn three_failures_in_a_row_stop_playback() {
        let (mut engine, _) = engine();
        engine.play_list(vec![9, 9, 9, 0], 0);
        assert_eq!(engine.state().status, PlayerStatus::Stopped);
    }

    #[test]
    fn the_thread_answers_commands() {
        let recorder = Recorder::default();
        let resolve: Resolve = Arc::new(|_| Some(seed("tone.mp3")));
        let (handle, thread) = PlayerHandle::spawn(TestOutput::default, recorder, resolve);
        handle.send(Command::PlayList {
            ids: vec![4, 5],
            start: 0,
        });
        assert_eq!(handle.queue().entries, [4, 5]);
        assert_eq!(handle.state().status, PlayerStatus::Playing);
        handle.send(Command::Shutdown);
        thread.join().unwrap();
    }
}
