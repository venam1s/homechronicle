import test from 'node:test';
import assert from 'node:assert/strict';
import { generateControllerIdentity, resolveControllerIdentity, buildTargetPairing } from '../src/add-pairing-helpers.js';

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
