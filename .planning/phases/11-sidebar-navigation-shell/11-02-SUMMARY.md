---
phase: 11-sidebar-navigation-shell
plan: "02"
subsystem: web-ui
tags: [page-extraction, react, navigation, dashboard]
dependency_graph:
  requires: []
  provides:
    - web/src/pages/DashboardPage.jsx
    - web/src/pages/TimelinePage.jsx
    - web/src/pages/AlertsPage.jsx
    - web/src/pages/SettingsPage.jsx
    - web/src/pages/DevicesPage.jsx
  affects:
    - web/src/App.jsx (will import these pages in Plan 03)
tech_stack:
  added: []
  patterns:
    - page-wrapper-component
    - props-passthrough
    - sub-tab-navigation
key_files:
  created:
    - web/src/pages/DashboardPage.jsx
    - web/src/pages/TimelinePage.jsx
    - web/src/pages/AlertsPage.jsx
    - web/src/pages/SettingsPage.jsx
    - web/src/pages/DevicesPage.jsx
  modified: []
decisions:
  - "DashboardPage exports DASHBOARD_WINDOWS/DASHBOARD_RANGE_STORAGE_KEY/DASHBOARD_SYNC_STORAGE_KEY as named exports so App.jsx can reuse them for localStorage persistence during Plan 03 rewrite"
  - "DevicesPage uses hc-* CSS custom property tokens (not dark: classes) for sub-tab active state — matches D-02 and Phase 10 token foundation"
  - "DevicesPage has exactly 2 sub-tabs (Add Accessories, Manage Accessories) — no Alerts, no Settings, matching CONTEXT.md D-02"
metrics:
  duration_seconds: 114
  completed_date: "2026-04-14"
  tasks_completed: 2
  files_created: 5
  files_modified: 0
requirements_addressed:
  - NAV-01
  - LAYOUT-02
---

# Phase 11 Plan 02: Page Component Extraction Summary

**One-liner:** Five page components extracted from App.jsx inline JSX into `web/src/pages/`, including a full DashboardPage with all 11 dashboard widgets and a DevicesPage with 2-tab Add/Manage sub-navigation using design tokens.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create DashboardPage with all dashboard widgets | `1d65466` | web/src/pages/DashboardPage.jsx |
| 2 | Create TimelinePage, AlertsPage, SettingsPage, DevicesPage | `6261548` | web/src/pages/TimelinePage.jsx, AlertsPage.jsx, SettingsPage.jsx, DevicesPage.jsx |

## What Was Built

### DashboardPage.jsx (129 lines)
Extracts the dashboard tab content from App.jsx's `tab === 'dashboard'` block. Contains:
- All 11 widget imports: StatsCards, ActivityChart, TrendChart, TopDevices, RoomChart, WeekdayHeatmap, MonthlyHeatmap, AnomalyPanel, StaleDevicesPanel, QuietHoursPanel, PairingHealthBanner
- Named constant exports: `DASHBOARD_WINDOWS`, `DASHBOARD_RANGE_STORAGE_KEY`, `DASHBOARD_SYNC_STORAGE_KEY`
- Props: `dashboardDays`, `setDashboardDays`, `syncDashboardRanges`, `setSyncDashboardRanges`, `onSelectAccessory`, `onSelectRoom`, `onNavigateToAccessory`, `onViewDeviceRepair`
- Identical layout to current App.jsx inline dashboard: max-w-5xl container, range picker, sync toggle, all chart wrappers

### TimelinePage.jsx (5 lines)
Thin pass-through wrapper around `Timeline` component. Passes `initialFilters` and `onSelectAccessory` props through directly.

### AlertsPage.jsx (10 lines)
Promotes `Alerts.jsx` to a top-level page with a `max-w-4xl mx-auto py-6 px-4` container (per decision D-03).

### SettingsPage.jsx (11 lines)
Wraps `SettingsTab` with its own `useSetup()` hook call. The page is self-contained — App.jsx does not need to pass setup data through.

### DevicesPage.jsx (43 lines)
Replaces the need for `SetupTabs.jsx` for device navigation. Contains exactly 2 sub-tabs (Add Accessories, Manage Accessories). Active state uses `border-hc-accent-strong text-hc-accent-strong` tokens (no `dark:` classes). `useSetup()` called internally.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all page components are fully wired to existing components and hooks.

## Threat Flags

None - pure presentational wrappers with no new trust boundaries, network endpoints, or data processing.

## Self-Check: PASSED

Files verified:
- [x] web/src/pages/DashboardPage.jsx — FOUND, 129 lines, all widget imports verified
- [x] web/src/pages/TimelinePage.jsx — FOUND
- [x] web/src/pages/AlertsPage.jsx — FOUND
- [x] web/src/pages/SettingsPage.jsx — FOUND
- [x] web/src/pages/DevicesPage.jsx — FOUND

Commits verified:
- [x] 1d65466 — feat(11-02): create DashboardPage with all dashboard widgets extracted from App.jsx
- [x] 6261548 — feat(11-02): create TimelinePage, AlertsPage, SettingsPage, and DevicesPage
