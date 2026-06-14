import { useQuery } from '@tanstack/react-query';
import { fetchJson, API_BASE } from '../lib/api.js';

/**
 * Fetches /api/auth/config to determine whether AUTH_ENABLED is true on the server.
 *
 * Fail-closed: authEnabled defaults to true whenever the response has not
 * explicitly returned false (loading, error, or undefined all resolve to true).
 * This ensures a network blip never silently drops the login wall.
 *
 * Query key ['auth','config'] is separate from ['auth','me'] — we must NOT
 * re-use that key to avoid the shared-cache shape collision (prior bug).
 */
export function useAuthConfig() {
  const { data, isLoading } = useQuery({
    queryKey: ['auth', 'config'],
    queryFn: () => fetchJson(`${API_BASE}/auth/config`),
    staleTime: Infinity,
    retry: false,
  });

  // Fail-closed: only set false when the response explicitly says false.
  const authEnabled = data?.authEnabled === false ? false : true;

  return { authEnabled, isLoading };
}
