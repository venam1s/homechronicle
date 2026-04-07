import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccessoriesRouter } from '../src/accessories-router.js';

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
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      jsonBody = payload;
      return this;
    },
  };
  await handler(req, res);
  return { statusCode, jsonBody };
}

function makeRouter(overrides = {}) {
  return createAccessoriesRouter({
    pool: { async query() { return { rows: [] }; } },
    loadPairings: () => ({}),
    loadRooms: () => ({}),
    getRetentionSettings: () => ({ staleThresholdHours: 12 }),
    getSubscriberStats: () => null,
    getAccessoryCapabilities: () => null,
    getAccessoryIdentity: () => null,
    getAllDiscoveredAccessories: () => [],
    cacheAccessoryMetadata: () => {},
    deriveDeviceHealth: () => ({ status: 'unknown' }),
    isHomeKitPairing: () => true,
    mapReliabilityStats: () => null,
    parentBridgeId: (id) => id,
    parseIntInRange: (v, fb) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : fb;
    },
    HttpClient: class MockHttpClient {
      async getAccessories() { return { accessories: [] }; }
    },
    ...overrides,
  });
}

// -- GET /accessories (list) --

test('GET /accessories — returns enriched rows from DB', async () => {
  let queryCallCount = 0;
  const router = makeRouter({
    pool: {
      async query() {
        queryCallCount++;
        if (queryCallCount === 1) {
          return {
            rows: [{
              accessory_id: 'aa:bb:cc:dd:ee:ff',
              accessory_name: 'Lamp',
              room_name: 'Living Room',
              service_type: 'Lightbulb',
              protocol: 'homekit',
              last_seen: new Date().toISOString(),
              event_count: 42,
            }],
          };
        }
        return { rows: [] };
      },
    },
  });
  const handler = getRouteHandler(router, 'GET', '/accessories');
  const { statusCode, jsonBody } = await invoke(handler);

  assert.equal(statusCode, 200);
  assert.ok(Array.isArray(jsonBody), 'Response should be an array');
  assert.equal(jsonBody.length, 1);
  assert.equal(jsonBody[0].accessory_id, 'aa:bb:cc:dd:ee:ff');
  assert.ok(queryCallCount >= 1, 'pool.query should be called');
});

test('GET /accessories — DB error returns 500', async () => {
  const router = makeRouter({
    pool: {
      async query() {
        throw new Error('DB down');
      },
    },
  });
  const handler = getRouteHandler(router, 'GET', '/accessories');
  const { statusCode, jsonBody } = await invoke(handler);

  assert.equal(statusCode, 500);
  assert.equal(jsonBody.error, 'Internal server error');
});

test('GET /accessories — applies room override from loadRooms', async () => {
  let queryCallCount = 0;
  const router = makeRouter({
    pool: {
      async query() {
        queryCallCount++;
        if (queryCallCount === 1) {
          return {
            rows: [{
              accessory_id: 'aa:bb:cc:dd:ee:ff',
              accessory_name: 'Lamp',
              room_name: 'Original Room',
              service_type: 'Lightbulb',
              protocol: 'homekit',
              last_seen: new Date().toISOString(),
              event_count: 5,
            }],
          };
        }
        return { rows: [] };
      },
    },
    loadRooms: () => ({ 'aa:bb:cc:dd:ee:ff': 'Kitchen' }),
  });
  const handler = getRouteHandler(router, 'GET', '/accessories');
  const { statusCode, jsonBody } = await invoke(handler);

  assert.equal(statusCode, 200);
  assert.equal(jsonBody[0].room_name, 'Kitchen', 'room_name should be overridden by loadRooms()');
});

// -- GET /accessories/:accessoryId/detail --

test('GET /accessories/:accessoryId/detail — returns accessory detail with events', async () => {
  let queryCallCount = 0;
  const router = makeRouter({
    pool: {
      async query() {
        queryCallCount++;
        // summaryResult
        if (queryCallCount === 1) {
          return { rows: [{ event_count: 10, first_seen: '2026-01-01T00:00:00Z', last_seen: '2026-04-01T00:00:00Z' }] };
        }
        // latestResult
        if (queryCallCount === 2) {
          return { rows: [{ accessory_name: 'Lamp', room_name: 'Kitchen', service_type: 'Lightbulb', protocol: 'homekit' }] };
        }
        // heartbeatResult
        if (queryCallCount === 3) {
          return { rows: [{ heartbeat_seconds: 60, heartbeat_samples: 5 }] };
        }
        // stateResult
        if (queryCallCount === 4) {
          return { rows: [{ characteristic: 'On', new_value: 'true', old_value: 'false', service_type: 'Lightbulb', timestamp: '2026-04-01T00:00:00Z' }] };
        }
        // historyResult
        if (queryCallCount === 5) {
          return { rows: [{ id: 1, timestamp: '2026-04-01T00:00:00Z', accessory_id: 'aa:bb:cc' }] };
        }
        // activityResult
        if (queryCallCount === 6) {
          return { rows: [{ day: '2026-04-01', count: 5 }] };
        }
        // distinctActiveDaysResult
        if (queryCallCount === 7) {
          return { rows: [{ active_days: 30 }] };
        }
        return { rows: [] };
      },
    },
  });
  const handler = getRouteHandler(router, 'GET', '/accessories/:accessoryId/detail');
  const { statusCode, jsonBody } = await invoke(handler, {
    params: { accessoryId: 'aa:bb:cc' },
  });

  assert.equal(statusCode, 200);
  assert.ok(jsonBody.accessory, 'Response should have accessory');
  assert.ok(jsonBody.history, 'Response should have history');
  assert.ok(Array.isArray(jsonBody.history.events), 'history.events should be an array');
  assert.ok(jsonBody.uptime, 'Response should have uptime');
  assert.ok(jsonBody.current_state, 'Response should have current_state');
});

test('GET /accessories/:accessoryId/detail — missing accessoryId returns 400', async () => {
  const router = makeRouter();
  const handler = getRouteHandler(router, 'GET', '/accessories/:accessoryId/detail');
  const { statusCode, jsonBody } = await invoke(handler, {
    params: { accessoryId: '' },
  });

  assert.equal(statusCode, 400);
  assert.ok(jsonBody.error, 'Response should have error message');
});

// -- GET /accessories/:accessoryId/capabilities --

test('GET /accessories/:accessoryId/capabilities — cache hit returns capability', async () => {
  let httpClientCalled = false;
  const cachedCapability = { accessory_id: 'aa:bb:cc', services: [] };
  const router = makeRouter({
    getAccessoryCapabilities: () => cachedCapability,
    HttpClient: class MockHttpClient {
      constructor() { httpClientCalled = true; }
      async getAccessories() { return { accessories: [] }; }
    },
  });
  const handler = getRouteHandler(router, 'GET', '/accessories/:accessoryId/capabilities');
  const { statusCode, jsonBody } = await invoke(handler, {
    params: { accessoryId: 'aa:bb:cc' },
  });

  assert.equal(statusCode, 200);
  assert.deepEqual(jsonBody, cachedCapability);
  assert.equal(httpClientCalled, false, 'HttpClient should NOT be called on cache hit');
});

test('GET /accessories/:accessoryId/capabilities — 404 when not in pairings', async () => {
  const router = makeRouter({
    getAccessoryCapabilities: () => null,
    loadPairings: () => ({}),
  });
  const handler = getRouteHandler(router, 'GET', '/accessories/:accessoryId/capabilities');
  const { statusCode, jsonBody } = await invoke(handler, {
    params: { accessoryId: 'aa:bb:cc' },
  });

  assert.equal(statusCode, 404);
  assert.ok(jsonBody.error, 'Response should have error message');
});

test('GET /accessories/:accessoryId/capabilities — queries HttpClient on cache miss', async () => {
  let getAccessoriesCalled = false;
  let cacheMetadataCalled = false;
  let capabilityReturned = false;
  const router = makeRouter({
    getAccessoryCapabilities: () => {
      if (!capabilityReturned) {
        capabilityReturned = true;
        return null;
      }
      return { accessory_id: 'aa:bb:cc', services: [] };
    },
    loadPairings: () => ({
      'aa:bb:cc': {
        name: 'My Lamp',
        address: '192.168.1.1',
        port: 1234,
        longTermData: {},
        protocol: 'homekit',
      },
    }),
    cacheAccessoryMetadata: () => { cacheMetadataCalled = true; },
    HttpClient: class MockHttpClient {
      async getAccessories() {
        getAccessoriesCalled = true;
        return { accessories: [{ aid: 1, services: [] }] };
      }
    },
  });
  const handler = getRouteHandler(router, 'GET', '/accessories/:accessoryId/capabilities');
  const { statusCode } = await invoke(handler, {
    params: { accessoryId: 'aa:bb:cc' },
  });

  assert.equal(statusCode, 200);
  assert.ok(getAccessoriesCalled, 'HttpClient.getAccessories() should be called on cache miss');
  assert.ok(cacheMetadataCalled, 'cacheAccessoryMetadata() should be called after fetching');
});

// -- GET /accessories/:accessoryId/characteristics/:characteristic/trend --

test('GET /accessories/:accessoryId/characteristics/:characteristic/trend — returns points', async () => {
  const router = makeRouter({
    pool: {
      async query() {
        return {
          rows: [
            { timestamp: '2026-04-01T10:00:00Z', new_value: 'true' },
            { timestamp: '2026-04-01T11:00:00Z', new_value: 'false' },
          ],
        };
      },
    },
  });
  const handler = getRouteHandler(router, 'GET', '/accessories/:accessoryId/characteristics/:characteristic/trend');
  const { statusCode, jsonBody } = await invoke(handler, {
    params: { accessoryId: 'aa:bb:cc', characteristic: 'On' },
  });

  assert.equal(statusCode, 200);
  assert.ok(Array.isArray(jsonBody.points), 'Response should have points array');
  assert.equal(jsonBody.points.length, 2);
});

test('GET /accessories/:accessoryId/characteristics/:characteristic/trend — missing params returns 400', async () => {
  const router = makeRouter();
  const handler = getRouteHandler(router, 'GET', '/accessories/:accessoryId/characteristics/:characteristic/trend');
  const { statusCode, jsonBody } = await invoke(handler, {
    params: { accessoryId: '', characteristic: '' },
  });

  assert.equal(statusCode, 400);
  assert.ok(jsonBody.error, 'Response should have error');
});

// -- GET /accessories/:accessoryId/heatmap --

test('GET /accessories/:accessoryId/heatmap — returns cells', async () => {
  const router = makeRouter({
    pool: {
      async query() {
        return {
          rows: [
            { dow: 1, hour: 10, count: 5 },
            { dow: 2, hour: 14, count: 3 },
          ],
        };
      },
    },
  });
  const handler = getRouteHandler(router, 'GET', '/accessories/:accessoryId/heatmap');
  const { statusCode, jsonBody } = await invoke(handler, {
    params: { accessoryId: 'aa:bb:cc' },
  });

  assert.equal(statusCode, 200);
  assert.ok(Array.isArray(jsonBody.cells), 'Response should have cells array');
  assert.equal(jsonBody.cells.length, 2);
  assert.equal(jsonBody.cells[0].dow, 1);
});

test('GET /accessories/:accessoryId/heatmap — DB error returns 500', async () => {
  const router = makeRouter({
    pool: {
      async query() {
        throw new Error('DB down');
      },
    },
  });
  const handler = getRouteHandler(router, 'GET', '/accessories/:accessoryId/heatmap');
  const { statusCode, jsonBody } = await invoke(handler, {
    params: { accessoryId: 'aa:bb:cc' },
  });

  assert.equal(statusCode, 500);
  assert.equal(jsonBody.error, 'Internal server error');
});

// -- GET /accessories/:accessoryId/state-duration --

test('GET /accessories/:accessoryId/state-duration — returns durations', async () => {
  const router = makeRouter({
    pool: {
      async query() {
        return {
          rows: [
            { characteristic: 'On', new_value: 'true', duration_seconds: 3600 },
            { characteristic: 'On', new_value: 'false', duration_seconds: 1800 },
          ],
        };
      },
    },
  });
  const handler = getRouteHandler(router, 'GET', '/accessories/:accessoryId/state-duration');
  const { statusCode, jsonBody } = await invoke(handler, {
    params: { accessoryId: 'aa:bb:cc' },
  });

  assert.equal(statusCode, 200);
  assert.ok(Array.isArray(jsonBody.durations), 'Response should have durations array');
  assert.equal(jsonBody.durations.length, 2);
  assert.equal(jsonBody.durations[0].characteristic, 'On');
});

// -- GET /accessories/:accessoryId/char-summary --

test('GET /accessories/:accessoryId/char-summary — returns characteristics', async () => {
  const router = makeRouter({
    pool: {
      async query() {
        return {
          rows: [
            { characteristic: 'On', change_count: 100, min_val: null, max_val: null, avg_val: null, numeric_count: 0, distinct_values: 2 },
            { characteristic: 'Brightness', change_count: 50, min_val: 0, max_val: 100, avg_val: 65.5, numeric_count: 50, distinct_values: 20 },
          ],
        };
      },
    },
  });
  const handler = getRouteHandler(router, 'GET', '/accessories/:accessoryId/char-summary');
  const { statusCode, jsonBody } = await invoke(handler, {
    params: { accessoryId: 'aa:bb:cc' },
    query: { days: '30' },
  });

  assert.equal(statusCode, 200);
  assert.ok(Array.isArray(jsonBody.characteristics), 'Response should have characteristics array');
  assert.equal(jsonBody.characteristics.length, 2);
  assert.equal(jsonBody.characteristics[0].characteristic, 'On');
});

test('GET /accessories/:accessoryId/char-summary — DB error returns 500', async () => {
  const router = makeRouter({
    pool: {
      async query() {
        throw new Error('DB down');
      },
    },
  });
  const handler = getRouteHandler(router, 'GET', '/accessories/:accessoryId/char-summary');
  const { statusCode, jsonBody } = await invoke(handler, {
    params: { accessoryId: 'aa:bb:cc' },
  });

  assert.equal(statusCode, 500);
  assert.equal(jsonBody.error, 'Internal server error');
});

// -- GET /accessories bridge children via discovered source --

test('GET /accessories — includes bridge children from discovered source', async () => {
  const bridgeId = 'aa:bb:cc:dd:ee:ff';
  // Child :4 has events (in dbRows); children :2 and :3 are only in discovered cache
  let queryCallCount = 0;
  const router = makeRouter({
    pool: {
      async query() {
        queryCallCount++;
        if (queryCallCount === 1) {
          return {
            rows: [{
              accessory_id: `${bridgeId}:4`,
              accessory_name: 'Child 4',
              room_name: null,
              service_type: 'Switch',
              protocol: 'homekit',
              last_seen: new Date().toISOString(),
              event_count: 7,
            }],
          };
        }
        return { rows: [] };
      },
    },
    loadPairings: () => ({
      [bridgeId]: { name: 'My Bridge', category: 2, address: '192.168.1.10', port: 51826, longTermData: {}, protocol: 'homekit' },
    }),
    getAllDiscoveredAccessories: () => [
      { accessory_id: `${bridgeId}:2`, parent_device_id: bridgeId, accessory_name: 'Child 2', services: [], watched_service_types: [] },
      { accessory_id: `${bridgeId}:3`, parent_device_id: bridgeId, accessory_name: 'Child 3', services: [], watched_service_types: [] },
    ],
  });
  const handler = getRouteHandler(router, 'GET', '/accessories');
  const { statusCode, jsonBody } = await invoke(handler);

  assert.equal(statusCode, 200);
  assert.ok(Array.isArray(jsonBody), 'Response should be an array');
  // 1 dbRow (:4) + 1 neverSeen (bridge) + 2 discovered (:2, :3)
  assert.equal(jsonBody.length, 4, `Expected 4 accessories, got ${jsonBody.length}: ${jsonBody.map((r) => r.accessory_id).join(', ')}`);

  const ids = jsonBody.map((r) => r.accessory_id);
  assert.ok(ids.includes(`${bridgeId}:2`), 'Child :2 should appear from discovered');
  assert.ok(ids.includes(`${bridgeId}:3`), 'Child :3 should appear from discovered');
  assert.ok(ids.includes(`${bridgeId}:4`), 'Child :4 should appear from dbRows');
  assert.ok(ids.includes(bridgeId), 'Bridge should appear in neverSeen');

  const child2 = jsonBody.find((r) => r.accessory_id === `${bridgeId}:2`);
  assert.equal(child2.event_count, 0, 'Discovered children should have event_count: 0');
  assert.equal(child2.last_seen, null, 'Discovered children should have last_seen: null');
});

test('GET /accessories — deduplicates discovered children already in dbRows', async () => {
  const bridgeId = 'aa:bb:cc:dd:ee:ff';
  let queryCallCount = 0;
  const router = makeRouter({
    pool: {
      async query() {
        queryCallCount++;
        if (queryCallCount === 1) {
          return {
            rows: [{
              accessory_id: `${bridgeId}:2`,
              accessory_name: 'Child 2',
              room_name: null,
              service_type: 'Switch',
              protocol: 'homekit',
              last_seen: new Date().toISOString(),
              event_count: 5,
            }],
          };
        }
        return { rows: [] };
      },
    },
    loadPairings: () => ({
      [bridgeId]: { name: 'My Bridge', category: 2, address: '192.168.1.10', port: 51826, longTermData: {}, protocol: 'homekit' },
    }),
    // Child :2 is both in dbRows AND in discovered
    getAllDiscoveredAccessories: () => [
      { accessory_id: `${bridgeId}:2`, parent_device_id: bridgeId, accessory_name: 'Child 2', services: [], watched_service_types: [] },
    ],
  });
  const handler = getRouteHandler(router, 'GET', '/accessories');
  const { statusCode, jsonBody } = await invoke(handler);

  assert.equal(statusCode, 200);
  const ids = jsonBody.map((r) => r.accessory_id);
  const child2Instances = ids.filter((id) => id === `${bridgeId}:2`);
  assert.equal(child2Instances.length, 1, 'Child :2 should appear only once (deduplication from dbRows takes precedence)');

  const child2 = jsonBody.find((r) => r.accessory_id === `${bridgeId}:2`);
  assert.equal(child2.event_count, 5, 'dbRow version should have event_count from DB');
});

test('GET /accessories — on-demand metadata fetch for bridges with no cached children', async () => {
  const bridgeId = 'aa:bb:cc:dd:ee:ff';
  const cachedChildren = [];
  let getAccessoriesCalled = false;
  let cacheMetadataCalled = false;

  const router = makeRouter({
    pool: {
      async query() { return { rows: [] }; },
    },
    loadPairings: () => ({
      [bridgeId]: { name: 'My Bridge', category: 2, address: '192.168.1.10', port: 51826, longTermData: {}, protocol: 'homekit' },
    }),
    // Initially empty; after on-demand fetch it returns children
    getAllDiscoveredAccessories: () => [...cachedChildren],
    cacheAccessoryMetadata: ({ deviceId }) => {
      cacheMetadataCalled = true;
      // Simulate the cache being populated
      cachedChildren.push(
        { accessory_id: `${deviceId}:2`, parent_device_id: deviceId, accessory_name: 'Child A', services: [], watched_service_types: [] },
        { accessory_id: `${deviceId}:3`, parent_device_id: deviceId, accessory_name: 'Child B', services: [], watched_service_types: [] },
        { accessory_id: `${deviceId}:4`, parent_device_id: deviceId, accessory_name: 'Child C', services: [], watched_service_types: [] },
      );
    },
    HttpClient: class MockHttpClient {
      constructor(id) { this._id = id; }
      async getAccessories() {
        getAccessoriesCalled = true;
        return {
          accessories: [
            { aid: 1, services: [] },
            { aid: 2, services: [] },
            { aid: 3, services: [] },
            { aid: 4, services: [] },
          ],
        };
      }
    },
  });
  const handler = getRouteHandler(router, 'GET', '/accessories');
  const { statusCode, jsonBody } = await invoke(handler);

  assert.equal(statusCode, 200);
  assert.ok(getAccessoriesCalled, 'HttpClient.getAccessories() should be called for bridge with no cached children');
  assert.ok(cacheMetadataCalled, 'cacheAccessoryMetadata() should be called to populate the cache');

  const ids = jsonBody.map((r) => r.accessory_id);
  assert.ok(ids.includes(`${bridgeId}:2`), 'On-demand fetched child :2 should appear in response');
  assert.ok(ids.includes(`${bridgeId}:3`), 'On-demand fetched child :3 should appear in response');
  assert.ok(ids.includes(`${bridgeId}:4`), 'On-demand fetched child :4 should appear in response');
});
