//! The playback state machine (P7.2): what each command and tick does, independent of the
//! thread and of the output kind. `clawdio_core::queue` decides what plays.

use std::path::PathBuf;
use std::sync::mpsc::Sender;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use clawdio_core::api::{MicDucking, PlayerSnapshot, PlayerStatus, QueueSnapshot, RepeatMode};
use clawdio_core::queue::{Queue, Removed, Step};

use super::duck::{Action, Duck, Ramp};
use super::output::{AudioOutput, OutputError};
use super::{PlayerEvents, Resolve, DEVICE_MESSAGE, MAX_FAILURES};

#[derive(Debug)]
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
    /// The saved queue at startup (P9.1): paused at the position, with nothing loaded.
    Restore {
        ids: Vec<u32>,
        current: Option<usize>,
        position_ms: u32,
        volume: u8,
    },
    /// Another app records from a microphone (R34.2). The Windows detector sends it (P20.2).
    #[cfg_attr(not(windows), allow(dead_code))]
    MicBusy,
    /// No other app records from a microphone.
    #[cfg_attr(not(windows), allow(dead_code))]
    MicFree,
    /// The ducking settings (R34.1, R34.3).
    SetDuck {
        mode: MicDucking,
        percent: u8,
    },
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
    /// Set after a restore: Paused with no file loaded. Play loads the current entry and
    /// seeks here (P9.1).
    resume_at: Option<u32>,
    /// Microphone ducking (P20.3). `volume` stays the user volume (R34.6).
    duck: Duck,
    /// Files started (wraps): a restart of the same song is a new play, so the lyrics fetch
    /// tries an error again (P24.5).
    plays: u32,
    /// Entries started (wraps), without a restart of the same entry: the lists follow each new
    /// value (R35.3, D63).
    started: u32,
    /// The duck factor the output applies (D52).
    gain: Ramp,
    /// The time source: the real clock, or a fake one in tests.
    clock: Box<dyn Fn() -> Instant>,
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
            resume_at: None,
            duck: Duck::default(),
            plays: 0,
            started: 0,
            gain: Ramp::flat(1.0, Instant::now()),
            clock: Box::new(Instant::now),
        }
    }

    #[cfg(test)]
    pub fn set_clock(&mut self, clock: impl Fn() -> Instant + 'static) {
        self.clock = Box::new(clock);
    }

    /// The next duck timer, so the player thread wakes for it (D52).
    pub fn next_deadline(&self) -> Option<Instant> {
        self.duck.next_deadline()
    }

    fn playing(&self) -> bool {
        self.status == PlayerStatus::Playing
    }

    /// Does what the duck decided.
    fn apply_duck(&mut self, actions: Vec<Action>) {
        for action in actions {
            match action {
                Action::Fade { from, to, over } => {
                    let now = (self.clock)();
                    let from = from.unwrap_or_else(|| self.gain.at(now));
                    self.gain = Ramp::new(from, to, now, over);
                    self.output.set_gain(self.gain);
                }
                Action::Pause => {
                    if self.playing() {
                        self.output.pause();
                        self.status = PlayerStatus::Paused;
                        self.announce();
                    }
                }
                Action::Resume => {
                    if self.status == PlayerStatus::Paused && self.resume_at.is_none() {
                        self.output.resume();
                        self.status = PlayerStatus::Playing;
                        self.announce();
                    }
                }
            }
        }
    }

    fn mic(&mut self, busy: bool) {
        let now = (self.clock)();
        let actions = if busy {
            log::info!("ducking: microphone busy");
            self.duck.busy(now, self.playing())
        } else {
            log::info!("ducking: microphone free");
            self.duck.free(now)
        };
        self.apply_duck(actions);
    }

    fn set_duck(&mut self, mode: MicDucking, percent: u8) {
        let now = (self.clock)();
        let actions = self.duck.set(mode, percent, now, self.playing());
        self.apply_duck(actions);
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
            started: self.started,
        }
    }

    fn announce(&self) {
        self.events.state(self.state());
        self.announce_songs();
    }

    fn announce_queue(&self) {
        self.events.queue(&self.queue.snapshot());
        self.announce_songs();
    }

    /// The playing and the next song for the automatic lyrics fetch (P24.5, D61): a shuffle or
    /// repeat change sends only `player-state`, so both announcements send it.
    fn announce_songs(&self) {
        let playing = (self.status != PlayerStatus::Stopped)
            .then(|| self.queue.current())
            .flatten()
            .and_then(|index| self.queue.entries().get(index).copied());
        let next = playing.and(self.queue.peek_next());
        self.events.songs(playing, next, u64::from(self.plays));
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
    /// `restart` is true when the current entry starts again (Repeat one, Previous after 3 s,
    /// Play on a restored queue): the playing song does not change.
    fn play_index(&mut self, mut index: usize, restart: bool) {
        let first = index;
        self.resume_at = None;
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
                    self.plays = self.plays.wrapping_add(1);
                    if !restart || index != first {
                        self.started = self.started.wrapping_add(1);
                    }
                    self.status = PlayerStatus::Playing;
                    if self.duck.holds_pause() {
                        // A track change during a Pause duck: the duck stays (E-35).
                        self.output.pause();
                        self.status = PlayerStatus::Paused;
                    }
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
            Step::Play(index) => self.play_index(index, false),
            Step::Restart => match self.queue.current() {
                Some(current) => self.play_index(current, true),
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
        self.resume_at = None;
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

    /// The saved queue, paused at the saved position, and the saved volume (P9.1, R27).
    /// A queue the user started first wins: the restore is then ignored.
    pub fn restore(&mut self, ids: Vec<u32>, current: Option<usize>, position_ms: u32, volume: u8) {
        if !self.queue.entries().is_empty() || self.status != PlayerStatus::Stopped {
            log::info!("player: a queue is in use; the saved queue is not restored");
            return;
        }
        self.set_volume(volume);
        match current.and_then(|start| self.queue.replace(ids.clone(), start)) {
            Some(_) => {
                self.status = PlayerStatus::Paused;
                self.position_ms = position_ms;
                self.resume_at = Some(position_ms);
            }
            None => {
                // No current entry: the queue only, stopped.
                self.queue.clear();
                self.queue.append(&ids);
            }
        }
        self.announce_queue();
        self.announce();
    }

    /// Replaces the queue with `ids` and plays from `start` (R6 queue rule).
    pub fn play_list(&mut self, ids: Vec<u32>, start: usize) {
        if let Some(start) = self.queue.replace(ids, start) {
            let actions = self.duck.user_play();
            self.apply_duck(actions);
            self.failures = 0;
            self.play_index(start, false);
        }
    }

    pub fn play(&mut self) {
        if !self.playing() {
            let actions = self.duck.user_play();
            self.apply_duck(actions);
        }
        match self.status {
            PlayerStatus::Playing => {}
            PlayerStatus::Paused => {
                if let Some(at) = self.resume_at.take() {
                    // A restored queue: load the current entry, then go to the saved position.
                    self.failures = 0;
                    let saved = self.queue.current().unwrap_or(0);
                    self.play_index(saved, true);
                    // The position belongs to the saved entry, not to one after a skip.
                    if at > 0
                        && self.status == PlayerStatus::Playing
                        && self.queue.current() == Some(saved)
                    {
                        self.seek(Duration::from_millis(u64::from(at)));
                    }
                    return;
                }
                self.output.resume();
                self.status = PlayerStatus::Playing;
                self.announce();
            }
            PlayerStatus::Stopped => {
                if !self.queue.entries().is_empty() {
                    self.failures = 0;
                    self.play_index(self.queue.current().unwrap_or(0), false);
                }
            }
        }
    }

    pub fn pause(&mut self) {
        let actions = self.duck.user_halt();
        self.apply_duck(actions);
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
        let actions = self.duck.user_halt();
        self.apply_duck(actions);
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
        let at = to.as_millis().min(u32::MAX as u128) as u32;
        if self.resume_at.is_some() {
            // Nothing is loaded yet: Play starts there.
            self.resume_at = Some(at);
            self.position_ms = at;
            self.events.position(at);
            self.announce();
            return;
        }
        if self.status != PlayerStatus::Stopped && self.output.seek(to) {
            self.position_ms = to.as_millis().min(u32::MAX as u128) as u32;
            self.events.position(self.position_ms);
            // The state carries the new position to the OS controls, also while paused (P8.3).
            self.announce();
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
        let now = (self.clock)();
        let actions = self.duck.poll(now, self.playing());
        self.apply_duck(actions);
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
            Command::Restore {
                ids,
                current,
                position_ms,
                volume,
            } => self.restore(ids, current, position_ms, volume),
            Command::MicBusy => self.mic(true),
            Command::MicFree => self.mic(false),
            Command::SetDuck { mode, percent } => self.set_duck(mode, percent),
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
        fn songs(&self, playing: Option<u32>, next: Option<u32>, play: u64) {
            let mut lines = self.0.lock().unwrap();
            lines.push(format!("songs {playing:?} {next:?}"));
            lines.push(format!("play {play}"));
        }
    }

    impl Recorder {
        fn last_songs(&self) -> Option<String> {
            self.0
                .lock()
                .unwrap()
                .iter()
                .rev()
                .find(|line| line.starts_with("songs "))
                .cloned()
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

    /// P24.5, P24-AC6: the engine reports the playing and the next song; a repeat or shuffle
    /// change and a queue edit report the new next song; stopped reports none.
    #[test]
    fn the_playing_and_next_song_follow_play_state_and_order() {
        let (mut engine, recorder) = engine();
        engine.append(vec![0, 1]);
        assert_eq!(
            recorder.last_songs().as_deref(),
            Some("songs None None"),
            "stopped"
        );
        engine.play();
        assert_eq!(
            recorder.last_songs().as_deref(),
            Some("songs Some(0) Some(1)")
        );
        engine.set_repeat(RepeatMode::One);
        assert_eq!(recorder.last_songs().as_deref(), Some("songs Some(0) None"));
        engine.set_repeat(RepeatMode::Off);
        engine.append(vec![2]);
        engine.remove(1);
        assert_eq!(
            recorder.last_songs().as_deref(),
            Some("songs Some(0) Some(2)")
        );
        engine.set_shuffle(true);
        let next = engine.queue.peek_next();
        assert_eq!(
            recorder.last_songs(),
            Some(format!("songs Some(0) {next:?}"))
        );
        engine.pause();
        assert!(
            recorder.last_songs().unwrap().starts_with("songs Some(0)"),
            "paused"
        );
        engine.stop();
        assert_eq!(recorder.last_songs().as_deref(), Some("songs None None"));
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
    fn a_seek_while_paused_announces_the_state_with_the_new_position() {
        let (mut engine, recorder) = engine();
        engine.play_list(vec![0], 0);
        engine.pause();
        recorder.0.lock().unwrap().clear();
        engine.seek(Duration::from_millis(700));
        assert!(recorder.has("state Paused"));
        assert_eq!(engine.state().position_ms, 700);
    }

    #[test]
    fn a_restored_queue_is_paused_and_play_starts_at_the_saved_position() {
        let (mut engine, _) = engine();
        engine.restore(vec![0, 1, 2], Some(1), 400, 60);
        assert_eq!(engine.state().status, PlayerStatus::Paused);
        assert_eq!(engine.state().position_ms, 400);
        assert_eq!(engine.state().volume, 60);
        assert_eq!(engine.queue().current, Some(1));
        assert_eq!(
            engine.output_mut().position(),
            Duration::ZERO,
            "nothing loaded"
        );
        engine.seek(Duration::from_millis(600));
        assert_eq!(engine.state().position_ms, 600);
        engine.play();
        assert_eq!(engine.state().status, PlayerStatus::Playing);
        assert_eq!(engine.output_mut().position(), Duration::from_millis(600));
        assert_eq!(engine.queue().current, Some(1));
    }

    #[test]
    fn a_restore_after_the_user_started_a_queue_is_ignored() {
        let (mut engine, _) = engine();
        engine.play_list(vec![2], 0);
        engine.restore(vec![0, 1], Some(1), 400, 60);
        assert_eq!(engine.queue().entries, [2]);
        assert_eq!(engine.state().status, PlayerStatus::Playing);
        assert_eq!(engine.state().volume, 100);
    }

    #[test]
    fn a_saved_entry_that_cannot_open_skips_without_the_saved_position() {
        let (mut engine, _) = engine();
        engine.restore(vec![7, 0], Some(0), 600, 100);
        engine.play();
        assert_eq!(engine.queue().current, Some(1));
        assert_eq!(engine.output_mut().position(), Duration::ZERO);
    }

    #[test]
    fn next_after_a_restore_plays_the_next_entry_from_the_start() {
        let (mut engine, _) = engine();
        engine.restore(vec![0, 1], Some(0), 400, 100);
        engine.next();
        assert_eq!(engine.queue().current, Some(1));
        assert_eq!(engine.output_mut().position(), Duration::ZERO);
        engine.pause();
        engine.play();
        assert_eq!(
            engine.output_mut().position(),
            Duration::ZERO,
            "no old seek"
        );
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

    /// The exit flush: after `sync`, the events of every earlier command have run.
    #[test]
    fn sync_returns_after_earlier_commands_sent_their_events() {
        let recorder = Recorder::default();
        let (handle, thread) =
            super::super::PlayerHandle::spawn(TestOutput::default, recorder.clone(), resolve());
        handle.send(Command::PlayList {
            ids: vec![0, 1],
            start: 1,
        });
        handle.sync(Duration::from_secs(5));
        assert!(recorder.has("queue Some(1)"));
        handle.send(Command::Shutdown);
        thread.join().unwrap();
    }

    /// An engine on a fake clock (P20-AC1). The returned cell moves the time.
    fn ducking_engine() -> (
        Engine<TestOutput, Recorder>,
        std::rc::Rc<std::cell::Cell<Instant>>,
    ) {
        let (mut engine, _) = engine();
        let now = std::rc::Rc::new(std::cell::Cell::new(Instant::now()));
        let clock = now.clone();
        engine.set_clock(move || clock.get());
        (engine, now)
    }

    fn later(now: &std::cell::Cell<Instant>, ms: u64) {
        now.set(now.get() + Duration::from_millis(ms));
    }

    fn gain_at(engine: &mut Engine<TestOutput, Recorder>, at: Instant) -> f32 {
        engine.output_mut().gain.expect("a duck ramp").at(at)
    }

    /// P20-AC1, E-35: Pause mode fades down, pauses, keeps the pause across a track change and
    /// resumes with a fade in after the 1 s wait. The volume stays the user volume (R34.6).
    #[test]
    fn a_pause_duck_survives_a_track_change_and_resumes_after_the_wait() {
        let (mut engine, now) = ducking_engine();
        engine.set_volume(80);
        engine.handle(Command::SetDuck {
            mode: MicDucking::Pause,
            percent: 20,
        });
        engine.play_list(vec![0, 1], 0);
        engine.handle(Command::MicBusy);
        let start = now.get();
        assert_eq!(
            engine.next_deadline(),
            Some(start + Duration::from_millis(150))
        );
        assert_eq!(gain_at(&mut engine, start), 1.0);
        assert!((gain_at(&mut engine, start + Duration::from_millis(75)) - 0.5).abs() < 1e-4);
        assert_eq!(
            gain_at(&mut engine, start + Duration::from_millis(150)),
            0.0
        );
        later(&now, 149);
        engine.tick();
        assert_eq!(engine.state().status, PlayerStatus::Playing);
        later(&now, 1);
        engine.tick();
        assert_eq!(engine.state().status, PlayerStatus::Paused);
        assert_eq!(
            engine.state().volume,
            80,
            "the saved volume is the user volume"
        );
        engine.handle(Command::Next);
        assert_eq!(engine.queue().current, Some(1));
        assert_eq!(
            engine.state().status,
            PlayerStatus::Paused,
            "the duck stays"
        );
        engine.handle(Command::MicFree);
        later(&now, 999);
        engine.tick();
        assert_eq!(engine.state().status, PlayerStatus::Paused);
        later(&now, 1);
        engine.tick();
        assert_eq!(engine.state().status, PlayerStatus::Playing);
        let resumed = now.get();
        assert_eq!(gain_at(&mut engine, resumed), 0.0, "a fade in");
        assert_eq!(
            gain_at(&mut engine, resumed + Duration::from_millis(500)),
            1.0
        );
    }

    /// P20-AC1, R34.6: a volume change during a Lower duck sets the user volume; the duck
    /// factor stays on top of it.
    #[test]
    fn a_volume_change_during_a_lower_duck_keeps_the_duck() {
        let (mut engine, now) = ducking_engine();
        engine.set_volume(60);
        engine.handle(Command::SetDuck {
            mode: MicDucking::Lower,
            percent: 20,
        });
        engine.play_list(vec![0], 0);
        engine.handle(Command::MicBusy);
        later(&now, 150);
        engine.handle(Command::SetVolume(40));
        assert_eq!(engine.state().volume, 40);
        assert_eq!(engine.output_mut().volume, 0.4);
        assert_eq!(gain_at(&mut engine, now.get()), 0.2, "40 plays at 8");
    }

    /// E-38: Stop during a Pause duck: Play later plays normally and "free" resumes nothing.
    #[test]
    fn stop_during_a_pause_duck_gives_no_resume() {
        let (mut engine, now) = ducking_engine();
        engine.handle(Command::SetDuck {
            mode: MicDucking::Pause,
            percent: 20,
        });
        engine.play_list(vec![0], 0);
        engine.handle(Command::MicBusy);
        later(&now, 150);
        engine.tick();
        engine.handle(Command::Stop);
        engine.handle(Command::MicFree);
        later(&now, 1000);
        engine.tick();
        assert_eq!(engine.state().status, PlayerStatus::Stopped);
    }

    static LOG_LINES: Mutex<Vec<String>> = Mutex::new(Vec::new());

    struct Capture;

    impl log::Log for Capture {
        fn enabled(&self, _: &log::Metadata<'_>) -> bool {
            true
        }
        fn log(&self, record: &log::Record<'_>) {
            if let Ok(mut lines) = LOG_LINES.lock() {
                lines.push(record.args().to_string());
            }
        }
        fn flush(&self) {}
    }

    /// P20-AC6: the duck logs the two state changes only, never an app name, path or id.
    #[test]
    fn ducking_logs_only_busy_and_free() {
        static INSTALL: std::sync::Once = std::sync::Once::new();
        INSTALL.call_once(|| {
            let _ = log::set_logger(&Capture);
            log::set_max_level(log::LevelFilter::Info);
        });
        let (mut engine, now) = ducking_engine();
        engine.handle(Command::SetDuck {
            mode: MicDucking::Lower,
            percent: 20,
        });
        engine.play_list(vec![0], 0);
        engine.handle(Command::MicBusy);
        engine.handle(Command::MicFree);
        later(&now, 1000);
        engine.tick();
        let lines: Vec<String> = LOG_LINES
            .lock()
            .unwrap()
            .iter()
            .filter(|line| line.starts_with("ducking"))
            .cloned()
            .collect();
        assert!(!lines.is_empty());
        for line in lines {
            assert!(
                line == "ducking: microphone busy" || line == "ducking: microphone free",
                "{line}"
            );
        }
    }
}
