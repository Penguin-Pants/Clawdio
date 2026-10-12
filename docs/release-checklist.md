# Release checklist

Manual and interop checks that the release (P18) repeats or completes. Each phase adds its
rows when it runs a check. A row names the check, the date, the platform and the result.

## Playlist interop (P11.9, AC-3, B3)

The app writes `.m3u8` files in `Playlists/` with paths relative to the playlist file, so the
paths start with `../` (R13). If a tested player fails on `..` paths, the owner decides
whether playlists move to the folder root (B3).

Test playlist: written by the app's playlist code (`PlaylistSet::create` and `add`), with one
entry in each of two artist folders. The names hold accents, parentheses and spaces:

```text
#EXTM3U
#EXTINF:1,Björk - Human Behaviour
../Björk/Début (1993)/01 Human Behaviour.mp3
#EXTINF:1,Nina Simone - Sinner man
../Nina Simone/Pastel Blues/02 Sinner man.ogg
```

| Player | Platform | Date | Result |
|---|---|---|---|
| VLC 3.0.20 (`cvlc -I dummy -A dummy --play-and-exit -vv`) | Linux (Ubuntu, container) | October 12, 2026 | Pass: VLC created an input for both entries and reached EOF for each; the log has no "cannot open". |
| VLC | Windows | Not run | No Windows machine (P11 E1). B3 stays open until P18. |
| MusicBee | Windows | Not run | No Windows machine. |
