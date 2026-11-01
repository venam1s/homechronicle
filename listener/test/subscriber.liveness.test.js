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

test('a quiet device stays connected because the liveness probe keeps answering', async () => {
  __testHooks.resetState();
  __testHooks.setConnectAccessoryImpl(() => {});
  __testHooks.setLivenessIdleMs(60_000);
  const session = started('live-quiet');
  const reads = [];
  const client = {
    subscriptionConnection: { socket: { destroyed: false, readyState: 'open' } },
    async getCharacteristics(keys) { reads.push(keys); return { characteristics: [] }; },
  };
  session.client = client;
  session.stats.subscribed = true;
  session.stats.lastHealthyAt = HOURS_AGO(6); // nothing for hours

  assert.equal(getSubscriberStats('live-quiet').connected, false, 'no recent proof yet');
  await __testHooks.probeLiveness(session, client, { name: 'q' }, 'q', '2.10');
  assert.deepEqual(reads, [['2.10']]);
  assert.equal(getSubscriberStats('live-quiet').connected, true, 'the answer is proof of life');
  assert.equal(getSubscriberHealth().stale, 0);
  __testHooks.resetState();
});

test('a device that stops answering the probe is reconnected', async () => {
  __testHooks.resetState();
  __testHooks.setReconnectWindow(5, 20);
  __testHooks.setLivenessIdleMs(60_000);
  const connects = [];
  __testHooks.setConnectAccessoryImpl((_s, pairing) => { connects.push(pairing); });
  const session = started('wedged', { discoverDevice: async () => null, savePairing: async () => {} });
  connects.length = 0; // ignore startSubscriber's own first connect
  let closed = 0;
  const client = {
    subscriptionConnection: { socket: { destroyed: false, readyState: 'open' } },
    async getCharacteristics() { throw Object.assign(new Error('liveness probe timed out after 30000ms'), { code: 'ETIMEDOUT' }); },
    off() {},
    async close() { closed += 1; },
  };
  session.client = client;
  session.stats.subscribed = true;
  session.stats.lastHealthyAt = HOURS_AGO(1);
  const pairing = { name: 'wedged', address: '172.16.25.26', port: 51000 };

  await __testHooks.probeLiveness(session, client, pairing, 'wedged', '2.10');
  assert.equal(session.client, null, 'client released');
  assert.equal(closed, 1);
  assert.equal(session.stats.subscribed, false);
  await waitUntil(() => connects.length === 1, { label: 'reconnect' });
  assert.equal(connects[0].address, '172.16.25.26');
  session.stopped = true;
  if (session.reconnectTimeout) clearTimeout(session.reconnectTimeout);
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

test('a bridge with nothing to watch is connected and idle while it answers, and is not repaired nightly', async () => {
  __testHooks.resetState();
  __testHooks.setConnectAccessoryImpl(() => {});
  __testHooks.setLivenessIdleMs(60_000);
  const session = started('idle-bridge');
  let probed = 0;
  const client = { async getAccessories() { probed += 1; return { accessories: [] }; } };
  session.client = client;
  session.stats.nothingToWatch = true;
  session.stats.lastHealthyAt = HOURS_AGO(2);

  await __testHooks.probeLiveness(session, client, { name: 'idle' }, 'idle', null);
  assert.equal(probed, 1, 'probed with getAccessories: there is no characteristic to read');
  const health = getSubscriberHealth();
  assert.equal(health.connected, 1);
  assert.equal(health.idle, 1);
  assert.equal(health.stale, 0);
  assert.equal(getRepairTargets().find((t) => t.deviceId === 'idle-bridge'), undefined);
  __testHooks.resetState();
});

test('sessions started without callbacks fall back to the default discovery callbacks', async () => {
  __testHooks.resetState();
  __testHooks.setConnectAccessoryImpl(() => {});
  const { setDefaultSubscriberOptions } = await import('../src/subscriber.js');
  const discoverDevice = async () => null;
  const savePairing = async () => {};
  setDefaultSubscriberOptions({ discoverDevice, savePairing });
  const session = started('restarted-by-repair');
  assert.equal(session.discoverDevice, discoverDevice);
  assert.equal(session.savePairing, savePairing);
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
  assert.equal(getSubscriberHealth().stale, 0, 'counted as unreachable, not also as stale');
  assert.equal(getRepairTargets().find((t) => t.deviceId === 'gone'), undefined, 'left to its slow retry');
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

test('a probe that gets any answer — an HTTP error status or a refused extra connection — counts as alive', async () => {
  for (const err of [
    Object.assign(new Error('Get failed with status 422'), { statusCode: 422 }),
    Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:51000'), { code: 'ECONNREFUSED' }),
  ]) {
    __testHooks.resetState();
    __testHooks.setConnectAccessoryImpl(() => {});
    const session = started('answers-with-error');
    const client = { async getCharacteristics() { throw err; }, off() {}, async close() {} };
    session.client = client;
    session.stats.subscribed = true;
    session.stats.lastHealthyAt = HOURS_AGO(1);

    // eslint-disable-next-line no-await-in-loop
    const alive = await __testHooks.probeLiveness(session, client, { name: 'x' }, 'x', '1.2');
    assert.equal(alive, true, err.message);
    assert.equal(session.client, client, `not torn down: ${err.message}`);
    assert.equal(getSubscriberStats('answers-with-error').connected, true);
  }
  __testHooks.resetState();
});

test('the probe reads the accessory\'s own Name characteristic', () => {
  const accessories = { accessories: [
    { aid: 2, services: [{ type: '0000003E-0000-1000-8000-0026BB765291', characteristics: [{ iid: 9, type: '00000023-0000-1000-8000-0026BB765291' }] }] },
    { aid: 1, services: [
      { type: '000000A2-0000-1000-8000-0026BB765291', characteristics: [{ iid: 3, type: '00000037-0000-1000-8000-0026BB765291' }] },
      { type: '0000003E-0000-1000-8000-0026BB765291', characteristics: [
        { iid: 2, type: '00000014-0000-1000-8000-0026BB765291' },
        { iid: 4, type: '00000023-0000-1000-8000-0026BB765291' },
      ] },
    ] },
  ] };
  assert.equal(__testHooks.findProbeKey(accessories), '1.4');
  assert.equal(__testHooks.findProbeKey({ accessories: [] }), null);
});

test('a second reconnect replaces a pending one instead of running alongside it', async () => {
  __testHooks.resetState();
  __testHooks.setReconnectWindow(30, 60);
  const connects = [];
  __testHooks.setConnectAccessoryImpl((_s, pairing) => { connects.push(pairing); });
  const session = started('one-timer');
  connects.length = 0;
  __testHooks.scheduleReconnect(session, { name: 'one-timer', address: '10.0.0.1', port: 1 });
  __testHooks.scheduleReconnect(session, { name: 'one-timer', address: '10.0.0.1', port: 1 });
  await sleep(200);
  assert.equal(connects.length, 1);
  session.stopped = true;
  if (session.reconnectTimeout) clearTimeout(session.reconnectTimeout);
  __testHooks.resetState();
});
