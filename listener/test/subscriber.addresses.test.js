import test from 'node:test';
import assert from 'node:assert/strict';
import { __testHooks } from '../src/subscriber.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(predicate, { timeoutMs = 2000, label = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(5);
  }
  throw new Error(`waitUntil timed out after ${timeoutMs}ms waiting for ${label}`);
}

// A Homebridge container announced on a Docker bridge (reachable from the
// listener's host) and on a macvlan (not reachable from that host).
const ANNOUNCED = { address: '10.0.0.193', port: 55203, addresses: ['10.0.0.193', '172.16.25.26'] };

// Stop a session so its pending backoff timer can't fire into the next test.
function done(session) {
  session.stopped = true;
  if (session.reconnectTimeout) clearTimeout(session.reconnectTimeout);
  __testHooks.resetState();
}

function makeSession(overrides = {}) {
  const saved = [];
  return {
    saved,
    stopped: false,
    deviceId: 'hb-1',
    retryDelayMs: 5,
    reconnectTimeout: null,
    stats: { reconnectSchedules: 0 },
    discoverDevice: async () => ANNOUNCED,
    savePairing: async (id, pairing) => { saved.push({ id, pairing }); },
    getPairing: () => null,
    ...overrides,
  };
}

function setup(overrides) {
  __testHooks.resetState();
  __testHooks.setReconnectWindow(5, 20);
  const connects = [];
  __testHooks.setConnectAccessoryImpl((_s, pairing) => { connects.push(pairing); });
  return { connects, session: makeSession(overrides) };
}

test('a first failure on a still-announced address retries it after backoff instead of switching', async () => {
  const { connects, session } = setup();
  // A working address that reset once (device restart): don't jump to the
  // other announced address, which this host may not reach.
  __testHooks.rediscoverAndReconnect(session, { name: 'Homebridge', address: '172.16.25.26', port: 55203 });

  await waitUntil(() => session.stats.reconnectSchedules === 1, { label: 'backoff retry' });
  await waitUntil(() => connects.length === 1, { label: 'retry fired' });
  assert.equal(connects[0].address, '172.16.25.26');
  assert.deepEqual(session.saved[0].pairing.addresses, ['10.0.0.193', '172.16.25.26'], 'addresses recorded');
  done(session);
});

test('a second consecutive failure on the same address moves to the next announced one', async () => {
  const { connects, session } = setup();
  const pairing = { name: 'Homebridge', address: '10.0.0.193', port: 55203 };
  __testHooks.rediscoverAndReconnect(session, pairing);
  await waitUntil(() => connects.length === 1, { label: 'backoff retry' });
  assert.equal(connects[0].address, '10.0.0.193');

  __testHooks.rediscoverAndReconnect(session, connects[0]);
  await waitUntil(() => connects.length === 2, { label: 'rotation' });
  assert.equal(connects[1].address, '172.16.25.26');
  assert.equal(session.stats.reconnectSchedules, 1, 'the switch itself is immediate');
  assert.equal(session.saved.at(-1).pairing.address, '172.16.25.26');
  done(session);
});

test('an address that is no longer announced or known is abandoned straight away', async () => {
  const { connects, session } = setup();
  __testHooks.rediscoverAndReconnect(session, { name: 'Homebridge', address: '192.168.1.9', port: 55203 });
  await waitUntil(() => connects.length === 1, { label: 'switch' });
  assert.equal(connects[0].address, '10.0.0.193');
  done(session);
});

test('discovery reporting only part of the announcement does not drop a known address', async () => {
  // dnssd resolves a service on its first address; the reachable one may be missing.
  const { connects, session } = setup({ discoverDevice: async () => ({ address: '10.0.0.193', port: 55203, addresses: ['10.0.0.193'] }) });
  const pairing = { name: 'Homebridge', address: '10.0.0.193', port: 55203, addresses: ['10.0.0.193', '172.16.25.26'] };
  __testHooks.rediscoverAndReconnect(session, pairing);
  await waitUntil(() => connects.length === 1, { label: 'retry' });
  __testHooks.rediscoverAndReconnect(session, connects[0]);
  await waitUntil(() => connects.length === 2, { label: 'rotation' });

  assert.equal(connects[1].address, '172.16.25.26');
  assert.deepEqual(connects[1].addresses, ['10.0.0.193', '172.16.25.26']);
  done(session);
});

test('a single announced address keeps backing off', async () => {
  const { connects, session } = setup({ discoverDevice: async () => ({ address: '10.0.0.5', port: 51000, addresses: ['10.0.0.5'] }) });
  __testHooks.rediscoverAndReconnect(session, { name: 'Plug', address: '10.0.0.5', port: 51000 });
  await waitUntil(() => connects.length === 1, { label: 'first retry' });
  __testHooks.rediscoverAndReconnect(session, connects[0]);
  await waitUntil(() => session.stats.reconnectSchedules === 2, { label: 'second backoff' });
  assert.ok(connects.every((p) => p.address === '10.0.0.5'));
  done(session);
});

test('no re-discovery result falls back to the stored addresses', async () => {
  const { connects, session } = setup({ discoverDevice: async () => null });
  const pairing = { name: 'Homebridge', address: '10.0.0.193', port: 55203, addresses: ['10.0.0.193', '172.16.25.26'] };
  __testHooks.rediscoverAndReconnect(session, pairing);
  await waitUntil(() => connects.length === 1, { label: 'retry' });
  __testHooks.rediscoverAndReconnect(session, connects[0]);
  await waitUntil(() => connects.length === 2, { label: 'rotation from stored addresses' });
  assert.equal(connects[1].address, '172.16.25.26');
  done(session);
});
