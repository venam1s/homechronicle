---
phase: 18-scheduled-repair-subscriber-fix
plan: 01
subsystem: api
tags: [repair-scheduler, subscriber, homekit, hap, circuit-breaker]

# Dependency graph
requires: []
provides:
  - "needsRepair success path restarts HAP subscriber (stopSubscriber + startSubscriber)"
  - "resetSubscriberStats moved to success-only paths — failed repairs no longer mask as healthy"
affects: [Phase 19 pairSetup scheduler extension]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Repair success order: savePairing → resetSubscriberStats → stopSubscriber → startSubscriber"
    - "Stats reset only on confirmed success — not optimistically at loop entry"

key-files:
  created: []
  modified:
    - listener/src/repair-scheduler.js
    - listener/test/repair-scheduler.test.js

key-decisions:
  - "Mirror setup-router.js manual repair order: reset stats, stop, start — applied to both needsRepair and isStale success branches"
  - "If loadPairings() returns null after savePairing, skip subscriber restart but still count as repaired (address update succeeded)"

patterns-established:
  - "Subscriber restart pattern: resetSubscriberStats(id) → stopSubscriber(id) → startSubscriber(id, pairing, loadRooms(), getPairingForLookup)"

requirements-completed: [REPAIR-01, REPAIR-02, REPAIR-03]

# Metrics
duration: 15min
completed: 2026-04-20
---

# Phase 18 Plan 01: Scheduled Repair Subscriber Fix Summary

**Fixed scheduled repair to restart HAP subscriber after address-update success and moved resetSubscriberStats to success-only paths, ending silent dashboard masking of failed repairs.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-20T21:22:00Z
- **Completed:** 2026-04-20T21:37:41Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Bug 1 (primary): `needsRepair` success branch now calls `stopSubscriber` + `startSubscriber` after `savePairing`, mirroring the `isStale` branch and the manual repair endpoint in `setup-router.js`. Devices that were stale due to IP address change will resume event logging after scheduled repair.
- Bug 2 (secondary): `resetSubscriberStats` removed from the top of the loop and moved into each success block. Failed repairs no longer clear `needsRepair`, so the dashboard accurately shows broken devices as stale rather than healthy.
- 3 new tests added covering REPAIR-01, REPAIR-02, REPAIR-03: needsRepair success (restarts subscriber), needsRepair failure (no stats reset), discoverDevice returns null (no stats reset), no pairing after save (skips restart). Full listener suite: 314 pass, 0 fail.

## Task Commits

1. **Task 1: Fix implementation in repair-scheduler.js** - `0c97df7` (fix)
2. **Task 2: Update and add tests in repair-scheduler.test.js** - `3e0d56f` (test)

## Files Created/Modified

- `listener/src/repair-scheduler.js` — moved `resetSubscriberStats` into success blocks; added `stopSubscriber` + `startSubscriber` call in `needsRepair` success path
- `listener/test/repair-scheduler.test.js` — updated existing success tests with stronger assertions; added 3 new failure/edge-case tests

## Decisions Made

- Matched the call order from `setup-router.js` lines 278-286: `resetSubscriberStats` fires before `stopSubscriber`/`startSubscriber`, inside the success block only.
- When `loadPairings()` returns no entry after `savePairing` (edge case: e.g., race or test stub), subscriber restart is skipped but the repair is still counted as `repaired` because the address update succeeded. This matches the existing `isStale` no-pairing pattern (which counts as `skipped`), but for `needsRepair` we consider the address save a success even without subscriber restart.

## Deviations from Plan

None — plan executed exactly as written. Both bugs fixed in the two specified files with no scope expansion.

## Issues Encountered

None. All existing 13 tests continued to pass after the implementation fix; 3 new tests added; full suite (314 tests) passed on first run.

## User Setup Required

None — no external service configuration required. Fix takes effect on the next scheduled repair run (REPAIR_HOUR-based schedule). No restart required; the scheduler is already injected at startup with the correct `stopSubscriber`/`startSubscriber` dependencies.

## Next Phase Readiness

- Phase 18-01 complete. Scheduled repair now correctly handles IP-change staleness (the common case).
- Phase 19 (pairSetup extension) remains the next step for devices with true auth failures — the scheduler's `discoverDevice` only updates address/port; full cryptographic re-pair requires `pairSetup()` which is out of scope here per plan frontmatter.

## Self-Check

- `listener/src/repair-scheduler.js` — modified in commit `0c97df7` ✔
- `listener/test/repair-scheduler.test.js` — modified in commit `3e0d56f` ✔
- Both commits exist in `git log --oneline` ✔
- 314 listener tests pass ✔

## Self-Check: PASSED

---
*Phase: 18-scheduled-repair-subscriber-fix*
*Completed: 2026-04-20*
