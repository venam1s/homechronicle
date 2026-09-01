import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createAlertsSettingsRouter } from '../src/alerts-settings-router.js';

/**
 * There was no test file for this router at all, which is how a setting that
 * did nothing survived: MALERT-07 removed the household-wide alerts gate when
 * rules became per-user, but this router kept accepting and persisting
 * `enabled`. An operator who toggled it off was told alerts were disabled
 * while every rule carried on firing.
 */
function makeApp(initial = { defaultQuietMinutes: 0, webhookTimeoutMs: 5000 }) {
  let settings = { ...initial };
  const app = express();
  app.use(express.json());
  app.use('/api/setup', createAlertsSettingsRouter({
    getSettings: () => ({ ...settings }),
    saveSettings: async (s) => { settings = { ...s }; },
    onSettingsChange: () => {},
    // The real router mounts an admin guard and a rate limiter; both are
    // pass-throughs here so the tests exercise the validation logic itself.
    requireAdminSession: (req, res, next) => next(),
    writeLimiter: (req, res, next) => next(),
  }));
  return { app, read: () => settings };
}

async function patch(app, body) {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/setup/alerts`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    server.close();
  }
}

describe('alerts settings router', () => {
  test('rejects the household-wide enabled flag instead of silently storing it', async () => {
    const { app, read } = makeApp();
    const res = await patch(app, { enabled: false });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /per rule/i);
    // The critical part: it must not have been persisted.
    assert.equal('enabled' in read(), false);
  });

  test('rejects it even alongside a valid setting, rather than half-applying', async () => {
    const { app, read } = makeApp();
    const res = await patch(app, { enabled: false, defaultQuietMinutes: 30 });

    assert.equal(res.status, 400);
    assert.equal(read().defaultQuietMinutes, 0, 'a rejected request must change nothing');
  });

  test('still accepts the settings that do exist', async () => {
    const { app, read } = makeApp();
    const res = await patch(app, { defaultQuietMinutes: 30, webhookTimeoutMs: 8000 });

    assert.equal(res.status, 200);
    assert.equal(read().defaultQuietMinutes, 30);
    assert.equal(read().webhookTimeoutMs, 8000);
  });

  test('validates ranges', async () => {
    const { app } = makeApp();
    assert.equal((await patch(app, { defaultQuietMinutes: -1 })).status, 400);
    assert.equal((await patch(app, { defaultQuietMinutes: 99999 })).status, 400);
    assert.equal((await patch(app, { webhookTimeoutMs: 999 })).status, 400);
    assert.equal((await patch(app, { webhookTimeoutMs: 60000 })).status, 400);
  });

  test('rejects an empty patch', async () => {
    const { app } = makeApp();
    assert.equal((await patch(app, {})).status, 400);
  });
});
