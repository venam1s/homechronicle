/**
 * users-router.test.js — Plan 21-06 (replaces Wave 0 stub)
 *
 * Requirements covered:
 *   USER-01 — GET /api/users lists all users with id, email, role, status
 *   USER-02 — POST /api/users/invite mints token + emails; always returns inviteUrl (D-10)
 *   USER-04 — DELETE /api/users/invites/:id revokes; repeat call → 404
 *   USER-05 — PATCH /api/users/:id disable/enable; guarded
 *   USER-06 — disable/remove revoke sessions immediately
 *   USER-07 — GET /api/users/invites lists pending invites; last-admin guard enforced
 *
 * Test pattern: fake pool + fake email module (following db-session.test.js pattern).
 * Fake pool accumulates query calls and returns pre-configured row sets.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createUsersRouter } from '../src/users-router.js';

// -- Helpers --

/**
 * Build an express app with the users router mounted at /api/users,
 * with a pre-configured req.hcSession injected via middleware.
 */
function buildApp({ session, poolBehavior, sendInvite, isEmailEnabled, appBaseUrl = 'http://localhost:3001' }) {
  const app = express();
  app.use(express.json());

  // Inject session like the auth gate does
  app.use((req, _res, next) => {
    req.hcSession = session ?? null;
    next();
  });

  const pool = makeFakePool(poolBehavior);
  const router = createUsersRouter({
    pool,
    sendInvite: sendInvite ?? (() => Promise.resolve()),
    isEmailEnabled: isEmailEnabled ?? (() => false),
    appBaseUrl,
  });
  app.use('/api/users', router);
  return { app, pool };
}

/**
 * Minimal fake pool. `behavior` is an array of query handlers:
 *   { match: string|RegExp, rows: [], rowCount: n }
 * Queries are matched in order. Unmatched queries return empty rows.
 *
 * Supports both pool.query() (direct) and pool.connect() → client.
 */
function makeFakePool(behavior = []) {
  const calls = [];

  function fakeQuery(sql, params) {
    calls.push({ sql, params });
    const sqlStr = String(sql);
    for (const entry of behavior) {
      const matches = typeof entry.match === 'string'
        ? sqlStr.includes(entry.match)
        : entry.match.test(sqlStr);
      if (matches) {
        return Promise.resolve({
          rows: entry.rows ?? [],
          rowCount: entry.rowCount ?? (entry.rows ? entry.rows.length : 0),
        });
      }
    }
    // Default: return empty rows so unmatched queries don't crash
    return Promise.resolve({ rows: [], rowCount: 0 });
  }

  // Support pool.connect() → client with BEGIN/COMMIT/ROLLBACK/query
  function connect() {
    const client = {
      query: fakeQuery,
      release: () => {},
    };
    return Promise.resolve(client);
  }

  return { query: fakeQuery, connect, _calls: calls };
}

async function request(app, method, path, body) {
  const http = await import('node:http');
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = addr.port;
      const options = {
        hostname: '127.0.0.1',
        port,
        path,
        method: method.toUpperCase(),
        headers: { 'Content-Type': 'application/json' },
      };
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          server.close();
          let parsed;
          try { parsed = JSON.parse(data); } catch { parsed = data; }
          resolve({ status: res.statusCode, body: parsed });
        });
      });
      req.on('error', (err) => { server.close(); reject(err); });
      if (body !== undefined) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  });
}

// -- Session fixtures --
const adminSession = { userId: 1, role: 'admin', email: 'admin@example.com' };
const memberSession = { userId: 2, role: 'member', email: 'member@example.com' };

// =============================================================================
// TASK 1 TESTS: list users, list/create/revoke/resend invites
// =============================================================================

// -- USER-01: GET / returns all users --

test('GET /api/users returns 200 with user list for admin', async () => {
  const { app } = buildApp({
    session: adminSession,
    poolBehavior: [
      {
        match: 'SELECT',
        rows: [
          { id: 1, email: 'admin@example.com', role: 'admin', created_at: new Date(), disabled_at: null },
          { id: 2, email: 'user@example.com', role: 'member', created_at: new Date(), disabled_at: null },
        ],
      },
    ],
  });
  const res = await request(app, 'GET', '/api/users');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.equal(res.body.length, 2);
  assert.ok(res.body[0].id !== undefined);
  assert.ok(res.body[0].email !== undefined);
  assert.ok(res.body[0].role !== undefined);
  assert.ok(res.body[0].status !== undefined);
});

test('GET /api/users maps disabled_at to status=disabled', async () => {
  const { app } = buildApp({
    session: adminSession,
    poolBehavior: [
      {
        match: 'SELECT',
        rows: [
          { id: 1, email: 'disabled@example.com', role: 'member', created_at: new Date(), disabled_at: new Date() },
        ],
      },
    ],
  });
  const res = await request(app, 'GET', '/api/users');
  assert.equal(res.status, 200);
  assert.equal(res.body[0].status, 'disabled');
});

test('GET /api/users maps null disabled_at to status=active', async () => {
  const { app } = buildApp({
    session: adminSession,
    poolBehavior: [
      {
        match: 'SELECT',
        rows: [
          { id: 1, email: 'active@example.com', role: 'admin', created_at: new Date(), disabled_at: null },
        ],
      },
    ],
  });
  const res = await request(app, 'GET', '/api/users');
  assert.equal(res.status, 200);
  assert.equal(res.body[0].status, 'active');
});

// -- Role guard: member → 403, no session → 401 --

test('GET /api/users returns 403 for member-role session', async () => {
  const { app } = buildApp({ session: memberSession, poolBehavior: [] });
  const res = await request(app, 'GET', '/api/users');
  assert.equal(res.status, 403);
});

test('GET /api/users returns 401 with no session', async () => {
  const { app } = buildApp({ session: null, poolBehavior: [] });
  const res = await request(app, 'GET', '/api/users');
  assert.equal(res.status, 401);
});

test('POST /api/users/invite returns 403 for member session', async () => {
  const { app } = buildApp({ session: memberSession, poolBehavior: [] });
  const res = await request(app, 'POST', '/api/users/invite', { email: 'x@x.com' });
  assert.equal(res.status, 403);
});

test('DELETE /api/users/invites/1 returns 403 for member session', async () => {
  const { app } = buildApp({ session: memberSession, poolBehavior: [] });
  const res = await request(app, 'DELETE', '/api/users/invites/1');
  assert.equal(res.status, 403);
});

// -- USER-07: GET /invites lists pending invites --

test('GET /api/users/invites returns 200 with pending invite list for admin', async () => {
  const { app } = buildApp({
    session: adminSession,
    poolBehavior: [
      {
        match: 'SELECT',
        rows: [
          { id: 1, email: 'pending@example.com', role: 'member', status: 'pending', expires_at: new Date() },
        ],
      },
    ],
  });
  const res = await request(app, 'GET', '/api/users/invites');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].email, 'pending@example.com');
  assert.ok(res.body[0].expiresAt !== undefined);
});

// -- USER-02: POST /invite --

test('POST /api/users/invite returns inviteUrl even when email is disabled (D-10)', async () => {
  const { app } = buildApp({
    session: adminSession,
    isEmailEnabled: () => false,
    poolBehavior: [
      // findUserByEmail → no existing user
      { match: 'FROM users WHERE', rows: [] },
      // findInviteByEmail → no pending invite
      { match: 'FROM invites WHERE', rows: [] },
      // createInvite → returns new invite
      { match: 'INSERT INTO invites', rows: [{ id: 10, email: 'new@example.com', role: 'member', expires_at: new Date() }] },
    ],
  });
  const res = await request(app, 'POST', '/api/users/invite', { email: 'new@example.com', role: 'member' });
  assert.equal(res.status, 200);
  assert.ok(res.body.inviteUrl, 'inviteUrl must be present even when email disabled');
  assert.ok(res.body.inviteUrl.includes('/accept-invite?token='), 'inviteUrl must include token path');
  assert.equal(res.body.emailed, false);
  assert.equal(res.body.email, 'new@example.com');
});

test('POST /api/users/invite sets emailed=true when SMTP enabled and send succeeds', async () => {
  let sendInviteCalled = false;
  const { app } = buildApp({
    session: adminSession,
    isEmailEnabled: () => true,
    sendInvite: async () => { sendInviteCalled = true; },
    poolBehavior: [
      { match: 'FROM users WHERE', rows: [] },
      { match: 'FROM invites WHERE', rows: [] },
      { match: 'INSERT INTO invites', rows: [{ id: 11, email: 'smtp@example.com', role: 'member', expires_at: new Date() }] },
    ],
  });
  const res = await request(app, 'POST', '/api/users/invite', { email: 'smtp@example.com', role: 'member' });
  assert.equal(res.status, 200);
  assert.ok(res.body.inviteUrl, 'inviteUrl must be present when SMTP enabled');
  assert.equal(res.body.emailed, true);
  assert.ok(sendInviteCalled, 'sendInvite should have been called');
});

test('POST /api/users/invite returns inviteUrl even when sendInvite throws (D-10 fallback)', async () => {
  const { app } = buildApp({
    session: adminSession,
    isEmailEnabled: () => true,
    sendInvite: async () => { throw new Error('SMTP failure'); },
    poolBehavior: [
      { match: 'FROM users WHERE', rows: [] },
      { match: 'FROM invites WHERE', rows: [] },
      { match: 'INSERT INTO invites', rows: [{ id: 12, email: 'fail@example.com', role: 'member', expires_at: new Date() }] },
    ],
  });
  const res = await request(app, 'POST', '/api/users/invite', { email: 'fail@example.com' });
  assert.equal(res.status, 200);
  assert.ok(res.body.inviteUrl, 'inviteUrl must be present even when sendInvite throws');
  assert.equal(res.body.emailed, false);
});

test('POST /api/users/invite returns 400 when email already has an active account', async () => {
  const { app } = buildApp({
    session: adminSession,
    poolBehavior: [
      // findUserByEmail → existing user found
      { match: 'FROM users WHERE', rows: [{ id: 5, email: 'exists@example.com', role: 'member', disabled_at: null }] },
    ],
  });
  const res = await request(app, 'POST', '/api/users/invite', { email: 'exists@example.com' });
  assert.equal(res.status, 400);
  assert.ok(res.body.error.includes('account'), 'error should mention account exists');
});

test('POST /api/users/invite returns 400 for duplicate pending invite', async () => {
  const { app } = buildApp({
    session: adminSession,
    poolBehavior: [
      // findUserByEmail → no user
      { match: 'FROM users WHERE', rows: [] },
      // findInviteByEmail → pending invite exists (SQL has newline between FROM invites and WHERE)
      { match: 'FROM invites', rows: [{ id: 3, email: 'pending@example.com', status: 'pending', expires_at: new Date() }] },
    ],
  });
  const res = await request(app, 'POST', '/api/users/invite', { email: 'pending@example.com' });
  assert.equal(res.status, 400);
  assert.ok(res.body.error.includes('pending') || res.body.error.includes('invite'), 'error should mention pending invite');
});

test('POST /api/users/invite returns 400 for invalid role', async () => {
  const { app } = buildApp({ session: adminSession, poolBehavior: [] });
  const res = await request(app, 'POST', '/api/users/invite', { email: 'x@x.com', role: 'superuser' });
  assert.equal(res.status, 400);
});

test('POST /api/users/invite returns 400 for missing email', async () => {
  const { app } = buildApp({ session: adminSession, poolBehavior: [] });
  const res = await request(app, 'POST', '/api/users/invite', { role: 'member' });
  assert.equal(res.status, 400);
});

test('POST /api/users/invite stores token hash not raw token (D-10 security)', async () => {
  const { app, pool } = buildApp({
    session: adminSession,
    isEmailEnabled: () => false,
    poolBehavior: [
      { match: 'FROM users WHERE', rows: [] },
      { match: 'FROM invites WHERE', rows: [] },
      { match: 'INSERT INTO invites', rows: [{ id: 13, email: 'hash@example.com', role: 'member', expires_at: new Date() }] },
    ],
  });
  const res = await request(app, 'POST', '/api/users/invite', { email: 'hash@example.com' });
  assert.equal(res.status, 200);
  // The raw token should be in the URL
  const urlToken = new URL(res.body.inviteUrl).searchParams.get('token');
  // The DB call should have stored a hash (64-char hex SHA-256), not the raw token
  const insertCall = pool._calls.find((c) => String(c.sql).includes('INSERT INTO invites'));
  assert.ok(insertCall, 'INSERT INTO invites should have been called');
  const storedHash = insertCall.params[1]; // tokenHash is second param
  assert.ok(storedHash, 'tokenHash param should be present');
  assert.notEqual(storedHash, urlToken, 'stored hash must differ from raw URL token');
  assert.equal(storedHash.length, 64, 'stored hash should be 64-char SHA-256 hex');
});

// -- USER-04: DELETE /invites/:id --

test('DELETE /api/users/invites/:id revokes a pending invite → 200', async () => {
  const { app } = buildApp({
    session: adminSession,
    poolBehavior: [
      { match: 'UPDATE invites', rows: [{ id: 1 }] },
    ],
  });
  const res = await request(app, 'DELETE', '/api/users/invites/1');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test('DELETE /api/users/invites/:id returns 404 for already-revoked or absent invite', async () => {
  const { app } = buildApp({
    session: adminSession,
    poolBehavior: [
      { match: 'UPDATE invites', rows: [] },
    ],
  });
  const res = await request(app, 'DELETE', '/api/users/invites/999');
  assert.equal(res.status, 404);
});

// -- POST /invites/:id/resend --

test('POST /api/users/invites/:id/resend re-mints token and returns new inviteUrl', async () => {
  const { app } = buildApp({
    session: adminSession,
    isEmailEnabled: () => false,
    poolBehavior: [
      // revokeInvite → found with email/role
      { match: 'UPDATE invites', rows: [{ id: 5, email: 'resend@example.com', role: 'member' }] },
      // createInvite → new record
      { match: 'INSERT INTO invites', rows: [{ id: 6, email: 'resend@example.com', role: 'member', expires_at: new Date() }] },
    ],
  });
  const res = await request(app, 'POST', '/api/users/invites/5/resend');
  assert.equal(res.status, 200);
  assert.ok(res.body.inviteUrl, 'resend should return new inviteUrl');
  assert.ok(res.body.inviteUrl.includes('/accept-invite?token='));
});

test('POST /api/users/invites/:id/resend returns 404 when invite not found', async () => {
  const { app } = buildApp({
    session: adminSession,
    poolBehavior: [
      { match: 'UPDATE invites', rows: [] },
    ],
  });
  const res = await request(app, 'POST', '/api/users/invites/999/resend');
  assert.equal(res.status, 404);
});

// =============================================================================
// TASK 2 TESTS: PATCH (disable/enable/setRole) + DELETE with last-admin & self guards
// =============================================================================

// -- PATCH /:id action:disable --

test('PATCH /api/users/:id disable returns 200 and revokes sessions for non-admin member', async () => {
  const { app, pool } = buildApp({
    session: adminSession,
    poolBehavior: [
      // advisory lock (inside transaction)
      { match: 'pg_advisory_xact_lock', rows: [] },
      // countAdmins → 2 (safe to disable)
      { match: 'COUNT', rows: [{ count: 2 }] },
      // disableUser
      { match: 'SET disabled_at', rows: [{ id: 3, role: 'member', disabled_at: new Date() }] },
      // revokeSessionsForUser
      { match: 'DELETE FROM sessions', rows: [] },
    ],
  });
  const res = await request(app, 'PATCH', '/api/users/3', { action: 'disable' });
  assert.equal(res.status, 200);
  // Verify sessions were revoked
  const sessionRevoke = pool._calls.find((c) => String(c.sql).includes('DELETE FROM sessions'));
  assert.ok(sessionRevoke, 'revokeSessionsForUser should have been called');
});

test('PATCH /api/users/:id disable returns 400 when disabling self (D-06)', async () => {
  const { app } = buildApp({
    session: adminSession, // userId: 1
    poolBehavior: [],
  });
  // Target = same as session userId (1)
  const res = await request(app, 'PATCH', '/api/users/1', { action: 'disable' });
  assert.equal(res.status, 400);
  assert.ok(res.body.error, 'should return an error message');
});

test('PATCH /api/users/:id disable returns 400 when disabling last active admin', async () => {
  const { app } = buildApp({
    session: { userId: 1, role: 'admin', email: 'admin@example.com' },
    poolBehavior: [
      { match: 'pg_advisory_xact_lock', rows: [] },
      // target IS an admin → last-admin guard applies
      { match: 'SELECT role FROM users WHERE id', rows: [{ role: 'admin' }] },
      // countAdmins → 1 (last admin)
      { match: 'COUNT', rows: [{ count: 1 }] },
    ],
  });
  // Target user 5 is a different user (not self)
  const res = await request(app, 'PATCH', '/api/users/5', { action: 'disable' });
  assert.equal(res.status, 400);
});

test('PATCH /api/users/:id disable returns 200 for a member even when only one admin exists', async () => {
  // Regression: the last-admin guard must NOT block disabling a non-admin.
  const { app } = buildApp({
    session: { userId: 1, role: 'admin', email: 'admin@example.com' },
    poolBehavior: [
      { match: 'pg_advisory_xact_lock', rows: [] },
      // target is a MEMBER → guard must be skipped regardless of admin count
      { match: 'SELECT role FROM users WHERE id', rows: [{ role: 'member' }] },
      { match: 'COUNT', rows: [{ count: 1 }] },
      { match: 'SET disabled_at', rows: [{ id: 2, role: 'member', disabled_at: new Date() }] },
      { match: 'DELETE FROM sessions', rows: [] },
    ],
  });
  const res = await request(app, 'PATCH', '/api/users/2', { action: 'disable' });
  assert.equal(res.status, 200);
});

// -- PATCH /:id action:enable --

test('PATCH /api/users/:id enable returns 200 for admin', async () => {
  const { app } = buildApp({
    session: adminSession,
    poolBehavior: [
      { match: 'SET disabled_at = NULL', rows: [{ id: 3, role: 'member', disabled_at: null }] },
    ],
  });
  const res = await request(app, 'PATCH', '/api/users/3', { action: 'enable' });
  assert.equal(res.status, 200);
});

// -- PATCH /:id action:setRole --

test('PATCH /api/users/:id setRole demoting only admin returns 400 (D-09)', async () => {
  const { app } = buildApp({
    session: adminSession,
    poolBehavior: [
      { match: 'pg_advisory_xact_lock', rows: [] },
      // countAdmins → 1 (only admin)
      { match: 'COUNT', rows: [{ count: 1 }] },
    ],
  });
  // demoting a different user from admin → member
  const res = await request(app, 'PATCH', '/api/users/9', { action: 'setRole', role: 'member' });
  assert.equal(res.status, 400);
});

test('PATCH /api/users/:id setRole promote to admin returns 200', async () => {
  const { app } = buildApp({
    session: adminSession,
    poolBehavior: [
      { match: 'SET role', rows: [{ id: 3, email: 'user@example.com', role: 'admin' }] },
    ],
  });
  const res = await request(app, 'PATCH', '/api/users/3', { action: 'setRole', role: 'admin' });
  assert.equal(res.status, 200);
});

test('PATCH /api/users/:id setRole demote when multiple admins exist returns 200', async () => {
  const { app } = buildApp({
    session: adminSession,
    poolBehavior: [
      { match: 'pg_advisory_xact_lock', rows: [] },
      // countAdmins → 2 (safe to demote)
      { match: 'COUNT', rows: [{ count: 2 }] },
      { match: 'SET role', rows: [{ id: 5, email: 'other@example.com', role: 'member' }] },
    ],
  });
  const res = await request(app, 'PATCH', '/api/users/5', { action: 'setRole', role: 'member' });
  assert.equal(res.status, 200);
});

// -- DELETE /:id --

test('DELETE /api/users/:id returns 400 when removing self (D-06)', async () => {
  const { app } = buildApp({
    session: adminSession, // userId: 1
    poolBehavior: [],
  });
  const res = await request(app, 'DELETE', '/api/users/1');
  assert.equal(res.status, 400);
});

test('DELETE /api/users/:id returns 400 when removing the last admin', async () => {
  const { app } = buildApp({
    session: adminSession,
    poolBehavior: [
      { match: 'pg_advisory_xact_lock', rows: [] },
      // target IS an admin → last-admin guard applies
      { match: 'SELECT role FROM users WHERE id', rows: [{ role: 'admin' }] },
      // countAdmins → 1
      { match: 'COUNT', rows: [{ count: 1 }] },
    ],
  });
  // Target is a different user (not self) — user 2
  const res = await request(app, 'DELETE', '/api/users/2');
  assert.equal(res.status, 400);
});

test('DELETE /api/users/:id returns 200 for a member even when only one admin exists', async () => {
  // Regression: the last-admin guard must NOT block removing a non-admin.
  const { app } = buildApp({
    session: adminSession,
    poolBehavior: [
      { match: 'pg_advisory_xact_lock', rows: [] },
      { match: 'SELECT role FROM users WHERE id', rows: [{ role: 'member' }] },
      { match: 'COUNT', rows: [{ count: 1 }] },
      { match: 'DELETE FROM users', rows: [{ id: 2 }] },
    ],
  });
  const res = await request(app, 'DELETE', '/api/users/2');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test('DELETE /api/users/:id returns 200 for regular member', async () => {
  const { app } = buildApp({
    session: adminSession,
    poolBehavior: [
      { match: 'pg_advisory_xact_lock', rows: [] },
      // countAdmins → 2 (target is member, guard passes)
      { match: 'COUNT', rows: [{ count: 2 }] },
      // removeUser
      { match: 'DELETE FROM users', rows: [{ id: 3 }] },
    ],
  });
  const res = await request(app, 'DELETE', '/api/users/3');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

// -- Source-inspection tests (grep-based) --

test('users-router.js exports createUsersRouter', async () => {
  const mod = await import('../src/users-router.js');
  assert.equal(typeof mod.createUsersRouter, 'function');
});

test('users-router.js uses hashToken for invite storage (D-10 security)', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../src/users-router.js', import.meta.url), 'utf8');
  const count = (src.match(/hashToken/g) ?? []).length;
  assert.ok(count >= 1, `hashToken must appear at least once in users-router.js; found ${count}`);
});

test('users-router.js uses pg_advisory_xact_lock for admin guard (Pitfall 7)', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../src/users-router.js', import.meta.url), 'utf8');
  assert.ok(src.includes('pg_advisory_xact_lock'), 'pg_advisory_xact_lock must be present');
});
