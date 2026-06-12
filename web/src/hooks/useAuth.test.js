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
});
