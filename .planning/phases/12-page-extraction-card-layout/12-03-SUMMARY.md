---
phase: 12-page-extraction-card-layout
plan: 03
subsystem: ui
tags: [react, card-layout, page-headers, timeline, settings]

# Dependency graph
requires:
  - Card compound component (12-01)
provides:
  - Timeline page with Card-wrapped FilterBar and episode groups
  - Settings page with 4 Card sections (About, Scheduled Repair, Data Management, Toast Notifications)
affects:
  - web/src/pages/TimelinePage.jsx
  - web/src/components/Timeline.jsx
  - web/src/pages/SettingsPage.jsx
  - web/src/components/setup/SettingsTab.jsx

# Tech stack
added: []
patterns:
  - Card compound component wrapping existing content sections
  - Page header pattern with text-hc-page-title typography token

# Key files
created: []
modified:
  - web/src/pages/TimelinePage.jsx
  - web/src/components/Timeline.jsx
  - web/src/pages/SettingsPage.jsx
  - web/src/components/setup/SettingsTab.jsx
  - web/src/components/setup/SettingsTab.test.jsx

# Decisions
key-decisions:
  - "Kept Data & Retention items contiguous in Data Management Card rather than reordering JSX to include Advanced/Danger Zone (which sit after Toast section in the file)"
  - "Fixed pre-existing test failure in SettingsTab.test.jsx where getRepairCard() used bg-white selector (already bg-hc-panel in source)"

# Metrics
duration: 3m
completed: 2026-04-15T00:58:00Z
---

# Phase 12 Plan 03: Card Layout for Timeline and Settings Summary

Card-wrapped FilterBar and individual episode groups in Timeline, plus 4 Card sections in SettingsTab (About, Scheduled Repair, Data Management, Toast Notifications) with page headers on both pages.

## Task Results

### Task 1: TimelinePage + Timeline.jsx
- **TimelinePage.jsx**: Added page header with "Timeline" title and "Filter and browse device events" subtitle. Took over the outer `flex flex-col h-full` layout so header sits above Timeline.
- **Timeline.jsx**: 
  - Added Card import
  - Wrapped FilterBar in `<Card><Card.Body compact>` 
  - Replaced `bg-white rounded-xl shadow-sm divide-y divide-gray-100` day-group wrapper with individual `<Card><Card.Body>` wraps per episode/scene group using `space-y-3` spacing
  - Changed root div from `h-full` to `flex-1 min-h-0` so it fills remaining space below page header
  - Zero `bg-white rounded-xl` remaining
  - `flex-1 overflow-y-auto` scroll container preserved
- **Commit**: ff09605

### Task 2: SettingsPage + SettingsTab.jsx
- **SettingsPage.jsx**: Added page header with "Settings" title (no subtitle per UI-SPEC)
- **SettingsTab.jsx**: Added Card import and wrapped 4 sections:
  1. "About" Card (was Help & Links heading) -- links to docs and issue tracker
  2. "Scheduled Repair" Card -- repair toggle, hour picker, last-run status
  3. "Data Management" Card (was Data & Retention heading) -- retention cutoff, archive toggle, stale threshold, episode settings
  4. "Toast Notifications" Card (was Appearance heading) -- toast enabled, live event toasts, position, duration, max visible
- Danger zone `<section className="border border-hc-danger-border...">` preserved as-is
- Auto-save mechanism untouched
- **Commit**: 462f062

### Task 3: Visual verification (checkpoint)
- Task 3 is a human-verify checkpoint. Visual verification is pending human approval.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pre-existing test selector in SettingsTab.test.jsx**
- **Found during:** Task 1
- **Issue:** `getRepairCard()` used `closest('div.bg-white, div[class*="bg-white"]')` but the component already used `bg-hc-panel` classes, causing 3 test failures
- **Fix:** Updated selector to `closest('div[class*="bg-hc-panel"]')`
- **Files modified:** web/src/components/setup/SettingsTab.test.jsx
- **Commit:** ff09605

## Verification

- `cd web && npx vitest run` -- 50/50 tests pass
- Zero `bg-white rounded-xl` in Timeline.jsx
- 4 Card.Header instances in SettingsTab.jsx (About, Scheduled Repair, Data Management, Toast Notifications)
- `border-hc-danger-border` preserved in SettingsTab.jsx
- `flex-1 overflow-y-auto` scroll container preserved in Timeline.jsx

## Self-Check: PASSED
