import test from 'node:test';
import assert from 'node:assert/strict';
import { __testHooks, startSubscriber, getSubscriberStats, getSubscriberHealth, getRepairTargets } from '../src/subscriber.js';

const { PROBE } = __testHooks;

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
  assert.equal(await __testHooks.probeLiveness(session, client, { name: 'q' }, 'q', '2.10'), PROBE.ALIVE);
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

test('a probe answered with an HTTP error status counts as alive', async () => {
  __testHooks.resetState();
  __testHooks.setConnectAccessoryImpl(() => {});
  const session = started('answers-with-error');
  const err = Object.assign(new Error('Get failed with status 422'), { statusCode: 422 });
  const client = { async getCharacteristics() { throw err; }, off() {}, async close() {} };
  session.client = client;
  session.stats.subscribed = true;
  session.stats.lastHealthyAt = HOURS_AGO(1);

  assert.equal(await __testHooks.probeLiveness(session, client, { name: 'x' }, 'x', '1.2'), PROBE.ALIVE);
  assert.equal(session.client, client, 'not torn down');
  assert.equal(getSubscriberStats('answers-with-error').connected, true);
  __testHooks.resetState();
});

test('with a live subscription, an ambiguous probe error keeps it (no proof of life, no teardown)', async () => {
  for (const err of [
    Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:51000'), { code: 'ECONNREFUSED' }), // slot-limited device
    Object.assign(new Error('M4: Error: 2'), { statusCode: 2 }), // pair-verify error (TLV code, not HTTP)
  ]) {
    __testHooks.resetState();
    __testHooks.setConnectAccessoryImpl(() => {});
    const session = started('ambiguous');
    const client = { async getCharacteristics() { throw err; }, off() {}, async close() {} };
    session.client = client;
    session.stats.subscribed = true;
    const before = HOURS_AGO(1);
    session.stats.lastHealthyAt = before;

    // eslint-disable-next-line no-await-in-loop
    assert.equal(await __testHooks.probeLiveness(session, client, { name: 'a' }, 'a', '1.2'), PROBE.INCONCLUSIVE, err.message);
    assert.equal(session.client, client, `subscription kept: ${err.message}`);
    assert.equal(session.stats.lastHealthyAt, before, `no proof of life recorded: ${err.message}`);
    assert.equal(getSubscriberStats('ambiguous').connected, false, 'reported not connected once proof is too old');
  }
  __testHooks.resetState();
});

test('a bridge with nothing subscribed is reconnected on any probe failure', async () => {
  __testHooks.resetState();
  __testHooks.setReconnectWindow(5, 20);
  const connects = [];
  __testHooks.setConnectAccessoryImpl((_s, pairing) => { connects.push(pairing); });
  const session = started('idle-dead', { discoverDevice: async () => null, savePairing: async () => {} });
  connects.length = 0;
  const err = Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:51000'), { code: 'ECONNREFUSED' });
  const client = { async getAccessories() { throw err; }, off() {}, async close() {} };
  session.client = client;
  session.stats.nothingToWatch = true;
  session.stats.lastHealthyAt = HOURS_AGO(1);

  assert.equal(await __testHooks.probeLiveness(session, client, { name: 'i', address: '10.0.0.5', port: 51000 }, 'i', null), PROBE.DEAD);
  assert.equal(session.client, null);
  assert.equal(session.stats.nothingToWatch, false);
  await waitUntil(() => connects.length >= 1, { label: 'reconnect' });
  session.stopped = true;
  if (session.reconnectTimeout) clearTimeout(session.reconnectTimeout);
  __testHooks.resetState();
});

test('a successful auto re-pair reconnects (not blocked by the re-pair flag) on the address that worked', async () => {
  __testHooks.resetState();
  const connects = [];
  __testHooks.setConnectAccessoryImpl((s, pairing) => { connects.push({ repairing: s.repairing, pairing }); });
  __testHooks.setHttpClientFactory((_id, address) => ({
    async pairSetup() { if (address === '10.0.0.193') throw new Error('connect EHOSTUNREACH 10.0.0.193:55203'); },
    getLongTermData() { return { ltk: 'new' }; },
    async close() {},
  }));
  const saved = [];
  const session = started('repair-ok', {
    discoverDevice: async () => ({ address: '10.0.0.193', port: 55203, addresses: ['10.0.0.193', '172.16.25.26'] }),
    savePairing: async (_id, p) => { saved.push(p); },
  });
  connects.length = 0;
  const pairing = { name: 'Homebridge', address: '10.0.0.193', port: 55203, pin: '031-45-154', longTermData: {} };

  await __testHooks.attemptAutoRepair(session, pairing);
  assert.equal(connects.length, 1, 'reconnected after the re-pair');
  assert.equal(connects[0].repairing, false, 'not skipped as "re-pair in progress"');
  assert.equal(connects[0].pairing.address, '172.16.25.26', 'on the address the re-pair worked on');
  assert.equal(saved.at(-1).address, '172.16.25.26');
  assert.equal(session.repairRetryTimeout ?? null, null, 'no retry left behind');
  __testHooks.resetState();
});

test('a probe already running on the client reports busy, not alive', async () => {
  __testHooks.resetState();
  __testHooks.setConnectAccessoryImpl(() => {});
  const session = started('in-flight');
  let release;
  const client = { getCharacteristics: () => new Promise((r) => { release = r; }) };
  session.client = client;
  session.stats.subscribed = true;
  const first = __testHooks.probeLiveness(session, client, { name: 'f' }, 'f', '1.2');
  assert.equal(await __testHooks.probeLiveness(session, client, { name: 'f' }, 'f', '1.2'), PROBE.BUSY);
  release({ characteristics: [] });
  assert.equal(await first, PROBE.ALIVE);
  __testHooks.resetState();
});

test('the probe reads the accessory\'s own Name characteristic', async () => {
  const { nameCharacteristicKey } = await import('../src/accessory-metadata.js');
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
  assert.equal(nameCharacteristicKey(accessories), '1.4');
  assert.equal(nameCharacteristicKey({ accessories: [] }), null);
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

test('inconclusive probes re-arm a full interval later, and three in a row reconnect', async () => {
  __testHooks.resetState();
  __testHooks.setReconnectWindow(5, 20);
  __testHooks.setLivenessIdleMs(60_000);
  const connects = [];
  __testHooks.setConnectAccessoryImpl((_s, pairing) => { connects.push(pairing); });
  const session = started('revoked', { discoverDevice: async () => null, savePairing: async () => {} });
  connects.length = 0;
  const err = Object.assign(new Error('M4: Error: 2'), { statusCode: 2 });
  const client = { async getCharacteristics() { throw err; }, off() {}, async close() {} };
  session.client = client;
  session.stats.subscribed = true;
  session.stats.lastHealthyAt = HOURS_AGO(1); // stale: arming from it would give a 1 s timer
  session.probeKey = '1.2'; // as found by the connect

  // The timer path: an inconclusive result must re-arm at the full interval.
  __testHooks.startLivenessProbe(session, client, { name: 'r' }, 'r', 0);
  await waitUntil(() => session.authFailedProbes === 1, { label: 'first probe' });
  await waitUntil(() => session.livenessTimer, { label: 're-armed' });
  assert.equal(session.livenessDelayMs, 60_000, 'not a one-second loop');
  clearTimeout(session.livenessTimer);
  session.livenessTimer = null;

  assert.equal(await __testHooks.probeLiveness(session, client, { name: 'r' }, 'r', '1.2'), PROBE.INCONCLUSIVE);
  assert.equal(await __testHooks.probeLiveness(session, client, { name: 'r', address: '10.0.0.5', port: 1 }, 'r', '1.2'), PROBE.DEAD, 'third pair-verify failure in a row escalates');
  assert.equal(session.client, null);
  await waitUntil(() => connects.length >= 1, { label: 'reconnect (auth handling takes over)' });
  session.stopped = true;
  if (session.reconnectTimeout) clearTimeout(session.reconnectTimeout);
  __testHooks.resetState();
});

test('refused probes never escalate', async () => {
  __testHooks.resetState();
  __testHooks.setConnectAccessoryImpl(() => {});
  const session = started('slot-limited');
  const refused = Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:51000'), { code: 'ECONNREFUSED' });
  const client = { async getCharacteristics() { throw refused; }, off() {}, async close() {} };
  session.client = client;
  session.stats.subscribed = true;
  session.stats.lastHealthyAt = HOURS_AGO(1);
  for (let i = 0; i < 6; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    assert.equal(await __testHooks.probeLiveness(session, client, { name: 's' }, 's', '1.2'), PROBE.INCONCLUSIVE);
  }
  assert.equal(session.client, client, 'subscription kept through repeated refusals');
  assert.equal(session.authFailedProbes ?? 0, 0, 'refusals are not counted toward escalation');
  __testHooks.resetState();
});

test('only authentication failures in a row escalate; other answers reset the count', async () => {
  __testHooks.resetState();
  __testHooks.setConnectAccessoryImpl(() => {});
  const session = started('mixed');
  const auth = Object.assign(new Error('M4: Error: 2'), { statusCode: 2 });
  const busy = Object.assign(new Error('M2: Error: 7'), { statusCode: 7 });
  const epipe = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
  let next = auth;
  const client = { async getCharacteristics() { throw next; }, off() {}, async close() {} };
  session.client = client;
  session.stats.subscribed = true;
  session.stats.lastHealthyAt = HOURS_AGO(1);
  const probe = () => __testHooks.probeLiveness(session, client, { name: 'm' }, 'm', '1.2');

  for (const [err, count] of [[auth, 1], [auth, 2], [busy, 0], [auth, 1], [epipe, 0], [auth, 1], [auth, 2]]) {
    next = err;
    // eslint-disable-next-line no-await-in-loop
    assert.equal(await probe(), PROBE.INCONCLUSIVE, err.message);
    assert.equal(session.authFailedProbes, count, `after ${err.message}`);
  }
  assert.equal(session.client, client, 'never torn down: no three auth failures in a row');
  __testHooks.resetState();
});
