# Auto Re-pair and Auth Failure Detection

## Problem

When a HomeKit accessory loses its pairing record (typically after a Homebridge restart with a wiped `persist/` directory), HomeChronicle's subscriber enters an infinite retry loop logging `M4: Error: 2` every 60 seconds for every affected device. The user has no indication in the UI that re-pairing is needed, and event recording stops silently.

## Goals

1. Detect permanent authentication failures and stop the retry loop
2. Attempt automatic re-pairing using a stored PIN before giving up
3. Surface "needs re-pairing" status in the API and UI when auto-re-pair isn't possible
4. Store the PIN server-side (in `pairings.json`) so unattended recovery works

## Non-goals

- Moving pairing data to a database (`devices` table) — roadmap item, separate project
- Changing the existing exponential backoff for transient errors (timeouts, network issues)
- UI changes to the Manage tab beyond surfacing the status (no new pairing workflows)

## Security consideration: PIN storage

HomeKit PINs are static, printed-on-device secrets (format `111-22-333`). This design stores them in plaintext in `pairings.json`, which already contains the far more sensitive Ed25519 long-term keys (`longTermData`). The file is written with `0o600` permissions and lives on a Docker volume at `/app/data/`.

The PIN is less sensitive than `longTermData` (keys grant full accessory control; the PIN only allows initial pairing). Anyone with filesystem access to the Docker volume already has the keys. Storing the PIN alongside them does not meaningfully increase the attack surface.

Users who prefer not to store PINs can simply skip providing one — auto-re-pair will be unavailable for those devices, falling back to manual re-pair via the UI.

## Design

### Flow

```
Auth failure detected (M4: Error: 2 or M2: Signature verification failed)
  → Retry up to 3 times with existing exponential backoff
  → Still failing? Mark session as authFailed = true, stop retry loop
  → If session.repairing already true: skip (prevent concurrent re-pair)
  → If stats.autoRepairAttempts >= 3: mark needsRepair, stop (circuit breaker)
  → If PIN stored in pairing record:
      → Set session.repairing = true
      → Request mDNS discovery from index.js via callback
      → Attempt pairSetup(pin) with discovered address/port
      → Set session.repairing = false
      → On success:
          → Save new longTermData to pairings.json (preserve PIN and other fields)
          → Create new HttpClient with new longTermData
          → Reset auth failure counters, resume normal subscriber flow
          → Log: "[subscriber] DeviceName: auto re-paired successfully"
      → On failure (wrong PIN, max peers, device not found, etc.):
          → Increment autoRepairAttempts
          → Log the failure reason
          → If autoRepairAttempts >= 3: mark needsRepair
          → Otherwise: wait 60s and retry auto-re-pair
  → If no PIN stored:
      → Mark as needsRepair in session stats
      → Log once: "[subscriber] DeviceName: pairing expired, re-pair required"
```

### Changes to `subscriber.js`

**Auth failure detection — both error paths:**

Auth failure classification applies to TWO code paths:
1. The `.catch()` handler on `getAccessories()` (line 326) — initial connection failure
2. The `disconnectHandler` resubscribe failure (line 282) — mid-session auth failure

Both paths check the error message for auth failure patterns (see error classification table). Both increment `stats.authFailures`. When `stats.authFailures >= 3`, set `session.authFailed = true` and call the auto-re-pair flow instead of `scheduleReconnect()`.

A helper function `isAuthError(err)` centralizes the classification:

```js
function isAuthError(err) {
  const msg = err?.message ?? String(err);
  return /M[24]:\s*Error:\s*2\b/.test(msg)
    || /M2:.*Signature verification/i.test(msg);
}
```

**Concurrency guard:**

`session.repairing` (boolean) prevents concurrent re-pair and connect attempts. `connectAccessory()` checks this flag and returns early if true.

**New stats fields:**

- `authFailures` (number) — consecutive auth failure count, reset on successful connect
- `authFailed` (boolean) — true when max auth retries exhausted
- `needsRepair` (boolean) — true when auto-re-pair failed or no PIN available
- `autoRepairAttempts` (number) — lifetime count, circuit breaker at 3
- `autoRepairLastError` (string|null)
- `autoRepairedAt` (string|null) — timestamp of last successful auto-re-pair

**"Log once" mechanism:**

The `needsRepair` flag itself serves as the guard. The warning log is emitted only at the transition point (when `needsRepair` is set from `false` to `true`). Subsequent cycles do not log because the retry loop has already stopped. On process restart, the flag resets and the cycle runs again (3 auth retries → re-pair attempt → log once if still failing). This is acceptable since restarts are infrequent.

**Auto-re-pair delegation:**

The subscriber does NOT import `IPDiscovery`. Instead, `index.js` passes two callbacks:
- `discoverDevice(deviceId)` — runs mDNS discovery and returns `{ address, port }` or null
- `savePairing(deviceId, updatedPairing)` — persists to `pairings.json`

The new `attemptAutoRepair(session, pairing)` function uses these callbacks. This keeps discovery responsibility in `index.js` and the subscriber focused on connection management.

**Updated function signatures:**

```js
// Current
export function startSubscribers(pairings, rooms, getPairing)
export function startSubscriber(deviceId, pairing, rooms, getPairing)

// New — options object for the new callbacks
export function startSubscribers(pairings, rooms, getPairing, options)
export function startSubscriber(deviceId, pairing, rooms, getPairing, options)
// options = { discoverDevice, savePairing }
```

Call sites in `index.js` that need updating:
- Initial startup (~line 360)
- Post-pair subscriber start (~line 651)

### Changes to `index.js`

**Discovery callback:**

```js
async function discoverDevice(deviceId) {
  // Use existing IPDiscovery with 10s timeout
  // Return { address, port } or null if not found
}
```

**Save pairing callback:**

```js
async function savePairing(deviceId, updatedFields) {
  const current = loadPairings();
  current[deviceId] = { ...current[deviceId], ...updatedFields };
  await pairingsStore.save(current);
}
```

**PIN storage in pair endpoint (line 613):**

When `POST /api/setup/pair` succeeds, include `pin` in the saved pairing record:

```js
updatedPairings[deviceId] = {
  protocol: 'homekit',
  name: cached.name,
  address: cached.address,
  port: cached.port,
  category: cached.category,
  pairedAt: new Date().toISOString(),
  pin,            // NEW — store for auto-re-pair
  longTermData,
};
```

**Stats exposure:**

`getSubscriberStats()` already feeds into the `/api/accessories` response. The new `authFailed` and `needsRepair` fields will automatically appear in the `reliability` object. No new endpoint needed.

**Health endpoint:**

Update `getSubscriberHealth()` to include a `needsRepair` count alongside `total`, `connected`, and `stale`.

### Changes to `pairing.js` (CLI)

Store the PIN in the pairing record when pairing via CLI:

```js
pairings[service.id] = {
  protocol: 'homekit',
  name: service.name,
  address: service.address,
  port: service.port,
  category: service.ci,
  pairedAt: new Date().toISOString(),
  pin,            // NEW
  longTermData,
};
```

### Error classification

| Error pattern | Classification | Behavior |
|---|---|---|
| `M4: Error: 2` or `M2: Error: 2` | Auth failure | Count toward auth failure limit (3), then auto-re-pair |
| `M2: Signature verification` | Auth failure | Count toward auth failure limit (3), then auto-re-pair |
| `M4: Error: 4` (max peers) | Terminal | Skip auto-re-pair entirely, mark `needsRepair` immediately |
| `M4: Error: 1` (unknown) | Transient | Normal exponential backoff |
| `M4: Error: 3` (backoff) | Transient | Normal exponential backoff |
| `M4: Error: 5` (max tries) | Transient | Normal exponential backoff |
| `M4: Error: 6` (unavailable) | Transient | Normal exponential backoff |
| `M4: Error: 7` (busy) | Transient | Normal exponential backoff |
| Connection refused / timeout | Transient | Normal exponential backoff |
| All other errors | Transient | Normal exponential backoff |

Helper functions for classification:

```js
function isAuthError(err) {
  const msg = err?.message ?? String(err);
  return /M[24]:\s*Error:\s*2\b/.test(msg)
    || /M2:.*Signature verification/i.test(msg);
}

function isMaxPeersError(err) {
  const msg = err?.message ?? String(err);
  return /Error:\s*4\b/.test(msg) || /maxpeers/i.test(msg);
}
```

### Logging

- Auth failures: logged at `warn` level (not `error`) after the first occurrence to reduce noise
- Auto-re-pair attempt: `info` level
- Auto-re-pair success: `info` level
- Auto-re-pair failure: `error` level
- "Needs re-pair" final state: `warn` level, logged once at the transition to `needsRepair = true`
- Max peers terminal failure: `error` level, logged once

### Testing

Existing tests in `listener/test/subscriber.reconnect.test.js` use `__testHooks` for white-box testing. New tests follow this pattern.

**Auth failure detection:**
- Auth failure detection triggers after 3 consecutive auth errors via `getAccessories`
- Auth failure detection triggers after 3 consecutive auth errors via `disconnectHandler` resubscribe
- Transient errors (timeout, backoff) do NOT trigger auth failure path
- Max peers error (Error 4) skips auth failure counting and marks `needsRepair` immediately
- A successful connect resets `authFailures` counter to 0

**Auto-re-pair:**
- Auto-re-pair success: resets session, creates new HttpClient with new longTermData, resumes
- Auto-re-pair failure (no PIN): marks `needsRepair` without attempting discovery
- Auto-re-pair failure (wrong PIN / pairSetup error): increments `autoRepairAttempts`, marks `needsRepair` after 3
- Auto-re-pair failure (device not discovered): increments `autoRepairAttempts`
- Circuit breaker: after 3 auto-re-pair attempts, stops trying and marks `needsRepair`
- Pairing loop prevention: if re-pair succeeds but auth fails again, circuit breaker still applies (autoRepairAttempts persists across cycles)
- Concurrency: concurrent connect attempts are blocked while `session.repairing = true`

**PIN storage:**
- PIN is saved in pairing record on `POST /api/setup/pair`
- PIN is saved in pairing record on CLI pair
- Existing pairings without PIN field work normally (auto-re-pair skipped)

**Stats and API:**
- `getSubscriberStats()` includes new fields (`authFailed`, `needsRepair`, `autoRepairAttempts`, etc.)
- `getSubscriberHealth()` includes `needsRepair` count

New hooks exposed via `__testHooks`: `attemptAutoRepair`, `isAuthError`, `isMaxPeersError`.

### Migration / backwards compatibility

- Existing `pairings.json` entries without a `pin` field work unchanged — auto-re-pair is simply skipped for those devices
- No database migration needed
- No breaking API changes — new fields are additive in the `reliability` object
- Users who re-pair through the UI after this change will automatically have their PIN stored for future auto-recovery
- The `startSubscribers()` signature adds an optional fourth `options` parameter — existing calls without it continue to work (auto-re-pair is simply disabled)
