import { useEffect, useState } from 'react';

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
  const [accent, setAccentState] = useState(getStoredAccent);

  useEffect(() => {
    applyAccent(accent);
  }, [accent]);

  useEffect(() => {
    const storage = getStorage();
    if (!storage) return;
    storeAccent(accent, storage);
  }, [accent]);

  function setAccent(newAccent) {
    setAccentState(newAccent);
  }

  return { accent, setAccent };
}
