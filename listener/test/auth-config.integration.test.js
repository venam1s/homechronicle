/**
 * auth-config.integration.test.js
 * Integration tests for GET /api/auth/config (public endpoint, no auth required).
 *
 * Verifies:
 *   - Returns { authEnabled: true } when authEnabled=true (default)
 *   - Returns { authEnabled: false } when authEnabled=false
 *   - Endpoint is publicly reachable without a session cookie
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import supertest from 'supertest';
import { createAuthPublicRouter } from '../src/auth-router.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_MAX_AGE_DEFAULT = 7 * DAY_MS;
const SESSION_MAX_AGE_REMEMBER = 30 * DAY_MS;

/**
 * Minimal express app mounting only the public auth router.
 * No session gate is applied — simulates the pre-gate mount in index.js.
 */
function buildApp({ authEnabled = true } = {}) {
  const app = express();
  app.use(express.json());
  // Minimal stub pool — /config does not touch the DB
  const pool = { query: async () => { throw new Error('unexpected pool.query in /config test'); } };
  app.use(
    '/api/auth',
    createAuthPublicRouter({
      pool,
      SESSION_COOKIE_SECURE: false,
      SESSION_MAX_AGE_DEFAULT,
      SESSION_MAX_AGE_REMEMBER,
      generateCsrfToken: () => 'test-csrf-token',
      authEnabled,
    }),
  );
  return app;
}

test('GET /api/auth/config returns { authEnabled: true } by default', async () => {
  const app = buildApp({ authEnabled: true });
  const res = await supertest(app).get('/api/auth/config');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { authEnabled: true });
});

test('GET /api/auth/config returns { authEnabled: false } when authEnabled=false', async () => {
  const app = buildApp({ authEnabled: false });
  const res = await supertest(app).get('/api/auth/config');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { authEnabled: false });
});

test('GET /api/auth/config is reachable without an hc_session cookie (public route)', async () => {
  const app = buildApp({ authEnabled: true });
  // Explicitly send no cookies
  const res = await supertest(app)
    .get('/api/auth/config')
    .unset('Cookie');
  assert.equal(res.status, 200);
  assert.equal(typeof res.body.authEnabled, 'boolean', 'authEnabled must be a boolean');
});

test('GET /api/auth/config response contains only authEnabled (no secrets)', async () => {
  const app = buildApp({ authEnabled: true });
  const res = await supertest(app).get('/api/auth/config');
  assert.equal(res.status, 200);
  const keys = Object.keys(res.body);
  assert.deepEqual(keys, ['authEnabled'], `response must contain exactly { authEnabled }; got keys: ${JSON.stringify(keys)}`);
});
