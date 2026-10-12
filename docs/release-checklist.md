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

## Keyboard walkthrough (P17.2, R25, P17-AC2)

Every R25 key and Ctrl+Shift+L in the release build, with a real music folder. Playwright
covers the same keys with mocked IPC in Chromium and WebKit (P2-AC10, P6-AC5, P7-AC5,
P7-AC12, P11-AC8).

| Key | Check | Linux (Xvfb, release build, October 12, 2026) | Windows |
|---|---|---|---|
| Up, Down | Move through the Artist list | Pass | Not run |
| Right, Left | Expand and collapse a Tree artist and album | Pass | Not run |
| Enter | Play the selected song in Tree mode | Pass: Now playing shows the song | Not run |
| Space | Toggle play and pause | Not run here: the container has no real-time audio sink, so a song ends at once. Playwright P7-AC5 passes in WebKit. | Not run |
| Ctrl+F, Esc | Focus the search, type, then clear it and return to the Library | Pass | Not run |
| F6, Shift+F6 | Move focus between visible widgets in reading order | Pass: Library, Now playing, Transport controls and back | Not run |
| Delete | Remove the selected Play queue entry | Pass | Not run |
| Delete | Remove the selected playlist entry | Pass: the entry left `Mix.m3u8` on disk | Not run |
| Ctrl+Shift+L | Reset layout | Pass: the Columns layout with the default widgets | Not run |

## Text scaling, reduced motion and high contrast (P17.3, P17.5, P17.6)

| Check | Linux | Windows |
|---|---|---|
| Large text (P17-AC5) | Pass with `GDK_DPI_SCALE` 1.25 and 1.4 (October 12, 2026): no overlap and no clipped control. The first run clipped Transport controls and Now playing at their 88 px minimum; P17 raised both minimums to 112 px. GNOME itself is not in the container. | Not run (150 percent display scale) |
| Reduced motion (P17-AC3) | Playwright emulation: every state of the sweep has no transition or animation. GNOME "Reduce animation" not run (no GNOME). | Not run ("Animation effects" off) |
| Forced colors (P17-AC6) | Playwright (Chromium emulation): focus ring, pressed toggles, the switch and the slider show. | Not run (Windows high contrast) |
