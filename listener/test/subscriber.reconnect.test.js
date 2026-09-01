import test from 'node:test';
import assert from 'node:assert/strict';
import { __testHooks } from '../src/subscriber.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for a condition instead of guessing at a duration.
 *
 * A fixed `sleep()` standing in for "the reconnect loop has run N times" is a
 * race, and it lost twice on CI: the runner is capped at 2 CPUs, only two of
 * the three reconnect attempts landed inside the window, so the implicit
 * auto-repair never fired and the count came up 2 instead of 3. Polling the
 * actual condition is both faster in the normal case and immune to load.
 */
async function waitUntil(predicate, { timeoutMs = 5000, label = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(5);
  }
  throw new Error(`waitUntil timed out after ${timeoutMs}ms waiting for ${label}`);
}

test('scheduleReconnect refreshes pairing before reconnecting', async () => {
  __testHooks.resetState();
  __testHooks.setReconnectWindow(5, 20);

  let reconnectedWith = null;
  __testHooks.setConnectAccessoryImpl((_session, pairing) => {
    reconnectedWith = pairing;
  });

  const session = {
    stopped: false,
    deviceId: 'dev-1',
    retryDelayMs: 5,
    reconnectTimeout: null,
    getPairing: () => ({ name: 'Device', address: '10.0.0.2', port: 5678 }),
  };
  const initialPairing = { name: 'Device', address: '10.0.0.1', port: 1234 };

  __testHooks.scheduleReconnect(session, initialPairing);
  await sleep(30);

  assert.equal(session.retryDelayMs, 10);
  assert.equal(reconnectedWith.address, '10.0.0.2');
  assert.equal(reconnectedWith.port, 5678);

  __testHooks.resetState();
});

test('isAuthError recognises M4: Error: 2', () => {
  const { isAuthError } = __testHooks;
  assert.equal(isAuthError(new Error('M4: Error: 2')), true);
  assert.equal(isAuthError(new Error('M2: Error: 2')), true);
  assert.equal(isAuthError(new Error('M2: Signature verification failed')), true);
  assert.equal(isAuthError(new Error('Connection refused')), false);
  assert.equal(isAuthError(new Error('M4: Error: 3')), false);
  assert.equal(isAuthError(new Error('M4: Error: 4')), false);
});

test('isMaxPeersError recognises M4: Error: 4', () => {
  const { isMaxPeersError } = __testHooks;
  assert.equal(isMaxPeersError(new Error('M4: Error: 4')), true);
  assert.equal(isMaxPeersError(new Error('maxpeers')), true);
  assert.equal(isMaxPeersError(new Error('M4: Error: 2')), false);
  assert.equal(isMaxPeersError(new Error('Connection refused')), false);
});

test('new stats fields are initialised', async () => {
  __testHooks.resetState();
  __testHooks.setConnectAccessoryImpl(() => {});

  const { startSubscriber } = await import('../src/subscriber.js');
  startSubscriber('stats-init-1', {
    name: 'Stats Test',
    address: '10.0.0.1',
    port: 1234,
    longTermData: {},
  });

  const session = __testHooks.getSession('stats-init-1');
  assert.equal(session.stats.authFailures, 0);
  assert.equal(session.stats.authFailed, false);
  assert.equal(session.stats.needsRepair, false);
  assert.equal(session.stats.autoRepairAttempts, 0);
  assert.equal(session.stats.autoRepairLastError, null);
  assert.equal(session.stats.autoRepairedAt, null);
  assert.equal(session.repairing, false);

  __testHooks.resetState();
});

test('connectAccessory skips when session.repairing is true', async () => {
  __testHooks.resetState();
  __testHooks.setReconnectWindow(5, 20);

  let connectCount = 0;
  __testHooks.setConnectAccessoryImpl((session) => {
    connectCount += 1;
  });

  const { startSubscriber } = await import('../src/subscriber.js');
  startSubscriber('repair-guard-1', {
    name: 'Guard Test',
    address: '10.0.0.1',
    port: 1234,
    longTermData: {},
  });

  // First connect already happened
  assert.equal(connectCount, 1);
  const session = __testHooks.getSession('repair-guard-1');
  session.repairing = true;

  // Schedule a reconnect — should be blocked by repairing guard
  connectCount = 0;
  __testHooks.scheduleReconnect(session, { name: 'Guard Test', address: '10.0.0.1', port: 1234 });
  await sleep(50);

  assert.equal(connectCount, 0, 'connectAccessory should not fire while repairing');
  session.repairing = false;

  __testHooks.resetState();
});

test('scheduleReconnect stops growth at max reconnect delay', () => {
  __testHooks.resetState();
  __testHooks.setReconnectWindow(5, 20);
  __testHooks.setConnectAccessoryImpl(() => {});

  const session = {
    stopped: false,
    deviceId: 'dev-2',
    retryDelayMs: 20,
    reconnectTimeout: null,
  };

  __testHooks.scheduleReconnect(session, { name: 'Device', address: 'x', port: 1 });
  assert.equal(session.retryDelayMs, 20);
  clearTimeout(session.reconnectTimeout);
  session.stopped = true;

  __testHooks.resetState();
});

test('attemptAutoRepair marks needsRepair when no PIN stored', async () => {
  __testHooks.resetState();
  __testHooks.setConnectAccessoryImpl(() => {});

  const { startSubscriber } = await import('../src/subscriber.js');
  startSubscriber('no-pin-1', {
    name: 'No Pin Device',
    address: '10.0.0.1',
    port: 1234,
    longTermData: {},
  });

  const session = __testHooks.getSession('no-pin-1');
  session.stats.authFailures = 3;
  session.stats.authFailed = true;

  await __testHooks.attemptAutoRepair(session, {
    name: 'No Pin Device',
    address: '10.0.0.1',
    port: 1234,
    longTermData: {},
  });

  assert.equal(session.stats.needsRepair, true);
  assert.equal(session.stats.autoRepairAttempts, 0, 'should not count as attempt without PIN');
  __testHooks.resetState();
});

test('attemptAutoRepair marks needsRepair when no callbacks configured', async () => {
  __testHooks.resetState();
  __testHooks.setConnectAccessoryImpl(() => {});

  const { startSubscriber } = await import('../src/subscriber.js');
  startSubscriber('no-cb-1', {
    name: 'No Callback Device',
    address: '10.0.0.1',
    port: 1234,
    pin: '111-22-333',
    longTermData: {},
  });

  const session = __testHooks.getSession('no-cb-1');
  session.stats.authFailures = 3;
  session.stats.authFailed = true;

  await __testHooks.attemptAutoRepair(session, {
    name: 'No Callback Device',
    pin: '111-22-333',
    longTermData: {},
  });

  assert.equal(session.stats.needsRepair, true);
  assert.equal(session.stats.autoRepairAttempts, 0, 'should not count without callbacks');
  __testHooks.resetState();
});

test('attemptAutoRepair increments attempts when discovery fails', async () => {
  __testHooks.resetState();
  __testHooks.setConnectAccessoryImpl(() => {});

  const { startSubscriber } = await import('../src/subscriber.js');
  startSubscriber('disc-fail-1', {
    name: 'Disc Fail Device',
    address: '10.0.0.1',
    port: 1234,
    pin: '111-22-333',
    longTermData: {},
  }, {}, null, {
    discoverDevice: async () => null,
    savePairing: async () => {},
  });

  const session = __testHooks.getSession('disc-fail-1');
  session.stats.authFailures = 3;
  session.stats.authFailed = true;

  await __testHooks.attemptAutoRepair(session, {
    name: 'Disc Fail Device',
    pin: '111-22-333',
    longTermData: {},
  });

  assert.equal(session.stats.autoRepairAttempts, 1);
  assert.equal(session.stats.needsRepair, false, 'not yet at circuit breaker');
  assert.equal(session.repairing, false, 'repairing flag cleared');
  __testHooks.resetState();
});

test('attemptAutoRepair circuit breaker after 3 attempts', async () => {
  __testHooks.resetState();
  __testHooks.setConnectAccessoryImpl(() => {});

  const { startSubscriber } = await import('../src/subscriber.js');
  startSubscriber('circuit-1', {
    name: 'Circuit Device',
    address: '10.0.0.1',
    port: 1234,
    pin: '111-22-333',
    longTermData: {},
  }, {}, null, {
    discoverDevice: async () => null,
    savePairing: async () => {},
  });

  const session = __testHooks.getSession('circuit-1');
  session.stats.authFailures = 3;
  session.stats.authFailed = true;

  const pairing = { name: 'Circuit Device', pin: '111-22-333', longTermData: {} };

  await __testHooks.attemptAutoRepair(session, pairing);
  assert.equal(session.stats.autoRepairAttempts, 1);
  assert.equal(session.stats.needsRepair, false);

  await __testHooks.attemptAutoRepair(session, pairing);
  assert.equal(session.stats.autoRepairAttempts, 2);
  assert.equal(session.stats.needsRepair, false);

  await __testHooks.attemptAutoRepair(session, pairing);
  assert.equal(session.stats.autoRepairAttempts, 3);
  assert.equal(session.stats.needsRepair, true, 'circuit breaker tripped');

  await __testHooks.attemptAutoRepair(session, pairing);
  assert.equal(session.stats.autoRepairAttempts, 3, 'should not increment past breaker');

  __testHooks.resetState();
});

test('attemptAutoRepair sets repairing flag during execution', async () => {
  __testHooks.resetState();
  __testHooks.setConnectAccessoryImpl(() => {});

  let repairingDuringDiscovery = null;

  const { startSubscriber } = await import('../src/subscriber.js');
  startSubscriber('flag-1', {
    name: 'Flag Device',
    address: '10.0.0.1',
    port: 1234,
    pin: '111-22-333',
    longTermData: {},
  }, {}, null, {
    discoverDevice: async (id) => {
      const s = __testHooks.getSession('flag-1');
      repairingDuringDiscovery = s.repairing;
      return null;
    },
    savePairing: async () => {},
  });

  const session = __testHooks.getSession('flag-1');
  session.stats.authFailures = 3;
  session.stats.authFailed = true;

  await __testHooks.attemptAutoRepair(session, {
    name: 'Flag Device',
    pin: '111-22-333',
    longTermData: {},
  });

  assert.equal(repairingDuringDiscovery, true, 'repairing should be true during discovery');
  assert.equal(session.repairing, false, 'repairing should be cleared after completion');

  __testHooks.resetState();
});

test('getSubscriberHealth includes needsRepair count', async () => {
  __testHooks.resetState();
  __testHooks.setConnectAccessoryImpl(() => {});

  const { startSubscriber, getSubscriberHealth } = await import('../src/subscriber.js');
  startSubscriber('health-1', {
    name: 'Healthy Device',
    address: '10.0.0.1',
    port: 1234,
    longTermData: {},
  });
  startSubscriber('health-2', {
    name: 'Broken Device',
    address: '10.0.0.2',
    port: 1234,
    longTermData: {},
  });

  const session2 = __testHooks.getSession('health-2');
  session2.stats.needsRepair = true;

  const health = getSubscriberHealth();
  assert.equal(health.total, 2);
  assert.equal(health.needsRepair, 1);

  __testHooks.resetState();
});

test('full flow: auth errors → no PIN → needsRepair', async () => {
  __testHooks.resetState();
  __testHooks.setReconnectWindow(5, 10);

  let connectCount = 0;
  __testHooks.setConnectAccessoryImpl((session, pairing) => {
    connectCount += 1;
    session.stats.accessoriesQueryFailures += 1;
    session.stats.lastError = 'M4: Error: 2';
    session.stats.lastErrorAt = new Date().toISOString();
    session.stats.authFailures += 1;

    if (session.stats.authFailures >= 3) {
      session.stats.authFailed = true;
      __testHooks.attemptAutoRepair(session, pairing);
    } else {
      __testHooks.scheduleReconnect(session, pairing);
    }
  });

  const { startSubscriber, getSubscriberStats, getSubscriberHealth } = await import('../src/subscriber.js');
  startSubscriber('e2e-1', {
    name: 'E2E Device',
    address: '10.0.0.1',
    port: 1234,
    longTermData: {},
  });

  await sleep(200);

  const stats = getSubscriberStats('e2e-1');
  assert.equal(stats.authFailed, true);
  assert.equal(stats.needsRepair, true);
  assert.equal(stats.autoRepairAttempts, 0, 'no attempts without PIN');
  assert.ok(connectCount >= 3, 'should have retried 3 times');

  const health = getSubscriberHealth();
  assert.equal(health.needsRepair, 1);

  __testHooks.resetState();
});

test('transient errors do NOT trigger auth failure path', async () => {
  __testHooks.resetState();
  __testHooks.setReconnectWindow(5, 10);

  let connectCount = 0;
  __testHooks.setConnectAccessoryImpl((session, pairing) => {
    connectCount += 1;
    session.stats.accessoriesQueryFailures += 1;
    session.stats.lastError = 'Connection refused';

    if (connectCount < 6) {
      __testHooks.scheduleReconnect(session, pairing);
    }
  });

  const { startSubscriber } = await import('../src/subscriber.js');
  startSubscriber('transient-1', {
    name: 'Transient Device',
    address: '10.0.0.1',
    port: 1234,
    longTermData: {},
  });

  await sleep(300);

  const session = __testHooks.getSession('transient-1');
  assert.equal(session.stats.authFailed, false);
  assert.equal(session.stats.needsRepair, false);
  assert.ok(connectCount >= 3, 'should have retried multiple times via backoff');

  __testHooks.resetState();
});

test('isConnectionError matches ECONNREFUSED', () => {
  const { isConnectionError } = __testHooks;
  assert.ok(isConnectionError(new Error('connect ECONNREFUSED 172.16.25.16:51222')));
});

test('isConnectionError matches ETIMEDOUT', () => {
  assert.ok(__testHooks.isConnectionError(new Error('connect ETIMEDOUT 172.16.25.16:51222')));
});

test('isConnectionError matches EHOSTUNREACH', () => {
  assert.ok(__testHooks.isConnectionError(new Error('connect EHOSTUNREACH 172.16.25.16:51222')));
});

test('isConnectionError matches ENOTFOUND', () => {
  assert.ok(__testHooks.isConnectionError(new Error('getaddrinfo ENOTFOUND example.local')));
});

test('isConnectionError does not match auth errors', () => {
  assert.ok(!__testHooks.isConnectionError(new Error('M4: Error: 2')));
});

// -- lastHealthyAt heartbeat tests --

test('lastHealthyAt is null on a freshly-started session before any event/connect', async () => {
  __testHooks.resetState();
  __testHooks.setConnectAccessoryImpl(() => {});

  const { startSubscriber, getSubscriberStats } = await import('../src/subscriber.js');
  startSubscriber('lh-init-1', {
    name: 'LH Init Device',
    address: '10.0.0.1',
    port: 1234,
    longTermData: {},
  });

  const stats = getSubscriberStats('lh-init-1');
  assert.equal(stats.lastHealthyAt, null);

  __testHooks.resetState();
});

test('getRepairTargets does NOT include device whose lastHealthyAt is fresh even when lastSubscribedAt is stale', async () => {
  __testHooks.resetState();
  __testHooks.setConnectAccessoryImpl(() => {});

  const { startSubscriber, getRepairTargets } = await import('../src/subscriber.js');
  startSubscriber('healthy-fresh-1', {
    name: 'Healthy Fresh Device',
    address: '10.0.0.1',
    port: 1234,
    longTermData: {},
  });

  const session = __testHooks.getSession('healthy-fresh-1');
  // Old subscribe timestamp (2h ago), but lastHealthyAt is fresh (now)
  session.stats.lastSubscribedAt = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
  session.stats.lastHealthyAt = new Date().toISOString();

  const targets = getRepairTargets();
  const found = targets.find((t) => t.deviceId === 'healthy-fresh-1');
  assert.equal(found, undefined, 'fresh lastHealthyAt should keep device out of repair targets');

  __testHooks.resetState();
});

test('getRepairTargets DOES include device whose lastHealthyAt is older than the threshold', async () => {
  __testHooks.resetState();
  __testHooks.setConnectAccessoryImpl(() => {});

  const { startSubscriber, getRepairTargets } = await import('../src/subscriber.js');
  startSubscriber('stale-lh-1', {
    name: 'Stale LH Device',
    address: '10.0.0.1',
    port: 1234,
    longTermData: {},
  });

  const session = __testHooks.getSession('stale-lh-1');
  // lastHealthyAt is 30 min ago — older than default 10-min threshold
  session.stats.lastSubscribedAt = new Date().toISOString();
  session.stats.lastHealthyAt = new Date(Date.now() - 30 * 60_000).toISOString();

  const targets = getRepairTargets();
  const found = targets.find((t) => t.deviceId === 'stale-lh-1');
  assert.ok(found, 'stale lastHealthyAt should put device in repair targets');
  assert.equal(found.isStale, true);

  __testHooks.resetState();
});

test('getSubscriberHealth counts a session with old lastHealthyAt as stale', async () => {
  __testHooks.resetState();
  __testHooks.setConnectAccessoryImpl(() => {});

  const { startSubscriber, getSubscriberHealth } = await import('../src/subscriber.js');
  startSubscriber('health-stale-lh-1', {
    name: 'Health Stale LH',
    address: '10.0.0.1',
    port: 1234,
    longTermData: {},
  });

  const session = __testHooks.getSession('health-stale-lh-1');
  // Even with a fresh lastSubscribedAt, an old lastHealthyAt should mark stale
  session.stats.lastSubscribedAt = new Date().toISOString();
  session.stats.lastHealthyAt = new Date(Date.now() - 30 * 60_000).toISOString();

  const health = getSubscriberHealth();
  assert.equal(health.total, 1);
  assert.equal(health.stale, 1);

  __testHooks.resetState();
});

test('getSubscriberHealth does NOT count a session with fresh lastHealthyAt as stale', async () => {
  __testHooks.resetState();
  __testHooks.setConnectAccessoryImpl(() => {});

  const { startSubscriber, getSubscriberHealth } = await import('../src/subscriber.js');
  startSubscriber('health-fresh-lh-1', {
    name: 'Health Fresh LH',
    address: '10.0.0.1',
    port: 1234,
    longTermData: {},
  });

  const session = __testHooks.getSession('health-fresh-lh-1');
  // Even with an old lastSubscribedAt, fresh lastHealthyAt should keep it healthy
  session.stats.lastSubscribedAt = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
  session.stats.lastHealthyAt = new Date().toISOString();

  const health = getSubscriberHealth();
  assert.equal(health.total, 1);
  assert.equal(health.stale, 0);

  __testHooks.resetState();
});

// -- getSubscriberStats.connected tests --

test('getSubscriberStats reflects connected: true when session.client is set AND subscribed AND lastHealthyAt is fresh', async () => {
  __testHooks.resetState();
  // M-01: connected now requires the full liveness AND. Setting only
  // session.client (the connection-setup window) is no longer enough.
  __testHooks.setConnectAccessoryImpl((session) => {
    session.client = { fake: true };
    session.stats.subscribed = true;
    session.stats.lastHealthyAt = new Date().toISOString();
  });

  const { startSubscriber, getSubscriberStats } = await import('../src/subscriber.js');
  startSubscriber('conn-1', {
    name: 'Conn True Device',
    address: '10.0.0.1',
    port: 1234,
    longTermData: {},
  });

  const stats = getSubscriberStats('conn-1');
  assert.equal(stats.connected, true);

  __testHooks.resetState();
});

test('getSubscriberStats reflects connected: false when session.client is null', async () => {
  __testHooks.resetState();
  __testHooks.setConnectAccessoryImpl((session) => {
    session.client = null;
  });

  const { startSubscriber, getSubscriberStats } = await import('../src/subscriber.js');
  startSubscriber('conn-2', {
    name: 'Conn False Device',
    address: '10.0.0.1',
    port: 1234,
    longTermData: {},
  });

  const stats = getSubscriberStats('conn-2');
  assert.equal(stats.connected, false);

  __testHooks.resetState();
});

test('getSubscriberStats returns null after stopSubscriber (existing semantics, with new field absent)', async () => {
  __testHooks.resetState();
  __testHooks.setConnectAccessoryImpl((session) => {
    session.client = { fake: true };
  });

  const { startSubscriber, getSubscriberStats, stopSubscriber } = await import('../src/subscriber.js');
  startSubscriber('conn-3', {
    name: 'Conn Stop Device',
    address: '10.0.0.1',
    port: 1234,
    longTermData: {},
  });

  // Confirm started
  assert.notEqual(getSubscriberStats('conn-3'), null);

  stopSubscriber('conn-3');
  assert.equal(getSubscriberStats('conn-3'), null);

  __testHooks.resetState();
});

test('full flow: auth errors → with PIN → discovery fails → circuit breaker → needsRepair', async () => {
  __testHooks.resetState();
  __testHooks.setReconnectWindow(5, 10);

  let connectCount = 0;
  __testHooks.setConnectAccessoryImpl((session, pairing) => {
    connectCount += 1;
    session.stats.accessoriesQueryFailures += 1;
    session.stats.lastError = 'M4: Error: 2';
    session.stats.lastErrorAt = new Date().toISOString();
    session.stats.authFailures += 1;

    if (session.stats.authFailures >= 3) {
      session.stats.authFailed = true;
      __testHooks.attemptAutoRepair(session, pairing);
    } else {
      __testHooks.scheduleReconnect(session, pairing);
    }
  });

  const { startSubscriber, getSubscriberStats } = await import('../src/subscriber.js');
  startSubscriber('e2e-pin-1', {
    name: 'E2E Pin Device',
    address: '10.0.0.1',
    port: 1234,
    pin: '111-22-333',
    longTermData: {},
  }, {}, null, {
    discoverDevice: async () => null,
    savePairing: async () => {},
  });

  // The reconnect loop must burn all three auth failures and fire the implicit
  // auto-repair before the two explicit calls below can add up to 3.
  await waitUntil(
    () => connectCount >= 3 && getSubscriberStats('e2e-pin-1')?.autoRepairAttempts >= 1,
    { label: 'three auth failures and the first auto-repair' },
  );

  const session = __testHooks.getSession('e2e-pin-1');
  const pairing = { name: 'E2E Pin Device', pin: '111-22-333', longTermData: {} };
  await __testHooks.attemptAutoRepair(session, pairing);
  await __testHooks.attemptAutoRepair(session, pairing);

  const stats = getSubscriberStats('e2e-pin-1');
  assert.equal(stats.autoRepairAttempts, 3);
  assert.equal(stats.needsRepair, true, 'circuit breaker should have tripped');

  __testHooks.resetState();
});

// -- M-01: subscriber liveness gate tests --

test('M-01: getSubscriberStats.connected is false during the connection-setup window (client set, subscribed=false)', async () => {
  __testHooks.resetState();
  // Simulate the window between `session.client = client` and a successful
  // subscribeCharacteristics(): client is set but stats.subscribed is still
  // its initial false. Under M-01 this MUST report connected=false.
  __testHooks.setConnectAccessoryImpl((session) => {
    session.client = { fake: true };
    // stats.subscribed left at its initial `false`
    // stats.lastHealthyAt left at its initial `null`
  });

  const { startSubscriber, getSubscriberStats } = await import('../src/subscriber.js');
  startSubscriber('m01-setup-1', {
    name: 'Setup Window Device',
    address: '10.0.0.1',
    port: 1234,
    longTermData: {},
  });

  const stats = getSubscriberStats('m01-setup-1');
  assert.equal(stats.connected, false, 'setup window must not report connected=true');

  __testHooks.resetState();
});

test('M-01: getSubscriberStats.connected is false when lastHealthyAt is older than 30 minutes (hung socket)', async () => {
  __testHooks.resetState();
  __testHooks.setConnectAccessoryImpl((session) => {
    session.client = { fake: true };
    session.stats.subscribed = true;
    // lastHealthyAt is 31 min ago — older than the 30-min hung-socket threshold.
    session.stats.lastHealthyAt = new Date(Date.now() - 31 * 60_000).toISOString();
  });

  const { startSubscriber, getSubscriberStats } = await import('../src/subscriber.js');
  startSubscriber('m01-hung-1', {
    name: 'Hung Socket Device',
    address: '10.0.0.1',
    port: 1234,
    longTermData: {},
  });

  const stats = getSubscriberStats('m01-hung-1');
  assert.equal(stats.connected, false, 'hung socket (>30 min stale) must report connected=false');

  __testHooks.resetState();
});

test('M-01: getRepairTargets does NOT flag subscribed=true even when lastHealthyAt is stale (quiet device)', async () => {
  __testHooks.resetState();
  __testHooks.setConnectAccessoryImpl(() => {});

  const { startSubscriber, getRepairTargets } = await import('../src/subscriber.js');
  startSubscriber('m01-quiet-1', {
    name: 'Quiet Healthy Device',
    address: '10.0.0.1',
    port: 1234,
    longTermData: {},
  });

  const session = __testHooks.getSession('m01-quiet-1');
  // Healthy subscription that has simply gone quiet — subscribed is true,
  // but lastHealthyAt is older than the 10-min default staleThresholdMs.
  session.stats.subscribed = true;
  session.stats.lastHealthyAt = new Date(Date.now() - 30 * 60_000).toISOString();

  const targets = getRepairTargets();
  const found = targets.find((t) => t.deviceId === 'm01-quiet-1');
  assert.equal(found, undefined, 'subscribed=true should suppress isStale even with old lastHealthyAt');

  __testHooks.resetState();
});

test('M-01: getRepairTargets DOES flag subscribed=false with stale lastHealthyAt', async () => {
  __testHooks.resetState();
  __testHooks.setConnectAccessoryImpl(() => {});

  const { startSubscriber, getRepairTargets } = await import('../src/subscriber.js');
  startSubscriber('m01-disconnected-1', {
    name: 'Disconnected Device',
    address: '10.0.0.1',
    port: 1234,
    longTermData: {},
  });

  const session = __testHooks.getSession('m01-disconnected-1');
  // Inverse of the quiet-device case: explicitly subscribed=false (post-disconnect)
  // AND lastHealthyAt stale → must be flagged as a stale repair target.
  session.stats.subscribed = false;
  session.stats.lastHealthyAt = new Date(Date.now() - 30 * 60_000).toISOString();

  const targets = getRepairTargets();
  const found = targets.find((t) => t.deviceId === 'm01-disconnected-1');
  assert.ok(found, 'subscribed=false with stale lastHealthyAt should appear in repair targets');
  assert.equal(found.isStale, true);

  __testHooks.resetState();
});

// -- Regression test: attemptAutoRepair success-path retry loop (subscriber-repair-loop) --
//
// Root cause: the finally block in attemptAutoRepair() schedules a 60s retry whenever
// autoRepairAttempts < 3. On the success path, autoRepairAttempts is reset to 0, making
// that guard trivially true — causing an infinite retry loop even after successful repair.
// Fix: gate the retry on a `succeeded` boolean that is only set to true on the success path.

test('attemptAutoRepair does NOT schedule a 60s retry when pair-setup succeeds', async () => {
  __testHooks.resetState();

  let connectCalled = false;
  __testHooks.setConnectAccessoryImpl((session) => {
    connectCalled = true;
  });

  // Inject a mock HttpClient factory that simulates a successful pairSetup
  __testHooks.setHttpClientFactory((_deviceId, _address, _port) => ({
    pairSetup: async (_pin) => { /* success — no throw */ },
    getLongTermData: () => ({ ltpk: 'mock-ltpk', ltsk: 'mock-ltsk' }),
    close: () => {},
  }));

  const { startSubscriber } = await import('../src/subscriber.js');
  startSubscriber('repair-success-1', {
    name: 'Repair Success Device',
    address: '10.0.0.1',
    port: 1234,
    pin: '111-22-333',
    longTermData: {},
  }, {}, null, {
    discoverDevice: async () => ({ address: '10.0.0.1', port: 1234 }),
    savePairing: async () => {},
  });

  const session = __testHooks.getSession('repair-success-1');
  session.stats.authFailures = 3;
  session.stats.authFailed = true;

  await __testHooks.attemptAutoRepair(session, {
    name: 'Repair Success Device',
    pin: '111-22-333',
    longTermData: {},
  });

  // On success: connectAccessoryImpl must have been called (normal subscription resumed)
  assert.equal(connectCalled, true, 'connectAccessoryImpl should be called on successful repair');

  // On success: autoRepairAttempts is reset to 0 and no retry timer is scheduled
  assert.equal(session.stats.autoRepairAttempts, 0, 'autoRepairAttempts should be reset to 0 on success');
  assert.equal(session.stats.needsRepair, false, 'needsRepair must remain false on success');
  assert.equal(session.repairing, false, 'repairing flag must be cleared');

  // The critical assertion: no 60s retry timer should be pending
  assert.equal(
    session.reconnectTimeout,
    null,
    'reconnectTimeout must be null after successful repair — no retry loop should be scheduled'
  );

  __testHooks.resetState();
});

test('attemptAutoRepair DOES schedule a 60s retry when pair-setup fails (failure path unchanged)', async () => {
  __testHooks.resetState();

  __testHooks.setConnectAccessoryImpl(() => {});

  // Inject a mock HttpClient factory that simulates a failed pairSetup
  __testHooks.setHttpClientFactory((_deviceId, _address, _port) => ({
    pairSetup: async (_pin) => { throw new Error('M4: Error: 2'); },
    getLongTermData: () => ({}),
    close: () => {},
  }));

  const { startSubscriber } = await import('../src/subscriber.js');
  startSubscriber('repair-fail-retry-1', {
    name: 'Repair Fail Retry Device',
    address: '10.0.0.1',
    port: 1234,
    pin: '111-22-333',
    longTermData: {},
  }, {}, null, {
    discoverDevice: async () => ({ address: '10.0.0.1', port: 1234 }),
    savePairing: async () => {},
  });

  const session = __testHooks.getSession('repair-fail-retry-1');
  session.stats.authFailures = 3;
  session.stats.authFailed = true;

  await __testHooks.attemptAutoRepair(session, {
    name: 'Repair Fail Retry Device',
    pin: '111-22-333',
    longTermData: {},
  });

  assert.equal(session.stats.autoRepairAttempts, 1, 'attempt count should increment on failure');
  assert.equal(session.stats.needsRepair, false, 'not yet at circuit breaker (attempt 1/3)');
  assert.equal(session.repairing, false, 'repairing flag cleared');

  // On failure with attempts < 3, a retry timer MUST be scheduled
  assert.notEqual(
    session.reconnectTimeout,
    null,
    'reconnectTimeout should be set after a failed repair attempt (retry is expected on failure path)'
  );

  // Clean up the timer so the test runner exits cleanly
  clearTimeout(session.reconnectTimeout);
  session.reconnectTimeout = null;

  __testHooks.resetState();
});
