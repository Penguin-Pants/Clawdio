#!/usr/bin/env bash
# Builds docs/images/icon-legibility.png from the generated icons and the wordmark exports
# (P1.7, F-10): the icon at 16, 24, 32 and 48 px and the wordmark at the 20 px header height,
# each at 1x, 2x and 8x zoom, and the wordmark at the 72 px README height (P1-AC4).
# Needs ImageMagick 6 (convert, identify), rsvg-convert and the DejaVu Sans font. Linux only.
# Usage: scripts/contact-sheet.sh [output.png]
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
OUT=${1:-"$ROOT/docs/images/icon-legibility.png"}
FONT=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
BG="#2A2A2A"
ICO="$ROOT/src-tauri/icons/icon.ico"
WORDMARK="$ROOT/assets/branding/export/clawdio-wordmark-primary.svg"
WORDMARK_LIGHT="$ROOT/assets/branding/export/clawdio-wordmark-light.svg"

for tool in convert identify rsvg-convert; do
  command -v "$tool" > /dev/null || { echo "contact-sheet: $tool is missing" >&2; exit 1; }
done
[ -f "$FONT" ] || { echo "contact-sheet: font $FONT is missing" >&2; exit 1; }
[ -f "$ICO" ] || { echo "contact-sheet: $ICO is missing (run npm run icons)" >&2; exit 1; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# Pads an image on the sheet color after a nearest-neighbor zoom. Usage: cell <in> <zoom> <out>
cell() {
  local width height
  width=$(identify -format %w "$1")
  height=$(identify -format %h "$1")
  convert "$1" -filter point -resize "$((100 * $2))%" -background "$BG" -gravity center \
    -extent "$((width * $2 + 24))x$((height * $2 + 24))" "$3"
}

# A row label. Usage: label <text> <out>
label() {
  convert -background "$BG" -fill "#EDEDED" -font "$FONT" -pointsize 16 -size 150x label:"$1" "$2"
}

convert -size 150x1 xc:"$BG" "$WORK/pad.png"
rows=()

# Icon layers by size, from the ICO directory.
declare -A LAYER
while read -r index size; do LAYER[$size]=$index; done < <(identify -format "%p %w\n" "$ICO")
for size in 16 24 32 48; do
  [ -n "${LAYER[$size]:-}" ] || { echo "contact-sheet: icon.ico has no $size px layer" >&2; exit 1; }
  convert "$ICO[${LAYER[$size]}]" "$WORK/icon$size.png"
  for zoom in 1 2 8; do cell "$WORK/icon$size.png" "$zoom" "$WORK/icon$size-$zoom.png"; done
  label "Icon $size px" "$WORK/label$size.png"
  convert "$WORK/label$size.png" "$WORK/icon$size-1.png" "$WORK/icon$size-2.png" "$WORK/icon$size-8.png" \
    -background "$BG" -gravity center +append "$WORK/row$size.png"
  rows+=("$WORK/row$size.png")
done

# Wordmark at the 20 px header height on the header color (bg.canvas).
rsvg-convert -h 20 -b "#0B0B0B" "$WORDMARK" -o "$WORK/wm20.png"
for zoom in 1 2 8; do cell "$WORK/wm20.png" "$zoom" "$WORK/wm20-$zoom.png"; done
label "Wordmark 20 px" "$WORK/label20.png"
convert "$WORK/label20.png" "$WORK/wm20-1.png" "$WORK/wm20-2.png" -background "$BG" -gravity center +append \
  "$WORK/wm20row1.png"
convert "$WORK/pad.png" "$WORK/wm20-8.png" -background "$BG" -gravity center +append "$WORK/wm20row2.png"
rows+=("$WORK/wm20row1.png" "$WORK/wm20row2.png")

# Wordmark at the 72 px README height: both variants at 1x and, at 8x, the 72 px square at the
# right end, which holds the final "o" with its bars.
rsvg-convert -h 72 -b "#0B0B0B" "$WORDMARK" -o "$WORK/wm72.png"
rsvg-convert -h 72 -b "#FFFFFF" "$WORDMARK_LIGHT" -o "$WORK/wm72light.png"
convert "$WORK/wm72.png" -gravity east -crop 72x72+0+0 +repage "$WORK/wm72ring.png"
cell "$WORK/wm72.png" 1 "$WORK/wm72-1.png"
cell "$WORK/wm72light.png" 1 "$WORK/wm72light-1.png"
cell "$WORK/wm72ring.png" 8 "$WORK/wm72ring-8.png"
label "Wordmark 72 px" "$WORK/label72.png"
convert "$WORK/label72.png" "$WORK/wm72-1.png" "$WORK/wm72light-1.png" -background "$BG" -gravity center +append \
  "$WORK/wm72row1.png"
convert "$WORK/pad.png" "$WORK/wm72ring-8.png" -background "$BG" -gravity center +append "$WORK/wm72row2.png"
rows+=("$WORK/wm72row1.png" "$WORK/wm72row2.png")

convert -background "$BG" -fill "#B7B7B7" -font "$FONT" -pointsize 14 \
  label:"Zoom: 1x, 2x and 8x (nearest neighbor). Icon layers come from src-tauri/icons/icon.ico.
Wordmarks rendered with rsvg-convert. 72 px row: primary, light, then the end of the primary at 8x." "$WORK/caption.png"
rows+=("$WORK/caption.png")

mkdir -p "$(dirname "$OUT")"
convert "${rows[@]}" -background "$BG" -gravity north -splice 0x12 -gravity west -append \
  -bordercolor "$BG" -border 16 +repage -depth 8 -strip "$OUT"
echo "contact-sheet: wrote $OUT"
