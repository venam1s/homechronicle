/**
 * auth-password-limiter.test.js — auth L-3 (audit 2026-08-30)
 *
 * PATCH /api/auth/password had no rate limiter. A stolen session could brute-
 * force the current password (bounded only by argon2id, ~1k guesses/min) and
 * make the theft permanent by changing it. This regression proves a dedicated
 * passwordChangeLimiter is mounted on the route and returns 429 after the
 * configured max.
 *
 * AUTH_RATE_LIMIT_MAX/AUTH_RATE_LIMIT_WINDOW_MS are read at import time by
 * auth-router.js, so the env vars are set BEFORE the dynamic import below.
 * node --test runs each file in its own process, so this does not leak into
 * other suites.
 */
process.env.AUTH_RATE_LIMIT_MAX = '3';
process.env.AUTH_RATE_LIMIT_WINDOW_MS = '60000';

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import supertest from 'supertest';
const { createAuthProtectedRouter } = await import('../src/auth-router.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  // Stub gate: sets req.hcSession (simulating what Plan 09's gate does).
  app.use((req, _res, next) => {
    req.hcSession = { user_id: '1', role: 'admin', email: 'admin@example.com' };
    next();
  });
  // Pool stub that throws if queried — the limiter must reject before any
  // handler code reaches the DB when the body is empty and budget is exhausted.
  const pool = {
    query: () => {
      throw new Error('pool.query should not be reached in this test');
    },
  };
  app.use('/api/auth', createAuthProtectedRouter({ pool }));
  return app;
}

test('PATCH /api/auth/password returns 429 after AUTH_RATE_LIMIT_MAX requests (auth L-3)', async () => {
  const app = buildApp();

  // Empty body short-circuits in the handler (400) before any password
  // hashing or DB access, so this test is fast and deterministic. The
  // limiter runs before the handler, so the 400s still consume budget.
  const statuses = [];
  let lastBody;
  for (let i = 0; i < 4; i += 1) {
    const res = await supertest(app).patch('/api/auth/password').send({});
    statuses.push(res.status);
    lastBody = res.body;
  }

  assert.deepEqual(statuses, [400, 400, 400, 429]);
  assert.equal(lastBody.error, 'Too many requests');
});
