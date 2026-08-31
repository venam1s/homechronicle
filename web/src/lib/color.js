/**
 * color.js — minimal OKLab/OKLCH color utilities.
 *
 * Used to derive the full `--hc-*` token set for each palette from a small set
 * of anchor colors (background, panel, ink, accent) so that twelve palettes in
 * two modes stay internally consistent without hand-maintaining ~600 values.
 *
 * Pure functions, no DOM access — safe to import from tests and from the
 * palette CSS generator script.
 */

const clamp01 = (n) => Math.max(0, Math.min(1, n));

function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c) {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

/** Parse `#rgb` or `#rrggbb` into `[r, g, b]` (0-255). Throws on malformed input. */
export function parseHex(hex) {
  if (typeof hex !== 'string') throw new TypeError(`expected a hex string, got ${typeof hex}`);
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`malformed hex color: ${hex}`);
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

/** Format `[r, g, b]` (0-255) as `#rrggbb`. */
export function toHex([r, g, b]) {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

/** `#rrggbb` -> `"r, g, b"`, the form the `--hc-*-rgb` tokens use. */
export function toRgbTriplet(hex) {
  return parseHex(hex).join(', ');
}

/** `#rrggbb` -> `{ L, C, H }` in OKLCH (L 0-1, H radians). */
export function hexToOklch(hex) {
  const [r8, g8, b8] = parseHex(hex);
  const r = srgbToLinear(r8);
  const g = srgbToLinear(g8);
  const b = srgbToLinear(b8);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;

  return { L, C: Math.hypot(A, B), H: Math.atan2(B, A) };
}

/** `{ L, C, H }` -> `#rrggbb`, clipped to sRGB. */
export function oklchToHex({ L, C, H }) {
  const A = C * Math.cos(H);
  const B = C * Math.sin(H);

  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3;

  return toHex([
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  ]);
}

/**
 * Perceptual blend of two hex colors in OKLab.
 * `amount` 0 returns `from`, 1 returns `to`.
 */
export function mix(from, to, amount) {
  const t = clamp01(amount);
  const a = hexToOklch(from);
  const b = hexToOklch(to);

  // Interpolate in Cartesian OKLab so a near-gray endpoint does not drag hue.
  const aA = a.C * Math.cos(a.H);
  const aB = a.C * Math.sin(a.H);
  const bA = b.C * Math.cos(b.H);
  const bB = b.C * Math.sin(b.H);

  const L = a.L + (b.L - a.L) * t;
  const A = aA + (bA - aA) * t;
  const B = aB + (bB - aB) * t;

  return oklchToHex({ L, C: Math.hypot(A, B), H: Math.atan2(B, A) });
}

/** Move a color toward black by `amount` (0-1). */
export const darken = (hex, amount) => mix(hex, '#000000', amount);

/** Move a color toward white by `amount` (0-1). */
export const lighten = (hex, amount) => mix(hex, '#ffffff', amount);

/** Set a color's OKLCH lightness, preserving hue and chroma. */
export function withLightness(hex, L) {
  return oklchToHex({ ...hexToOklch(hex), L: clamp01(L) });
}

/** WCAG relative luminance of a hex color. */
export function relativeLuminance(hex) {
  const [r, g, b] = parseHex(hex).map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG contrast ratio between two hex colors, 1-21.
 * Order-independent.
 */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Nudge `hex` along its own lightness axis until it clears `target` contrast
 * against EVERY background in `backgrounds`, preserving hue and chroma.
 *
 * Direction is inferred from the lightest background: on light surfaces the
 * color is darkened, on dark surfaces it is lightened. Returns the original
 * color when it already passes, and the best achievable value if the ratio is
 * unreachable (e.g. mid-grey backgrounds) rather than throwing — callers assert
 * on the result.
 *
 * Used so a palette's derived tokens satisfy their contrast contract by
 * construction instead of relying on hand-picked hex values staying accurate.
 */
export function ensureContrast(hex, backgrounds, target = 4.5, steps = 60) {
  const bgs = Array.isArray(backgrounds) ? backgrounds : [backgrounds];
  if (bgs.length === 0) return hex;

  const worst = (candidate) => Math.min(...bgs.map((bg) => contrastRatio(candidate, bg)));
  if (worst(hex) >= target) return hex;

  // Push away from the background: darker on light surfaces, lighter on dark.
  const bgLightness = Math.max(...bgs.map((bg) => hexToOklch(bg).L));
  const goingDarker = bgLightness > 0.5;

  const { L, C, H } = hexToOklch(hex);
  const bound = goingDarker ? 0 : 1;

  let best = hex;
  let bestRatio = worst(hex);

  for (let i = 1; i <= steps; i += 1) {
    const candidate = oklchToHex({ L: L + (bound - L) * (i / steps), C, H });
    const ratio = worst(candidate);
    if (ratio > bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }
    if (ratio >= target) return candidate;
  }

  return best;
}
