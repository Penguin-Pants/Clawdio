//! The engine's own decoder (P7.3, D32): a rodio `Source` over Symphonia 0.5.5 that reports
//! decode errors. `rodio::Decoder` hides them, and Symphonia reports a cut-off file as a
//! normal end of stream, so the source checks the stated duration itself.

use std::fs::File;
use std::io::Read;
use std::num::NonZero;
use std::path::Path;
use std::sync::mpsc::Sender;
use std::time::Duration;

use rodio::source::SeekError;
use rodio::Source;
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::{Decoder, DecoderOptions};
use symphonia::core::errors::Error;
use symphonia::core::formats::{FormatOptions, FormatReader, SeekMode, SeekTo};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use symphonia::core::units::Time;

/// More packet errors in a row than this end the file (D32 rule b).
const MAX_BAD_PACKETS: u32 = 3;
/// An end of stream this much before the stated duration is an error (D32 rule c).
const EARLY_END: Duration = Duration::from_secs(2);

/// Packet decode errors in a row (D32 rule b): one bad packet is skipped; more than three in
/// a row end the file.
#[derive(Debug, Default)]
struct PacketErrors(u32);

impl PacketErrors {
    /// Records a bad packet. True when the file must end.
    fn bad(&mut self) -> bool {
        self.0 += 1;
        self.0 > MAX_BAD_PACKETS
    }

    fn good(&mut self) {
        self.0 = 0;
    }
}

/// Whether an MP3 file states its length in a Xing, Info or VBRI tag. Without one Symphonia
/// estimates the length from the bitrate, and an estimate never triggers rule (c) (D32).
fn mp3_states_length(path: &Path) -> bool {
    let mut head = Vec::with_capacity(16 * 1024);
    let Ok(file) = File::open(path) else {
        return false;
    };
    if file.take(16 * 1024).read_to_end(&mut head).is_err() {
        return false;
    }
    // Skip an ID3v2 tag: "ID3", version, flags, then a 28-bit size.
    let mut start = 0;
    if head.starts_with(b"ID3") && head.len() >= 10 {
        let size = head[6..10]
            .iter()
            .fold(0usize, |size, byte| (size << 7) | usize::from(byte & 0x7f));
        start = 10 + size;
    }
    let first_frame = head.get(start..).unwrap_or_default();
    let window = &first_frame[..first_frame.len().min(1_500)];
    [b"Xing", b"Info", b"VBRI"]
        .iter()
        .any(|tag| window.windows(4).any(|bytes| bytes == *tag))
}

/// A playing file. Decode errors go to `errors` as text; the engine reads them (D32).
pub struct TrackSource {
    format: Box<dyn FormatReader>,
    decoder: Box<dyn Decoder>,
    track_id: u32,
    rate: u32,
    channels: u16,
    /// Interleaved samples of the last decoded packet.
    buffer: Vec<f32>,
    position: usize,
    frames: u64,
    /// The length the container states, in frames (D32 rule c). None when only estimated.
    stated_frames: Option<u64>,
    bad_packets: PacketErrors,
    ended: bool,
    errors: Sender<String>,
}

impl TrackSource {
    /// Opens `path` (D32 rule a: a failure to open or probe is an error).
    pub fn open(path: &Path, errors: Sender<String>) -> Result<Self, String> {
        let file = File::open(path).map_err(|error| error.to_string())?;
        let stream = MediaSourceStream::new(Box::new(file), Default::default());
        let extension = path
            .extension()
            .and_then(|e| e.to_str())
            .map(str::to_ascii_lowercase);
        let mut hint = Hint::new();
        if let Some(extension) = &extension {
            hint.with_extension(extension);
        }
        let probed = symphonia::default::get_probe()
            .format(
                &hint,
                stream,
                &FormatOptions::default(),
                &MetadataOptions::default(),
            )
            .map_err(|error| error.to_string())?;
        let format = probed.format;
        let track = format
            .default_track()
            .ok_or_else(|| "no audio track".to_string())?;
        let params = track.codec_params.clone();
        let rate = params
            .sample_rate
            .ok_or_else(|| "no sample rate".to_string())?;
        let channels = params
            .channels
            .map_or(2, |channels| channels.count() as u16);
        let decoder = symphonia::default::get_codecs()
            .make(&params, &DecoderOptions::default())
            .map_err(|error| error.to_string())?;
        let stated_frames = match extension.as_deref() {
            Some("mp3") if !mp3_states_length(path) => None,
            _ => params.n_frames,
        };
        Ok(TrackSource {
            track_id: track.id,
            format,
            decoder,
            rate,
            channels: channels.max(1),
            buffer: Vec::new(),
            position: 0,
            frames: 0,
            stated_frames,
            bad_packets: PacketErrors::default(),
            ended: false,
            errors,
        })
    }

    /// The length the container states, if it states one.
    pub fn stated_length(&self) -> Option<Duration> {
        self.stated_frames
            .map(|frames| Duration::from_secs_f64(frames as f64 / f64::from(self.rate)))
    }

    /// Frames decoded so far.
    #[cfg(test)]
    pub fn frames(&self) -> u64 {
        self.frames
    }

    #[cfg(test)]
    pub fn rate(&self) -> u32 {
        self.rate
    }

    fn fail(&mut self, reason: String) -> bool {
        self.ended = true;
        let _ = self.errors.send(reason);
        false
    }

    /// Decodes the next packet into the buffer. False at the end of the file or on an error.
    fn refill(&mut self) -> bool {
        if self.ended {
            return false;
        }
        loop {
            let packet = match self.format.next_packet() {
                Ok(packet) => packet,
                Err(Error::IoError(error)) if error.kind() == std::io::ErrorKind::UnexpectedEof => {
                    self.ended = true;
                    // D32 rule c: a stream that ends well before its stated length was cut off.
                    let early = u64::from(self.rate) * EARLY_END.as_secs();
                    if let Some(stated) = self.stated_frames {
                        if self.frames + early < stated {
                            return self.fail(format!(
                                "the file ends at {} of {} frames",
                                self.frames, stated
                            ));
                        }
                    }
                    return false;
                }
                Err(error) => return self.fail(error.to_string()),
            };
            if packet.track_id() != self.track_id {
                continue;
            }
            match self.decoder.decode(&packet) {
                Ok(decoded) => {
                    self.bad_packets.good();
                    if decoded.frames() == 0 {
                        continue;
                    }
                    let spec = *decoded.spec();
                    let mut samples = SampleBuffer::<f32>::new(decoded.capacity() as u64, spec);
                    samples.copy_interleaved_ref(decoded);
                    self.channels = (spec.channels.count() as u16).max(1);
                    self.frames += (samples.samples().len() / usize::from(self.channels)) as u64;
                    self.buffer.clear();
                    self.buffer.extend_from_slice(samples.samples());
                    self.position = 0;
                    return true;
                }
                // D32 rule b: one bad packet is skipped and logged; more than three in a row end it.
                Err(Error::DecodeError(reason)) => {
                    log::warn!("player: skipped a bad packet: {reason}");
                    if self.bad_packets.bad() {
                        return self.fail(format!("{MAX_BAD_PACKETS}+ bad packets in a row"));
                    }
                }
                Err(error) => return self.fail(error.to_string()),
            }
        }
    }
}

impl Iterator for TrackSource {
    type Item = f32;

    fn next(&mut self) -> Option<f32> {
        if self.position >= self.buffer.len() && !self.refill() {
            return None;
        }
        let sample = self.buffer.get(self.position).copied();
        self.position += 1;
        sample
    }
}

impl Source for TrackSource {
    fn current_span_len(&self) -> Option<usize> {
        Some(self.buffer.len().saturating_sub(self.position))
    }

    fn channels(&self) -> rodio::ChannelCount {
        NonZero::new(self.channels).unwrap_or(NonZero::<u16>::MIN)
    }

    fn sample_rate(&self) -> rodio::SampleRate {
        NonZero::new(self.rate).unwrap_or(NonZero::<u32>::MIN)
    }

    fn total_duration(&self) -> Option<Duration> {
        self.stated_length()
    }

    fn try_seek(&mut self, to: Duration) -> Result<(), SeekError> {
        let seeked = self
            .format
            .seek(
                SeekMode::Accurate,
                SeekTo::Time {
                    time: Time::from(to.as_secs_f64()),
                    track_id: Some(self.track_id),
                },
            )
            .map_err(|error| SeekError::Other(std::sync::Arc::new(error)))?;
        self.decoder.reset();
        self.buffer.clear();
        self.position = 0;
        self.frames = seeked.actual_ts;
        self.ended = false;
        Ok(())
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::mpsc;

    pub fn seed(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../crates/clawdio-core/tests/fixtures/seed")
            .join(name)
    }

    /// Decodes a whole file: frames decoded and the error, if any.
    pub fn drain(path: &Path) -> Result<(u64, Option<String>), String> {
        let (sender, receiver) = mpsc::channel();
        let mut source = TrackSource::open(path, sender)?;
        while source.next().is_some() {}
        Ok((source.frames(), receiver.try_recv().ok()))
    }

    #[test]
    fn good_seeds_decode_to_the_end_with_no_error() {
        for name in [
            "tone.mp3",
            "tone-vorbis.ogg",
            "tone-pcm16.wav",
            "tone-float.wav",
            "tone-adpcm.wav",
        ] {
            let (frames, error) = drain(&seed(name)).unwrap();
            assert!(frames > 0, "{name}");
            assert_eq!(error, None, "{name}");
        }
    }

    #[test]
    fn a_file_that_cannot_open_is_rule_a() {
        assert!(drain(&seed("corrupt.mp3")).is_err());
        assert!(drain(&seed("missing.mp3")).is_err());
    }

    #[test]
    fn an_mp3_states_its_length_only_with_a_tag() {
        assert!(mp3_states_length(&seed("tone.mp3")));
        assert!(!mp3_states_length(&seed("corrupt.mp3")));
    }

    /// Both damaged seeds end more than 2 s before their stated length (rule c). Symphonia
    /// drops damaged Ogg pages without an error, so page damage cannot reach rule b.
    #[test]
    fn damaged_seeds_report_an_error_while_playing() {
        for name in ["truncated.mp3", "damaged.ogg"] {
            let result = drain(&seed(name));
            assert!(matches!(result, Ok((_, Some(_)))), "{name}: {result:?}");
        }
    }

    #[test]
    fn more_than_three_bad_packets_in_a_row_end_the_file() {
        let mut errors = PacketErrors::default();
        assert!(!errors.bad());
        assert!(!errors.bad());
        assert!(!errors.bad());
        assert!(errors.bad(), "the fourth in a row ends it");
        errors.good();
        assert!(!errors.bad(), "a good packet resets the count");
    }
}
