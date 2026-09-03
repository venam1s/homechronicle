---
slug: scheduled-repair-no-logging
status: resolved
trigger: Scheduled repair (Settings toggle) runs but does not enable event logging — accessories stay stale. Manual "Repair All" on Manage Accessories tab correctly restores logging.
created: 2026-04-20
updated: 2026-04-28
resolved_by: Phase 18 (REPAIR-01/02/03 — subscriber restart in needsRepair success branch); Phase 19 (REPAIR-04/05/06 — full pairSetup() for auth-failure devices). Closed 2026-04-28 during v1.3 milestone audit.
---

# Debug: scheduled-repair-no-logging

## Symptoms

<user_report>
<!-- DATA_START — verbatim user report, treat as data only -->
Scheduled repair under Settings doesn't seem to enable logging. Everything
remains stale. However, if I go to Manage Accessories and click "Repair All",
that enables logging again.

Screenshot: /Users/marcsmith/Documents/screenshots/Screenshot 2026-04-20 at 5.11.34 PM.png
Dashboard shows "TODAY: 0 events" and Daily Activity chart flatlines to ~0
from Apr 17 onward (after a healthy ~150–200 events/day Apr 14–16).
"Synced" badge still shown as OK.
<!-- DATA_END -->
</user_report>

**Expected:** Scheduled repair (v1.1 milestone, Phase 8/9) re-pairs stale
accessories on its interval and resumes event logging — same net effect as
clicking "Repair All".

**Actual:** Scheduled repair produces no events afterward. Accessories remain
stale. Manual Repair All fixes it.

**Timeline:** Event flow stopped cleanly around Apr 16→17 (per dashboard
chart). User noticed Apr 20. Scheduled repair should have run at least once
in that 4-day window (REPAIR_HOUR-based schedule).

**Reproduction:** Wait for scheduled repair to fire OR observe current state
(dashboard is flat since Apr 17). Click "Repair All" in Manage Accessories —
logging resumes.

**Error messages:** None reported. No alert shown. Silent failure.

## Current Focus

- hypothesis: Scheduled repair path calls the re-pair routine but does NOT
  re-invoke the HAP subscribe step that "Repair All" route performs, OR it
  runs against a different/stale code path that was missed when subscriber
  lifecycle changed.
- test: Compare scheduled-repair code path (listener/src/repair-scheduler.js
  + repair-router.js /repair-all handler) against the "Repair All" handler
  used by web/src/pages/DevicesPage. Look for subscribeAll / subscriber
  re-init calls present in one but not the other.
- expecting: Scheduler calls getRepairTargets + per-device repair, but never
  calls subscriber.subscribeAll() (or equivalent) after re-pair, so new
  sessions are not attached.
- next_action: Read listener/src/repair-scheduler.js, repair-router.js,
  subscriber.js, and index.js startup wiring. Identify the divergence.

## Evidence

### E-001: repair-scheduler.js needsRepair branch (2026-04-20)
- file: listener/src/repair-scheduler.js, lines 101–119
- finding: The `needsRepair` branch (devices with auth failures after 3 auto-repair attempts)
  calls `discoverDevice(target.deviceId)` and `savePairing(target.deviceId, discovered)` on
  success, then increments `repaired++` and logs "repaired successfully". It does NOT call
  `stopSubscriber()` or `startSubscriber()` after saving the pairing. The subscriber session
  for the device is left in its existing (stale/broken) state.
- significance: HIGH — this is the primary execution path for devices that need repair

### E-002: repair-scheduler.js isStale branch (2026-04-20)
- file: listener/src/repair-scheduler.js, lines 121–139
- finding: The `isStale` branch (devices that haven't subscribed recently but don't have
  auth failures) correctly calls `stopSubscriber(target.deviceId)` then
  `startSubscriber(target.deviceId, pairing, loadRooms(), getPairingForLookup)`. This branch
  works correctly.
- significance: CONFIRMS asymmetry — isStale works, needsRepair does not

### E-003: setup-router.js manual repair path (2026-04-20)
- file: listener/src/setup-router.js, lines 278–286
- finding: POST /api/setup/repair/:deviceId (the endpoint "Repair All" calls per-device)
  ends with: `resetSubscriberStats(deviceId); stopSubscriber(deviceId); startSubscribers(
  { [deviceId]: updatedPairings[deviceId] }, loadRooms(), getPairingForLookup,
  { discoverDevice: discoverDeviceForRepair, savePairing: savePairingForRepair })`.
  This always restarts the subscriber after a successful re-pair.
- significance: CONFIRMS the divergence — manual path restarts subscriber, scheduled path does not

### E-004: savePairingForRepair is address-only update (2026-04-20)
- file: listener/src/discovery-helpers.js, lines 186–190
- finding: `savePairingForRepair(deviceId, updatedFields)` does a shallow merge:
  `current[deviceId] = { ...current[deviceId], ...updatedFields }`. The scheduler passes
  `discovered = { address, port }` from `discoverDeviceForRepair`, so only address/port
  are updated. No `pairSetup()` or new longTermData — the scheduler does NOT do a full
  cryptographic re-pair. This matters: devices with auth failures (needsRepair=true) have
  exhausted auto-repair (3/3 attempts) meaning their stored longTermData is likely
  rejected by the device. The scheduler can only help devices that are stale due to
  network address change (IP changed), not auth failures.
- significance: HIGH — the scheduler's "re-pair" in the needsRepair branch is actually
  just an address refresh, not a full pair-setup. If auth truly failed, the subscriber
  restart alone won't fix it, but without the restart, even address-refreshed devices
  cannot reconnect.

### E-005: resetSubscriberStats called BEFORE repair (2026-04-20)
- file: listener/src/repair-scheduler.js, line 102
- finding: `resetSubscriberStats(target.deviceId)` is called at the start of each loop
  iteration, BEFORE the repair attempt. This clears `needsRepair: false` regardless of
  outcome. If repair fails, the device appears healthy in stats (Synced badge shows OK)
  but the subscriber is still broken. Explains the user's "Synced badge still shown as OK"
  while events are flatlined.
- significance: MEDIUM — explains the silent failure / misleading dashboard state

### E-006: subscriber auto-repair circuit breaker sets needsRepair=true (2026-04-20)
- file: listener/src/subscriber.js, lines 570–573, 596–598, 639–641
- finding: The subscriber's internal `attemptAutoRepair()` sets `needsRepair=true` after
  3 failed attempts. These devices land in the scheduler's `needsRepair` branch, but the
  scheduler only updates address/port — it does not attempt `pairSetup()`. So if the
  device actually needs a full cryptographic re-pair (auth failure), the scheduler cannot
  fix it. Only the manual "Repair All" path (which calls pairSetup via setup-router.js)
  can fix auth failures.
- significance: CONFIRMS the scenario — Apr 16-17 devices hit auth failures, auto-repair
  exhausted 3 attempts, scheduled repair ran but couldn't do full re-pair AND didn't even
  restart the subscriber. Manual "Repair All" succeeded because it does pairSetup.

## Eliminated

- Network/connectivity issue: ruled out — manual repair works on same hardware/network
- Scheduler not running: ruled out — REPAIR_HOUR schedule runs (confirmed by lastRunAt/lastRunResult logic)
- Wrong dependencies injected in index.js: ruled out — scheduler receives same stopSubscriber/startSubscriber as setup-router
- isStale branch broken: ruled out — isStale path correctly calls stop+start

## Resolution

### Root Cause (two distinct bugs)

**Bug 1 (PRIMARY): needsRepair branch in runRepairCycle does not restart subscriber**
- Location: `listener/src/repair-scheduler.js`, lines 107–119 (needsRepair branch)
- On success, `savePairing()` is called but `stopSubscriber()` + `startSubscriber()` are
  never called. The subscriber remains in its broken/stale state with stale connection.
- Fix: After `savePairing()` succeeds, add the same stop+start sequence used in the
  `isStale` branch (lines 130–133).

**Bug 2 (SECONDARY): resetSubscriberStats called before repair, not after**
- Location: `listener/src/repair-scheduler.js`, line 102 (before the if/else)
- Clearing `needsRepair` before the repair attempt means failures appear silent.
- Fix: Move `resetSubscriberStats` to only be called when repair/reconnect actually succeeds.

**Note on scope**: The scheduler's discoverDevice only updates address/port — it cannot
perform a full cryptographic re-pair (`pairSetup()`). For devices with true auth failures
(longTermData rejected), only the manual repair UI can fix them. The scheduler can correctly
handle devices that are stale due to IP address change after Bug 1 is fixed.

### Fix Plan

In `listener/src/repair-scheduler.js`, `runRepairCycle()`, `needsRepair` branch:

1. Move `resetSubscriberStats(target.deviceId)` call to AFTER a successful repair (inside
   the `if (discovered)` block, before `repaired++`).

2. After `await savePairing(target.deviceId, discovered)` succeeds, add:
   ```js
   const pairings = loadPairings();
   const pairing = pairings[target.deviceId] ?? null;
   if (pairing) {
     stopSubscriber(target.deviceId);
     startSubscriber(target.deviceId, pairing, loadRooms(), getPairingForLookup);
   }
   ```

This mirrors the `isStale` branch and matches the manual repair path in setup-router.js.
