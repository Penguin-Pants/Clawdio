// WCAG 2.2 contrast ratio of two hex colors (#RGB or #RRGGBB).

/**
 * RGB channels (0 to 255) of a #RGB or #RRGGBB color.
 * @param {string} hex
 * @returns {number[]}
 */
export function rgb(hex) {
  const digits = hex.replace(/^#/, "");
  const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join("") : digits;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`use #RGB or #RRGGBB, got ${hex}`);
  return [0, 2, 4].map((start) => parseInt(full.slice(start, start + 2), 16));
}

/**
 * WCAG 2.2 relative luminance.
 * @param {number[]} channels
 * @returns {number}
 */
export function luminance(channels) {
  const [r, g, b] = channels.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Contrast ratio from 1 to 21.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function contrastRatio(a, b) {
  const [light, dark] = [luminance(rgb(a)), luminance(rgb(b))].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}
