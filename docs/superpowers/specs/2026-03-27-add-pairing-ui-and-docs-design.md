# Add-Pairing UI + Documentation Update

**Date:** 2026-03-27
**Status:** Approved

## Problem

HomeChronicle can only pair with HomeKit accessories via pair-setup, which requires the device to be unpaired. Devices already paired to Apple Home (sf=0) reject pair-setup with kTLVError_Unavailable (error 6). This makes HomeChronicle unusable for anyone with an existing HomeKit setup — users shouldn't have to tear down their Apple Home just to add monitoring.

The HAP protocol supports multiple controllers via the add-pairing mechanism, but HomeChronicle only exposes this as a CLI tool (`add-pairing.js`), not through the web UI.

Additionally, Homebridge users can bypass the limitation entirely by enabling insecure mode (`-I` flag), but this is undocumented.

## Solution

### 1. Add-Pairing API Endpoint

**`POST /api/setup/add-pairing`**

Accepts source pairings JSON inline in the request body (from another HomeChronicle instance that is already paired as admin). Uses the source credentials to register this instance as an additional controller on each device. Protected by the existing API token middleware.

Request body:
```json
{
  "sourcePairings": {
    "AA:BB:CC:DD:EE:FF": {
      "protocol": "homekit",
      "name": "Pet Feeder",
      "longTermData": { ... }
    }
  }
}
```

Response:
```json
{
  "results": [
    { "deviceId": "AA:BB:CC:DD:EE:FF", "name": "Pet Feeder", "ok": true },
    { "deviceId": "BB:CC:DD:EE:FF:00", "name": "Tuya 1169", "ok": false, "reason": "not found on network" }
  ],
  "summary": { "total": 2, "succeeded": 1, "failed": 1 }
}
```

Implementation: Extract the core loop from `add-pairing.js` into a reusable `runAddPairing()` function in `add-pairing-helpers.js`. Both the CLI and the new endpoint call this function. Reuse the existing `discoverDeviceForRepair` function from `index.js` for device discovery instead of duplicating discovery logic.

The endpoint:
- Validates the source pairings object (must contain at least one HomeKit entry with longTermData)
- Resolves or generates this instance's controller identity from its existing pairings
- For each device in the source pairings:
  - Discovers it on the network via mDNS (uses DISCOVER_IFACE env var, 10s timeout)
  - Connects with source admin credentials (pair-verify)
  - Calls `client.addPairing(identifier, ltpk, true)` to register this instance as admin
  - Stores the resulting pairing in this instance's `pairings.json`
- Starts subscribers for all newly paired devices via `startSubscribers()`
- Returns per-device results

Note: with 10+ devices and 10s discovery timeout each, the request can take up to ~100s. The Nginx proxy timeout is 300s so this is safe, but the UI should show progress feedback.

Note: the source controller must have admin permissions. If it was added as a non-admin, addPairing will fail with error 2.

### 2. UI: Add Pairing Panel

Add an "Add as Controller" section to **Manage > Add Devices** tab. Appears when `pairedElsewhereCount > 0`.

Components:
- Collapsible panel with explanatory text about why pair-setup failed and what add-pairing does
- Textarea for pasting source pairings JSON (from another HomeChronicle instance's pairings.json)
- "Add as Controller" button
- Progress/results display showing per-device outcomes
- Link to documentation for more details

Also update the existing amber "paired elsewhere" warning banner to mention add-pairing as a third option alongside removing from Apple Home or pairing first.

### 3. Documentation Updates

#### devices.md — Pairing section rewrite

Fix the incorrect claim on line 34: "Devices already paired with Apple Home can also be paired with homechronicle simultaneously." Replace with accurate information about the three approaches:

1. **Homebridge insecure mode (`-I`):** Enable in Homebridge UI settings to allow pair-setup alongside Apple Home. This is the simplest approach for Homebridge users.
2. **Add-pairing:** Use the web UI or CLI to register HomeChronicle as an additional controller using credentials from an existing admin controller.
3. **Pair first:** Pair with HomeChronicle before adding to Apple Home. Required for native HomeKit devices without an existing admin.

#### devices.md — New "Multiple Controllers" section

Explain the HAP protocol's pair-setup vs add-pairing distinction, the `-I` insecure mode bypass for Homebridge, and when to use each approach.

#### devices.md — Add-Pairing documentation

Document the add-pairing feature:
- Web UI flow (paste source pairings JSON)
- CLI flow (`npm run add-pairing -- --source ... --target ...`)
- What the source pairings file is and where to get it

#### troubleshooting.md — New "M2: Error 6" section

Document what error 6 means, common causes, and fix options.

#### README.md — Requirements update

Add Homebridge insecure mode to the requirements section.

#### CHANGELOG.md — New file

Create a changelog with entries for:
- Add-pairing web UI and API endpoint
- Paired-elsewhere detection and warnings in Add Devices tab
- Improved error messages for pairing failures (Error 6 now explains paired-elsewhere)
- Homebridge insecure mode documentation

## Files Changed

| File | Change |
|------|--------|
| `listener/src/index.js` | New `POST /api/setup/add-pairing` endpoint |
| `listener/src/add-pairing-helpers.js` | Extract reusable `runAddPairing()` function |
| `web/src/components/setup/AddDevicesTab.jsx` | Add-pairing panel UI, update warning text |
| `web/src/hooks/useSetup.js` | `addPairingMutation` |
| `docs/guide/devices.md` | Rewrite pairing section, add multiple controllers + add-pairing sections |
| `docs/guide/troubleshooting.md` | Add M2: Error 6 section |
| `docs/guide/README.md` | Update requirements |
| `CHANGELOG.md` | New file |

## Out of Scope

- Homebridge persist directory injection (direct file modification) — possible future enhancement
- Automatic fallback from pair-setup to add-pairing in the pair endpoint — would require source credentials which may not exist
- Native HomeKit device multi-controller without insecure mode — HAP protocol limitation
