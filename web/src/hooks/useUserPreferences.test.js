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
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
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
  return function Wrapper({ children }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('useUserPreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses query key [me, preferences] — distinct from [auth, me] (D-09 collision guard)', async () => {
    useAuth.mockReturnValue({ user: { id: 42, role: 'member', email: 'u@example.com' } });
    fetchJson.mockResolvedValue({ prefs: { theme: 'dark' } });

    const { result } = renderHook(() => useUserPreferences(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.prefs).toBeDefined());

    // Verify the hook fetches the correct endpoint (implies correct query key).
    expect(fetchJson).toHaveBeenCalledWith(
      expect.stringContaining('/me/preferences'),
    );
    // Explicit query key assertion via the hook's internal structure.
    expect(result.current._queryKey).toEqual(['me', 'preferences']);
  });

  it('queryFn unwraps d?.prefs ?? {} — does not return the raw envelope', async () => {
    useAuth.mockReturnValue({ user: { id: 42, role: 'member', email: 'u@example.com' } });
    fetchJson.mockResolvedValue({ prefs: { theme: 'dark', accent: 'ocean' } });

    const { result } = renderHook(() => useUserPreferences(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.prefs).toBeDefined());

    // Must be the unwrapped blob, not { prefs: { ... } }.
    expect(result.current.prefs).toEqual({ theme: 'dark', accent: 'ocean' });
    expect(result.current.prefs?.prefs).toBeUndefined();
  });

  it('returns empty object when blob is empty (D-04)', async () => {
    useAuth.mockReturnValue({ user: { id: 42, role: 'member', email: 'u@example.com' } });
    fetchJson.mockResolvedValue({ prefs: {} });

    const { result } = renderHook(() => useUserPreferences(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.prefs).toBeDefined());

    expect(result.current.prefs).toEqual({});
  });

  it('query is DISABLED and fetchJson not called when user is null (PREF-05/D-15)', async () => {
    useAuth.mockReturnValue({ user: null });

    const { result } = renderHook(() => useUserPreferences(), { wrapper: makeWrapper() });
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

    const { result } = renderHook(() => useUserPreferences(), { wrapper: makeWrapper() });
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

    const { result } = renderHook(() => useUserPreferences(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.prefs).toBeDefined());

    const newBlob = { theme: 'dark' };
    fetchJson.mockResolvedValue({ prefs: newBlob });
    await result.current.setPrefsBlob(newBlob);

    await waitFor(() => expect(result.current.prefs).toEqual(newBlob));
  });
});
