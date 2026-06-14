/**
 * UserPreferencesProvider — the SINGLE shared owner of the per-user preference blob.
 *
 * Why a provider (CR-01 fix): the debounce buffer, the timer, the pending-PUT resolvers,
 * and the once-only seed guard MUST be shared across every preference key. When each
 * usePreference() instance owned its own debounce refs, a synced change cascading across
 * N consumers fired N independent whole-blob last-writer-wins PUTs racing on unordered
 * connections — the PUT that arrived last (carrying the fewest keys) won, silently dropping
 * the others' values cross-device. With one provider there is ONE buffer → ONE coalesced
 * PUT containing every key set during the window → no racing PUTs, no dropped keys.
 *
 * Exposes via context: { prefs, isLoading, setPrefsBlob, seedIfEmpty }.
 *
 * Query key: ['me', 'preferences'] — distinct from ['auth', 'me'] (D-09 collision guard).
 * Enabled: !!user?.id — automatically disabled when logged out or AUTH_ENABLED=false.
 * Debounce interval: 500ms — multi-key writes within the window coalesce into ONE PUT.
 *
 * The context default (used when no provider is mounted — e.g. anon shells, unit tests that
 * render a consumer without the provider) is a safe no-op: an empty blob and no-op writers,
 * so consumers degrade to their pure-localStorage anon path (PREF-05/D-15) with zero server calls.
 */

import { createContext, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchJson, API_BASE } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';

// D-12 localStorage key inventory with codec types.
// 'json' keys: JSON.parse / JSON.stringify
// 'raw'  keys: bare string (theme/accent store raw strings, not JSON values)
// 'bool' keys: raw 'true'/'false' string in localStorage, stored in the blob as a real boolean
//   (WR-01 fix: sidebarCollapsed's consumer default is a boolean; seeding it as a raw string
//    made the D-18 type guard reject it, so it never synced cross-device).
const D12_KEYS = [
  { lsKey: 'hc_dashboard_layouts',          blobKey: 'dashboardLayouts',        codec: 'json' },
  { lsKey: 'hc_dashboard_hidden',           blobKey: 'dashboardHidden',         codec: 'json' },
  { lsKey: 'hc_dashboard_global_days',      blobKey: 'dashboardGlobalDays',     codec: 'json' },
  { lsKey: 'hc_dashboard_room_days',        blobKey: 'dashboardRoomDays',       codec: 'json' },
  { lsKey: 'hc_dashboard_trend_days',       blobKey: 'dashboardTrendDays',      codec: 'json' },
  { lsKey: 'hc_dashboard_weekday_days',     blobKey: 'dashboardWeekdayDays',    codec: 'json' },
  { lsKey: 'hc_dashboard_top_devices_days', blobKey: 'dashboardTopDevicesDays', codec: 'json' },
  { lsKey: 'hc_dashboard_sync_ranges',      blobKey: 'dashboardSyncRanges',     codec: 'json' },
  { lsKey: 'hc_muted',                      blobKey: 'mutedDevices',            codec: 'json' },
  { lsKey: 'hc_theme_preference',           blobKey: 'theme',                   codec: 'raw'  },
  { lsKey: 'hc_accent',                     blobKey: 'accent',                  codec: 'raw'  },
  // Sidebar collapsed — localStorage holds 'true'/'false'; the blob holds a real boolean
  // so the consumer's boolean type guard accepts it (WR-01).
  { lsKey: 'hc_sidebar_collapsed',          blobKey: 'sidebarCollapsed',        codec: 'bool' },
];
// Note (IN-02): the legacy 'hc_ui_skin' key is intentionally NOT seeded into the blob.
// 'skin' was consolidated into 'accent'; useAccent.js reads hc_ui_skin from localStorage
// directly as a one-time accent fallback. A 'skin' blob key would be dead (no consumer).

/** Read a value from localStorage using the correct codec. Returns undefined when absent. */
function readD12Key(lsKey, codec) {
  try {
    const raw = window.localStorage.getItem(lsKey);
    if (raw == null) return undefined;
    if (codec === 'raw') return raw;
    if (codec === 'bool') return raw === 'true';
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

// Safe no-op context value — used when no provider is mounted (anon shells / unit tests).
const NO_PROVIDER_DEFAULT = {
  prefs: {},
  isLoading: false,
  setPrefsBlob: () => Promise.resolve(),
  seedIfEmpty: () => {},
};

export const UserPreferencesContext = createContext(NO_PROVIDER_DEFAULT);

export function UserPreferencesProvider({ children }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // SHARED debounce state — one buffer, one timer, one resolver list for ALL keys (CR-01).
  const pendingPartialRef = useRef({});
  const debounceTimerRef = useRef(null);
  const pendingResolversRef = useRef([]);

  // SHARED once-only seeding guard — survives re-renders; one seed per app session.
  const seedFiredRef = useRef(false);

  const { data: prefs, isLoading } = useQuery({
    queryKey: ['me', 'preferences'],
    // Self-contained queryFn — unwraps { prefs: {...} } envelope (D-09).
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
      queryClient.setQueryData(['me', 'preferences'], data?.prefs ?? {});
    },
  });

  /**
   * setPrefsBlob(partial) — debounced merging PUT against the SHARED buffer.
   *
   * Accumulates partial into the single shared buffer. On flush (500ms after the last call
   * across ALL keys), reads the latest cached blob via getQueryData, merges every pending
   * partial, and fires ONE PUT. Because the buffer is shared, concurrent writes from
   * different preference keys/instances are merged — never raced into separate PUTs (CR-01).
   *
   * Returns a promise that resolves after the debounced PUT completes.
   */
  function setPrefsBlob(partial) {
    Object.assign(pendingPartialRef.current, partial);

    if (debounceTimerRef.current != null) {
      clearTimeout(debounceTimerRef.current);
    }

    const promise = new Promise((resolve, reject) => {
      pendingResolversRef.current.push({ resolve, reject });
    });

    debounceTimerRef.current = setTimeout(async () => {
      debounceTimerRef.current = null;

      const latestCache = queryClient.getQueryData(['me', 'preferences']) ?? {};
      const merged = { ...latestCache, ...pendingPartialRef.current };

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
   * seedIfEmpty(sharedSeedValues) — the SOLE once-only seeding path (PREF-11/D-14).
   *
   * When the authenticated query has resolved to an empty blob, assembles the full D-12
   * localStorage snapshot (per-key codecs) merged with sharedSeedValues (retention
   * toast/grouping) and PUTs exactly once. Ref-guarded; never re-runs. With a single
   * shared seedFiredRef there is no seeding race (CR-01 second harm) — the per-key seeding
   * effect that previously lived in usePreference has been removed.
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

  const value = {
    prefs: prefs ?? (user?.id ? undefined : {}),
    isLoading,
    setPrefsBlob,
    seedIfEmpty,
  };

  return (
    <UserPreferencesContext.Provider value={value}>
      {children}
    </UserPreferencesContext.Provider>
  );
}
