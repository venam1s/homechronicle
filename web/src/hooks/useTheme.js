import { useEffect, useState } from 'react';
import { usePreference } from './usePreference.js';

const STORAGE_KEY = 'hc_theme_preference';

function getStoredPreference() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
  } catch {
    return 'system';
  }
}

function applyTheme(theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle('theme-dark', theme === 'dark');
  root.classList.toggle('theme-light', theme === 'light');
  root.style.colorScheme = theme;
}

export function useTheme() {
  // Identity codec: hc_theme_preference stores raw strings ('light'/'dark'/'system'), not JSON.
  const [preference, setPreference] = usePreference(
    'theme',
    getStoredPreference(),
    { localStorageKey: STORAGE_KEY, serialize: (v) => v, deserialize: (v) => v, followOtherTabs: true },
  );

  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  const resolvedTheme = preference === 'system'
    ? (systemDark ? 'dark' : 'light')
    : preference;

  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (e) => setSystemDark(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  return { preference, resolvedTheme, setPreference };
}
