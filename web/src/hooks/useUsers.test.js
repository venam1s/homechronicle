import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

vi.mock('../lib/api.js', () => ({
  API_BASE: 'http://localhost:3001/api',
  fetchJson: vi.fn(),
}));

import { fetchJson } from '../lib/api.js';
import {
  useUsers,
  useInvites,
  useInviteUser,
  useRevokeInvite,
  useResendInvite,
  useSetUserRole,
  useDisableUser,
  useEnableUser,
  useRemoveUser,
} from './useUsers.js';

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

describe('useUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls GET /users/ and returns data', async () => {
    const users = [{ id: 1, email: 'admin@example.com', role: 'admin', status: 'active' }];
    fetchJson.mockResolvedValueOnce(users);

    const { result } = renderHook(() => useUsers(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchJson).toHaveBeenCalledWith('http://localhost:3001/api/users/');
    expect(result.current.data).toEqual(users);
  });

  it('calls GET /users/invites and returns data', async () => {
    const invites = [{ id: 1, email: 'newuser@example.com', role: 'member', status: 'pending', expiresAt: '2026-06-14T00:00:00Z' }];
    fetchJson.mockResolvedValueOnce(invites);

    const { result } = renderHook(() => useInvites(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchJson).toHaveBeenCalledWith('http://localhost:3001/api/users/invites');
    expect(result.current.data).toEqual(invites);
  });
});

describe('useInviteUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls POST /users/invite with email and role', async () => {
    const inviteResult = { inviteUrl: 'http://example.com/accept-invite?token=abc', emailed: false, email: 'user@example.com' };
    fetchJson.mockResolvedValueOnce(inviteResult);

    const { result } = renderHook(() => useInviteUser(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ email: 'user@example.com', role: 'member' });
    });

    expect(fetchJson).toHaveBeenCalledWith(
      'http://localhost:3001/api/users/invite',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'user@example.com', role: 'member' }),
      }),
    );
  });

  it('invalidates ["users","invites"] on success', async () => {
    fetchJson.mockResolvedValueOnce({ inviteUrl: 'http://example.com/accept-invite?token=abc', emailed: false, email: 'user@example.com' });
    fetchJson.mockResolvedValueOnce([]); // invalidation re-fetch

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const wrapper = ({ children }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(() => useInviteUser(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ email: 'user@example.com', role: 'member' });
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['users', 'invites'] }),
    );
  });
});

describe('useRevokeInvite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls DELETE /users/invites/:id', async () => {
    fetchJson.mockResolvedValueOnce({});

    const { result } = renderHook(() => useRevokeInvite(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.mutateAsync(42);
    });

    expect(fetchJson).toHaveBeenCalledWith(
      'http://localhost:3001/api/users/invites/42',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});

describe('useResendInvite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls POST /users/invites/:id/resend', async () => {
    fetchJson.mockResolvedValueOnce({ inviteUrl: 'http://example.com/accept-invite?token=xyz' });

    const { result } = renderHook(() => useResendInvite(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.mutateAsync(7);
    });

    expect(fetchJson).toHaveBeenCalledWith(
      'http://localhost:3001/api/users/invites/7/resend',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('useSetUserRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls PATCH /users/:id with action=setRole', async () => {
    fetchJson.mockResolvedValueOnce({});

    const { result } = renderHook(() => useSetUserRole(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ id: 3, role: 'admin' });
    });

    expect(fetchJson).toHaveBeenCalledWith(
      'http://localhost:3001/api/users/3',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ action: 'setRole', role: 'admin' }),
      }),
    );
  });

  it('invalidates ["users","list"] on success', async () => {
    fetchJson.mockResolvedValueOnce({});
    fetchJson.mockResolvedValueOnce([]); // re-fetch

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const wrapper = ({ children }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(() => useSetUserRole(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: 3, role: 'admin' });
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['users', 'list'] }),
    );
  });
});

describe('useDisableUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls PATCH /users/:id with action=disable', async () => {
    fetchJson.mockResolvedValueOnce({});

    const { result } = renderHook(() => useDisableUser(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.mutateAsync(5);
    });

    expect(fetchJson).toHaveBeenCalledWith(
      'http://localhost:3001/api/users/5',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ action: 'disable' }),
      }),
    );
  });
});

describe('useEnableUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls PATCH /users/:id with action=enable', async () => {
    fetchJson.mockResolvedValueOnce({});

    const { result } = renderHook(() => useEnableUser(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.mutateAsync(5);
    });

    expect(fetchJson).toHaveBeenCalledWith(
      'http://localhost:3001/api/users/5',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ action: 'enable' }),
      }),
    );
  });
});

describe('useRemoveUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls DELETE /users/:id', async () => {
    fetchJson.mockResolvedValueOnce({});

    const { result } = renderHook(() => useRemoveUser(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.mutateAsync(9);
    });

    expect(fetchJson).toHaveBeenCalledWith(
      'http://localhost:3001/api/users/9',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('invalidates ["users","list"] on success', async () => {
    fetchJson.mockResolvedValueOnce({});
    fetchJson.mockResolvedValueOnce([]); // re-fetch

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const wrapper = ({ children }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(() => useRemoveUser(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(9);
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['users', 'list'] }),
    );
  });
});
