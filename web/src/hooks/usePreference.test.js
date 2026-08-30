/**
 * usePreference.test.js — RED stubs for the authed/anon preference layer.
 *
 * Wave-0: These tests are expected to FAIL until plan 24-03 implements
 * web/src/hooks/usePreference.js. Do NOT weaken assertions to pass early.
 *
 * Contracts under test:
 * - Authed: value from server blob; setter calls PUT + mirrors localStorage (PREF-04/D-10)
 * - Anon: zero fetchJson calls; value from localStorage; setter writes localStorage only (PREF-05/D-15)
 * - Seeding: exactly ONE PUT on empty blob; zero PUTs on non-empty blob (PREF-11/D-14)
 * - Setter delegates to setPrefsBlob per-key (D-10); cross-key debounce coalescing is in useUserPreferences.test.js (D-09)
 * - Malformed blob: falls back to per-key default (D-18)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

vi.mock('../lib/api.js', () => ({
  API_BASE: 'http://localhost:3001/api',
  fetchJson: vi.fn(),
}));

vi.mock('./useAuth.js', () => ({
  useAuth: vi.fn(),
}));

// Mock useUserPreferences to control the server blob in these tests.
vi.mock('./useUserPreferences.js', () => ({
  useUserPreferences: vi.fn(),
}));

import { fetchJson } from '../lib/api.js';
import { useAuth } from './useAuth.js';
import { useUserPreferences } from './useUserPreferences.js';
// Target module does not exist until 24-03 — import will fail, making these RED.
import { usePreference } from './usePreference.js';

function makeStorage(map = {}) {
  const store = { ...map };
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, val) => { store[key] = val; }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { Object.keys(store).forEach((k) => delete store[k]); }),
  };
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('usePreference — authed path (PREF-04/D-10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', makeStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns value from server blob when authenticated and key exists', async () => {
    useAuth.mockReturnValue({ user: { id: 42, role: 'member', email: 'u@example.com' } });
    useUserPreferences.mockReturnValue({
      prefs: { theme: 'dark' },
      setPrefsBlob: vi.fn(),
    });

    const { result } = renderHook(
      () => usePreference('theme', 'system', { localStorageKey: 'hc_theme_preference' }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current[0]).toBe('dark'));
    expect(result.current[0]).toBe('dark');
  });

  it('setter calls PUT (via setPrefsBlob) and mirrors value to localStorage', async () => {
    const setPrefsBlob = vi.fn().mockResolvedValue(undefined);
    useAuth.mockReturnValue({ user: { id: 42, role: 'member', email: 'u@example.com' } });
    useUserPreferences.mockReturnValue({
      prefs: { theme: 'dark' },
      setPrefsBlob,
    });
    const storage = makeStorage({ hc_theme_preference: '"dark"' });
    vi.stubGlobal('localStorage', storage);

    const { result } = renderHook(
      () => usePreference('theme', 'system', { localStorageKey: 'hc_theme_preference' }),
      { wrapper: makeWrapper() },
    );

    act(() => {
      result.current[1]('light');
    });

    await waitFor(() => expect(setPrefsBlob).toHaveBeenCalled());
    // Must have called setPrefsBlob with blob containing the new value.
    expect(setPrefsBlob).toHaveBeenCalledWith(expect.objectContaining({ theme: 'light' }));
    // Must also have mirrored to localStorage.
    expect(storage.setItem).toHaveBeenCalledWith('hc_theme_preference', expect.stringContaining('light'));
  });
});

describe('usePreference — anonymous path (PREF-05/D-15)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('makes zero fetchJson calls when user is null', async () => {
    useAuth.mockReturnValue({ user: null });
    useUserPreferences.mockReturnValue({ prefs: undefined, setPrefsBlob: vi.fn() });
    vi.stubGlobal('localStorage', makeStorage({ hc_theme_preference: '"dark"' }));

    renderHook(
      () => usePreference('theme', 'system', { localStorageKey: 'hc_theme_preference' }),
      { wrapper: makeWrapper() },
    );
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('returns value from localStorage when user is null', () => {
    useAuth.mockReturnValue({ user: null });
    useUserPreferences.mockReturnValue({ prefs: undefined, setPrefsBlob: vi.fn() });
    vi.stubGlobal('localStorage', makeStorage({ hc_theme_preference: '"dark"' }));

    const { result } = renderHook(
      () => usePreference('theme', 'system', { localStorageKey: 'hc_theme_preference' }),
      { wrapper: makeWrapper() },
    );

    expect(result.current[0]).toBe('dark');
  });

  it('returns defaultValue when localStorage has no entry and user is null', () => {
    useAuth.mockReturnValue({ user: null });
    useUserPreferences.mockReturnValue({ prefs: undefined, setPrefsBlob: vi.fn() });
    vi.stubGlobal('localStorage', makeStorage());

    const { result } = renderHook(
      () => usePreference('theme', 'system', { localStorageKey: 'hc_theme_preference' }),
      { wrapper: makeWrapper() },
    );

    expect(result.current[0]).toBe('system');
  });

  it('setter writes localStorage only (no server call) when user is null', () => {
    const setPrefsBlob = vi.fn();
    useAuth.mockReturnValue({ user: null });
    useUserPreferences.mockReturnValue({ prefs: undefined, setPrefsBlob });
    const storage = makeStorage();
    vi.stubGlobal('localStorage', storage);

    const { result } = renderHook(
      () => usePreference('theme', 'system', { localStorageKey: 'hc_theme_preference' }),
      { wrapper: makeWrapper() },
    );

    act(() => { result.current[1]('light'); });

    expect(storage.setItem).toHaveBeenCalledWith('hc_theme_preference', expect.stringContaining('light'));
    expect(setPrefsBlob).not.toHaveBeenCalled();
    expect(fetchJson).not.toHaveBeenCalled();
  });
});

// Seeding (PREF-11/D-14) moved out of usePreference into UserPreferencesProvider.seedIfEmpty
// — the per-key seeding effect was removed to eliminate the multi-instance seeding race
// (CR-01). Seeding behavior is now covered in useUserPreferences.test.js.

describe('usePreference — setter delegates to setPrefsBlob (D-09/D-10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('setter calls setPrefsBlob with the updated key when authenticated', async () => {
    // Note: debounce COALESCING across multiple usePreference instances is tested in
    // useUserPreferences.test.js (D-09), where the setPrefsBlob+fetchJson observable
    // contract lives. Here we only verify usePreference delegates per-key writes to
    // setPrefsBlob (D-10: the single consumer abstraction).
    const setPrefsBlob = vi.fn().mockResolvedValue(undefined);
    useAuth.mockReturnValue({ user: { id: 42, role: 'member', email: 'u@example.com' } });
    useUserPreferences.mockReturnValue({ prefs: {}, setPrefsBlob });
    vi.stubGlobal('localStorage', makeStorage());

    const { result } = renderHook(
      () => usePreference('theme', 'system', { localStorageKey: 'hc_theme_preference' }),
      { wrapper: makeWrapper() },
    );

    act(() => { result.current[1]('dark'); });

    await waitFor(() => expect(setPrefsBlob).toHaveBeenCalled());
    expect(setPrefsBlob).toHaveBeenCalledWith(expect.objectContaining({ theme: 'dark' }));
  });
});

describe('functional updaters (web L-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves a functional updater against the latest value before any side effect', async () => {
    const setPrefsBlob = vi.fn().mockResolvedValue(undefined);
    useAuth.mockReturnValue({ user: { id: 42, role: 'member', email: 'u@example.com' } });
    useUserPreferences.mockReturnValue({ prefs: {}, setPrefsBlob });
    const storage = makeStorage({ hc_sidebar_collapsed: 'false' });
    vi.stubGlobal('localStorage', storage);

    const { result } = renderHook(
      () => usePreference('sidebarCollapsed', false, {
        localStorageKey: 'hc_sidebar_collapsed',
        serialize: String,
        deserialize: (v) => v === 'true',
      }),
      { wrapper: makeWrapper() },
    );

    expect(result.current[0]).toBe(false);

    act(() => { result.current[1]((c) => !c); });

    await waitFor(() => expect(setPrefsBlob).toHaveBeenCalled());
    // Pinned regression: must never write the function itself (the classic String(fn) bug).
    const writtenValue = storage.setItem.mock.calls.find(([k]) => k === 'hc_sidebar_collapsed')[1];
    expect(writtenValue).not.toMatch(/=>/);
    expect(writtenValue).toBe('true');
    expect(setPrefsBlob).toHaveBeenCalledWith({ sidebarCollapsed: true });
    expect(result.current[0]).toBe(true);
  });

  it('a plain (non-function) value still behaves exactly as before', async () => {
    const setPrefsBlob = vi.fn().mockResolvedValue(undefined);
    useAuth.mockReturnValue({ user: { id: 42, role: 'member', email: 'u@example.com' } });
    useUserPreferences.mockReturnValue({ prefs: {}, setPrefsBlob });
    const storage = makeStorage({ hc_sidebar_collapsed: 'false' });
    vi.stubGlobal('localStorage', storage);

    const { result } = renderHook(
      () => usePreference('sidebarCollapsed', false, {
        localStorageKey: 'hc_sidebar_collapsed',
        serialize: String,
        deserialize: (v) => v === 'true',
      }),
      { wrapper: makeWrapper() },
    );

    act(() => { result.current[1](true); });

    await waitFor(() => expect(setPrefsBlob).toHaveBeenCalledWith({ sidebarCollapsed: true }));
    expect(result.current[0]).toBe(true);
  });
});

describe('usePreference — malformed blob fallback (D-18)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to per-key default when server blob has a non-string value for a string key', async () => {
    useAuth.mockReturnValue({ user: { id: 42, role: 'member', email: 'u@example.com' } });
    // Blob has a malformed value (number instead of expected string).
    useUserPreferences.mockReturnValue({
      prefs: { theme: 12345 },
      setPrefsBlob: vi.fn(),
    });
    vi.stubGlobal('localStorage', makeStorage());

    const { result } = renderHook(
      () => usePreference('theme', 'system', { localStorageKey: 'hc_theme_preference' }),
      { wrapper: makeWrapper() },
    );
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Should fall back to defaultValue ('system') when stored value is malformed.
    expect(result.current[0]).toBe('system');
  });
});
