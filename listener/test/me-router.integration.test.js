/**
 * me-router.integration.test.js — Fake-pool integration tests for me-router.
 *
 * Wave-0 RED stubs: 401-no-session and 400-non-object pass NOW (guards exist in skeleton).
 * Pool-dependent cases (GET no-row, PUT replace, 500-on-throw, oversize) are RED until 24-02
 * implements the full pool queries. Do NOT weaken assertions to make them pass early.
 *
 * Mirrors the idiom from alerts-router.integration.test.js.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createMeRouter } from '../src/me-router.js';

// -- Test helpers --

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
    status(code) { statusCode = code; return this; },
    json(payload) { jsonBody = payload; return this; },
  };
  await handler(req, res);
  return { statusCode, jsonBody };
}

function createMockPool({ rowsForGet = [], rowsForPut = null } = {}) {
  return {
    async query(sql, params = []) {
      if (sql.includes('SELECT prefs FROM user_preferences')) {
        return { rows: rowsForGet };
      }
      if (sql.includes('INSERT INTO user_preferences') || sql.includes('ON CONFLICT')) {
        const prefs = rowsForPut !== null ? rowsForPut : (params[1] ? JSON.parse(params[1]) : {});
        return { rows: [{ prefs }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
}

const errorPool = {
  async query(sql) {
    if (sql.includes('user_preferences')) {
      throw new Error('connection terminated');
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  },
};

// -- Route registration --

test('createMeRouter exports createMeRouter function', () => {
  assert.strictEqual(typeof createMeRouter, 'function');
});

test('createMeRouter registers GET /preferences route', () => {
  const router = createMeRouter({ pool: createMockPool() });
  const handler = getRouteHandler(router, 'GET', '/preferences');
  assert.strictEqual(typeof handler, 'function');
});

test('createMeRouter registers PUT /preferences route', () => {
  const router = createMeRouter({ pool: createMockPool() });
  const handler = getRouteHandler(router, 'PUT', '/preferences');
  assert.strictEqual(typeof handler, 'function');
});

// -- 401 when no session (GREEN now — guard in skeleton) --

test('GET /preferences returns 401 when req.hcSession is undefined', async () => {
  const router = createMeRouter({ pool: createMockPool() });
  const get = getRouteHandler(router, 'GET', '/preferences');

  const { statusCode, jsonBody } = await invoke(get, { hcSession: undefined });
  assert.strictEqual(statusCode, 401);
  assert.strictEqual(jsonBody.error, 'Unauthorized');
});

test('GET /preferences returns 401 when req.hcSession has no user_id', async () => {
  const router = createMeRouter({ pool: createMockPool() });
  const get = getRouteHandler(router, 'GET', '/preferences');

  const { statusCode, jsonBody } = await invoke(get, { hcSession: {} });
  assert.strictEqual(statusCode, 401);
  assert.strictEqual(jsonBody.error, 'Unauthorized');
});

test('PUT /preferences returns 401 when req.hcSession is undefined', async () => {
  const router = createMeRouter({ pool: createMockPool() });
  const put = getRouteHandler(router, 'PUT', '/preferences');

  const { statusCode, jsonBody } = await invoke(put, {
    body: { prefs: { theme: 'dark' } },
    hcSession: undefined,
  });
  assert.strictEqual(statusCode, 401);
  assert.strictEqual(jsonBody.error, 'Unauthorized');
});

// -- 400 non-object (GREEN now — validation guard in skeleton) --

test('PUT /preferences returns 400 when prefs is an array', async () => {
  const router = createMeRouter({ pool: createMockPool() });
  const put = getRouteHandler(router, 'PUT', '/preferences');

  const { statusCode, jsonBody } = await invoke(put, {
    body: { prefs: ['a', 'b'] },
    hcSession: { user_id: 42 },
  });
  assert.strictEqual(statusCode, 400);
  assert.ok(jsonBody.error.includes('prefs'), `expected error mentioning 'prefs', got: ${jsonBody.error}`);
});

test('PUT /preferences returns 400 when prefs is a string', async () => {
  const router = createMeRouter({ pool: createMockPool() });
  const put = getRouteHandler(router, 'PUT', '/preferences');

  const { statusCode, jsonBody } = await invoke(put, {
    body: { prefs: 'not-an-object' },
    hcSession: { user_id: 42 },
  });
  assert.strictEqual(statusCode, 400);
  assert.ok(jsonBody.error.includes('prefs'), `expected error mentioning 'prefs', got: ${jsonBody.error}`);
});

test('PUT /preferences returns 400 when prefs is null', async () => {
  const router = createMeRouter({ pool: createMockPool() });
  const put = getRouteHandler(router, 'PUT', '/preferences');

  const { statusCode, jsonBody } = await invoke(put, {
    body: { prefs: null },
    hcSession: { user_id: 42 },
  });
  assert.strictEqual(statusCode, 400);
  assert.ok(jsonBody.error.includes('prefs'), `expected error mentioning 'prefs', got: ${jsonBody.error}`);
});

test('PUT /preferences returns 400 when prefs is missing from body', async () => {
  const router = createMeRouter({ pool: createMockPool() });
  const put = getRouteHandler(router, 'PUT', '/preferences');

  const { statusCode, jsonBody } = await invoke(put, {
    body: {},
    hcSession: { user_id: 42 },
  });
  assert.strictEqual(statusCode, 400);
  assert.ok(jsonBody.error.includes('prefs'), `expected error mentioning 'prefs', got: ${jsonBody.error}`);
});

// -- Pool-dependent cases (RED until 24-02 implements pool queries) --

test('GET /preferences returns { prefs: {} } when no row exists for user (RED until 24-02)', async () => {
  const router = createMeRouter({ pool: createMockPool({ rowsForGet: [] }) });
  const get = getRouteHandler(router, 'GET', '/preferences');

  const { statusCode, jsonBody } = await invoke(get, { hcSession: { user_id: 42 } });
  assert.strictEqual(statusCode, 200);
  assert.deepStrictEqual(jsonBody, { prefs: {} });
});

test('GET /preferences returns stored blob when row exists (RED until 24-02)', async () => {
  const storedPrefs = { theme: 'dark', dashboardGlobalDays: 14 };
  const router = createMeRouter({ pool: createMockPool({ rowsForGet: [{ prefs: storedPrefs }] }) });
  const get = getRouteHandler(router, 'GET', '/preferences');

  const { statusCode, jsonBody } = await invoke(get, { hcSession: { user_id: 42 } });
  assert.strictEqual(statusCode, 200);
  assert.deepStrictEqual(jsonBody, { prefs: storedPrefs });
});

test('PUT /preferences upserts and returns blob (RED until 24-02)', async () => {
  const newPrefs = { theme: 'light', accent: 'ocean' };
  const router = createMeRouter({ pool: createMockPool({ rowsForPut: newPrefs }) });
  const put = getRouteHandler(router, 'PUT', '/preferences');

  const { statusCode, jsonBody } = await invoke(put, {
    body: { prefs: newPrefs },
    hcSession: { user_id: 42 },
  });
  assert.strictEqual(statusCode, 200);
  assert.deepStrictEqual(jsonBody, { prefs: newPrefs });
});

test('PUT /preferences second call overwrites (last-writer-wins, D-05) (RED until 24-02)', async () => {
  const firstPrefs = { theme: 'dark' };
  const secondPrefs = { theme: 'light', accent: 'purple' };
  const router = createMeRouter({ pool: createMockPool({ rowsForPut: secondPrefs }) });
  const put = getRouteHandler(router, 'PUT', '/preferences');

  // First write
  await invoke(put, { body: { prefs: firstPrefs }, hcSession: { user_id: 42 } });
  // Second write should replace
  const { statusCode, jsonBody } = await invoke(put, {
    body: { prefs: secondPrefs },
    hcSession: { user_id: 42 },
  });
  assert.strictEqual(statusCode, 200);
  assert.deepStrictEqual(jsonBody, { prefs: secondPrefs });
});

test('PUT /preferences returns 400 when serialized prefs exceeds 256 KB (RED until 24-02)', async () => {
  // Build a prefs object just over the 256 KB cap.
  const bigValue = 'x'.repeat(256 * 1024 + 1);
  const router = createMeRouter({ pool: createMockPool() });
  const put = getRouteHandler(router, 'PUT', '/preferences');

  const { statusCode } = await invoke(put, {
    body: { prefs: { key: bigValue } },
    hcSession: { user_id: 42 },
  });
  assert.strictEqual(statusCode, 400);
});

test('GET /preferences returns 500 on pool throw (RED until 24-02)', async () => {
  const router = createMeRouter({ pool: errorPool });
  const get = getRouteHandler(router, 'GET', '/preferences');

  const { statusCode, jsonBody } = await invoke(get, { hcSession: { user_id: 42 } });
  assert.strictEqual(statusCode, 500);
  assert.strictEqual(jsonBody.error, 'Internal server error');
});

test('PUT /preferences returns 500 on pool throw (RED until 24-02)', async () => {
  const router = createMeRouter({ pool: errorPool });
  const put = getRouteHandler(router, 'PUT', '/preferences');

  const { statusCode, jsonBody } = await invoke(put, {
    body: { prefs: { theme: 'dark' } },
    hcSession: { user_id: 42 },
  });
  assert.strictEqual(statusCode, 500);
  assert.strictEqual(jsonBody.error, 'Internal server error');
});
