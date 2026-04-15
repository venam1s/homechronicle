---
phase: 15-chart-styling
plan: 03
subsystem: web-ui
tags: [sparkline, kpi, recharts, chart-styling]
dependency_graph:
  requires: [15-01]
  provides: [CHART-02]
  affects: [web/src/components/KpiCards.jsx, web/src/components/KpiCards.test.jsx]
tech_stack:
  added: []
  patterns: [sparkline-areachart, accent-gradient-fill, useDailyStats-dedup]
key_files:
  modified:
    - web/src/components/KpiCards.jsx
    - web/src/components/KpiCards.test.jsx
decisions:
  - Static gradient ID "sparklineGradient" used since only one sparkline renders per page
  - Sparkline opacity 0.3 (denser than TrendChart 0.15) for legibility at 36px height
  - useDailyStats(7) call deduplicates via TanStack Query when dashboardDays is already 7
metrics:
  duration_seconds: 147
  completed: 2026-04-15T16:55:00Z
  tasks_completed: 2
  tasks_total: 2
  tests_added: 2
  tests_total: 9
  files_modified: 2
---

# Phase 15 Plan 03: KPI Sparkline Summary

7-day sparkline AreaChart added to Events Today KPI card using accent-colored gradient fill, 36px height, no animation, with two new test assertions confirming sparkline presence and health-card exclusion.

## Task Results

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add sparkline AreaChart to Events Today KPI card | fdfc8f8 | web/src/components/KpiCards.jsx |
| 2 | Add sparkline test case to KpiCards.test.jsx | 83a9afd | web/src/components/KpiCards.test.jsx |

## Changes Made

### Task 1: Sparkline AreaChart
- Added `useMemo`, `ResponsiveContainer`, `AreaChart`, `Area` imports
- Added `useAccentRgb` hook for gradient color
- Added `useDailyStats(7)` call with `sparkData` memo that backfills 7-day window
- Conditional sparkline render only on `def.key === 'today'` card
- 36px tall, monotone curve, gradient fill (0.3 to 0 opacity), no axes/tooltip/dots/animation

### Task 2: Test Assertions
- Added `useAccentRgb` mock returning `[37, 99, 235]`
- Test 8 (CHART-02): Verifies `.recharts-responsive-container` exists in DOM
- Test 9 (CHART-02): Verifies only 1 ResponsiveContainer (health cards excluded)
- All 9 KpiCards tests pass; 87 total suite tests pass

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Verification Results

- `grep -c "sparklineGradient" KpiCards.jsx` = 2 (defs + fill ref)
- `grep "useDailyStats(7)" KpiCards.jsx` matches
- `grep "useAccentRgb" KpiCards.jsx` matches
- `grep "isAnimationActive={false}" KpiCards.jsx` matches
- `grep "def.key === 'today'" KpiCards.jsx` matches
- `grep -c "CHART-02" KpiCards.test.jsx` = 2
- `grep -c "it(" KpiCards.test.jsx` = 9
- `npm test` exits 0 (87 tests pass, 16 files)
