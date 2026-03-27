# Add Pairing CLI Script Design

**Date**: 2026-03-26
**Status**: Approved

## Problem

HomeChronicle uses `pairSetup` to pair with HomeKit accessories. When an accessory is already paired with another controller (Apple Home, or another HomeChronicle instance), `pairSetup` returns HAP error 6 (`kTLVError_Unavailable`). This prevents a second HomeChronicle instance (e.g., beta) from pairing with accessories that are already paired with a production instance.

## Solution

A CLI utility `listener/src/add-pairing.js` that uses an existing paired instance's credentials to register a new instance as an additional HAP controller via `hap-controller`'s `addPairing` method.

## Usage

```bash
node src/add-pairing.js --source /Volumes/apps/homechronicle/data/pairings.json \
                        --target /Volumes/apps/hc-beta/data/pairings.json
```

Optional flags:
- `--iface <name>` — mDNS discovery interface (e.g., `en0`), defaults to `DISCOVER_IFACE` env var
- `--timeout <ms>` — per-device discovery timeout, default 10000

## How It Works

### Step 1: Load source pairings
Read the source `pairings.json`. Filter to entries where `protocol === 'homekit'` and `longTermData` exists.

### Step 2: Resolve or generate beta controller identity
If the target file already contains HomeKit pairings with an `iOSDevicePairingID` in their `longTermData`, extract and reuse that identity (key pair + ID) for idempotency. Otherwise, generate a new Ed25519 key pair and a UUID-based `iOSDevicePairingID`.

**Key generation**: Use Node.js `crypto.generateKeyPairSync('ed25519')` with DER encoding, then extract the raw 32-byte keys from the DER wrappers (public key = last 32 bytes of SPKI DER, private key seed = bytes 16-48 of PKCS8 DER). Convert raw bytes to hex strings for storage in `PairingData`.

**Identifier encoding**: hap-controller stores `iOSDevicePairingID` as a hex-encoded representation of the raw UUID string bytes (e.g., UUID `"550e8400-..."` → `Buffer.from("550e8400-...")` → hex). When calling `addPairing(identifier, ...)`, pass the **raw UUID string**, not the hex-encoded form. When building `longTermData` for storage, hex-encode it via `Buffer.from(uuid).toString('hex')`.

### Step 3: For each accessory
1. **Discover** current address/port via `IPDiscovery` using the event-based `on('serviceUp', ...)` pattern (matching existing `pairing.js` and `discover.js`). Match by device ID, timeout per device.
2. **Authenticate** by creating `HttpClient(deviceId, address, port, sourceLongTermData)` where `deviceId` is the accessory's MAC-style ID (the key in pairings.json). This triggers `pairVerify` internally.
3. **Register** beta by calling `client.addPairing(betaUUID, betaLTPKBuffer, true)`:
   - `betaUUID`: the raw UUID string (not hex-encoded), e.g. `"550e8400-e29b-41d4-a716-446655440000"`
   - `betaLTPKBuffer`: beta's raw 32-byte Ed25519 public key as a Buffer
   - `true`: register as admin (required for subscriptions and future `addPairing`/`removePairing` calls)
4. **Build target pairing record** with top-level metadata and nested `longTermData`:
   ```json
   {
     "protocol": "homekit",
     "name": "(from source)",
     "address": "(from discovery)",
     "port": "(from discovery)",
     "category": "(from source)",
     "pin": "(from source)",
     "pairedAt": "(now)",
     "longTermData": {
       "AccessoryPairingID": "(from source longTermData)",
       "AccessoryLTPK": "(from source longTermData)",
       "iOSDevicePairingID": "(beta UUID, hex-encoded)",
       "iOSDeviceLTSK": "(beta private key, hex-encoded)",
       "iOSDeviceLTPK": "(beta public key, hex-encoded)"
     }
   }
   ```

### Step 4: Write target pairings
Merge new pairing records into the target `pairings.json`, preserving any existing entries (e.g., Matter pairings). Write atomically.

### Step 5: Summary
Print results per accessory (success/fail/reason). Exit code 0 if all succeeded, 1 if any failed.

## Error Handling

- **Device not found on network**: Log warning, skip, continue with remaining devices.
- **Authentication failure with source credentials**: Log error (source pairing may be stale), skip device.
- **Max peers (Error 4)**: Log that the accessory has too many controllers; user must remove one from Apple Home first.
- **addPairing failure**: Log the HAP error, skip device, continue.
- **Target file doesn't exist**: Create it with an empty object.
- **Source file missing or unreadable**: Exit with error.

## File Location

`listener/src/add-pairing.js` — alongside existing `pairing.js` and `discover.js` utilities.

## Dependencies

- `hap-controller` (already installed) — `HttpClient`, `IPDiscovery`
- Node.js `crypto` — Ed25519 key generation
- Node.js `fs` — file I/O
- No new npm dependencies required.

## Idempotency

Safe to re-run. If a device is already registered with beta's controller identity, `addPairing` will update the existing registration (per HAP spec). The script reuses the beta identity from the target file if one exists.

## Scope Exclusions

- No web UI integration — CLI only.
- No removal of source pairings — production continues to work.
- No Matter protocol support — HomeKit only (Matter uses a different commissioning flow).
