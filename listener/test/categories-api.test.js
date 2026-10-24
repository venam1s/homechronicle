import test from 'node:test';
import assert from 'node:assert/strict';
import { createStatsRouter } from '../src/stats-router.js';
import { createSetupRouter } from '../src/setup-router.js';
import { createAccessoriesRouter } from '../src/accessories-router.js';
import { createArchiveRouter } from '../src/archive-router.js';
import { createMatterRouter } from '../src/matter-router.js';

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
  const res = {
    status(code) { statusCode = code; return this; },
    json(payload) { jsonBody = payload; return this; },
  };
  await handler({ query, params, body }, res);
  return { statusCode, jsonBody };
}

const passthroughCache = async (_key, fn) => fn();

// -- GET /stats/categories --

const CATEGORY_ROWS = [
  // A Matter light: OnOff + LevelControl -> lighting, counted once.
  { accessory_id: 'm1:1', accessory_name: 'Desk Lamp', service_type: 'OnOff', current: 4, previous: 1 },
  { accessory_id: 'm1:1', accessory_name: 'Desk Lamp', service_type: 'LevelControl', current: 6, previous: 1 },
  // A motion sensor whose battery events must not make it Other.
  { accessory_id: 'h1', accessory_name: 'Hall Motion', service_type: 'MotionSensor', current: 20, previous: 30 },
  { accessory_id: 'h1', accessory_name: 'Hall Motion', service_type: 'Battery', current: 2, previous: 0 },
  // A switch the user marked as the robot vacuum.
  { accessory_id: 'h2', accessory_name: 'Roomba', service_type: 'Switch', current: 3, previous: 0 },
  // Only active in the previous period.
  { accessory_id: 'h3', accessory_name: 'Porch Light', service_type: 'Lightbulb', current: 0, previous: 5 },
];

function statsRouter({ rows = CATEGORY_ROWS, overrides = {} } = {}) {
  const seen = [];
  const router = createStatsRouter({
    pool: { async query(sql, params) { seen.push({ sql, params }); return { rows }; } },
    cached: passthroughCache,
    getRooms: () => ({}),
    getRetentionSettings: () => ({}),
    getCategoryOverrides: () => overrides,
  });
  return { router, seen };
}

test('GET /stats/categories resolves each device once and aggregates by category', async () => {
  const { router, seen } = statsRouter({ overrides: { h2: 'cleaning' } });
  const { statusCode, jsonBody } = await invoke(getRouteHandler(router, 'GET', '/stats/categories'), { query: { days: '7' } });

  assert.equal(statusCode, 200);
  assert.equal(jsonBody.days, 7);
  assert.deepEqual(seen[0].params, [7]);
  const byId = Object.fromEntries(jsonBody.categories.map((c) => [c.id, c]));
  assert.deepEqual(Object.keys(byId).sort(), ['cleaning', 'lighting', 'security']);

  assert.equal(byId.security.events, 22);
  assert.equal(byId.security.previousEvents, 30);
  assert.equal(byId.security.devices, 1);
  assert.deepEqual(byId.security.topDevices, [{ accessoryId: 'h1', name: 'Hall Motion', events: 22 }]);

  assert.equal(byId.lighting.events, 10);
  assert.equal(byId.lighting.previousEvents, 7);
  assert.equal(byId.lighting.devices, 2, 'the porch light counts as a device even when quiet now');
  assert.deepEqual(byId.lighting.topDevices.map((d) => d.accessoryId), ['m1:1'], 'devices with no current events are not top devices');

  assert.equal(byId.cleaning.label, 'Cleaning');
  assert.equal(byId.cleaning.events, 3);

  assert.deepEqual(jsonBody.categories.map((c) => c.id), ['security', 'lighting', 'cleaning'], 'sorted by events');
});

test('GET /stats/categories clamps days and returns an empty list with no events', async () => {
  const { router, seen } = statsRouter({ rows: [] });
  const { jsonBody } = await invoke(getRouteHandler(router, 'GET', '/stats/categories'), { query: { days: '9999' } });
  assert.deepEqual(seen[0].params, [90]);
  assert.deepEqual(jsonBody.categories, []);
});

// -- PATCH /setup/category, GET /setup/categories --

function setupRouter(store) {
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
    loadCategories: () => ({ ...store.value }),
    saveCategories: async (next) => { store.value = next; },
    discoverDeviceForRepair: async () => null,
    savePairingForRepair: async () => {},
    startSubscribers: () => {},
    stopSubscriber: () => {},
    resetSubscriberStats: () => {},
    getPairingForLookup: () => null,
    HttpClient: class {},
  });
}

test('PATCH /setup/category sets, replaces and clears an override', async () => {
  const store = { value: {} };
  const patch = getRouteHandler(setupRouter(store), 'PATCH', '/category');

  assert.equal((await invoke(patch, { body: { accessoryId: 'h2', category: 'cleaning' } })).statusCode, 200);
  assert.deepEqual(store.value, { h2: 'cleaning' });
  await invoke(patch, { body: { accessoryId: 'h2', category: 'power' } });
  assert.deepEqual(store.value, { h2: 'power' });
  await invoke(patch, { body: { accessoryId: 'h2', category: '' } });
  assert.deepEqual(store.value, {});
});

test('PATCH /setup/category rejects an unknown category or missing accessory', async () => {
  const store = { value: {} };
  const patch = getRouteHandler(setupRouter(store), 'PATCH', '/category');
  const bad = await invoke(patch, { body: { accessoryId: 'h2', category: 'kitchen' } });
  assert.equal(bad.statusCode, 400);
  assert.match(bad.jsonBody.error, /security, safety/);
  assert.equal((await invoke(patch, { body: { category: 'security' } })).statusCode, 400);
  assert.deepEqual(store.value, {});
});

test('GET /setup/categories lists the categories and current overrides', async () => {
  const store = { value: { h2: 'cleaning' } };
  const { jsonBody } = await invoke(getRouteHandler(setupRouter(store), 'GET', '/categories'));
  assert.deepEqual(jsonBody.overrides, { h2: 'cleaning' });
  assert.equal(jsonBody.categories[0].id, 'security');
  assert.ok(jsonBody.categories.some((c) => c.id === 'other'));
});

// -- GET /accessories/:id/detail --

test('GET /accessories/:id/detail resolves the category from all recent service types, not the latest event', async () => {
  for (const [overrides, expected] of [
    [{}, { category: 'security', category_auto: 'security', category_override: null }],
    [{ h1: 'safety' }, { category: 'safety', category_auto: 'security', category_override: 'safety' }],
  ]) {
    const router = createAccessoriesRouter({
      pool: {
        async query(sql) {
          if (sql.includes('SELECT DISTINCT service_type')) return { rows: [{ service_type: 'MotionSensor' }, { service_type: 'Battery' }] };
          if (sql.includes('COUNT(*)::int AS event_count')) return { rows: [{ event_count: 5, first_seen: null, last_seen: null }] };
          if (sql.includes('SELECT accessory_name, room_name, service_type, protocol')) {
            return { rows: [{ accessory_name: 'Hall Motion', room_name: null, service_type: 'Battery', protocol: 'homekit' }] };
          }
          return { rows: [] };
        },
      },
      loadPairings: () => ({}),
      loadRooms: () => ({}),
      getRetentionSettings: () => ({ staleThresholdHours: 12 }),
      getCategoryOverrides: () => overrides,
      getSubscriberStats: () => null,
      getAccessoryCapabilities: () => null,
      getAccessoryIdentity: () => null,
      getAllDiscoveredAccessories: () => [],
      cacheAccessoryMetadata: () => {},
      HttpClient: class {},
    });
    const { statusCode, jsonBody } = await invoke(
      getRouteHandler(router, 'GET', '/accessories/:accessoryId/detail'),
      { params: { accessoryId: 'h1' } },
    );
    assert.equal(statusCode, 200);
    const { category, category_auto, category_override } = jsonBody.accessory;
    assert.deepEqual({ category, category_auto, category_override }, expected);
  }
});

// -- Cleanup alongside rooms --

test('deleting an accessory\'s data also drops its category override', async () => {
  const store = { value: { h1: 'safety', h2: 'cleaning' } };
  const router = createArchiveRouter({
    pool: { async query() { return { rowCount: 3 }; } },
    loadRooms: () => ({}), saveRooms: async () => {},
    loadDisplayNames: () => ({}), saveDisplayNames: async () => {},
    loadNotes: () => ({}), saveNotes: async () => {},
    loadCategories: () => ({ ...store.value }),
    saveCategories: async (next) => { store.value = next; },
  });
  await invoke(getRouteHandler(router, 'DELETE', '/data/accessory'), { body: { accessoryId: 'h1' } });
  assert.deepEqual(store.value, { h2: 'cleaning' });
  await invoke(getRouteHandler(router, 'DELETE', '/data/all'), { body: { confirm: 'DELETE ALL' } });
  assert.deepEqual(store.value, {});
});

test('removing a Matter pairing drops the overrides of the node and its endpoints', async () => {
  const store = { value: { '1234': 'power', '1234:2': 'lighting', '12345:1': 'climate' } };
  const pairings = { '1234': { protocol: 'matter', name: 'Strip' } };
  const router = createMatterRouter({
    insertEvent: async () => {},
    loadPairings: () => ({ ...pairings }),
    savePairings: async () => {},
    loadRooms: () => ({}), saveRooms: async () => {},
    loadNotes: () => ({}), saveNotes: async () => {},
    loadCategories: () => ({ ...store.value }),
    saveCategories: async (next) => { store.value = next; },
  });
  const layer = router.stack.find((l) => l.route?.methods?.delete && String(l.route.path).includes('matter'));
  assert.ok(layer, 'Matter delete route exists');
  const params = { nodeId: '1234' };
  await invoke(layer.route.stack.at(-1).handle, { params, body: params });
  assert.deepEqual(store.value, { '12345:1': 'climate' });
});
