import { useQuery } from '@tanstack/react-query';
import { API_BASE as BASE, fetchJson } from '../lib/api.js';
import { queryKeys } from '../lib/queryKeys.js';

function buildQueryString(params) {
  const qs = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null && val !== '') {
      qs.set(key, String(val));
    }
  }
  return qs.toString();
}

export function useEvents(filters = {}, page = 1, limit = 50) {
  const qs = buildQueryString({ ...filters, page, limit });
  return useQuery({
    queryKey: queryKeys.events(filters, page, limit),
    queryFn: () => fetchJson(`${BASE}/events?${qs}`),
    staleTime: 10_000,
    refetchInterval: page === 1 ? 10_000 : false,
    refetchIntervalInBackground: false,
  });
}

export function useAccessories() {
  return useQuery({
    queryKey: queryKeys.accessories(),
    queryFn: () => fetchJson(`${BASE}/accessories`),
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}

export function useAccessoryDetail(accessoryId, { days = 30, page = 1, limit = 100 } = {}) {
  return useQuery({
    queryKey: queryKeys.accessoryDetail(accessoryId, days, page, limit),
    queryFn: () => fetchJson(
      `${BASE}/accessories/${encodeURIComponent(accessoryId)}/detail?days=${days}&page=${page}&limit=${limit}`
    ),
    enabled: Boolean(accessoryId),
    refetchInterval: page === 1 ? 15_000 : false,
    refetchIntervalInBackground: false,
  });
}

export function useHourlyStats() {
  return useQuery({
    queryKey: queryKeys.stats.hourly(),
    queryFn: () => fetchJson(`${BASE}/stats/hourly`),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

export function useDailyStats(days = 30) {
  return useQuery({
    queryKey: queryKeys.stats.daily(days),
    queryFn: () => fetchJson(`${BASE}/stats/daily?days=${days}`),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

export function useTopDevices(days = 7) {
  return useQuery({
    queryKey: queryKeys.stats.topDevices(days),
    queryFn: () => fetchJson(`${BASE}/stats/top-devices?days=${days}`),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

export function useRoomStats(days = 7) {
  return useQuery({
    queryKey: queryKeys.stats.rooms(days),
    queryFn: () => fetchJson(`${BASE}/stats/rooms?days=${days}`),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

export function useWeekdayStats(days = 90) {
  return useQuery({
    queryKey: queryKeys.stats.weekday(days),
    queryFn: () => fetchJson(`${BASE}/stats/weekday?days=${days}`),
    staleTime: 300_000,
    refetchInterval: 300_000,
  });
}

export function useHeatmap() {
  return useQuery({
    queryKey: queryKeys.stats.heatmap(),
    queryFn: () => fetchJson(`${BASE}/stats/heatmap`),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

export function useDevicePatterns() {
  return useQuery({
    queryKey: queryKeys.stats.devicePatterns(),
    queryFn: () => fetchJson(`${BASE}/stats/device-patterns`),
    staleTime: 300_000,
    refetchInterval: 300_000,
  });
}

export function useAccessoryAnomalies(accessoryId) {
  return useQuery({
    queryKey: queryKeys.accessoryAnomalies(accessoryId),
    queryFn: () => fetchJson(
      `${BASE}/accessories/${encodeURIComponent(accessoryId)}/anomalies`
    ),
    enabled: Boolean(accessoryId),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

export function useCharacteristicTrend(accessoryId, characteristic, days = 30) {
  return useQuery({
    queryKey: queryKeys.characteristicTrend(accessoryId, characteristic, days),
    queryFn: () => fetchJson(
      `${BASE}/accessories/${encodeURIComponent(accessoryId)}/characteristics/${encodeURIComponent(characteristic)}/trend?days=${days}`
    ),
    enabled: Boolean(accessoryId) && Boolean(characteristic),
    staleTime: 60_000,
  });
}

export function useAccessoryHeatmap(accessoryId, days = 90) {
  return useQuery({
    queryKey: queryKeys.accessoryHeatmap(accessoryId, days),
    queryFn: () => fetchJson(
      `${BASE}/accessories/${encodeURIComponent(accessoryId)}/heatmap?days=${days}`
    ),
    enabled: Boolean(accessoryId),
    staleTime: 60_000,
  });
}

export function useAccessoryStateDuration(accessoryId, days = 30) {
  return useQuery({
    queryKey: queryKeys.accessoryStateDuration(accessoryId, days),
    queryFn: () => fetchJson(
      `${BASE}/accessories/${encodeURIComponent(accessoryId)}/state-duration?days=${days}`
    ),
    enabled: Boolean(accessoryId),
    staleTime: 60_000,
  });
}

export function useAccessoryCharSummary(accessoryId, days = 30) {
  return useQuery({
    queryKey: queryKeys.accessoryCharSummary(accessoryId, days),
    queryFn: () => fetchJson(
      `${BASE}/accessories/${encodeURIComponent(accessoryId)}/char-summary?days=${days}`
    ),
    enabled: Boolean(accessoryId),
    staleTime: 60_000,
  });
}

export function useAnomalies() {
  return useQuery({
    queryKey: queryKeys.stats.anomalies(),
    queryFn: () => fetchJson(`${BASE}/stats/anomalies`),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

export function useQuietHours() {
  return useQuery({
    queryKey: queryKeys.stats.quietHours(),
    queryFn: () => fetchJson(`${BASE}/stats/quiet-hours`),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

export function useSensorEnvironment() {
  return useQuery({
    queryKey: queryKeys.stats.sensorEnvironment(),
    queryFn: () => fetchJson(`${BASE}/stats/sensor-environment`),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

export function useBatteryLevels() {
  return useQuery({
    queryKey: queryKeys.stats.batteryLevels(),
    queryFn: () => fetchJson(`${BASE}/stats/battery-levels`),
    staleTime: 300_000,
    refetchInterval: 300_000,
  });
}

export function useRetentionHealth() {
  return useQuery({
    queryKey: queryKeys.stats.retentionHealth(),
    queryFn: () => fetchJson(`${BASE}/stats/retention-health`),
    staleTime: 300_000,
    refetchInterval: 300_000,
  });
}

export function useCharacteristicBreakdown(days = 7) {
  return useQuery({
    queryKey: queryKeys.stats.characteristicBreakdown(days),
    queryFn: () => fetchJson(`${BASE}/stats/characteristic-breakdown?days=${days}`),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}
