import test from 'node:test';
import assert from 'node:assert/strict';
import { createStatsRouter } from '../src/stats-router.js';

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

// -- GET /stats/hourly --

test('GET /stats/hourly — returns rows', async () => {
  let queryCalled = false;
  const pool = {
    async query() {
      queryCalled = true;
      return { rows: [{ hour: 10, count: '5' }] };
    },
  };

  const router = createStatsRouter({
    pool,
    cached: (_key, fn) => fn(),
    getRooms: () => ({}),
    getRetentionSettings: () => ({}),
  });
  const handler = getRouteHandler(router, 'GET', '/stats/hourly');
  const { statusCode, jsonBody } = await invoke(handler);

  assert.equal(statusCode, 200);
  assert.ok(Array.isArray(jsonBody), 'Response should be an array');
  assert.equal(jsonBody.length, 1);
  assert.ok('hour' in jsonBody[0], 'Row should have hour');
  assert.ok('count' in jsonBody[0], 'Row should have count');
  assert.ok(queryCalled, 'pool.query should be called');
});

// -- GET /stats/daily --

test('GET /stats/daily — respects days param', async () => {
  let capturedParams = null;
  const pool = {
    async query(_sql, params) {
      capturedParams = params;
      return { rows: [] };
    },
  };

  const router = createStatsRouter({
    pool,
    cached: (_key, fn) => fn(),
    getRooms: () => ({}),
    getRetentionSettings: () => ({}),
  });
  const handler = getRouteHandler(router, 'GET', '/stats/daily');
  const { statusCode } = await invoke(handler, { query: { days: '14' } });

  assert.equal(statusCode, 200);
  assert.ok(Array.isArray(capturedParams), 'params should be an array');
  assert.ok(capturedParams.includes(14), 'parsed days=14 should be in query params');
});

// -- GET /stats/top-devices --

test('GET /stats/top-devices — applies room overrides', async () => {
  const pool = {
    async query() {
      return {
        rows: [{
          accessory_name: 'Lamp',
          event_count: 10,
          accessory_id: 'aa:bb:cc:dd:ee:ff',
          room_name: 'Original Room',
          service_type: 'Lightbulb',
        }],
      };
    },
  };

  const router = createStatsRouter({
    pool,
    cached: (_key, fn) => fn(),
    getRooms: () => ({ 'aa:bb:cc:dd:ee:ff': 'Kitchen' }),
    getRetentionSettings: () => ({}),
  });
  const handler = getRouteHandler(router, 'GET', '/stats/top-devices');
  const { statusCode, jsonBody } = await invoke(handler);

  assert.equal(statusCode, 200);
  assert.ok(Array.isArray(jsonBody), 'Response should be an array');
  assert.equal(jsonBody.length, 1);
  assert.equal(jsonBody[0].room_name, 'Kitchen', 'room_name should be overridden from getRooms()');
});

// -- GET /stats/quiet-hours -- disabled

test('GET /stats/quiet-hours — disabled returns early without querying DB', async () => {
  let queryCalled = false;
  const pool = {
    async query() {
      queryCalled = true;
      return { rows: [] };
    },
  };

  const router = createStatsRouter({
    pool,
    cached: (_key, fn) => fn(),
    getRooms: () => ({}),
    getRetentionSettings: () => ({ quietHoursEnabled: false }),
  });
  const handler = getRouteHandler(router, 'GET', '/stats/quiet-hours');
  const { statusCode, jsonBody } = await invoke(handler);

  assert.equal(statusCode, 200);
  assert.equal(jsonBody.enabled, false, 'enabled should be false');
  assert.equal(queryCalled, false, 'pool.query should NOT be called when disabled');
});

// -- GET /stats/quiet-hours -- enabled (RTR-09: getter called per-request)

test('GET /stats/quiet-hours — enabled queries DB and returns events', async () => {
  const pool = {
    async query() {
      return {
        rows: [{
          accessory_id: 'a1',
          accessory_name: 'Lamp',
          room_name: 'Bed',
          count: 3,
          last_seen_at: '2026-01-01T23:00:00Z',
        }],
      };
    },
  };

  const router = createStatsRouter({
    pool,
    cached: (_key, fn) => fn(),
    getRooms: () => ({}),
    getRetentionSettings: () => ({
      quietHoursEnabled: true,
      quietHoursStart: 22,
      quietHoursEnd: 7,
      quietHoursExcludedAccessories: [],
    }),
  });
  const handler = getRouteHandler(router, 'GET', '/stats/quiet-hours');
  const { statusCode, jsonBody } = await invoke(handler);

  assert.equal(statusCode, 200);
  assert.equal(jsonBody.enabled, true, 'enabled should be true');
  assert.ok(Array.isArray(jsonBody.events), 'events should be an array');
  assert.equal(jsonBody.events.length, 1);
  assert.equal(jsonBody.events[0].accessoryId, 'a1', 'accessoryId should be mapped from accessory_id');
});

// -- GET /stats/anomalies --

test('GET /stats/anomalies — returns outlier structure', async () => {
  let callCount = 0;
  const pool = {
    async query() {
      callCount++;
      if (callCount === 1) {
        return {
          rows: [{
            scope_name: 'Lamp',
            hour: 10,
            baseline_avg: 2,
            baseline_std: 1,
            baseline_days: 7,
            event_count: 10,
          }],
        };
      }
      return { rows: [] };
    },
  };

  const router = createStatsRouter({
    pool,
    cached: (_key, fn) => fn(),
    getRooms: () => ({}),
    getRetentionSettings: () => ({}),
  });
  const handler = getRouteHandler(router, 'GET', '/stats/anomalies');
  const { statusCode, jsonBody } = await invoke(handler);

  assert.equal(statusCode, 200);
  assert.ok(typeof jsonBody.generatedAt === 'string', 'generatedAt should be a string');
  assert.ok(Array.isArray(jsonBody.devices), 'devices should be an array');
  assert.ok(Array.isArray(jsonBody.rooms), 'rooms should be an array');
});

// -- DB error returns 500 --

test('GET /stats/hourly — DB error returns 500', async () => {
  const pool = {
    async query() {
      throw new Error('DB down');
    },
  };

  const router = createStatsRouter({
    pool,
    cached: (_key, fn) => fn(),
    getRooms: () => ({}),
    getRetentionSettings: () => ({}),
  });
  const handler = getRouteHandler(router, 'GET', '/stats/hourly');
  const { statusCode, jsonBody } = await invoke(handler);

  assert.equal(statusCode, 500);
  assert.equal(jsonBody.error, 'Internal server error');
});
