import test from 'node:test';
import assert from 'node:assert/strict';
import { generateControllerIdentity } from '../src/add-pairing-helpers.js';

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
