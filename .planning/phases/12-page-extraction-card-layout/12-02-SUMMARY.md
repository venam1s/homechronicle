---
phase: 12-page-extraction-card-layout
plan: 02
subsystem: web-ui
tags: [card-layout, page-headers, typography-tokens, ui-redesign]
dependency_graph:
  requires: [12-01]
  provides: [dashboard-card-layout, devices-page-header, alerts-card-layout]
  affects: [web/src/pages/DashboardPage.jsx, web/src/pages/DevicesPage.jsx, web/src/pages/AlertsPage.jsx, web/src/components/Alerts.jsx]
tech_stack:
  added: []
  patterns: [Card-component-wrapping, page-header-pattern, theme-token-replacement]
key_files:
  created: []
  modified:
    - web/src/pages/DashboardPage.jsx
    - web/src/pages/DevicesPage.jsx
    - web/src/pages/AlertsPage.jsx
    - web/src/components/Alerts.jsx
decisions:
  - Split Alerts.jsx rules form and rules list into separate Card sections for clearer visual hierarchy
  - Replaced text-gray-* with theme tokens only in elements touched during Card restructuring
metrics:
  duration: 188s
  completed: 2026-04-15
  tasks_completed: 2
  tasks_total: 2
  files_modified: 4
---

# Phase 12 Plan 02: Card Component & Page Headers (Dashboard, Devices, Alerts) Summary

Applied Card component wrapping and page headers to DashboardPage, DevicesPage, and AlertsPage with theme token replacements in Alerts.jsx

## What Was Done

### Task 1: DashboardPage Card Refactor
- Added `import Card from '../components/Card.jsx'`
- Added page header with "Dashboard" title using `text-hc-page-title font-semibold text-hc-fg-strong`
- Replaced all 7 inline `bg-hc-panel rounded-xl shadow-sm p-4 sm:p-5` card wrappers with `<Card><Card.Body>...</Card.Body></Card>`
- Preserved grid layout structure (`grid grid-cols-1 md:grid-cols-2 gap-4`) across all 3 two-column sections
- Kept PairingHealthBanner, StatsCards, QuietHoursPanel, and range selector row outside of cards

### Task 2: DevicesPage, AlertsPage, Alerts.jsx
- **DevicesPage**: Added page header "Devices", wrapped each sub-tab (Browse, Add, Manage) content in Card/Card.Body. Sub-tab nav bar stays outside cards.
- **AlertsPage**: Added page header "Alerts" with subtitle "Manage webhook alert rules"
- **Alerts.jsx**: Replaced both `bg-white rounded-xl shadow-sm` wrappers with Card components. Split the original single card into 3 distinct Card sections:
  - "Alert Rules" (form) with Card.Header
  - "Active Rules" (rules list) with Card.Header
  - "Recent Deliveries" (delivery history) with Card.Header
- Replaced `text-gray-900` with `text-hc-fg-strong`, `text-gray-500` with `text-hc-muted`, `border-gray-200` with `border-hc-panel-border`, `border-gray-300` with `border-hc-panel-border` in restructured elements
- Removed Bell icon import (no longer needed with Card.Header providing section titles)

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | c6e3bc9 | feat(12-02): refactor DashboardPage to use Card component and add page header |
| 2 | 6ae57d6 | feat(12-02): add page headers and Card components to DevicesPage, AlertsPage, Alerts |

## Verification Results

- `npx vitest run`: 10/10 test files passed, 50/50 tests passed
- `grep -c "bg-hc-panel rounded-xl shadow-sm p-4" DashboardPage.jsx` = 0
- `grep -c "bg-white rounded-xl" Alerts.jsx` = 0
- `text-hc-page-title` present in all 3 page files (DashboardPage, DevicesPage, AlertsPage)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Improvement] Split Alerts rules into separate Card sections**
- **Found during:** Task 2
- **Issue:** The original Alerts.jsx had a single bg-white wrapper containing both the form and rules list. The plan suggested looking for a third section.
- **Fix:** Split into 3 Card sections (Alert Rules form, Active Rules list, Recent Deliveries) for better visual hierarchy and consistency with Card.Header pattern
- **Files modified:** web/src/components/Alerts.jsx
- **Commit:** 6ae57d6
