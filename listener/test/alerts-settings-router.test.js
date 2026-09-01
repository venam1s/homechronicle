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
  // No express.json(): requests are driven in-process with `body` already
  // populated, so there is no stream for a body parser to read.
  app.use('/api/setup', createAlertsSettingsRouter({
    getSettings: () => ({ ...settings }),
    saveSettings: async (s) => { settings = { ...s }; },
    onSettingsChange: () => {},
    // The real router mounts an admin guard and a rate limiter; both are
    // pass-throughs here so these tests exercise the validation itself.
    requireAdminSession: (req, res, next) => next(),
    writeLimiter: (req, res, next) => next(),
  }));
  return { app, read: () => settings };
}

/**
 * Drive the router in-process rather than over a socket.
 *
 * An earlier version of this file opened a real `app.listen(0)` server per
 * assertion. It passed locally and broke CI: the runner is capped at 2 CPUs,
 * node --test parallelises across files, and six extra listening sockets were
 * enough to perturb a timing-sensitive reconnect test in a different file.
 * Express handlers are just functions — there is no reason to involve TCP.
 */
function patch(app, body) {
  return new Promise((resolve, reject) => {
    const req = {
      method: 'PATCH',
      url: '/api/setup/alerts',
      originalUrl: '/api/setup/alerts',
      headers: { 'content-type': 'application/json' },
      body,
      // Express reads these off the request even for a handler that never
      // touches the network.
      socket: { remoteAddress: '127.0.0.1' },
      connection: { remoteAddress: '127.0.0.1' },
    };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { resolve({ status: this.statusCode, body: payload }); return this; },
      setHeader() { return this; },
      getHeader() { return undefined; },
      end() { resolve({ status: this.statusCode, body: null }); },
    };
    app.handle(req, res, (err) => (err ? reject(err) : resolve({ status: 404, body: null })));
  });
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
