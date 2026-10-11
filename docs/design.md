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

## 5. Layout and density
- Desktop-first responsive shell; no forced oversized dashboard.
- Sidebar only if it is useful for actual implemented views. Suggested narrow left sidebar: Library, Artists, Albums, Tracks, Playlists, with optional Folders and Settings as supported by requirements.
- Main area prioritizes track browsing, metadata and cover artwork.
- Persistent, reachable play/pause, previous, next, progress seek and volume controls.
- Clear active state, keyboard focus and disabled states.
- Support small or resized windows without losing transport controls.
- Empty or missing artwork uses a quiet brand placeholder, not a large illustration.
- Lyrics only where supported by the actual feature requirements. Do not fabricate lyric fetching.

## 6. Components
| Component | Guidance |
|---|---|
| App shell | Matte canvas, subtle panel boundaries, stable desktop resizing |
| Sidebar | Flat rows; selected background is dark red; icons are neutral |
| Track rows | Dense, easy to scan; title, artist, album and duration as appropriate |
| Album cards | Cover, title, artist; unobtrusive hover |
| Transport | Large central play/pause, neutral skip controls, clear focus ring |
| Timeline | Charcoal track, red progress, accessible keyboard seeking |
| Volume | Neutral icon, clearly defined mute and level |
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
