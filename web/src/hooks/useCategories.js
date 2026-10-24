import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_BASE as BASE, fetchJson } from '../lib/api.js';
import { queryKeys } from '../lib/queryKeys.js';

/** Category definitions and the per-device overrides. */
export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories(),
    queryFn: () => fetchJson(`${BASE}/setup/categories`),
    staleTime: 60_000,
  });
}

/** Events and devices per category for the last `days`, with the previous period. */
export function useCategoryStats(days = 7) {
  return useQuery({
    queryKey: queryKeys.stats.categories(days),
    queryFn: () => fetchJson(`${BASE}/stats/categories?days=${days}`),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

/** Set a device's category; an empty category goes back to automatic. */
export function useSetCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accessoryId, category }) =>
      fetchJson(`${BASE}/setup/category`, {
        method: 'PATCH',
        body: JSON.stringify({ accessoryId, category }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories() });
      queryClient.invalidateQueries({ queryKey: ['stats', 'categories'] });
      queryClient.invalidateQueries({ queryKey: ['accessory-detail'] });
    },
  });
}
