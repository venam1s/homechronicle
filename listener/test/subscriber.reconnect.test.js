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
