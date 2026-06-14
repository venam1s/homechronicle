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

async function invoke(handler, { query = {}, params = {}, body = {}, hcSession } = {}) {
  let statusCode = 200;
  let jsonBody = null;
  const req = { query, params, body, hcSession };
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

// -- GET /stats/sensor-environment --

test('GET /stats/sensor-environment — disambiguates Matter cluster_id and scales /100', async () => {
  const pool = {
    async query() {
      return {
        rows: [
          // Matter temperature (cluster 1026), centi-units -> 21.5
          {
            accessory_id: 'm1', accessory_name: 'Matter Sensor', room_name: 'Hall',
            protocol: 'matter', new_value: '2150', timestamp: '2026-06-01T10:00:00Z',
            metric: 'temperature',
          },
          // Matter humidity (cluster 1029), centi-units -> 45.0
          {
            accessory_id: 'm1', accessory_name: 'Matter Sensor', room_name: 'Hall',
            protocol: 'matter', new_value: '4500', timestamp: '2026-06-01T10:01:00Z',
            metric: 'humidity',
          },
          // HomeKit temperature, no scaling -> 20.5
          {
            accessory_id: 'h1', accessory_name: 'HK Thermo', room_name: 'Bed',
            protocol: 'homekit', new_value: '20.5', timestamp: '2026-06-01T09:00:00Z',
            metric: 'temperature',
          },
        ],
      };
    },
  };

  const router = createStatsRouter({
    pool,
    cached: (_key, fn) => fn(),
    getRooms: () => ({}),
    getRetentionSettings: () => ({}),
  });
  const handler = getRouteHandler(router, 'GET', '/stats/sensor-environment');
  const { statusCode, jsonBody } = await invoke(handler);

  assert.equal(statusCode, 200);
  assert.ok(Array.isArray(jsonBody));
  const matter = jsonBody.find((r) => r.accessoryId === 'm1');
  const homekit = jsonBody.find((r) => r.accessoryId === 'h1');
  assert.equal(matter.temperature, 21.5, 'Matter temp scaled /100');
  assert.equal(matter.humidity, 45.0, 'Matter humidity scaled /100');
  assert.equal(homekit.temperature, 20.5, 'HomeKit temp unscaled');
  assert.equal(homekit.humidity, null, 'no humidity reading -> null');
});

// -- GET /stats/battery-levels --

test('GET /stats/battery-levels — combines characteristics and sorts low/empty first', async () => {
  const pool = {
    async query() {
      return {
        rows: [
          { accessory_id: 'a', accessory_name: 'Lock A', room_name: 'Door', characteristic: 'BatteryLevel', new_value: '80', timestamp: '2026-06-01T10:00:00Z' },
          { accessory_id: 'b', accessory_name: 'Sensor B', room_name: 'Bed', characteristic: 'BatteryLevel', new_value: '15', timestamp: '2026-06-01T10:00:00Z' },
          { accessory_id: 'b', accessory_name: 'Sensor B', room_name: 'Bed', characteristic: 'StatusLowBattery', new_value: '1', timestamp: '2026-06-01T10:00:00Z' },
        ],
      };
    },
  };

  const router = createStatsRouter({
    pool,
    cached: (_key, fn) => fn(),
    getRooms: () => ({}),
    getRetentionSettings: () => ({}),
  });
  const handler = getRouteHandler(router, 'GET', '/stats/battery-levels');
  const { statusCode, jsonBody } = await invoke(handler);

  assert.equal(statusCode, 200);
  assert.equal(jsonBody.length, 2);
  assert.equal(jsonBody[0].accessoryId, 'b', 'low-battery device sorts first');
  assert.equal(jsonBody[0].lowBattery, true);
  assert.equal(jsonBody[0].batteryLevel, 15);
  assert.equal(jsonBody[1].accessoryId, 'a');
});

// -- GET /stats/retention-health --

test('GET /stats/retention-health — archive count error degrades to null without 500', async () => {
  const pool = {
    async query(sql) {
      if (String(sql).includes('event_logs_archive')) {
        throw new Error('archive table missing');
      }
      return {
        rows: [{
          total_rows: '100',
          oldest_event: '2026-01-01T00:00:00Z',
          newest_event: '2026-06-01T00:00:00Z',
          rows_30d: '300',
          events_past_retention: '5',
          db_size_bytes: '1000000',
          table_size_bytes: '500000',
        }],
      };
    },
  };

  const router = createStatsRouter({
    pool,
    cached: (_key, fn) => fn(),
    getRooms: () => ({}),
    getRetentionSettings: () => ({ retentionDays: 365 }),
  });
  const handler = getRouteHandler(router, 'GET', '/stats/retention-health');
  const { statusCode, jsonBody } = await invoke(handler);

  assert.equal(statusCode, 200, 'archive failure must not 500');
  assert.equal(jsonBody.archivedRows, null, 'archivedRows degrades to null');
  assert.equal(jsonBody.totalRows, 100);
  assert.equal(jsonBody.retentionDays, 365);
  assert.equal(jsonBody.avgEventsPerDay, 10, '300 rows over 30 days');
});

// -- GET /stats/quiet-hours — session-aware resolution (Phase 25) --

// Helper: builds a mock pool that returns prefs blobs for user_preferences SELECT
// and event rows for the quiet-hours aggregation query.
function makeQuietHoursPool({ prefsBlob = null, eventRows = [] } = {}) {
  return {
    async query(sql, _params) {
      if (String(sql).includes('user_preferences')) {
        const rows = prefsBlob !== null ? [{ prefs: prefsBlob }] : [];
        return { rows };
      }
      // quiet-hours aggregation or any other stats query
      return { rows: eventRows };
    },
  };
}

// (a) No session → resolves shared config (getRetentionSettings), not per-user blob.
// Uses shared config with quietHoursEnabled:false → returns { enabled:false }, pool never issues
// a user_preferences query.
test('GET /stats/quiet-hours — no session uses shared config (path a)', async () => {
  let prefsCalled = false;
  const pool = {
    async query(sql, _params) {
      if (String(sql).includes('user_preferences')) {
        prefsCalled = true;
        return { rows: [] };
      }
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
  // No hcSession — simulates API_TOKEN / AUTH_ENABLED=false path
  const { statusCode, jsonBody } = await invoke(handler);

  assert.equal(statusCode, 200);
  assert.equal(jsonBody.enabled, false, 'shared config (disabled) used when no session');
  assert.equal(prefsCalled, false, 'user_preferences must NOT be queried with no session');
});

// (b) Authed user whose blob has quietHoursEnabled:true → per-user values drive the response.
// Shared config uses start:22/end:7; blob uses start:1/end:5 → response must reflect 1/5.
test('GET /stats/quiet-hours — authed user with QH blob uses per-user values (path b)', async () => {
  const perUserBlob = {
    quietHoursEnabled: true,
    quietHoursStart: 1,
    quietHoursEnd: 5,
    quietHoursExcludedAccessories: [],
  };
  const pool = makeQuietHoursPool({
    prefsBlob: perUserBlob,
    eventRows: [{
      accessory_id: 'b1',
      accessory_name: 'Night Light',
      room_name: 'Bedroom',
      count: 2,
      last_seen_at: '2026-06-14T03:00:00Z',
    }],
  });

  const router = createStatsRouter({
    pool,
    cached: (_key, fn) => fn(),
    getRooms: () => ({}),
    // Shared config has DIFFERENT hours (22/7) so any bleed-through from shared fails the assertion
    getRetentionSettings: () => ({
      quietHoursEnabled: true,
      quietHoursStart: 22,
      quietHoursEnd: 7,
      quietHoursExcludedAccessories: [],
    }),
  });
  const handler = getRouteHandler(router, 'GET', '/stats/quiet-hours');
  const { statusCode, jsonBody } = await invoke(handler, { hcSession: { user_id: 99 } });

  assert.equal(statusCode, 200);
  assert.equal(jsonBody.enabled, true, 'per-user blob: enabled should be true');
  assert.equal(jsonBody.quietHoursStart, 1, 'per-user start hour should be 1, not shared 22');
  assert.equal(jsonBody.quietHoursEnd, 5, 'per-user end hour should be 5, not shared 7');
});

// (c) Authed user whose blob lacks the quietHoursEnabled key → whole-config fallback to shared.
// D-25-02: no partial merge — shared config must be used exclusively.
test('GET /stats/quiet-hours — authed user without QH key falls back to shared config (path c)', async () => {
  // Blob has unrelated keys but no quietHoursEnabled
  const prefsBlob = { theme: 'dark', accent: 'ocean' };
  const pool = makeQuietHoursPool({ prefsBlob, eventRows: [] });

  const router = createStatsRouter({
    pool,
    cached: (_key, fn) => fn(),
    getRooms: () => ({}),
    getRetentionSettings: () => ({ quietHoursEnabled: false }),
  });
  const handler = getRouteHandler(router, 'GET', '/stats/quiet-hours');
  const { statusCode, jsonBody } = await invoke(handler, { hcSession: { user_id: 7 } });

  assert.equal(statusCode, 200);
  assert.equal(jsonBody.enabled, false, 'no quietHoursEnabled key → whole-config fallback → disabled');
});

// (d) Malformed blob value: quietHoursEnabled present but quietHoursStart is a non-numeric string.
// normalizeRetentionSettings must coerce it; handler must NOT 500 (QH-03).
test('GET /stats/quiet-hours — malformed blob start value does not 500 (path d)', async () => {
  const malformedBlob = {
    quietHoursEnabled: true,
    quietHoursStart: 'abc',   // non-numeric — normalizeRetentionSettings coerces to default 23
    quietHoursEnd: 6,
    quietHoursExcludedAccessories: [],
  };
  const pool = makeQuietHoursPool({ prefsBlob: malformedBlob, eventRows: [] });

  const router = createStatsRouter({
    pool,
    cached: (_key, fn) => fn(),
    getRooms: () => ({}),
    getRetentionSettings: () => ({ quietHoursEnabled: false }),
  });
  const handler = getRouteHandler(router, 'GET', '/stats/quiet-hours');
  const { statusCode } = await invoke(handler, { hcSession: { user_id: 5 } });

  assert.notEqual(statusCode, 500, 'malformed blob must not produce a 500');
  assert.equal(statusCode, 200, 'handler should respond 200 with coerced defaults');
});

// -- GET /stats/characteristic-breakdown --

test('GET /stats/characteristic-breakdown — collapses tail into a single Other row', async () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({
    characteristic: `Char${i}`,
    count: 10 - i,
  }));
  const pool = {
    async query() {
      return { rows };
    },
  };

  const router = createStatsRouter({
    pool,
    cached: (_key, fn) => fn(),
    getRooms: () => ({}),
    getRetentionSettings: () => ({}),
  });
  const handler = getRouteHandler(router, 'GET', '/stats/characteristic-breakdown');
  const { statusCode, jsonBody } = await invoke(handler, { query: { days: '7' } });

  assert.equal(statusCode, 200);
  assert.equal(jsonBody.length, 9, 'top 8 + Other');
  assert.equal(jsonBody.at(-1).characteristic, 'Other');
  // Char8 (count 2) + Char9 (count 1) = 3
  assert.equal(jsonBody.at(-1).count, 3, 'Other sums the remainder');
});
