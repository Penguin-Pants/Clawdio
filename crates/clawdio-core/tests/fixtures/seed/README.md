# Seed audio files

One-second test tones for the scan and player tests (plan P4.11, P5.11, D36). They hold no copyrighted audio. Tests copy them into generated folder trees in temp folders. All files together stay under 100 KB.

| File | Format | Scan result |
|---|---|---|
| `tone.mp3` | MP3, 32 kbit/s, mono, 22.05 kHz, Xing header | Track |
| `tone-vorbis.ogg` | Ogg Vorbis, quality 0, mono, 22.05 kHz | Track |
| `tone-pcm16.wav` | WAV, PCM 16-bit, mono, 8 kHz | Track |
| `tone-float.wav` | WAV, PCM 32-bit float, mono, 8 kHz | Track |
| `tone-adpcm.wav` | WAV, IMA ADPCM, mono, 8 kHz | Track |
| `tone-opus.ogg` | Ogg Opus, 16 kbit/s, mono, 48 kHz | Unsupported codec |
| `tone-alaw.wav` | WAV, A-law, mono, 8 kHz | Unsupported codec |
| `corrupt.mp3` | 2,048 random bytes | Corrupt file |
| `truncated.mp3` | The first half of `tone.mp3` | Track (decode error in playback, P7) |
| `damaged.ogg` | `tone-vorbis.ogg` with 256 bytes in the middle set to zero | Track (decode error in playback, P7) |

## Commands

The tones were made with FFmpeg 6.1:

```sh
ffmpeg -f lavfi -i "sine=frequency=440:duration=1:sample_rate=22050" -ac 1 -c:a libmp3lame -b:a 32k tone.mp3
ffmpeg -f lavfi -i "sine=frequency=440:duration=1:sample_rate=22050" -ac 1 -c:a libvorbis -q:a 0 tone-vorbis.ogg
ffmpeg -f lavfi -i "sine=frequency=440:duration=1:sample_rate=8000" -ac 1 -c:a pcm_s16le tone-pcm16.wav
ffmpeg -f lavfi -i "sine=frequency=440:duration=1:sample_rate=8000" -ac 1 -c:a pcm_f32le tone-float.wav
ffmpeg -f lavfi -i "sine=frequency=440:duration=1:sample_rate=8000" -ac 1 -c:a adpcm_ima_wav tone-adpcm.wav
ffmpeg -f lavfi -i "sine=frequency=440:duration=1:sample_rate=8000" -ac 1 -c:a pcm_alaw tone-alaw.wav
ffmpeg -f lavfi -i "sine=frequency=440:duration=1:sample_rate=48000" -ac 1 -c:a libopus -b:a 16k tone-opus.ogg
```

The damaged files were made with Python 3 from the tones:

```python
import random

r = random.Random(5)
data = bytearray(r.getrandbits(8) for _ in range(2048))
data[0:4] = b"\x00\x13\x37\x42"  # no ID3 tag and no MPEG frame sync at the start
open("corrupt.mp3", "wb").write(bytes(data))

mp3 = open("tone.mp3", "rb").read()
open("truncated.mp3", "wb").write(mp3[: len(mp3) // 2])

ogg = bytearray(open("tone-vorbis.ogg", "rb").read())
middle = len(ogg) // 2
ogg[middle : middle + 256] = bytes(256)
open("damaged.ogg", "wb").write(bytes(ogg))
```
