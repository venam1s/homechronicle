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

  // Per-user localStorage preference keys (D12_KEYS + hc_pref_* toast keys).
  // Cleared on logout so the next user on a shared browser does not see a flash
  // of the previous user's theme, layout, or toast settings.
  const USER_PREF_LS_KEYS = [
    'hc_dashboard_layouts',
    'hc_dashboard_hidden',
    'hc_dashboard_global_days',
    'hc_dashboard_room_days',
    'hc_dashboard_trend_days',
    'hc_dashboard_weekday_days',
    'hc_dashboard_top_devices_days',
    'hc_dashboard_sync_ranges',
    'hc_muted',
    'hc_theme_preference',
    'hc_accent',
    'hc_sidebar_collapsed',
    // toast prefs (hc_pref_* prefix, App.jsx)
    'hc_pref_toastsEnabled',
    'hc_pref_liveEventToastsEnabled',
    'hc_pref_toastPosition',
    'hc_pref_toastDuration',
    'hc_pref_toastMaxVisible',
  ];

  const logoutMutation = useMutation({
    mutationFn: () => fetchJson(`${API_BASE}/auth/logout`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.clear();
      // Clear CSRF token so it is not replayed after logout.
      try { sessionStorage.removeItem('csrfToken'); } catch { /* private mode */ }
      // Clear per-user preference keys so the next user does not inherit them.
      try {
        for (const key of USER_PREF_LS_KEYS) {
          localStorage.removeItem(key);
        }
      } catch { /* private mode / blocked storage */ }
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
