import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getStoredAccent, applyAccent, storeAccent, VALID_ACCENTS } from './useAccent.js';

function makeStorage(map = {}) {
  return {
    getItem: vi.fn((key) => map[key] ?? null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    length: Object.keys(map).length,
    key: vi.fn(),
  };
}

describe('useAccent', () => {
  beforeEach(() => {
    delete document.documentElement.dataset.accent;
  });

  afterEach(() => {
    delete document.documentElement.dataset.accent;
    vi.unstubAllGlobals();
  });

  it('Test 1: getStoredAccent returns ocean when both hc_accent and hc_ui_skin are absent from localStorage', () => {
    vi.stubGlobal('localStorage', makeStorage());
    const result = getStoredAccent();
    expect(result).toBe('ocean');
  });

  it('Test 2: getStoredAccent returns value from hc_accent when it exists (e.g. purple)', () => {
    vi.stubGlobal('localStorage', makeStorage({ hc_accent: 'purple' }));
    const result = getStoredAccent();
    expect(result).toBe('purple');
  });

  it('Test 3: getStoredAccent falls back to hc_ui_skin when hc_accent is absent (migration path)', () => {
    vi.stubGlobal('localStorage', makeStorage({ hc_ui_skin: 'red' }));
    const result = getStoredAccent();
    expect(result).toBe('red');
  });

  it('Test 4: getStoredAccent returns ocean when stored value is not in VALID_ACCENTS set', () => {
    vi.stubGlobal('localStorage', makeStorage({ hc_accent: 'invalid-theme' }));
    const result = getStoredAccent();
    expect(result).toBe('ocean');
  });

  it('Test 5: storeAccent writes to hc_accent key (not hc_ui_skin)', () => {
    const setItemSpy = vi.fn();
    const mockStorage = { setItem: setItemSpy };
    storeAccent('purple', mockStorage);
    expect(setItemSpy).toHaveBeenCalledWith('hc_accent', 'purple');
    expect(setItemSpy).not.toHaveBeenCalledWith('hc_ui_skin', expect.anything());
  });

  it('Test 6: applyAccent sets document.documentElement.dataset.accent', () => {
    applyAccent('graphite');
    expect(document.documentElement.dataset.accent).toBe('graphite');
  });
});
