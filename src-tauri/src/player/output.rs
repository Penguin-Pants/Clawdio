//! Audio output behind a trait (P4.9): rodio on the device, or a test output that decodes
//! with Symphonia and advances a virtual clock.

use std::fs::File;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use rodio::source::EmptyCallback;
use rodio::{Decoder, DeviceSinkBuilder, MixerDeviceSink, Player};

/// Why a file cannot play.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OutputError {
    /// The file cannot be opened or decoded.
    Decode(String),
    /// No audio device could be opened.
    Device(String),
}

/// One audio output. The player thread owns it, so it need not be `Send`.
pub trait AudioOutput {
    /// Replaces the current file with `path` and starts playing it.
    fn load(&mut self, path: &Path) -> Result<(), OutputError>;
    fn pause(&mut self);
    fn resume(&mut self);
    fn stop(&mut self);
    /// Position in the current file.
    fn position(&self) -> Duration;
    /// True once the current file played to its end.
    fn finished(&self) -> bool;
}

/// The device output (section 6.10). The device sink opens on the first `load`.
#[derive(Default)]
pub struct RodioOutput {
    sink: Option<MixerDeviceSink>,
    player: Option<Player>,
    ended: Arc<AtomicBool>,
}

impl RodioOutput {
    fn player(&mut self) -> Result<&Player, OutputError> {
        if self.sink.is_none() {
            let sink = DeviceSinkBuilder::from_default_device()
                .and_then(|builder| {
                    builder
                        .with_error_callback(|error| {
                            log::warn!("audio: output stream error: {error}")
                        })
                        .open_stream()
                })
                .map_err(|error| OutputError::Device(error.to_string()))?;
            self.player = Some(Player::connect_new(sink.mixer()));
            self.sink = Some(sink);
        }
        self.player
            .as_ref()
            .ok_or_else(|| OutputError::Device("no player".into()))
    }
}

impl AudioOutput for RodioOutput {
    fn load(&mut self, path: &Path) -> Result<(), OutputError> {
        let file = File::open(path).map_err(|error| OutputError::Decode(error.to_string()))?;
        let decoder =
            Decoder::try_from(file).map_err(|error| OutputError::Decode(error.to_string()))?;
        let ended = Arc::new(AtomicBool::new(false));
        self.ended = ended.clone();
        let player = self.player()?;
        player.clear();
        player.append(decoder);
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
        if let Some(player) = &self.player {
            player.clear();
        }
        self.ended = Arc::new(AtomicBool::new(false));
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
}

/// The decoded length of a file with Symphonia, by counting frames.
#[cfg(test)]
pub fn decoded_duration(path: &Path) -> Result<Duration, OutputError> {
    use symphonia::core::codecs::DecoderOptions;
    use symphonia::core::formats::FormatOptions;
    use symphonia::core::io::MediaSourceStream;
    use symphonia::core::meta::MetadataOptions;
    use symphonia::core::probe::Hint;

    let decode = |error: symphonia::core::errors::Error| OutputError::Decode(error.to_string());
    let file = File::open(path).map_err(|error| OutputError::Decode(error.to_string()))?;
    let stream = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    if let Some(extension) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(extension);
    }
    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            stream,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(decode)?;
    let mut format = probed.format;
    let track = format
        .default_track()
        .ok_or_else(|| OutputError::Decode("no audio track".into()))?
        .clone();
    let rate = track
        .codec_params
        .sample_rate
        .ok_or_else(|| OutputError::Decode("no sample rate".into()))?;
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(decode)?;
    let mut frames: u64 = 0;
    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(symphonia::core::errors::Error::IoError(error))
                if error.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break
            }
            Err(error) => return Err(decode(error)),
        };
        if packet.track_id() != track.id {
            continue;
        }
        frames += decoder.decode(&packet).map_err(decode)?.frames() as u64;
    }
    Ok(Duration::from_secs_f64(frames as f64 / f64::from(rate)))
}

/// Test output (P4.9): decodes with Symphonia and plays on a virtual clock moved by
/// `advance`. No audio device is needed.
#[cfg(test)]
#[derive(Default)]
pub struct TestOutput {
    length: Option<Duration>,
    clock: Duration,
    paused: bool,
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
        self.length = Some(decoded_duration(path)?);
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
        self.clock = Duration::ZERO;
    }

    fn position(&self) -> Duration {
        self.clock
    }

    fn finished(&self) -> bool {
        self.length.is_some_and(|length| self.clock >= length)
    }
}
