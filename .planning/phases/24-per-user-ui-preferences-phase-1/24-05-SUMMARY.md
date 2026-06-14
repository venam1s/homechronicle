---
phase: 24-per-user-ui-preferences-phase-1
plan: "05"
subsystem: web-ui
tags: [preferences, dashboard, hooks, refactor]
dependency_graph:
  requires: ["24-03"]
  provides: ["per-panel-days-via-usePreference", "muted-devices-via-usePreference"]
  affects: ["web/src/components/RoomChart.jsx", "web/src/components/TrendChart.jsx", "web/src/components/WeekdayHeatmap.jsx", "web/src/components/TopDevices.jsx", "web/src/hooks/useMutedDevices.js"]
tech_stack:
  added: []
  patterns: ["usePreference consumer pattern (localStorage + server-blob write-through)", "useMemo Set wrap for array-backed Set API"]
key_files:
  created: []
  modified:
    - web/src/components/RoomChart.jsx
    - web/src/components/TrendChart.jsx
    - web/src/components/WeekdayHeatmap.jsx
    - web/src/components/TopDevices.jsx
    - web/src/hooks/useMutedDevices.js
    - web/src/components/TrendChart.test.jsx
decisions:
  - "Default values matched existing behavior: RoomChart=7, TrendChart=30, WeekdayHeatmap=30, TopDevices=7"
  - "useMutedDevices uses useMemo(() => new Set(mutedArr), [mutedArr]) so callers retain the has/add/delete Set API"
  - "forcedDays useEffect now calls the usePreference setter — when authed, parent-driven range changes also persist to the server blob (consistent with usePreference transport invariant)"
  - "unmuteAll sets [] rather than a deleteItem call; layer writes [] to localStorage and (authed) to server blob"
metrics:
  duration: "~15 minutes"
  completed: "2026-06-14"
  tasks_completed: 2
  files_modified: 6
---

# Phase 24 Plan 05: Per-Panel Ranges + useMutedDevices via usePreference Summary

Route the four per-panel dashboard day-ranges and useMutedDevices through the usePreference layer using preserved localStorage keys so preferences follow the account when authenticated.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Four per-panel *_days ranges -> usePreference | c57b000 | RoomChart.jsx, TrendChart.jsx, WeekdayHeatmap.jsx, TopDevices.jsx, TrendChart.test.jsx |
| 2 | useMutedDevices -> usePreference | 747a079 | useMutedDevices.js |

## What Was Built

**Four panel range preferences (PREF-07, D-11):**
- `RoomChart.jsx`: `usePreference('dashboardRoomDays', 7, { localStorageKey: 'hc_dashboard_room_days' })`
- `TrendChart.jsx`: `usePreference('dashboardTrendDays', 30, { localStorageKey: 'hc_dashboard_trend_days' })`
- `WeekdayHeatmap.jsx`: `usePreference('dashboardWeekdayDays', 30, { localStorageKey: 'hc_dashboard_weekday_days' })`
- `TopDevices.jsx`: `usePreference('dashboardTopDevicesDays', 7, { localStorageKey: 'hc_dashboard_top_devices_days' })`

Each panel: removed `useState` lazy initializer reading localStorage, removed the `useEffect` writing to localStorage, replaced both with a single `usePreference(...)` call. The `forcedDays` propagation useEffect and `handleSetDays` handler now call the `setValue` from usePreference instead of the local `setDays`. Behavior is identical for anonymous users (D-15).

**Muted devices preference (PREF-09, D-11):**
- `useMutedDevices.js`: replaced `useState(loadMuted)` with `usePreference('mutedDevices', [], { localStorageKey: STORAGE_KEY })` where `STORAGE_KEY = 'hc_muted'` is preserved (D-12)
- Stored/returned as array; wrapped in `useMemo(() => new Set(mutedArr), [mutedArr])` so all callers retain the `.has()/.add()/.delete()` Set API unchanged
- `mute(name)` and `unmute(name)` derive next Set from `muted`, call `setMutedArr([...next])` — no functional-update closures that would serialize a function
- `unmuteAll()` calls `setMutedArr([])` (layer writes `[]` to localStorage and server blob; equivalent to prior `removeItem`)
- `loadMuted` helper and all inline `localStorage.setItem/removeItem` calls removed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TrendChart.test.jsx mock added for usePreference**
- **Found during:** Task 1
- **Issue:** TrendChart.test.jsx renders `<TrendChart />` bare (no QueryClientProvider). After importing usePreference, which calls useAuth() and useUserPreferences() (both TanStack Query hooks), vitest would throw "No QueryClient set" and the entire suite would fail.
- **Fix:** Added `vi.mock('../hooks/usePreference.js', () => ({ usePreference: vi.fn(() => [30, vi.fn()]) }))` at the top of TrendChart.test.jsx — returning default `30` to match TrendChart's pre-existing default so existing assertions (empty-state "last 30 days" text) remain accurate.
- **Files modified:** `web/src/components/TrendChart.test.jsx`
- **Commit:** c57b000

## Known Stubs

None.

## Verification

- `cd web && npm test`: 44 test files, 319 tests — all passing
- All five preserved localStorage keys intact: `hc_dashboard_room_days`, `hc_dashboard_trend_days`, `hc_dashboard_weekday_days`, `hc_dashboard_top_devices_days`, `hc_muted`
- Direct `localStorage.getItem/setItem/removeItem` removed from all five files
- Anonymous (unauthenticated) behavior unchanged: `usePreference` defaults to localStorage-only path when `user` is null (D-15)

## Threat Flags

None. This is a pure consumer refactor. The security boundary remains the me-router (24-02); no new network endpoints or trust boundaries introduced.

## Self-Check: PASSED

- web/src/components/RoomChart.jsx — FOUND (modified)
- web/src/components/TrendChart.jsx — FOUND (modified)
- web/src/components/WeekdayHeatmap.jsx — FOUND (modified)
- web/src/components/TopDevices.jsx — FOUND (modified)
- web/src/hooks/useMutedDevices.js — FOUND (modified)
- Commit c57b000 — FOUND (`git log`)
- Commit 747a079 — FOUND (`git log`)
- 319/319 tests passing
