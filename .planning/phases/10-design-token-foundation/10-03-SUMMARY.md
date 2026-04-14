---
phase: 10-design-token-foundation
plan: "03"
subsystem: web-ui
tags: [design-tokens, dark-mode, refactor, tailwind]
dependency_graph:
  requires: [10-01]
  provides: [zero-dark-classes-in-top4-components]
  affects: [web/src/components/setup/SettingsTab.jsx, web/src/components/setup/AddDevicesTab.jsx, web/src/components/setup/MyDevicesTab.jsx, web/src/components/AccessoryDetail.jsx]
tech_stack:
  added: []
  patterns: [semantic-token-classes, hc-success-bg, hc-warning-bg, hc-danger-bg, hc-panel, hc-fg]
key_files:
  created: []
  modified:
    - web/src/components/setup/SettingsTab.jsx
    - web/src/components/setup/AddDevicesTab.jsx
    - web/src/components/setup/MyDevicesTab.jsx
    - web/src/components/AccessoryDetail.jsx
decisions:
  - "Danger Zone red colors mapped to hc-danger-bg/hc-danger-text tokens (not raw red-*) for consistency"
  - "Status badges (Logging/Stale/Needs Repair) use hc-success/hc-warning/hc-danger tokens"
  - "Pre-existing SettingsTab test failures (3 tests) confirmed unrelated to this plan's changes"
metrics:
  duration: "~25 minutes"
  completed: "2026-04-14"
  tasks: 2
  files_modified: 4
requirements: [THEME-02]
---

# Phase 10 Plan 03: Direct-Refactor Top 4 Components Summary

Eliminated 269 dark: class occurrences across the four heaviest components (SettingsTab: 154, AddDevicesTab: 52, MyDevicesTab: 35, AccessoryDetail: 28) by replacing every dark: Tailwind class pair with semantic token classes from the @theme registration in Plan 01.

## What Was Built

Two task commits replaced all dark: classes in 4 components:

- **Task 1 (e2173ed):** SettingsTab.jsx (154 dark: classes) + AddDevicesTab.jsx (52 dark: classes)
- **Task 2 (24cc814):** MyDevicesTab.jsx (35 dark: classes) + AccessoryDetail.jsx (28 dark: classes)

All 269 dark: occurrences replaced with semantic token classes. Status badges in MyDevicesTab now use `bg-hc-success-bg`, `text-hc-success-text`, `bg-hc-warning-bg`, `text-hc-warning-text`, `bg-hc-danger-bg`, `text-hc-danger-text`.

## Tasks Completed

| Task | Description | Commit | Files Modified |
|------|-------------|--------|----------------|
| 1 | Direct-refactor SettingsTab.jsx and AddDevicesTab.jsx | e2173ed | SettingsTab.jsx, AddDevicesTab.jsx |
| 2 | Direct-refactor MyDevicesTab.jsx and AccessoryDetail.jsx | 24cc814 | MyDevicesTab.jsx, AccessoryDetail.jsx |

## Token Mappings Applied

**Surface backgrounds:** `bg-white dark:bg-gray-800` → `bg-hc-panel`, `bg-gray-100 dark:bg-gray-700` → `bg-hc-panel-mid`

**Text colors:** `text-gray-900 dark:text-gray-100` → `text-hc-fg-strong`, `text-gray-500 dark:text-gray-400` → `text-hc-muted`

**Borders:** `border-gray-200 dark:border-gray-700` → `border-hc-panel-border`

**Status badges (MyDevicesTab):** `bg-green-100 dark:bg-green-900/30` → `bg-hc-success-bg`, `bg-amber-100 dark:bg-amber-900/30` → `bg-hc-warning-bg`, `bg-red-100 dark:bg-red-900/30` → `bg-hc-danger-bg`

**Danger Zone (SettingsTab):** `bg-red-50 dark:bg-red-900/20` → `bg-hc-danger-bg`, `text-red-700 dark:text-red-400` → `text-hc-danger-text`

## Verification Results

- `grep -rn "dark:" web/src/components/setup/SettingsTab.jsx ...` returns 0 results
- `cd web && npx vite build` succeeds (CSS bundle reduced from 75.69 kB to 70.16 kB)
- 3 pre-existing test failures in SettingsTab.test.jsx (Scheduled Repair section) confirmed pre-existing before this plan

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None. All four components render using real data through existing hooks; no placeholder or stub data was introduced.

## Self-Check: PASSED

- web/src/components/setup/SettingsTab.jsx: 0 dark: classes - CONFIRMED
- web/src/components/setup/AddDevicesTab.jsx: 0 dark: classes - CONFIRMED
- web/src/components/setup/MyDevicesTab.jsx: 0 dark: classes - CONFIRMED
- web/src/components/AccessoryDetail.jsx: 0 dark: classes - CONFIRMED
- Commit e2173ed (Task 1) - CONFIRMED
- Commit 24cc814 (Task 2) - CONFIRMED
- Build passes - CONFIRMED
