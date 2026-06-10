import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchJson, API_BASE } from '../lib/api.js';

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading, isError } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => fetchJson(`${API_BASE}/auth/me`),
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
