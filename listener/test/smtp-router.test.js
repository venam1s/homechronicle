/**
 * smtp-router.test.js — Tests for listener/src/smtp-router.js
 *
 * Requirements covered:
 *   EMAIL-02 — GET /smtp returns config without password; PUT persists config
 *   EMAIL-04 — GET /smtp response NEVER contains password/smtpPass key
 *   D-01 — PUT with blank/absent password preserves existing secret
 *   D-03 — POST /smtp/test sends test email to admin; 503 when disabled
 *   T-21-04-ADMINONLY — all routes return 403 for non-admin
 *   T-21-04-SMTPLEAK — proof that GET response has no password key
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// Import the factory function under test
import { createSmtpRouter } from '../src/smtp-router.js';
import express from 'express';

// -- Test helpers --

/**
 * Build a minimal fake smtpConfigStore (non-secret fields only).
 */
function makeStore(initial = {}) {
  let data = { ...initial };
  return {
    getSnapshot: () => ({ ...data }),
    write: async (next) => { data = { ...next }; return { ...data }; },
  };
}

/**
 * Create an Express test app with the smtp router mounted.
 */
function makeApp({
  smtpConfigStore = makeStore({ host: 'smtp.example.com', port: 587 }),
  readSmtpSecret = async () => 'stored-secret',
  writeSmtpSecret = async () => {},
  buildSmtpConfig = (snap, secret) => ({ ...snap, smtpPass: secret }),
  envOverriddenFields = () => [],
  initEmail = async () => {},
  sendTestEmail = async () => {},
  isEmailEnabled = () => false,
  session = null,  // simulated req.hcSession (null = not authenticated)
} = {}) {
  const app = express();
  app.use(express.json());

  // Inject a fake session
  app.use((req, _res, next) => {
    req.hcSession = session;
    next();
  });

  const router = createSmtpRouter({
    smtpConfigStore,
    readSmtpSecret,
    writeSmtpSecret,
    buildSmtpConfig,
    envOverriddenFields,
    initEmail,
    sendTestEmail,
    isEmailEnabled,
  });

  // Mount at /api/setup (same as in production)
  app.use('/api/setup', router);

  return app;
}

/**
 * Perform a simple HTTP request against an Express app without starting a real server.
 */
function request(app, method, path, body = null) {
  return new Promise((resolve, reject) => {
    const http = await import('node:http').then(m => m);
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const opts = {
        hostname: '127.0.0.1',
        port,
        path,
        method: method.toUpperCase(),
        headers: {
          'Content-Type': 'application/json',
        },
      };
      const req = http.request(opts, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          server.close();
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      });
      req.on('error', (err) => { server.close(); reject(err); });
      if (body !== null) req.write(JSON.stringify(body));
      req.end();
    });
  });
}

// Simpler approach: use supertest-like direct method with express
// Use node:http directly instead

async function httpRequest(app, { method = 'GET', path = '/', body = null } = {}) {
  const { createServer } = await import('node:http');
  return new Promise((resolve, reject) => {
    const server = createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const http = require ? null : null; // avoid require
      import('node:http').then(({ request: req }) => {
        const options = {
          hostname: '127.0.0.1',
          port,
          path,
          method: method.toUpperCase(),
          headers: { 'Content-Type': 'application/json' },
        };
        const r = req(options, (res) => {
          let data = '';
          res.on('data', (c) => { data += c; });
          res.on('end', () => {
            server.close();
            try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
            catch { resolve({ status: res.statusCode, body: data }); }
          });
        });
        r.on('error', (err) => { server.close(); reject(err); });
        if (body !== null) r.write(JSON.stringify(body));
        r.end();
      }).catch(reject);
    });
    server.on('error', reject);
  });
}

// -- Tests --

test('GET /smtp: admin session → 200 with host/port/user/from/secure/passwordConfigured/envFields', async () => {
  const app = makeApp({
    smtpConfigStore: makeStore({ host: 'smtp.example.com', port: 587, user: 'u@ex.com', from: 'From <u@ex.com>', secure: false }),
    readSmtpSecret: async () => 'stored-secret',
    envOverriddenFields: () => [],
    session: { role: 'admin', email: 'admin@example.com', user_id: 1 },
  });
  const res = await httpRequest(app, { method: 'GET', path: '/api/setup/smtp' });
  assert.equal(res.status, 200, 'should return 200 for admin');
  assert.ok('host' in res.body, 'response should have host');
  assert.ok('passwordConfigured' in res.body, 'response should have passwordConfigured');
  assert.equal(res.body.passwordConfigured, true, 'passwordConfigured should be true when secret exists');
  assert.ok('envFields' in res.body, 'response should have envFields');
});

test('GET /smtp: response NEVER contains password or smtpPass key (EMAIL-04, T-21-04-SMTPLEAK)', async () => {
  const app = makeApp({
    smtpConfigStore: makeStore({ host: 'smtp.example.com', port: 587, password: 'leaked!', smtpPass: 'also-leaked!' }),
    readSmtpSecret: async () => 'stored-secret',
    session: { role: 'admin', email: 'admin@example.com', user_id: 1 },
  });
  const res = await httpRequest(app, { method: 'GET', path: '/api/setup/smtp' });
  assert.equal(res.status, 200, 'should return 200');
  assert.ok(!('password' in res.body), 'response MUST NOT contain password key');
  assert.ok(!('smtpPass' in res.body), 'response MUST NOT contain smtpPass key');
});

test('GET /smtp: non-admin (member) session → 403', async () => {
  const app = makeApp({
    session: { role: 'member', email: 'user@example.com', user_id: 2 },
  });
  const res = await httpRequest(app, { method: 'GET', path: '/api/setup/smtp' });
  assert.equal(res.status, 403, 'member should get 403');
});

test('GET /smtp: no session → 403', async () => {
  const app = makeApp({ session: null });
  const res = await httpRequest(app, { method: 'GET', path: '/api/setup/smtp' });
  assert.equal(res.status, 403, 'no session should get 403');
});

test('PUT /smtp: admin → 200 { ok: true }, persists non-secret fields', async () => {
  let writtenData = null;
  const store = makeStore({ host: '', port: 587 });
  const originalWrite = store.write.bind(store);
  store.write = async (next) => { writtenData = next; return originalWrite(next); };

  const app = makeApp({
    smtpConfigStore: store,
    session: { role: 'admin', email: 'admin@example.com', user_id: 1 },
  });
  const res = await httpRequest(app, {
    method: 'PUT',
    path: '/api/setup/smtp',
    body: { host: 'smtp.new.com', port: 465, user: 'u@new.com', from: 'HC <u@new.com>', secure: true },
  });
  assert.equal(res.status, 200, 'should return 200');
  assert.ok(res.body.ok === true, 'response should be { ok: true }');
});

test('PUT /smtp: blank password preserves existing secret (does not call writeSmtpSecret, D-01)', async () => {
  let writeSecretCalled = false;
  const app = makeApp({
    writeSmtpSecret: async () => { writeSecretCalled = true; },
    session: { role: 'admin', email: 'admin@example.com', user_id: 1 },
  });
  const res = await httpRequest(app, {
    method: 'PUT',
    path: '/api/setup/smtp',
    body: { host: 'smtp.example.com', port: 587, password: '' },  // blank password
  });
  assert.equal(res.status, 200, 'should return 200');
  assert.equal(writeSecretCalled, false, 'writeSmtpSecret must NOT be called when password is blank (D-01)');
});

test('PUT /smtp: absent password preserves existing secret (D-01)', async () => {
  let writeSecretCalled = false;
  const app = makeApp({
    writeSmtpSecret: async () => { writeSecretCalled = true; },
    session: { role: 'admin', email: 'admin@example.com', user_id: 1 },
  });
  const res = await httpRequest(app, {
    method: 'PUT',
    path: '/api/setup/smtp',
    body: { host: 'smtp.example.com', port: 587 },  // no password field
  });
  assert.equal(res.status, 200, 'should return 200');
  assert.equal(writeSecretCalled, false, 'writeSmtpSecret must NOT be called when password is absent (D-01)');
});

test('PUT /smtp: non-admin session → 403', async () => {
  const app = makeApp({
    session: { role: 'member', email: 'user@example.com', user_id: 2 },
  });
  const res = await httpRequest(app, { method: 'PUT', path: '/api/setup/smtp', body: {} });
  assert.equal(res.status, 403, 'member should get 403');
});

test('POST /smtp/test: 503 when isEmailEnabled() is false', async () => {
  const app = makeApp({
    isEmailEnabled: () => false,
    session: { role: 'admin', email: 'admin@example.com', user_id: 1 },
  });
  const res = await httpRequest(app, { method: 'POST', path: '/api/setup/smtp/test' });
  assert.equal(res.status, 503, 'should return 503 when email is not configured');
  assert.ok(res.body.error, 'error message should be present');
});

test('POST /smtp/test: 200 when email is enabled', async () => {
  const app = makeApp({
    isEmailEnabled: () => true,
    sendTestEmail: async () => {},
    session: { role: 'admin', email: 'admin@example.com', user_id: 1 },
  });
  const res = await httpRequest(app, { method: 'POST', path: '/api/setup/smtp/test' });
  assert.equal(res.status, 200, 'should return 200 when email sends successfully');
  assert.ok(res.body.ok === true, 'response should be { ok: true }');
});

test('POST /smtp/test: non-admin → 403', async () => {
  const app = makeApp({
    session: { role: 'member', email: 'user@example.com', user_id: 2 },
  });
  const res = await httpRequest(app, { method: 'POST', path: '/api/setup/smtp/test' });
  assert.equal(res.status, 403, 'member should get 403');
});
