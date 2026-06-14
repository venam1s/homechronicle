/**
 * useUserPreferences.test.js — RED stubs for the server-blob hook.
 *
 * Wave-0: These tests are expected to FAIL until plan 24-03 implements
 * web/src/hooks/useUserPreferences.js. Do NOT weaken assertions to pass early.
 *
 * Contracts under test:
 * - queryKey is ['me','preferences'] (NOT ['auth','me'] — collision guard, D-09)
 * - queryFn unwraps d?.prefs ?? {} (self-contained, mirrors useAuth.js pattern)
 * - query disabled when user is null (PREF-05/D-15)
 * - PUT mutation sends { prefs: <blob> } and updates the cache
 * - debounce in setPrefs coalesces rapid writes into ONE fetchJson PUT (D-09)
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

import { fetchJson } from '../lib/api.js';
import { useAuth } from './useAuth.js';
import { useUserPreferences } from './useUserPreferences.js';
import { usePreference } from './usePreference.js';
import { UserPreferencesProvider } from '../components/UserPreferencesProvider.jsx';

// The query/debounce/seed logic lives in UserPreferencesProvider; useUserPreferences is a
// thin context consumer (CR-01 fix). The wrapper nests the provider so the consumer sees
// the real shared buffer.
function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  return { wrapper: function Wrapper({ children }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(UserPreferencesProvider, null, children),
    );
  }, queryClient };
}

describe('useUserPreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses query key [me, preferences] — distinct from [auth, me] (D-09 collision guard)', async () => {
    useAuth.mockReturnValue({ user: { id: 42, role: 'member', email: 'u@example.com' } });
    fetchJson.mockResolvedValue({ prefs: { theme: 'dark' } });

    const { wrapper, queryClient } = makeWrapper();
    const { result } = renderHook(() => useUserPreferences(), { wrapper });
    await waitFor(() => expect(result.current.prefs).toBeDefined());

    // Verify the hook fetches the correct endpoint (implies correct query key).
    expect(fetchJson).toHaveBeenCalledWith(
      expect.stringContaining('/me/preferences'),
    );
    // Assert via React Query cache: the correct key must hold the unwrapped blob.
    expect(queryClient.getQueryData(['me', 'preferences'])).toEqual({ theme: 'dark' });
  });

  it('queryFn unwraps d?.prefs ?? {} — does not return the raw envelope', async () => {
    useAuth.mockReturnValue({ user: { id: 42, role: 'member', email: 'u@example.com' } });
    fetchJson.mockResolvedValue({ prefs: { theme: 'dark', accent: 'ocean' } });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUserPreferences(), { wrapper });
    await waitFor(() => expect(result.current.prefs).toBeDefined());

    // Must be the unwrapped blob, not { prefs: { ... } }.
    expect(result.current.prefs).toEqual({ theme: 'dark', accent: 'ocean' });
    expect(result.current.prefs?.prefs).toBeUndefined();
  });

  it('returns empty object when blob is empty (D-04)', async () => {
    useAuth.mockReturnValue({ user: { id: 42, role: 'member', email: 'u@example.com' } });
    fetchJson.mockResolvedValue({ prefs: {} });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUserPreferences(), { wrapper });
    await waitFor(() => expect(result.current.prefs).toBeDefined());

    expect(result.current.prefs).toEqual({});
  });

  it('query is DISABLED and fetchJson not called when user is null (PREF-05/D-15)', async () => {
    useAuth.mockReturnValue({ user: null });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUserPreferences(), { wrapper });
    // Give the query a tick to settle.
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Must not have called the server — enabled: !!user?.id is false.
    expect(fetchJson).not.toHaveBeenCalled();
    // prefs should be undefined or {} (query never ran).
    expect(result.current.prefs == null || Object.keys(result.current.prefs ?? {}).length === 0).toBe(true);
  });

  it('PUT mutation sends { prefs: blob } to /me/preferences', async () => {
    useAuth.mockReturnValue({ user: { id: 42, role: 'member', email: 'u@example.com' } });
    fetchJson.mockResolvedValue({ prefs: {} });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUserPreferences(), { wrapper });
    await waitFor(() => expect(result.current.prefs).toBeDefined());

    const newBlob = { theme: 'light', accent: 'purple' };
    fetchJson.mockResolvedValue({ prefs: newBlob });
    await result.current.setPrefsBlob(newBlob);

    expect(fetchJson).toHaveBeenCalledWith(
      expect.stringContaining('/me/preferences'),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ prefs: newBlob }),
      }),
    );
  });

  it('PUT mutation updates the React Query cache on success', async () => {
    useAuth.mockReturnValue({ user: { id: 42, role: 'member', email: 'u@example.com' } });
    fetchJson.mockResolvedValue({ prefs: {} });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUserPreferences(), { wrapper });
    await waitFor(() => expect(result.current.prefs).toBeDefined());

    const newBlob = { theme: 'dark' };
    fetchJson.mockResolvedValue({ prefs: newBlob });
    await result.current.setPrefsBlob(newBlob);

    await waitFor(() => expect(result.current.prefs).toEqual(newBlob));
  });

  it('debounce coalesces rapid setPrefsBlob calls into ONE fetchJson PUT (D-09)', async () => {
    useAuth.mockReturnValue({ user: { id: 42, role: 'member', email: 'u@example.com' } });
    // Initial GET returns empty blob.
    fetchJson.mockResolvedValue({ prefs: {} });

    vi.useFakeTimers();
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUserPreferences(), { wrapper });

    // Let the initial GET settle.
    await act(async () => { vi.advanceTimersByTime(0); });
    fetchJson.mockClear();

    // Rapid successive setPrefsBlob calls with different keys.
    await act(async () => {
      result.current.setPrefsBlob({ theme: 'dark' });
      result.current.setPrefsBlob({ accent: 'purple' });
    });

    // Advance past the debounce window.
    await act(async () => { vi.advanceTimersByTime(1000); });

    vi.useRealTimers();

    // D-09: debounce must coalesce into ONE PUT.
    const putCalls = fetchJson.mock.calls.filter(
      ([, opts]) => opts?.method === 'PUT',
    );
    expect(putCalls).toHaveLength(1);
    // The single PUT must carry BOTH keys merged.
    const body = JSON.parse(putCalls[0][1].body);
    expect(body.prefs).toMatchObject({ theme: 'dark', accent: 'purple' });
  });
});

function makeStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: vi.fn((k) => (k in store ? store[k] : null)),
    setItem: vi.fn((k, v) => { store[k] = String(v); }),
    removeItem: vi.fn((k) => { delete store[k]; }),
    clear: vi.fn(() => { Object.keys(store).forEach((k) => delete store[k]); }),
  };
}

describe('cross-instance debounce (CR-01 regression)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', makeStorage());
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('coalesces setValue across TWO usePreference instances into ONE PUT carrying both keys', async () => {
    // The bug this guards: when each usePreference instance owned its own debounce buffer,
    // two near-simultaneous setValue calls fired TWO racing whole-blob PUTs and the
    // last-to-arrive (fewest keys) won server-side. With ONE shared provider buffer there is
    // exactly ONE PUT containing every key.
    useAuth.mockReturnValue({ user: { id: 42, role: 'member', email: 'u@example.com' } });
    fetchJson.mockResolvedValue({ prefs: {} });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => ({
      a: usePreference('theme', 'system', { localStorageKey: 'hc_theme_preference', serialize: (v) => v, deserialize: (v) => v }),
      b: usePreference('accent', 'ocean', { localStorageKey: 'hc_accent', serialize: (v) => v, deserialize: (v) => v }),
    }), { wrapper });

    await waitFor(() => expect(result.current.a[0]).toBeDefined());
    fetchJson.mockClear();
    fetchJson.mockResolvedValue({ prefs: { theme: 'dark', accent: 'purple' } });

    vi.useFakeTimers();
    act(() => {
      result.current.a[1]('dark');   // setValue on instance A
      result.current.b[1]('purple'); // setValue on instance B (near-simultaneous)
    });
    await act(async () => { vi.advanceTimersByTime(600); });
    vi.useRealTimers();

    const putCalls = fetchJson.mock.calls.filter(([, opts]) => opts?.method === 'PUT');
    expect(putCalls).toHaveLength(1);
    const body = JSON.parse(putCalls[0][1].body);
    expect(body.prefs).toMatchObject({ theme: 'dark', accent: 'purple' });
  });
});

describe('seedIfEmpty (PREF-11/D-14)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', makeStorage({ hc_theme_preference: 'dark' }));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('seeds exactly once when the blob is empty (snapshot + shared values), ignoring repeat calls', async () => {
    useAuth.mockReturnValue({ user: { id: 42, role: 'member', email: 'u@example.com' } });
    fetchJson.mockResolvedValue({ prefs: {} });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUserPreferences(), { wrapper });
    await waitFor(() => expect(result.current.prefs).toBeDefined());
    fetchJson.mockClear();
    fetchJson.mockResolvedValue({ prefs: { theme: 'dark', toastsEnabled: true } });

    vi.useFakeTimers();
    act(() => {
      result.current.seedIfEmpty({ toastsEnabled: true });
      result.current.seedIfEmpty({ toastsEnabled: true }); // second call must be a no-op (ref-guarded)
    });
    await act(async () => { vi.advanceTimersByTime(600); });
    vi.useRealTimers();

    const putCalls = fetchJson.mock.calls.filter(([, opts]) => opts?.method === 'PUT');
    expect(putCalls).toHaveLength(1);
    const body = JSON.parse(putCalls[0][1].body);
    expect(body.prefs).toMatchObject({ theme: 'dark', toastsEnabled: true });
  });

  it('does not seed when the blob is already non-empty', async () => {
    useAuth.mockReturnValue({ user: { id: 42, role: 'member', email: 'u@example.com' } });
    fetchJson.mockResolvedValue({ prefs: { theme: 'light' } });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUserPreferences(), { wrapper });
    await waitFor(() => expect(result.current.prefs).toEqual({ theme: 'light' }));
    fetchJson.mockClear();

    vi.useFakeTimers();
    act(() => { result.current.seedIfEmpty({ toastsEnabled: true }); });
    await act(async () => { vi.advanceTimersByTime(600); });
    vi.useRealTimers();

    const putCalls = fetchJson.mock.calls.filter(([, opts]) => opts?.method === 'PUT');
    expect(putCalls).toHaveLength(0);
  });
});
