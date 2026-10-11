import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { PALETTE_IDS, ACCENT_TO_PALETTE, DEFAULT_PALETTE } from './palettes.js';
import { getStoredPalette } from '../hooks/usePalette.js';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = readFileSync(join(WEB, 'public', 'theme-init.js'), 'utf8');
const INDEX = readFileSync(join(WEB, 'index.html'), 'utf8');

/** Run public/theme-init.js the way the browser does: a classic script, top level. */
function runThemeInit() {
  new Function(SCRIPT)();
  return document.documentElement;
}

function stubPrefersDark(dark) {
  vi.stubGlobal('matchMedia', (query) => ({
    matches: dark && query === '(prefers-color-scheme: dark)',
    media: query,
  }));
}

describe('theme-init.js (first-paint script)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    const root = document.documentElement;
    delete root.dataset.theme;
    delete root.dataset.palette;
    root.className = '';
    root.style.colorScheme = '';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // The CSP is `script-src 'self'`; an inline script is blocked on every load.
  it('is loaded as a same-origin file, with no inline script left in index.html', () => {
    expect(INDEX).toMatch(/<script src="\/theme-init\.js(?:\?[^"]*)?"><\/script>/);
    expect(INDEX).not.toMatch(/<script>/);
  });

  describe('agrees with getStoredPalette()', () => {
    const cases = [
      ['nothing stored', {}],
      ...PALETTE_IDS.map((id) => [`palette ${id}`, { hc_palette: id }]),
      ...Object.keys(ACCENT_TO_PALETTE).map((a) => [`v0.3 accent ${a}`, { hc_accent: a }]),
      ...Object.keys(ACCENT_TO_PALETTE).map((a) => [`legacy skin ${a}`, { hc_ui_skin: a }]),
      ['palette wins over accent', { hc_palette: 'fern', hc_accent: 'purple' }],
      ['accent wins over skin', { hc_accent: 'red', hc_ui_skin: 'purple' }],
      ['unknown palette falls back to accent', { hc_palette: 'chartreuse', hc_accent: 'slate' }],
      ['unknown everything', { hc_palette: 'x', hc_accent: 'y' }],
      ['prototype key is not an accent', { hc_accent: 'constructor' }],
    ];

    it.each(cases)('%s', (_, stored) => {
      for (const [k, v] of Object.entries(stored)) window.localStorage.setItem(k, v);
      expect(runThemeInit().dataset.palette).toBe(getStoredPalette());
    });
  });

  it('defaults to the default palette', () => {
    expect(runThemeInit().dataset.palette).toBe(DEFAULT_PALETTE);
  });

  it.each([
    ['dark', false, 'dark'],
    ['light', true, 'light'],
    ['system', true, 'dark'],
    ['system', false, 'light'],
    [null, true, 'dark'],
    ['bogus', false, 'light'],
  ])('preference %s with OS dark=%s resolves to %s', (pref, osDark, expected) => {
    if (pref !== null) window.localStorage.setItem('hc_theme_preference', pref);
    stubPrefersDark(osDark);
    const root = runThemeInit();
    expect(root.dataset.theme).toBe(expected);
    expect(root.classList.contains('theme-dark')).toBe(expected === 'dark');
    expect(root.classList.contains('theme-light')).toBe(expected === 'light');
    expect(root.style.colorScheme).toBe(expected);
  });

  it('falls back to defaults when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    stubPrefersDark(false);
    const root = runThemeInit();
    expect(root.dataset.palette).toBe(DEFAULT_PALETTE);
    expect(root.dataset.theme).toBe('light');
    vi.restoreAllMocks();
  });
});
