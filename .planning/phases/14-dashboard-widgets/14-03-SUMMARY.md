---
phase: 14-dashboard-widgets
plan: "03"
subsystem: web-ui
tags: [dashboard, integration, kpi-cards, activity-feed, room-breakdown, stats-cards-deletion]
dependency_graph:
  requires: [14-01, 14-02]
  provides: [DashboardPage-rewired, StatsCards-deleted]
  affects: [DashboardPage]
tech_stack:
  added: []
  patterns: [widget-integration, import-replacement]
key_files:
  created: []
  modified:
    - web/src/pages/DashboardPage.jsx
  deleted:
    - web/src/components/StatsCards.jsx
decisions:
  - key: onViewAll-navigation
    choice: "Pass () => onNavigateToAccessory?.(null) as onViewAll to ActivityFeed"
    rationale: "handleToastNav(null) sets timelineFilters to { accessory: null } and navigates to timeline — clean view-all behavior without new props or App.jsx changes"
metrics:
  duration_minutes: 8
  completed_date: "2026-04-15"
  tasks_completed: 1
  tasks_total: 1
  files_changed: 2
---

# Phase 14 Plan 03: Dashboard Integration Summary

**One-liner:** Rewired DashboardPage to render KpiCards, ActivityFeed, and RoomBreakdown in D-15 order; deleted replaced StatsCards component.

## What Was Built

Task 1 (auto): Rewire DashboardPage imports and layout, delete StatsCards

- Replaced `import StatsCards` with imports of `KpiCards`, `ActivityFeed`, and `RoomBreakdown`
- Replaced `<StatsCards />` with `<KpiCards dashboardDays={dashboardDays} />` — KPI cards now receive the global range selector value
- Inserted `<ActivityFeed onNavigateToAccessory={onNavigateToAccessory} onViewAll={() => onNavigateToAccessory?.(null)} />` between the range selector row and TrendChart
- Inserted `<RoomBreakdown onSelectRoom={onSelectRoom} />` between TrendChart and the 2-col ActivityChart/RoomChart grid
- Deleted `web/src/components/StatsCards.jsx` — no remaining importers
- Build succeeded (vite build exits 0), all 77 tests pass

Task 2 (checkpoint:human-verify): Auto-approved in auto mode.

## Dashboard Widget Order (D-15)

1. Page title (h1 "Dashboard")
2. PairingHealthBanner
3. KpiCards (replaces StatsCards)
4. Range selector + sync toggle row
5. ActivityFeed (NEW)
6. TrendChart Card
7. RoomBreakdown (NEW)
8. 2-col: ActivityChart | RoomChart
9. 2-col: TopDevices | WeekdayHeatmap+MonthlyHeatmap
10. QuietHoursPanel
11. 2-col: AnomalyPanel | StaleDevicesPanel

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written, with one minor discretionary decision on `onViewAll` wiring (documented in decisions).

## Known Stubs

None — all widgets are fully wired to their data sources.

## Threat Flags

None — integration-only change adding read-only display components. No new network endpoints, auth paths, or schema changes.

## Self-Check

- [x] `web/src/pages/DashboardPage.jsx` exists and contains all 3 new imports
- [x] `web/src/components/StatsCards.jsx` deleted (confirmed by `git status`)
- [x] Commit a915a9a exists and includes both file changes
- [x] Build exits 0, 77 tests pass
