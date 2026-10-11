//! Classification (D16, R1): what an audio file holds, and why one is skipped.

use std::fmt;
use std::fs::File;
use std::io::Read;
use std::path::Path;

use lofty::file::{FileType, TaggedFile, TaggedFileExt};
use lofty::prelude::*;
use lofty::probe::Probe;
use symphonia::core::codecs::{self as codecs, CodecType, DecoderOptions};
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

/// Why a file is skipped (R2 report reasons).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Skip {
    /// An audio extension with other content.
    UnsupportedType,
    /// An Ogg stream that is not Vorbis, or a WAV encoding other than PCM or ADPCM.
    UnsupportedCodec,
    /// A parse or probe failure.
    Corrupt,
}

impl fmt::Display for Skip {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Skip::UnsupportedType => "unsupported type",
            Skip::UnsupportedCodec => "unsupported codec",
            Skip::Corrupt => "corrupt file",
        })
    }
}

/// The audio kinds of R1, by extension in any letter case.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Mp3,
    Ogg,
    Wav,
}

impl Kind {
    pub fn of(path: &Path) -> Option<Kind> {
        let ext = path.extension()?.to_str()?.to_ascii_lowercase();
        match ext.as_str() {
            "mp3" => Some(Kind::Mp3),
            "ogg" => Some(Kind::Ogg),
            "wav" => Some(Kind::Wav),
            _ => None,
        }
    }

    fn file_type(self) -> FileType {
        match self {
            Kind::Mp3 => FileType::Mpeg,
            Kind::Ogg => FileType::Vorbis,
            Kind::Wav => FileType::Wav,
        }
    }
}

/// The tags and the duration of an accepted file.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct AudioInfo {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub track: Option<u32>,
    pub disc: Option<u32>,
    pub duration_ms: u32,
    /// A tag holds a picture (D44).
    pub has_picture: bool,
}

impl AudioInfo {
    fn from_tagged(file: &TaggedFile) -> Self {
        let tag = file.primary_tag().or_else(|| file.first_tag());
        let text = |value: Option<std::borrow::Cow<'_, str>>| {
            value.map(|v| v.trim().to_owned()).filter(|v| !v.is_empty())
        };
        AudioInfo {
            title: tag.and_then(|t| text(t.title())),
            artist: tag.and_then(|t| text(t.artist())),
            track: tag.and_then(|t| t.track()),
            disc: tag.and_then(|t| t.disk()),
            duration_ms: millis(file.properties().duration()),
            has_picture: file.tags().iter().any(|tag| tag.picture_count() > 0),
        }
    }
}

fn millis(duration: std::time::Duration) -> u32 {
    duration.as_millis().min(u32::MAX as u128) as u32
}

/// Reads a file of an R1 kind and returns its tags and duration, or the skip reason.
pub fn probe(path: &Path, kind: Kind) -> Result<AudioInfo, Skip> {
    if kind == Kind::Ogg {
        if let Some(codec) = ogg_codec(path)? {
            if codec != OggCodec::Vorbis {
                return Err(Skip::UnsupportedCodec);
            }
        }
    }
    let probe = Probe::open(path)
        .and_then(|probe| probe.guess_file_type().map_err(Into::into))
        .map_err(|_| Skip::Corrupt)?;
    match probe.file_type() {
        Some(found) if found == kind.file_type() => {}
        Some(FileType::Opus | FileType::Speex) if kind == Kind::Ogg => {
            return Err(Skip::UnsupportedCodec)
        }
        Some(_) => return Err(Skip::UnsupportedType),
        None => return Err(Skip::Corrupt),
    }
    let wav_duration = match kind {
        Kind::Wav => Some(check_wav_codec(path)?),
        _ => None,
    };
    match (probe.read(), wav_duration) {
        (Ok(file), _) => Ok(AudioInfo::from_tagged(&file)),
        // Lofty 0.25.4 cannot parse some WAV encodings that Symphonia decodes (IMA ADPCM).
        // Such a file plays, so it is a track without tags (R1).
        (Err(_), Some(duration_ms)) => Ok(AudioInfo {
            duration_ms,
            ..AudioInfo::default()
        }),
        (Err(_), None) => Err(Skip::Corrupt),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OggCodec {
    Vorbis,
    Other,
}

/// The codec of the first Ogg stream, from its first packet. None when the file is not Ogg.
fn ogg_codec(path: &Path) -> Result<Option<OggCodec>, Skip> {
    let mut head = Vec::with_capacity(512);
    File::open(path)
        .and_then(|file| file.take(512).read_to_end(&mut head))
        .map_err(|_| Skip::Corrupt)?;
    if !head.starts_with(b"OggS") {
        return Ok(None);
    }
    let segments = *head.get(26).ok_or(Skip::Corrupt)? as usize;
    let packet = head.get(27 + segments..).ok_or(Skip::Corrupt)?;
    Ok(Some(if packet.starts_with(b"\x01vorbis") {
        OggCodec::Vorbis
    } else {
        OggCodec::Other
    }))
}

/// PCM integer, PCM float and ADPCM (IMA, Microsoft): the WAV encodings of R1.
const WAV_CODECS: [CodecType; 38] = [
    codecs::CODEC_TYPE_PCM_S32LE,
    codecs::CODEC_TYPE_PCM_S32LE_PLANAR,
    codecs::CODEC_TYPE_PCM_S32BE,
    codecs::CODEC_TYPE_PCM_S32BE_PLANAR,
    codecs::CODEC_TYPE_PCM_S24LE,
    codecs::CODEC_TYPE_PCM_S24LE_PLANAR,
    codecs::CODEC_TYPE_PCM_S24BE,
    codecs::CODEC_TYPE_PCM_S24BE_PLANAR,
    codecs::CODEC_TYPE_PCM_S16LE,
    codecs::CODEC_TYPE_PCM_S16LE_PLANAR,
    codecs::CODEC_TYPE_PCM_S16BE,
    codecs::CODEC_TYPE_PCM_S16BE_PLANAR,
    codecs::CODEC_TYPE_PCM_S8,
    codecs::CODEC_TYPE_PCM_S8_PLANAR,
    codecs::CODEC_TYPE_PCM_U32LE,
    codecs::CODEC_TYPE_PCM_U32LE_PLANAR,
    codecs::CODEC_TYPE_PCM_U32BE,
    codecs::CODEC_TYPE_PCM_U32BE_PLANAR,
    codecs::CODEC_TYPE_PCM_U24LE,
    codecs::CODEC_TYPE_PCM_U24LE_PLANAR,
    codecs::CODEC_TYPE_PCM_U24BE,
    codecs::CODEC_TYPE_PCM_U24BE_PLANAR,
    codecs::CODEC_TYPE_PCM_U16LE,
    codecs::CODEC_TYPE_PCM_U16LE_PLANAR,
    codecs::CODEC_TYPE_PCM_U16BE,
    codecs::CODEC_TYPE_PCM_U16BE_PLANAR,
    codecs::CODEC_TYPE_PCM_U8,
    codecs::CODEC_TYPE_PCM_U8_PLANAR,
    codecs::CODEC_TYPE_PCM_F32LE,
    codecs::CODEC_TYPE_PCM_F32LE_PLANAR,
    codecs::CODEC_TYPE_PCM_F32BE,
    codecs::CODEC_TYPE_PCM_F32BE_PLANAR,
    codecs::CODEC_TYPE_PCM_F64LE,
    codecs::CODEC_TYPE_PCM_F64LE_PLANAR,
    codecs::CODEC_TYPE_PCM_F64BE,
    codecs::CODEC_TYPE_PCM_F64BE_PLANAR,
    codecs::CODEC_TYPE_ADPCM_IMA_WAV,
    codecs::CODEC_TYPE_ADPCM_MS,
];

/// A WAV file must hold PCM integer, PCM float or ADPCM (IMA or Microsoft) that the pinned
/// Symphonia can decode (R1, D16). Returns the duration in milliseconds.
fn check_wav_codec(path: &Path) -> Result<u32, Skip> {
    let file = File::open(path).map_err(|_| Skip::Corrupt)?;
    let stream = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    hint.with_extension("wav");
    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            stream,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|error| match error {
            symphonia::core::errors::Error::Unsupported(_) => Skip::UnsupportedCodec,
            _ => Skip::Corrupt,
        })?;
    let track = probed.format.default_track().ok_or(Skip::Corrupt)?;
    if !WAV_CODECS.contains(&track.codec_params.codec) {
        return Err(Skip::UnsupportedCodec);
    }
    symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|_| Skip::UnsupportedCodec)?;
    let params = &track.codec_params;
    Ok(match (params.n_frames, params.sample_rate) {
        (Some(frames), Some(rate)) if rate > 0 => {
            (frames.saturating_mul(1000) / rate as u64).min(u32::MAX as u64) as u32
        }
        _ => 0,
    })
}
