---
phase: 14-dashboard-widgets
plan: 02
subsystem: web-ui
tags: [react, dashboard, widgets, activity-feed, room-breakdown, tdd]
dependency_graph:
  requires: [14-01]
  provides: [ActivityFeed, RoomBreakdown]
  affects: [web/src/components/]
tech_stack:
  added: []
  patterns: [IntersectionObserver scroll-lock, room health badge derivation, bridge parent filter]
key_files:
  created:
    - web/src/components/ActivityFeed.jsx
    - web/src/components/ActivityFeed.test.jsx
    - web/src/components/RoomBreakdown.jsx
    - web/src/components/RoomBreakdown.test.jsx
  modified: []
decisions:
  - ActivityFeed scroll container placed directly inside Card (not Card.Body) to preserve edge-to-edge divide-y layout
  - IntersectionObserver mocked as a class (not vi.fn factory) to satisfy new constructor call
  - Test assertions for multi-occurrence counts use getAllByText to handle rooms with same device count
metrics:
  duration_minutes: 25
  completed_date: "2026-04-15"
  tasks_completed: 2
  files_created: 4
---

# Phase 14 Plan 02: ActivityFeed and RoomBreakdown Summary

ActivityFeed live event feed with IntersectionObserver scroll-lock and RoomBreakdown room health grid, both with full TDD test coverage.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 RED | ActivityFeed failing tests | f482543 | ActivityFeed.test.jsx |
| 1 GREEN | ActivityFeed implementation | 0ef4633 | ActivityFeed.jsx, ActivityFeed.test.jsx |
| 2 RED | RoomBreakdown failing tests | 6f13348 | RoomBreakdown.test.jsx |
| 2 GREEN | RoomBreakdown implementation | 357b87e | RoomBreakdown.jsx, RoomBreakdown.test.jsx |

## Decisions Made

- **ActivityFeed scroll container inside Card directly (not Card.Body):** Card.Body adds padding that would break the edge-to-edge `divide-y` divided list. The scroll `div` sits directly after `Card.Header` with the "New events" indicator below it with its own `px-4 pb-3` padding.
- **IntersectionObserver mock as class:** `vi.fn(() => ({...}))` creates a plain function, not a constructor, causing `TypeError: ... is not a constructor` when the component calls `new IntersectionObserver(...)`. Fixed by defining `class MockIntersectionObserver` and using `vi.stubGlobal` with the class.
- **getAllByText for multi-count assertions:** Both Living Room and Kitchen have 2 devices, both Bedroom and Unassigned have 1 device. Tests use `getAllByText(...).length > 0` rather than `getByText` to avoid "Found multiple elements" errors.

## TDD Gate Compliance

- Task 1 RED commit `f482543`: `test(14-02): add failing tests for ActivityFeed component` — tests failed due to missing component file
- Task 1 GREEN commit `0ef4633`: `feat(14-02): implement ActivityFeed component with scroll-lock` — all 5 tests pass
- Task 2 RED commit `6f13348`: `test(14-02): add failing tests for RoomBreakdown component` — tests failed due to missing component file
- Task 2 GREEN commit `357b87e`: `feat(14-02): implement RoomBreakdown component with health badges` — all 8 tests pass

## Verification

- `npx vitest run ActivityFeed` — 5/5 passed
- `npx vitest run RoomBreakdown` — 8/8 passed
- Full suite `npx vitest run` — 77/77 passed across 14 test files (no regressions)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] IntersectionObserver mock as class not factory function**
- **Found during:** Task 1 GREEN (first test run)
- **Issue:** Plan specified `vi.fn(() => ({observe, unobserve, disconnect}))` for the mock, but `new IntersectionObserver(...)` in the component requires a constructor, not a factory function. `vi.fn(impl)` makes the function callable but not `new`-able in this context.
- **Fix:** Replaced with `class MockIntersectionObserver { observe(el) { mockObserve(el); } ... }` passed to `vi.stubGlobal`
- **Files modified:** ActivityFeed.test.jsx
- **Commit:** 0ef4633

**2. [Rule 1 - Bug] Multi-element getByText assertions in RoomBreakdown tests**
- **Found during:** Task 2 GREEN (first test run)
- **Issue:** Test 2 used `getByText('2 devices')` and `getByText('1 device')` but both counts appear multiple times in the rendered output (Living Room=2, Kitchen=2; Bedroom=1, Unassigned=1).
- **Fix:** Changed both to `getAllByText(...).length > 0`
- **Files modified:** RoomBreakdown.test.jsx
- **Commit:** 357b87e

## Known Stubs

None — all data flows from live `useEvents({}, 1, 20)` and `useAccessories()` hooks.

## Threat Flags

None — both components are read-only displays of data from authenticated API endpoints. JSX auto-escaping handles all XSS risk. No new network endpoints or auth paths introduced.
