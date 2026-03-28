import test from 'node:test';
import assert from 'node:assert/strict';
import { generateControllerIdentity, resolveControllerIdentity, buildTargetPairing, runAddPairing, formatHapError } from '../src/add-pairing-helpers.js';

test('generateControllerIdentity returns uuid, ltpk, and ltsk as hex strings', () => {
  const id = generateControllerIdentity();
  assert.ok(id.uuid, 'should have uuid');
  assert.ok(id.ltpkHex, 'should have ltpkHex');
  assert.ok(id.ltskHex, 'should have ltskHex');
  assert.equal(id.uuid.length, 36, 'uuid should be 36 chars');
  assert.equal(id.ltpkHex.length, 64, 'ltpk hex should be 64 chars (32 bytes)');
  assert.ok(id.ltskHex.length >= 64, 'ltsk hex should be at least 64 chars');
});

test('generateControllerIdentity produces unique identities', () => {
  const a = generateControllerIdentity();
  const b = generateControllerIdentity();
  assert.notEqual(a.uuid, b.uuid);
  assert.notEqual(a.ltpkHex, b.ltpkHex);
});

test('generateControllerIdentity keys pass Ed25519 sign/verify round-trip', async () => {
  const { sign, verify, createPublicKey, createPrivateKey } = await import('node:crypto');
  const id = generateControllerIdentity();
  const ltskRaw = Buffer.from(id.ltskHex, 'hex');
  const ltpkRaw = Buffer.from(id.ltpkHex, 'hex');

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
  assert.equal(id.uuid.length, 36);
});

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

// --- formatHapError ---------------------------------------------------------

test('formatHapError maps HAP error 4 to max peers message', () => {
  assert.equal(formatHapError(new Error('Error: 4')), 'max peers — remove a controller first');
});

test('formatHapError maps HAP error 2 to authentication failed message', () => {
  assert.equal(formatHapError(new Error('Error: 2')), 'authentication failed — source pairing may be stale');
});

test('formatHapError maps HAP error 6 to unavailable message', () => {
  assert.equal(formatHapError(new Error('Error: 6')), 'unavailable — device may be busy');
});

test('formatHapError returns raw message for unknown errors', () => {
  assert.equal(formatHapError(new Error('Something else went wrong')), 'Something else went wrong');
});

test('formatHapError handles errors without message property', () => {
  const result = formatHapError({ toString: () => 'bare string error' });
  assert.equal(result, 'bare string error');
});

// --- runAddPairing ----------------------------------------------------------

function makeIdentity() {
  return {
    uuid: 'test-uuid-1234',
    ltpkHex: 'aa'.repeat(32),
    ltskHex: 'bb'.repeat(64),
  };
}

function makeSourcePairings(...overrides) {
  const base = {
    'AA:BB:CC:DD:EE:01': {
      protocol: 'homekit',
      name: 'Test Bridge',
      category: 2,
      pin: '111-22-333',
      longTermData: {
        AccessoryPairingID: 'acc-id-01',
        AccessoryLTPK: 'cc'.repeat(32),
      },
    },
  };
  for (const o of overrides) Object.assign(base, o);
  return base;
}

test('runAddPairing calls addPairing for each HomeKit device and returns ok results', async () => {
  const identity = makeIdentity();
  const sourcePairings = makeSourcePairings();
  const discovered = { address: '192.168.1.50', port: 51826 };
  const addPairingCalls = [];

  const discoverDevice = async () => discovered;
  const createClient = (deviceId, address, port, ltd) => ({
    addPairing: async (uuid, ltpk, isAdmin) => {
      addPairingCalls.push({ deviceId, uuid, isAdmin });
    },
  });

  const progressEvents = [];
  const { results } = await runAddPairing({
    sourcePairings,
    identity,
    discoverDevice,
    createClient,
    onProgress: (r) => progressEvents.push(r),
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].ok, true);
  assert.equal(results[0].deviceId, 'AA:BB:CC:DD:EE:01');
  assert.equal(results[0].name, 'Test Bridge');
  assert.ok(results[0].pairing, 'should include pairing data');
  assert.equal(results[0].pairing.address, '192.168.1.50');
  assert.equal(addPairingCalls.length, 1);
  assert.equal(addPairingCalls[0].uuid, identity.uuid);
  assert.equal(addPairingCalls[0].isAdmin, true);
  assert.equal(progressEvents.length, 1);
  assert.equal(progressEvents[0].ok, true);
});

test('runAddPairing skips non-homekit entries', async () => {
  const sourcePairings = {
    'node-1': { protocol: 'matter', name: 'Matter Light', longTermData: {} },
    'AA:BB:CC:DD:EE:01': {
      protocol: 'homekit',
      name: 'Test Bridge',
      longTermData: { AccessoryPairingID: 'x', AccessoryLTPK: 'y' },
    },
  };
  const discovered = { address: '10.0.0.1', port: 51826 };
  let clientCount = 0;
  const { results } = await runAddPairing({
    sourcePairings,
    identity: makeIdentity(),
    discoverDevice: async () => discovered,
    createClient: () => { clientCount++; return { addPairing: async () => {} }; },
  });

  assert.equal(results.length, 1, 'only HomeKit entry should be processed');
  assert.equal(results[0].deviceId, 'AA:BB:CC:DD:EE:01');
  assert.equal(clientCount, 1);
});

test('runAddPairing skips entries without longTermData', async () => {
  const sourcePairings = {
    'AA:BB:CC:DD:EE:02': { protocol: 'homekit', name: 'No LTD' },
    'AA:BB:CC:DD:EE:01': {
      protocol: 'homekit',
      name: 'Has LTD',
      longTermData: { AccessoryPairingID: 'x', AccessoryLTPK: 'y' },
    },
  };
  const { results } = await runAddPairing({
    sourcePairings,
    identity: makeIdentity(),
    discoverDevice: async () => ({ address: '10.0.0.1', port: 51826 }),
    createClient: () => ({ addPairing: async () => {} }),
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].deviceId, 'AA:BB:CC:DD:EE:01');
});

test('runAddPairing reports discovery failure', async () => {
  const sourcePairings = makeSourcePairings();
  const progressEvents = [];

  const { results } = await runAddPairing({
    sourcePairings,
    identity: makeIdentity(),
    discoverDevice: async () => null,
    createClient: () => { throw new Error('should not be called'); },
    onProgress: (r) => progressEvents.push(r),
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].ok, false);
  assert.equal(results[0].reason, 'not found on network');
  assert.equal(progressEvents.length, 1);
  assert.equal(progressEvents[0].ok, false);
});

test('runAddPairing reports addPairing errors with formatted reason', async () => {
  const sourcePairings = makeSourcePairings();
  const discovered = { address: '10.0.0.1', port: 51826 };

  const { results } = await runAddPairing({
    sourcePairings,
    identity: makeIdentity(),
    discoverDevice: async () => discovered,
    createClient: () => ({
      addPairing: async () => { throw new Error('Error: 4'); },
    }),
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].ok, false);
  assert.equal(results[0].reason, 'max peers — remove a controller first');
});

test('runAddPairing works without onProgress callback', async () => {
  const sourcePairings = makeSourcePairings();
  const discovered = { address: '10.0.0.1', port: 51826 };

  const { results } = await runAddPairing({
    sourcePairings,
    identity: makeIdentity(),
    discoverDevice: async () => discovered,
    createClient: () => ({ addPairing: async () => {} }),
    // onProgress intentionally omitted
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].ok, true);
});

test('runAddPairing handles multiple devices and mixed results', async () => {
  const sourcePairings = makeSourcePairings({
    'AA:BB:CC:DD:EE:02': {
      protocol: 'homekit',
      name: 'Second Bridge',
      longTermData: { AccessoryPairingID: 'acc-id-02', AccessoryLTPK: 'dd'.repeat(32) },
    },
  });

  let callCount = 0;
  const { results } = await runAddPairing({
    sourcePairings,
    identity: makeIdentity(),
    discoverDevice: async (deviceId) => {
      if (deviceId === 'AA:BB:CC:DD:EE:01') return { address: '10.0.0.1', port: 51826 };
      return null; // second device not found
    },
    createClient: () => {
      callCount++;
      return { addPairing: async () => {} };
    },
  });

  assert.equal(results.length, 2);
  const ok = results.find((r) => r.ok);
  const failed = results.find((r) => !r.ok);
  assert.ok(ok);
  assert.ok(failed);
  assert.equal(failed.reason, 'not found on network');
  assert.equal(callCount, 1, 'createClient called only for discovered device');
});
