---
phase: 09-scheduled-repair-ui
plan: 01
subsystem: ui
tags: [react, tanstack-query, tailwind, date-fns, vitest]

# Dependency graph
requires:
  - phase: 08-scheduled-repair-backend
    provides: GET /api/setup/repair and PATCH /api/setup/repair endpoints with repair scheduler
provides:
  - Scheduled Repair section in Manage > Settings tab with toggle, hour picker, and last-run status
  - repairConfig query and saveRepairMutation in useSetup.js
  - Unit test coverage for SettingsTab Scheduled Repair section
affects: [future-ui-enhancements, repair-status-display]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useSetup hook extended with new query/mutation pair following retentionConfig/saveRetentionMutation pattern"
    - "Conditional section rendering: hour picker and status visible only when repair is enabled"
    - "Direct saveRepairMutation.mutate() on change (no debounce/autoSave) for immediate persistence"

key-files:
  created:
    - web/src/components/setup/SettingsTab.test.jsx
  modified:
    - web/src/hooks/useSetup.js
    - web/src/components/setup/SettingsTab.jsx

key-decisions:
  - "repairConfig query uses 60s refetchInterval to poll for last-run status updates"
  - "Direct saveRepairMutation.mutate() on toggle/hour change rather than extending autoSave debounce — cleaner per research recommendation"
  - "Hour picker and status display shown only when repairEnabledInput is true — reduces UI noise when feature is disabled"
  - "formatDistanceToNow from date-fns for relative time display of last-run timestamp"

patterns-established:
  - "SettingsTab.test.jsx: uses within() for scoped queries when multiple checkboxes exist in the page"

requirements-completed: [SREP-01, SREP-04]

# Metrics
duration: 10min
completed: 2026-04-03
---

# Phase 09 Plan 01: Scheduled Repair UI Summary

**Scheduled Repair toggle, hour picker, and last-run status wired to Phase 8 backend API in Manage > Settings tab**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-03T12:28:00Z
- **Completed:** 2026-04-03T12:31:00Z
- **Tasks:** 3 (including 1 human-verify checkpoint)
- **Files modified:** 3

## Accomplishments

- Extended `useSetup.js` with `repairConfig` query (`['setup', 'repair']`, 60s refetchInterval) and `saveRepairMutation` (PATCH /api/setup/repair) following the established hook pattern
- Added Scheduled Repair section to `SettingsTab.jsx` with toggle, conditional hour picker (reusing `HOURS_OPTIONS`/`localHourToUtc`/`utcHourToLocal`), explanatory text, and last-run status display with `formatDistanceToNow`
- Created `SettingsTab.test.jsx` with 9 unit tests covering toggle state, hour picker visibility, status display, and explanatory text; all 27 web tests pass after GREEN implementation

## Task Commits

Each task was committed atomically:

1. **Task 1: Add repair query/mutation to useSetup.js + TDD RED test scaffold** - `3bd96e8` (test)
2. **Task 2: Add Scheduled Repair section to SettingsTab.jsx** - `0ab30f0` (feat)
3. **Task 3: Visual verification of Scheduled Repair section** - checkpoint approved by user (no code commit)

## Files Created/Modified

- `web/src/hooks/useSetup.js` - Added `repairConfig` query and `saveRepairMutation` mutation; both exported in return object
- `web/src/components/setup/SettingsTab.jsx` - Added `repairConfig`/`saveRepairMutation` to prop destructure, `formatDistanceToNow` import, repair state + useEffect, and full Scheduled Repair JSX section before Danger Zone
- `web/src/components/setup/SettingsTab.test.jsx` - New file: 9 tests for toggle (checked/unchecked), click handler, hour picker visibility, status ("No runs yet" and outcome counts), and explanatory text

## Decisions Made

- `repairConfig` query uses `refetchInterval: 60_000` so the UI auto-refreshes last-run status without user action
- `saveRepairMutation.mutate()` called directly on toggle and hour change rather than going through `autoSave` debounce — repair config changes are intentional, immediate saves are appropriate
- Hour picker and status line are conditionally rendered only when repair is enabled, keeping the section compact when unused
- `formatDistanceToNow` (date-fns) used for relative time of `lastRunAt`, consistent with other time displays in the codebase

## Deviations from Plan

None — plan executed exactly as written. The test selectors were refined to use `within()` scoping (noted in commit) to handle multiple checkboxes on the page, which is a natural TDD iteration rather than a deviation.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Scheduled Repair UI is complete and wired to Phase 8 backend
- Both SREP-01 (toggle) and SREP-04 (explanatory text) requirements satisfied
- UI verified in browser by user (both toggle interaction and page-refresh persistence confirmed)
- No blockers for future phases

---
*Phase: 09-scheduled-repair-ui*
*Completed: 2026-04-03*

## Self-Check: PASSED

- FOUND: .planning/phases/09-scheduled-repair-ui/09-01-SUMMARY.md
- FOUND: commit 3bd96e8 (test(09-01): add failing tests for Scheduled Repair UI section)
- FOUND: commit 0ab30f0 (feat(09-01): add Scheduled Repair section to SettingsTab)
