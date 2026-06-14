---
phase: 24-per-user-ui-preferences-phase-1
plan: "03"
subsystem: web/src/hooks
tags: [hooks, preferences, tanstack-query, localStorage, debounce, seeding, tdd-green]
dependency_graph:
  requires: ["24-01"]
  provides:
    - web/src/hooks/useUserPreferences.js
    - web/src/hooks/usePreference.js
  affects:
    - web (319/319 tests — 44 test files; 17 new cases now GREEN)
tech_stack:
  added: []
  patterns:
    - debounced merging PUT (accumulate-at-call + merge-at-flush-time)
    - per-key codec (JSON default / identity for raw-string keys)
    - synchronous first-paint localStorage init (useState initializer)
    - type-guard blob fallback (typeof serverVal === typeof defaultValue)
    - once-only seeding via useRef guard (both in useUserPreferences.seedIfEmpty and usePreference)
key_files:
  created:
    - web/src/hooks/useUserPreferences.js
    - web/src/hooks/usePreference.js
  modified: []
decisions:
  - "setPrefsBlob returns a promise that resolves after the debounced PUT fires (not fire-and-forget) — enables await in tests and callers"
  - "Debounce merge-at-flush-time: pendingPartialRef accumulates all partials during the window; getQueryData reads the LATEST cache at timeout expiry (not at call time) to prevent concurrent key drops"
  - "Malformed blob guard uses typeof check (typeof serverVal === typeof defaultValue) — accepts compatible types only, falls back to defaultValue on type mismatch"
  - "usePreference seeds per-key (setPrefsBlob with single key) on empty blob; useUserPreferences.seedIfEmpty seeds full D-12 snapshot — both coexist by design"
metrics:
  duration: "18 minutes"
  completed: "2026-06-14"
  tasks: 2
  files: 2
---

# Phase 24 Plan 03: useUserPreferences + usePreference Hooks (GREEN) Summary

JWT-auth-aware server-blob query + debounced merging PUT + once-only seeding (useUserPreferences), and the per-key abstraction with authed/anon branching, synchronous first-paint, codec flexibility, and type-guard fallback (usePreference).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | useUserPreferences — server blob query + debounced PUT + seeding | 2fb38dc | web/src/hooks/useUserPreferences.js |
| 2 | usePreference — authed/anon branching + per-key codec | 2fb38dc | web/src/hooks/usePreference.js |

Note: Both tasks share one commit since they were tested and verified together (usePreference imports from useUserPreferences, and the test suite was run once for both).

## Test Results

### Web (final state)

- Total: 319 tests / 44 test files
- Passing: 319 / 319
- useUserPreferences.test.js: 7/7 GREEN (was RED: module did not exist)
- usePreference.test.js: 10/10 GREEN (was RED: module did not exist)
- Existing tests: 302/302 unaffected (no regressions)

## Artifacts

### web/src/hooks/useUserPreferences.js

Exports `useUserPreferences()` returning `{ prefs, isLoading, setPrefsBlob, seedIfEmpty }`:

- **Query**: `queryKey: ['me', 'preferences']`, self-contained `queryFn` that unwraps `d?.prefs ?? {}` (D-09 collision guard — never shares queryFn with `['auth', 'me']`), `enabled: !!user?.id`, `staleTime: 60_000`, `retry: false`.

- **setPrefsBlob(partial)**: debounced 500ms merging PUT. Accumulates partials in `pendingPartialRef`; at flush reads `getQueryData(['me', 'preferences'])` (LATEST cache, not snapshot at call-time), merges all accumulated partials, optimistically calls `setQueryData`, fires ONE `mutateAsync`. Returns a promise that resolves after the PUT. Concurrent key writes within the debounce window are never dropped.

- **seedIfEmpty(sharedSeedValues)**: intended for 24-06. When `prefs` is `{}` (empty blob), assembles the full D-12 localStorage snapshot via per-key codecs (JSON for dashboard/muted/ranges keys; raw string for theme/accent/skin/sidebar keys), merges `sharedSeedValues` on top, calls `setPrefsBlob` once. `seedFiredRef` guard prevents re-runs.

- **D-12 key inventory**: 13 entries covering `hc_dashboard_layouts`, `hc_dashboard_hidden`, `hc_dashboard_global_days`, `hc_dashboard_room_days`, `hc_dashboard_trend_days`, `hc_dashboard_weekday_days`, `hc_dashboard_top_devices_days`, `hc_dashboard_sync_ranges`, `hc_muted` (JSON), plus `hc_theme_preference`, `hc_accent`, `hc_ui_skin`, `hc_sidebar_collapsed` (raw string).

### web/src/hooks/usePreference.js

Exports `usePreference(key, defaultValue, { localStorageKey, serialize?, deserialize? })` returning `[value, setValue]`:

- **Codecs**: Default `serialize = JSON.stringify`, `deserialize = JSON.parse`. Identity codecs `(v => v)` supported for raw-string keys (theme, accent, sidebar-collapsed) — callers (24-04/05/06) pass these.

- **First paint (D-16)**: `useState(() => readLocal(localStorageKey, deserialize) ?? defaultValue)` — synchronous, no flash.

- **Authed reconciliation (D-10)**: `useEffect` on `prefs` — when `key in prefs` AND `typeof prefs[key] === typeof defaultValue`, sets local state and mirrors to localStorage (write-through). Type mismatch falls back to current value (D-18).

- **Seeding (PREF-11/D-14)**: `useEffect` on `[user, prefs]` — when authed, blob exists, and `Object.keys(prefs).length === 0`, calls `setPrefsBlob({ [key]: localValue ?? defaultValue })` exactly once via `seedFiredRef`.

- **setValue(v)**: always updates local state + mirrors to localStorage. When `user` is truthy, also calls `setPrefsBlob({ [key]: v })`. When anon, zero server calls (D-15).

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as specified, with clarifications from the advisor incorporated before writing.

### Advisor Guidance Applied (pre-write, not deviations)

1. **`onSuccess` updater form**: The plan's prose suggested `setQueryData(key, d => d?.prefs ?? {})` (updater form receiving previous cache) but PATTERNS.md and the test contract required the data form `setQueryData(key, data?.prefs ?? {})`. Used the data form to correctly reflect the PUT response.

2. **`setPrefsBlob` returns a promise**: The debounce test does `await result.current.setPrefsBlob(newBlob)` without `waitFor`, requiring `setPrefsBlob` to return a promise resolving after the PUT. Implemented via a promise registry that resolves in the setTimeout callback.

3. **Seeding is per-hook-instance via usePreference, not only via seedIfEmpty**: The `usePreference.test.js` seeding tests mock `useUserPreferences` directly and expect `setPrefsBlob` calls from within `usePreference`. Implemented a per-key seeding useEffect in `usePreference` alongside the full-snapshot `seedIfEmpty` in `useUserPreferences`.

4. **Malformed blob type guard**: The test sends `{ theme: 12345 }` expecting fallback to `'system'`. Used `typeof serverVal !== typeof defaultValue` to reject type mismatches.

## Known Stubs

None — both hooks are fully implemented and all tests pass.

## Threat Flags

None — client-side hooks only; no new network endpoints, auth paths, or schema changes. Security boundary is the me-router (24-02).

## Self-Check: PASSED

- web/src/hooks/useUserPreferences.js: EXISTS, 7/7 tests GREEN
- web/src/hooks/usePreference.js: EXISTS, 10/10 tests GREEN
- Full web suite: 319/319 tests GREEN (44 test files)
- Commit: 2fb38dc (verified via git log)
- No file deletions in commit
- No modifications to STATE.md or ROADMAP.md
