---
phase: 08-scheduled-repair-backend
plan: 02
subsystem: listener
tags: [scheduled-repair, repair-router, index-wiring, api]
dependency_graph:
  requires:
    - 08-01 (repair-scheduler.js, getRepairTargets from subscriber.js)
  provides:
    - GET /api/setup/repair — returns repair settings from repairStore
    - PATCH /api/setup/repair — validates and saves enabled/hour, triggers scheduler restart
    - repairStore persistence at /app/data/repair.json (or ./data/repair.json in dev)
    - repairScheduler wired into listener startup
  affects:
    - listener/src/index.js
tech_stack:
  added: []
  patterns:
    - Factory function router pattern (createRepairRouter follows retention-router.js)
    - JsonObjectStore for settings persistence
    - onSettingsChange callback for scheduler lifecycle management
key_files:
  created:
    - listener/src/repair-router.js
    - listener/test/repair-router.integration.test.js
  modified:
    - listener/src/index.js
decisions:
  - onSettingsChange always calls stop() before conditional start() to handle hour changes as well as enable/disable
  - parseIntInRange added to utils.js import in index.js for REPAIR_HOUR_DEFAULT
  - startSubscriber added to subscriber.js import (was missing — needed by repairScheduler)
metrics:
  duration: ~4 min
  completed: "2026-04-03T15:44:24Z"
  tasks_completed: 2
  files_created: 2
  files_modified: 1
---

# Phase 08 Plan 02: Repair Router and Index Wiring Summary

**One-liner:** `repair-router.js` factory with GET/PATCH `/api/setup/repair` endpoints wired into `index.js` alongside `repairStore` (JsonObjectStore persistence) and `repairScheduler` startup, completing the v1.1 scheduled repair backend.

## What Was Built

### Task 1: repair-router.js with integration tests

New `createRepairRouter({ getSettings, saveSettings, onSettingsChange })` factory following the `retention-router.js` pattern exactly:

- `GET /repair` — returns `getSettings()` snapshot as JSON
- `PATCH /repair` — validates `enabled` (boolean) and `hour` (integer 0-23), merges with current settings, calls `saveSettings`, invokes `onSettingsChange(next)`, logs with `[repair]` tag
- Write rate limiter: 10 requests/minute via `express-rate-limit`
- All errors use `[repair]` log tag and return `{ error: string }` JSON

10 integration tests cover: GET 200, PATCH valid enabled, PATCH valid hour, PATCH both fields, invalid enabled type (400), hour out of range high (400), hour out of range negative (400), empty body (400), `onSettingsChange` callback invoked, settings round-trip.

### Task 2: index.js wiring

Seven targeted additions to `listener/src/index.js` (~41 lines):

1. **Import additions:** `parseIntInRange` added to utils.js import; `startSubscriber` + `getRepairTargets` added to subscriber.js import; `createRepairScheduler` and `createRepairRouter` imported as new lines
2. **Constants:** `REPAIR_FILE` (env override with dev/prod paths), `REPAIR_HOUR_DEFAULT` via `parseIntInRange(process.env.REPAIR_HOUR, 3, 0, 23)`
3. **Store instantiation:** `repairStore = new JsonObjectStore(REPAIR_FILE, { enabled: false, hour: REPAIR_HOUR_DEFAULT, lastRunAt: null, lastRunResult: null })`
4. **Store init:** `await repairStore.init()` after `retentionStore.init()`
5. **Store refresh:** `repairStore.refresh()` inside `STORE_REFRESH_INTERVAL` setInterval block
6. **Scheduler creation:** `createRepairScheduler({...})` with all callbacks after `startSubscribers()`; `repairScheduler.start()` immediately follows
7. **Router mount:** `app.use('/api/setup', createRepairRouter({...}))` after `createRetentionRouter`, with `onSettingsChange` that calls `repairScheduler.stop()` then conditional `repairScheduler.start()`

## Test Coverage

All 302 listener tests pass (0 regressions). The 10 new repair-router integration tests cover all validation paths and the critical `onSettingsChange` callback behavior.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

### Files exist

- `listener/src/repair-router.js` — present
- `listener/test/repair-router.integration.test.js` — present
- `listener/src/index.js` — modified with all 7 insertion points

### Commits exist

- 36bf098 — feat(08-02): add repair-router.js with GET/PATCH /repair endpoints and integration tests
- d7d298a — feat(08-02): wire repairStore, repairScheduler, and repairRouter into index.js

## Self-Check: PASSED
