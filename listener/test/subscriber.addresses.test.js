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

test('a failed address rotates to the next announced one instead of retrying it', async () => {
  __testHooks.resetState();
  __testHooks.setReconnectWindow(5, 20);
  const connects = [];
  __testHooks.setConnectAccessoryImpl((_s, pairing) => { connects.push(pairing); });

  const session = makeSession();
  // Stored on the macvlan address, which this host cannot reach.
  const pairing = { name: 'Homebridge', address: '10.0.0.193', port: 55203 };
  __testHooks.rediscoverAndReconnect(session, pairing);

  await waitUntil(() => connects.length === 1, { label: 'reconnect' });
  assert.equal(connects[0].address, '172.16.25.26');
  assert.deepEqual(connects[0].addresses, ['10.0.0.193', '172.16.25.26']);
  assert.equal(session.saved[0].pairing.address, '172.16.25.26');
  done(session);
});

test('re-discovery that announces the same single address backs off as before', async () => {
  __testHooks.resetState();
  __testHooks.setReconnectWindow(5, 20);
  const connects = [];
  __testHooks.setConnectAccessoryImpl((_s, pairing) => { connects.push(pairing); });

  const session = makeSession({ discoverDevice: async () => ({ address: '10.0.0.5', port: 51000, addresses: ['10.0.0.5'] }) });
  __testHooks.rediscoverAndReconnect(session, { name: 'Plug', address: '10.0.0.5', port: 51000 });

  await waitUntil(() => session.stats.reconnectSchedules === 1, { label: 'backoff scheduled' });
  assert.equal(session.saved.length, 0);
  done(session);
});

test('after trying every announced address it backs off instead of cycling immediately', async () => {
  __testHooks.resetState();
  __testHooks.setReconnectWindow(5, 20);
  const connects = [];
  __testHooks.setConnectAccessoryImpl((_s, pairing) => { connects.push(pairing); });

  const session = makeSession();
  // First failure on the macvlan address: rotate now.
  __testHooks.rediscoverAndReconnect(session, { name: 'Homebridge', address: '10.0.0.193', port: 55203 });
  await waitUntil(() => connects.length === 1, { label: 'first rotation' });

  // The rotated-to address fails too: every announced address has now been
  // tried in this streak, so wait for the backoff rather than spinning.
  __testHooks.rediscoverAndReconnect(session, connects[0]);
  await waitUntil(() => session.stats.reconnectSchedules === 1, { label: 'backoff after full rotation' });
  assert.equal(session.addressRotations, 0, 'rotation streak reset for the next round');
  assert.ok(session.reconnectTimeout || connects.length === 2, 'the next attempt waits for the backoff timer');
  done(session);
});

test('no re-discovery result falls back to the stored announced addresses', async () => {
  __testHooks.resetState();
  __testHooks.setReconnectWindow(5, 20);
  const connects = [];
  __testHooks.setConnectAccessoryImpl((_s, pairing) => { connects.push(pairing); });

  const session = makeSession({ discoverDevice: async () => null });
  __testHooks.rediscoverAndReconnect(session, { name: 'Homebridge', address: '10.0.0.193', port: 55203, addresses: ['10.0.0.193', '172.16.25.26'] });

  await waitUntil(() => connects.length === 1, { label: 'reconnect from stored addresses' });
  assert.equal(connects[0].address, '172.16.25.26');
  done(session);
});
