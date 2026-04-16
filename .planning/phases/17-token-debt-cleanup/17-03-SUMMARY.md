---
phase: 17-token-debt-cleanup
plan: "03"
subsystem: web-ui
tags: [theming, design-tokens, dark-mode, THEME-02, CHART-03]
dependency_graph:
  requires: []
  provides: [tokenized-timeline-components, tokenized-chart-components, CHART-03-satisfied]
  affects: [web/src/components]
tech_stack:
  added: []
  patterns: [semantic-design-tokens, text-hc-muted, text-hc-fg, text-hc-fg-strong, bg-hc-panel-mid, border-hc-panel-border]
key_files:
  created: []
  modified:
    - web/src/components/EventRow.jsx
    - web/src/components/Timeline.jsx
    - web/src/components/TopDevices.jsx
    - web/src/components/SceneGroup.jsx
    - web/src/components/EpisodeGroup.jsx
    - web/src/components/HeatmapLane.jsx
    - web/src/components/MonthlyHeatmap.jsx
    - web/src/components/RoomChart.jsx
    - web/src/components/WeekdayHeatmap.jsx
    - web/src/components/StaleDevicesPanel.jsx
    - web/src/components/FilterBar.jsx
    - web/src/components/HeatmapGrid.jsx
    - web/src/components/ActivityChart.jsx
    - web/src/components/TrendChart.jsx
    - web/src/components/ErrorBoundary.jsx
decisions:
  - "text-hc-muted used for all gray-300/400/500 muted text; text-hc-fg for gray-600/700; text-hc-fg-strong for gray-800/900"
  - "bg-hc-panel-mid replaces all bg-gray-50/100 backgrounds; border-hc-panel-border replaces border/divide-gray-100/200"
  - "FilterBar bg-white replaced with bg-hc-panel for theme-aware background"
metrics:
  duration: "~20 minutes"
  completed_date: "2026-04-15"
  tasks_completed: 2
  files_modified: 15
---

# Phase 17 Plan 03: Token Sweep for Remaining Components Summary

Replaced all hardcoded gray Tailwind classes in 15 component files with semantic design tokens, completing the THEME-02 sweep and satisfying CHART-03 for chart empty/error states.

## What Was Built

Token sweep across 15 component files (~60 hardcoded gray class instances replaced):

**Task 1 — Timeline and list components (5 files):**
- `EventRow.jsx`: hover:bg-hc-panel-mid, text-hc-fg-strong for names, text-hc-muted for secondary text/icons, bg-hc-panel-mid + border-hc-panel-border for before/after badge
- `Timeline.jsx`: text-hc-muted for loading/empty states, muted device banner, day headers; text-hc-fg for pagination
- `TopDevices.jsx`: text-hc-muted for counts/labels, hover:bg-hc-panel-mid for window buttons, bg-hc-panel-mid for progress bar track, text-hc-fg for device names
- `SceneGroup.jsx`: text-hc-fg-strong for scene title, text-hc-muted for metadata/chevrons, divide-hc-panel-border for expanded event list
- `EpisodeGroup.jsx`: text-hc-fg-strong for episode title, text-hc-fg for summary, text-hc-muted for metadata/time/chevrons

**Task 2 — Chart, heatmap, and utility components (10 files, CHART-03):**
- `ActivityChart.jsx`: text-hc-muted for empty state ("No activity in the last 30 days.") and caption ("last 30 days · local time") — CHART-03
- `TrendChart.jsx`: text-hc-muted for empty state ("No activity in the last {days} days.") — CHART-03
- `ErrorBoundary.jsx`: text-hc-fg for "Something went wrong", text-hc-muted for error message
- `FilterBar.jsx`: bg-hc-panel + border-hc-panel-border for container, text-hc-muted for disabled heatmap icon/label and search icon
- `HeatmapLane.jsx`: text-hc-muted for loading/empty states and axis labels
- `MonthlyHeatmap.jsx`: text-hc-muted for loading/empty states, hover tooltip text, caption
- `RoomChart.jsx`: text-hc-muted for empty state and count column, bg-hc-panel-mid for progress bar track
- `WeekdayHeatmap.jsx`: text-hc-muted for empty state, axis label, hover tooltip
- `StaleDevicesPanel.jsx`: text-hc-muted for loading/empty states and "heartbeat lagging" label
- `HeatmapGrid.jsx`: text-hc-muted for instruction hint text

## Deviations from Plan

### Missing Files (Non-blocking)

**1. [Rule 1 - Auto-noted] BridgeChildrenRow.jsx does not exist**
- **Found during:** Task 1 planning
- **Issue:** Plan listed `web/src/components/BridgeChildrenRow.jsx` as a file to sweep, but it does not exist in the codebase
- **Action:** Skipped — no file to modify
- **Impact:** Zero; plan's acceptance criteria are still fully met by the 15 existing files

**2. [Rule 1 - Auto-noted] RepairFlow.jsx does not exist**
- **Found during:** Task 1 planning
- **Issue:** Plan listed `web/src/components/RepairFlow.jsx` as a file to sweep, but it does not exist in the codebase
- **Action:** Skipped — no file to modify
- **Impact:** Zero; no gray classes introduced

### TrendChart Already Partially Tokenized

TrendChart.jsx window buttons were already using `text-hc-muted hover:text-hc-fg hover:bg-hc-panel-mid` from a prior plan. One remaining `text-gray-400` in the empty state was replaced.

## Known Stubs

None — all files contain real data wiring, no placeholders.

## Threat Flags

None — pure CSS class name changes, no security surface affected.

## Verification

- Total gray classes remaining across all 15 files: **0** (verified via grep)
- `text-hc-fg-muted` (invalid token): **0** occurrences
- `grep "text-hc-muted" ActivityChart.jsx | wc -l` → **2** (empty state + caption)
- `grep "text-hc-muted" TrendChart.jsx | wc -l` → **2** (empty state + window button label)
- All 87 web tests pass (16 test files, `npx vitest run`)

## Commits

- `78cbbc5`: feat(17-03): token sweep for timeline and list components (5 files)
- `d1cd6ec`: feat(17-03): token sweep for chart, heatmap, and utility components (10 files, CHART-03)

## Self-Check: PASSED

- All 15 modified files exist and have zero hardcoded gray classes
- Both commits verified in git log
- 87/87 tests passing
