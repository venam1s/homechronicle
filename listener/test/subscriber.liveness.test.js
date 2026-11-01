import test from 'node:test';
import assert from 'node:assert/strict';
import { __testHooks, startSubscriber, getSubscriberStats, getSubscriberHealth, getRepairTargets } from '../src/subscriber.js';

const HOURS_AGO = (h) => new Date(Date.now() - h * 3_600_000).toISOString();

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

function started(id, overrides = {}) {
  startSubscriber(id, { name: id, address: '10.0.0.1', port: 1234, longTermData: {} }, {}, null, overrides);
  return __testHooks.getSession(id);
}

// A subscribed session whose event socket is in the given state.
function withSocket(session, socket) {
  session.client = { subscriptionConnection: socket ? { socket } : undefined };
  session.stats.subscribed = true;
}

test('a quiet subscription with an open event socket is connected, however old its last event', () => {
  __testHooks.resetState();
  __testHooks.setConnectAccessoryImpl(() => {});
  const session = started('live-quiet');
  withSocket(session, { destroyed: false, readyState: 'open' });
  session.stats.lastHealthyAt = HOURS_AGO(6);

  assert.equal(getSubscriberStats('live-quiet').connected, true);
  const health = getSubscriberHealth();
  assert.equal(health.connected, 1);
  assert.equal(health.stale, 0, 'quiet is not stale');
  __testHooks.resetState();
});

test('a closed or destroyed event socket is not connected', () => {
  __testHooks.resetState();
  __testHooks.setConnectAccessoryImpl(() => {});
  const session = started('dead-socket');
  withSocket(session, { destroyed: true, readyState: 'closed' });
  session.stats.lastHealthyAt = new Date().toISOString();

  assert.equal(getSubscriberStats('dead-socket').connected, false);
  __testHooks.resetState();
});

test('a bridge with nothing to watch counts as idle, not stale, and is not repaired nightly', () => {
  __testHooks.resetState();
  __testHooks.setConnectAccessoryImpl(() => {});
  const session = started('idle-bridge');
  session.stats.nothingToWatch = true;
  session.stats.lastHealthyAt = HOURS_AGO(30);

  const health = getSubscriberHealth();
  assert.equal(health.idle, 1);
  assert.equal(health.stale, 0);
  assert.equal(getRepairTargets().find((t) => t.deviceId === 'idle-bridge'), undefined);
  __testHooks.resetState();
});

test('repeated failures with the device absent from the network switch to the slow, quiet retry', async () => {
  __testHooks.resetState();
  __testHooks.setReconnectWindow(5, 20);
  __testHooks.setUnreachableRetryMs(777);
  const connects = [];
  __testHooks.setConnectAccessoryImpl((_s, pairing) => { connects.push(pairing); });
  const session = started('gone', { discoverDevice: async () => null, savePairing: async () => {} });
  const timeout = Object.assign(new Error('getAccessories timed out after 30000ms'), { code: 'ETIMEDOUT' });

  for (let i = 1; i <= 5; i += 1) {
    __testHooks.rediscoverAndReconnect(session, { name: 'gone', address: '172.16.1.76', port: 21063 }, timeout);
    // eslint-disable-next-line no-await-in-loop
    await waitUntil(() => session.stats.reconnectSchedules === i, { label: `failure ${i}` });
    if (i < 5) assert.equal(session.stats.unreachable, undefined, `not yet after ${i}`);
  }
  assert.equal(session.stats.unreachable, true);
  assert.equal(session.retryDelayMs, 777, 'next retry waits the unreachable interval');
  assert.equal(getSubscriberHealth().unreachable, 1);
  assert.equal(getSubscriberStats('gone').unreachable, true);

  // It reappears on the network: back to the normal fast reconnect.
  session.discoverDevice = async () => ({ address: '10.0.0.76', port: 21063, addresses: ['10.0.0.76'] });
  __testHooks.rediscoverAndReconnect(session, { name: 'gone', address: '172.16.1.76', port: 21063 }, timeout);
  await waitUntil(() => session.stats.unreachable === false, { label: 'reachable again' });
  await waitUntil(() => connects.some((p) => p.address === '10.0.0.76'), { label: 'moved to the announced address' });

  session.stopped = true;
  if (session.reconnectTimeout) clearTimeout(session.reconnectTimeout);
  __testHooks.resetState();
});

test('a device that is announced but failing is never marked unreachable', async () => {
  __testHooks.resetState();
  __testHooks.setReconnectWindow(5, 20);
  __testHooks.setConnectAccessoryImpl(() => {});
  const session = started('announced', {
    discoverDevice: async () => ({ address: '10.0.0.5', port: 51000, addresses: ['10.0.0.5'] }),
    savePairing: async () => {},
  });
  const refused = Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:51000'), { code: 'ECONNREFUSED' });
  for (let i = 1; i <= 7; i += 1) {
    __testHooks.rediscoverAndReconnect(session, { name: 'announced', address: '10.0.0.5', port: 51000 }, refused);
    // eslint-disable-next-line no-await-in-loop
    await waitUntil(() => session.stats.reconnectSchedules === i, { label: `failure ${i}` });
  }
  assert.ok(!session.stats.unreachable);
  assert.ok(session.retryDelayMs <= 20, 'normal backoff cap');
  session.stopped = true;
  if (session.reconnectTimeout) clearTimeout(session.reconnectTimeout);
  __testHooks.resetState();
});
