import test from 'node:test';
import assert from 'node:assert/strict';
import { createHealthRouter } from '../src/health-router.js';

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

// -- Healthy — all OK --

test('GET /health — healthy returns 200 with ok status', async () => {
  const pool = {
    async query() {
      return { rows: [{ '?column?': 1 }] };
    },
  };

  const router = createHealthRouter({
    pool,
    getSubscriberHealth: () => ({ total: 2, connected: 2, lastConnectedAt: null }),
    getMatterRuntime: () => null,
    loadPairings: () => ({ a1: {} }),
    alertsEnabled: () => true,
  });
  const handler = getRouteHandler(router, 'GET', '/health');
  const { statusCode, jsonBody } = await invoke(handler);

  assert.equal(statusCode, 200);
  assert.equal(jsonBody.status, 'ok');
  assert.equal(jsonBody.db, 'ok');
  assert.equal(jsonBody.paired, 1);
  assert.equal(jsonBody.alertsEnabled, true);
  assert.equal(jsonBody.matter, null);
});

// -- Unhealthy — DB down --

test('GET /health — DB down returns 503 with unhealthy status', async () => {
  const pool = {
    async query() {
      throw new Error('Connection refused');
    },
  };

  const router = createHealthRouter({
    pool,
    getSubscriberHealth: () => ({ total: 2, connected: 2, lastConnectedAt: null }),
    getMatterRuntime: () => null,
    loadPairings: () => ({}),
    alertsEnabled: () => false,
  });
  const handler = getRouteHandler(router, 'GET', '/health');
  const { statusCode, jsonBody } = await invoke(handler);

  assert.equal(statusCode, 503);
  assert.equal(jsonBody.status, 'unhealthy');
  assert.equal(jsonBody.db, 'unreachable');
});

// -- Matter runtime present --

test('GET /health — matter runtime present reports matter status', async () => {
  const pool = {
    async query() {
      return { rows: [{ '?column?': 1 }] };
    },
  };

  const router = createHealthRouter({
    pool,
    getSubscriberHealth: () => ({ total: 0, connected: 0, lastConnectedAt: null }),
    getMatterRuntime: () => ({
      getStatus: () => ({
        commissionConfigured: true,
        pollingConfigured: true,
        nodes: [{}],
      }),
    }),
    loadPairings: () => ({}),
    alertsEnabled: () => true,
  });
  const handler = getRouteHandler(router, 'GET', '/health');
  const { statusCode, jsonBody } = await invoke(handler);

  assert.equal(statusCode, 200);
  assert.ok(jsonBody.matter !== null, 'matter should not be null');
  assert.equal(jsonBody.matter.commissionConfigured, true);
  assert.equal(jsonBody.matter.activeNodes, 1);
});

// -- Grace period: recently disconnected is still healthy --

test('GET /health — recently disconnected subscriber is within grace period', async () => {
  const pool = {
    async query() {
      return { rows: [{ '?column?': 1 }] };
    },
  };

  const router = createHealthRouter({
    pool,
    getSubscriberHealth: () => ({
      total: 2,
      connected: 0,
      lastConnectedAt: new Date(Date.now() - 30_000).toISOString(), // 30s ago
    }),
    getMatterRuntime: () => null,
    loadPairings: () => ({}),
    alertsEnabled: () => false,
  });
  const handler = getRouteHandler(router, 'GET', '/health');
  const { statusCode, jsonBody } = await invoke(handler);

  assert.equal(statusCode, 200);
  assert.equal(jsonBody.status, 'ok', 'Should be healthy within 2-minute grace period');
});
