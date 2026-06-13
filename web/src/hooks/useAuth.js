import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchJson, API_BASE } from '../lib/api.js';

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading, isError } = useQuery({
    queryKey: ['auth', 'me'],
    // GET /api/auth/me responds { user: {...} }; unwrap so consumers get a flat
    // user object (user.role, user.email, user.id) — never user.user.role.
    queryFn: () => fetchJson(`${API_BASE}/auth/me`).then((data) => data?.user ?? null),
    staleTime: 60_000,
    retry: false,
  });

  const logoutMutation = useMutation({
    mutationFn: () => fetchJson(`${API_BASE}/auth/logout`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.clear();
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
