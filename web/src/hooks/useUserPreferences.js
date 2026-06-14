/**
 * useUserPreferences — server-blob query + debounced merging PUT + once-only seeding.
 *
 * Query key: ['me', 'preferences'] — distinct from ['auth', 'me'] (D-09 collision guard).
 * Enabled: !!user?.id — automatically disabled when logged out or AUTH_ENABLED=false.
 * Debounce interval: 500ms — multi-key writes within the window coalesce into ONE PUT.
 *
 * setPrefsBlob(partial): merges partial into the LATEST cached blob at flush time
 *   (reads getQueryData at debounce expiry, not at call time — prevents concurrent key drops).
 *   Returns a promise that resolves after the PUT completes.
 *
 * seedIfEmpty(sharedSeedValues): intended for 24-06 (SettingsTab). When the blob is empty,
 *   assembles the full D-12 localStorage snapshot via per-key codecs, merges sharedSeedValues,
 *   and PUTs exactly once (ref-guarded; never re-runs after the first call).
 */

import { useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchJson, API_BASE } from '../lib/api.js';
import { useAuth } from './useAuth.js';

// D-12 localStorage key inventory with codec types.
// 'json' keys: JSON.parse / JSON.stringify
// 'raw' keys: raw string read (no JSON parsing — these store bare strings, not JSON values)
const D12_KEYS = [
  { lsKey: 'hc_dashboard_layouts',         blobKey: 'dashboardLayouts',       codec: 'json' },
  { lsKey: 'hc_dashboard_hidden',          blobKey: 'dashboardHidden',        codec: 'json' },
  { lsKey: 'hc_dashboard_global_days',     blobKey: 'dashboardGlobalDays',    codec: 'json' },
  { lsKey: 'hc_dashboard_room_days',       blobKey: 'dashboardRoomDays',      codec: 'json' },
  { lsKey: 'hc_dashboard_trend_days',      blobKey: 'dashboardTrendDays',     codec: 'json' },
  { lsKey: 'hc_dashboard_weekday_days',    blobKey: 'dashboardWeekdayDays',   codec: 'json' },
  { lsKey: 'hc_dashboard_top_devices_days', blobKey: 'dashboardTopDevicesDays', codec: 'json' },
  { lsKey: 'hc_dashboard_sync_ranges',     blobKey: 'dashboardSyncRanges',    codec: 'json' },
  { lsKey: 'hc_muted',                     blobKey: 'mutedDevices',           codec: 'json' },
  { lsKey: 'hc_theme_preference',          blobKey: 'theme',                  codec: 'raw' },
  { lsKey: 'hc_accent',                    blobKey: 'accent',                 codec: 'raw' },
  // Legacy skin key — read as raw string fallback for accent when hc_accent is absent.
  // Stored as separate entry so seedIfEmpty can capture it; consumers use 'accent' blob key.
  { lsKey: 'hc_ui_skin',                   blobKey: 'skin',                   codec: 'raw' },
  // Sidebar collapsed — stored as raw boolean-string ('true'/'false')
  { lsKey: 'hc_sidebar_collapsed',         blobKey: 'sidebarCollapsed',       codec: 'raw' },
];

/** Read a value from localStorage using the correct codec. Returns undefined when absent. */
function readD12Key(lsKey, codec) {
  try {
    const raw = window.localStorage.getItem(lsKey);
    if (raw == null) return undefined;
    if (codec === 'raw') return raw;
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Build the full D-12 snapshot object from localStorage. */
function buildLocalSnapshot() {
  const snapshot = {};
  for (const { lsKey, blobKey, codec } of D12_KEYS) {
    const val = readD12Key(lsKey, codec);
    if (val !== undefined) {
      snapshot[blobKey] = val;
    }
  }
  return snapshot;
}

export function useUserPreferences() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Debounce state — pending partial accumulator + timer ref + promise resolvers.
  const pendingPartialRef = useRef({});
  const debounceTimerRef = useRef(null);
  const pendingResolversRef = useRef([]);

  // Once-only seeding guard — prevents re-seeding even after re-renders.
  const seedFiredRef = useRef(false);

  const { data: prefs, isLoading } = useQuery({
    queryKey: ['me', 'preferences'],
    // Self-contained queryFn — unwraps { prefs: {...} } envelope (D-09).
    // NEVER shares queryFn with ['auth','me'] (collision guard: different keys, different shapes).
    queryFn: () =>
      fetchJson(`${API_BASE}/me/preferences`).then((d) => d?.prefs ?? {}),
    enabled: !!user?.id,
    staleTime: 60_000,
    retry: false,
  });

  const putMutation = useMutation({
    mutationFn: (blob) =>
      fetchJson(`${API_BASE}/me/preferences`, {
        method: 'PUT',
        body: JSON.stringify({ prefs: blob }),
      }),
    onSuccess: (data) => {
      // data is the PUT response; update the cache with the unwrapped blob.
      queryClient.setQueryData(['me', 'preferences'], data?.prefs ?? {});
    },
  });

  /**
   * setPrefsBlob(partial) — debounced merging PUT.
   *
   * Accumulates partial into pendingPartialRef. On the debounce flush (500ms after the
   * last call), reads the LATEST cached blob via getQueryData, merges ALL pending partials
   * accumulated during the window, and fires ONE PUT. Concurrent key writes within the
   * debounce window are never dropped (merge-at-flush-time, not snapshot-at-call-time).
   *
   * Returns a promise that resolves after the debounced PUT completes.
   */
  function setPrefsBlob(partial) {
    // Accumulate partial into the pending buffer (merge-at-call-time for keys, flush-at-timeout).
    Object.assign(pendingPartialRef.current, partial);

    // Clear the existing timer (reset debounce window).
    if (debounceTimerRef.current != null) {
      clearTimeout(debounceTimerRef.current);
    }

    // Return a promise that resolves when the debounce flush fires the PUT.
    const promise = new Promise((resolve, reject) => {
      pendingResolversRef.current.push({ resolve, reject });
    });

    debounceTimerRef.current = setTimeout(async () => {
      debounceTimerRef.current = null;

      // Flush: read the LATEST cached blob at flush time (not at call time).
      const latestCache = queryClient.getQueryData(['me', 'preferences']) ?? {};
      const merged = { ...latestCache, ...pendingPartialRef.current };

      // Clear the pending buffer before firing.
      pendingPartialRef.current = {};
      const resolvers = pendingResolversRef.current.splice(0);

      // Optimistically update the cache before the PUT.
      queryClient.setQueryData(['me', 'preferences'], merged);

      try {
        await putMutation.mutateAsync(merged);
        resolvers.forEach(({ resolve }) => resolve());
      } catch (err) {
        resolvers.forEach(({ reject: rej }) => rej(err));
      }
    }, 500);

    return promise;
  }

  /**
   * seedIfEmpty(sharedSeedValues) — once-only full-snapshot seeding.
   *
   * Intended for 24-06 (SettingsTab). When the authenticated query has resolved to an
   * empty blob (Object.keys === 0), assembles the full D-12 localStorage snapshot using
   * per-key codecs (raw-string vs JSON) and merges sharedSeedValues (retention toast/grouping)
   * on top. PUTs exactly once; ref-guarded so it never re-runs.
   */
  function seedIfEmpty(sharedSeedValues = {}) {
    if (seedFiredRef.current) return;
    if (!prefs || typeof prefs !== 'object') return;
    if (Object.keys(prefs).length > 0) return;

    seedFiredRef.current = true;

    const snapshot = buildLocalSnapshot();
    const seedBlob = { ...snapshot, ...sharedSeedValues };

    setPrefsBlob(seedBlob);
  }

  return {
    prefs: prefs ?? (user?.id ? undefined : {}),
    isLoading,
    setPrefsBlob,
    seedIfEmpty,
  };
}
