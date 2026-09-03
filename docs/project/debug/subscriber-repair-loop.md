---
slug: subscriber-repair-loop
status: resolved
trigger: |
  Production listener CPU pegged at 100%. Two devices (Winix Purifier 9F54, Neakasa 9B45)
  are looping through HAP pairSetup every 60s indefinitely after they begin chronically
  failing M4 auth. Each loop runs SRP-6a + Curve25519 + ChaCha20-Poly1305 + Ed25519,
  which is CPU-expensive enough to peg a core.
created: 2026-05-15T19:29:31Z
updated: 2026-05-15T20:15:00Z
---

# Debug Session: subscriber-repair-loop

## Symptoms

- **expected_behavior**: After auth failures and a successful auto re-pair, the subscriber
  should resume normal subscription (`connectAccessoryImpl`) and stop running the pair
  flow until the next genuine failure. The 3-attempt circuit breaker (`autoRepairAttempts >= 3`)
  should terminally mark `needsRepair = true` if recovery never works.
- **actual_behavior**: Two devices succeed at auto re-pair, then re-run the entire pair
  flow exactly 60 seconds later — repeating forever. CPU stays pegged at 100% on the
  listener container.
- **error_messages**:
  - `Winix Purifier 9F54: resubscribe auth failed (1/3): M4: Error: 2`
  - `Winix Purifier 9F54: getAccessories auth failed (2/3): M4: Error: 2`
  - `Winix Purifier 9F54: authentication failed 3 times, attempting auto re-pair…`
  - `Winix Purifier 9F54: attempting auto re-pair (attempt 1/3)…`
  - `Winix Purifier 9F54: auto re-paired successfully`
  - `Winix Purifier 9F54: retrying auto re-pair in 60s…`  ← always logged on success
  - The above five lines repeat every 60s for both Winix 9F54 and Neakasa 9B45
- **timeline**: Bug introduced 2026-03-24 in commit `4653afa` (`fix(subscriber): … schedule
  re-pair retries`). Latent until the two devices began chronically failing M4 auth on
  this deployment (observable since at least 2026-05-15 17:59 UTC in current logs).
- **reproduction**: Any pairing whose stored long-term keys cannot complete an HAP secure
  session (M4 Error 2 = invalid signature) will trigger the loop after 3 auth failures —
  pair-setup completes, keys persist, but the next normal subscription still M4-fails,
  re-triggering the path. The 60s retry runs even when the pair-setup itself succeeded.

## Hypothesis Ledger

### Current Focus

- **hypothesis**: The `finally` block in `attemptAutoRepair()`
  (`listener/src/subscriber.js`) schedules the 60s retry whenever
  `autoRepairAttempts < 3` is true. On the success path the function explicitly resets
  `stats.autoRepairAttempts = 0`, so the guard becomes trivially true and a
  retry timer is always scheduled — defeating the circuit breaker on the success path.
- **status**: CONFIRMED AND FIXED

### Eliminated

(none — root cause was highly localized; alternates not investigated)

## Evidence

- timestamp: 2026-05-15T17:59:14Z — listener boot, scheduled repair set for 7:00 local
  ("Next scheduled repair in 1021 min"). Repair-scheduler is **not** the culprit — the
  loop runs every 60s, not at the scheduled hour.
- timestamp: 2026-05-15T18:07:18Z — first auto re-pair for Winix 9F54 after M4 Error 2,
  succeeds, logs "retrying auto re-pair in 60s…"
- timestamp: 2026-05-15T18:08:18Z–18:16:00Z+ — same pair-setup sequence repeats every
  60s for both Winix 9F54 and Neakasa 9B45. No further M4 failures logged in between
  retries (the retries themselves succeed); the loop is self-sustaining from the success
  path alone.
- file: `listener/src/subscriber.js` — `attemptAutoRepair()` source. Lines resetting
  counters on success; finally block scheduling retry whenever counters are below
  threshold. No `succeeded` flag distinguished the two paths.
- git: introduced in `4653afa` (2026-03-24) "fix(subscriber): … schedule re-pair retries".
  Prior to this commit the retry block did not exist.

## Reasoning Checkpoint

The bug is a logic error in the `finally` block. After a successful repair:
1. `stats.autoRepairAttempts` is reset to `0`
2. The `finally` guard `!stats.needsRepair && stats.autoRepairAttempts < 3` evaluates to
   `true && 0 < 3 = true`
3. A 60s retry is scheduled, even though `connectAccessoryImpl` has already resumed the
   normal subscription

Fix: declare `let succeeded = false;` before the try block. Set `succeeded = true;`
immediately after `connectAccessoryImpl(session, updatedPairing)` on the success path.
Gate the retry in finally on `!succeeded && !stats.needsRepair && stats.autoRepairAttempts < 3`.

Also added `httpClientFactory` (overrideable in tests) so the success path of
`attemptAutoRepair` can be unit-tested without real HAP network connections.

## TDD Checkpoint

TDD mode disabled. Two regression tests added to `listener/test/subscriber.reconnect.test.js`:
- `attemptAutoRepair does NOT schedule a 60s retry when pair-setup succeeds` — verifies
  `session.reconnectTimeout === null` after successful repair (catches the bug)
- `attemptAutoRepair DOES schedule a 60s retry when pair-setup fails (failure path unchanged)` —
  verifies `session.reconnectTimeout !== null` on failure with attempts < 3 (guards regression)

All 343 listener tests pass after the fix.

## Resolution

- **root_cause**: `attemptAutoRepair()` `finally` block unconditionally scheduled a 60s
  retry whenever `autoRepairAttempts < 3`. On the success path, resetting
  `autoRepairAttempts` to `0` made this guard trivially true, causing an infinite loop
  even after successful pair-setup. Introduced in commit `4653afa` (2026-03-24).
- **fix**: Added `let succeeded = false;` before the try block. Set `succeeded = true;`
  after `connectAccessoryImpl()` on the success path. Changed the `finally` retry guard
  to `!succeeded && !stats.needsRepair && stats.autoRepairAttempts < 3`. Also extracted
  `HttpClient` construction into an overrideable `httpClientFactory` for testability.
- **files_changed**:
  - `listener/src/subscriber.js` — success-path gate + httpClientFactory injection hook
  - `listener/test/subscriber.reconnect.test.js` — two regression tests added
- **tests**: 343 pass, 0 fail (was 341 before this session; +2 regression tests)
- **follow_up** (out of scope for this session):
  - Pet Feeder 052C is in a 70s ECONNREFUSED reconnect loop — the device appears to have
    been removed from the bridge. Remove the pairing manually to stop the noise.
  - Winix 9F54 and Neakasa 9B45 will eventually hit the 3-attempt cap and be marked
    `needsRepair = true` (intended behavior — their stored long-term keys are permanently
    invalid). Manually re-pair both devices with fresh PINs via the Apple Home app.
