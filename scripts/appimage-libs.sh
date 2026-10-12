#!/usr/bin/env bash
# AppImage library inventory for NOTICE (P18.4): one line per Ubuntu package that owns a
# library in the extracted AppImage, "package<TAB>version<TAB>license<TAB>source package".
# The license comes from the License fields of /usr/share/doc/<package>/copyright. A library
# that no package owns fails the run, so NOTICE never misses a library.
# Usage: scripts/appimage-libs.sh <squashfs-root> <output.tsv>
set -euo pipefail

ROOT=${1:?usage: appimage-libs.sh <squashfs-root> <output.tsv>}
OUTPUT=${2:?usage: appimage-libs.sh <squashfs-root> <output.tsv>}

owners=()
unowned=()
for lib in $(find "$ROOT" -name '*.so*' -type f -printf '%f\n' | sort -u); do
  owner=$(dpkg -S "*/$lib" 2>/dev/null | grep -m1 "/$lib\$" | cut -d: -f1 | cut -d, -f1 || true)
  if [ -z "$owner" ]; then
    unowned+=("$lib")
  else
    owners+=("$owner")
  fi
done
if [ "${#unowned[@]}" -gt 0 ]; then
  echo "appimage-libs: no Ubuntu package owns: ${unowned[*]}" >&2
  exit 1
fi

: > "$OUTPUT"
for owner in $(printf '%s\n' "${owners[@]}" | sort -u); do
  copyright=/usr/share/doc/$owner/copyright
  license=$(grep -h '^License:' "$copyright" 2>/dev/null | sed 's/^License:[[:space:]]*//' | sort -u | paste -sd ';' | sed 's/;/; /g' || true)
  [ -n "$license" ] || license="see $copyright"
  IFS=$'\t' read -r name version source < <(dpkg-query -W -f='${Package}\t${Version}\t${source:Package}\n' "$owner")
  printf '%s\t%s\t%s\t%s\n' "$name" "$version" "$license" "$source" >> "$OUTPUT"
done
echo "appimage-libs: ${#owners[@]} libraries from $(wc -l < "$OUTPUT") packages" >&2
