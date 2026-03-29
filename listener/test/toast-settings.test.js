import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRetentionRouter, normalizeRetentionSettings } from '../src/retention-router.js';

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

function defaultSettings() {
  return normalizeRetentionSettings({});
}

function createTestRouter(settingsOverride = {}) {
  let settings = { ...defaultSettings(), ...settingsOverride };
  return createRetentionRouter({
    getSettings: () => settings,
    saveSettings: async (next) => { settings = normalizeRetentionSettings(next); },
    sweepMs: 86400000,
  });
}

describe('normalizeRetentionSettings', () => {
  it('provides toast defaults when no input given', () => {
    const result = normalizeRetentionSettings({});
    assert.equal(result.toastsEnabled, true);
    assert.equal(result.liveEventToastsEnabled, false);
    assert.deepEqual(result.toastAccessories, []);
    assert.equal(result.toastPosition, 'bottom-right');
    assert.equal(result.toastDuration, 3);
    assert.equal(result.toastMaxVisible, 3);
  });

  it('preserves valid toast values', () => {
    const result = normalizeRetentionSettings({
      toastsEnabled: false,
      liveEventToastsEnabled: true,
      toastAccessories: ['acc-1', 'acc-2'],
      toastPosition: 'top-left',
      toastDuration: 7,
      toastMaxVisible: 5,
    });
    assert.equal(result.toastsEnabled, false);
    assert.equal(result.liveEventToastsEnabled, true);
    assert.deepEqual(result.toastAccessories, ['acc-1', 'acc-2']);
    assert.equal(result.toastPosition, 'top-left');
    assert.equal(result.toastDuration, 7);
    assert.equal(result.toastMaxVisible, 5);
  });

  it('falls back to defaults for invalid toast values', () => {
    const result = normalizeRetentionSettings({
      toastPosition: 'center',
      toastDuration: 99,
      toastMaxVisible: 10,
    });
    assert.equal(result.toastPosition, 'bottom-right');
    assert.equal(result.toastDuration, 3);
    assert.equal(result.toastMaxVisible, 3);
  });
});

describe('Retention router — toast settings', () => {
  it('GET /retention includes toast fields with defaults', async () => {
    const router = createTestRouter();
    const handler = getRouteHandler(router, 'get', '/retention');
    const { statusCode, jsonBody } = await invoke(handler);
    assert.equal(statusCode, 200);
    assert.equal(jsonBody.toastsEnabled, true);
    assert.equal(jsonBody.liveEventToastsEnabled, false);
    assert.deepEqual(jsonBody.toastAccessories, []);
    assert.equal(jsonBody.sweepMs, 86400000);
  });

  it('PATCH /retention accepts toastsEnabled boolean', async () => {
    const router = createTestRouter();
    const handler = getRouteHandler(router, 'patch', '/retention');
    const { statusCode, jsonBody } = await invoke(handler, {
      body: { toastsEnabled: false },
    });
    assert.equal(statusCode, 200);
    assert.equal(jsonBody.toastsEnabled, false);
  });

  it('PATCH /retention rejects non-boolean toastsEnabled', async () => {
    const router = createTestRouter();
    const handler = getRouteHandler(router, 'patch', '/retention');
    const { statusCode, jsonBody } = await invoke(handler, {
      body: { toastsEnabled: 'yes' },
    });
    assert.equal(statusCode, 400);
    assert.ok(jsonBody.error.includes('toastsEnabled'));
  });

  it('PATCH /retention accepts liveEventToastsEnabled boolean', async () => {
    const router = createTestRouter();
    const handler = getRouteHandler(router, 'patch', '/retention');
    const { statusCode, jsonBody } = await invoke(handler, {
      body: { liveEventToastsEnabled: true },
    });
    assert.equal(statusCode, 200);
    assert.equal(jsonBody.liveEventToastsEnabled, true);
  });

  it('PATCH /retention accepts toastAccessories array', async () => {
    const router = createTestRouter();
    const handler = getRouteHandler(router, 'patch', '/retention');
    const { statusCode, jsonBody } = await invoke(handler, {
      body: { toastAccessories: ['acc-1', 'acc-2'] },
    });
    assert.equal(statusCode, 200);
    assert.deepEqual(jsonBody.toastAccessories, ['acc-1', 'acc-2']);
  });

  it('PATCH /retention rejects non-array toastAccessories', async () => {
    const router = createTestRouter();
    const handler = getRouteHandler(router, 'patch', '/retention');
    const { statusCode, jsonBody } = await invoke(handler, {
      body: { toastAccessories: 'not-array' },
    });
    assert.equal(statusCode, 400);
    assert.ok(jsonBody.error.includes('toastAccessories'));
  });

  it('PATCH /retention accepts valid toastPosition', async () => {
    const router = createTestRouter();
    const handler = getRouteHandler(router, 'patch', '/retention');
    const { statusCode, jsonBody } = await invoke(handler, {
      body: { toastPosition: 'top-right' },
    });
    assert.equal(statusCode, 200);
    assert.equal(jsonBody.toastPosition, 'top-right');
  });

  it('PATCH /retention rejects invalid toastPosition', async () => {
    const router = createTestRouter();
    const handler = getRouteHandler(router, 'patch', '/retention');
    const { statusCode } = await invoke(handler, {
      body: { toastPosition: 'center' },
    });
    assert.equal(statusCode, 400);
  });

  it('PATCH /retention accepts valid toastDuration', async () => {
    const router = createTestRouter();
    const handler = getRouteHandler(router, 'patch', '/retention');
    const { statusCode, jsonBody } = await invoke(handler, {
      body: { toastDuration: 5 },
    });
    assert.equal(statusCode, 200);
    assert.equal(jsonBody.toastDuration, 5);
  });

  it('PATCH /retention rejects invalid toastDuration', async () => {
    const router = createTestRouter();
    const handler = getRouteHandler(router, 'patch', '/retention');
    const { statusCode } = await invoke(handler, {
      body: { toastDuration: 99 },
    });
    assert.equal(statusCode, 400);
  });

  it('PATCH /retention accepts valid toastMaxVisible', async () => {
    const router = createTestRouter();
    const handler = getRouteHandler(router, 'patch', '/retention');
    const { statusCode, jsonBody } = await invoke(handler, {
      body: { toastMaxVisible: 5 },
    });
    assert.equal(statusCode, 200);
    assert.equal(jsonBody.toastMaxVisible, 5);
  });

  it('PATCH /retention rejects invalid toastMaxVisible', async () => {
    const router = createTestRouter();
    const handler = getRouteHandler(router, 'patch', '/retention');
    const { statusCode } = await invoke(handler, {
      body: { toastMaxVisible: 10 },
    });
    assert.equal(statusCode, 400);
  });

  it('PATCH /retention rejects empty body', async () => {
    const router = createTestRouter();
    const handler = getRouteHandler(router, 'patch', '/retention');
    const { statusCode } = await invoke(handler, { body: {} });
    assert.equal(statusCode, 400);
  });
});
