import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

vi.mock('../lib/api.js', () => ({
  API_BASE: 'http://localhost:3001/api',
  fetchJson: vi.fn(),
}));

import { fetchJson } from '../lib/api.js';
import { useAuth } from './useAuth.js';

function makeWrapper(queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: Infinity },
    mutations: { retry: false },
  },
})) {
  return function Wrapper({ children }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Regression: GET /api/auth/me responds { user: {...} }. The hook MUST unwrap it
  // so consumers read user.role directly. Before the fix, useAuth returned the raw
  // { user: {...} } payload, so user.role was undefined and the admin-only Settings
  // section never rendered. Unit suites that mocked useAuth never caught this.
  it('unwraps the { user } envelope so role/email/id are flat', async () => {
    fetchJson.mockResolvedValue({ user: { id: 'u1', role: 'admin', email: 'admin@example.com' } });

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.user).toBeTruthy());

    expect(result.current.user).toEqual({ id: 'u1', role: 'admin', email: 'admin@example.com' });
    expect(result.current.user.role).toBe('admin');
    // Must NOT be the nested envelope shape.
    expect(result.current.user.user).toBeUndefined();
  });

  it('calls GET /api/auth/me', async () => {
    fetchJson.mockResolvedValue({ user: { id: 'u1', role: 'member' } });

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.user).toBeTruthy());

    expect(fetchJson).toHaveBeenCalledWith('http://localhost:3001/api/auth/me');
  });

  // web L-4: /auth/me must not fire while AUTH_ENABLED=false on the server. Pre-seed the
  // ['auth','config'] cache (mirrors production, where AuthGate mounts above every useAuth
  // consumer and has already resolved this query) so the assertion is not a mount-order race
  // against useAuthConfig's fail-closed-until-resolved default.
  it('never calls /auth/me when the server reports authEnabled: false', async () => {
    fetchJson.mockImplementation((url) => (
      String(url).includes('/auth/me')
        ? Promise.resolve({ user: { id: 'u1' } })
        : Promise.reject(new Error(`unexpected call: ${url}`))
    ));

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
    });
    queryClient.setQueryData(['auth', 'config'], { authEnabled: false });

    renderHook(() => useAuth(), { wrapper: makeWrapper(queryClient) });

    // Give the (incorrect) /auth/me query a chance to fire before asserting it did not.
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(fetchJson.mock.calls.some(([u]) => String(u).includes('/auth/me'))).toBe(false);
  });

  // web L-4 fail-closed: a rejecting config query must not drop the login wall.
  it('still calls /auth/me when the auth config query rejects (fail-closed)', async () => {
    fetchJson.mockImplementation((url) => (
      String(url).includes('/auth/config')
        ? Promise.reject(new Error('network error'))
        : Promise.resolve({ user: { id: 'u1' } })
    ));

    renderHook(() => useAuth(), { wrapper: makeWrapper() });

    await waitFor(() => expect(
      fetchJson.mock.calls.some(([u]) => String(u).includes('/auth/me')),
    ).toBe(true));
  });

  // web L-2: prefix-based logout purge — proves the sweep is prefix-based, not list-based.
  it('purges every hc_pref_*/D-12/session key on logout, including an unlisted key', async () => {
    fetchJson.mockResolvedValue({ user: { id: 'u1', role: 'admin' } });

    localStorage.setItem('hc_dashboard_layouts', '{}');
    localStorage.setItem('hc_pref_toastsEnabled', 'true');
    localStorage.setItem('hc_pref_quietHoursExcludedAccessories', '[]');
    // Proves prefix sweep, not list-based: this key is not in KNOWN_PREF_LS_KEYS.
    localStorage.setItem('hc_pref_someFutureKey', 'x');
    sessionStorage.setItem('csrfToken', 'abc');
    sessionStorage.setItem('hc_pins', '{"AA:BB":"111-11-111"}');

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.user).toBeTruthy());

    await result.current.logoutMutation.mutateAsync();

    expect(localStorage.getItem('hc_dashboard_layouts')).toBeNull();
    expect(localStorage.getItem('hc_pref_toastsEnabled')).toBeNull();
    expect(localStorage.getItem('hc_pref_quietHoursExcludedAccessories')).toBeNull();
    expect(localStorage.getItem('hc_pref_someFutureKey')).toBeNull();
    expect(sessionStorage.getItem('csrfToken')).toBeNull();
    expect(sessionStorage.getItem('hc_pins')).toBeNull();
  });
});
