# Theming and brand

This file lists the theme tokens that the app reads and the UI part that each token controls (requirements R17). The build plan section 6.12 is the source for these tables.

## How the theme gets into the app

1. `theme/tokens.json` is the only theme source (R15, R31).
2. `scripts/build-tokens.mjs` checks the file and writes `src/styles/tokens.generated.css`. The generated file is not committed.
3. Tailwind CSS v4 builds the generated variables into the CSS bundle. `src/styles/globals.css` maps the shadcn/ui semantic variables to them.
4. `npm run dev` and `npm run build` run the script first (`predev` and `prebuild`). To apply a token change, rebuild the app. No other file changes.

The script stops with an error that names the key path when a key is missing or a value has the wrong kind. Every key in the current file is required:

- Colors: a hex color (`#RGB`, `#RGBA`, `#RRGGBB` or `#RRGGBBAA`).
- Radii: a px length (`10px`).
- Motion: a ms duration (`140ms`). `motion.reduced` is a policy text. The script checks that it exists and writes nothing for it.

Unknown keys cause a warning and are ignored.

## Source guards

`npm run check:sources` (part of `npm run check`) fails when a file under `src/` holds a color that does not come from the tokens:

- A hex color literal, such as `#fff`. The generated token file is the only exception.
- A Tailwind default palette color: a class such as `bg-red-500`, `text-white` or `bg-black/50`, or a variable such as `--color-red-500`. The palette names come from the installed Tailwind theme.

Use token classes (`bg-bg-surface`, `text-text-muted`) or the shadcn/ui semantic classes (`bg-primary`, `text-foreground`). The same command fails on the product name in source code (plan decision D34).

## Token map

| Token | CSS variable | UI roles |
|---|---|---|
| `colors.brand.red` | `--color-brand-red` | Slider range and thumb, play ring, active toggles, switch on, focus ring, active drop target, error icons |
| `colors.brand.steel` | `--color-brand-steel` | Wordmark "dio" on light backgrounds; decorative seek and volume track |
| `colors.bg.canvas` | `--color-bg-canvas` | Window, header strip, status line |
| `colors.bg.surface` | `--color-bg-surface` | Widget bodies |
| `colors.bg.elevated` | `--color-bg-elevated` | Widget headers (tab bars), menus, dialogs, inputs, art placeholder |
| `colors.bg.hover` | `--color-bg-hover` | Row and button hover, drop zone overlay |
| `colors.border.default` | `--color-border-default` | Panel boundaries, splitters |
| `colors.border.strong` | `--color-border-strong` | Splitter hover, input border, dialog border |
| `colors.text.primary` | `--color-text-primary` | Main text, active tab title |
| `colors.text.secondary` | `--color-text-secondary` | Artist, album, status line |
| `colors.text.muted` | `--color-text-muted` | Hints, placeholders, inactive tab titles, durations, missing entries |
| `colors.state.selected` | `--color-state-selected` | Selected rows |
| `colors.state.redHover` | `--color-state-red-hover` | Hover of red icon controls |
| `colors.state.redActive` | `--color-state-red-active` | Pressed red controls, fill of red text buttons |
| `radii.control` | `--radius-control` | Buttons, inputs, menu items |
| `radii.card` | `--radius-card` | Widgets, album thumbnails, art |
| `radii.dialog` | `--radius-dialog` | Dialogs |
| `sizes.transportBar` | `--size-transport-bar` | Transport band height at the MD, LG and XL size classes (3.5rem, 56 px at the 16 px root) |
| `sizes.transportBarCompact` | `--size-transport-bar-compact` | Transport band height at SM and XS (2.5rem, 40 px) |
| `sizes.rowRegular` | `--size-row-regular` | Row height of the Library lists, the Tree, the Play queue, the Playlists list and the playlist view (1.75rem, 28 px) |
| `sizes.rowCompact` | `--size-row-compact` | Compact row height (1.5rem, 24 px) |
| `sizes.rowAlbum` | `--size-row-album` | Album list row height (3rem, 48 px) |
| `spacing.unit` | `--spacing-unit` | Tailwind's spacing scale (`--spacing`): every `p-*`, `m-*`, `gap-*`, `w-*` and `h-*` step is a multiple of it (0.25rem) |
| `motion.fast` | `--clawdio-motion-fast` | Hover and focus transitions. Also Tailwind's default transition duration. |
| `motion.panel` | `--clawdio-motion-panel` | Menu and dialog open and close |
| `motion.reduced` | policy | The reduced-motion rule in `globals.css`: under `prefers-reduced-motion: reduce`, every transition and animation lasts 0s and scrolling is not smooth |

`radii.control` also sets the shadcn/ui `--radius` variable.

Size and spacing tokens take `rem` values (the `rem` kind of `scripts/build-tokens.mjs`; a `px` value fails the build). They follow the root font size, so Windows display scaling and the text scales grow the band and the rows instead of clipping them (UI shell rework UD1). A brand swap must keep every `sizes` and `spacing` key; the build names a missing key. `npm run check:sources` also refuses arbitrary px spacing such as `p-[6px]` under `src/`.

## shadcn/ui semantic variables

`src/styles/globals.css` sets these variables from the tokens. Components use the semantic names.

| Variable | Token |
|---|---|
| `--background` | `colors.bg.canvas` |
| `--foreground`, `--primary-foreground`, `--accent-foreground`, `--card-foreground`, `--popover-foreground`, `--secondary-foreground` | `colors.text.primary` |
| `--card`, `--muted` | `colors.bg.surface` |
| `--popover`, `--secondary` | `colors.bg.elevated` |
| `--primary`, `--destructive`, `--ring` | `colors.brand.red` (indicators only) |
| `--muted-foreground` | `colors.text.muted` |
| `--accent` | `colors.bg.hover` |
| `--border` | `colors.border.default` |
| `--input` | `colors.border.strong` |
| `--radius` | `radii.control` |

## Color role rules

The palette has pairs that fail WCAG 2.2 contrast. These rules (plan decision D10) keep text and indicators readable:

1. Text uses `text.primary`, `text.secondary` or `text.muted`. Red text only at 24 px and larger, or 18.66 px and larger when bold. Error messages use `text.primary` with a `brand.red` icon.
2. Text on a red fill uses `state.redActive` in every state. `state.redHover` and `brand.red` fills carry icons only.
3. Indicators (focus ring, slider range and thumb, switch on, active toggles, active drop target) use `brand.red`. `state.redActive` is never an indicator.
4. On `state.selected` rows, icons, bars and outlines use `text.primary`.
5. `brand.steel` is only for the wordmark "dio" on light backgrounds and the decorative seek and volume track.
6. Borders are decoration. Inputs carry an icon and placeholder text.
7. No state is shown by color alone. Selected rows add a left bar. Pressed toggles and the active tab add an underline or a dot.

## Contrast role pairs

`src/styles/contrast.test.ts` checks these pairs against the current tokens. "Pass" pairs must reach the threshold. "Excluded" pairs must stay below it, so a token change that makes them pass is reviewed before the rules change. The `state.redActive` row is one role on four surfaces: it stays excluded while its worst surface fails.

| Pair | Ratio | Rule | Result |
|---|---|---|---|
| text.primary on canvas, surface, elevated, hover, selected | 16.81 to 11.75 | text 4.5 | Pass |
| text.secondary on the same five backgrounds | 9.81 to 6.86 | text 4.5 | Pass |
| text.muted on the same five backgrounds | 6.91 to 4.83 | text 4.5 | Pass |
| text.primary on state.redActive | 5.33 | text 4.5 | Pass |
| brand.red on canvas, surface, elevated, hover | 3.96 to 3.40 | non-text and large text 3.0 | Pass for icons, rings and 24 px text |
| text.primary on brand.red / state.redHover | 4.24 / 3.67 | not used for text | Excluded |
| brand.red on state.selected | 2.77 | not used | Excluded |
| brand.steel on canvas, surface | 2.22, 2.13 | decorative track only; the thumb and range carry the state | Decorative |
| state.redActive on canvas, surface, elevated, hover | 3.16 to 2.70 | never an indicator | Excluded |
| text.primary outline or bar on state.selected, surface | 11.75, 16.13 | non-text 3.0 | Pass |
| state.selected on surface (fill alone) | 1.37 | needs the left bar | Bar required |

## Dock chrome

`src/styles/dockview-theme.css` styles the docking library (Dockview) with token variables only (requirements R17, R30). It sets the `--dv-*` variables of `dockview-react/dist/styles/dockview.css` and adds the splitter line and the active tab underline. The theme sets no layout.

| Part | State | Token |
|---|---|---|
| Widget body (group background) | | `colors.bg.surface` |
| Widget header (tab bar), 32 px high | | `colors.bg.elevated`, bottom border `colors.border.default` |
| Tab title | Active tab | `colors.text.primary` with a 2 px `colors.text.primary` underline |
| Tab title | Inactive tab | `colors.text.muted`, no underline |
| Tab close control | Hover | `colors.bg.hover` |
| Splitter | At rest | 1 px `colors.border.default` |
| Splitter | Hover | 1 px `colors.border.strong` and a resize cursor |
| Splitter | Dragging | 2 px `colors.border.strong` |
| Drop zone | Drag over | `colors.bg.hover` overlay (85 % opacity) |
| Drop zone | Active target | 2 px `colors.brand.red` border |
| Focus ring on a tab | Keyboard focus | 2 px `colors.brand.red`, drawn inside the tab |

Red shows in the dock only on the active drop target and on focus rings.

## Magic UI components

Copied Magic UI components: none (requirements R17 and R30, plan decision D6). Motion is not a dependency. Transitions are plain CSS.

## Focus, motion and high contrast

- Focus: every interactive element shows a 2 px `brand.red` ring with a 2 px offset (`:focus-visible`). Tabs, widget bodies and menu items draw it where the container does not clip it. Highlighted menu and select items also get a 2 px `text.primary` bar at the left. The pressed Library mode gets a 2 px `text.primary` underline.
- Color scheme: `:root` sets `color-scheme: dark`, so native scrollbars and form controls are dark.
- Motion: hover and focus transitions use `motion.fast`. Menus and dialogs use `motion.panel`.
- Reduced motion: see `motion.reduced` above.
- Windows high contrast (`forced-colors: active`): focus rings use `Highlight`. Selected rows (`aria-selected="true"`) use `Highlight` with `HighlightText`. Mask icons (UI icon overrides) and the art placeholder paint in `CanvasText`. Pressed toggles use `Highlight` with `HighlightText`; the switch shows `Canvas` with a `CanvasText` thumb when off and `Highlight` with a `HighlightText` thumb when on; the slider track is `GrayText` and its range and thumb are `Highlight` (P17.6).
- Times use tabular numerals (`tabular` class).

## Font

The UI font is Geist Sans (variable, OFL 1.1) from `@fontsource-variable/geist`. The fallback is `system-ui, "Segoe UI", Ubuntu, Cantarell, sans-serif`. `NOTICE` holds the license.

## Brand inputs

These files hold the brand (requirements R17, R31). A brand change replaces files here and needs no feature code change. All brand shapes are original vectors. The mockup is direction only.

| File | Use | To replace it |
|---|---|---|
| `theme/tokens.json` | Theme colors, radii and motion | Edit the values and rebuild |
| `assets/branding/source/clawdio-wordmark.svg` | Master wordmark | Edit it, then update the three wordmark exports |
| `assets/branding/source/clawdio-cat.svg` | Master cat head | Edit it, then update `clawdio-icon-full.svg` and `clawdio-icon-mono.svg` |
| `assets/branding/source/clawdio-monogram.svg` | Master monogram. The app draws it as the art placeholder mask. | Replace it with another square SVG |
| `assets/branding/export/clawdio-wordmark-primary.svg` | Wordmark for dark backgrounds: the app header and the README in dark mode | Replace it with another SVG of the same use |
| `assets/branding/export/clawdio-wordmark-light.svg` | Wordmark for light backgrounds: the README in light mode | Same |
| `assets/branding/export/clawdio-wordmark-mono.svg` | One-color wordmark (`currentColor`) for use outside the app | Same |
| `assets/branding/export/clawdio-icon-full.svg` | App icon. The build makes every platform icon from it. | Replace it with another square SVG and rebuild |
| `assets/branding/export/clawdio-icon-simple.svg` | Monogram icon. A fallback source for the 16 and 24 px icon layers (owner decision Q8). The build does not use it now. | Replace it with another square SVG |
| `assets/branding/export/clawdio-icon-mono.svg` | One-color cat icon (`currentColor`) for use outside the app | Replace it with another square SVG |
| `assets/branding/ui-icons/<name>.svg` | Optional UI icon overrides. A file replaces the Lucide icon of that name (R31). `assets/branding/ui-icons/README.md` lists the names. | Add, replace or delete the file and rebuild |
| `assets/reference/clawdio-approved-mockup.png` | Visual direction only. Not used by the app or the build. | Not needed |

### SVG rules

`npm run check:svg` (part of `npm run check`) checks every SVG under `assets/branding/`. Each file must parse as XML and have a `viewBox`. It must not contain the elements `<image>`, `<text>`, `<filter>`, `<foreignObject>` and `<script>`. It must not have an `http` reference (the `xmlns` namespace is allowed).

### How the platform icons are made

1. `npm run icons` (`scripts/icons.mjs`) runs `tauri icon` on `assets/branding/export/clawdio-icon-full.svg`.
2. It keeps only the files that `bundle.icon` in `src-tauri/tauri.conf.json` lists and deletes the other outputs: `32x32.png`, `64x64.png`, `128x128.png`, `128x128@2x.png` (256 px), `icon.png` (512 px) and `icon.ico` (16, 24, 32, 48, 64 and 256 px).
3. It checks the pixel size of each file and fails on a wrong size.
4. `npm run dev` and `npm run build` run it first. It skips the work when every icon file is newer than the SVG.
5. The generated files in `src-tauri/icons/` are committed, so `cargo` builds work without the Tauri CLI. After an icon change, commit them.

To change the app icon, replace `clawdio-icon-full.svg`, run `npm run icons` (or any build) and commit the new files in `src-tauri/icons/`. `docs/images/icon-legibility.png` shows the icon at 16, 24, 32 and 48 px, the wordmark at the 20 px header height and at the 72 px README height. `npm run contact-sheet` (`scripts/contact-sheet.sh`) builds it again after a brand change. It runs on Linux and needs ImageMagick 6, `rsvg-convert` and the DejaVu Sans font.
