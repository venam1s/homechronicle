import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getStoredPalette, applyPalette, STORAGE_KEY } from './usePalette.js';
import { DEFAULT_PALETTE } from '../lib/palettes.js';

function setStorage(entries) {
  const store = new Map(Object.entries(entries));
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  });
}

describe('getStoredPalette', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-palette');
    document.documentElement.removeAttribute('data-accent');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the default when nothing is stored', () => {
    setStorage({});
    expect(getStoredPalette()).toBe(DEFAULT_PALETTE);
  });

  it('returns a stored palette id', () => {
    setStorage({ [STORAGE_KEY]: 'dusk' });
    expect(getStoredPalette()).toBe('dusk');
  });

  it('falls back to the default for an unrecognised palette id', () => {
    setStorage({ [STORAGE_KEY]: 'chartreuse' });
    expect(getStoredPalette()).toBe(DEFAULT_PALETTE);
  });

  // PAL-06: an existing install must land on the nearest palette rather than
  // snapping back to the default, so the UI does not look like it reset.
  it.each([
    ['ocean', 'tide'],
    ['graphite', 'graphite'],
    ['sunrise', 'harvest'],
    ['red', 'ember'],
    ['yellow', 'harvest'],
    ['purple', 'iris'],
    ['slate', 'atlas'],
    ['pink', 'dusk'],
  ])('upgrades the stored %s accent to the %s palette', (accent, palette) => {
    setStorage({ hc_accent: accent });
    expect(getStoredPalette()).toBe(palette);
  });

  it('upgrades from the pre-consolidation skin key when no accent is stored', () => {
    setStorage({ hc_ui_skin: 'purple' });
    expect(getStoredPalette()).toBe('iris');
  });

  it('prefers an explicit palette choice over a legacy accent', () => {
    setStorage({ [STORAGE_KEY]: 'fern', hc_accent: 'red' });
    expect(getStoredPalette()).toBe('fern');
  });

  it('survives storage that throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => {},
    });
    expect(getStoredPalette()).toBe(DEFAULT_PALETTE);
  });

  it('survives a missing storage implementation', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(getStoredPalette()).toBe(DEFAULT_PALETTE);
  });
});

describe('applyPalette', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-palette');
    document.documentElement.removeAttribute('data-accent');
  });

  it('sets the attribute the generated CSS keys off', () => {
    applyPalette('iris');
    expect(document.documentElement.dataset.palette).toBe('iris');
  });

  it('coerces an unknown id to the default rather than painting nothing', () => {
    applyPalette('chartreuse');
    expect(document.documentElement.dataset.palette).toBe(DEFAULT_PALETTE);
  });

  it('clears the retired data-accent attribute', () => {
    document.documentElement.dataset.accent = 'ocean';
    applyPalette('tide');
    expect(document.documentElement.dataset.accent).toBeUndefined();
    expect(document.documentElement.dataset.palette).toBe('tide');
  });
});
