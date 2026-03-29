# Pairing Resilience & Self-Healing

**Date:** 2026-03-25
**Status:** Approved

## Problem

When a Homebridge (or other HAP accessory) loses its record of HomeChronicle as a paired controller, the subscriber silently fails with `M4: Error: 2` (pair-verify auth failure). Without intervention, devices go dark for days. The current system has no mechanism to detect, alert, or recover from this scenario.

Root causes observed:
- Homebridge updates/restarts can purge non-admin controller pairings from its persist files
- HomeChronicle's stored `longTermData` becomes stale (accessory no longer recognizes the controller)
- The PIN needed for re-pairing was not persisted in `pairings.json`
- The auto-repair code existed in the codebase but was not deployed to production
- The subscriber retried stale ports with exponential backoff instead of re-discovering the device
- No UI indication of pairing health -- failures were invisible to the user

## Design

### 1. Always Store PIN

Ensure the PIN is persisted in `pairings.json` during every successful `pairSetup()` call. The `/api/setup/pair` endpoint and the CLI `pairing.js` script both already save the PIN in the pairing record. Verify with tests to prevent regressions. On startup, log a warning for any pairing missing a PIN so operators notice before a failure occurs.

### 2. Port Re-Discovery on Connection Failure

When a subscriber encounters `ECONNREFUSED`, `ETIMEDOUT`, or `ENOTFOUND`:

1. Trigger a targeted mDNS discovery for that device ID (not a full network scan)
2. If found at a new address/port, update `pairings.json` and reconnect immediately
3. If not found, fall back to existing exponential backoff

This requires:
- A new `isConnectionError(err)` helper function (analogous to the existing `isAuthError` and `isMaxPeersError` helpers) that matches `ECONNREFUSED`, `ETIMEDOUT`, `ENOTFOUND`, and `EHOSTUNREACH`
- Updating the `connectAccessory` catch block (where `getAccessories()` fails) to call `isConnectionError` before falling into `scheduleReconnect`
- Updating the `disconnectHandler` error path to do the same
- Uses the existing `discoverDevice` callback already wired into the subscriber session

### 3. Pairing Health Check on Reconnect

When pair-verify fails during reconnection, classify the error and respond:

| Error | Meaning | Action |
|-------|---------|--------|
| M4: Error: 2 | Accessory forgot our pairing | Auto-repair with stored PIN |
| M2: Signature verification | Our AccessoryLTPK is stale (device regenerated keys) | Auto-repair with stored PIN (fresh pair-setup gets new keys) |
| M2/M4: Error: 4 | Max peers reached | Flag `needsRepair`, show guidance in UI |
| M2/M4: Error: 3 | Backoff requested | Wait 30s, retry |
| M2/M4: Error: 5 | Too many failed attempts | Wait a few minutes, retry |
| M2/M4: Error: 6 | Device unavailable / rejects pair-setup | Flag `needsRepair`, show guided repair in UI |
| Auto-repair: no PIN | PIN not stored | Flag `needsRepair`, prompt user for PIN in UI |

### 4. Auto-Repair Flow

When `needsRepair` is triggered and a PIN is available:

1. Discover device's current address/port via mDNS (`discoverDevice`)
2. Attempt `pairSetup(pin)` with discovered address/port
3. **Success:** save new `longTermData` to `pairings.json`, reset all repair state (`needsRepair`, `authFailed`, `authFailures`, `autoRepairAttempts` all back to initial values), resume subscribing
4. **Failure (error 6 -- unavailable):** surface guided repair in UI
5. **Circuit breaker:** max 3 attempts, then flag `needsRepair = true` and stop retrying

This flow already exists in `subscriber.js` (`attemptAutoRepair`). The changes are:
- Ensure it's deployed (production image must include it)
- Reset `autoRepairAttempts` to 0 on successful repair so the device gets a fresh budget if it breaks again later
- On startup, log a warning for pairings missing PINs

### 5. UI: Pairing Health Banner

A persistent warning banner displayed on Dashboard and My Devices tabs when any device has `needsRepair` or sustained auth failures. Design:

- **Location:** top of the main content area, below the tab bar
- **Appearance:** amber/warning style banner, dismissible but reappears if new issues arise
- **Content:** "{N} device(s) have pairing issues" with a "View Details" link
- **Auto-clear:** disappears when all devices are healthy
- **Data source:** the existing `/api/health` endpoint returns `subscribers.needsRepair` count via `getSubscriberHealth()`. The banner can poll this lightweight endpoint rather than the full `/api/accessories` payload. For detail view, `/api/accessories` returns per-device `reliability.needs_repair`, `reliability.auth_failed`, and `reliability.auto_repair_last_error` fields (once the current codebase is deployed)

### 6. UI: Guided Repair Flow

Accessible from the health banner or per-device action in My Devices. Two-phase approach:

**Phase 1 -- Automatic repair attempt:**
- "Attempting to repair pairing for [device name]..." with a spinner
- Calls a new endpoint `POST /api/setup/repair/:deviceId` which:
  - Reads the stored PIN from `pairings.json`
  - Discovers the device via mDNS
  - Attempts `pairSetup(pin)`
  - Returns success or a classified error

**Phase 2 -- Guided resolution (if Phase 1 fails):**
- Shows the specific error with human-readable guidance:
  - **Error 6 (unavailable):** "This device rejected the pairing. It may be at its pairing limit or not accepting new pairings. Check the device's admin interface to remove stale pairings, then try again."
  - **Key mismatch:** "This device's identity changed (possibly after a firmware update). Enter the device PIN to re-pair." (shows PIN input)
  - **No PIN stored:** "No PIN on file. Enter the device's HomeKit setup code to repair." (shows PIN input)
  - **Wrong PIN:** "The stored PIN was rejected. Enter the correct PIN." (shows PIN input)
- A "Retry" button to re-attempt after the user has taken corrective action

**New API endpoint:**
```
POST /api/setup/repair/:deviceId
Body: { pin?: string }  // optional override PIN
Response: { success: true } | { error: string, code: string, guidance: string }
```

**Expected latency:** 10-20 seconds (10s mDNS discovery timeout + pair-setup handshake). The UI must show a persistent spinner that accommodates this. Consider a shorter discovery timeout (5s) since the user is waiting interactively.

**State reset on success:** The repair endpoint must reset the subscriber's `needsRepair`, `authFailed`, `authFailures`, and `autoRepairAttempts` to initial values, then restart the subscriber for that device.

### 7. Startup Validation

On listener startup, after loading `pairings.json`:
- Log a warning for each pairing missing a `pin` field
- Log the total paired count and any devices with known issues
- This gives operators early visibility without requiring UI access

## Architecture

```
subscriber.js (reconnect loop)
  ├── pair-verify succeeds → normal event subscription
  ├── ECONNREFUSED/ETIMEDOUT → discoverDevice() → update port → retry
  └── M4/M2 auth error → increment authFailures
       └── authFailures >= 3 → attemptAutoRepair()
            ├── has PIN → discoverDevice() + pairSetup(pin)
            │    ├── success → save keys, resume, clear banner
            │    └── error 6 → needsRepair = true → UI banner
            └── no PIN → needsRepair = true → UI banner

index.js
  ├── POST /api/setup/repair/:deviceId (new)
  └── startup validation warnings

Web UI
  ├── PairingHealthBanner (new component)
  └── RepairFlow (new component, modal or inline)
```

## Files Changed

- `listener/src/subscriber.js` -- add port re-discovery on connection failure
- `listener/src/index.js` -- add `/api/setup/repair/:deviceId` endpoint, startup PIN warnings
- `web/src/components/PairingHealthBanner.jsx` -- new component
- `web/src/components/RepairFlow.jsx` -- new component (modal)
- `web/src/App.jsx` -- add PairingHealthBanner to Dashboard tab (Dashboard is rendered inline in App.jsx)
- `web/src/components/setup/MyDevicesTab.jsx` -- add PairingHealthBanner, per-device repair button

## Not In Scope

- Periodic pair-verify polling probes (detection happens on reconnect only)
- Webhook/push notifications for pairing health (defer to when frontend alerts system is built)
- Matter device pairing resilience (separate protocol, separate concerns)

## Testing

- Unit tests for error classification logic
- Unit tests for auto-repair flow (mock pairSetup success/failure)
- Unit test for port re-discovery on ECONNREFUSED
- Manual integration test: remove HC pairing from a Homebridge persist file, restart Homebridge, verify auto-repair kicks in and succeeds
