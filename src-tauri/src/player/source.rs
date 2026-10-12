//! The engine's own decoder (P7.3, D32): a rodio `Source` over Symphonia 0.5.5 that reports
//! decode errors. `rodio::Decoder` hides them, and Symphonia reports a cut-off file as a
//! normal end of stream, so the source checks the stated duration itself.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
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
    let Ok(mut file) = File::open(path) else {
        return false;
    };
    // Skip an ID3v2 tag of any size: "ID3", version, flags, then a 28-bit size.
    let mut header = [0u8; 10];
    let mut start = 0u64;
    if file.read_exact(&mut header).is_ok() && header.starts_with(b"ID3") {
        let size = header[6..10]
            .iter()
            .fold(0u64, |size, byte| (size << 7) | u64::from(byte & 0x7f));
        let footer = if header[5] & 0x10 != 0 { 10 } else { 0 };
        start = 10 + size + footer;
    }
    // The tag sits in the first frame, within its first 200 bytes.
    let mut frame = Vec::with_capacity(1_500);
    if file.seek(SeekFrom::Start(start)).is_err()
        || file.take(1_500).read_to_end(&mut frame).is_err()
    {
        return false;
    }
    [b"Xing", b"Info", b"VBRI"]
        .iter()
        .any(|tag| frame.windows(4).any(|bytes| bytes == *tag))
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
        let mut source = TrackSource {
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
        };
        // The first packet gives the format the device path reads before the first sample.
        source.refill();
        Ok(source)
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
                    let channels = (spec.channels.count() as u16).max(1);
                    if self.frames == 0 {
                        self.channels = channels;
                        self.rate = spec.rate.max(1);
                    } else if (channels, spec.rate) != (self.channels, self.rate) {
                        // The source states one format for the whole file (one span).
                        return self.fail("the audio format changes inside the file".into());
                    }
                    let mut samples = SampleBuffer::<f32>::new(decoded.capacity() as u64, spec);
                    samples.copy_interleaved_ref(decoded);
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
    /// One span for the whole file. rodio reads the channels and rate again at each span end,
    /// and a span end at each packet made the queue report the next source's format there.
    fn current_span_len(&self) -> Option<usize> {
        if self.ended && self.position >= self.buffer.len() {
            return Some(0);
        }
        None
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
        assert!(!mp3_states_length(&seed("tone-vbr.mp3")));
        let (sender, _) = mpsc::channel();
        let vbr = TrackSource::open(&seed("tone-vbr.mp3"), sender).unwrap();
        assert_eq!(
            vbr.stated_length(),
            None,
            "an estimate is not a stated length"
        );
    }

    /// A cover in a large ID3 tag does not hide the Xing tag after it.
    #[test]
    fn an_mp3_with_a_large_id3_tag_still_states_its_length() {
        let size: u32 = 64 * 1024;
        let mut file = b"ID3\x04\x00\x00".to_vec();
        file.extend(
            (0..4)
                .rev()
                .map(|shift| ((size >> (7 * shift)) & 0x7f) as u8),
        );
        file.resize(10 + size as usize, 0);
        file.extend(std::fs::read(seed("tone.mp3")).unwrap());
        let path = std::env::temp_dir().join(format!("clawdio-id3-{}.mp3", std::process::id()));
        std::fs::write(&path, file).unwrap();
        let states = mp3_states_length(&path);
        let _ = std::fs::remove_file(&path);
        assert!(states);
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

/// The source as the device plays it: rodio's queue and mixer read the span length, channels
/// and rate at each span end and convert to the device format.
#[cfg(test)]
mod device_path_tests {
    use super::tests::seed;
    use super::*;
    use rodio::source::{EmptyCallback, UniformSourceIterator};
    use std::num::NonZero;
    use std::sync::mpsc;

    fn open(name: &str) -> TrackSource {
        let (sender, _) = mpsc::channel();
        TrackSource::open(&seed(name), sender).unwrap()
    }

    /// The samples a device with `channels` and `rate` gets, with the callback source after the
    /// track as `RodioOutput::load` appends it.
    fn through_mixer(name: &str, channels: u16, rate: u32) -> Vec<f32> {
        let (input, output) = rodio::queue::queue(false);
        input.append(open(name));
        input.append(EmptyCallback::new(Box::new(|| {})));
        UniformSourceIterator::new(
            output,
            NonZero::new(channels).unwrap(),
            NonZero::new(rate).unwrap(),
        )
        .collect()
    }

    #[test]
    fn a_device_in_the_file_format_gets_every_sample_unchanged() {
        for name in ["tone.mp3", "tone-vorbis.ogg", "tone-pcm16.wav"] {
            let source = open(name);
            let (channels, rate) = (source.channels().get(), source.sample_rate().get());
            let direct: Vec<f32> = source.collect();
            assert_eq!(through_mixer(name, channels, rate), direct, "{name}");
        }
    }

    #[test]
    fn a_device_at_another_rate_gets_the_full_length() {
        for name in ["tone.mp3", "tone-vorbis.ogg", "tone-pcm16.wav"] {
            let source = open(name);
            let (channels, rate) = (source.channels().get(), source.sample_rate().get());
            let frames = source.count() as f64 / f64::from(channels);
            let device_rate = if rate == 48_000 { 44_100 } else { 48_000 };
            let got = through_mixer(name, 2, device_rate).len() as f64 / 2.0;
            let want = frames * f64::from(device_rate) / f64::from(rate);
            // rodio's converter drops its last partial chunk: under 1 ms at the file end.
            let end_loss = f64::from(device_rate) / 1000.0;
            assert!(
                (got - want).abs() <= end_loss,
                "{name}: {got} frames, want {want}"
            );
        }
    }
}
