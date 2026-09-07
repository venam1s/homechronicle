/**
 * useTheme cross-instance integration.
 *
 * useTheme is mounted three times in the real app: AppearanceProvider (the
 * always-mounted painter), Masthead, and AppearanceSection (Settings). Each
 * instance owns its own usePreference state, so they only stay in agreement if
 * something actively syncs them. These tests compose two REAL instances — no
 * mocked useTheme — because the per-component unit suites mock the hook away
 * and can never see the instances disagree (the composition-blindness trap).
 *
 * The bug this pins down: picking "System" in Settings updated only the
 * Settings instance. After navigating away, the painter instance still held
 * the old explicit preference, so an OS scheme flip repainted nothing until a
 * full reload.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTheme } from './useTheme.js';

const DARK_QUERY = '(prefers-color-scheme: dark)';

// Controllable matchMedia: one shared "matches" flag plus a listener registry,
// so a test can flip the OS scheme and fire the change event like a browser.
function installMatchMedia() {
  const state = { matches: false, listeners: new Set() };
  window.matchMedia = (query) => ({
    get matches() { return query === DARK_QUERY ? state.matches : false; },
    media: query,
    onchange: null,
    addEventListener: (type, fn) => { if (type === 'change') state.listeners.add(fn); },
    removeEventListener: (type, fn) => { state.listeners.delete(fn); },
    addListener: (fn) => { state.listeners.add(fn); },
    removeListener: (fn) => { state.listeners.delete(fn); },
    dispatchEvent: () => false,
  });
  state.setSystemDark = (matches) => {
    state.matches = matches;
    for (const fn of [...state.listeners]) fn({ matches });
  };
  return state;
}

// Mirrors AppearanceProvider: paints by side effect, renders nothing.
function Painter() {
  useTheme();
  return null;
}

// Mirrors AppearanceSection's theme control: a second real instance that
// changes the preference.
let controlApi;
function ThemeControl() {
  const api = useTheme();
  controlApi = api;
  return null;
}

function Harness({ showControl }) {
  return (
    <>
      <Painter />
      {showControl && <ThemeControl />}
    </>
  );
}

function renderHarness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness showControl />
    </QueryClientProvider>,
  );
}

describe('useTheme system-follow across instances', () => {
  let media;

  beforeEach(() => {
    localStorage.clear();
    media = installMatchMedia();
    document.documentElement.className = '';
    delete document.documentElement.dataset.theme;
  });

  afterEach(() => {
    controlApi = undefined;
  });

  it('follows an OS scheme change when the preference is already system', () => {
    localStorage.setItem('hc_theme_preference', 'system');
    renderHarness();
    expect(document.documentElement.classList.contains('theme-light')).toBe(true);

    act(() => media.setSystemDark(true));

    expect(document.documentElement.classList.contains('theme-dark')).toBe(true);
  });

  it('follows the OS after switching to system from another instance, even once that instance unmounts', () => {
    // The user has an explicit theme from months ago...
    localStorage.setItem('hc_theme_preference', 'light');
    const view = renderHarness();

    // ...opens Settings and picks "System"...
    act(() => controlApi.setPreference('system'));
    expect(localStorage.getItem('hc_theme_preference')).toBe('system');

    // ...then navigates away (the Settings instance unmounts)...
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, enabled: false } },
    });
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <Harness showControl={false} />
      </QueryClientProvider>,
    );

    // ...and that evening the OS switches to dark. The painter instance must
    // follow: it may not still be holding the stale explicit preference.
    act(() => media.setSystemDark(true));

    expect(document.documentElement.classList.contains('theme-dark')).toBe(true);
  });
});
