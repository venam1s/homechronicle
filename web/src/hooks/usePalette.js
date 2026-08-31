import { useEffect } from 'react';
import { usePreference } from './usePreference.js';
import { PALETTES, DEFAULT_PALETTE, ACCENT_TO_PALETTE, isPaletteId, resolvePaletteId } from '../lib/palettes.js';

/**
 * usePalette — the v0.4 replacement for useAccent.
 *
 * Pre-v0.4 the app had eight `data-accent` skins that recolored only the accent.
 * A palette is a whole color world: surfaces, ink, accent, chart tokens, and a
 * nine-slot categorical ramp, with a purpose-built dark variant. It is applied
 * as `data-palette` on <html>; the token values live in the generated
 * palettes.css.
 *
 * Storage keys, oldest to newest — read in that order exactly once so an
 * existing install lands on the nearest palette instead of snapping back to the
 * default (PAL-06):
 *   hc_ui_skin  legacy skin name      (pre-consolidation)
 *   hc_accent   eight accent names    (pre-v0.4)
 *   hc_palette  twelve palette ids    (current)
 */

export const STORAGE_KEY = 'hc_palette';
const LEGACY_ACCENT_KEY = 'hc_accent';
const LEGACY_SKIN_KEY = 'hc_ui_skin';

export function getStorage() {
  if (typeof window === 'undefined') return null;
  const storage = window.localStorage;
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    return null;
  }
  return storage;
}

/**
 * Resolve the palette this browser should start on, upgrading a stored accent
 * when no palette has been chosen yet. Never throws; always returns a valid id.
 */
export function getStoredPalette() {
  const storage = getStorage();
  if (!storage) return DEFAULT_PALETTE;

  let palette = null;
  let accent = null;
  try {
    palette = storage.getItem(STORAGE_KEY);
    accent = storage.getItem(LEGACY_ACCENT_KEY) ?? storage.getItem(LEGACY_SKIN_KEY);
  } catch {
    return DEFAULT_PALETTE;
  }

  if (isPaletteId(palette)) return palette;
  // resolvePaletteId maps a legacy accent name, and falls back to the default
  // for anything unrecognised (including null).
  return resolvePaletteId(accent);
}

/** Paint a palette by setting the attribute the generated CSS keys off. */
export function applyPalette(paletteId) {
  const id = isPaletteId(paletteId) ? paletteId : DEFAULT_PALETTE;
  document.documentElement.dataset.palette = id;
  // The pre-v0.4 attribute no longer has any CSS attached to it; clearing it
  // stops a stale value from lingering in the DOM and confusing debugging.
  delete document.documentElement.dataset.accent;
}

/**
 * The active palette id plus a setter. Persists through usePreference, so a
 * signed-in user's choice syncs to their account and a signed-out user's
 * choice stays in localStorage (PAL-03 / PAL-04).
 */
export function usePalette() {
  // Identity codec: hc_palette stores a raw string, not JSON.
  // getStoredPalette() as the default value is what performs the one-time
  // accent -> palette upgrade for an existing install.
  const [stored, setPalette] = usePreference(
    'palette',
    getStoredPalette(),
    { localStorageKey: STORAGE_KEY, serialize: (v) => v, deserialize: (v) => v },
  );

  // Guard the value on the way out too: a synced blob written by a newer or
  // older build could hold something this build does not know about.
  const palette = resolvePaletteId(stored);

  useEffect(() => {
    applyPalette(palette);
  }, [palette]);

  return { palette, setPalette, palettes: PALETTES };
}

export { PALETTES, DEFAULT_PALETTE, ACCENT_TO_PALETTE, isPaletteId, resolvePaletteId };
