---
phase: 03-count-optimization
plan: 01
subsystem: listener/api
tags: [performance, postgresql, tdd, events-router]
dependency_graph:
  requires: []
  provides: [reltuples-count-optimization]
  affects: [listener/src/events-router.js]
tech_stack:
  added: []
  patterns: [pg_class reltuples estimation, conditional COUNT branch]
key_files:
  created: []
  modified:
    - listener/src/events-router.js
    - listener/test/events-router.integration.test.js
decisions:
  - id: D-01
    summary: Only the unfiltered /api/events COUNT is replaced with reltuples; all other COUNT queries remain exact
  - id: D-02
    summary: conditions.length === 0 is the branch point distinguishing unfiltered from filtered requests
  - id: D-03
    summary: estimated boolean always present in response (false for exact, true for reltuples)
  - id: D-04
    summary: Direct pg_class query with no caching layer added
  - id: D-05
    summary: reltuples <= 0 triggers fallback to exact COUNT (fresh install or post-TRUNCATE)
metrics:
  duration_minutes: 3
  completed_date: "2026-04-02"
  tasks_completed: 2
  files_modified: 2
requirements_addressed: [PERF-01, PERF-02, PERF-03]
---

# Phase 03 Plan 01: Count Optimization Summary

**One-liner:** Replaced full-table COUNT(*) with sub-millisecond pg_class.reltuples lookup for unfiltered /api/events pagination, with exact COUNT fallback for filtered queries and fresh installs.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write failing tests for reltuples branch (RED) | 9a14220 | listener/test/events-router.integration.test.js |
| 2 | Implement reltuples branch in GET /events handler (GREEN) | 4d4d879 | listener/src/events-router.js |

## What Was Built

The GET /events handler in `events-router.js` now uses a conditional count strategy:

- **Unfiltered requests** (no room/accessory/characteristic/from/to params): queries `pg_class.reltuples` for a sub-millisecond estimate. Returns `estimated: true`.
- **Unfiltered with reltuples <= 0** (fresh install, post-TRUNCATE): falls back to exact `COUNT(*)`. Returns `estimated: false`.
- **Filtered requests** (any filter param applied): uses exact `COUNT(*) WHERE ...`. Returns `estimated: false`.

The `estimated` boolean is always present in the `/api/events` response body. No frontend changes are required — the field is additive and backward compatible.

## Test Coverage

4 new integration tests were added:

1. `unfiltered /api/events uses reltuples estimate` — verifies estimated: true, total from pg_class
2. `reltuples zero falls back to exact COUNT` — verifies estimated: false, total from COUNT
3. `reltuples negative falls back to exact COUNT` — verifies estimated: false, total from COUNT
4. `filtered /api/events uses exact COUNT` — verifies estimated: false, pg_class never queried

The existing `orders by timestamp and id descending` test mock was updated to handle the new pg_class branch without changing its assertions.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- listener/src/events-router.js: FOUND
- listener/test/events-router.integration.test.js: FOUND
- Commit 9a14220 (test RED): FOUND
- Commit 4d4d879 (feat GREEN): FOUND
