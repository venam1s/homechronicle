---
phase: 15-chart-styling
plan: 02
subsystem: ui
tags: [charts, gradients, design-tokens, tailwind, recharts]

# Dependency graph
requires:
  - 15-01
provides:
  - ActivityChart gradient fill (no Cell children)
  - Design-token window selectors across 4 chart components
  - AccessoryDetail chart alignment to canonical patterns
affects: [15-03]

# Tech tracking
tech-stack:
  added: []
  patterns: [SVG linearGradient fill for bar charts, design-token clsx pattern for window selectors]

key-files:
  created: []
  modified:
    - web/src/components/ActivityChart.jsx
    - web/src/components/TrendChart.jsx
    - web/src/components/WeekdayHeatmap.jsx
    - web/src/components/RoomChart.jsx
    - web/src/components/AccessoryDetail.jsx

key-decisions:
  - "ActivityChart uses static gradient ID (activityBarGradient) since only one instance renders at a time, unlike TrendChart which uses accent-keyed dynamic ID"
  - "AccessoryDetail gradient aligned to TrendChart canonical 0.15/0 opacity stops rather than its previous 0.2/0.01"

patterns-established:
  - "Window selector buttons use bg-hc-accent-soft/text-hc-accent-stronger for active state and text-hc-muted/hover:text-hc-fg/hover:bg-hc-panel-mid for inactive state"

requirements-completed: [CHART-01, CHART-03]

# Metrics
duration: 4min
completed: 2026-04-15
---

# Phase 15 Plan 02: Gradient Fills and Design Token Window Selectors Summary

**ActivityChart gradient fill replaces per-Cell opacity; all 4 window selectors use design tokens; AccessoryDetail gradient/border/stroke aligned to canonical patterns**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-15T16:51:29Z
- **Completed:** 2026-04-15T16:55:46Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Replaced ActivityChart per-Cell opacity fill pattern with single SVG linearGradient (0.85 to 0.35 opacity)
- Removed Cell import and maxCount memo from ActivityChart (dead code after gradient switch)
- Replaced hardcoded bg-blue-100/text-blue-700 active classes with bg-hc-accent-soft/text-hc-accent-stronger in TrendChart, WeekdayHeatmap, RoomChart, and AccessoryDetail
- Replaced hardcoded text-gray-400/hover:text-gray-600/hover:bg-gray-100 inactive classes with text-hc-muted/hover:text-hc-fg/hover:bg-hc-panel-mid in same 4 components
- Aligned AccessoryDetail AreaChart gradient opacity from 0.2/0.01 to canonical 0.15/0
- Replaced hardcoded violet border rgba(139,92,246,0.3) with rgba(var(--hc-accent-rgb), 0.3)
- Changed AccessoryDetail LineChart stroke from 0.85 opacity to full opacity
- Full test suite: 85 tests, 16 files, all passing

## Task Commits

1. **Task 1: Replace ActivityChart Cell pattern with gradient fill** - `ddd5199` (feat)
2. **Task 2: Fix window selector tokens and AccessoryDetail chart alignment** - `843333b` (feat)

## Files Created/Modified

- `web/src/components/ActivityChart.jsx` - Gradient fill, removed Cell/maxCount, added accentStr
- `web/src/components/TrendChart.jsx` - Window selector design token classes
- `web/src/components/WeekdayHeatmap.jsx` - Window selector design token classes
- `web/src/components/RoomChart.jsx` - Window selector design token classes
- `web/src/components/AccessoryDetail.jsx` - Window selector tokens, gradient opacity, border color, stroke opacity

## Decisions Made

- Used static gradient ID for ActivityChart since only one instance renders per page, unlike TrendChart which needs accent-keyed IDs for dynamic accent changes.
- Aligned AccessoryDetail to TrendChart's 0.15/0 opacity stops as the canonical pattern for area chart gradients.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All gradient fills and design token replacements are in place
- Plan 15-03 can proceed with any remaining chart styling work
- No blockers

## Self-Check: PASSED

- FOUND: web/src/components/ActivityChart.jsx
- FOUND: web/src/components/TrendChart.jsx
- FOUND: web/src/components/WeekdayHeatmap.jsx
- FOUND: web/src/components/RoomChart.jsx
- FOUND: web/src/components/AccessoryDetail.jsx
- FOUND: .planning/phases/15-chart-styling/15-02-SUMMARY.md
- FOUND: commit ddd5199 (feat - ActivityChart gradient fill)
- FOUND: commit 843333b (feat - window selector tokens + AccessoryDetail alignment)
- bg-blue-100 count in modified files: 0 (correct)
- text-blue-700 count in modified files: 0 (correct)
- Cell count in ActivityChart: 0 (correct)
- activityBarGradient count in ActivityChart: 2 (correct)
- Full test suite: 85 tests, 16 files, all passing

---
*Phase: 15-chart-styling*
*Completed: 2026-04-15*
