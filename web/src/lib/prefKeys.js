/**
 * prefKeys.js — single source of truth for D-12 keys, the hc_pref_ prefix, and the shared
 * logout purge (web L-2).
 *
 * This lives in lib/, not components/, deliberately: UserPreferencesProvider.jsx imports
 * useAuth.js, so useAuth.js importing UserPreferencesProvider.jsx back would be a cycle.
 * This module is the shared dependency both sides can import without one.
 */

// D-12 localStorage key inventory with codec types.
// 'json' keys: JSON.parse / JSON.stringify
// 'raw'  keys: bare string (theme/accent store raw strings, not JSON values)
// 'bool' keys: raw 'true'/'false' string in localStorage, stored in the blob as a real boolean
//   (WR-01 fix: sidebarCollapsed's consumer default is a boolean; seeding it as a raw string
//    made the D-18 type guard reject it, so it never synced cross-device).
export const D12_KEYS = [
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
  { lsKey: 'hc_palette',                    blobKey: 'palette',                 codec: 'raw'  },
  // Pre-v0.4 accent key: still seeded so an existing account's stored accent is
  // available for the one-time accent -> palette upgrade in usePalette.js.
  { lsKey: 'hc_accent',                     blobKey: 'accent',                  codec: 'raw'  },
  // Sidebar collapsed — localStorage holds 'true'/'false'; the blob holds a real boolean
  // so the consumer's boolean type guard accepts it (WR-01).
  { lsKey: 'hc_sidebar_collapsed',          blobKey: 'sidebarCollapsed',        codec: 'bool' },
];
// Note (IN-02): the legacy 'hc_ui_skin' key is intentionally NOT seeded into the blob.
// 'skin' was consolidated into 'accent'; usePalette.js reads hc_ui_skin from localStorage
// directly as a one-time palette fallback. A 'skin' blob key would be dead (no consumer).

// web L-2: prefix shared by every hc_pref_* localStorage key (toast prefs, grouping prefs,
// quiet-hours prefs). A prefix sweep (below) is the real guarantee that a future hc_pref_*
// key is purged on logout without needing a hand-maintained list update.
export const PREF_LS_PREFIX = 'hc_pref_';

// Belt-and-braces enumeration of hc_pref_* keys currently in use, for storage shims that
// cannot be enumerated (the prefix sweep in purgeUserPrefStorage is the real guarantee).
export const KNOWN_PREF_LS_KEYS = [
  'toastsEnabled',
  'liveEventToastsEnabled',
  'toastPosition',
  'toastDuration',
  'toastMaxVisible',
  'episodeWindowMinutes',
  'sceneWindowSeconds',
  'episodeMinEventCount',
  'quietHoursEnabled',
  'quietHoursStart',
  'quietHoursEnd',
  'quietHoursExcludedAccessories',
].map((k) => `${PREF_LS_PREFIX}${k}`);

/**
 * purgeUserPrefStorage — the SOLE logout purge (web L-2). Removes every D-12 key, every
 * known hc_pref_* key, every OTHER localStorage key starting with hc_pref_ (prefix sweep —
 * closes the gap a hand-maintained list always eventually has), the CSRF token, and the
 * HomeKit setup-code PIN vault. Each group is wrapped independently so one failure (private
 * mode, blocked storage) cannot abort the rest.
 */
export function purgeUserPrefStorage() {
  const ls = typeof localStorage !== 'undefined' ? localStorage : null;

  // (1) D-12 keys — dashboard/theme/accent/sidebar.
  if (ls) {
    for (const { lsKey } of D12_KEYS) {
      try { ls.removeItem(lsKey); } catch { /* private mode / blocked storage */ }
    }
  }

  // (2) Known hc_pref_* keys (toast + grouping + quiet-hours prefs).
  if (ls) {
    for (const key of KNOWN_PREF_LS_KEYS) {
      try { ls.removeItem(key); } catch { /* private mode / blocked storage */ }
    }
  }

  // (3) Prefix sweep — catches any hc_pref_* key not enumerated above (web L-2's real
  // guarantee). Snapshot the key list BEFORE removing: removing while iterating by index
  // shifts subsequent indices and skips entries.
  if (ls) {
    try {
      let allKeys;
      if (typeof ls.length === 'number' && typeof ls.key === 'function') {
        allKeys = [];
        for (let i = 0; i < ls.length; i += 1) {
          const k = ls.key(i);
          if (k != null) allKeys.push(k);
        }
      } else {
        allKeys = Object.keys(ls);
      }
      for (const key of allKeys) {
        if (key.startsWith(PREF_LS_PREFIX)) {
          try { ls.removeItem(key); } catch { /* private mode / blocked storage */ }
        }
      }
    } catch { /* storage enumeration unavailable */ }
  }

  // (4) CSRF token — must not be replayed after logout.
  try { sessionStorage.removeItem('csrfToken'); } catch { /* private mode */ }

  // (5) HomeKit PIN vault (useSetup.js) — an admin's setup codes must not survive logout
  // in a shared tab (web L-2 / T-dfe-05).
  try { sessionStorage.removeItem('hc_pins'); } catch { /* private mode */ }
}
