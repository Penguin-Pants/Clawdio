//! The playback state machine (P7.2): what each command and tick does, independent of the
//! thread and of the output kind. `clawdio_core::queue` decides what plays.

use std::path::PathBuf;
use std::sync::mpsc::Sender;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use clawdio_core::api::{PlayerSnapshot, PlayerStatus, QueueSnapshot, RepeatMode};
use clawdio_core::queue::{Queue, Removed, Step};

use super::output::{AudioOutput, OutputError};
use super::{PlayerEvents, Resolve, DEVICE_MESSAGE, MAX_FAILURES};

pub enum Command {
    /// Replaces the queue with `ids` and plays from `start` (R6 queue rule).
    PlayList {
        ids: Vec<u32>,
        start: usize,
    },
    Play,
    Pause,
    Toggle,
    Stop,
    Next,
    Previous,
    Seek(Duration),
    /// Volume from 0 to 100.
    SetVolume(u8),
    SetShuffle(bool),
    SetRepeat(RepeatMode),
    Append(Vec<u32>),
    Remove(usize),
    ClearQueue,
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
    queue: Queue,
    status: PlayerStatus,
    position_ms: u32,
    volume: u8,
    /// Files in a row that could not play (R6).
    failures: u32,
}

impl<O: AudioOutput, E: PlayerEvents> Engine<O, E> {
    pub fn new(output: O, events: E, resolve: Resolve) -> Self {
        let seed = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(1, |since| since.as_nanos() as u64);
        Self::with_queue(output, events, resolve, Queue::new(seed))
    }

    fn with_queue(output: O, events: E, resolve: Resolve, queue: Queue) -> Self {
        Engine {
            output,
            events,
            resolve,
            queue,
            status: PlayerStatus::Stopped,
            position_ms: 0,
            volume: 100,
            failures: 0,
        }
    }

    #[cfg(test)]
    pub fn output_mut(&mut self) -> &mut O {
        &mut self.output
    }

    pub fn queue(&self) -> QueueSnapshot {
        self.queue.snapshot()
    }

    pub fn state(&self) -> PlayerSnapshot {
        PlayerSnapshot {
            status: self.status,
            position_ms: self.position_ms,
            volume: self.volume,
            shuffle: self.queue.shuffle(),
            repeat: self.queue.repeat(),
        }
    }

    fn announce(&self) {
        self.events.state(self.state());
    }

    fn announce_queue(&self) {
        self.events.queue(&self.queue.snapshot());
    }

    /// The file name for messages, or "track N".
    fn name_of(&self, id: u32, path: Option<&PathBuf>) -> String {
        path.and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| format!("track {id}"))
    }

    /// Counts a file that could not play. True when playback must stop (R6: three in a row).
    fn failed(&mut self, name: &str, reason: &str) -> bool {
        log::warn!("player: cannot play {name}: {reason}");
        self.events.message(format!("Cannot play {name}"));
        self.failures += 1;
        self.failures >= MAX_FAILURES
    }

    /// Plays the entry at `index`. A file that cannot open is skipped to the next entry; after
    /// MAX_FAILURES in a row playback stops (R6, D32 rule a).
    fn play_index(&mut self, mut index: usize) {
        loop {
            let Some(&id) = self.queue.entries().get(index) else {
                self.halt();
                return;
            };
            let path = (self.resolve)(id);
            let result = match &path {
                Some(path) => self.output.load(path),
                None => Err(OutputError::Decode(format!("unknown track {id}"))),
            };
            match result {
                Ok(()) => {
                    self.status = PlayerStatus::Playing;
                    self.position_ms = 0;
                    self.announce_queue();
                    self.announce();
                    return;
                }
                Err(OutputError::Device(reason)) => {
                    self.device_failed(&reason);
                    return;
                }
                Err(OutputError::Decode(reason)) => {
                    let name = self.name_of(id, path.as_ref());
                    if self.failed(&name, &reason) {
                        self.halt();
                        return;
                    }
                    match self.queue.next() {
                        Step::Play(next) => index = next,
                        Step::Restart | Step::Stop => {
                            self.halt();
                            return;
                        }
                    }
                }
            }
        }
    }

    /// Does what the queue decided.
    fn apply(&mut self, step: Step) {
        match step {
            Step::Play(index) => self.play_index(index),
            Step::Restart => match self.queue.current() {
                Some(current) => self.play_index(current),
                None => self.halt(),
            },
            Step::Stop => self.halt(),
        }
    }

    /// The gapless-ready seam (P7.5): starts the next entry. v1 calls it only after the
    /// current entry ended; a later change can call it early.
    pub fn prepare_next(&mut self, step: Step) {
        self.apply(step);
    }

    /// Stops playback and resets the position. The queue stays (R6 Stop).
    fn halt(&mut self) {
        self.output.stop();
        self.status = PlayerStatus::Stopped;
        self.position_ms = 0;
        self.announce_queue();
        self.announce();
    }

    /// The device failed: stop with the message; the next Play opens the default device.
    fn device_failed(&mut self, reason: &str) {
        log::warn!("player: audio device: {reason}");
        self.events.message(DEVICE_MESSAGE.into());
        self.halt();
    }

    /// Replaces the queue with `ids` and plays from `start` (R6 queue rule).
    pub fn play_list(&mut self, ids: Vec<u32>, start: usize) {
        if let Some(start) = self.queue.replace(ids, start) {
            self.failures = 0;
            self.play_index(start);
        }
    }

    pub fn play(&mut self) {
        match self.status {
            PlayerStatus::Playing => {}
            PlayerStatus::Paused => {
                self.output.resume();
                self.status = PlayerStatus::Playing;
                self.announce();
            }
            PlayerStatus::Stopped => {
                if !self.queue.entries().is_empty() {
                    self.failures = 0;
                    self.play_index(self.queue.current().unwrap_or(0));
                }
            }
        }
    }

    pub fn pause(&mut self) {
        if self.status == PlayerStatus::Playing {
            self.output.pause();
            self.status = PlayerStatus::Paused;
            self.announce();
        }
    }

    pub fn toggle(&mut self) {
        if self.status == PlayerStatus::Playing {
            self.pause();
        } else {
            self.play();
        }
    }

    pub fn stop(&mut self) {
        if self.status != PlayerStatus::Stopped {
            self.halt();
        }
    }

    pub fn next(&mut self) {
        self.failures = 0;
        let step = self.queue.next();
        self.apply(step);
    }

    pub fn previous(&mut self) {
        self.failures = 0;
        let step = self.queue.previous(self.position_ms);
        self.apply(step);
    }

    pub fn seek(&mut self, to: Duration) {
        if self.status != PlayerStatus::Stopped && self.output.seek(to) {
            self.position_ms = to.as_millis().min(u32::MAX as u128) as u32;
            self.events.position(self.position_ms);
        }
    }

    pub fn set_volume(&mut self, volume: u8) {
        self.volume = volume.min(100);
        self.output.set_volume(f32::from(self.volume) / 100.0);
        self.announce();
    }

    pub fn set_shuffle(&mut self, on: bool) {
        self.queue.set_shuffle(on);
        self.announce();
    }

    pub fn set_repeat(&mut self, mode: RepeatMode) {
        self.queue.set_repeat(mode);
        self.announce();
    }

    /// Add to queue: appends; the playing song does not change (R6).
    pub fn append(&mut self, ids: Vec<u32>) {
        self.queue.append(&ids);
        self.announce_queue();
    }

    /// Removes an entry (R6 queue edits).
    pub fn remove(&mut self, index: usize) {
        match self.queue.remove(index) {
            Removed::Nothing => {}
            Removed::Kept => self.announce_queue(),
            Removed::Current(step) => {
                if self.status == PlayerStatus::Stopped {
                    self.announce_queue();
                } else {
                    self.apply(step);
                }
            }
        }
    }

    /// Stops playback and empties the queue (Clear queue, P5.9).
    pub fn clear(&mut self) {
        self.output.stop();
        self.queue.clear();
        self.status = PlayerStatus::Stopped;
        self.position_ms = 0;
        self.announce_queue();
        self.announce();
    }

    /// One tick while playing: an error stops or skips, the end of a file moves on, else the
    /// position goes out.
    pub fn tick(&mut self) {
        if self.status != PlayerStatus::Playing {
            return;
        }
        // Read the end first: the source sends its error before the end callback runs, so an
        // error that belongs to this end is in the channel by now.
        let ended = self.output.finished();
        match self.output.take_error() {
            Some(OutputError::Device(reason)) => {
                self.device_failed(&reason);
                return;
            }
            Some(OutputError::Decode(reason)) => {
                // D32 rules b and c: the file stops early; the next entry plays.
                let id = self
                    .queue
                    .current()
                    .and_then(|index| self.queue.entries().get(index).copied())
                    .unwrap_or(u32::MAX);
                let path = (self.resolve)(id);
                let name = self.name_of(id, path.as_ref());
                if self.failed(&name, &reason) {
                    self.halt();
                } else {
                    let step = self.queue.next();
                    self.apply(step);
                }
                return;
            }
            None => {}
        }
        if ended {
            self.failures = 0;
            let step = self.queue.on_end();
            self.prepare_next(step);
            return;
        }
        self.position_ms = self.output.position().as_millis().min(u32::MAX as u128) as u32;
        self.events.position(self.position_ms);
    }

    /// Handles one command. Returns false on Shutdown.
    pub fn handle(&mut self, command: Command) -> bool {
        // A device lost while paused or between ticks: stop first, so no command waits on it.
        if let Some(reason) = self.output.device_lost() {
            if self.status == PlayerStatus::Stopped {
                log::warn!("player: audio device: {reason}");
            } else {
                self.device_failed(&reason);
            }
        }
        match command {
            Command::PlayList { ids, start } => self.play_list(ids, start),
            Command::Play => self.play(),
            Command::Pause => self.pause(),
            Command::Toggle => self.toggle(),
            Command::Stop => self.stop(),
            Command::Next => self.next(),
            Command::Previous => self.previous(),
            Command::Seek(to) => self.seek(to),
            Command::SetVolume(volume) => self.set_volume(volume),
            Command::SetShuffle(on) => self.set_shuffle(on),
            Command::SetRepeat(mode) => self.set_repeat(mode),
            Command::Append(ids) => self.append(ids),
            Command::Remove(index) => self.remove(index),
            Command::ClearQueue => self.clear(),
            Command::Clear(done) => {
                self.clear();
                let _ = done.send(());
            }
            Command::GetQueue(reply) => {
                let _ = reply.send(self.queue());
            }
            Command::GetState(reply) => {
                let _ = reply.send(self.state());
            }
            Command::Shutdown => return false,
        }
        true
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use super::super::output::TestOutput;
    use super::super::source::tests::seed;
    use super::*;

    #[derive(Clone, Default)]
    struct Recorder(Arc<Mutex<Vec<String>>>);

    impl Recorder {
        fn has(&self, line: &str) -> bool {
            self.0.lock().unwrap().iter().any(|l| l == line)
        }
        fn messages(&self) -> Vec<String> {
            self.0
                .lock()
                .unwrap()
                .iter()
                .filter_map(|l| l.strip_prefix("message ").map(str::to_owned))
                .collect()
        }
    }

    impl PlayerEvents for Recorder {
        fn state(&self, player: PlayerSnapshot) {
            self.0
                .lock()
                .unwrap()
                .push(format!("state {:?}", player.status));
        }
        fn queue(&self, queue: &QueueSnapshot) {
            self.0
                .lock()
                .unwrap()
                .push(format!("queue {:?}", queue.current));
        }
        fn position(&self, position_ms: u32) {
            self.0.lock().unwrap().push(format!("at {position_ms}"));
        }
        fn message(&self, text: String) {
            self.0.lock().unwrap().push(format!("message {text}"));
        }
    }

    /// Seed files by id. 9 is a text file; other ids are unknown.
    fn resolve() -> Resolve {
        Arc::new(|id| {
            let name = match id {
                0 => "tone.mp3",
                1 => "tone-vorbis.ogg",
                2 => "tone-pcm16.wav",
                3 => "truncated.mp3",
                4 => "damaged.ogg",
                5 => "tone-vbr.mp3",
                7 => "corrupt.mp3",
                9 => "README.md",
                _ => return None,
            };
            Some(seed(name))
        })
    }

    fn engine() -> (Engine<TestOutput, Recorder>, Recorder) {
        let recorder = Recorder::default();
        let engine = Engine::with_queue(
            TestOutput::default(),
            recorder.clone(),
            resolve(),
            Queue::new(7),
        );
        (engine, recorder)
    }

    /// Plays the current file to its end and runs one tick.
    fn play_to_end(engine: &mut Engine<TestOutput, Recorder>) {
        engine.output_mut().advance(Duration::from_secs(60));
        engine.tick();
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
        assert!(recorder.has("at 500"));
        play_to_end(&mut engine);
        assert_eq!(engine.queue().current, Some(2));
        play_to_end(&mut engine);
        assert_eq!(engine.state().status, PlayerStatus::Stopped);
        assert_eq!(engine.state().position_ms, 0);
        assert_eq!(
            engine.queue().current,
            Some(2),
            "repeat off stops on the last entry at position 0 (R6)"
        );
        assert!(recorder.messages().is_empty());
    }

    #[test]
    fn repeat_all_continues_from_the_first_entry() {
        let (mut engine, _) = engine();
        engine.set_repeat(RepeatMode::All);
        engine.play_list(vec![0, 1], 1);
        play_to_end(&mut engine);
        assert_eq!(engine.state().status, PlayerStatus::Playing);
        assert_eq!(engine.queue().current, Some(0));
    }

    #[test]
    fn repeat_one_restarts_the_current_entry() {
        let (mut engine, _) = engine();
        engine.set_repeat(RepeatMode::One);
        engine.play_list(vec![0, 1], 0);
        play_to_end(&mut engine);
        assert_eq!(engine.state().status, PlayerStatus::Playing);
        assert_eq!(engine.queue().current, Some(0));
        assert_eq!(engine.output_mut().position(), Duration::ZERO);
        engine.next();
        assert_eq!(engine.queue().current, Some(1), "Next still moves");
    }

    /// P7-AC2.
    #[test]
    fn stop_ends_playback_resets_the_position_and_keeps_the_queue() {
        let (mut engine, _) = engine();
        engine.play_list(vec![0, 1], 1);
        engine.output_mut().advance(Duration::from_millis(400));
        engine.tick();
        engine.stop();
        assert_eq!(engine.state().status, PlayerStatus::Stopped);
        assert_eq!(engine.state().position_ms, 0);
        assert_eq!(engine.queue().entries, [0, 1]);
        assert_eq!(engine.queue().current, Some(1));
        engine.play();
        assert_eq!(engine.state().status, PlayerStatus::Playing);
        assert_eq!(
            engine.queue().current,
            Some(1),
            "Play starts the current entry"
        );
    }

    #[test]
    fn toggle_pauses_and_resumes() {
        let (mut engine, _) = engine();
        engine.play_list(vec![0], 0);
        engine.toggle();
        assert_eq!(engine.state().status, PlayerStatus::Paused);
        engine.output_mut().advance(Duration::from_millis(300));
        assert_eq!(
            engine.output_mut().position(),
            Duration::ZERO,
            "the clock waits"
        );
        engine.toggle();
        assert_eq!(engine.state().status, PlayerStatus::Playing);
    }

    #[test]
    fn clear_stops_and_empties_the_queue() {
        let (mut engine, _) = engine();
        engine.play_list(vec![0, 1], 1);
        engine.handle(Command::ClearQueue);
        assert_eq!(engine.state().status, PlayerStatus::Stopped);
        assert_eq!(engine.state().position_ms, 0);
        assert_eq!(engine.queue(), QueueSnapshot::default());
    }

    /// P7-AC3: rule (a).
    #[test]
    fn a_corrupt_file_is_skipped_with_a_message() {
        let (mut engine, recorder) = engine();
        engine.play_list(vec![7, 0], 0);
        assert_eq!(engine.queue().current, Some(1));
        assert_eq!(engine.state().status, PlayerStatus::Playing);
        assert_eq!(recorder.messages(), ["Cannot play corrupt.mp3"]);
    }

    /// P7-AC3, AC-19.
    #[test]
    fn three_failures_in_a_row_stop_playback() {
        let (mut engine, recorder) = engine();
        engine.play_list(vec![7, 9, 7, 0], 0);
        assert_eq!(engine.state().status, PlayerStatus::Stopped);
        assert_eq!(recorder.messages().len(), 3);
    }

    #[test]
    fn a_good_file_resets_the_failure_count() {
        let (mut engine, _) = engine();
        engine.play_list(vec![7, 7, 0, 7, 7, 1], 0);
        assert_eq!(engine.queue().current, Some(2));
        play_to_end(&mut engine);
        assert_eq!(engine.queue().current, Some(5));
        assert_eq!(engine.state().status, PlayerStatus::Playing);
    }

    /// P7-AC3, P7.12: a file that ends early (rule c) shows the message and the next entry plays.
    #[test]
    fn a_file_that_ends_early_shows_a_message_and_playback_continues() {
        for (id, name) in [(3, "truncated.mp3"), (4, "damaged.ogg")] {
            let (mut engine, recorder) = engine();
            engine.play_list(vec![id, 0], 0);
            assert_eq!(engine.state().status, PlayerStatus::Playing, "{name}");
            assert!(
                recorder.messages().is_empty(),
                "{name}: no error before the end"
            );
            play_to_end(&mut engine);
            assert_eq!(recorder.messages(), [format!("Cannot play {name}")]);
            assert_eq!(engine.queue().current, Some(1), "{name}");
            assert_eq!(engine.state().status, PlayerStatus::Playing, "{name}");
        }
    }

    /// P7-AC3: a VBR MP3 with no Xing header has only an estimated length.
    #[test]
    fn a_vbr_mp3_with_no_xing_header_plays_to_its_end_with_no_message() {
        let (mut engine, recorder) = engine();
        engine.play_list(vec![5, 0], 0);
        play_to_end(&mut engine);
        assert!(recorder.messages().is_empty());
        assert_eq!(engine.queue().current, Some(1));
    }

    /// P7.4: the device fails while playing; the next Play opens it again.
    #[test]
    fn a_lost_device_stops_with_the_message_and_play_tries_again() {
        let (mut engine, recorder) = engine();
        engine.play_list(vec![0, 1], 0);
        engine.output_mut().lose_device = true;
        engine.tick();
        assert_eq!(engine.state().status, PlayerStatus::Stopped);
        assert_eq!(recorder.messages(), [DEVICE_MESSAGE]);
        assert_eq!(engine.queue().current, Some(0), "the queue stays");
        engine.play();
        assert_eq!(engine.state().status, PlayerStatus::Playing);
    }

    #[test]
    fn a_device_lost_while_paused_stops_before_the_next_command() {
        let (mut engine, recorder) = engine();
        engine.play_list(vec![0, 1], 0);
        engine.pause();
        engine.output_mut().lose_device = true;
        engine.tick();
        assert_eq!(
            engine.state().status,
            PlayerStatus::Paused,
            "ticks skip a paused player"
        );
        engine.handle(Command::Next);
        assert_eq!(recorder.messages(), [DEVICE_MESSAGE]);
        assert_eq!(
            engine.state().status,
            PlayerStatus::Playing,
            "Next opens the device again"
        );
        assert_eq!(engine.queue().current, Some(1));
    }

    #[test]
    fn play_after_add_to_queue_on_an_empty_queue_plays_every_entry() {
        let (mut engine, recorder) = engine();
        engine.append(vec![0, 1]);
        engine.play();
        assert_eq!(engine.queue().current, Some(0));
        assert!(recorder.has("queue Some(0)"));
        play_to_end(&mut engine);
        assert_eq!(engine.queue().current, Some(1));
        assert_eq!(engine.state().status, PlayerStatus::Playing);
    }

    #[test]
    fn seek_moves_the_position_only_while_a_file_plays() {
        let (mut engine, recorder) = engine();
        engine.seek(Duration::from_millis(500));
        assert!(!recorder.has("at 500"), "nothing plays");
        engine.play_list(vec![0], 0);
        engine.seek(Duration::from_millis(500));
        assert_eq!(engine.state().position_ms, 500);
        assert_eq!(engine.output_mut().position(), Duration::from_millis(500));
    }

    #[test]
    fn volume_goes_to_the_output_from_0_to_1() {
        let (mut engine, _) = engine();
        engine.set_volume(60);
        assert_eq!(engine.state().volume, 60);
        assert!((engine.output_mut().volume - 0.6).abs() < 1e-6);
        engine.set_volume(250);
        assert_eq!(engine.state().volume, 100);
    }

    #[test]
    fn previous_restarts_after_3_seconds_else_goes_back() {
        let (mut engine, _) = engine();
        engine.play_list(vec![0, 1], 1);
        engine.handle(Command::Seek(Duration::from_millis(900)));
        engine.previous();
        assert_eq!(engine.queue().current, Some(0));
        engine.next();
        assert_eq!(engine.queue().current, Some(1));
    }

    #[test]
    fn removing_the_playing_entry_starts_the_next() {
        let (mut engine, _) = engine();
        engine.play_list(vec![0, 1, 2], 1);
        engine.remove(1);
        assert_eq!(engine.queue().entries, [0, 2]);
        assert_eq!(engine.queue().current, Some(1));
        assert_eq!(engine.state().status, PlayerStatus::Playing);
    }

    #[test]
    fn removing_an_entry_before_the_playing_one_keeps_the_song_and_position() {
        let (mut engine, _) = engine();
        engine.play_list(vec![0, 1, 2], 2);
        engine.seek(Duration::from_millis(400));
        engine.remove(0);
        assert_eq!(engine.queue().current, Some(1));
        assert_eq!(engine.output_mut().position(), Duration::from_millis(400));
    }

    #[test]
    fn append_keeps_the_playing_song() {
        let (mut engine, recorder) = engine();
        engine.play_list(vec![0], 0);
        engine.append(vec![1, 2]);
        assert_eq!(engine.queue().entries, [0, 1, 2]);
        assert_eq!(engine.queue().current, Some(0));
        assert!(recorder.has("queue Some(0)"));
    }

    #[test]
    fn shuffle_and_repeat_show_in_the_state() {
        let (mut engine, _) = engine();
        engine.set_shuffle(true);
        engine.set_repeat(RepeatMode::All);
        assert!(engine.state().shuffle);
        assert_eq!(engine.state().repeat, RepeatMode::All);
    }

    #[test]
    fn the_thread_answers_commands() {
        let recorder = Recorder::default();
        let (handle, thread) =
            super::super::PlayerHandle::spawn(TestOutput::default, recorder, resolve());
        handle.send(Command::PlayList {
            ids: vec![0, 1],
            start: 0,
        });
        assert_eq!(handle.queue().entries, [0, 1]);
        assert_eq!(handle.state().status, PlayerStatus::Playing);
        handle.clear();
        assert_eq!(handle.queue(), QueueSnapshot::default());
        handle.send(Command::Shutdown);
        thread.join().unwrap();
    }
}
