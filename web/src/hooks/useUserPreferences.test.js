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
// Target module does not exist until 24-03 — import will fail, making these RED.
import { useUserPreferences } from './useUserPreferences.js';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  return { wrapper: function Wrapper({ children }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
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
