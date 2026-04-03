import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepairRouter } from '../src/repair-router.js';

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

function makeStore(initial = {}) {
  let data = { enabled: false, hour: 3, lastRunAt: null, lastRunResult: null, ...initial };
  return {
    getSettings: () => ({ ...data }),
    saveSettings: async (next) => { data = { ...next }; },
  };
}

// -- GET /repair returns current settings --

test('GET /repair — returns 200 with enabled, hour, lastRunAt, lastRunResult', async () => {
  const store = makeStore({ enabled: true, hour: 4, lastRunAt: '2026-04-01T03:00:00.000Z', lastRunResult: 'ok' });
  const router = createRepairRouter({ ...store, onSettingsChange: () => {} });
  const handler = getRouteHandler(router, 'GET', '/repair');
  const { statusCode, jsonBody } = await invoke(handler);

  assert.equal(statusCode, 200);
  assert.equal(jsonBody.enabled, true);
  assert.equal(jsonBody.hour, 4);
  assert.equal(jsonBody.lastRunAt, '2026-04-01T03:00:00.000Z');
  assert.equal(jsonBody.lastRunResult, 'ok');
});

// -- PATCH /repair — valid enabled --

test('PATCH /repair — { enabled: true } saves and returns updated settings', async () => {
  const store = makeStore();
  const router = createRepairRouter({ ...store, onSettingsChange: () => {} });
  const handler = getRouteHandler(router, 'PATCH', '/repair');
  const { statusCode, jsonBody } = await invoke(handler, { body: { enabled: true } });

  assert.equal(statusCode, 200);
  assert.equal(jsonBody.enabled, true);
  assert.equal(jsonBody.hour, 3);
});

// -- PATCH /repair — valid hour --

test('PATCH /repair — { hour: 14 } saves and returns updated settings', async () => {
  const store = makeStore();
  const router = createRepairRouter({ ...store, onSettingsChange: () => {} });
  const handler = getRouteHandler(router, 'PATCH', '/repair');
  const { statusCode, jsonBody } = await invoke(handler, { body: { hour: 14 } });

  assert.equal(statusCode, 200);
  assert.equal(jsonBody.hour, 14);
  assert.equal(jsonBody.enabled, false);
});

// -- PATCH /repair — both enabled and hour --

test('PATCH /repair — { enabled: true, hour: 5 } saves both fields', async () => {
  const store = makeStore();
  const router = createRepairRouter({ ...store, onSettingsChange: () => {} });
  const handler = getRouteHandler(router, 'PATCH', '/repair');
  const { statusCode, jsonBody } = await invoke(handler, { body: { enabled: true, hour: 5 } });

  assert.equal(statusCode, 200);
  assert.equal(jsonBody.enabled, true);
  assert.equal(jsonBody.hour, 5);
});

// -- PATCH /repair — invalid enabled --

test('PATCH /repair — { enabled: "yes" } returns 400', async () => {
  const store = makeStore();
  const router = createRepairRouter({ ...store, onSettingsChange: () => {} });
  const handler = getRouteHandler(router, 'PATCH', '/repair');
  const { statusCode, jsonBody } = await invoke(handler, { body: { enabled: 'yes' } });

  assert.equal(statusCode, 400);
  assert.ok(jsonBody.error, 'error field should be present');
});

// -- PATCH /repair — hour out of range (too high) --

test('PATCH /repair — { hour: 25 } returns 400', async () => {
  const store = makeStore();
  const router = createRepairRouter({ ...store, onSettingsChange: () => {} });
  const handler = getRouteHandler(router, 'PATCH', '/repair');
  const { statusCode, jsonBody } = await invoke(handler, { body: { hour: 25 } });

  assert.equal(statusCode, 400);
  assert.ok(jsonBody.error);
});

// -- PATCH /repair — hour out of range (negative) --

test('PATCH /repair — { hour: -1 } returns 400', async () => {
  const store = makeStore();
  const router = createRepairRouter({ ...store, onSettingsChange: () => {} });
  const handler = getRouteHandler(router, 'PATCH', '/repair');
  const { statusCode, jsonBody } = await invoke(handler, { body: { hour: -1 } });

  assert.equal(statusCode, 400);
  assert.ok(jsonBody.error);
});

// -- PATCH /repair — empty body returns 400 --

test('PATCH /repair — {} returns 400 (no supported settings)', async () => {
  const store = makeStore();
  const router = createRepairRouter({ ...store, onSettingsChange: () => {} });
  const handler = getRouteHandler(router, 'PATCH', '/repair');
  const { statusCode, jsonBody } = await invoke(handler, { body: {} });

  assert.equal(statusCode, 400);
  assert.equal(jsonBody.error, 'No supported settings provided.');
});

// -- PATCH /repair — calls onSettingsChange --

test('PATCH /repair — { enabled: true } calls onSettingsChange callback', async () => {
  const store = makeStore();
  let callbackArg = null;
  const onSettingsChange = (next) => { callbackArg = next; };
  const router = createRepairRouter({ ...store, onSettingsChange });
  const handler = getRouteHandler(router, 'PATCH', '/repair');
  await invoke(handler, { body: { enabled: true } });

  assert.ok(callbackArg !== null, 'onSettingsChange should have been called');
  assert.equal(callbackArg.enabled, true);
});

// -- Settings round-trip: PATCH to enable, GET returns enabled --

test('Settings round-trip — PATCH enable then GET returns enabled=true', async () => {
  const store = makeStore();
  const router = createRepairRouter({ ...store, onSettingsChange: () => {} });
  const patchHandler = getRouteHandler(router, 'PATCH', '/repair');
  const getHandler = getRouteHandler(router, 'GET', '/repair');

  await invoke(patchHandler, { body: { enabled: true } });
  const { statusCode, jsonBody } = await invoke(getHandler);

  assert.equal(statusCode, 200);
  assert.equal(jsonBody.enabled, true);
});
