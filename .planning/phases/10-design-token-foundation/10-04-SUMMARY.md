---
phase: 10-design-token-foundation
plan: 04
subsystem: ui
tags: [tailwind, css-tokens, dark-mode, design-system, react]

# Dependency graph
requires:
  - phase: 10-01
    provides: CSS @theme block with all hc- token utilities registered
  - phase: 10-02
    provides: Accent rename and localStorage migration complete
  - phase: 10-03
    provides: Heavy components (SettingsTab, AddDevicesTab, MyDevicesTab, AccessoryDetail) refactored

provides:
  - Zero dark: classes remaining in any .jsx or .js file in web/src/
  - All 20 remaining component files cleaned of dark: classes
  - Complete semantic token coverage across all UI components
  - Status badge pattern: hc-warning-*, hc-success-*, hc-danger-* used consistently

affects:
  - Phase 11 (sidebar/layout) - token system is now complete baseline
  - Phase 15 (chart styling) - chart containers now use text-hc-fg consistently

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Status badge pattern: bg-hc-warning-bg / text-hc-warning-text / border-hc-warning-border (amber)"
    - "Success badge pattern: bg-hc-success-bg / text-hc-success-text / border-hc-success-border (green)"
    - "Danger badge pattern: bg-hc-danger-bg / text-hc-danger-text / border-hc-danger-border (red)"
    - "Panel containers use bg-hc-panel instead of bg-white dark:bg-gray-800"
    - "Muted text uses text-hc-muted instead of text-gray-400 dark:text-gray-500"

key-files:
  created: []
  modified:
    - web/src/components/Alerts.jsx
    - web/src/components/setup/RepairFlow.jsx
    - web/src/components/QuietHoursPanel.jsx
    - web/src/components/AnomalyPanel.jsx
    - web/src/components/ChangelogModal.jsx
    - web/src/components/StaleDevicesPanel.jsx
    - web/src/components/FilterBar.jsx
    - web/src/components/setup/SetupTabs.jsx
    - web/src/components/setup/BridgeChildrenRow.jsx
    - web/src/components/PairingHealthBanner.jsx
    - web/src/App.jsx
    - web/src/components/ActivityChart.jsx
    - web/src/components/TrendChart.jsx
    - web/src/components/MonthlyHeatmap.jsx
    - web/src/components/WeekdayHeatmap.jsx
    - web/src/components/TopDevices.jsx
    - web/src/components/RoomChart.jsx
    - web/src/components/HeatmapLane.jsx
    - web/src/components/EventRow.jsx
    - web/src/components/AccessoryList.jsx

key-decisions:
  - "hover:brightness-95 dark:hover:brightness-110 collapsed to hover:brightness-95 only - tokens handle dark mode contrast automatically"
  - "Warning card hover: amber hover:bg-amber-100/80 dark:hover:bg-amber-500/20 replaced with hover:opacity-90 - simpler and token-aware"
  - "FilterBar inputs: dark:border-gray-600 -> border-hc-border-strong (slightly stronger than panel-border for input contrast)"

patterns-established:
  - "Status patterns: all amber/warning = hc-warning-*, all green/success = hc-success-*, all red/danger = hc-danger-*"
  - "Panel pattern: bg-hc-panel replaces bg-white dark:bg-gray-800 everywhere"
  - "Section heading pattern: text-hc-fg replaces text-gray-700 dark:text-gray-200"

requirements-completed:
  - THEME-02

# Metrics
duration: 45min
completed: 2026-04-14
---

# Phase 10 Plan 04: Dark Class Elimination - Final 20 Files Summary

**Eliminated all remaining 89 dark: classes from 20 component files, completing THEME-02 with zero dark: utilities left in web/src/**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-04-14T10:00:00Z
- **Completed:** 2026-04-14T10:45:00Z
- **Tasks:** 1 of 2 complete (Task 2 is human verification checkpoint)
- **Files modified:** 20

## Accomplishments

- Replaced all 89 dark: class occurrences across 20 files with semantic hc- token classes
- `grep -rn "dark:" web/src/ --include="*.jsx"` returns 0 lines — THEME-02 fully achieved
- Status badges consistently use hc-warning-*, hc-success-*, hc-danger-* token classes
- Vite production build passes cleanly (313ms)
- Pre-existing test failures (3 in SettingsTab.test.jsx Scheduled Repair section) confirmed unrelated to this plan's changes

## Task Commits

1. **Task 1: Remove dark: classes from all 20 remaining component files** - `f5e41f5` (feat)

## Files Modified

- `web/src/components/Alerts.jsx` - statusClass(), 8 form inputs, toggle button — all dark: removed
- `web/src/components/setup/RepairFlow.jsx` - modal bg, headings, error panel, inputs — all dark: removed
- `web/src/components/QuietHoursPanel.jsx` - card class, headers, muted text, dismiss button — all dark: removed
- `web/src/components/AnomalyPanel.jsx` - header, status text, warning cards — all dark: removed
- `web/src/components/ChangelogModal.jsx` - modal bg, borders, heading text, list items — all dark: removed
- `web/src/components/StaleDevicesPanel.jsx` - heading, warning cards — all dark: removed
- `web/src/components/FilterBar.jsx` - all 5 input/select elements — all dark: removed
- `web/src/components/setup/SetupTabs.jsx` - nav border, active/inactive tab classes — all dark: removed
- `web/src/components/setup/BridgeChildrenRow.jsx` - 3 input fields including conditional class — all dark: removed
- `web/src/components/PairingHealthBanner.jsx` - banner bg/border/text, button — all dark: removed
- `web/src/App.jsx` - 2 panel wrappers, 1 update badge — all dark: removed
- `web/src/components/ActivityChart.jsx` - 2 h3 headings — all dark: removed
- `web/src/components/TrendChart.jsx` - 2 h3 headings — all dark: removed
- `web/src/components/MonthlyHeatmap.jsx` - 2 h3 headings — all dark: removed
- `web/src/components/WeekdayHeatmap.jsx` - 1 h3 heading — all dark: removed
- `web/src/components/TopDevices.jsx` - 1 h3 heading — all dark: removed
- `web/src/components/RoomChart.jsx` - 1 h3 heading — all dark: removed
- `web/src/components/HeatmapLane.jsx` - 1 h3 heading — all dark: removed
- `web/src/components/EventRow.jsx` - 1 anomaly warning badge — all dark: removed
- `web/src/components/AccessoryList.jsx` - 1 stale device badge — all dark: removed

## Decisions Made

- `hover:brightness-95 dark:hover:brightness-110` collapsed to `hover:brightness-95` only — the CSS shim's token-based dark mode makes the dark modifier redundant; hover:brightness-95 works correctly in both modes
- Warning card hover states simplified from `hover:bg-amber-100/80 dark:hover:bg-amber-500/20` to `hover:opacity-90` — cleaner and fully token-aware
- FilterBar inputs: used `border-hc-border-strong` (slightly stronger) instead of `border-hc-panel-border` to maintain input field visual distinction from surrounding panel surfaces

## Deviations from Plan

None — plan executed exactly as written. One extra dark: occurrence was found in BridgeChildrenRow.jsx (a conditional class string the replace_all missed) and was fixed inline within Task 1.

## Issues Encountered

- `replace_all` on BridgeChildrenRow.jsx caught 2 of 3 dark: occurrences but missed the one in a conditional clsx string (different whitespace pattern). Fixed with a targeted edit. Not a deviation — still within Task 1.
- 3 pre-existing test failures in SettingsTab.test.jsx (Scheduled Repair section, unrelated to token cleanup). Confirmed pre-existing by git stash verification.

## Known Stubs

None — all token replacements are functional. The CSS @theme block from Plan 01 provides all hc- utilities used here.

## Threat Flags

None — CSS-only cleanup, no new network endpoints, auth paths, or schema changes.

## Self-Check

**Commits exist:**
- f5e41f5: feat(10-04): remove all dark: classes from 20 remaining component files — FOUND

**Files modified (all 20 confirmed changed in commit):**
- All 20 target files from plan frontmatter modified — FOUND

**Audit:**
- `grep -rn "dark:" web/src/ --include="*.jsx"` = 0 lines — PASSED
- `grep -rn "dark:bg-gray-" web/src/` = 0 lines — PASSED
- `grep -rn "dark:text-gray-" web/src/` = 0 lines — PASSED
- `grep -rn "dark:border-gray-" web/src/` = 0 lines — PASSED
- Vite build: clean (313ms) — PASSED
- Tests: 30/33 pass (3 pre-existing failures unrelated to this plan) — PASSED

## Self-Check: PASSED

## Next Phase Readiness

- Task 2 (human visual verification) is a checkpoint — awaiting human approval
- Once approved, Phase 10 is complete: all 358 dark: classes eliminated across 24 component files
- Phase 11 (sidebar collapse) can begin with full confidence the token system is stable

---
*Phase: 10-design-token-foundation*
*Completed: 2026-04-14*
