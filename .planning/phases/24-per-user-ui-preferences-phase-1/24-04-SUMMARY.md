---
phase: 24-per-user-ui-preferences-phase-1
plan: "04"
subsystem: web-hooks
tags: [preferences, dashboard, localStorage, usePreference, refactor]
dependency_graph:
  requires: [24-03]
  provides: [dashboard-layout-per-user, dashboard-range-per-user]
  affects: [web/src/hooks/useDashboardLayout.js, web/src/pages/DashboardPage.jsx]
tech_stack:
  added: []
  patterns: [usePreference, useMemo-for-referential-stability, mutable-refs-for-latest-value]
key_files:
  modified:
    - web/src/hooks/useDashboardLayout.js
    - web/src/hooks/useDashboardLayout.test.js
    - web/src/pages/DashboardPage.jsx
decisions:
  - "Use null default for dashboardLayouts so sanitizeLayouts can distinguish fresh-install from stored data"
  - "Run optional-panel seeding as one-time useEffect (not useState initializer) to separate read transport from seeding logic"
  - "Use mutable refs in callbacks since usePreference.setValue does not support functional updaters"
  - "Skip setStoredLayouts entirely (not return prev) when applyLayoutChange detects no changes — preserves layouts memo ref for RGL no-op guard"
  - "Defaults 30 and true for dashboardGlobalDays and dashboardSyncRanges to match current behavior (D-15 — plan said 7/false which was wrong)"
metrics:
  duration_minutes: 6
  completed_date: "2026-06-13"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 3
---

# Phase 24 Plan 04: Dashboard Consumer Refactor Summary

**One-liner:** Route useDashboardLayout (layout+hidden) and DashboardPage (global range+sync) through the per-user usePreference layer while preserving all seeding, geometry, and anonymous behaviors.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | useDashboardLayout -> usePreference for layouts + hidden | b3cf214 | useDashboardLayout.js, useDashboardLayout.test.js |
| 2 | DashboardPage global range + sync toggle -> usePreference | ac12a3c | DashboardPage.jsx |

## What Was Built

**Task 1 (useDashboardLayout refactor):**
- Replaced `useState(() => sanitizeLayouts(readJson(LAYOUTS_KEY)))` with `usePreference('dashboardLayouts', null, { localStorageKey: LAYOUTS_KEY })`
- Applied `sanitizeLayouts` via `useMemo` on top of the raw stored value so the preference layer delivers unprocessed JSON to the sanitizer
- Replaced the `hidden` useState+seeding initializer with `usePreference('dashboardHidden', [], { localStorageKey: HIDDEN_KEY })` plus a one-time `useEffect` that runs the original seeding logic (reads raw localStorage, detects new optional panels not previously known, seeds them via `setHiddenArr`)
- Re-wrapped `hiddenArr` as a `Set` via `useMemo` for the caller API
- Added mutable refs (`storedLayoutsRef`, `hiddenArrRef`) so callbacks always read the latest value without functional updaters (which `usePreference.setValue` doesn't support)
- Refactored `applyLayoutChange` to skip calling `setStoredLayouts` entirely when nothing changed (replacing the old `return prev` bail-out — this keeps `storedLayouts` ref stable, which keeps the `layouts` memo ref stable, which prevents the RGL feedback loop)
- Added `QueryClientProvider` wrapper to `useDashboardLayout.test.js` per Option B (predecided checkpoint)
- Kept `LAYOUTS_KEY = 'hc_dashboard_layouts'` and `HIDDEN_KEY = 'hc_dashboard_hidden'` constants unchanged (D-12)
- Removed the now-redundant `useEffect` localStorage writes (lines 122-123 of original)
- `readJson` helper kept for seeding useEffect direct reads

**Task 2 (DashboardPage refactor):**
- Replaced `useState` + `useEffect` localStorage pattern for `dashboardDays` and `syncDashboardRanges` with `usePreference('dashboardGlobalDays', 30, { localStorageKey: RANGE_KEY })` and `usePreference('dashboardSyncRanges', true, { localStorageKey: SYNC_KEY })`
- Kept `RANGE_KEY = 'hc_dashboard_global_days'` and `SYNC_KEY = 'hc_dashboard_sync_ranges'` constants (D-12)
- Removed the direct read `useState` initializers (lines 23-34) and write `useEffect` calls (lines 46-47)
- Fixed sync toggle from `(v) => !v` functional update to `!syncDashboardRanges` concrete value
- JSON codec handles legacy bare-string localStorage values (`'30'`, `'true'`, `'false'`) via `JSON.parse` — zero migration needed

## Verification

- `cd web && npm test`: **319 tests / 44 test files — all pass** (run against worktree via node_modules symlink)
- All 14 `useDashboardLayout` tests pass unchanged (anon-path D-15 guard confirmed)
- localStorage keys `hc_dashboard_layouts`, `hc_dashboard_hidden`, `hc_dashboard_global_days`, `hc_dashboard_sync_ranges` preserved
- `LAYOUTS_KEY`, `HIDDEN_KEY`, `RANGE_KEY`, `SYNC_KEY` constants unchanged

## Deviations from Plan

### Sanctioned Deviation (Predecided Checkpoint Option B)

**1. [Option B - Test Wrapper] Added QueryClientProvider to useDashboardLayout.test.js**
- **Found during:** Task 1 (prior run hit checkpoint:decision before this agent was spawned)
- **Issue:** `useDashboardLayout` now calls `usePreference` which calls `useAuth` → `useQueryClient`, throwing "No QueryClient set" without a provider
- **Fix:** Added `vi.mock('../lib/api.js')` + `makeWrapper()` with `QueryClientProvider` (mirroring the pattern from `useAuth.test.js`). With no session, `/auth/me` resolves to `user=null` → pure-localStorage anon path → all 14 existing assertions pass unchanged (D-15 preserved)
- **Deviation scope:** Test file only — zero change to assertion content or logic
- **Authorized by:** Predecided checkpoint in plan prompt (Option B)

### Auto-fixed Issues

**2. [Rule 1 - Bug] Default values corrected from plan text**
- **Found during:** Task 2 implementation + advisor review
- **Issue:** Plan text said `usePreference('dashboardGlobalDays', 7, ...)` and `usePreference('dashboardSyncRanges', false, ...)` but the current code defaults to **30** and **true** respectively. Using the plan's values would silently regress fresh-user behavior (D-15: "byte-for-byte identical to today")
- **Fix:** Used `30` and `true` as defaults to match the original `useState` initializer fallbacks
- **Files modified:** `web/src/pages/DashboardPage.jsx`

**3. [Rule 2 - Missing Functional Updater Support] usePreference.setValue takes concrete values only**
- **Found during:** Task 1 implementation
- **Issue:** The original `useDashboardLayout` used functional state updaters (`setState(prev => ...)`) extensively. `usePreference`'s `setValue` is not React's setState — it takes a concrete value and would serialize/store a function object if passed a function
- **Fix:** (a) For `applyLayoutChange`: used `storedLayoutsRef.current` for latest value access + skip setter entirely when no changes (vs returning `prev` in a functional updater). (b) For `hidePanel`/`showPanel`/seeding: used `hiddenArrRef.current` for latest value access + passed concrete arrays. (c) For `setSyncDashboardRanges(!v)`: changed from `(v) => !v` to `!syncDashboardRanges` (concrete negation from closure)
- **Files modified:** `web/src/hooks/useDashboardLayout.js`, `web/src/pages/DashboardPage.jsx`

**4. [Rule 2 - Seeding Architecture] Optional-panel seeding moved to useEffect**
- **Found during:** Task 1 design (advisor review confirmed)
- **Issue:** `usePreference`'s `useState` initializer reads localStorage first; if HIDDEN_KEY has any value (even `[]`), the `defaultValue` (seeded list) is never used. But seeding needs to inspect BOTH LAYOUTS_KEY and HIDDEN_KEY to decide which optional panels are "new" — impossible to do correctly as a plain `defaultValue`
- **Fix:** Kept seeding logic as a one-time `useEffect` with `seedRef` guard that reads raw localStorage, computes which optional panels need seeding, and calls `setHiddenArr` with a concrete array. The seeding effect flushes synchronously within `renderHook`'s `act()` wrapper in tests
- **Files modified:** `web/src/hooks/useDashboardLayout.js`

## Known Stubs

None — all data flows are wired end-to-end (the preference layer from 24-03 is functional).

## Threat Flags

None — this is a pure consumer refactor. No new trust boundaries, endpoints, or auth paths introduced. The security boundary remains the me-router from 24-02.

## Self-Check: PASSED
