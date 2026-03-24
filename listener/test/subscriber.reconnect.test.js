import test from 'node:test';
import assert from 'node:assert/strict';
import { __testHooks } from '../src/subscriber.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
