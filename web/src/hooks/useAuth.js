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
