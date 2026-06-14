import { useEffect } from 'react';
import { usePreference } from './usePreference.js';

const NEW_KEY = 'hc_accent';
const LEGACY_KEY = 'hc_ui_skin';
export const VALID_ACCENTS = new Set(['ocean', 'graphite', 'sunrise', 'red', 'yellow', 'purple', 'slate', 'pink']);

export function getStorage() {
  if (typeof window === 'undefined') return null;
  const storage = window.localStorage;
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    return null;
  }
  return storage;
}

export function getStoredAccent() {
  const storage = getStorage();
  if (!storage) return 'ocean';
  let value = null;
  try {
    value = storage.getItem(NEW_KEY) ?? storage.getItem(LEGACY_KEY);
  } catch {
    return 'ocean';
  }
  return VALID_ACCENTS.has(value) ? value : 'ocean';
}

export function applyAccent(accent) {
  document.documentElement.dataset.accent = accent;
}

export function storeAccent(accent, storage) {
  try {
    storage.setItem(NEW_KEY, accent);
  } catch {
    // Ignore write failures (private mode, blocked storage, test env stubs).
  }
}

export function useAccent() {
  // Identity codec: hc_accent stores raw strings (not JSON).
  // getStoredAccent() as defaultValue captures the legacy hc_ui_skin fallback for migration.
  const [accent, setAccent] = usePreference(
    'accent',
    getStoredAccent(),
    { localStorageKey: NEW_KEY, serialize: (v) => v, deserialize: (v) => v },
  );

  useEffect(() => {
    applyAccent(accent);
  }, [accent]);

  return { accent, setAccent };
}
