import test from 'node:test';
import assert from 'node:assert/strict';
import { advertisedAddresses, nextAddress, reconcileAdvertisedAddress, isConnectionError } from '../src/hap-addresses.js';

test('advertisedAddresses keeps every announced address once, in announcement order', () => {
  assert.deepEqual(advertisedAddresses({ address: '172.16.25.26', allAddresses: ['172.16.25.26', '10.0.0.193', '172.16.25.26'] }), ['172.16.25.26', '10.0.0.193']);
  assert.deepEqual(advertisedAddresses({ address: '10.0.0.5' }), ['10.0.0.5']);
  assert.deepEqual(advertisedAddresses({ address: '10.0.0.5', addresses: ['10.0.0.5', 'fe80::1'] }), ['10.0.0.5', 'fe80::1']);
  assert.deepEqual(advertisedAddresses(null), []);
});

test('nextAddress rotates past the address that just failed', () => {
  const list = ['172.16.25.26', '10.0.0.193'];
  assert.equal(nextAddress('172.16.25.26', list), '10.0.0.193');
  assert.equal(nextAddress('10.0.0.193', list), '172.16.25.26');
  assert.equal(nextAddress('192.168.1.9', list), '172.16.25.26', 'a stale address starts from the first announced one');
  assert.equal(nextAddress('10.0.0.5', ['10.0.0.5']), '10.0.0.5');
  assert.equal(nextAddress('10.0.0.5', []), null);
});

test('reconcileAdvertisedAddress keeps a working address when the announcement order changes', () => {
  const pairing = { address: '172.16.25.26', port: 55203 };
  const seen = { address: '10.0.0.193', port: 55203, allAddresses: ['10.0.0.193', '172.16.25.26'] };
  assert.deepEqual(reconcileAdvertisedAddress(pairing, seen), {
    address: '172.16.25.26', port: 55203, addresses: ['10.0.0.193', '172.16.25.26'], changed: true,
  });
});

test('reconcileAdvertisedAddress moves to an announced address only when the current one is gone', () => {
  const pairing = { address: '172.16.25.26', port: 55203, addresses: ['172.16.25.26'] };
  const seen = { address: '10.0.0.193', port: 51000, allAddresses: ['10.0.0.193', '172.16.25.40'] };
  assert.deepEqual(reconcileAdvertisedAddress(pairing, seen), {
    address: '10.0.0.193', port: 51000, addresses: ['10.0.0.193', '172.16.25.40'], changed: true,
  });
});

test('reconcileAdvertisedAddress reports no change when nothing differs', () => {
  const pairing = { address: '172.16.25.26', port: 55203, addresses: ['172.16.25.26', '10.0.0.193'] };
  const seen = { address: '172.16.25.26', port: 55203, allAddresses: ['172.16.25.26', '10.0.0.193'] };
  assert.equal(reconcileAdvertisedAddress(pairing, seen).changed, false);
});

test('isConnectionError recognises refused, unreachable and timed-out connections', () => {
  assert.ok(isConnectionError(new Error('connect ECONNREFUSED 10.0.0.5:51000')));
  assert.ok(isConnectionError(new Error('connect EHOSTUNREACH 10.0.0.193:55203')));
  assert.ok(isConnectionError(new Error('connect ENETUNREACH 10.0.0.193:55203')));
  assert.ok(isConnectionError(Object.assign(new Error('getAccessories timed out after 30000ms'), { code: 'ETIMEDOUT' })));
  assert.ok(!isConnectionError(new Error('M4: Error: 2 (authentication)')));
  assert.ok(!isConnectionError(null));
});
