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

test('addressesToTry puts the last working address first while it is still announced', async () => {
  const { addressesToTry } = await import('../src/hap-addresses.js');
  assert.deepEqual(addressesToTry('172.16.25.26', ['10.0.0.193', '172.16.25.26']), ['172.16.25.26', '10.0.0.193']);
  assert.deepEqual(addressesToTry('172.16.25.26', ['10.0.0.193'], ['10.0.0.193', '172.16.25.26']), ['10.0.0.193', '172.16.25.26'], 'not announced this time: known, after announced');
  assert.deepEqual(addressesToTry('192.168.1.9', ['10.0.0.5']), ['10.0.0.5', '192.168.1.9'], 'a stale address goes last');
});

test('tryEachAddress fails over only on connection errors', async () => {
  const { tryEachAddress } = await import('../src/hap-addresses.js');
  const tried = [];
  const skipped = [];
  const { result, address } = await tryEachAddress(['a', 'b'], async (addr) => {
    tried.push(addr);
    if (addr === 'a') throw new Error('connect EHOSTUNREACH a');
    return 'ok';
  }, (addr, _err, next) => skipped.push([addr, next]));
  assert.deepEqual({ result, address, tried, skipped }, { result: 'ok', address: 'b', tried: ['a', 'b'], skipped: [['a', 'b']] });

  const pinTried = [];
  await assert.rejects(tryEachAddress(['a', 'b'], async (addr) => {
    pinTried.push(addr);
    throw new Error('M4: Error: 2');
  }), /M4/);
  assert.deepEqual(pinTried, ['a']);
});

test('abortHapClient closes the client and never throws', async () => {
  const { abortHapClient } = await import('../src/hap-addresses.js');
  let closed = 0;
  abortHapClient({ async close() { closed += 1; } });
  abortHapClient({ close() { throw new Error('boom'); } });
  abortHapClient({ async close() { throw new Error('boom'); } });
  abortHapClient(null);
  await new Promise((r) => setImmediate(r));
  assert.equal(closed, 1);
});

test('rememberAddresses keeps the known order, adds new ones and drops old stale ones over the limit', async () => {
  const { rememberAddresses } = await import('../src/hap-addresses.js');
  assert.deepEqual(rememberAddresses(['a', 'b'], ['b', 'a']), ['a', 'b'], 'a reshuffled announcement is not a change');
  assert.deepEqual(rememberAddresses(['a'], ['b']), ['a', 'b']);
  assert.deepEqual(
    rememberAddresses(['old1', 'old2', 'cur', 'old3'], ['new1'], 'cur'),
    ['old2', 'cur', 'old3', 'new1'],
    'over four: the oldest address not announced and not in use goes',
  );
});
