---
phase: 24-per-user-ui-preferences-phase-1
plan: "06"
subsystem: web-frontend
tags: [user-preferences, blob-storage, appearance, toast, grouping, usePreference]
dependency_graph:
  requires: [24-03]
  provides: [appearance-prefs-blob-routing, toast-prefs-blob-routing, seed-invocation]
  affects:
    - web/src/hooks/useTheme.js
    - web/src/hooks/useAccent.js
    - web/src/App.jsx
    - web/src/components/setup/SettingsTab.jsx
tech_stack:
  added: []
  patterns:
    - usePreference identity codec (raw-string localStorage for theme/accent/sidebar-collapsed)
    - usePreference JSON codec with unique hc_pref_* localStorage keys (toast/grouping)
    - effective-value derivation (user ? blobValue : retentionConfigValue)
    - seedIfEmpty invoked from App.jsx after both user + retentionConfig + prefs resolve
key_files:
  created:
    - web/src/components/setup/SettingsTab.blob.test.jsx
  modified:
    - web/src/hooks/useTheme.js
    - web/src/hooks/useAccent.js
    - web/src/App.jsx
    - web/src/components/setup/SettingsTab.jsx
decisions:
  - "Identity codec (serialize: v => v, deserialize: v => v) required for theme/accent/sidebar-collapsed to avoid JSON-corrupting raw-string localStorage values"
  - "Unique hc_pref_* localStorage keys assigned to toast/grouping usePreference calls to prevent cross-contamination when multiple instances share key 'undefined'"
  - "prefs added to seedIfEmpty effect deps so seed fires after prefs resolves (retentionConfig resolves first, prefs second — without prefs in deps, seeding was silently dropped)"
  - "getStoredAccent() passed as defaultValue to usePreference to preserve legacy hc_ui_skin fallback migration path"
metrics:
  duration_minutes: 17
  completed_date: "2026-06-14"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 5
---

# Phase 24 Plan 06: Appearance + Toast Preference Routing Summary

**One-liner:** Route theme/accent/sidebar-collapsed through usePreference identity codecs and toast/grouping through blob-when-authed usePreference, with PREF-11 seedIfEmpty wired from App.jsx using prefs-resolved timing guard.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Route appearance prefs through usePreference (identity codecs) | e8f51e1 | useTheme.js, useAccent.js, App.jsx |
| 2 | Route toast+grouping through usePreference blob + tests | af2cf47 | App.jsx, SettingsTab.jsx, SettingsTab.blob.test.jsx |

## What Was Built

**Task 1 — Appearance prefs via identity codec:**
- `useTheme.js`: replaced `useState(getStoredPreference)` + raw localStorage write `useEffect` with `usePreference('theme', getStoredPreference(), { localStorageKey: STORAGE_KEY, serialize: v => v, deserialize: v => v })`. The identity codec preserves the raw-string format that existing tests expect.
- `useAccent.js`: same pattern with `usePreference('accent', getStoredAccent(), { localStorageKey: NEW_KEY, serialize: v => v, deserialize: v => v })`. `getStoredAccent()` as defaultValue captures the `hc_ui_skin` legacy fallback for migrating existing users.
- `App.jsx` sidebar: replaced `useState + setItem useEffect` with `usePreference('sidebarCollapsed', false, { localStorageKey: SIDEBAR_KEY, serialize: String, deserialize: v => v === 'true' })` — boolean-string codec matching original semantics.

**Task 2 — Toast/grouping blob routing + PREF-11 seed:**
- `App.jsx`: 5 `usePreference` calls for toast fields with unique `hc_pref_*` localStorage keys; `prefs` extracted from `useUserPreferences` and added to `seedIfEmpty` effect deps (timing fix); `effectiveXxx` derivations select blob when authed, retentionConfig when anon; `useLiveEventToasts` and `configureToasts` updated to use effective values.
- `SettingsTab.jsx`: 8 `usePreference` calls for toast + grouping fields with unique `hc_pref_*` localStorage keys; onChange handlers branch on `user` — authed calls blob setter, anon calls `autoSave -> saveRetentionMutation`; `handleSaveSettings` sends grouping to blob setters when authed, full mutation when anon.
- `SettingsTab.blob.test.jsx`: 6 tests covering authed path (toast toggle -> blob setter called, not mutation), anon path (toggle -> mutation called), and seedIfEmpty PUT body asserting theme + dashboardLayouts + toast values.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed PREF-11 timing: prefs must be in seedIfEmpty effect deps**
- **Found during:** Task 2 implementation review (advisor)
- **Issue:** The seed effect guarded on `if (!user || !retentionConfig) return` but omitted `prefs`. Since `retentionConfig` resolves before `prefs` (no enabled-gate vs `enabled: !!user?.id`), the effect fired while `prefs === undefined`, called `seedIfEmpty` which bailed internally (no data), and never retried — because neither `user` nor `retentionConfig` changed when `prefs` finally resolved.
- **Fix:** Added `prefs` to seed effect deps and added `if (!user || !retentionConfig || prefs === undefined) return` guard. `seedIfEmpty` ref-guard still prevents double-firing.
- **Files modified:** `web/src/App.jsx`
- **Commit:** af2cf47

**2. [Rule 2 - Missing Critical] Added unique hc_pref_* localStorage keys to prevent cross-contamination**
- **Found during:** Task 2 implementation review (advisor)
- **Issue:** All 13 toast/grouping `usePreference` calls across App.jsx and SettingsTab.jsx passed `{}` as options, leaving `localStorageKey: undefined`. The `readLocal(undefined, ...)` / `writeLocal(undefined, ...)` calls coerced to key `'undefined'` — all 13 instances reading/writing the same localStorage slot, cross-contaminating types.
- **Fix:** Added unique `hc_pref_*` localStorage keys to each of the 8 calls in SettingsTab.jsx and 5 calls in App.jsx.
- **Files modified:** `web/src/App.jsx`, `web/src/components/setup/SettingsTab.jsx`
- **Commit:** af2cf47

## Test Results

- Full web suite: **325/325 tests passing** (319 original + 6 new blob-routing tests)
- All existing SettingsTab tests (13/13) remain green on the anon path

## Known Stubs

None — all preference fields wire to live data sources (blob or retentionConfig) on both authed and anon paths.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced. This plan is pure frontend preference routing.

## Self-Check: PASSED

- FOUND: web/src/hooks/useTheme.js
- FOUND: web/src/hooks/useAccent.js
- FOUND: web/src/App.jsx
- FOUND: web/src/components/setup/SettingsTab.jsx
- FOUND: web/src/components/setup/SettingsTab.blob.test.jsx
- FOUND: .planning/phases/24-per-user-ui-preferences-phase-1/24-06-SUMMARY.md
- FOUND commit: e8f51e1 (Task 1)
- FOUND commit: af2cf47 (Task 2)
