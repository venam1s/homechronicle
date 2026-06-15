---
phase: 26-member-self-serve-alerts
plan: 03
subsystem: listener
tags: [alerts, gate-removal, tdd, keystone, malert-07]
dependency_graph:
  requires: [26-02]
  provides: [processAlertsSafe-de-gated, isEmailEnabled-wired, health-router-cleaned]
  affects: [listener/src/subscriber.js, listener/src/index.js, listener/src/health-router.js]
tech_stack:
  added: []
  patterns: [monkeypatch-singleton-pool, __testHooks-test-seam, tdd-red-green]
key_files:
  created:
    - listener/test/alerts-processor-gate-removal.test.js
  modified:
    - listener/src/subscriber.js
    - listener/src/index.js
    - listener/src/health-router.js
    - listener/test/health-router.integration.test.js
decisions:
  - "D-10: Removed subscriber.js household gate (if (!isAlertsEnabled()) return), not alerts.js per-rule WHERE enabled = TRUE"
  - "D-09: Wired real isEmailEnabled into createAlertsRouter so SMTP-off rejection is live in production"
  - "T-26-HEALTH-STALE: Removed alertsEnabled from GET /api/health response (now-meaningless flag)"
  - "Test seam: monkeypatched db.js pool singleton (pool.query) since processAlertsSafe uses module-level pool, not a passed-in pool"
metrics:
  duration: "~15 min"
  completed: "2026-06-15"
  tasks_completed: 2
  files_changed: 5
---

# Phase 26 Plan 03: Remove Household Alerts Gate (MALERT-07 Server-Side) Summary

**One-liner:** Removed the `if (!isAlertsEnabled()) return` household master-toggle short-circuit from `processAlertsSafe` in subscriber.js, wired real `isEmailEnabled` into `createAlertsRouter`, and cleaned up related plumbing — verified by a behavioral TDD fire-test exercising the de-gated path.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Behavioral fire-test against de-gated processAlertsSafe | 5132557 | listener/test/alerts-processor-gate-removal.test.js |
| 2 (GREEN) | Remove household gate; expose processAlertsSafe; wire isEmailEnabled | 5a6965d | listener/src/subscriber.js, listener/src/index.js, listener/src/health-router.js, listener/test/health-router.integration.test.js |

## What Was Built

**Task 1 (RED) — Behavioral fire-test**
- `listener/test/alerts-processor-gate-removal.test.js` imports `__testHooks.processAlertsSafe` (undefined until Task 2 → TypeError → RED confirmed)
- Test 1 (MALERT-07): matching per-rule-ENABLED webhook rule fires via `processAlertsSafe` with no household enable plumbing
- Test 2 (D-02 regression guard): per-rule-DISABLED rule does NOT fire; mock enforces `WHERE enabled = TRUE` semantics — if the filter is absent the mock returns the disabled rule which would cause a delivery and trip the assertion

**Task 2 (GREEN) — Gate removal + plumbing cleanup**
- `subscriber.js`: removed `let isAlertsEnabled = () => false` binding + `setAlertsEnabledFn` setter + `if (!isAlertsEnabled()) return;` from `processAlertsSafe`; added `processAlertsSafe` to `__testHooks` export
- `index.js`: removed `setAlertsEnabledFn` import + wiring call; removed `alertsEnabled` key from `createHealthRouter` options; removed "Alerts feature disabled" startup log; wired `isEmailEnabled` into `createAlertsRouter({ pool, isEmailEnabled })` (D-09 now live in production)
- `health-router.js`: removed `alertsEnabled` param from factory signature + `alertsEnabled: alertsEnabled()` from GET /health response payload (T-26-HEALTH-STALE mitigated)
- `test/health-router.integration.test.js`: removed `alertsEnabled` from all 4 `createHealthRouter` calls + removed `jsonBody.alertsEnabled` assertion

## TDD Gate Compliance

- RED commit `5132557`: `test(26-03): add failing de-gated processAlertsSafe fire-test` — both tests failed with `TypeError: __testHooks.processAlertsSafe is not a function`
- GREEN commit `5a6965d`: `feat(26-03): remove household alerts gate; expose processAlertsSafe; wire isEmailEnabled` — 713/713 tests pass
- Gate sequence: test(26-03) → feat(26-03) (compliant)

## Verification

```
cd listener && npm test
713 tests, 0 failures
```

Acceptance criteria verified:
- subscriber.js no longer contains `if (!isAlertsEnabled()) return;`
- subscriber.js no longer defines `setAlertsEnabledFn` or `isAlertsEnabled` binding
- subscriber.js `__testHooks` export includes `processAlertsSafe`
- index.js no longer references `setAlertsEnabledFn` (call or import)
- index.js `createHealthRouter` options no longer contain `alertsEnabled` key
- index.js no longer logs `Alerts feature disabled`
- index.js `createAlertsRouter` call passes `isEmailEnabled`
- alerts.js still contains `WHERE enabled = TRUE` (per-rule filter intact)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Health-router needed both factory + response cleanup**
- **Found during:** Task 2
- **Issue:** Plan specified removing `alertsEnabled` from `createHealthRouter` options in index.js, but health-router.js itself still had `alertsEnabled` in its factory signature and used `alertsEnabled()` in the JSON response — leaving a dead function reference in the router and a stale field on the response (T-26-HEALTH-STALE threat register)
- **Fix:** Removed `alertsEnabled` from `createHealthRouter` factory signature + removed `alertsEnabled: alertsEnabled()` from the JSON response body; updated all 4 test invocations in health-router.integration.test.js to remove the now-gone param and assertion
- **Files modified:** listener/src/health-router.js, listener/test/health-router.integration.test.js
- **Commit:** 5a6965d (included in GREEN commit)

**Note on test seam decision:** `processAlertsSafe` uses the module-level `pool` singleton imported from `db.js` (not a passed-in pool parameter). The test monkeypatches `pool.query` on the exported object since it is a mutable instance. This requires no production code changes and matches how the function operates at runtime.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced. `alertsEnabled` removed from GET /api/health response (surface reduction, not expansion). T-26-HEALTH-STALE mitigated.

## Self-Check: PASSED

- listener/test/alerts-processor-gate-removal.test.js: FOUND
- .planning/phases/26-member-self-serve-alerts/26-03-SUMMARY.md: FOUND
- Commit 5132557 (RED): FOUND
- Commit 5a6965d (GREEN): FOUND
