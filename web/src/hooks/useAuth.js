import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchJson, API_BASE } from '../lib/api.js';
import { useAuthConfig } from './useAuthConfig.js';
import { purgeUserPrefStorage } from '../lib/prefKeys.js';

export function useAuth() {
  const queryClient = useQueryClient();
  // web L-4: ['auth','config'] has staleTime: Infinity, so this adds at most one extra
  // request per session — not one per render/component.
  const { authEnabled } = useAuthConfig();

  const { data: user, isLoading, isError } = useQuery({
    queryKey: ['auth', 'me'],
    // GET /api/auth/me responds { user: {...} }; unwrap so consumers get a flat
    // user object (user.role, user.email, user.id) — never user.user.role.
    queryFn: () => fetchJson(`${API_BASE}/auth/me`).then((data) => data?.user ?? null),
    staleTime: 60_000,
    retry: false,
    // web L-4: same predicate AuthGate.jsx:21 uses. Without this, TanStack runs
    // ['auth','me'] whenever ANY observer is enabled, so an auth-off deployment emits a
    // steady stream of 401s even though AuthGate's own query is correctly gated.
    // useAuthConfig is fail-closed (anything but an explicit authEnabled:false -> true), so
    // a loading or failing config query never drops the login wall.
    enabled: authEnabled === true,
  });

  const logoutMutation = useMutation({
    mutationFn: () => fetchJson(`${API_BASE}/auth/logout`, { method: 'DELETE' }),
    onSuccess: () => {
      // Clear the query cache FIRST so no observer refetches against half-purged storage.
      queryClient.clear();
      // web L-2: purge every hc_pref_* key by PREFIX (not a hand-maintained list), every
      // D-12 key, the CSRF token, and the HomeKit PIN vault (see prefKeys.js for the
      // reasoning behind the import-cycle-avoiding module split).
      purgeUserPrefStorage();
    },
  });

  return { user, isLoading, isError, logoutMutation };
}

export function useUserCount() {
  return useQuery({
    queryKey: ['auth', 'user-count'],
    queryFn: () => fetchJson(`${API_BASE}/auth/user-count`),
    retry: false,
  });
}

// SEC-05: the caller's own active sessions (Active Sessions panel).
// GET /api/auth/sessions responds { sessions: [...] }.
export function useSessions() {
  return useQuery({
    queryKey: ['auth', 'sessions'],
    queryFn: () => fetchJson(`${API_BASE}/auth/sessions`),
  });
}

// SEC-05: revoke one of the caller's own sessions. fetchJson auto-attaches the
// CSRF token to DELETE (api.js) and the server enforces ownership in SQL.
export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) =>
      fetchJson(`${API_BASE}/auth/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] });
    },
  });
}
