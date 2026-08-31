/**
 * palettes.js — single source of truth for HomeChronicle's twelve color worlds.
 *
 * Each palette declares a handful of ANCHOR colors per mode (background, panel,
 * border, ink, muted, accent). Every other `--hc-*` surface/chart token is
 * DERIVED from those anchors in `buildTokens()`, so the twelve palettes stay
 * internally consistent and a tweak to one anchor propagates correctly.
 *
 * Room/category colors come from three shared, pre-validated ramps rather than
 * twelve bespoke sets — see RAMPS below.
 *
 * `web/scripts/gen-palettes.mjs` turns this module into `web/src/palettes.css`.
 * After editing anything here, re-run:  node scripts/gen-palettes.mjs
 */

import { mix, darken, lighten, toRgbTriplet, ensureContrast, contrastRatio } from './color.js';

/** WCAG AA for body text; applied to primary and secondary text tokens. */
const TEXT_CONTRAST_TARGET = 4.5;
/** WCAG threshold for non-text UI components and graphics. */
const UI_CONTRAST_TARGET = 3;
/**
 * Minimum contrast between a room badge's tint and the panel behind it. Well
 * below any WCAG threshold on purpose — the tint is decoration, not
 * information (the room NAME carries identity) — but high enough that the pill
 * is visible as a shape rather than dissolving into the card.
 */
const BADGE_TINT_TARGET = 1.15;

/**
 * Solid status backgrounds. These live in index.css (shared across palettes,
 * since status colours are reserved), and are mirrored here only so the
 * matching foreground token can be derived against them. Keep in step.
 */
const STATUS_SOLID = {
  light: { danger: '#b91c1c', success: '#15803d', warning: '#b45309' },
  dark: { danger: '#f87171', success: '#6ee7b7', warning: '#fbbf24' },
};

/**
 * Pick a readable foreground for a solid fill.
 *
 * Solid buttons were hardcoded `text-white`, which fails badly once the fill is
 * palette- and mode-aware: white on Ink's dark accent measures 2.08:1. Choose
 * whichever end of the palette's own range starts closer, then push it to AA.
 */
function foregroundOn(solid, palette, mode) {
  const light = palette[mode === 'dark' ? 'ink' : 'panel'];
  const dark = palette[mode === 'dark' ? 'panel' : 'ink'];
  const best = contrastRatio(light, solid) >= contrastRatio(dark, solid) ? light : dark;
  return ensureContrast(best, [solid], TEXT_CONTRAST_TARGET);
}

/**
 * Categorical ramps for rooms and chart categories. Nine slots each.
 *
 * `field` and `vivid` were validated for colour-blind separation (deutan /
 * protan / tritan ΔE), chroma floor, lightness band, normal-vision floor and
 * surface contrast, in BOTH modes. SLOT ORDER IS PART OF THE VALIDATION —
 * adjacent pairs are what get checked, so do not reorder these arrays without
 * re-running the validator.
 *
 * `mono` is a deliberate exception: it is near-greyscale and does not meet the
 * chroma floor. That is the intended character of the Ink and Graphite worlds,
 * and it is only acceptable because room identity is ALWAYS carried by a
 * visible label beside the swatch, never by color alone (ROOM-03).
 */
export const RAMPS = {
  field: {
    light: ['#078e7e', '#c05a36', '#3d64a8', '#bf9426', '#96549c', '#5f9440', '#b03a68', '#5a5ab5', '#2f8f6b'],
    dark: ['#149e8d', '#ca6b4a', '#5f89d0', '#ac8200', '#af6cb5', '#659a46', '#c76486', '#7b7ed6', '#3a9e78'],
  },
  vivid: {
    light: ['#1a56c4', '#d92b1f', '#d98e04', '#0e8a4f', '#b0329a', '#12a5b8', '#6d4fc4', '#5f7016', '#e0559a'],
    dark: ['#cc675a', '#009bae', '#b97a13', '#5b88d7', '#c25da8', '#38a065', '#8a79d1', '#80933f', '#c46590'],
  },
  mono: {
    light: ['#5f7016', '#3c3c37', '#85857b', '#55554e', '#b3b3a6', '#9b9b8e', '#6b6b62', '#a5a59a', '#4a4a44'],
    dark: ['#a4bf3d', '#cfcfc2', '#8f8f84', '#b3b3a7', '#5c5c54', '#75756c', '#9e9e93', '#67675f', '#bcbcb0'],
  },
};

/** Ramps that are near-greyscale and intentionally skip the chroma floor. */
export const ACHROMATIC_RAMPS = new Set(['mono']);

/**
 * The twelve palettes, in picker display order (roughly white -> tinted -> grey).
 *
 * Anchors per mode:
 *   bg     page background
 *   panel  raised surface (cards, panels)
 *   border hairline border
 *   ink    primary text
 *   muted  secondary text
 *   accent brand/interactive accent
 */
export const PALETTES = {
  gallery: {
    name: 'Gallery',
    tagline: 'pure white · vivid',
    ramp: 'vivid',
    light: { bg: '#ffffff', panel: '#fafafa', border: '#e3e3e3', ink: '#141414', muted: '#6e6e6e', accent: '#1a56c4' },
    dark: { bg: '#111214', panel: '#191a1d', border: '#333539', ink: '#ebebeb', muted: '#9a9a9a', accent: '#5b88d7' },
  },
  ember: {
    name: 'Ember',
    tagline: 'warm white · scarlet',
    ramp: 'field',
    light: { bg: '#faf6f3', panel: '#fffdfb', border: '#e8ddd6', ink: '#251c18', muted: '#7d6e66', accent: '#bf3b2b' },
    dark: { bg: '#1a1412', panel: '#231b18', border: '#3e332e', ink: '#ecdfd9', muted: '#a3928a', accent: '#e07a63' },
  },
  almanac: {
    name: 'Almanac',
    tagline: 'cream · clay',
    ramp: 'field',
    light: { bg: '#f6f0e3', panel: '#fbf6ea', border: '#ded3bd', ink: '#221e19', muted: '#7a7060', accent: '#c05a36' },
    dark: { bg: '#191512', panel: '#211c17', border: '#3c342b', ink: '#eae1d1', muted: '#a2957f', accent: '#d97e5b' },
  },
  harvest: {
    name: 'Harvest',
    tagline: 'paper · amber',
    ramp: 'field',
    light: { bg: '#f8f3e6', panel: '#fdfaf1', border: '#e3d9c2', ink: '#26200f', muted: '#7d7358', accent: '#a1720b' },
    dark: { bg: '#181510', panel: '#201c14', border: '#3a3426', ink: '#e9e2cf', muted: '#a29a80', accent: '#d1a23c' },
  },
  ink: {
    name: 'Ink',
    tagline: 'monochrome · citron',
    ramp: 'mono',
    light: { bg: '#f7f7f4', panel: '#fdfdfb', border: '#dbdbd3', ink: '#1b1b18', muted: '#6f6f66', accent: '#5f7016' },
    dark: { bg: '#161614', panel: '#1e1e1b', border: '#35352f', ink: '#e4e4db', muted: '#98988e', accent: '#a4bf3d' },
  },
  fern: {
    name: 'Fern',
    tagline: 'green white · forest',
    ramp: 'field',
    light: { bg: '#f2f6f0', panel: '#fafcf8', border: '#d6e0d2', ink: '#1e2a1e', muted: '#66765f', accent: '#2e7d46' },
    dark: { bg: '#131811', panel: '#1b211a', border: '#313d2f', ink: '#dde6d8', muted: '#93a58c', accent: '#55a86e' },
  },
  porcelain: {
    name: 'Porcelain',
    tagline: 'cool white · teal',
    ramp: 'field',
    light: { bg: '#f3f5f4', panel: '#fbfcfb', border: '#d8dedb', ink: '#212927', muted: '#68746f', accent: '#078e7e' },
    dark: { bg: '#151817', panel: '#1d2120', border: '#333a37', ink: '#dde4e1', muted: '#93a09b', accent: '#149e8d' },
  },
  tide: {
    name: 'Tide',
    tagline: 'sky white · sea',
    ramp: 'field',
    light: { bg: '#f1f5f8', panel: '#fafcfd', border: '#d3dfe7', ink: '#17242d', muted: '#5f7280', accent: '#0e7fa8' },
    dark: { bg: '#10161b', panel: '#171f26', border: '#2d3a44', ink: '#d8e3ea', muted: '#8ba0ad', accent: '#4aa8cc' },
  },
  atlas: {
    name: 'Atlas',
    tagline: 'light grey · cobalt',
    ramp: 'field',
    light: { bg: '#e9eaeb', panel: '#f4f5f5', border: '#cfd1d3', ink: '#1d1f21', muted: '#64676b', accent: '#2f5fb3' },
    dark: { bg: '#141517', panel: '#1c1e20', border: '#35383b', ink: '#e4e6e8', muted: '#94989d', accent: '#7295d8' },
  },
  iris: {
    name: 'Iris',
    tagline: 'lavender white · violet',
    ramp: 'field',
    light: { bg: '#f4f3f8', panel: '#fbfbfd', border: '#dcdae8', ink: '#221f2e', muted: '#6d6980', accent: '#6d4fc4' },
    dark: { bg: '#151318', panel: '#1d1a22', border: '#37333f', ink: '#e2dfea', muted: '#9b95ac', accent: '#a08fe0' },
  },
  dusk: {
    name: 'Dusk',
    tagline: 'blue-grey · berry',
    ramp: 'field',
    light: { bg: '#eef0f6', panel: '#f8f9fc', border: '#d3d8e6', ink: '#232946', muted: '#666e8f', accent: '#b03a68' },
    dark: { bg: '#14161f', panel: '#1c1f2b', border: '#333952', ink: '#dbdeed', muted: '#9298b8', accent: '#c76486' },
  },
  graphite: {
    name: 'Graphite',
    tagline: 'grey · slate',
    ramp: 'mono',
    light: { bg: '#e4e4e4', panel: '#efefef', border: '#c8c8c8', ink: '#191919', muted: '#5f5f5f', accent: '#47525e' },
    dark: { bg: '#121212', panel: '#1a1a1a', border: '#343434', ink: '#e6e6e6', muted: '#979797', accent: '#9aa6b2' },
  },
};

/** Palette ids in picker display order. */
export const PALETTE_IDS = Object.keys(PALETTES);

/** Default for new installs and for any unrecognised stored value. */
export const DEFAULT_PALETTE = 'porcelain';

export const MODES = ['light', 'dark'];

/**
 * Upgrade path from the eight pre-v0.4 `data-accent` skins to the nearest of
 * the twelve palettes, so an existing install does not appear to reset to
 * defaults on upgrade (PAL-06).
 */
export const ACCENT_TO_PALETTE = {
  ocean: 'tide',
  graphite: 'graphite',
  sunrise: 'harvest',
  red: 'ember',
  yellow: 'harvest',
  purple: 'iris',
  slate: 'atlas',
  pink: 'dusk',
};

/** True when `id` names one of the twelve palettes. */
export function isPaletteId(id) {
  return typeof id === 'string' && Object.hasOwn(PALETTES, id);
}

/**
 * Resolve any stored palette/accent value to a valid palette id.
 * Accepts a palette id, a legacy accent name, or anything else (-> default).
 */
export function resolvePaletteId(stored) {
  if (isPaletteId(stored)) return stored;
  if (typeof stored === 'string' && Object.hasOwn(ACCENT_TO_PALETTE, stored)) {
    return ACCENT_TO_PALETTE[stored];
  }
  return DEFAULT_PALETTE;
}

/** The nine-slot categorical ramp for a palette in a mode. */
export function rampFor(paletteId, mode) {
  const palette = PALETTES[paletteId];
  if (!palette) throw new Error(`unknown palette: ${paletteId}`);
  return RAMPS[palette.ramp][mode];
}

/**
 * Derive the complete `--hc-*` token set for one palette in one mode.
 *
 * Token NAMES intentionally match the pre-v0.4 set so every existing component
 * keeps working — only the values become palette-aware. The additions are
 * `--hc-room-1..9` (categorical rooms) and the `--hc-cat-0..8` aliases that
 * point the existing chart-category classes at the same ramp.
 *
 * Status tokens (success/warning/danger) are deliberately NOT emitted here:
 * they are reserved semantic colors shared across palettes and stay defined
 * once per mode in index.css.
 */
export function buildTokens(paletteId, mode) {
  const palette = PALETTES[paletteId];
  if (!palette) throw new Error(`unknown palette: ${paletteId}`);
  if (!MODES.includes(mode)) throw new Error(`unknown mode: ${mode}`);

  const { bg, panel, border, ink, muted, accent } = palette[mode];
  const isDark = mode === 'dark';

  // In dark mode "raising" a surface means moving toward light, and vice versa.
  const raise = (hex, amount) => (isDark ? lighten(hex, amount) : darken(hex, amount));
  const softenAccent = (amount) => mix(accent, bg, amount);

  const ramp = RAMPS[palette.ramp][mode];

  // Text and accent tokens satisfy their contrast contract BY CONSTRUCTION
  // rather than by hand-picked anchors: each is nudged along its own lightness
  // axis until it clears the threshold against both the page and panel
  // surfaces. Hue and chroma — the palette's character — are preserved.
  // Several hand-picked `muted` anchors landed at 4.24-4.45 against AA's 4.5;
  // this is what corrects them, and keeps any future palette honest too.
  const surfaces = [bg, panel];
  const inkSafe = ensureContrast(ink, surfaces, TEXT_CONTRAST_TARGET);
  const mutedSafe = ensureContrast(muted, surfaces, TEXT_CONTRAST_TARGET);
  const accentSafe = ensureContrast(accent, surfaces, UI_CONTRAST_TARGET);

  const tokens = {
    // -- Surfaces --
    'bg': bg,
    'panel': panel,
    'panel-soft': mix(panel, bg, 0.55),
    'panel-mid': raise(panel, 0.05),
    'panel-hover': raise(panel, 0.1),
    'panel-border': border,
    'border-strong': raise(border, 0.12),
    'shadow': isDark
      ? '0 12px 24px -16px rgba(0, 0, 0, 0.8)'
      : `0 8px 22px -16px ${rgba(inkSafe, 0.24)}`,

    // -- Text --
    'fg': inkSafe,
    'fg-strong': raise(inkSafe, 0.08),
    'muted': mutedSafe,
    'muted-light': mix(mutedSafe, inkSafe, 0.35),

    // -- Accent --
    'accent-rgb': toRgbTriplet(accentSafe),
    'accent-soft': softenAccent(isDark ? 0.78 : 0.85),
    'accent-strong': accentSafe,
    'accent-stronger': isDark ? lighten(accentSafe, 0.18) : darken(accentSafe, 0.18),
    'glow-1': rgba(accentSafe, isDark ? 0.1 : 0.14),
    'glow-2': rgba(ramp[2], isDark ? 0.08 : 0.11),

    // -- Charts --
    'chart-tick': mutedSafe,
    'chart-grid': border,
    'chart-label': inkSafe,
    'chart-sublabel': mutedSafe,
    'tooltip-bg': panel,
    'tooltip-text': inkSafe,
    'tooltip-border': border,

    // -- Foreground on a solid fill (buttons, badges) --
    'on-accent': foregroundOn(accentSafe, palette[mode], mode),
    'on-danger': foregroundOn(STATUS_SOLID[mode].danger, palette[mode], mode),
    'on-success': foregroundOn(STATUS_SOLID[mode].success, palette[mode], mode),
    'on-warning': foregroundOn(STATUS_SOLID[mode].warning, palette[mode], mode),

    // -- Rooms / categories --
    'room-fallback': mix(mutedSafe, bg, 0.25),
  };

  ramp.forEach((hex, i) => {
    const slot = i + 1;

    // The solid colour: dots, bar fills, left borders.
    tokens[`room-${slot}`] = hex;

    // Room badges need a tinted background with readable text on it, so each
    // slot also carries a soft surface and a text colour guaranteed to meet AA
    // against that surface. Deriving them here (rather than in the component)
    // is what lets roomColors.js return plain CSS vars and stay theme-reactive
    // with no JS.
    // A fixed mix ratio leaves some slots almost invisible against the panel
    // (a slot whose hue sits close to the surface measured 1.086:1, i.e. no
    // discernible pill). Mixing first, then enforcing a floor, keeps the tint
    // subtle where it can afford to be and nudges only the slots that need it.
    const tinted = mix(hex, panel, isDark ? 0.82 : 0.86);
    const soft = ensureContrast(tinted, [panel], BADGE_TINT_TARGET);
    tokens[`room-${slot}-soft`] = soft;
    tokens[`room-${slot}-text`] = ensureContrast(hex, [soft], TEXT_CONTRAST_TARGET);

    // The pre-v0.4 chart-category classes (.hc-cat-N) read these; aliasing them
    // to the same ramp is what makes chart categories palette-aware (ROOM-05).
    tokens[`cat-${i}`] = hex;
  });

  return tokens;
}

/** `#rrggbb` + alpha -> `rgba(r, g, b, a)`. */
function rgba(hex, alpha) {
  return `rgba(${toRgbTriplet(hex)}, ${alpha})`;
}
