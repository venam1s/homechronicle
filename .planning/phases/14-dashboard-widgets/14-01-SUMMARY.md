---
phase: 14-dashboard-widgets
plan: "01"
subsystem: web-ui
tags: [kpi-cards, dashboard, health-status, trend-delta, hooks]
dependency_graph:
  requires: []
  provides: [KpiCards, useEvents-limit]
  affects: [DashboardPage, ActivityFeed]
tech_stack:
  added: []
  patterns: [compound-card, vi-fn-mock, tdd-red-green]
key_files:
  created:
    - web/src/components/KpiCards.jsx
    - web/src/components/KpiCards.test.jsx
  modified:
    - web/src/hooks/useEvents.js
    - web/src/lib/queryKeys.js
decisions:
  - "useEvents limit default=50 preserves all existing callers; queryKeys cache key includes limit as third element"
  - "Health KPI cards (Online/Offline/Stale) show em-dash sub-text — no historical health endpoint exists"
  - "Trend delta only on Events Today card using useDailyStats (today vs yesterday)"
  - "Loading skeleton triggered when both useAccessories and useDailyStats are loading"
metrics:
  duration_minutes: 10
  completed_date: "2026-04-15"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 2
---

# Phase 14 Plan 01: KpiCards and useEvents Limit — Summary

**One-liner:** Health-focused KPI cards (Online/Offline/Stale counts + Events Today trend delta) replacing StatsCards, with useEvents extended to accept optional limit parameter.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend useEvents hook with limit parameter and update queryKeys | 3fb252b | web/src/hooks/useEvents.js, web/src/lib/queryKeys.js |
| 2 (RED) | KpiCards test file | bbb4a6d | web/src/components/KpiCards.test.jsx |
| 2 (GREEN) | KpiCards component | 76a168b | web/src/components/KpiCards.jsx |

## What Was Built

### useEvents limit parameter (Task 1)

`useEvents(filters, page, limit = 50)` now accepts an optional third parameter. The default of `50` preserves backward compatibility for all existing callers. The `queryKeys.events` factory now includes `limit` as a third cache key element, allowing `ActivityFeed` (Plan 02) to use `limit=20` without cache collision.

### KpiCards component (Task 2)

Four KPI cards replace the old `StatsCards.jsx`:

- **ONLINE** — count of accessories with `health.status === 'online'`
- **OFFLINE** — count of accessories with `health.status === 'offline'`
- **STALE** — count of accessories with `health.status === 'stale'`
- **TODAY** — today's event count from `useDailyStats`, with trend delta (today vs yesterday)

Trend delta: shown only on the Events Today card using `TrendingUp`/`TrendingDown` Lucide icons with `text-hc-success-text` / `text-hc-danger-text`. Health KPI cards always show `—` (no historical health data endpoint exists).

Loading state renders 4 skeleton shimmer cards using `.skeleton` class.

All styling uses design token classes (`bg-hc-*`, `text-hc-*`) — no hardcoded colors.

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED (test file, failing) | bbb4a6d | PASS — module import error confirmed |
| GREEN (implementation) | 76a168b | PASS — 7/7 tests pass |

## Verification

- `npm test -- --run` exits 0: 64 tests pass (57 pre-existing + 7 new KpiCards tests)
- KpiCards.jsx uses only design token classes (confirmed: no `bg-white`, `text-gray-`, `text-[10px]`)
- useEvents backward compatible (default limit=50, existing callers unaffected)
- queryKeys.events includes limit in cache key

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — KpiCards is a read-only display component. No new network endpoints, auth paths, or file access patterns introduced.

## Self-Check: PASSED

- `web/src/components/KpiCards.jsx` — FOUND
- `web/src/components/KpiCards.test.jsx` — FOUND
- `web/src/hooks/useEvents.js` — FOUND (modified)
- `web/src/lib/queryKeys.js` — FOUND (modified)
- Commit 3fb252b — FOUND
- Commit bbb4a6d — FOUND
- Commit 76a168b — FOUND
