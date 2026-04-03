import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMatterNodeId,
  normalizePairingRecord,
  normalizePairingsMap,
  isHomeKitPairing,
  getHomeKitPairings,
  mapReliabilityStats,
  createStoreHelpers,
} from '../src/setup-helpers.js';

describe('normalizeMatterNodeId', () => {
  it('returns null for undefined', () => {
    assert.equal(normalizeMatterNodeId(undefined), null);
  });

  it('returns null for null', () => {
    assert.equal(normalizeMatterNodeId(null), null);
  });

  it('returns null for empty string', () => {
    assert.equal(normalizeMatterNodeId(''), null);
  });

  it('returns stringified BigInt for numeric string', () => {
    assert.equal(normalizeMatterNodeId('123'), '123');
  });

  it('returns uppercased text for non-numeric strings', () => {
    assert.equal(normalizeMatterNodeId('abc-def'), 'ABC-DEF');
  });

  it('handles numeric value', () => {
    assert.equal(normalizeMatterNodeId(42), '42');
  });
});

describe('normalizePairingRecord', () => {
  it('returns homekit pairing with protocol set', () => {
    const result = normalizePairingRecord('abc', { protocol: 'homekit' });
    assert.equal(result.protocol, 'homekit');
  });

  it('returns homekit pairing when no protocol given (default)', () => {
    const result = normalizePairingRecord('abc', {});
    assert.equal(result.protocol, 'homekit');
  });

  it('returns matter pairing with nodeId normalized', () => {
    const result = normalizePairingRecord('abc', { protocol: 'matter', nodeId: '42' });
    assert.equal(result.protocol, 'matter');
    assert.equal(result.nodeId, '42');
  });

  it('sets name to nodeId for matter pairing if no name', () => {
    const result = normalizePairingRecord('abc', { protocol: 'matter', nodeId: '42' });
    assert.equal(result.name, '42');
  });

  it('preserves existing name for matter pairing', () => {
    const result = normalizePairingRecord('abc', { protocol: 'matter', nodeId: '42', name: 'My Device' });
    assert.equal(result.name, 'My Device');
  });

  it('preserves extra fields from homekit pairing', () => {
    const result = normalizePairingRecord('abc', { protocol: 'homekit', address: '192.168.1.1', port: 8080 });
    assert.equal(result.address, '192.168.1.1');
    assert.equal(result.port, 8080);
  });
});

describe('normalizePairingsMap', () => {
  it('returns empty object for empty input', () => {
    assert.deepEqual(normalizePairingsMap({}), {});
  });

  it('returns empty object for null input', () => {
    assert.deepEqual(normalizePairingsMap(null), {});
  });

  it('normalizes homekit pairings keyed by id', () => {
    const result = normalizePairingsMap({ abc: { protocol: 'homekit' } });
    assert.ok('abc' in result);
    assert.equal(result.abc.protocol, 'homekit');
  });

  it('normalizes matter pairings keyed by nodeId', () => {
    const result = normalizePairingsMap({ abc: { protocol: 'matter', nodeId: '42' } });
    assert.ok('42' in result);
    assert.equal(result['42'].protocol, 'matter');
  });
});

describe('isHomeKitPairing', () => {
  it('returns true for homekit protocol', () => {
    assert.equal(isHomeKitPairing({ protocol: 'homekit' }), true);
  });

  it('returns false for matter protocol', () => {
    assert.equal(isHomeKitPairing({ protocol: 'matter' }), false);
  });

  it('returns true for missing protocol (default is homekit)', () => {
    assert.equal(isHomeKitPairing({}), true);
  });

  it('returns true for null/undefined pairing', () => {
    assert.equal(isHomeKitPairing(undefined), true);
  });
});

describe('getHomeKitPairings', () => {
  it('returns only homekit pairings', () => {
    const result = getHomeKitPairings({
      a: { protocol: 'homekit' },
      b: { protocol: 'matter' },
    });
    assert.ok('a' in result);
    assert.ok(!('b' in result));
  });

  it('returns empty object for empty input', () => {
    assert.deepEqual(getHomeKitPairings({}), {});
  });

  it('returns all pairings when all are homekit', () => {
    const result = getHomeKitPairings({
      a: { protocol: 'homekit' },
      b: { protocol: 'homekit' },
    });
    assert.equal(Object.keys(result).length, 2);
  });
});

describe('mapReliabilityStats', () => {
  it('returns null for null input', () => {
    assert.equal(mapReliabilityStats(null), null);
  });

  it('returns null for undefined input', () => {
    assert.equal(mapReliabilityStats(undefined), null);
  });

  it('maps camelCase keys to snake_case', () => {
    const result = mapReliabilityStats({
      connectAttempts: 5,
      reconnectAttempts: 2,
      reconnectSchedules: 1,
      disconnects: 3,
      resubscribeSuccesses: 4,
      resubscribeFailures: 0,
      subscribeFailures: 1,
      accessoriesQueryFailures: 0,
      lastConnectedAt: '2024-01-01T00:00:00Z',
      lastSubscribedAt: '2024-01-01T00:01:00Z',
      lastError: null,
      lastErrorAt: null,
      authFailures: 0,
      authFailed: false,
      needsRepair: false,
      autoRepairAttempts: 0,
      autoRepairLastError: null,
      autoRepairedAt: null,
    });
    assert.equal(result.connect_attempts, 5);
    assert.equal(result.reconnect_attempts, 2);
    assert.equal(result.disconnects, 3);
    assert.equal(result.last_connected_at, '2024-01-01T00:00:00Z');
    assert.equal(result.auth_failures, 0);
    assert.equal(result.needs_repair, false);
  });
});

describe('createStoreHelpers', () => {
  function makeMockStore(data = {}) {
    let snapshot = { ...data };
    return {
      getSnapshot: () => snapshot,
      getByKey: (key) => snapshot[key],
      write: async (val) => { snapshot = val; },
      refresh: async () => {},
    };
  }

  function makeStores(pairingsData = {}, roomsData = {}) {
    return {
      pairingsStore: makeMockStore(pairingsData),
      roomsStore: makeMockStore(roomsData),
      displayNamesStore: makeMockStore({}),
      notesStore: makeMockStore({}),
      retentionStore: makeMockStore({}),
      getMatterRuntime: () => null,
      normalizeRetentionSettings: (s) => ({ ...s, retentionDays: s.retentionDays ?? 365 }),
    };
  }

  it('returns all 10 store wrapper functions', () => {
    const helpers = createStoreHelpers(makeStores());
    assert.ok(typeof helpers.loadPairings === 'function');
    assert.ok(typeof helpers.savePairings === 'function');
    assert.ok(typeof helpers.loadRooms === 'function');
    assert.ok(typeof helpers.saveRooms === 'function');
    assert.ok(typeof helpers.loadDisplayNames === 'function');
    assert.ok(typeof helpers.saveDisplayNames === 'function');
    assert.ok(typeof helpers.loadNotes === 'function');
    assert.ok(typeof helpers.saveNotes === 'function');
    assert.ok(typeof helpers.loadRetentionSettings === 'function');
    assert.ok(typeof helpers.saveRetentionSettings === 'function');
  });

  it('loadPairings calls normalizePairingsMap on pairingsStore.getSnapshot()', () => {
    const stores = makeStores({ abc: { protocol: 'homekit', address: '1.2.3.4' } });
    const helpers = createStoreHelpers(stores);
    const result = helpers.loadPairings();
    assert.ok('abc' in result);
    assert.equal(result.abc.protocol, 'homekit');
  });

  it('savePairings preserves longTermData from existing entries', async () => {
    const existingData = { abc: { protocol: 'homekit', longTermData: 'secret' } };
    const stores = makeStores(existingData);
    const helpers = createStoreHelpers(stores);

    // savePairings with entry that lacks longTermData
    await helpers.savePairings({ abc: { protocol: 'homekit' } });

    // After save, the store should have preserved longTermData
    const snapshot = stores.pairingsStore.getSnapshot();
    assert.equal(snapshot.abc.longTermData, 'secret');
  });

  it('savePairings calls matterRuntime.syncPairings when runtime exists', async () => {
    const stores = makeStores({});
    let synced = false;
    stores.getMatterRuntime = () => ({
      syncPairings: () => { synced = true; },
    });
    const helpers = createStoreHelpers(stores);
    await helpers.savePairings({ abc: { protocol: 'homekit' } });
    assert.equal(synced, true);
  });

  it('loadRooms returns roomsStore snapshot', () => {
    const stores = makeStores({}, { 'abc': 'Living Room' });
    const helpers = createStoreHelpers(stores);
    assert.deepEqual(helpers.loadRooms(), { 'abc': 'Living Room' });
  });

  it('saveRooms writes to roomsStore', async () => {
    const stores = makeStores({}, {});
    const helpers = createStoreHelpers(stores);
    await helpers.saveRooms({ 'xyz': 'Kitchen' });
    assert.deepEqual(stores.roomsStore.getSnapshot(), { 'xyz': 'Kitchen' });
  });
});
