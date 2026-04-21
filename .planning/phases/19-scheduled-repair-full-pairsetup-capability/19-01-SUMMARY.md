---
phase: 19-scheduled-repair-full-pairsetup-capability
plan: 01
subsystem: api
tags: [hap-controller, homekit, pairsetup, repair-scheduler, repair-helpers, node-test]

# Dependency graph
requires:
  - phase: 18-scheduled-repair-subscriber-fix
    provides: resetSubscriberStats on success-only and subscriber restart in needsRepair branch
provides:
  - performPairSetupAndPersist primitive in repair-helpers.js
  - full pairSetup() path in repair-scheduler.js needsRepair branch
  - no-PIN warn-skip path (REPAIR-05)
  - three new unit tests covering REPAIR-04/05/06
affects:
  - any phase that extends repair-scheduler.js or calls createRepairScheduler

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inject pre-wired closures into scheduler instead of raw constructor + store refs — collapses multi-dep surface to one callable"
    - "try/finally close pattern for HAP HttpClient (mirrors subscriber.js:609-611)"

key-files:
  created:
    - listener/src/repair-helpers.js
    - listener/test/repair-helpers.test.js
  modified:
    - listener/src/repair-scheduler.js
    - listener/src/index.js
    - listener/test/repair-scheduler.test.js

key-decisions:
  - "Inject performPairSetupAndPersist as a pre-wired 4-arg closure into the scheduler rather than threading HttpClient + savePairings — minimizes dep surface and matches existing discoverDevice injection pattern"
  - "no-PIN skip runs before discoverDevice to avoid unnecessary mDNS churn for unrecoverable devices"
  - "setup-router.js left entirely untouched — manual Repair All contract preserved byte-identical"

patterns-established:
  - "repair-helpers.js: HAP pairSetup helpers with no internal I/O — all filesystem/network access via injected deps"
  - "repair-scheduler.js needsRepair: PIN check → discover → pairSetup → reset stats → restart subscriber"

requirements-completed: [REPAIR-04, REPAIR-05, REPAIR-06]

# Metrics
duration: 8min
completed: 2026-04-21
---

# Phase 19 Plan 01: Scheduled Repair Full pairSetup Capability Summary

**Scheduled repair now fully re-pairs auth-failure devices via pairSetup() using stored PIN, with warn-skip for devices lacking a PIN — all without touching setup-router.js**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-21T12:25:33Z
- **Completed:** 2026-04-21T12:33:41Z
- **Tasks:** 2
- **Files modified:** 4 (+ 2 created)

## Accomplishments

- Extracted `performPairSetupAndPersist` into `listener/src/repair-helpers.js` — pure pair-and-persist primitive with try/finally close, all collaborators injected, returns `{ longTermData, pairing }`
- Extended `repair-scheduler.js` needsRepair branch: PIN gate (warn + skip, not failed), then discover → pairSetup → reset stats → restart subscriber on success; failure leaves needsRepair true
- Wired `performPairSetupAndPersist` pre-wired closure into `index.js` `createRepairScheduler` call
- Added 3 tests (A/B/C) for helper and 3 tests (D/E/F) for scheduler; updated 5 existing tests to add PIN to loadPairings mocks and replace `_savePairingCalls` assertions with `_performPairSetupCalls`
- Full suite: 320 tests (previously 317), all pass; setup-router.js and subscriber.js unchanged

## Task Commits

TDD tasks — two commits per task (RED then GREEN):

1. **Task 1 RED: repair-helpers tests** — `8ad609b` (test)
2. **Task 1 GREEN: repair-helpers.js implementation** — `2e915f2` (feat)
3. **Task 2 RED: scheduler + updated test file** — `64cf6b2` (test)
4. **Task 2 GREEN: repair-scheduler.js + index.js wiring** — `107c008` (feat)

**Plan metadata:** _(docs commit below)_

_Note: TDD tasks have two commits each (test → feat)_

## Files Created/Modified

- `listener/src/repair-helpers.js` — New: `performPairSetupAndPersist({ deviceId, pin, address, port }, { HttpClient, loadPairings, savePairings })`
- `listener/test/repair-helpers.test.js` — New: 3 tests (success, pairSetup throws, existing fields preserved)
- `listener/src/repair-scheduler.js` — Extended: `performPairSetupAndPersist` dep added; needsRepair branch now does PIN check + full pairSetup path
- `listener/src/index.js` — Extended: import + pre-wired closure injected into `createRepairScheduler`
- `listener/test/repair-scheduler.test.js` — Extended: 3 new tests (D/E/F) + updated 5 existing tests (pin added to mocks, `_savePairingCalls` → `_performPairSetupCalls`)

## Decisions Made

- **Injected pre-wired closure, not raw constructor:** `performPairSetupAndPersist` is injected as a single 4-arg callable rather than threading `HttpClient` + `savePairings` through the scheduler. Matches the existing `discoverDevice` closure pattern and keeps the scheduler dependency surface minimal.
- **PIN gate runs before discoverDevice:** Avoids unnecessary mDNS network traffic for devices that cannot be recovered without manual intervention.
- **setup-router.js untouched:** No refactor of the inline pairSetup logic in the manual repair path — zero risk of changing manual Repair All response contract.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Updated 5 existing scheduler tests broken by no-PIN gate**

- **Found during:** Task 2 (pre-implementation analysis and advisor call)
- **Issue:** The no-PIN guard runs before `discoverDevice`. Five existing tests used `loadPairings: () => ({})` or pairings without a `pin` field, causing them to hit the skip path instead of their intended test flow. Also, the existing `_savePairingCalls` assertion in the needsRepair success test needed to become `_performPairSetupCalls`.
- **Fix:** Added `pin: 'test-pin'` to `loadPairings` mocks in all 5 affected tests; updated `_savePairingCalls.length === 1` assertion to `_performPairSetupCalls.length === 1`; redesigned the "no pairing after save" test to return pin on first `loadPairings()` call and empty on the second
- **Files modified:** `listener/test/repair-scheduler.test.js`
- **Verification:** All 320 tests pass
- **Committed in:** `64cf6b2` (Task 2 RED commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 — test correctness required by new gate)
**Impact on plan:** Necessary for test suite correctness. No scope creep — only assertions changed, not behavior contracts.

## Issues Encountered

None beyond the test update analysis noted above.

## Known Stubs

None — all code paths are fully wired.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced. `repair-helpers.js` uses the same `HttpClient` pairSetup primitive already present in `setup-router.js` and `subscriber.js`.

## Self-Check

Files created/modified:
- `listener/src/repair-helpers.js` — FOUND
- `listener/test/repair-helpers.test.js` — FOUND
- `listener/src/repair-scheduler.js` — FOUND
- `listener/src/index.js` — FOUND
- `listener/test/repair-scheduler.test.js` — FOUND

Commits:
- `8ad609b` — FOUND (test RED)
- `2e915f2` — FOUND (feat GREEN)
- `64cf6b2` — FOUND (test RED)
- `107c008` — FOUND (feat GREEN)

Test suite: 320 tests, 0 failures
`git diff listener/src/setup-router.js` — empty
`git diff listener/src/subscriber.js` — empty

## Self-Check: PASSED

## Next Phase Readiness

- Phase 19 complete. Scheduled repair now autonomously recovers auth-failure devices with a stored PIN on each daily cycle.
- Devices without a stored PIN are logged once per cycle and tracked as `skipped` (not `failed`), directing users to the manual Repair All UI.
- No follow-on phases planned in this milestone.

---
*Phase: 19-scheduled-repair-full-pairsetup-capability*
*Completed: 2026-04-21*
