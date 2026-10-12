//! Audio output behind a trait (P4.9, P7.2): rodio on the device, or a test output that
//! decodes with the same source and advances a virtual clock.

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use rodio::source::EmptyCallback;
use rodio::{DeviceSinkBuilder, MixerDeviceSink, Player};

use super::source::TrackSource;

/// Why a file cannot play, or why playback stopped.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OutputError {
    /// The file cannot be opened or decoded (D32).
    Decode(String),
    /// No audio device could be opened, or the device went away (section 5).
    Device(String),
}

/// One audio output. The player thread owns it, so it need not be `Send`.
pub trait AudioOutput {
    /// Replaces the current file with `path` and starts playing it.
    fn load(&mut self, path: &Path) -> Result<(), OutputError>;
    fn pause(&mut self);
    fn resume(&mut self);
    fn stop(&mut self);
    /// Moves to `to` in the current file. False when the file cannot seek.
    fn seek(&mut self, to: Duration) -> bool;
    /// Volume from 0 to 1.
    fn set_volume(&mut self, volume: f32);
    /// Position in the current file.
    fn position(&self) -> Duration;
    /// True once the current file played to its end.
    fn finished(&self) -> bool;
    /// The device failed since the last check: the reason. The output closes it, so the next
    /// `load` opens the default device (P7.4). Returned once.
    fn device_lost(&mut self) -> Option<String>;
    /// A decode error of the current file (D32 rules b and c), returned once.
    fn take_decode_error(&mut self) -> Option<OutputError>;
    /// An error that happened while playing: a lost device first, else a decode error.
    fn take_error(&mut self) -> Option<OutputError> {
        if let Some(reason) = self.device_lost() {
            return Some(OutputError::Device(reason));
        }
        self.take_decode_error()
    }
}

/// The device output (section 6.10). The device sink opens on the first `load`, and again on
/// the next `load` after the device failed (P7.4).
pub struct RodioOutput {
    sink: Option<MixerDeviceSink>,
    player: Option<Player>,
    ended: Arc<AtomicBool>,
    decode_errors: Option<Receiver<String>>,
    device_error: Arc<Mutex<Option<String>>>,
    volume: f32,
}

impl Default for RodioOutput {
    fn default() -> Self {
        RodioOutput {
            sink: None,
            player: None,
            ended: Arc::default(),
            decode_errors: None,
            device_error: Arc::default(),
            volume: 1.0,
        }
    }
}

impl RodioOutput {
    fn player(&mut self) -> Result<&Player, OutputError> {
        // A device that failed while idle opens again now, not on the next Play.
        let _ = self.device_lost();
        if self.sink.is_none() {
            let failed = self.device_error.clone();
            let mut sink = DeviceSinkBuilder::from_default_device()
                .and_then(|builder| {
                    builder
                        .with_error_callback(move |error| {
                            // An underrun is a short glitch; the stream keeps playing.
                            if matches!(error, rodio::cpal::StreamError::BufferUnderrun) {
                                log::debug!("audio: {error}");
                                return;
                            }
                            log::warn!("audio: output stream error: {error}");
                            if let Ok(mut slot) = failed.lock() {
                                slot.get_or_insert_with(|| error.to_string());
                            }
                        })
                        .open_stream()
                })
                .map_err(|error| OutputError::Device(error.to_string()))?;
            // The app closes the sink on purpose (a lost device, the exit): no stderr note.
            sink.log_on_drop(false);
            let player = Player::connect_new(sink.mixer());
            player.set_volume(self.volume);
            self.player = Some(player);
            self.sink = Some(sink);
        }
        self.player
            .as_ref()
            .ok_or_else(|| OutputError::Device("no player".into()))
    }

    /// Drops the device, so the next `load` opens the current default device (P7.4).
    fn close_device(&mut self) {
        self.player = None;
        self.sink = None;
    }

    /// Drops the current sources with a new `Player` on the same mixer. `Player::clear` waits
    /// for the mixer thread, which a dead stream never runs.
    fn fresh_player(&mut self) {
        if let Some(sink) = &self.sink {
            let player = Player::connect_new(sink.mixer());
            player.set_volume(self.volume);
            self.player = Some(player);
        }
    }
}

impl AudioOutput for RodioOutput {
    fn load(&mut self, path: &Path) -> Result<(), OutputError> {
        let (sender, receiver) = mpsc::channel();
        let source = TrackSource::open(path, sender).map_err(OutputError::Decode)?;
        let ended = Arc::new(AtomicBool::new(false));
        self.ended = ended.clone();
        self.decode_errors = Some(receiver);
        self.player()?;
        self.fresh_player();
        let player = self
            .player
            .as_ref()
            .ok_or_else(|| OutputError::Device("no player".into()))?;
        player.append(source);
        // The callback source runs when the track before it has ended (section 6.10).
        player.append(EmptyCallback::new(Box::new(move || {
            ended.store(true, Ordering::Relaxed)
        })));
        player.play();
        Ok(())
    }

    fn pause(&mut self) {
        if let Some(player) = &self.player {
            player.pause();
        }
    }

    fn resume(&mut self) {
        if let Some(player) = &self.player {
            player.play();
        }
    }

    fn stop(&mut self) {
        self.fresh_player();
        self.ended = Arc::new(AtomicBool::new(false));
        self.decode_errors = None;
    }

    fn seek(&mut self, to: Duration) -> bool {
        self.player
            .as_ref()
            .is_some_and(|player| player.try_seek(to).is_ok())
    }

    fn set_volume(&mut self, volume: f32) {
        self.volume = volume.clamp(0.0, 1.0);
        if let Some(player) = &self.player {
            player.set_volume(self.volume);
        }
    }

    fn position(&self) -> Duration {
        self.player
            .as_ref()
            .map(Player::get_pos)
            .unwrap_or_default()
    }

    fn finished(&self) -> bool {
        self.ended.load(Ordering::Relaxed)
    }

    fn device_lost(&mut self) -> Option<String> {
        let lost = self
            .device_error
            .lock()
            .ok()
            .and_then(|mut slot| slot.take());
        if lost.is_some() {
            self.close_device();
        }
        lost
    }

    fn take_decode_error(&mut self) -> Option<OutputError> {
        self.decode_errors
            .as_ref()
            .and_then(|errors| errors.try_recv().ok())
            .map(OutputError::Decode)
    }
}

/// Test output (P4.9, P7.12): decodes the whole file with the engine's source at `load` and
/// plays it on a virtual clock moved by `advance`. A decode error shows when the clock reaches
/// the point where it happened. No audio device is needed.
#[cfg(test)]
#[derive(Default)]
pub struct TestOutput {
    length: Option<Duration>,
    error: Option<String>,
    clock: Duration,
    paused: bool,
    pub volume: f32,
    /// Set by a test: the device fails at the next `take_error`.
    pub lose_device: bool,
}

#[cfg(test)]
impl TestOutput {
    /// Moves the virtual clock while playing.
    pub fn advance(&mut self, by: Duration) {
        if let Some(length) = self.length {
            if !self.paused {
                self.clock = (self.clock + by).min(length);
            }
        }
    }
}

#[cfg(test)]
impl AudioOutput for TestOutput {
    fn load(&mut self, path: &Path) -> Result<(), OutputError> {
        let (sender, receiver) = mpsc::channel();
        let mut source = TrackSource::open(path, sender).map_err(OutputError::Decode)?;
        while source.next().is_some() {}
        self.length = Some(Duration::from_secs_f64(
            source.frames() as f64 / f64::from(source.rate()),
        ));
        self.error = receiver.try_recv().ok();
        self.clock = Duration::ZERO;
        self.paused = false;
        Ok(())
    }

    fn pause(&mut self) {
        self.paused = true;
    }

    fn resume(&mut self) {
        self.paused = false;
    }

    fn stop(&mut self) {
        self.length = None;
        self.error = None;
        self.clock = Duration::ZERO;
    }

    fn seek(&mut self, to: Duration) -> bool {
        match self.length {
            Some(length) => {
                self.clock = to.min(length);
                true
            }
            None => false,
        }
    }

    fn set_volume(&mut self, volume: f32) {
        self.volume = volume;
    }

    fn position(&self) -> Duration {
        self.clock
    }

    fn finished(&self) -> bool {
        self.error.is_none() && self.length.is_some_and(|length| self.clock >= length)
    }

    fn device_lost(&mut self) -> Option<String> {
        if !self.lose_device {
            return None;
        }
        self.lose_device = false;
        self.stop();
        Some("the test device went away".into())
    }

    fn take_decode_error(&mut self) -> Option<OutputError> {
        let at_end = self.length.is_some_and(|length| self.clock >= length);
        if at_end {
            return self.error.take().map(OutputError::Decode);
        }
        None
    }
}
