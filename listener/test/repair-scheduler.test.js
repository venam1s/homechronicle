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

  const defaultSettings = { enabled: true, hour: 3, lastRunAt: null, lastRunResult: null };
  let settingsState = { ...defaultSettings, ...overrides.settings };

  const mocks = {
    getSettings: () => ({ ...settingsState }),
    saveSettings: async (s) => { settingsState = { ...s }; saveSettingsCalls.push(s); },
    getRepairTargets: overrides.getRepairTargets ?? (() => []),
    discoverDevice: overrides.discoverDevice ?? (async () => null),
    savePairing: async (id, p) => { savePairingCalls.push({ id, p }); },
    stopSubscriber: (id) => { stopSubscriberCalls.push(id); },
    startSubscriber: (id, pairing, rooms, getPairing) => { startSubscriberCalls.push({ id, pairing, rooms }); },
    resetSubscriberStats: (id) => { resetStatsCalls.push(id); return true; },
    loadPairings: overrides.loadPairings ?? (() => ({})),
    loadRooms: overrides.loadRooms ?? (() => ({})),
    getPairingForLookup: overrides.getPairingForLookup ?? (() => null),
    // call record accessors
    _saveSettingsCalls: saveSettingsCalls,
    _stopSubscriberCalls: stopSubscriberCalls,
    _startSubscriberCalls: startSubscriberCalls,
    _resetStatsCalls: resetStatsCalls,
    _discoverDeviceCalls: discoverDeviceCalls,
    _savePairingCalls: savePairingCalls,
  };
  return mocks;
}

// -- msUntilHour tests --

test('msUntilHour returns positive ms when target hour is ahead today', async () => {
  const { msUntilHour } = await import('../src/repair-scheduler.js');

  // Fix Date to 02:00:00
  const fakeNow = new Date('2024-01-15T02:00:00.000');
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

test('msUntilHour returns next-day ms when target hour is already past', async () => {
  const { msUntilHour } = await import('../src/repair-scheduler.js');

  // Fix Date to 04:00:00
  const fakeNow = new Date('2024-01-15T04:00:00.000');
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

test('runRepairCycle() with needsRepair device calls resetSubscriberStats then discoverDevice + savePairing', async () => {
  const { createRepairScheduler } = await import('../src/repair-scheduler.js');

  const fakeDiscovered = { name: 'Device A', address: '10.0.0.1', port: 51234 };
  let discoverCalled = false;
  const m = makeMocks({
    getRepairTargets: () => [{ deviceId: 'dev-1', pairingName: 'Device A', needsRepair: true, isStale: false }],
    discoverDevice: async (id) => { discoverCalled = true; return fakeDiscovered; },
  });

  const scheduler = createRepairScheduler(m);
  await scheduler.runRepairCycle();

  assert.ok(m._resetStatsCalls.includes('dev-1'), 'resetSubscriberStats should be called for dev-1');
  assert.ok(discoverCalled, 'discoverDevice should be called');
  assert.equal(m._savePairingCalls.length, 1, 'savePairing should be called once');
  assert.equal(m._savePairingCalls[0].id, 'dev-1');
  // saveSettings should be called (lastRunResult persistence)
  assert.ok(m._saveSettingsCalls.length >= 1, 'saveSettings should be called for lastRunResult');
  const lastSaved = m._saveSettingsCalls[m._saveSettingsCalls.length - 1];
  assert.equal(lastSaved.lastRunResult.repaired, 1);
  assert.equal(lastSaved.lastRunResult.targeted, 1);
});

test('runRepairCycle() with stale-only device calls resetSubscriberStats then stopSubscriber + startSubscriber', async () => {
  const { createRepairScheduler } = await import('../src/repair-scheduler.js');

  const fakePairing = { name: 'Device B', address: '10.0.0.2', port: 51234, longTermData: {} };
  const m = makeMocks({
    getRepairTargets: () => [{ deviceId: 'dev-2', pairingName: 'Device B', needsRepair: false, isStale: true }],
    loadPairings: () => ({ 'dev-2': fakePairing }),
  });

  const scheduler = createRepairScheduler(m);
  await scheduler.runRepairCycle();

  assert.ok(m._resetStatsCalls.includes('dev-2'), 'resetSubscriberStats should be called for dev-2');
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
  });

  const scheduler = createRepairScheduler(m);
  await scheduler.runRepairCycle();

  const saved = m._saveSettingsCalls[m._saveSettingsCalls.length - 1];
  assert.ok(saved != null, 'saveSettings should be called even after error');
  assert.ok(saved.lastRunAt != null, 'lastRunAt should be set after error');
  assert.ok(saved.lastRunResult != null, 'lastRunResult should be set after error');
  assert.equal(saved.lastRunResult.failed, 1, 'failed count should be 1');
});
