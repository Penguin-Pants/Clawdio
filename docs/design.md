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
- Implementation (C12): the snap grid shell has no page title, so the sizes map to these uses: 24 px for the first-run and empty-library heading; 18 px for the Now playing title and dialog titles; 14 px for body text, rows and buttons; 13 px for artist and album lines, widget titles and the status line; 12 px for durations, captions and hints.

## 5. Layout and density
The shell has three fixed zones: the header strip at the top, the snap grid and the status line at the bottom (requirements R38, P29; plan UC12). The header strip holds the brand and the menu button (D11). The grid fills the space between them (`minmax(0, 1fr)`) and holds every widget, the transport band included. The Playlists widget at the left stands in for a sidebar; there are no separate Artists, Albums or Tracks views.

- **Snap grid (R38.1, R38.2):** 12 columns by 12 rows, equal shares of the grid area, so widgets scale with the window and keep their shape. Each widget takes a rectangle of whole cells; widgets never overlap and empty cells are allowed. The 1 px gaps between cells show the border token; an empty cell shows the border token too, so free room is visible. The page never scrolls; lists scroll inside their widgets.
- **Widgets:** Transport controls, Search, Artist, Album, Songs, Tree, Playlists, Play queue, Lyrics and Now playing, each at most once. Songs and Transport controls cannot be hidden. Minimum sizes in cells (R38.6): Transport controls 4 x 1, Search 2 x 1, Songs 3 x 2, Now playing 2 x 3, the others 2 x 2.
- **Widget header:** a 24 px title row with a drag grip and the title. A one-row widget (Transport controls, Search) has its header as a 16 px grip strip at its left edge, so its content keeps the row height. The header takes keyboard focus and shows the focus ring.
- **Move and resize (R38.4, R38.5):** the user drags a widget by its header, or drags its right edge, bottom edge or bottom-right corner. Sizes and places snap to cells. While the drag runs, a preview outlines the target cells: a dashed neutral outline when the drop fits, a brand red outline when it is refused. A drop pushes the widgets it covers down; a widget that starts above the drop ends above it instead when it keeps its minimum height. A push never passes row 12: the pushed widgets shrink toward their minimum height, and when they still do not fit the drop is refused and nothing changes. Esc cancels a drag.
- **Keyboard path (R38.10):** with a widget header focused, Alt+arrow keys move the widget one cell and Alt+Shift+arrow keys resize it one cell, with the same push and minimum rules. The menu's "Arrange <widget>" submenu does the same for the active widget (the last one clicked or focused).
- **Show and hide (R38.7):** the View submenu lists every widget. A shown widget goes to the first free area that fits its minimum size, else where the widgets it covers can give up their bottom or right cells with the fewest cells lost; it then grows into the free cells beside and below it. When no place works, the status line says so.
- **Presets (R38.8):** Default (first run and Reset layout): Transport controls across the top row; Playlists at the left, full height; Search, then Artist and Album under it; Now playing at the top right; Songs full width below. Tree: Default with Tree in place of Artist and Album. Columns: Artist, Album and Songs side by side under Search, with Play queue under Now playing. Presets cannot be changed. Lock layout stops moves and resizes; show and hide still work.
- **Transport band (rework TR-1 to TR-8):** the body of the Transport controls widget. It fills its cells. Its content follows its own width in five size classes (XS, SM, MD, LG, XL); controls that do not fit move to a "More" overflow menu, and play/pause always shows. A row shorter than the `sizes.transportBar` token (56 px at the default font) uses the compact play button and art and no vertical padding. It shows the art, title and artist with an ellipsis, on an opaque surface. Buttons have a 32 px hit area. The mini player shows the band alone.
- **Fixed chrome:** a status line at the bottom edge ("Ready", scan and lookup progress with cancel, short confirmations such as "Added to queue") and a menu button in the top-right corner (View, Compact rows, Layout, Settings, Rescan). No layout can hide either.
- **Header strip (implementation, D11):** a 32 px strip at the top holds the wordmark at left and the menu button at right.
- **Library widgets (R38.3):** Search filters Artist, Album, Songs and Tree. Artist and Album start with an "All" row; an Artist selection filters Album and Songs, an Album or Tree selection filters Songs. A playlist picked in Playlists shows in Songs, with a "Library" button back.
- **Songs table (rework TB-1 to TB-14):** a table with a sticky header: #, Title (flexible), Artist, Album and Time (right aligned). Columns resize, auto-size, reorder, hide and sort; the playing row shows the playing icon in the # column. The Tree widget keeps its indented rows.
- **Playlists icon rail (rework SP-5):** a Playlists widget narrower than 140 px (2 cells in a small window) shows an icon rail.
- **Now playing card (rework TR-11):** a grid widget with stacked art, title, seek bar and buttons that shares the band's player state.
- **History:** the docking shell (R29: splitters, tabbed and floating groups, collapse, the Library modes and frame splitters, the transport position) is superseded by the snap grid (requirements v1.16).
- Main area prioritizes track browsing, metadata and cover artwork.
- Persistent, reachable play/pause, stop, previous, next, progress seek and volume controls. The transport band shows them in every arrangement; keyboard shortcuts and OS media keys work too.
- Clear active state, keyboard focus and disabled states, including on widget headers, resize handles and drop previews.
- Support small or resized windows: the app enforces a minimum window size, and the grid scales every widget with the window.
- Empty widgets (Play queue, Playlists, Lyrics) show a short hint, not a blank area. Empty or missing artwork uses a quiet brand placeholder, not a large illustration.
- Lyrics only where supported by the actual feature requirements. Do not fabricate lyric fetching.

## 6. Components
| Component | Guidance |
|---|---|
| App shell | Matte canvas, subtle panel boundaries, stable desktop resizing |
| Widget header | Drag grip and title; flat; focusable for the keyboard path. The drop preview uses a neutral dashed outline, red only for a refused drop |
| Track rows | Dense, easy to scan; title, artist, album and duration as appropriate |
| Album cards | Cover, title, artist; unobtrusive hover. Implementation (C11): the Library shows lists, not a grid (R28), so albums are rows that follow this guidance |
| Transport band | The Transport controls grid widget; 32 px buttons; overflow menu "More" for controls that do not fit. Large central play/pause, neutral stop and skip controls, shuffle and repeat toggles, clear focus ring |
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
