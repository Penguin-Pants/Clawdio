---
product: Clawdio
owner: Dr. Claw Development
document: Visual design specification
status: implementation-ready direction, subject to repository review
reference: ../assets/reference/clawdio-approved-mockup.png
theme: dark-only
---

# Clawdio Design Specification

## 1. Product and design intent
Clawdio is a lightweight, portable, local-first, open-source desktop music player for Windows and Linux. It plays local MP3, WAV and OGG files, displays track metadata, album artwork and lyrics, and provides standard playback controls. It is not a streaming platform, internet-radio app or podcast client.

**Primary design rule:** Build a practical minimalist music player. The retro cartoon villain style gives it identity but must not make routine playback harder.

### Visual source of truth
`assets/reference/clawdio-approved-mockup.png` establishes the creative direction:
- Dramatic black cat silhouette, narrow red eyes, pointed ears, minimal whisker strokes
- Bold italic/angled `Claw` in red with metallic-gray `dio`
- Red equalizer bars integrated into the final `o`
- Secondary angular C + cat eye + audio bars
- Deep black shell with sparse red controls and monochrome utility icons
- Retro secret-lair imagery is **promotional or placeholder art**, not a required screen feature

The reference is a **raster concept**, not a finished production logo. Rebuild production assets as original clean vectors rather than tracing or embedding image crops. Keep shapes recognizable at 16–32 px. Avoid close copies of third-party entertainment logos or characters.

## 2. Brand identity
**Product name:** Clawdio
**Publisher:** Dr. Claw Development
**Primary positioning:** Minimalist local music player
**Suggested message:** Music under your control.

Attributes: minimalist, precise, theatrical, self-contained, technical, controlled.

### Logo hierarchy
1. Primary wordmark: `Claw` red, `dio` steel/light silver; subtle forward slant; circular `o` with red equalizer bars. Transparent background.
2. Primary app icon: red-eyed cat silhouette on dark square, faint red circular arc, red equalizer bars on bottom. Keep it legible at 16 px.
3. Secondary symbol: angular `C` with negative-space eye and three red audio bars. More useful for micro-sized placements than a detailed mascot.
4. Wordmark monochrome variants and high-contrast icon variants for contexts with no color.

Do not use a raster mockup as the actual app icon. Do not render a full mascot repeatedly throughout the UI.

## 3. Color tokens
Use `theme/tokens.json` as the machine-readable source. Design colors:

| Role | Token | Value |
|---|---|---|
| Signature red | brand.red | `#E10606` |
| Base black | bg.canvas | `#0B0B0B` |
| Main surface | bg.surface | `#111111` |
| Elevated surface | bg.elevated | `#171717` |
| Hover surface | bg.hover | `#1D1D1D` |
| Border | border.default | `#292929` |
| Primary text | text.primary | `#EDEDED` |
| Secondary text | text.secondary | `#B7B7B7` |
| Muted text | text.muted | `#999999` |
| Steel gray | brand.steel | `#4A4A4A` |
| Selected navigation | state.selected | `#5B1010` |
| Hovered red | state.redHover | `#F01C1C` |
| Pressed red | state.redActive | `#C40404` |

Use red for playback emphasis, current navigation, focused controls and critical identity. Don't make all clickable items red. Ensure text and control contrast is adequate; test on typical monitors. Do not use red alone to convey state.

## 4. Typography
- UI: Geist Sans or Inter, whichever fits the current stack and licensing; avoid introducing a second dependency if a good UI font exists.
- Brand wordmark: custom vector lettering; do not substitute a generic font in shipped identity assets.
- Sizes: main view title 24 px; subsection 18–20 px; regular 14 px; metadata 12–13 px; captions 11–12 px if still readable.
- Use tabular numerals for track times. Keep labels sentence case in UI. Uppercase spaced text is reserved for brand collateral and very small decorative headings.
- Implementation (D7): Geist Sans Variable. It is the font of the shadcn/ui preset that the app uses, so no second font dependency is added, and it has tabular numerals.
- Implementation (C12): the docking shell has no page title, so the sizes map to these uses: 24 px for the first-run and empty-library heading; 18 px for the Now playing title and dialog titles; 14 px for body text, rows and buttons; 13 px for artist and album lines, widget titles and the status line; 12 px for durations, captions and hints.

## 5. Layout and density
The shell has four fixed zones, top to bottom: the header strip, the transport band, the dock and the status line (UI shell rework, `docs/planning/ui-shell-rework.md` section 6.1; plan UC12). The dock fills the space between the bands (`minmax(0, 1fr)`) and holds the dockable widgets (requirements R5, R28, R29). The Playlists widget at the left stands in for a sidebar; there are no separate Artists, Albums or Tracks views.

- **Transport band (rework SH-2, TR-1 to TR-8):** a fixed band across the full width, not a dock widget. Its height comes from the `sizes.transportBar` token (56 px at the default font) and the compact token (40 px) at narrow widths. Its content follows its own width in five size classes (XS, SM, MD, LG, XL); controls that do not fit move to a "More" overflow menu, and play/pause always shows. It shows the art, title and artist with an ellipsis, on an opaque surface, and never covers a list. Buttons have a 32 px hit area. A setting puts it at the top (default) or at the bottom.
- **Widgets:** Library (mandatory, cannot be hidden), Now playing, Playlists, Play queue and Lyrics in the dock. Transport controls is the band above. Each widget has a header with a drag grip, its title and, for hideable widgets, a close button. The user drags a header to the edge of another widget or of the window to dock it. Splitters resize. Widgets can be hidden and shown from the menu.
- **Bar widgets (requirements R29.1, v1.7):** superseded by the transport band (requirements v1.8). Kept as history: Transport controls and Now playing were thin dock bars with a fixed natural height.
- **Fixed chrome:** a status line at the bottom edge ("Ready", scan and lookup progress with cancel, short confirmations such as "Added to queue") and a menu button in the top-right corner (View, Library mode, Layout, Settings, Rescan). No layout can hide either.
- **Header strip (implementation, D11):** a 32 px strip at the top holds the wordmark at left and the menu button at right. The docking shell has no other fixed place for the brand, and the strip keeps the menu button out of every widget arrangement.
- **Library widget:** one widget with a mode switch in its header: Tree (one expandable artist, album, song tree), Columns (Artist, Album and Songs side by side) and Top/bottom (Artist and Album on top, Songs below). In Columns and Top/bottom, splitters between the frames resize them (requirements R28.1). They look like the dock splitters. The search field sits in the Library header. When the header is narrow, the switch collapses to a dropdown.
- **Songs table (rework TB-1 to TB-14):** in Columns and Top/bottom, Songs is a table with a sticky header: #, Title (flexible), Artist, Album and Time (right aligned). Columns resize, auto-size, reorder, hide and sort; the playing row shows the playing icon in the # column. Tree mode keeps its indented rows.
- **Presets and default arrangement (first run, "Apple Music classic"):** Playlists at the left (240 px), Library in the center, Play queue and Lyrics as tabs at the right (280 px), Now playing hidden, the band at the top. "MusicBee style" and "Compact" (Library only) are the other presets. A preset keeps the Library mode. The current arrangement saves automatically and restores at start. Reset layout returns to the default preset. Tabbed groups and floating groups inside the window are allowed; pop-out windows are not. Lock layout stops widget drag and splitter resize.
- **Splitters (rework SP-1 to SP-6):** a 1 px line with a 6 px hit area and a resize cursor. Each splitter is a keyboard separator (W3C window splitter pattern): Tab reaches it, the arrow keys move it 16 px (Shift: 64 px), Home and End move it to the minimum and maximum, Enter collapses the first neighbor and Enter again restores it, and a double-click resets the preset size. Every group's header has a "Widget options" button with Float or Dock and Collapse or Restore; the Layout menu has the same items for the active widget. A narrow Playlists widget (below 140 px) shows an icon rail.
- **Now playing card (rework TR-11):** a dockable widget with stacked art, title, seek bar and buttons that shares the band's player state.
- Main area prioritizes track browsing, metadata and cover artwork.
- Persistent, reachable play/pause, stop, previous, next, progress seek and volume controls. The transport band shows them in every arrangement; keyboard shortcuts and OS media keys work too.
- Clear active state, keyboard focus and disabled states, including on widget headers, splitters and drop zones.
- Support small or resized windows: the app enforces a minimum window size and a minimum size per widget and clamps the arrangement to fit.
- Empty widgets (Play queue, Playlists, Lyrics) show a short hint, not a blank area. Empty or missing artwork uses a quiet brand placeholder, not a large illustration.
- Lyrics only where supported by the actual feature requirements. Do not fabricate lyric fetching.

## 6. Components
| Component | Guidance |
|---|---|
| App shell | Matte canvas, subtle panel boundaries, stable desktop resizing |
| Widget header | Drag grip, title and close button (hideable widgets only); flat; drop zones and splitters use the border and hover surfaces, red only for the active drop target |
| Track rows | Dense, easy to scan; title, artist, album and duration as appropriate |
| Album cards | Cover, title, artist; unobtrusive hover. Implementation (C11): the Library shows lists, not a grid (R28), so albums are rows that follow this guidance |
| Transport band | Fixed full-width band; 32 px buttons; overflow menu "More" for controls that do not fit. Large central play/pause, neutral stop and skip controls, shuffle and repeat toggles, clear focus ring |
| Timeline | Charcoal track, red progress, accessible keyboard seeking |
| Volume | Neutral icon, clearly defined mute and level. Implementation (C3): no mute toggle, because R6 lists every playback function and mute is not one; the icon shows the muted glyph at level 0 |
| Search | Dark field, visible focus, no animated distractions |
| Settings | Small number of options grouped by user task |
| Dialogs | Matte panels, no heavy red glow |
| Tooltips | Short and informative; support keyboard focus |
| Error states | Plain actionable text for missing/invalid files |

Iconography: Lucide outline icons or existing equivalent. Avoid mismatched generic pictograms and novel decorative icons in functional navigation.

## 7. MagicUI integration
MagicUI is a collection of React/Tailwind components, not a standalone desktop UI runtime. First inspect the repository. Use MagicUI **only if the actual UI stack supports it**. Desktop wrappers such as Tauri or Electron can render React-based components, but a native UI stack cannot directly use MagicUI without a frontend rewrite.

- Install only selected components that provide real value.
- A restrained `Blur Fade` intro or `Magic Card` for an About/empty state may be appropriate if supported.
- Do not use marquees, flashing border beams, animated gradients, confetti, particle backgrounds or per-track animations in the main player.
- A normal CSS transition is preferable to a full motion dependency for navigation and transport.
- Inspect MagicUI's current component and installation docs before selecting any exact component or command: https://magicui.design/docs/components and https://magicui.design/docs/installation
- Never introduce a new framework just to meet the MagicUI request without raising the architecture trade-off.
- Implementation (D6): no MagicUI component is used. None of its components fits a virtualized list or a functional control, and motion comes only from CSS transitions that the reduced-motion rule turns off (R30).

## 8. Motion
- Hover and focus feedback: 120–180 ms.
- Major panel transitions: at most 180–240 ms where beneficial.
- Support reduced motion; immediate control response takes priority.
- Avoid animation on frequently repeated list rows, the seek bar and live track-time updates.
- No recurring decorative motion when audio is playing.

## 9. Platform and portability
- Design must function with offline files and no account.
- Respect Windows and Linux system controls, text scaling and keyboard access.
- Do not assume macOS traffic-light window controls in production: reference shows conceptual chrome only.
- Support running without installation where technically feasible. Single executable, no installer and portable user data are distinct requirements.
- Application data path and portable settings behavior must follow the requirements and chosen desktop framework; do not silently assume user-profile paths.

## 10. Deliverable review checklist
- Wordmark and app icon remain identifiable at practical sizes
- Icons exported and configured for Windows and Linux
- Contrast and focus visibility tested
- Navigation remains usable in narrow window
- Screens use semantic theme variables, not copied hex literals
- No loss of current audio, playlist, library, lyric or metadata behavior
- Offline startup and operation
- No unnecessary dependencies or decorative features
- Any screenshot/mockup-only features clearly separated from requirements

## 11. Scope control
A brand implementation is **not** authority to add new product features. Do not add online services, account controls, animation-heavy dashboards, analytics, notifications, playlist editing or favorites unless supported by existing requirements. Preserve the existing working playback architecture.
