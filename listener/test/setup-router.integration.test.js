import test from 'node:test';
import assert from 'node:assert/strict';
import { createSetupRouter } from '../src/setup-router.js';

function getRouteHandler(router, method, path) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (layer.route.path !== path) continue;
    if (!layer.route.methods[method.toLowerCase()]) continue;
    return layer.route.stack.at(-1).handle;
  }
  throw new Error(`Route not found: ${method} ${path}`);
}

async function invoke(handler, { query = {}, params = {}, body = {} } = {}) {
  let statusCode = 200;
  let jsonBody = null;
  const req = { query, params, body };
  const res = {
    status(code) { statusCode = code; return this; },
    json(payload) { jsonBody = payload; return this; },
    setHeader() { return this; },
  };
  await handler(req, res);
  return { statusCode, jsonBody };
}

class MockHttpClient {
  constructor() {}
  async pairSetup() {}
  getLongTermData() { return { key: 'test' }; }
  async getAccessories() { return { accessories: [] }; }
}

function makeRouter(overrides = {}) {
  return createSetupRouter({
    pool: { async query() { return { rows: [] }; } },
    getDiscoveryCache: () => [],
    setDiscoveryCache: () => {},
    runDiscoveryScan: async () => [],
    loadPairings: () => ({}),
    savePairings: async () => {},
    loadRooms: () => ({}),
    saveRooms: async () => {},
    loadDisplayNames: () => ({}),
    saveDisplayNames: async () => {},
    loadNotes: () => ({}),
    saveNotes: async () => {},
    discoverDeviceForRepair: async () => null,
    savePairingForRepair: async () => {},
    startSubscribers: () => {},
    stopSubscriber: () => {},
    resetSubscriberStats: () => {},
    getPairingForLookup: () => null,
    HttpClient: MockHttpClient,
    ...overrides,
  });
}

// -- GET /discovered --

test('GET /discovered — returns accessories from discovery cache with paired status', async () => {
  const router = makeRouter({
    getDiscoveryCache: () => [{ id: 'abc', name: 'Light', paired: false, pairedElsewhere: false }],
    loadPairings: () => ({ abc: { protocol: 'homekit' } }),
  });
  const handler = getRouteHandler(router, 'GET', '/discovered');
  const { statusCode, jsonBody } = await invoke(handler);

  assert.equal(statusCode, 200);
  assert.ok(Array.isArray(jsonBody.accessories), 'accessories should be an array');
  assert.equal(jsonBody.accessories[0].alreadyPaired, true);
  assert.ok(typeof jsonBody.cachedAt === 'string', 'cachedAt should be a string');
});

test('GET /discovered — returns empty list when cache is empty', async () => {
  const router = makeRouter();
  const handler = getRouteHandler(router, 'GET', '/discovered');
  const { statusCode, jsonBody } = await invoke(handler);

  assert.equal(statusCode, 200);
  assert.equal(jsonBody.accessories.length, 0);
});

// -- GET /discovered (cache state change -- D-14) --

test('GET /discovered — uses live getter, not snapshot captured at construction', async () => {
  let cache = [];
  const router = makeRouter({
    getDiscoveryCache: () => cache,
  });
  const handler = getRouteHandler(router, 'GET', '/discovered');

  const { jsonBody: first } = await invoke(handler);
  assert.equal(first.accessories.length, 0, 'Initial cache should be empty');

  cache = [{ id: 'new', name: 'New Device', paired: false, pairedElsewhere: false }];

  const { jsonBody: second } = await invoke(handler);
  assert.equal(second.accessories.length, 1, 'Updated cache should return new device');
  assert.equal(second.accessories[0].id, 'new');
});

// -- POST /scan --

test('POST /scan — calls runDiscoveryScan and returns results', async () => {
  const router = makeRouter({
    runDiscoveryScan: async () => [{ id: 'x', name: 'X' }],
  });
  const handler = getRouteHandler(router, 'POST', '/scan');
  const { statusCode, jsonBody } = await invoke(handler);

  assert.equal(statusCode, 200);
  assert.equal(jsonBody.accessories.length, 1);
  assert.equal(jsonBody.accessories[0].id, 'x');
});

test('POST /scan — returns 502 with cached results on scan failure', async () => {
  const router = makeRouter({
    runDiscoveryScan: async () => { throw new Error('mDNS failed'); },
    getDiscoveryCache: () => [{ id: 'old', name: 'Old' }],
  });
  const handler = getRouteHandler(router, 'POST', '/scan');
  const { statusCode, jsonBody } = await invoke(handler);

  assert.equal(statusCode, 502);
  assert.ok(jsonBody.warning.includes('mDNS scan failed'), 'Warning should mention mDNS scan failed');
  assert.equal(jsonBody.accessories.length, 1);
});

// -- POST /pair --

test('POST /pair — successful pairing returns success', async () => {
  let savePairingsCalled = false;
  let startSubscribersCalled = false;

  const router = makeRouter({
    getDiscoveryCache: () => [
      { id: 'dev1', name: 'Switch', address: '1.2.3.4', port: 80, paired: false, pairedElsewhere: false, category: 8 },
    ],
    savePairings: async () => { savePairingsCalled = true; },
    startSubscribers: () => { startSubscribersCalled = true; },
  });
  const handler = getRouteHandler(router, 'POST', '/pair');
  const { statusCode, jsonBody } = await invoke(handler, {
    body: { deviceId: 'dev1', pin: '123-45-678' },
  });

  assert.equal(statusCode, 200);
  assert.equal(jsonBody.success, true);
  assert.equal(jsonBody.name, 'Switch');
  assert.ok(savePairingsCalled, 'savePairings should be called');
  assert.ok(startSubscribersCalled, 'startSubscribers should be called');
});

// -- POST /pair (pair method from mDNS feature flags) --

function makePairMethodRouter({ ff, pairSetupError = null, failMethods = null } = {}) {
  const pairSetupCalls = [];
  let saved = null;
  class RecordingHttpClient extends MockHttpClient {
    async pairSetup(pin, method) {
      pairSetupCalls.push({ pin, method });
      if (pairSetupError && (!failMethods || failMethods.includes(method))) throw new Error(pairSetupError);
    }
  }
  const router = makeRouter({
    getDiscoveryCache: () => [
      { id: 'dev1', name: 'Plug', address: '1.2.3.4', port: 80, paired: false, pairedElsewhere: false, category: 7, ff },
    ],
    savePairings: async (p) => { saved = p; },
    HttpClient: RecordingHttpClient,
  });
  return { router, pairSetupCalls, getSaved: () => saved };
}

test('POST /pair — uses PairSetup when the accessory has no auth coprocessor (ff=0)', async () => {
  const { router, pairSetupCalls, getSaved } = makePairMethodRouter({ ff: 0 });
  const handler = getRouteHandler(router, 'POST', '/pair');
  const { statusCode } = await invoke(handler, { body: { deviceId: 'dev1', pin: '123-45-678' } });

  assert.equal(statusCode, 200);
  assert.deepEqual(pairSetupCalls, [{ pin: '123-45-678', method: 0 }]);
  assert.equal(getSaved().dev1.pairMethod, 0, 'pair method persisted for re-pair');
});

test('POST /pair — uses PairSetup for software-auth accessories (ff=2)', async () => {
  const { router, pairSetupCalls } = makePairMethodRouter({ ff: 2 });
  const handler = getRouteHandler(router, 'POST', '/pair');
  await invoke(handler, { body: { deviceId: 'dev1', pin: '123-45-678' } });

  assert.equal(pairSetupCalls[0].method, 0);
});

test('POST /pair — uses PairSetupWithAuth when the accessory has an auth coprocessor (ff=1)', async () => {
  const { router, pairSetupCalls, getSaved } = makePairMethodRouter({ ff: 1 });
  const handler = getRouteHandler(router, 'POST', '/pair');
  await invoke(handler, { body: { deviceId: 'dev1', pin: '123-45-678' } });

  assert.equal(pairSetupCalls[0].method, 1);
  assert.equal(getSaved().dev1.pairMethod, 1);
});

test('POST /pair — M4 empty TLV with both methods returns actionable guidance', async () => {
  const { router, pairSetupCalls } = makePairMethodRouter({ ff: 0, pairSetupError: 'M4: Empty TLV' });
  const handler = getRouteHandler(router, 'POST', '/pair');
  const { statusCode, jsonBody } = await invoke(handler, { body: { deviceId: 'dev1', pin: '123-45-678' } });

  assert.equal(statusCode, 400);
  assert.deepEqual(pairSetupCalls.map((c) => c.method), [0, 1], 'retried once with the other method');
  assert.match(jsonBody.error, /setup code/i);
  assert.doesNotMatch(jsonBody.error, /^Pairing failed: M4/);
});

test('POST /pair — falls back to the other pair method when the first is not understood', async () => {
  const { router, pairSetupCalls, getSaved } = makePairMethodRouter({
    ff: 2, pairSetupError: 'M4: Empty TLV', failMethods: [0],
  });
  const handler = getRouteHandler(router, 'POST', '/pair');
  const { statusCode } = await invoke(handler, { body: { deviceId: 'dev1', pin: '123-45-678' } });

  assert.equal(statusCode, 200);
  assert.deepEqual(pairSetupCalls.map((c) => c.method), [0, 1]);
  assert.equal(getSaved().dev1.pairMethod, 1, 'the method that worked is persisted');
});

test('POST /pair — definitive HAP errors (wrong PIN) are not retried', async () => {
  const { router, pairSetupCalls } = makePairMethodRouter({ ff: 0, pairSetupError: 'M4: Error: 2' });
  const handler = getRouteHandler(router, 'POST', '/pair');
  const { statusCode, jsonBody } = await invoke(handler, { body: { deviceId: 'dev1', pin: '123-45-678' } });

  assert.equal(statusCode, 400);
  assert.equal(pairSetupCalls.length, 1);
  assert.match(jsonBody.error, /Wrong PIN/);
});

test('POST /pair — missing deviceId returns 400', async () => {
  const router = makeRouter();
  const handler = getRouteHandler(router, 'POST', '/pair');
  const { statusCode, jsonBody } = await invoke(handler, {
    body: { pin: '123' },
  });

  assert.equal(statusCode, 400);
  assert.ok(jsonBody.error);
});

test('POST /pair — unknown deviceId returns 404', async () => {
  const router = makeRouter({
    getDiscoveryCache: () => [],
  });
  const handler = getRouteHandler(router, 'POST', '/pair');
  const { statusCode } = await invoke(handler, {
    body: { deviceId: 'unknown', pin: '123' },
  });

  assert.equal(statusCode, 404);
});

test('POST /pair — non-homekit protocol returns 400', async () => {
  const router = makeRouter({
    getDiscoveryCache: () => [
      { id: 'dev1', name: 'Switch', address: '1.2.3.4', port: 80, paired: false, pairedElsewhere: false, category: 8 },
    ],
  });
  const handler = getRouteHandler(router, 'POST', '/pair');
  const { statusCode } = await invoke(handler, {
    body: { deviceId: 'dev1', pin: '123', protocol: 'matter' },
  });

  assert.equal(statusCode, 400);
});

// -- GET /bridge-children/:deviceId --

test('GET /bridge-children/:deviceId — returns children for known bridge', async () => {
  const router = makeRouter({
    loadPairings: () => ({
      br1: { protocol: 'homekit', name: 'Bridge', address: '1.2.3.4', port: 80, longTermData: {} },
    }),
    HttpClient: class MockBridgeClient {
      async getAccessories() {
        return {
          accessories: [
            { aid: 1, services: [] }, // bridge itself, should be skipped
            { aid: 2, services: [{ type: '0000003E-0000-1000-8000-0026BB765291', characteristics: [{ type: '00000023-0000-1000-8000-0026BB765291', value: 'Child Light' }] }] },
          ],
        };
      }
    },
  });
  const handler = getRouteHandler(router, 'GET', '/bridge-children/:deviceId');
  const { statusCode, jsonBody } = await invoke(handler, {
    params: { deviceId: 'br1' },
  });

  assert.equal(statusCode, 200);
  assert.ok(Array.isArray(jsonBody), 'Response should be an array');
  assert.equal(jsonBody.length, 1, 'Should have 1 child (aid:1 bridge skipped)');
  assert.equal(jsonBody[0].aid, 2);
});

test('GET /bridge-children/:deviceId — a multi-outlet accessory is listed as its outlets', async () => {
  const T = (short) => `${short.padStart(8, '0')}-0000-1000-8000-0026BB765291`;
  const outlet = (iid, name) => ({
    iid, type: T('47'),
    characteristics: [{ iid: iid + 1, type: T('25'), value: false }, { iid: iid + 2, type: T('23'), value: name }],
  });
  const MAC = 'AA:BB:CC:DD:EE:FF';
  const router = makeRouter({
    loadPairings: () => ({
      [MAC]: { protocol: 'homekit', name: 'Bridge', address: '1.2.3.4', port: 80, longTermData: {} },
    }),
    HttpClient: class MockBridgeClient {
      async getAccessories() {
        return {
          accessories: [
            { aid: 1, services: [] },
            { aid: 2, services: [{ iid: 1, type: T('3E'), characteristics: [{ iid: 2, type: T('23'), value: 'Holiday Outlet' }] }, outlet(8, 'Tree'), outlet(11, 'Garland')] },
            { aid: 3, services: [{ iid: 1, type: T('3E'), characteristics: [{ iid: 2, type: T('23'), value: 'Left Bed' }] }, outlet(8, 'Left Bed')] },
          ],
        };
      }
    },
  });
  const handler = getRouteHandler(router, 'GET', '/bridge-children/:deviceId');
  const { statusCode, jsonBody } = await invoke(handler, { params: { deviceId: MAC } });

  assert.equal(statusCode, 200);
  assert.deepEqual(jsonBody, [
    { childId: `${MAC}:2:8`, name: 'Tree', aid: 2, parentChildId: `${MAC}:2`, parentName: 'Holiday Outlet' },
    { childId: `${MAC}:2:11`, name: 'Garland', aid: 2, parentChildId: `${MAC}:2`, parentName: 'Holiday Outlet' },
    { childId: `${MAC}:3`, name: 'Left Bed', aid: 3 },
  ]);
});

test('GET /bridge-children/:deviceId — 404 for unknown pairing', async () => {
  const router = makeRouter({
    loadPairings: () => ({}),
  });
  const handler = getRouteHandler(router, 'GET', '/bridge-children/:deviceId');
  const { statusCode } = await invoke(handler, {
    params: { deviceId: 'unknown' },
  });

  assert.equal(statusCode, 404);
});

// -- GET /pairings --

test('GET /pairings — returns list of HomeKit pairings', async () => {
  const router = makeRouter({
    loadPairings: () => ({
      dev1: { protocol: 'homekit', name: 'Light', address: '1.2.3.4', port: 80, category: 5, pairedAt: '2026-01-01T00:00:00Z' },
    }),
  });
  const handler = getRouteHandler(router, 'GET', '/pairings');
  const { statusCode, jsonBody } = await invoke(handler);

  assert.equal(statusCode, 200);
  assert.ok(Array.isArray(jsonBody), 'Response should be an array');
  assert.equal(jsonBody.length, 1);
  assert.equal(jsonBody[0].id, 'dev1');
  assert.equal(jsonBody[0].protocol, 'homekit');
  assert.equal(jsonBody[0].name, 'Light');
  assert.ok('address' in jsonBody[0]);
  assert.ok('port' in jsonBody[0]);
  assert.ok('category' in jsonBody[0]);
  assert.ok('pairedAt' in jsonBody[0]);
});

// -- DELETE /pairing/:deviceId --

test('DELETE /pairing/:deviceId — deletes known pairing successfully', async () => {
  let savePairingsCalled = false;
  let stopSubscriberCalled = false;

  const router = makeRouter({
    loadPairings: () => ({ dev1: { protocol: 'homekit', name: 'Light' } }),
    savePairings: async () => { savePairingsCalled = true; },
    stopSubscriber: () => { stopSubscriberCalled = true; },
  });
  const handler = getRouteHandler(router, 'DELETE', '/pairing/:deviceId');
  const { statusCode, jsonBody } = await invoke(handler, {
    params: { deviceId: 'dev1' },
  });

  assert.equal(statusCode, 200);
  assert.equal(jsonBody.success, true);
  assert.ok(savePairingsCalled, 'savePairings should be called');
  assert.ok(stopSubscriberCalled, 'stopSubscriber should be called');
});

test('DELETE /pairing/:deviceId — 404 for unknown deviceId', async () => {
  const router = makeRouter({
    loadPairings: () => ({}),
  });
  const handler = getRouteHandler(router, 'DELETE', '/pairing/:deviceId');
  const { statusCode } = await invoke(handler, {
    params: { deviceId: 'unknown' },
  });

  assert.equal(statusCode, 404);
});

test('DELETE /pairing/:deviceId — 400 for non-HomeKit pairing', async () => {
  const router = makeRouter({
    loadPairings: () => ({ dev1: { protocol: 'matter' } }),
  });
  const handler = getRouteHandler(router, 'DELETE', '/pairing/:deviceId');
  const { statusCode } = await invoke(handler, {
    params: { deviceId: 'dev1' },
  });

  assert.equal(statusCode, 400);
});

// -- POST /repair/:deviceId --

test('POST /repair/:deviceId — successful repair', async () => {
  let resetStatsCalled = false;
  let stopSubscriberCalled = false;
  let startSubscribersCalled = false;

  const router = makeRouter({
    loadPairings: () => ({
      dev1: { protocol: 'homekit', name: 'Light', pin: '123-45-678', address: '1.2.3.4', port: 80 },
    }),
    discoverDeviceForRepair: async () => ({ address: '1.2.3.4', port: 80 }),
    resetSubscriberStats: () => { resetStatsCalled = true; },
    stopSubscriber: () => { stopSubscriberCalled = true; },
    startSubscribers: () => { startSubscribersCalled = true; },
    savePairings: async () => {},
  });
  const handler = getRouteHandler(router, 'POST', '/repair/:deviceId');
  const { statusCode, jsonBody } = await invoke(handler, {
    params: { deviceId: 'dev1' },
  });

  assert.equal(statusCode, 200);
  assert.equal(jsonBody.success, true);
  assert.ok(resetStatsCalled, 'resetSubscriberStats should be called');
  assert.ok(stopSubscriberCalled, 'stopSubscriber should be called');
  assert.ok(startSubscribersCalled, 'startSubscribers should be called');
});

test('POST /repair/:deviceId — reuses the stored pair method; legacy records keep PairSetupWithAuth', async () => {
  for (const [stored, expected] of [[0, 0], [1, 1], [undefined, 1]]) {
    const methods = [];
    class RecordingHttpClient extends MockHttpClient {
      async pairSetup(_pin, method) { methods.push(method); }
    }
    const router = makeRouter({
      loadPairings: () => ({
        dev1: { protocol: 'homekit', name: 'Light', pin: '123-45-678', address: '1.2.3.4', port: 80, pairMethod: stored },
      }),
      discoverDeviceForRepair: async () => ({ address: '1.2.3.4', port: 80 }),
      HttpClient: RecordingHttpClient,
    });
    const handler = getRouteHandler(router, 'POST', '/repair/:deviceId');
    const { statusCode } = await invoke(handler, { params: { deviceId: 'dev1' } });

    assert.equal(statusCode, 200);
    assert.deepEqual(methods, [expected], `stored pairMethod=${stored}`);
  }
});

test('POST /repair/:deviceId — 404 for unknown device', async () => {
  const router = makeRouter({
    loadPairings: () => ({}),
  });
  const handler = getRouteHandler(router, 'POST', '/repair/:deviceId');
  const { statusCode } = await invoke(handler, {
    params: { deviceId: 'unknown' },
  });

  assert.equal(statusCode, 404);
});

test('POST /repair/:deviceId — 404 when device not found on network', async () => {
  const router = makeRouter({
    loadPairings: () => ({
      dev1: { protocol: 'homekit', name: 'Light', pin: '123-45-678', address: '1.2.3.4', port: 80 },
    }),
    discoverDeviceForRepair: async () => null,
  });
  const handler = getRouteHandler(router, 'POST', '/repair/:deviceId');
  const { statusCode, jsonBody } = await invoke(handler, {
    params: { deviceId: 'dev1' },
  });

  assert.equal(statusCode, 404);
  assert.equal(jsonBody.code, 'NOT_FOUND_NETWORK');
});

// -- POST /add-pairing --

test('POST /add-pairing — missing sourcePairings returns 400', async () => {
  const router = makeRouter();
  const handler = getRouteHandler(router, 'POST', '/add-pairing');
  const { statusCode, jsonBody } = await invoke(handler, {
    body: {},
  });

  assert.equal(statusCode, 400);
  assert.ok(jsonBody.error);
});

test('POST /add-pairing — empty HomeKit entries returns 400', async () => {
  const router = makeRouter();
  const handler = getRouteHandler(router, 'POST', '/add-pairing');
  const { statusCode, jsonBody } = await invoke(handler, {
    body: { sourcePairings: { m1: { protocol: 'matter' } } },
  });

  assert.equal(statusCode, 400);
  assert.ok(jsonBody.error.includes('No HomeKit pairings'));
});

// -- PATCH /room --

test('PATCH /room — sets room for accessory', async () => {
  let saveRoomsCalled = false;
  const router = makeRouter({
    saveRooms: async () => { saveRoomsCalled = true; },
  });
  const handler = getRouteHandler(router, 'PATCH', '/room');
  const { statusCode, jsonBody } = await invoke(handler, {
    body: { accessoryId: 'a1', roomName: 'Kitchen' },
  });

  assert.equal(statusCode, 200);
  assert.equal(jsonBody.success, true);
  assert.ok(saveRoomsCalled, 'saveRooms should be called');
});

test('PATCH /room — clears room when roomName is empty', async () => {
  const router = makeRouter({
    loadRooms: () => ({ a1: 'Kitchen' }),
    saveRooms: async () => {},
  });
  const handler = getRouteHandler(router, 'PATCH', '/room');
  const { statusCode, jsonBody } = await invoke(handler, {
    body: { accessoryId: 'a1', roomName: '' },
  });

  assert.equal(statusCode, 200);
  assert.equal(jsonBody.success, true);
});

test('PATCH /room — 400 when accessoryId missing', async () => {
  const router = makeRouter();
  const handler = getRouteHandler(router, 'PATCH', '/room');
  const { statusCode } = await invoke(handler, {
    body: { roomName: 'Kitchen' },
  });

  assert.equal(statusCode, 400);
});

// -- GET /rooms --

test('GET /rooms — returns rooms object', async () => {
  const router = makeRouter({
    loadRooms: () => ({ a1: 'Kitchen' }),
  });
  const handler = getRouteHandler(router, 'GET', '/rooms');
  const { statusCode, jsonBody } = await invoke(handler);

  assert.equal(statusCode, 200);
  assert.deepEqual(jsonBody, { a1: 'Kitchen' });
});

// -- PATCH /display-name --

// Fake pool whose transactions succeed; records rename UPDATE params.
function renamePool(order = []) {
  return {
    async query() { return { rows: [] }; },
    async connect() {
      return {
        async query(sql, params = []) {
          if (/^\s*UPDATE event_logs\b/.test(sql)) order.push(['rename', params]);
          return { rows: [], rowCount: /^\s*UPDATE event_logs/.test(sql) ? 3 : 0 };
        },
        release() {},
      };
    },
  };
}

// Display-name store backed by a variable, as the real store is.
function nameStore(initial = {}) {
  let names = { ...initial };
  return {
    loadDisplayNames: () => ({ ...names }),
    saveDisplayNames: async (next) => { names = { ...next }; },
    get: () => names,
  };
}

test('PATCH /display-name — sets display name for accessory', async () => {
  const store = nameStore();
  const router = makeRouter({ ...store, pool: renamePool() });
  const handler = getRouteHandler(router, 'PATCH', '/display-name');
  const { statusCode, jsonBody } = await invoke(handler, {
    body: { accessoryId: 'a1', displayName: 'My Light' },
  });

  assert.equal(statusCode, 200);
  assert.equal(jsonBody.success, true);
  assert.deepEqual(store.get(), { a1: 'My Light' });
});

test('PATCH /display-name — clears display name when displayName is empty', async () => {
  const store = nameStore({ a1: 'My Light' });
  const order = [];
  const router = makeRouter({ ...store, pool: renamePool(order) });
  const handler = getRouteHandler(router, 'PATCH', '/display-name');
  const { statusCode, jsonBody } = await invoke(handler, {
    body: { accessoryId: 'a1', displayName: '' },
  });

  assert.equal(statusCode, 200);
  assert.equal(jsonBody.success, true);
  assert.deepEqual(store.get(), {});
  assert.deepEqual(order[0], ['rename', ['a1']], 'past events restored');
});

test('PATCH /display-name — saves the name, then renames past events with it', async () => {
  const store = nameStore();
  const order = [];
  const router = makeRouter({
    ...store,
    saveDisplayNames: async (names) => { order.push(['save', names]); await store.saveDisplayNames(names); },
    pool: renamePool(order),
  });
  const handler = getRouteHandler(router, 'PATCH', '/display-name');
  const { statusCode, jsonBody } = await invoke(handler, {
    body: { accessoryId: 'AA:BB:2', displayName: 'Neakasa' },
  });

  assert.equal(statusCode, 200);
  assert.equal(jsonBody.eventsUpdated, 6);
  assert.equal(jsonBody.pending, false);
  assert.deepEqual(order[0], ['save', { 'AA:BB:2': 'Neakasa' }]);
  assert.deepEqual(order[1], ['rename', ['AA:BB:2', 'Neakasa']]);
});

test('PATCH /display-name — a failed rename keeps the saved name and says it will retry', async () => {
  const store = nameStore();
  const router = makeRouter({ ...store, pool: { async connect() { throw new Error('db down'); } } });
  const handler = getRouteHandler(router, 'PATCH', '/display-name');
  const { statusCode, jsonBody } = await invoke(handler, {
    body: { accessoryId: 'AA:BB:2', displayName: 'Neakasa' },
  });

  assert.equal(statusCode, 500);
  assert.match(jsonBody.error, /saved.*retries/);
  assert.deepEqual(store.get(), { 'AA:BB:2': 'Neakasa' });
});

test('PATCH /display-name — 500 JSON when the name cannot be saved', async () => {
  const router = makeRouter({
    saveDisplayNames: async () => { throw new Error('disk full'); },
  });
  const handler = getRouteHandler(router, 'PATCH', '/display-name');
  const { statusCode, jsonBody } = await invoke(handler, {
    body: { accessoryId: 'AA:BB:2', displayName: 'Neakasa' },
  });
  assert.equal(statusCode, 500);
  assert.deepEqual(jsonBody, { error: 'Internal server error' });
});

test('PATCH /display-name — 400 when displayName is not a string', async () => {
  const router = makeRouter();
  const handler = getRouteHandler(router, 'PATCH', '/display-name');
  const { statusCode } = await invoke(handler, { body: { accessoryId: 'a1', displayName: 42 } });
  assert.equal(statusCode, 400);
});

test('PATCH /display-name — 400 when accessoryId missing', async () => {
  const router = makeRouter();
  const handler = getRouteHandler(router, 'PATCH', '/display-name');
  const { statusCode } = await invoke(handler, {
    body: { displayName: 'My Light' },
  });

  assert.equal(statusCode, 400);
});

// -- GET /display-names --

test('GET /display-names — returns display names object', async () => {
  const router = makeRouter({
    loadDisplayNames: () => ({ a1: 'My Light' }),
  });
  const handler = getRouteHandler(router, 'GET', '/display-names');
  const { statusCode, jsonBody } = await invoke(handler);

  assert.equal(statusCode, 200);
  assert.deepEqual(jsonBody, { a1: 'My Light' });
});

// -- PATCH /note --

test('PATCH /note — sets note for accessory', async () => {
  let saveNotesCalled = false;
  const router = makeRouter({
    saveNotes: async () => { saveNotesCalled = true; },
  });
  const handler = getRouteHandler(router, 'PATCH', '/note');
  const { statusCode, jsonBody } = await invoke(handler, {
    body: { accessoryId: 'a1', note: 'Living room ceiling' },
  });

  assert.equal(statusCode, 200);
  assert.equal(jsonBody.success, true);
  assert.ok(saveNotesCalled, 'saveNotes should be called');
});

test('PATCH /note — clears note when note is empty', async () => {
  const router = makeRouter({
    loadNotes: () => ({ a1: 'Old note' }),
    saveNotes: async () => {},
  });
  const handler = getRouteHandler(router, 'PATCH', '/note');
  const { statusCode, jsonBody } = await invoke(handler, {
    body: { accessoryId: 'a1', note: '' },
  });

  assert.equal(statusCode, 200);
  assert.equal(jsonBody.success, true);
});

test('PATCH /note — 400 when accessoryId missing', async () => {
  const router = makeRouter();
  const handler = getRouteHandler(router, 'PATCH', '/note');
  const { statusCode } = await invoke(handler, {
    body: { note: 'Some note' },
  });

  assert.equal(statusCode, 400);
});

// -- GET /notes --

test('GET /notes — returns notes object', async () => {
  const router = makeRouter({
    loadNotes: () => ({ a1: 'Living room ceiling' }),
  });
  const handler = getRouteHandler(router, 'GET', '/notes');
  const { statusCode, jsonBody } = await invoke(handler);

  assert.equal(statusCode, 200);
  assert.deepEqual(jsonBody, { a1: 'Living room ceiling' });
});

// -- GET /log-level --

test('GET /log-level — returns current level', async () => {
  const router = makeRouter();
  const handler = getRouteHandler(router, 'GET', '/log-level');
  const { statusCode, jsonBody } = await invoke(handler);

  assert.equal(statusCode, 200);
  assert.ok('level' in jsonBody, 'Response should have level property');
  assert.ok(typeof jsonBody.level === 'string', 'level should be a string');
});

// -- PATCH /log-level --

test('PATCH /log-level — sets valid level', async () => {
  const router = makeRouter();
  const handler = getRouteHandler(router, 'PATCH', '/log-level');
  const { statusCode, jsonBody } = await invoke(handler, {
    body: { level: 'debug' },
  });

  assert.equal(statusCode, 200);
  assert.equal(jsonBody.level, 'debug');
});

test('PATCH /log-level — rejects invalid level with 400', async () => {
  const router = makeRouter();
  const handler = getRouteHandler(router, 'PATCH', '/log-level');
  const { statusCode } = await invoke(handler, {
    body: { level: 'invalid' },
  });

  assert.equal(statusCode, 400);
});

// Reset log level to default after all tests
test.after(async () => {
  const { setLevel } = await import('../src/logger.js');
  setLevel('info');
});

// -- POST /pair: accessories announcing several addresses --

function makeMultiAddressRouter({ unreachable = [], wrongPin = false } = {}) {
  const attempts = [];
  let saved = null;
  class AddressAwareHttpClient extends MockHttpClient {
    constructor(deviceId, address, port) {
      super(deviceId, address, port);
      this.address = address;
    }
    async pairSetup() {
      attempts.push(this.address);
      if (unreachable.includes(this.address)) throw new Error(`connect EHOSTUNREACH ${this.address}:55203`);
      if (wrongPin) throw new Error('M4: Error: 2');
    }
  }
  const router = makeRouter({
    getDiscoveryCache: () => [
      { id: 'hb', name: 'Homebridge', address: '10.0.0.193', addresses: ['10.0.0.193', '172.16.25.26'], port: 55203, paired: false, pairedElsewhere: false, category: 2, ff: 0 },
    ],
    savePairings: async (p) => { saved = p; },
    HttpClient: AddressAwareHttpClient,
  });
  return { router, attempts, getSaved: () => saved };
}

test('POST /pair — an unreachable announced address fails over to the next one', async () => {
  const { router, attempts, getSaved } = makeMultiAddressRouter({ unreachable: ['10.0.0.193'] });
  const handler = getRouteHandler(router, 'POST', '/pair');
  const { statusCode } = await invoke(handler, { body: { deviceId: 'hb', pin: '123-45-678' } });

  assert.equal(statusCode, 200);
  assert.deepEqual(attempts, ['10.0.0.193', '172.16.25.26']);
  assert.equal(getSaved().hb.address, '172.16.25.26', 'the address that worked is stored');
  assert.deepEqual(getSaved().hb.addresses, ['10.0.0.193', '172.16.25.26']);
});

test('POST /pair — a wrong PIN is not retried on another address', async () => {
  const { router, attempts } = makeMultiAddressRouter({ wrongPin: true });
  const handler = getRouteHandler(router, 'POST', '/pair');
  const { statusCode, jsonBody } = await invoke(handler, { body: { deviceId: 'hb', pin: '123-45-678' } });

  assert.equal(statusCode, 400);
  assert.deepEqual(attempts, ['10.0.0.193']);
  assert.match(jsonBody.error, /Wrong PIN/);
});

test('POST /pair — every announced address unreachable reports the device as unreachable', async () => {
  const { router, attempts } = makeMultiAddressRouter({ unreachable: ['10.0.0.193', '172.16.25.26'] });
  const handler = getRouteHandler(router, 'POST', '/pair');
  const { statusCode, jsonBody } = await invoke(handler, { body: { deviceId: 'hb', pin: '123-45-678' } });

  assert.equal(statusCode, 400);
  assert.equal(attempts.length, 2);
  assert.match(jsonBody.error, /Could not reach the device/);
});
