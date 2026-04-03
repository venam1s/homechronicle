---
phase: 08-scheduled-repair-backend
plan: 01
subsystem: listener
tags: [scheduled-repair, subscriber, homekit, scheduler, tdd]
dependency_graph:
  requires: []
  provides:
    - getRepairTargets() export from subscriber.js
    - createRepairScheduler factory in repair-scheduler.js
    - msUntilHour helper in repair-scheduler.js
  affects:
    - listener/src/subscriber.js
tech_stack:
  added: []
  patterns:
    - setTimeout chain scheduling (drift-free daily repair)
    - Factory function pattern (createRepairScheduler)
    - finally-block persistence for lastRunAt/lastRunResult
    - Module-level running guard for concurrency protection
key_files:
  created:
    - listener/src/repair-scheduler.js
    - listener/test/repair-scheduler.test.js
  modified:
    - listener/src/subscriber.js
decisions:
  - getRepairTargets uses session.pairing?.name ?? session.pairingName ?? deviceId for display name fallback
  - running = false placed in nested finally inside outer finally to ensure saveSettings always completes first
  - msUntilHour exported for testability (pure function, easy to unit-test with mocked Date)
metrics:
  duration: ~38 min
  completed: "2026-04-03T15:38:33Z"
  tasks_completed: 2
  files_created: 2
  files_modified: 1
---

# Phase 08 Plan 01: Repair Scheduler Core Summary

**One-liner:** `getRepairTargets()` export added to subscriber.js plus `createRepairScheduler` factory implementing setTimeout-chain daily repair with two paths (re-pair and reconnect), concurrency guard, and `lastRunResult` persistence.

## What Was Built

### Task 1: getRepairTargets() export (subscriber.js)

New exported function placed between `getSubscriberHealth()` and `resetSubscriberStats()`. Iterates the module-private `subscriberSessions` Map and returns an array of devices that need repair attention:

- `needsRepair === true` devices (circuit breaker exhausted)
- `isStale` devices (no subscribe success in `staleThresholdMs`, default 10 min)

Returns `Array<{ deviceId, pairingName, needsRepair, isStale }>`. Default threshold matches `getSubscriberHealth()` (10 * 60_000).

### Task 2: repair-scheduler.js (TDD)

Factory module `createRepairScheduler({ getSettings, saveSettings, getRepairTargets, discoverDevice, savePairing, stopSubscriber, startSubscriber, resetSubscriberStats, loadPairings, loadRooms, getPairingForLookup })` returns `{ start, stop, runRepairCycle }`.

**Key behaviors:**
- `start()`: reads settings, skips if `enabled === false`, otherwise calls `scheduleNext(hour)`
- `scheduleNext(hour)`: calculates ms until target hour via `msUntilHour()`, logs schedule message, chains to next day after cycle completes
- `stop()`: `clearTimeout(scheduledTimeout)` — no drift, clean teardown
- `runRepairCycle()`: concurrent-run guard (`let running = false`), two repair paths:
  - `needsRepair` path: `resetSubscriberStats` → `discoverDevice` → `savePairing`
  - `isStale` path: `resetSubscriberStats` → `stopSubscriber` → `startSubscriber`
- `finally` block persists `lastRunAt` and `lastRunResult` unconditionally (even on error)

**Logging:** 12 log lines with `[repair]` tag, per D-09 requirement.

## Test Coverage

All 13 unit tests pass:
- `msUntilHour` with target hour ahead today (~1h)
- `msUntilHour` with target hour already past (~23h next-day)
- `start()` no-op when disabled
- `start()` calls setTimeout when enabled
- `stop()` calls clearTimeout
- `runRepairCycle()` with 0 targets
- `runRepairCycle()` needsRepair path (discoverDevice + savePairing)
- `runRepairCycle()` stale-only path (stopSubscriber + startSubscriber)
- Summary log line with correct counts
- Per-device log lines
- lastRunAt/lastRunResult persistence
- Concurrent-run guard (second call logs warning)
- Error handling (lastRunResult persists even when repair throws)

Full suite: 292 listener tests pass, 0 regressions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed running guard timing with nested finally**
- **Found during:** Task 2 GREEN phase (1 of 13 tests failing)
- **Issue:** Original finally block had `running = false` before `await saveSettings(...)`. This caused the concurrency guard test to fail — by the time the second `runRepairCycle()` call ran, `running` was already reset to `false` because the outer `finally` ran `running = false` synchronously before awaiting `saveSettings`.
- **Fix:** Wrapped `saveSettings` call in its own inner `try/finally` block, with `running = false` in the inner finally. This ensures `running` stays `true` for the full duration of the cycle including settings persistence.
- **Files modified:** `listener/src/repair-scheduler.js`
- **Commit:** c25e6aa

## Self-Check

### Files exist

- `listener/src/repair-scheduler.js` — present
- `listener/src/subscriber.js` — modified with getRepairTargets
- `listener/test/repair-scheduler.test.js` — present

### Commits exist

- 311fa65 — feat(08-01): add getRepairTargets() export to subscriber.js
- fc019ea — test(08-01): add failing tests for repair-scheduler
- c25e6aa — feat(08-01): implement repair-scheduler.js with full repair cycle

## Self-Check: PASSED
