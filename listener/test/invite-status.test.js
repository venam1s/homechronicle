/**
 * invite-status.test.js — Unit + integration tests for:
 *   getInviteByTokenHash (db.js) — read-only invite lookup
 *   GET /api/auth/invite-status  — public endpoint, never leaks email/role
 *
 * Uses mock pools (no live DB) following the db-invites.test.js and
 * auth-router.integration.test.js patterns.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import supertest from 'supertest';
import { hashToken } from '../src/security.js';
import { getInviteByTokenHash } from '../src/db.js';
import { createAuthPublicRouter } from '../src/auth-router.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_MAX_AGE_DEFAULT = 7 * DAY_MS;
const SESSION_MAX_AGE_REMEMBER = 30 * DAY_MS;

/**
 * Build a minimal express app that mounts createAuthPublicRouter under /api/auth.
 * The pool is caller-supplied so each test can inject the exact rows it needs.
 */
function buildApp({ pool }) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(
    '/api/auth',
    createAuthPublicRouter({
      pool,
      SESSION_COOKIE_SECURE: false,
      SESSION_MAX_AGE_DEFAULT,
      SESSION_MAX_AGE_REMEMBER,
      generateCsrfToken: (_req) => 'test-csrf-token',
    }),
  );
  return app;
}

/**
 * Build a minimal mock pool that handles the invite-status SELECT and enough
 * other queries to satisfy router startup (getUserCount probe etc.).
 *
 * @param {object|null} inviteRow — the row returned for the SELECT, or null
 */
function makeInvitePool(inviteRow) {
  return {
    query(sql, _params) {
      const s = sql.trim().replace(/\s+/g, ' ');

      // getUserCount (used by GET /user-count if called; harmless to handle here)
      if (s.includes('COUNT(*) AS n FROM users')) {
        return Promise.resolve({ rows: [{ n: '0' }] });
      }

      // getInviteByTokenHash SELECT
      if (s.includes('FROM invites') && s.includes('WHERE token_hash')) {
        return Promise.resolve({ rows: inviteRow ? [inviteRow] : [] });
      }

      return Promise.reject(new Error(`Unexpected SQL in invite-status mock pool: ${s.slice(0, 80)}`));
    },
  };
}

// ---------------------------------------------------------------------------
// getInviteByTokenHash unit tests
// ---------------------------------------------------------------------------

test('getInviteByTokenHash: returns row when token_hash matches', async () => {
  const row = { status: 'pending', expires_at: new Date(Date.now() + DAY_MS), used_at: null };
  const pool = makeInvitePool(row);
  const result = await getInviteByTokenHash(pool, 'anyhash');
  assert.deepStrictEqual(result, row);
});

test('getInviteByTokenHash: returns null when token_hash not found', async () => {
  const pool = makeInvitePool(null);
  const result = await getInviteByTokenHash(pool, 'missinghash');
  assert.equal(result, null);
});

test('getInviteByTokenHash: does NOT mutate the invite (SELECT only, no UPDATE)', () => {
  // Verify by reading the db.js source that getInviteByTokenHash uses SELECT not UPDATE
  // This is the contract — a read-only lookup cannot be verified purely by mock behavior
  // so we assert on the function source text.
  const fnStr = getInviteByTokenHash.toString();
  assert.ok(fnStr.includes('SELECT'), 'getInviteByTokenHash must use SELECT');
  assert.ok(!fnStr.includes('UPDATE'), 'getInviteByTokenHash must NOT use UPDATE');
});

// ---------------------------------------------------------------------------
// GET /api/auth/invite-status integration tests
// ---------------------------------------------------------------------------

test('GET /invite-status: missing token → 200 { valid:false, reason:"invalid" }', async () => {
  const app = buildApp({ pool: makeInvitePool(null) });
  const res = await supertest(app).get('/api/auth/invite-status');
  assert.equal(res.status, 200);
  assert.equal(res.body.valid, false);
  assert.equal(res.body.reason, 'invalid');
});

test('GET /invite-status: empty token → 200 { valid:false, reason:"invalid" }', async () => {
  const app = buildApp({ pool: makeInvitePool(null) });
  const res = await supertest(app).get('/api/auth/invite-status?token=');
  assert.equal(res.status, 200);
  assert.equal(res.body.valid, false);
  assert.equal(res.body.reason, 'invalid');
});

test('GET /invite-status: unknown token (no DB row) → 200 { valid:false, reason:"invalid" }', async () => {
  const app = buildApp({ pool: makeInvitePool(null) });
  const res = await supertest(app).get('/api/auth/invite-status?token=unknowntoken');
  assert.equal(res.status, 200);
  assert.equal(res.body.valid, false);
  assert.equal(res.body.reason, 'invalid');
});

test('GET /invite-status: revoked invite → 200 { valid:false, reason:"revoked" }', async () => {
  const row = { status: 'revoked', expires_at: new Date(Date.now() + DAY_MS), used_at: null };
  const app = buildApp({ pool: makeInvitePool(row) });
  const res = await supertest(app).get('/api/auth/invite-status?token=revokedtoken');
  assert.equal(res.status, 200);
  assert.equal(res.body.valid, false);
  assert.equal(res.body.reason, 'revoked');
});

test('GET /invite-status: accepted invite (used_at set) → 200 { valid:false, reason:"used" }', async () => {
  const row = { status: 'accepted', expires_at: new Date(Date.now() + DAY_MS), used_at: new Date() };
  const app = buildApp({ pool: makeInvitePool(row) });
  const res = await supertest(app).get('/api/auth/invite-status?token=usedtoken');
  assert.equal(res.status, 200);
  assert.equal(res.body.valid, false);
  assert.equal(res.body.reason, 'used');
});

test('GET /invite-status: status=accepted with used_at null → 200 { valid:false, reason:"used" }', async () => {
  const row = { status: 'accepted', expires_at: new Date(Date.now() + DAY_MS), used_at: null };
  const app = buildApp({ pool: makeInvitePool(row) });
  const res = await supertest(app).get('/api/auth/invite-status?token=acceptedtoken');
  assert.equal(res.status, 200);
  assert.equal(res.body.valid, false);
  assert.equal(res.body.reason, 'used');
});

test('GET /invite-status: expired invite (expires_at in past) → 200 { valid:false, reason:"expired" }', async () => {
  const row = { status: 'pending', expires_at: new Date(Date.now() - 1000), used_at: null };
  const app = buildApp({ pool: makeInvitePool(row) });
  const res = await supertest(app).get('/api/auth/invite-status?token=expiredtoken');
  assert.equal(res.status, 200);
  assert.equal(res.body.valid, false);
  assert.equal(res.body.reason, 'expired');
});

test('GET /invite-status: status=expired → 200 { valid:false, reason:"expired" }', async () => {
  const row = { status: 'expired', expires_at: new Date(Date.now() + DAY_MS), used_at: null };
  const app = buildApp({ pool: makeInvitePool(row) });
  const res = await supertest(app).get('/api/auth/invite-status?token=statusexpired');
  assert.equal(res.status, 200);
  assert.equal(res.body.valid, false);
  assert.equal(res.body.reason, 'expired');
});

test('GET /invite-status: pending non-expired invite → 200 { valid:true }', async () => {
  const row = { status: 'pending', expires_at: new Date(Date.now() + DAY_MS), used_at: null };
  const app = buildApp({ pool: makeInvitePool(row) });
  const res = await supertest(app).get('/api/auth/invite-status?token=validtoken');
  assert.equal(res.status, 200);
  assert.equal(res.body.valid, true);
  // Must not expose reason on valid response
  assert.equal(res.body.reason, undefined);
});

test('GET /invite-status: never returns email in response body', async () => {
  const row = { status: 'pending', expires_at: new Date(Date.now() + DAY_MS), used_at: null };
  const app = buildApp({ pool: makeInvitePool(row) });
  const res = await supertest(app).get('/api/auth/invite-status?token=anytok');
  assert.equal(res.body.email, undefined, 'invite-status must never return email');
});

test('GET /invite-status: never returns role in response body', async () => {
  const row = { status: 'pending', expires_at: new Date(Date.now() + DAY_MS), used_at: null };
  const app = buildApp({ pool: makeInvitePool(row) });
  const res = await supertest(app).get('/api/auth/invite-status?token=anytok');
  assert.equal(res.body.role, undefined, 'invite-status must never return role');
});

test('GET /invite-status: DB error → 500 { error: "Internal server error" }', async () => {
  const errorPool = {
    query() {
      return Promise.reject(new Error('Connection refused'));
    },
  };
  const app = buildApp({ pool: errorPool });
  const res = await supertest(app).get('/api/auth/invite-status?token=sometoken');
  assert.equal(res.status, 500);
  assert.equal(res.body.error, 'Internal server error');
});
