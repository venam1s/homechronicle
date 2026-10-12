import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

// -- Helpers --

function makeMocks(overrides = {}) {
  const saveSettingsCalls = [];
  const stopSubscriberCalls = [];
  const startSubscriberCalls = [];
  const resetStatsCalls = [];
  const discoverDeviceCalls = [];
  const savePairingCalls = [];
  const performPairSetupCalls = [];

  const defaultSettings = { enabled: true, hour: 3, lastRunAt: null, lastRunResult: null };
  let settingsState = { ...defaultSettings, ...overrides.settings };

  const mocks = {
    getSettings: overrides.getSettings ?? (() => ({ ...settingsState })),
    saveSettings: overrides.saveSettings ?? (async (s) => { settingsState = { ...s }; saveSettingsCalls.push(s); }),
    getRepairTargets: overrides.getRepairTargets ?? (() => []),
    discoverDevice: overrides.discoverDevice ?? (async () => null),
    savePairing: async (id, p) => { savePairingCalls.push({ id, p }); },
    stopSubscriber: (id) => { stopSubscriberCalls.push(id); },
    startSubscriber: (id, pairing, rooms, getPairing) => { startSubscriberCalls.push({ id, pairing, rooms }); },
    resetSubscriberStats: (id) => { resetStatsCalls.push(id); return true; },
    loadPairings: overrides.loadPairings ?? (() => ({})),
    loadRooms: overrides.loadRooms ?? (() => ({})),
    getPairingForLookup: overrides.getPairingForLookup ?? (() => null),
    performPairSetupAndPersist: overrides.performPairSetupAndPersist ??
      (async (deviceId, pin, address, port) => {
        performPairSetupCalls.push({ deviceId, pin, address, port });
        return { longTermData: {}, pairing: {} };
      }),
    // call record accessors
    _saveSettingsCalls: saveSettingsCalls,
    _stopSubscriberCalls: stopSubscriberCalls,
    _startSubscriberCalls: startSubscriberCalls,
    _resetStatsCalls: resetStatsCalls,
    _discoverDeviceCalls: discoverDeviceCalls,
    _savePairingCalls: savePairingCalls,
    _performPairSetupCalls: performPairSetupCalls,
  };
  return mocks;
}

// -- msUntilHour tests --

test('msUntilHour returns positive ms when target hour is ahead today', async () => {
  const { msUntilHour } = await import('../src/repair-scheduler.js');

  // Fix Date to 02:00:00 UTC
  const fakeNow = new Date('2024-01-15T02:00:00.000Z');
  const origDate = globalThis.Date;
  globalThis.Date = class extends origDate {
    constructor(...args) {
      if (args.length === 0) {
        super(fakeNow.getTime());
      } else {
        super(...args);
      }
    }
    static now() { return fakeNow.getTime(); }
  };

  try {
    const ms = msUntilHour(3);
    // Should be ~1 hour = 3600000 ms
    assert.ok(ms > 3_500_000 && ms <= 3_600_000, `Expected ~3600000 ms, got ${ms}`);
  } finally {
    globalThis.Date = origDate;
  }
});

test('msUntilHour counts in UTC regardless of the container TZ', async () => {
  const { msUntilHour } = await import('../src/repair-scheduler.js');
  const now = Date.now();
  const ms = msUntilHour(new Date(now).getUTCHours());
  // The current UTC hour has started, so the next one is tomorrow, at most 24h away.
  const next = new Date(now + ms);
  assert.equal(next.getUTCHours(), new Date(now).getUTCHours());
  assert.equal(next.getUTCMinutes(), 0);
  assert.ok(ms > 23 * 3_600_000 && ms <= 24 * 3_600_000, `Expected ~24h, got ${ms}`);
});

test('msUntilHour returns next-day ms when target hour is already past', async () => {
  const { msUntilHour } = await import('../src/repair-scheduler.js');

  // Fix Date to 04:00:00 UTC
  const fakeNow = new Date('2024-01-15T04:00:00.000Z');
  const origDate = globalThis.Date;
  globalThis.Date = class extends origDate {
    constructor(...args) {
      if (args.length === 0) {
        super(fakeNow.getTime());
      } else {
        super(...args);
      }
    }
    static now() { return fakeNow.getTime(); }
  };

  try {
    const ms = msUntilHour(3);
    // Should be ~23 hours = 82800000 ms
    assert.ok(ms > 82_700_000 && ms <= 82_800_000, `Expected ~82800000 ms, got ${ms}`);
  } finally {
    globalThis.Date = origDate;
  }
});

// -- start / stop tests --

test('start() does nothing when settings.enabled is false', async () => {
  const { createRepairScheduler } = await import('../src/repair-scheduler.js');
  const m = makeMocks({ settings: { enabled: false, hour: 3 } });

  let setTimeoutCalled = false;
  const origSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (...args) => { setTimeoutCalled = true; return origSetTimeout(...args); };

  try {
    const scheduler = createRepairScheduler(m);
    scheduler.start();
    assert.equal(setTimeoutCalled, false, 'setTimeout should not be called when disabled');
    scheduler.stop();
  } finally {
    globalThis.setTimeout = origSetTimeout;
  }
});

test('start() calls setTimeout when settings.enabled is true', async () => {
  const { createRepairScheduler } = await import('../src/repair-scheduler.js');
  const m = makeMocks({ settings: { enabled: true, hour: 3 } });

  let setTimeoutCalled = false;
  const origSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, delay) => {
    setTimeoutCalled = true;
    // Return a dummy timer id, don't actually fire it
    return origSetTimeout(() => {}, 999_999_999);
  };

  try {
    const scheduler = createRepairScheduler(m);
    scheduler.start();
    assert.equal(setTimeoutCalled, true, 'setTimeout should be called when enabled');
    scheduler.stop();
  } finally {
    globalThis.setTimeout = origSetTimeout;
  }
});

test('stop() clears pending timeout', async () => {
  const { createRepairScheduler } = await import('../src/repair-scheduler.js');
  const m = makeMocks({ settings: { enabled: true, hour: 3 } });

  const clearTimeoutCalls = [];
  const origSetTimeout = globalThis.setTimeout;
  const origClearTimeout = globalThis.clearTimeout;
  const fakeId = 12345;

  globalThis.setTimeout = () => fakeId;
  globalThis.clearTimeout = (id) => { clearTimeoutCalls.push(id); };

  try {
    const scheduler = createRepairScheduler(m);
    scheduler.start();
    scheduler.stop();
    assert.ok(clearTimeoutCalls.includes(fakeId), 'clearTimeout should be called with the scheduled timeout id');
  } finally {
    globalThis.setTimeout = origSetTimeout;
    globalThis.clearTimeout = origClearTimeout;
  }
});

// -- runRepairCycle tests --

test('runRepairCycle() with 0 targets logs "0 device(s) targeted" and returns early', async () => {
  const { createRepairScheduler } = await import('../src/repair-scheduler.js');
  const m = makeMocks({ getRepairTargets: () => [] });

  const logInfoCalls = [];
  const { log } = await import('../src/logger.js');
  const origInfo = log.info;
  log.info = (...args) => { logInfoCalls.push(args.join(' ')); };

  try {
    const scheduler = createRepairScheduler(m);
    await scheduler.runRepairCycle();

    const startLine = logInfoCalls.find(l => l.includes('[repair]') && l.includes('0 device(s) targeted'));
    assert.ok(startLine, `Expected log line with "0 device(s) targeted", got: ${JSON.stringify(logInfoCalls)}`);
    // Should not call resetSubscriberStats since no targets
    assert.equal(m._resetStatsCalls.length, 0, 'resetSubscriberStats should not be called with 0 targets');
  } finally {
    log.info = origInfo;
  }
});

test('runRepairCycle() with needsRepair device success resets stats and restarts subscriber', async () => {
  const { createRepairScheduler } = await import('../src/repair-scheduler.js');

  const fakeDiscovered = { address: '10.0.0.1', port: 51234 };
  const fakePairing = { name: 'Device A', address: '10.0.0.1', port: 51234, longTermData: {}, pin: 'test-pin' };
  let discoverCalled = false;
  const m = makeMocks({
    getRepairTargets: () => [{ deviceId: 'dev-1', pairingName: 'Device A', needsRepair: true, isStale: false }],
    discoverDevice: async (id) => { discoverCalled = true; return fakeDiscovered; },
    loadPairings: () => ({ 'dev-1': fakePairing }),
  });

  const scheduler = createRepairScheduler(m);
  await scheduler.runRepairCycle();

  assert.ok(discoverCalled, 'discoverDevice should be called');
  assert.equal(m._performPairSetupCalls.length, 1, 'performPairSetupAndPersist should be called once');
  assert.equal(m._performPairSetupCalls[0].deviceId, 'dev-1');
  // REPAIR-02: resetSubscriberStats called on success
  assert.ok(m._resetStatsCalls.includes('dev-1'), 'resetSubscriberStats should be called for dev-1 on success');
  // REPAIR-01: subscriber restarted after successful re-pair
  assert.ok(m._stopSubscriberCalls.includes('dev-1'), 'stopSubscriber should be called for dev-1');
  assert.ok(m._startSubscriberCalls.some(c => c.id === 'dev-1'), 'startSubscriber should be called for dev-1');
  // saveSettings should be called (lastRunResult persistence)
  assert.ok(m._saveSettingsCalls.length >= 1, 'saveSettings should be called for lastRunResult');
  const lastSaved = m._saveSettingsCalls[m._saveSettingsCalls.length - 1];
  assert.equal(lastSaved.lastRunResult.repaired, 1);
  assert.equal(lastSaved.lastRunResult.targeted, 1);
});

test('runRepairCycle() with stale-only device success resets stats and restarts subscriber (regression)', async () => {
  const { createRepairScheduler } = await import('../src/repair-scheduler.js');

  const fakePairing = { name: 'Device B', address: '10.0.0.2', port: 51234, longTermData: {} };
  const m = makeMocks({
    getRepairTargets: () => [{ deviceId: 'dev-2', pairingName: 'Device B', needsRepair: false, isStale: true }],
    loadPairings: () => ({ 'dev-2': fakePairing }),
  });

  const scheduler = createRepairScheduler(m);
  await scheduler.runRepairCycle();

  // REPAIR-02: resetSubscriberStats called on success only
  assert.ok(m._resetStatsCalls.includes('dev-2'), 'resetSubscriberStats should be called for dev-2 on success');
  assert.ok(m._stopSubscriberCalls.includes('dev-2'), 'stopSubscriber should be called for dev-2');
  assert.ok(m._startSubscriberCalls.some(c => c.id === 'dev-2'), 'startSubscriber should be called for dev-2');
});

test('runRepairCycle() logs summary line with correct counts', async () => {
  const { createRepairScheduler } = await import('../src/repair-scheduler.js');

  const fakePairing = { name: 'Device C', address: '10.0.0.3', port: 51234, longTermData: {} };
  const m = makeMocks({
    getRepairTargets: () => [{ deviceId: 'dev-3', pairingName: 'Device C', needsRepair: false, isStale: true }],
    loadPairings: () => ({ 'dev-3': fakePairing }),
  });

  const logInfoCalls = [];
  const { log } = await import('../src/logger.js');
  const origInfo = log.info;
  log.info = (...args) => { logInfoCalls.push(args.join(' ')); };

  try {
    const scheduler = createRepairScheduler(m);
    await scheduler.runRepairCycle();

    const summaryLine = logInfoCalls.find(l => l.includes('[repair]') && l.includes('Pass complete'));
    assert.ok(summaryLine, `Expected summary log line with "Pass complete", got: ${JSON.stringify(logInfoCalls)}`);
    assert.ok(summaryLine.includes('1 repaired'), `Expected "1 repaired" in summary, got: ${summaryLine}`);
  } finally {
    log.info = origInfo;
  }
});

test('runRepairCycle() logs per-device lines', async () => {
  const { createRepairScheduler } = await import('../src/repair-scheduler.js');

  const fakePairing = { name: 'Device D', address: '10.0.0.4', port: 51234, longTermData: {} };
  const m = makeMocks({
    getRepairTargets: () => [{ deviceId: 'dev-4', pairingName: 'Device D', needsRepair: false, isStale: true }],
    loadPairings: () => ({ 'dev-4': fakePairing }),
  });

  const logInfoCalls = [];
  const { log } = await import('../src/logger.js');
  const origInfo = log.info;
  log.info = (...args) => { logInfoCalls.push(args.join(' ')); };

  try {
    const scheduler = createRepairScheduler(m);
    await scheduler.runRepairCycle();

    const deviceLine = logInfoCalls.find(l => l.includes('[repair]') && l.includes('Device D'));
    assert.ok(deviceLine, `Expected per-device log line mentioning "Device D", got: ${JSON.stringify(logInfoCalls)}`);
  } finally {
    log.info = origInfo;
  }
});

test('runRepairCycle() persists lastRunAt and lastRunResult after completion', async () => {
  const { createRepairScheduler } = await import('../src/repair-scheduler.js');

  const m = makeMocks({ getRepairTargets: () => [] });

  const scheduler = createRepairScheduler(m);
  await scheduler.runRepairCycle();

  assert.ok(m._saveSettingsCalls.length >= 1, 'saveSettings should be called');
  const saved = m._saveSettingsCalls[m._saveSettingsCalls.length - 1];
  assert.ok(saved.lastRunAt != null, 'lastRunAt should be set');
  assert.ok(saved.lastRunResult != null, 'lastRunResult should be set');
  assert.equal(typeof saved.lastRunAt, 'string', 'lastRunAt should be an ISO string');
});

test('runRepairCycle() with running guard skips and logs warning', async () => {
  const { createRepairScheduler } = await import('../src/repair-scheduler.js');

  // Create a long-running task
  let resolveFirst;
  const blockingPromise = new Promise(resolve => { resolveFirst = resolve; });
  let callCount = 0;
  const m = makeMocks({
    getRepairTargets: () => {
      callCount++;
      return [];
    },
    saveSettings: async (s) => {
      m._saveSettingsCalls.push(s);
      if (callCount === 1) await blockingPromise;
    },
  });

  const logWarnCalls = [];
  const { log } = await import('../src/logger.js');
  const origWarn = log.warn;
  log.warn = (...args) => { logWarnCalls.push(args.join(' ')); };

  try {
    const scheduler = createRepairScheduler(m);

    // Start first cycle (will block)
    const first = scheduler.runRepairCycle();
    // Immediately start second cycle (should be skipped due to running guard)
    const second = scheduler.runRepairCycle();

    // Resolve the block so first cycle finishes
    resolveFirst();
    await Promise.all([first, second]);

    const skippedLine = logWarnCalls.find(l => l.includes('[repair]') && l.includes('already in progress'));
    assert.ok(skippedLine, `Expected "already in progress" warning, got: ${JSON.stringify(logWarnCalls)}`);
  } finally {
    log.warn = origWarn;
  }
});

test('runRepairCycle() persists lastRunResult even when a device repair throws', async () => {
  const { createRepairScheduler } = await import('../src/repair-scheduler.js');

  const m = makeMocks({
    getRepairTargets: () => [{ deviceId: 'dev-err', pairingName: 'Broken Device', needsRepair: true, isStale: false }],
    discoverDevice: async () => { throw new Error('Network timeout'); },
    loadPairings: () => ({ 'dev-err': { name: 'Broken Device', address: 'a', port: 1, pin: 'test-pin' } }),
  });

  const scheduler = createRepairScheduler(m);
  await scheduler.runRepairCycle();

  const saved = m._saveSettingsCalls[m._saveSettingsCalls.length - 1];
  assert.ok(saved != null, 'saveSettings should be called even after error');
  assert.ok(saved.lastRunAt != null, 'lastRunAt should be set after error');
  assert.ok(saved.lastRunResult != null, 'lastRunResult should be set after error');
  assert.equal(saved.lastRunResult.failed, 1, 'failed count should be 1');
});

// -- REPAIR-02 / REPAIR-03: stats reset only on success --

test('runRepairCycle() with needsRepair device: discoverDevice throws does NOT reset stats', async () => {
  const { createRepairScheduler } = await import('../src/repair-scheduler.js');

  const m = makeMocks({
    getRepairTargets: () => [{ deviceId: 'dev-fail', pairingName: 'Fail Device', needsRepair: true, isStale: false }],
    discoverDevice: async () => { throw new Error('timeout'); },
    loadPairings: () => ({ 'dev-fail': { name: 'Fail Device', address: 'a', port: 1, pin: 'test-pin' } }),
  });

  const scheduler = createRepairScheduler(m);
  await scheduler.runRepairCycle();

  assert.equal(m._resetStatsCalls.length, 0, 'resetSubscriberStats should NOT be called when repair throws');
  assert.equal(m._stopSubscriberCalls.length, 0, 'stopSubscriber should NOT be called when repair throws');
  assert.equal(m._startSubscriberCalls.length, 0, 'startSubscriber should NOT be called when repair throws');
});

test('runRepairCycle() with needsRepair device: discoverDevice returns null does NOT reset stats', async () => {
  const { createRepairScheduler } = await import('../src/repair-scheduler.js');

  const m = makeMocks({
    getRepairTargets: () => [{ deviceId: 'dev-notfound', pairingName: 'Missing Device', needsRepair: true, isStale: false }],
    discoverDevice: async () => null,
    loadPairings: () => ({ 'dev-notfound': { name: 'Missing Device', address: 'a', port: 1, pin: 'test-pin' } }),
  });

  const scheduler = createRepairScheduler(m);
  await scheduler.runRepairCycle();

  assert.equal(m._resetStatsCalls.length, 0, 'resetSubscriberStats should NOT be called when device not discoverable');
  assert.equal(m._stopSubscriberCalls.length, 0, 'stopSubscriber should NOT be called when device not discoverable');
  assert.equal(m._startSubscriberCalls.length, 0, 'startSubscriber should NOT be called when device not discoverable');
  const saved = m._saveSettingsCalls[m._saveSettingsCalls.length - 1];
  assert.equal(saved.lastRunResult.skipped, 1, 'skipped count should be 1');
});

test('runRepairCycle() with needsRepair device: no pairing after performPairSetup skips subscriber restart', async () => {
  const { createRepairScheduler } = await import('../src/repair-scheduler.js');

  const fakeDiscovered = { address: '10.0.0.5', port: 51234 };
  let loadPairingCallCount = 0;
  const m = makeMocks({
    getRepairTargets: () => [{ deviceId: 'dev-nopair', pairingName: 'No Pairing Device', needsRepair: true, isStale: false }],
    discoverDevice: async () => fakeDiscovered,
    // First call: return device with pin for the PIN check
    // Second call (after performPairSetupAndPersist): return empty — pairing not found
    loadPairings: () => {
      loadPairingCallCount++;
      if (loadPairingCallCount === 1) {
        return { 'dev-nopair': { name: 'No Pairing Device', address: 'a', port: 1, pin: 'test-pin' } };
      }
      return {};
    },
  });

  const scheduler = createRepairScheduler(m);
  await scheduler.runRepairCycle();

  // performPairSetupAndPersist called and stats reset on success
  assert.equal(m._performPairSetupCalls.length, 1, 'performPairSetupAndPersist should be called');
  assert.ok(m._resetStatsCalls.includes('dev-nopair'), 'resetSubscriberStats should be called on pairSetup success');
  // But subscriber restart is skipped because loadPairings returned nothing on second call
  assert.equal(m._stopSubscriberCalls.length, 0, 'stopSubscriber should NOT be called when pairing not found');
  assert.equal(m._startSubscriberCalls.length, 0, 'startSubscriber should NOT be called when pairing not found');
  const saved = m._saveSettingsCalls[m._saveSettingsCalls.length - 1];
  assert.equal(saved.lastRunResult.repaired, 1, 'repaired count should still be 1');
});

// -- REPAIR-04 / REPAIR-05 / REPAIR-06: pairSetup path --

test('runRepairCycle() with needsRepair + stored PIN + pairSetup success performs full re-pair and restarts subscriber', async () => {
  const { createRepairScheduler } = await import('../src/repair-scheduler.js');

  const fakeDiscovered = { address: '10.0.0.7', port: 51234 };
  const fakeResult = {
    longTermData: 'NEW',
    pairing: { name: 'Device Ok', address: '10.0.0.7', port: 51234, longTermData: 'NEW', pin: '111-22-333', pairedAt: '2026-01-01T00:00:00.000Z' },
  };
  const pairSetupSpyCalls = [];
  const m = makeMocks({
    getRepairTargets: () => [{ deviceId: 'dev-ok', pairingName: 'Device Ok', needsRepair: true, isStale: false }],
    discoverDevice: async () => fakeDiscovered,
    loadPairings: () => ({ 'dev-ok': { name: 'Device Ok', address: 'a', port: 1, pin: '111-22-333', longTermData: 'OLD' } }),
    performPairSetupAndPersist: async (deviceId, pin, address, port) => {
      pairSetupSpyCalls.push({ deviceId, pin, address, port });
      return fakeResult;
    },
  });

  const scheduler = createRepairScheduler(m);
  await scheduler.runRepairCycle();

  // performPairSetupAndPersist called with correct args
  assert.equal(pairSetupSpyCalls.length, 1, 'performPairSetupAndPersist called exactly once');
  assert.equal(pairSetupSpyCalls[0].deviceId, 'dev-ok', 'deviceId passed');
  assert.equal(pairSetupSpyCalls[0].pin, '111-22-333', 'pin passed');
  assert.equal(pairSetupSpyCalls[0].address, '10.0.0.7', 'discovered address passed');
  assert.equal(pairSetupSpyCalls[0].port, 51234, 'discovered port passed');

  // Success: stats reset + subscriber restarted
  assert.ok(m._resetStatsCalls.includes('dev-ok'), 'resetSubscriberStats called for dev-ok');
  assert.ok(m._stopSubscriberCalls.includes('dev-ok'), 'stopSubscriber called for dev-ok');
  assert.ok(m._startSubscriberCalls.some(c => c.id === 'dev-ok'), 'startSubscriber called for dev-ok');

  // Counts
  const lastSaved = m._saveSettingsCalls[m._saveSettingsCalls.length - 1];
  assert.equal(lastSaved.lastRunResult.repaired, 1, 'repaired === 1');
  assert.equal(lastSaved.lastRunResult.skipped, 0, 'skipped === 0');
  assert.equal(lastSaved.lastRunResult.failed, 0, 'failed === 0');
});

test('runRepairCycle() with needsRepair device and no stored PIN logs warn and skips without failure', async () => {
  const { createRepairScheduler } = await import('../src/repair-scheduler.js');

  const pairSetupSpyCalls = [];
  const discoverDeviceCalls = [];
  const m = makeMocks({
    getRepairTargets: () => [{ deviceId: 'dev-nopin', pairingName: 'No PIN Device', needsRepair: true, isStale: false }],
    discoverDevice: async (id) => { discoverDeviceCalls.push(id); return null; },
    loadPairings: () => ({ 'dev-nopin': { name: 'No PIN Device', address: 'a', port: 1, longTermData: 'OLD' } }),
    performPairSetupAndPersist: async (deviceId, pin, address, port) => {
      pairSetupSpyCalls.push({ deviceId, pin, address, port });
      return { longTermData: {}, pairing: {} };
    },
  });

  const logWarnCalls = [];
  const { log } = await import('../src/logger.js');
  const origWarn = log.warn;
  log.warn = (...args) => { logWarnCalls.push(args.join(' ')); };

  try {
    const scheduler = createRepairScheduler(m);
    await scheduler.runRepairCycle();

    // warn emitted with device name and 'no stored PIN'
    const warnLine = logWarnCalls.find(l => l.includes('[repair]') && l.includes('no stored PIN'));
    assert.ok(warnLine, `Expected warn with "no stored PIN", got: ${JSON.stringify(logWarnCalls)}`);
    assert.ok(warnLine.includes('No PIN Device'), `Expected device name in warn, got: ${warnLine}`);

    // Nothing called
    assert.equal(pairSetupSpyCalls.length, 0, 'performPairSetupAndPersist should NOT be called');
    assert.equal(discoverDeviceCalls.length, 0, 'discoverDevice should NOT be called');
    assert.equal(m._resetStatsCalls.length, 0, 'resetSubscriberStats should NOT be called');
    assert.equal(m._stopSubscriberCalls.length, 0, 'stopSubscriber should NOT be called');
    assert.equal(m._startSubscriberCalls.length, 0, 'startSubscriber should NOT be called');
    assert.equal(m._savePairingCalls.length, 0, 'savePairing should NOT be called');

    // Counts
    const lastSaved = m._saveSettingsCalls[m._saveSettingsCalls.length - 1];
    assert.equal(lastSaved.lastRunResult.skipped, 1, 'skipped === 1');
    assert.equal(lastSaved.lastRunResult.repaired, 0, 'repaired === 0');
    assert.equal(lastSaved.lastRunResult.failed, 0, 'failed === 0');
  } finally {
    log.warn = origWarn;
  }
});

test('runRepairCycle() with needsRepair and pairSetup failure leaves needsRepair and does not restart subscriber', async () => {
  const { createRepairScheduler } = await import('../src/repair-scheduler.js');

  const fakeDiscovered = { address: '10.0.0.8', port: 51234 };
  const m = makeMocks({
    getRepairTargets: () => [{ deviceId: 'dev-fail2', pairingName: 'Auth Fail Device', needsRepair: true, isStale: false }],
    discoverDevice: async () => fakeDiscovered,
    loadPairings: () => ({ 'dev-fail2': { name: 'Auth Fail Device', address: 'a', port: 1, pin: '000-00-000', longTermData: 'OLD' } }),
    performPairSetupAndPersist: async () => { throw new Error('0x02'); },
  });

  const scheduler = createRepairScheduler(m);
  await scheduler.runRepairCycle();

  // None of the success-path calls should happen
  assert.equal(m._resetStatsCalls.length, 0, 'resetSubscriberStats should NOT be called on pairSetup failure');
  assert.equal(m._stopSubscriberCalls.length, 0, 'stopSubscriber should NOT be called on pairSetup failure');
  assert.equal(m._startSubscriberCalls.length, 0, 'startSubscriber should NOT be called on pairSetup failure');

  // Counts
  const lastSaved = m._saveSettingsCalls[m._saveSettingsCalls.length - 1];
  assert.equal(lastSaved.lastRunResult.failed, 1, 'failed === 1');
  assert.equal(lastSaved.lastRunResult.repaired, 0, 'repaired === 0');
  assert.equal(lastSaved.lastRunResult.skipped, 0, 'skipped === 0');
});

// -- M-5: scheduler self-heals from a rejected cycle / disabled settings --

test('scheduleNext survives a rejected runRepairCycle (saveSettings rejects) and still reschedules while enabled', async () => {
  const { createRepairScheduler } = await import('../src/repair-scheduler.js');
  mock.timers.enable({ apis: ['setTimeout'] });
  // setImmediate is NOT mocked, so it reliably flushes pending microtasks
  // (the async continuations after each tick()) without needing a real timer.
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  let targetsCallCount = 0;
  const m = makeMocks({
    getRepairTargets: () => { targetsCallCount++; return []; },
    saveSettings: async () => { throw new Error('ENOSPC: disk full'); },
  });

  try {
    const scheduler = createRepairScheduler(m);
    scheduler.start();

    // msUntilHour() always returns <= 24h — ticking 25h guarantees the
    // currently-armed timer fires exactly once.
    mock.timers.tick(25 * 60 * 60 * 1000);
    await flush();
    await flush();
    assert.equal(targetsCallCount, 1, 'first scheduled cycle should have run');

    // The first cycle's saveSettings rejected — the chain must still have
    // rescheduled a second cycle ~24h later.
    mock.timers.tick(25 * 60 * 60 * 1000);
    await flush();
    await flush();
    assert.equal(targetsCallCount, 2, 'chain should survive a rejected cycle and reschedule');

    scheduler.stop();
  } finally {
    mock.timers.reset();
  }
});

test('scheduleNext does not reschedule once settings.enabled becomes false', async () => {
  const { createRepairScheduler } = await import('../src/repair-scheduler.js');
  mock.timers.enable({ apis: ['setTimeout'] });
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  let enabled = true;
  let targetsCallCount = 0;
  const m = makeMocks({
    getSettings: () => ({ enabled, hour: 3 }),
    getRepairTargets: () => {
      targetsCallCount++;
      // Flip AFTER this cycle so the post-cycle reschedule decision
      // (which reads getSettings() fresh) sees enabled: false and does not
      // arm a further timer.
      enabled = false;
      return [];
    },
  });

  try {
    const scheduler = createRepairScheduler(m);
    scheduler.start();

    mock.timers.tick(25 * 60 * 60 * 1000);
    await flush();
    await flush();
    assert.equal(targetsCallCount, 1, 'first cycle should have run');

    // No timer should have been armed — ticking further must not invoke
    // getRepairTargets again.
    mock.timers.tick(25 * 60 * 60 * 1000);
    await flush();
    await flush();
    assert.equal(targetsCallCount, 1, 'no further cycle should run once disabled');

    scheduler.stop();
  } finally {
    mock.timers.reset();
  }
});

test('runRepairCycle() with a throwing getRepairTargets clears running so the next call is not skipped', async () => {
  const { createRepairScheduler } = await import('../src/repair-scheduler.js');

  let callCount = 0;
  const m = makeMocks({
    getRepairTargets: () => {
      callCount++;
      if (callCount === 1) throw new Error('DB unavailable');
      return [];
    },
  });

  const scheduler = createRepairScheduler(m);
  await assert.rejects(() => scheduler.runRepairCycle(), /DB unavailable/);

  // The 'running' guard must have been cleared on the throw path — a second
  // call must actually execute getRepairTargets again, not be short-circuited
  // by the 'already in progress' guard.
  await scheduler.runRepairCycle();
  assert.equal(callCount, 2, 'second call should actually run getRepairTargets, not be skipped by the running guard');
});
