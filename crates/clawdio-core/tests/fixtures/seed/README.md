# Seed audio files

One-second test tones for the scan and player tests (plan P4.11, D36). They hold no copyrighted audio. Tests copy them into generated folder trees in temp folders. P5.11 adds the edge-case files.

| File | Format |
|---|---|
| `tone.mp3` | MP3, 32 kbit/s, mono, 22.05 kHz |
| `tone-vorbis.ogg` | Ogg Vorbis, quality 0, mono, 22.05 kHz |
| `tone-pcm16.wav` | WAV, PCM 16-bit, mono, 8 kHz |

## Commands

The files were made with FFmpeg 6.1:

```sh
ffmpeg -f lavfi -i "sine=frequency=440:duration=1:sample_rate=22050" -ac 1 -c:a libmp3lame -b:a 32k tone.mp3
ffmpeg -f lavfi -i "sine=frequency=440:duration=1:sample_rate=22050" -ac 1 -c:a libvorbis -q:a 0 tone-vorbis.ogg
ffmpeg -f lavfi -i "sine=frequency=440:duration=1:sample_rate=8000" -ac 1 -c:a pcm_s16le tone-pcm16.wav
```
