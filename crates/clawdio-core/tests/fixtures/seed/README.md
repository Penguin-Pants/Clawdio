# Seed audio files

One-second test tones for the scan and player tests (plan P4.11, P5.11, D36). They hold no copyrighted audio. Tests copy them into generated folder trees in temp folders. All files together stay under 100 KB.

| File | Format | Scan result |
|---|---|---|
| `tone.mp3` | MP3, 32 kbit/s, mono, 22.05 kHz, Xing header | Track |
| `tone-vbr.mp3` | MP3, VBR (quality 9), mono, 22.05 kHz, no Xing header | Track; in playback its length is an estimate, so rule (c) does not apply (D32) |
| `tone-vorbis.ogg` | Ogg Vorbis, quality 0, mono, 22.05 kHz | Track |
| `tone-pcm16.wav` | WAV, PCM 16-bit, mono, 8 kHz | Track |
| `tone-float.wav` | WAV, PCM 32-bit float, mono, 8 kHz | Track |
| `tone-adpcm.wav` | WAV, IMA ADPCM, mono, 8 kHz | Track |
| `tone-opus.ogg` | Ogg Opus, 16 kbit/s, mono, 48 kHz | Unsupported codec |
| `tone-alaw.wav` | WAV, A-law, mono, 8 kHz | Unsupported codec |
| `corrupt.mp3` | 2,048 random bytes | Corrupt file |
| `truncated.mp3` | The first 40 % of a 6 s MP3 tone with a Xing header | Track; in playback it ends 3.6 s early (D32 rule c) |
| `damaged.ogg` | A 6 s Ogg Vorbis tone with random bytes in the audio of pages 4 to 8 and valid page CRCs | Track; in playback Symphonia drops those pages and it ends over 2 s early (D32 rule c) |

## Commands

The tones were made with FFmpeg 6.1:

```sh
ffmpeg -f lavfi -i "sine=frequency=440:duration=1:sample_rate=22050" -ac 1 -c:a libmp3lame -b:a 32k tone.mp3
ffmpeg -f lavfi -i "sine=frequency=440:duration=1:sample_rate=22050" -ac 1 -c:a libmp3lame -q:a 9 -write_xing 0 tone-vbr.mp3
ffmpeg -f lavfi -i "sine=frequency=440:duration=1:sample_rate=22050" -ac 1 -c:a libvorbis -q:a 0 tone-vorbis.ogg
ffmpeg -f lavfi -i "sine=frequency=440:duration=1:sample_rate=8000" -ac 1 -c:a pcm_s16le tone-pcm16.wav
ffmpeg -f lavfi -i "sine=frequency=440:duration=1:sample_rate=8000" -ac 1 -c:a pcm_f32le tone-float.wav
ffmpeg -f lavfi -i "sine=frequency=440:duration=1:sample_rate=8000" -ac 1 -c:a adpcm_ima_wav tone-adpcm.wav
ffmpeg -f lavfi -i "sine=frequency=440:duration=1:sample_rate=8000" -ac 1 -c:a pcm_alaw tone-alaw.wav
ffmpeg -f lavfi -i "sine=frequency=440:duration=1:sample_rate=48000" -ac 1 -c:a libopus -b:a 16k tone-opus.ogg
```

`corrupt.mp3` was made with Python 3:

```python
import random

r = random.Random(5)
data = bytearray(r.getrandbits(8) for _ in range(2048))
data[0:4] = b"\x00\x13\x37\x42"  # no ID3 tag and no MPEG frame sync at the start
open("corrupt.mp3", "wb").write(bytes(data))

```

`truncated.mp3` and `damaged.ogg` come from 6 s tones, so they end more than 2 s early:

```sh
ffmpeg -f lavfi -i "sine=frequency=440:duration=6:sample_rate=22050" -ac 1 -c:a libmp3lame -b:a 32k tone6.mp3
ffmpeg -f lavfi -i "sine=frequency=440:duration=6:sample_rate=22050" -ac 1 -c:a libvorbis -q:a 0 tone6.ogg
```

```python
import random, struct

mp3 = open("tone6.mp3", "rb").read()
open("truncated.mp3", "wb").write(mp3[: len(mp3) * 2 // 5])

# Ogg page CRC: polynomial 0x04C11DB7, initial value 0, no reflection.
table = []
for i in range(256):
    r = i << 24
    for _ in range(8):
        r = ((r << 1) ^ 0x04C11DB7) if r & 0x80000000 else (r << 1)
    table.append(r & 0xFFFFFFFF)

def crc(data):
    c = 0
    for b in data:
        c = ((c << 8) & 0xFFFFFFFF) ^ table[((c >> 24) & 0xFF) ^ b]
    return c

ogg = bytearray(open("tone6.ogg", "rb").read())
pages, i = [], 0
while i < len(ogg):
    n = ogg[i + 26]
    size = 27 + n + sum(ogg[i + 27 : i + 27 + n])
    pages.append((i, size, 27 + n))
    i += size
r = random.Random(11)
for start, size, header in pages[3:8]:
    for k in range(start + header, start + size):
        ogg[k] = r.getrandbits(8)
    ogg[start + 22 : start + 26] = bytes(4)
    ogg[start + 22 : start + 26] = struct.pack("<I", crc(bytes(ogg[start : start + size])))
open("damaged.ogg", "wb").write(bytes(ogg))
```
