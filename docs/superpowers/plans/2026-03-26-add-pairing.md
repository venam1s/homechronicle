# Add Pairing CLI Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a CLI utility that registers a new HomeChronicle instance as an additional HAP controller on accessories already paired with another instance.

**Architecture:** A single-file CLI script (`listener/src/add-pairing.js`) reads source pairings, generates a controller identity for the target, discovers each accessory on the network, authenticates using source credentials, calls `addPairing` to register the target, and writes the target pairings file. Pure functions for key generation and pairing record building are extracted for testability.

**Tech Stack:** Node.js ES modules, `hap-controller` (HttpClient, IPDiscovery), Node.js `crypto` (Ed25519)

**Spec:** `docs/superpowers/specs/2026-03-26-add-pairing-design.md`

---

### File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `listener/src/add-pairing.js` | CLI entry point: arg parsing, orchestration loop, console output |
| Create | `listener/src/add-pairing-helpers.js` | Pure functions: key generation, identity resolution, pairing record building |
| Create | `listener/test/add-pairing-helpers.test.js` | Unit tests for the pure helper functions |
| Modify | `listener/package.json` (scripts section) | Add `"add-pairing"` script alias |

---

### Task 1: Key Generation and Identity Helpers

**Files:**
- Create: `listener/src/add-pairing-helpers.js`
- Create: `listener/test/add-pairing-helpers.test.js`

- [ ] **Step 1: Write failing tests for `generateControllerIdentity()`**

Create `listener/test/add-pairing-helpers.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateControllerIdentity } from '../src/add-pairing-helpers.js';

test('generateControllerIdentity returns uuid, ltpk, and ltsk as hex strings', () => {
  const id = generateControllerIdentity();
  assert.ok(id.uuid, 'should have uuid');
  assert.ok(id.ltpkHex, 'should have ltpkHex');
  assert.ok(id.ltskHex, 'should have ltskHex');
  // UUID is 36 chars (8-4-4-4-12), hex-encoded is 72 chars
  assert.equal(id.uuid.length, 36, 'uuid should be 36 chars');
  assert.equal(id.ltpkHex.length, 64, 'ltpk hex should be 64 chars (32 bytes)');
  // ltsk is 64 bytes (seed+pubkey) = 128 hex chars, or 32 bytes seed = 64 hex chars
  assert.ok(id.ltskHex.length >= 64, 'ltsk hex should be at least 64 chars');
});

test('generateControllerIdentity produces unique identities', () => {
  const a = generateControllerIdentity();
  const b = generateControllerIdentity();
  assert.notEqual(a.uuid, b.uuid);
  assert.notEqual(a.ltpkHex, b.ltpkHex);
});

test('generateControllerIdentity keys pass Ed25519 sign/verify round-trip', () => {
  const { sign, verify, createPublicKey, createPrivateKey } = await import('node:crypto');
  const id = generateControllerIdentity();
  const ltskRaw = Buffer.from(id.ltskHex, 'hex');
  const ltpkRaw = Buffer.from(id.ltpkHex, 'hex');

  // Reconstruct Node.js key objects from raw bytes
  const privateKey = createPrivateKey({
    key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), ltskRaw.subarray(0, 32)]),
    format: 'der', type: 'pkcs8',
  });
  const publicKey = createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), ltpkRaw]),
    format: 'der', type: 'spki',
  });

  const message = Buffer.from('test message');
  const signature = sign(null, message, privateKey);
  assert.ok(verify(null, message, publicKey, signature), 'signature should verify');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd listener && node --test test/add-pairing-helpers.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `generateControllerIdentity()`**

Create `listener/src/add-pairing-helpers.js`:

```js
import { randomUUID, generateKeyPairSync } from 'node:crypto';

/**
 * Generate a fresh Ed25519 controller identity for HAP addPairing.
 * Returns { uuid, ltpkHex, ltskHex } where hex values match hap-controller PairingData format.
 */
export function generateControllerIdentity() {
  const uuid = randomUUID();
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });
  // Raw Ed25519 public key is last 32 bytes of SPKI DER
  const ltpkRaw = publicKey.subarray(-32);
  // Raw Ed25519 private key seed is bytes 16-48 of PKCS8 DER
  const ltskSeed = privateKey.subarray(16, 48);
  // hap-controller stores ltsk as seed (32 bytes) + pubkey (32 bytes) = 64 bytes
  const ltskRaw = Buffer.concat([ltskSeed, ltpkRaw]);

  return {
    uuid,
    ltpkHex: ltpkRaw.toString('hex'),
    ltskHex: ltskRaw.toString('hex'),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd listener && node --test test/add-pairing-helpers.test.js`
Expected: 2 tests passing

- [ ] **Step 5: Commit**

```bash
git add listener/src/add-pairing-helpers.js listener/test/add-pairing-helpers.test.js
git commit -m "feat: add Ed25519 key generation helper for addPairing"
```

---

### Task 2: Identity Resolution from Existing Target File

**Files:**
- Modify: `listener/src/add-pairing-helpers.js`
- Modify: `listener/test/add-pairing-helpers.test.js`

- [ ] **Step 1: Write failing tests for `resolveControllerIdentity()`**

Update the import at the top of `listener/test/add-pairing-helpers.test.js` to include `resolveControllerIdentity`:

```js
import { generateControllerIdentity, resolveControllerIdentity } from '../src/add-pairing-helpers.js';
```

Then append these tests at the bottom of the file:

```js
test('resolveControllerIdentity generates new identity when target has no HomeKit pairings', () => {
  const id = resolveControllerIdentity({});
  assert.ok(id.uuid);
  assert.ok(id.ltpkHex);
  assert.ok(id.ltskHex);
});

test('resolveControllerIdentity reuses identity from existing target pairings', () => {
  const existingUUID = '550e8400-e29b-41d4-a716-446655440000';
  const existing = {
    'AA:BB:CC:DD:EE:FF': {
      protocol: 'homekit',
      longTermData: {
        iOSDevicePairingID: Buffer.from(existingUUID).toString('hex'),
        iOSDeviceLTSK: 'aa'.repeat(64),
        iOSDeviceLTPK: 'bb'.repeat(32),
      },
    },
  };
  const id = resolveControllerIdentity(existing);
  assert.equal(id.uuid, existingUUID);
  assert.equal(id.ltskHex, 'aa'.repeat(64));
  assert.equal(id.ltpkHex, 'bb'.repeat(32));
});

test('resolveControllerIdentity ignores non-homekit entries', () => {
  const existing = {
    'node-1': { protocol: 'matter', longTermData: {} },
  };
  const id = resolveControllerIdentity(existing);
  // Should generate fresh since no homekit entries
  assert.equal(id.uuid.length, 36);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd listener && node --test test/add-pairing-helpers.test.js`
Expected: FAIL — resolveControllerIdentity not exported

- [ ] **Step 3: Implement `resolveControllerIdentity()`**

Add to `listener/src/add-pairing-helpers.js`:

```js
/**
 * Resolve a controller identity from existing target pairings, or generate a new one.
 * @param {object} targetPairings - contents of target pairings.json
 * @returns {{ uuid: string, ltpkHex: string, ltskHex: string }}
 */
export function resolveControllerIdentity(targetPairings) {
  for (const entry of Object.values(targetPairings)) {
    if (entry.protocol !== 'homekit' || !entry.longTermData?.iOSDevicePairingID) continue;
    const { iOSDevicePairingID, iOSDeviceLTSK, iOSDeviceLTPK } = entry.longTermData;
    return {
      uuid: Buffer.from(iOSDevicePairingID, 'hex').toString('utf8'),
      ltskHex: iOSDeviceLTSK,
      ltpkHex: iOSDeviceLTPK,
    };
  }
  return generateControllerIdentity();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd listener && node --test test/add-pairing-helpers.test.js`
Expected: 5 tests passing

- [ ] **Step 5: Commit**

```bash
git add listener/src/add-pairing-helpers.js listener/test/add-pairing-helpers.test.js
git commit -m "feat: add identity resolution from existing target pairings"
```

---

### Task 3: Pairing Record Builder

**Files:**
- Modify: `listener/src/add-pairing-helpers.js`
- Modify: `listener/test/add-pairing-helpers.test.js`

- [ ] **Step 1: Write failing test for `buildTargetPairing()`**

Update the import at the top of `listener/test/add-pairing-helpers.test.js` to include `buildTargetPairing`:

```js
import { generateControllerIdentity, resolveControllerIdentity, buildTargetPairing } from '../src/add-pairing-helpers.js';
```

Then append this test at the bottom of the file:

```js
test('buildTargetPairing merges source metadata, discovery info, and beta identity', () => {
  const source = {
    protocol: 'homekit',
    name: 'Test Bridge',
    category: 2,
    pin: '111-22-333',
    address: '192.168.1.10',
    port: 51826,
    longTermData: {
      AccessoryPairingID: 'aabbccdd',
      AccessoryLTPK: 'eeff0011',
    },
  };
  const discovered = { address: '192.168.1.20', port: 51827 };
  const identity = { uuid: 'my-uuid', ltpkHex: 'aa'.repeat(32), ltskHex: 'bb'.repeat(64) };

  const result = buildTargetPairing(source, discovered, identity);

  assert.equal(result.protocol, 'homekit');
  assert.equal(result.name, 'Test Bridge');
  assert.equal(result.address, '192.168.1.20');
  assert.equal(result.port, 51827);
  assert.equal(result.category, 2);
  assert.equal(result.pin, '111-22-333');
  assert.ok(result.pairedAt);
  assert.equal(result.longTermData.AccessoryPairingID, 'aabbccdd');
  assert.equal(result.longTermData.AccessoryLTPK, 'eeff0011');
  assert.equal(result.longTermData.iOSDevicePairingID, Buffer.from('my-uuid').toString('hex'));
  assert.equal(result.longTermData.iOSDeviceLTSK, 'bb'.repeat(64));
  assert.equal(result.longTermData.iOSDeviceLTPK, 'aa'.repeat(32));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd listener && node --test test/add-pairing-helpers.test.js`
Expected: FAIL — buildTargetPairing not exported

- [ ] **Step 3: Implement `buildTargetPairing()`**

Add to `listener/src/add-pairing-helpers.js`:

```js
/**
 * Build a target pairing record from source metadata, discovered address, and beta identity.
 */
export function buildTargetPairing(source, discovered, identity) {
  return {
    protocol: 'homekit',
    name: source.name,
    address: discovered.address,
    port: discovered.port,
    category: source.category,
    pin: source.pin,
    pairedAt: new Date().toISOString(),
    longTermData: {
      AccessoryPairingID: source.longTermData.AccessoryPairingID,
      AccessoryLTPK: source.longTermData.AccessoryLTPK,
      iOSDevicePairingID: Buffer.from(identity.uuid).toString('hex'),
      iOSDeviceLTSK: identity.ltskHex,
      iOSDeviceLTPK: identity.ltpkHex,
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd listener && node --test test/add-pairing-helpers.test.js`
Expected: 6 tests passing

- [ ] **Step 5: Commit**

```bash
git add listener/src/add-pairing-helpers.js listener/test/add-pairing-helpers.test.js
git commit -m "feat: add target pairing record builder"
```

---

### Task 4: CLI Script — Full Implementation

**Files:**
- Create: `listener/src/add-pairing.js`

- [ ] **Step 1: Write the complete CLI script**

Create `listener/src/add-pairing.js`:

```js
#!/usr/bin/env node

/**
 * add-pairing.js — register a new HomeChronicle instance as an additional HAP controller.
 *
 * Uses an existing paired instance's credentials to call addPairing on each accessory,
 * registering the target instance with its own Ed25519 identity.
 *
 * Usage:
 *   node src/add-pairing.js --source /path/to/production/pairings.json \
 *                           --target /path/to/beta/pairings.json
 *
 * Options:
 *   --iface <name>    mDNS discovery interface (default: DISCOVER_IFACE env var)
 *   --timeout <ms>    per-device discovery timeout (default: 10000)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { IPDiscovery, HttpClient } from 'hap-controller';
import {
  resolveControllerIdentity,
  buildTargetPairing,
} from './add-pairing-helpers.js';

// --- Arg parsing -----------------------------------------------------------

function parseArgs(argv) {
  const args = { iface: process.env.DISCOVER_IFACE || null, timeout: 10_000 };
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--source': args.source = argv[++i]; break;
      case '--target': args.target = argv[++i]; break;
      case '--iface':  args.iface = argv[++i]; break;
      case '--timeout': args.timeout = Number(argv[++i]); break;
      default:
        console.error(`Unknown flag: ${argv[i]}`);
        process.exit(1);
    }
  }
  return args;
}

const args = parseArgs(process.argv);

if (!args.source || !args.target) {
  console.error('Usage: node src/add-pairing.js --source <path> --target <path> [--iface <name>] [--timeout <ms>]');
  process.exit(1);
}

// --- Load pairings ----------------------------------------------------------

let sourcePairings;
try {
  sourcePairings = JSON.parse(readFileSync(args.source, 'utf8'));
} catch (err) {
  console.error(`Failed to read source pairings: ${err.message}`);
  process.exit(1);
}

const homeKitEntries = Object.entries(sourcePairings).filter(
  ([, v]) => v.protocol === 'homekit' && v.longTermData,
);

if (homeKitEntries.length === 0) {
  console.error('No HomeKit pairings with longTermData found in source file.');
  process.exit(1);
}

const targetPairings = existsSync(args.target)
  ? JSON.parse(readFileSync(args.target, 'utf8'))
  : {};

const identity = resolveControllerIdentity(targetPairings);

console.log(`Source: ${homeKitEntries.length} HomeKit accessory/accessories`);
console.log(`Target identity: ${identity.uuid}`);
console.log();

// --- Discovery helper -------------------------------------------------------

function discoverDevice(deviceId, iface, timeout) {
  return new Promise((resolve) => {
    const discovery = new IPDiscovery(iface);
    const timer = setTimeout(() => {
      discovery.stop();
      resolve(null);
    }, timeout);

    discovery.on('serviceUp', (service) => {
      if (service.id !== deviceId) return;
      clearTimeout(timer);
      discovery.stop();
      resolve(service);
    });

    discovery.start();
  });
}

// --- HAP error formatting ---------------------------------------------------

function formatHapError(err) {
  const msg = err.message || String(err);
  if (/Error:\s*4/.test(msg)) {
    return 'max peers — remove a controller from Apple Home first';
  }
  if (/Error:\s*2/.test(msg)) {
    return 'authentication failed — source pairing may be stale';
  }
  if (/Error:\s*6/.test(msg)) {
    return 'unavailable — accessory may be busy or not accepting pairings';
  }
  return msg;
}

// --- Main loop --------------------------------------------------------------

const results = [];

for (const [deviceId, source] of homeKitEntries) {
  process.stdout.write(`${source.name} (${deviceId}) ... `);

  // 1. Discover
  const discovered = await discoverDevice(deviceId, args.iface, args.timeout);
  if (!discovered) {
    console.log('SKIP (not found on network)');
    results.push({ deviceId, name: source.name, ok: false, reason: 'not found' });
    continue;
  }

  // 2. Authenticate with source credentials and call addPairing
  try {
    const client = new HttpClient(
      deviceId,
      discovered.address,
      discovered.port,
      source.longTermData,
    );

    const ltpkBuffer = Buffer.from(identity.ltpkHex, 'hex');
    await client.addPairing(identity.uuid, ltpkBuffer, true);

    // 3. Build and store target pairing
    targetPairings[deviceId] = buildTargetPairing(source, discovered, identity);

    console.log('OK');
    results.push({ deviceId, name: source.name, ok: true });
  } catch (err) {
    const reason = formatHapError(err);
    console.log(`FAIL (${reason})`);
    results.push({ deviceId, name: source.name, ok: false, reason });
  }
}

// --- Write target and summarize ---------------------------------------------

writeFileSync(args.target, JSON.stringify(targetPairings, null, 2));

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok).length;

console.log();
console.log(`Done: ${passed} succeeded, ${failed} failed`);

if (failed > 0) {
  console.log('\nFailed:');
  for (const r of results.filter((r) => !r.ok)) {
    console.log(`  ${r.name} (${r.deviceId}): ${r.reason}`);
  }
  process.exit(1);
}

process.exit(0);
```

- [ ] **Step 2: Verify the script runs with missing args**

Run: `cd listener && node src/add-pairing.js`
Expected: Usage message and exit code 1

- [ ] **Step 3: Verify with missing --target**

Run: `cd listener && node src/add-pairing.js --source /nonexistent`
Expected: "Usage:" message (missing --target)

- [ ] **Step 4: Commit**

```bash
git add listener/src/add-pairing.js
git commit -m "feat: add-pairing CLI with discovery and addPairing orchestration"
```

---

### Task 5: Package.json Script Alias and Final Verification

**Files:**
- Modify: `listener/package.json`

- [ ] **Step 1: Add the script alias**

Add to the `"scripts"` section of `listener/package.json`:

```json
"add-pairing": "node src/add-pairing.js"
```

- [ ] **Step 2: Verify**

Run: `cd listener && npm run add-pairing`
Expected: Usage message (no args provided)

- [ ] **Step 3: Commit**

- [ ] **Step 3: Run all listener tests**

Run: `cd listener && npm test`
Expected: All tests pass, including the new `add-pairing-helpers.test.js`

- [ ] **Step 4: Commit**

```bash
git add listener/package.json
git commit -m "feat: add npm run add-pairing script alias"
```
