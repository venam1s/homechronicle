/**
 * auth-router.integration.test.js
 * Integration tests for createAuthPublicRouter and createAuthProtectedRouter:
 *   GET  /csrf-token      — public, no session required (SEC-02)
 *   GET  /user-count      — public probe (Plan 05 cross-plan contract)
 *   POST /login           — AUTH-02, AUTH-06, SEC-01, SEC-04
 *   POST /claim-admin     — AUTH-01, P10 atomic bootstrap
 *   POST /accept-invite   — PWD-01, T-21-05-REPLAY
 *   POST /forgot-password — PWD-02, T-21-05-ENUM
 *   POST /reset-confirm   — PWD-03, T-21-05-REPLAY, session revocation
 *   GET  /me              — AUTH-03, returns session user
 *   DELETE /logout        — AUTH-03, revokes server-side session + clears cookie
 *   PATCH /password       — PWD-01, change own password
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import supertest from 'supertest';
import { hashPassword, hashToken, generateToken } from '../src/security.js';
import { createAuthPublicRouter, createAuthProtectedRouter } from '../src/auth-router.js';

// -- Helpers --

const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_MAX_AGE_DEFAULT = 7 * DAY_MS;
const SESSION_MAX_AGE_REMEMBER = 30 * DAY_MS;

/**
 * Build a minimal express app that mounts the auth router under /api/auth.
 * SESSION_COOKIE_SECURE and generateCsrfToken are injectable so we can
 * test Secure flag without touching NODE_ENV.
 *
 * sendPasswordReset, isEmailEnabled, appBaseUrl added for Plan 21-05 routes.
 */
function buildApp({
  pool,
  SESSION_COOKIE_SECURE = false,
  generateCsrfToken = (_req, _res) => 'test-csrf-token-value',
  sendPasswordReset = async () => {},
  isEmailEnabled = () => true,
  appBaseUrl = 'https://test.example.com',
} = {}) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(
    '/api/auth',
    createAuthPublicRouter({
      pool,
      SESSION_COOKIE_SECURE,
      SESSION_MAX_AGE_DEFAULT,
      SESSION_MAX_AGE_REMEMBER,
      generateCsrfToken,
      sendPasswordReset,
      isEmailEnabled,
      appBaseUrl,
    }),
  );
  return app;
}

/**
 * Minimal in-memory pool that satisfies auth-router queries.
 * Supports: users, sessions, invites, password_reset_tokens tables.
 */
function createMockPool() {
  const users = [];
  const sessions = [];
  const invites = [];
  const passwordResetTokens = [];
  let nextUserId = 1;
  let nextSessionId = 1;
  let nextInviteId = 1;
  let nextResetTokenId = 1;
  let advisoryCalls = 0;

  // Async advisory-lock mutex modelling pg_advisory_xact_lock: one holder at a
  // time, FIFO waiters, released at COMMIT/ROLLBACK (or client.release()). This
  // lets the concurrency test exercise the real serialization the fix relies on.
  let lockHeld = false;
  const lockWaiters = [];
  function acquireLock() {
    if (!lockHeld) {
      lockHeld = true;
      return Promise.resolve();
    }
    return new Promise((resolve) => lockWaiters.push(resolve));
  }
  function releaseLock() {
    const next = lockWaiters.shift();
    if (next) next();
    else lockHeld = false;
  }

  async function runQuery(sql, params = []) {
    const s = sql.trim().replace(/\s+/g, ' ');

    // getUserCount
    if (s.includes('COUNT(*) AS n FROM users')) {
      return { rows: [{ n: String(users.length) }] };
    }

    // Atomic claim-admin: INSERT INTO users ... SELECT $1, $2, 'admin' WHERE NOT EXISTS ...
    // The role is a literal 'admin' in the SQL, not a parameter — only email ($1) and passwordHash ($2) are params.
    if (s.startsWith('INSERT INTO users') && s.includes('WHERE NOT EXISTS')) {
      const wasEmpty = users.length === 0;
      // Model the READ COMMITTED snapshot gap between the existence check and the
      // insert. Without the advisory lock, two interleaved claim-admins both
      // observe wasEmpty=true here and both insert — exactly the bug. With the
      // lock, the second request is blocked before it reaches this branch.
      await Promise.resolve();
      if (!wasEmpty) {
        return { rows: [] }; // no row = already exists
      }
      const [email, passwordHash] = params;
      const user = { id: nextUserId++, email, password_hash: passwordHash, role: 'admin' };
      users.push(user);
      return { rows: [{ id: user.id, email: user.email, role: user.role }] };
    }

      // createUser (plain INSERT used by test setup helpers)
      if (s.startsWith('INSERT INTO users') && !s.includes('WHERE NOT EXISTS')) {
        const [email, passwordHash, role] = params;
        const user = { id: nextUserId++, email, password_hash: passwordHash, role: role ?? 'member' };
        users.push(user);
        return { rows: [{ id: user.id, email: user.email, role: user.role }] };
      }

      // findUserByEmail — matches both old SELECT and new SELECT (with disabled_at)
      if (s.includes('FROM users WHERE email')) {
        const [email] = params;
        const user = users.find((u) => u.email === email.trim().toLowerCase()) ?? null;
        return { rows: user ? [user] : [] };
      }

      // createSession
      if (s.startsWith('INSERT INTO sessions')) {
        const [userId, tokenHash, expiresAt] = params;
        const session = {
          id: nextSessionId++,
          user_id: userId,
          token_hash: tokenHash,
          csrf_token: null,
          expires_at: expiresAt,
        };
        sessions.push(session);
        return { rows: [{ id: session.id, user_id: session.user_id, csrf_token: null, expires_at: session.expires_at }] };
      }

      // revokeSession (DELETE FROM sessions WHERE token_hash = $1)
      if (s.startsWith('DELETE FROM sessions WHERE token_hash')) {
        const [tokenHash] = params;
        const before = sessions.length;
        const idx = sessions.findIndex((s) => s.token_hash === tokenHash);
        if (idx !== -1) sessions.splice(idx, 1);
        return { rowCount: before - sessions.length };
      }

      // validateSession (UPDATE sessions SET last_seen_at ... WHERE token_hash = $1 AND expires_at > NOW())
      if (s.includes('UPDATE sessions SET last_seen_at') && s.includes('WHERE token_hash')) {
        const [tokenHash] = params;
        const now = new Date();
        const session = sessions.find(
          (s) => s.token_hash === tokenHash && new Date(s.expires_at) > now,
        ) ?? null;
        if (!session) return { rows: [] };
        const user = users.find((u) => u.id === session.user_id) ?? null;
        if (!user) return { rows: [] };
        return {
          rows: [{
            id: session.id,
            user_id: session.user_id,
            csrf_token: session.csrf_token,
            expires_at: session.expires_at,
            role: user.role,
          }],
        };
      }

      // updateSessionCsrfToken (UPDATE sessions SET csrf_token WHERE id = $2)
      if (s.includes('UPDATE sessions SET csrf_token')) {
        const [csrfToken, sessionId] = params;
        const session = sessions.find((s) => s.id === sessionId);
        if (session) session.csrf_token = csrfToken;
        return { rowCount: session ? 1 : 0 };
      }

      // redeemInvite: atomically accepts an invite (single-use, T-21-05-REPLAY)
      if (s.includes('UPDATE invites') && s.includes("status = 'accepted'") && s.includes('token_hash = $1')) {
        const [tokenHash] = params;
        const now = new Date();
        const invite = invites.find(
          (i) => i.token_hash === tokenHash && i.status === 'pending' && new Date(i.expires_at) > now && !i.used_at,
        ) ?? null;
        if (!invite) return { rows: [] };
        invite.status = 'accepted';
        invite.used_at = now;
        return { rows: [{ id: invite.id, email: invite.email, role: invite.role }] };
      }

      // createPasswordResetToken: INSERT INTO password_reset_tokens
      if (s.startsWith('INSERT INTO password_reset_tokens')) {
        const [userId, tokenHash, expiresAt] = params;
        const token = { id: nextResetTokenId++, user_id: userId, token_hash: tokenHash, expires_at: expiresAt, used_at: null };
        passwordResetTokens.push(token);
        return { rows: [{ id: token.id }] };
      }

      // redeemResetToken: single-use UPDATE
      if (s.includes('UPDATE password_reset_tokens') && s.includes('used_at = NOW()') && s.includes('token_hash = $1')) {
        const [tokenHash] = params;
        const now = new Date();
        const token = passwordResetTokens.find(
          (t) => t.token_hash === tokenHash && new Date(t.expires_at) > now && !t.used_at,
        ) ?? null;
        if (!token) return { rows: [] };
        token.used_at = now;
        return { rows: [{ id: token.id, user_id: token.user_id }] };
      }

      // UPDATE users SET password_hash (used by reset-confirm and change-password)
      if (s.includes('UPDATE users SET password_hash') && s.includes('WHERE id = $2')) {
        const [passwordHash, userId] = params;
        const user = users.find((u) => u.id === userId);
        if (user) user.password_hash = passwordHash;
        return { rowCount: user ? 1 : 0 };
      }

      // revokeSessionsForUser: DELETE FROM sessions WHERE user_id = $1
      if (s.startsWith('DELETE FROM sessions WHERE user_id')) {
        const [userId] = params;
        const before = sessions.length;
        const toRemove = sessions.filter((s) => s.user_id === userId);
        toRemove.forEach((s) => sessions.splice(sessions.indexOf(s), 1));
        return { rowCount: before - sessions.length };
      }

      // findUserById: SELECT FROM users WHERE id = $1 (used by change-password)
      if (s.includes('FROM users WHERE id = $1')) {
        const [userId] = params;
        const user = users.find((u) => u.id === userId) ?? null;
        return { rows: user ? [user] : [] };
      }

    throw new Error(`Unexpected SQL: ${sql}`);
  }

  // Transactional client returned by connect(): handles BEGIN/COMMIT/ROLLBACK and
  // the advisory lock; all other statements delegate to the shared runQuery.
  function connect() {
    let heldLock = false;
    return {
      async query(sql, params = []) {
        const s = sql.trim().replace(/\s+/g, ' ');
        if (s === 'BEGIN') return { rows: [] };
        if (s.startsWith('SELECT pg_advisory_xact_lock')) {
          advisoryCalls += 1;
          await acquireLock();
          heldLock = true;
          return { rows: [{ pg_advisory_xact_lock: '' }] };
        }
        if (s === 'COMMIT' || s === 'ROLLBACK') {
          if (heldLock) {
            heldLock = false;
            releaseLock();
          }
          return { rows: [] };
        }
        return runQuery(sql, params);
      },
      release() {
        if (heldLock) {
          heldLock = false;
          releaseLock();
        }
      },
    };
  }

  return {
    users,
    sessions,
    invites,
    passwordResetTokens,
    get advisoryCalls() {
      return advisoryCalls;
    },
    query: runQuery,
    connect,
  };
}

// -- Task 1: scaffold — GET /csrf-token and GET /user-count --

test('GET /api/auth/csrf-token returns { csrfToken } without authentication', async () => {
  const pool = createMockPool();
  const app = buildApp({ pool });
  const res = await supertest(app).get('/api/auth/csrf-token');
  assert.equal(res.status, 200);
  assert.ok(typeof res.body.csrfToken === 'string', 'csrfToken should be a string');
  assert.ok(res.body.csrfToken.length > 0, 'csrfToken should be non-empty');
});

test('GET /api/auth/user-count returns { count } reflecting pool state', async () => {
  const pool = createMockPool();
  const app = buildApp({ pool });

  // Empty state
  let res = await supertest(app).get('/api/auth/user-count');
  assert.equal(res.status, 200);
  assert.equal(res.body.count, 0);

  // Add a user
  pool.users.push({ id: 1, email: 'a@b.com', password_hash: 'x', role: 'admin' });
  res = await supertest(app).get('/api/auth/user-count');
  assert.equal(res.status, 200);
  assert.equal(res.body.count, 1);
});

// -- Task 2: POST /login --

test('POST /api/auth/login returns 200 and sets hc_session cookie with HttpOnly + SameSite=Lax', async () => {
  const pool = createMockPool();
  const passwordHash = await hashPassword('secret123');
  pool.users.push({ id: 1, email: 'user@test.com', password_hash: passwordHash, role: 'member' });

  const app = buildApp({ pool });
  const res = await supertest(app)
    .post('/api/auth/login')
    .send({ email: 'user@test.com', password: 'secret123' });

  assert.equal(res.status, 200);
  assert.ok(res.body.user, 'response must include user');
  assert.equal(res.body.user.email, 'user@test.com');
  assert.equal(res.body.user.role, 'member');
  assert.ok(typeof res.body.user.id !== 'undefined', 'user.id must be present');

  const setCookie = res.headers['set-cookie'];
  assert.ok(Array.isArray(setCookie) || typeof setCookie === 'string', 'Set-Cookie header must be present');
  const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie;
  assert.ok(cookieStr.includes('hc_session='), 'cookie name must be hc_session');
  assert.ok(/httponly/i.test(cookieStr), 'cookie must be HttpOnly');
  assert.ok(/samesite=lax/i.test(cookieStr), 'cookie must have SameSite=Lax');
});

test('POST /api/auth/login with bad password returns 401 Invalid credentials', async () => {
  const pool = createMockPool();
  const passwordHash = await hashPassword('correct');
  pool.users.push({ id: 1, email: 'user@test.com', password_hash: passwordHash, role: 'member' });

  const app = buildApp({ pool });
  const res = await supertest(app)
    .post('/api/auth/login')
    .send({ email: 'user@test.com', password: 'wrong' });

  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'Invalid credentials');
});

test('POST /api/auth/login with unknown email returns 401 (no enumeration)', async () => {
  const pool = createMockPool();
  const app = buildApp({ pool });
  const res = await supertest(app)
    .post('/api/auth/login')
    .send({ email: 'nobody@test.com', password: 'anything' });

  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'Invalid credentials');
});

test('POST /api/auth/login with missing fields returns 400', async () => {
  const pool = createMockPool();
  const app = buildApp({ pool });

  let res = await supertest(app).post('/api/auth/login').send({ password: 'x' });
  assert.equal(res.status, 400);

  res = await supertest(app).post('/api/auth/login').send({ email: 'a@b.com' });
  assert.equal(res.status, 400);
});

test('POST /api/auth/login with disabled account returns 401 Invalid credentials (M-3)', async () => {
  const pool = createMockPool();
  const passwordHash = await hashPassword('correct-pass-12ch');
  pool.users.push({
    id: 1,
    email: 'disabled@test.com',
    password_hash: passwordHash,
    role: 'member',
    disabled_at: new Date().toISOString(),
  });

  const app = buildApp({ pool });
  const res = await supertest(app)
    .post('/api/auth/login')
    .send({ email: 'disabled@test.com', password: 'correct-pass-12ch' });

  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'Invalid credentials');
  // No session must be created for a disabled account
  assert.equal(pool.sessions.length, 0, 'no session must be created for a disabled account');
});

test('POST /api/auth/login rememberMe=true sets 30-day maxAge; default is 7-day', async () => {
  const pool = createMockPool();
  const passwordHash = await hashPassword('pass1');
  pool.users.push({ id: 1, email: 'u@test.com', password_hash: passwordHash, role: 'member' });

  const app = buildApp({ pool });

  const resDefault = await supertest(app)
    .post('/api/auth/login')
    .send({ email: 'u@test.com', password: 'pass1' });
  assert.equal(resDefault.status, 200);
  const cookieDefault = (Array.isArray(resDefault.headers['set-cookie'])
    ? resDefault.headers['set-cookie'].join('; ')
    : resDefault.headers['set-cookie']) ?? '';

  // Re-add same user (pool users were not cleared)
  // Clear sessions so we can log in again
  pool.sessions.length = 0;

  const resRemember = await supertest(app)
    .post('/api/auth/login')
    .send({ email: 'u@test.com', password: 'pass1', rememberMe: true });
  assert.equal(resRemember.status, 200);
  const cookieRemember = (Array.isArray(resRemember.headers['set-cookie'])
    ? resRemember.headers['set-cookie'].join('; ')
    : resRemember.headers['set-cookie']) ?? '';

  // Extract Max-Age from both cookies
  const maxAgeDefault = parseInt((cookieDefault.match(/max-age=(\d+)/i) ?? [])[1] ?? '0', 10);
  const maxAgeRemember = parseInt((cookieRemember.match(/max-age=(\d+)/i) ?? [])[1] ?? '0', 10);

  // Express writes Max-Age in seconds into the Set-Cookie header.
  // 7-day default = 604800s; 30-day remember-me = 2592000s.
  assert.ok(maxAgeDefault > 0, 'default maxAge must be positive');
  assert.ok(maxAgeRemember > maxAgeDefault, 'rememberMe session must have longer maxAge than default');
  assert.ok(maxAgeDefault >= 604800, `default maxAge must be >= 604800s (7 days), got ${maxAgeDefault}`);
  assert.ok(maxAgeRemember >= 2592000, `rememberMe maxAge must be >= 2592000s (30 days), got ${maxAgeRemember}`);
});

test('POST /api/auth/login anti-fixation: second login issues a different hc_session token (SEC-04)', async () => {
  const pool = createMockPool();
  const passwordHash = await hashPassword('pass2');
  pool.users.push({ id: 1, email: 'anti@test.com', password_hash: passwordHash, role: 'member' });

  const app = buildApp({ pool });

  const res1 = await supertest(app)
    .post('/api/auth/login')
    .send({ email: 'anti@test.com', password: 'pass2' });
  assert.equal(res1.status, 200);
  const cookie1 = (Array.isArray(res1.headers['set-cookie'])
    ? res1.headers['set-cookie']
    : [res1.headers['set-cookie']]).find((c) => c.includes('hc_session=')) ?? '';
  const token1 = cookie1.split(';')[0].replace('hc_session=', '');

  // Second login — pass the existing cookie to trigger anti-fixation revoke
  const res2 = await supertest(app)
    .post('/api/auth/login')
    .set('Cookie', `hc_session=${token1}`)
    .send({ email: 'anti@test.com', password: 'pass2' });
  assert.equal(res2.status, 200);
  const cookie2 = (Array.isArray(res2.headers['set-cookie'])
    ? res2.headers['set-cookie']
    : [res2.headers['set-cookie']]).find((c) => c.includes('hc_session=')) ?? '';
  const token2 = cookie2.split(';')[0].replace('hc_session=', '');

  assert.ok(token1.length > 0, 'first token must be non-empty');
  assert.ok(token2.length > 0, 'second token must be non-empty');
  assert.notEqual(token1, token2, 'anti-fixation: second login must issue a different token');
});

test('POST /api/auth/login Secure flag follows SESSION_COOKIE_SECURE, not NODE_ENV (SEC-01)', async () => {
  const pool1 = createMockPool();
  const pool2 = createMockPool();
  const passwordHash = await hashPassword('sec01test');
  pool1.users.push({ id: 1, email: 'sec@test.com', password_hash: passwordHash, role: 'member' });
  pool2.users.push({ id: 1, email: 'sec@test.com', password_hash: passwordHash, role: 'member' });

  const appInsecure = buildApp({ pool: pool1, SESSION_COOKIE_SECURE: false });
  const appSecure = buildApp({ pool: pool2, SESSION_COOKIE_SECURE: true });

  const resInsecure = await supertest(appInsecure)
    .post('/api/auth/login')
    .send({ email: 'sec@test.com', password: 'sec01test' });
  assert.equal(resInsecure.status, 200);
  const insecureCookie = (Array.isArray(resInsecure.headers['set-cookie'])
    ? resInsecure.headers['set-cookie'].join('; ')
    : resInsecure.headers['set-cookie']) ?? '';
  assert.ok(!/\bsecure\b/i.test(insecureCookie), 'Secure attribute must NOT be present when SESSION_COOKIE_SECURE=false');

  const resSecure = await supertest(appSecure)
    .post('/api/auth/login')
    .send({ email: 'sec@test.com', password: 'sec01test' });
  assert.equal(resSecure.status, 200);
  const secureCookie = (Array.isArray(resSecure.headers['set-cookie'])
    ? resSecure.headers['set-cookie'].join('; ')
    : resSecure.headers['set-cookie']) ?? '';
  assert.ok(/\bsecure\b/i.test(secureCookie), 'Secure attribute must be present when SESSION_COOKIE_SECURE=true');
});

// -- Task 3: POST /claim-admin --

test('POST /api/auth/claim-admin on empty table creates admin with role admin + sets hc_session', async () => {
  const pool = createMockPool();
  const app = buildApp({ pool });

  const res = await supertest(app)
    .post('/api/auth/claim-admin')
    .send({ email: 'admin@test.com', password: 'adminpass-12ch' });

  assert.ok(res.status === 200 || res.status === 201, `expected 2xx, got ${res.status}`);
  assert.ok(res.body.user, 'response must include user');
  assert.equal(res.body.user.role, 'admin');
  assert.equal(res.body.user.email, 'admin@test.com');

  const setCookie = res.headers['set-cookie'];
  assert.ok(setCookie, 'hc_session cookie must be set (auto-login)');
  const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie;
  assert.ok(cookieStr.includes('hc_session='), 'cookie must be hc_session');
});

test('POST /api/auth/claim-admin returns 409 when any user already exists', async () => {
  const pool = createMockPool();
  pool.users.push({ id: 1, email: 'existing@test.com', password_hash: 'x', role: 'admin' });
  const app = buildApp({ pool });

  const res = await supertest(app)
    .post('/api/auth/claim-admin')
    .send({ email: 'second@test.com', password: 'newpass-12char' });

  assert.equal(res.status, 409);
  assert.ok(res.body.error, 'must return an error message');
});

test('POST /api/auth/claim-admin with missing fields returns 400', async () => {
  const pool = createMockPool();
  const app = buildApp({ pool });

  let res = await supertest(app).post('/api/auth/claim-admin').send({ password: 'x' });
  assert.equal(res.status, 400);

  res = await supertest(app).post('/api/auth/claim-admin').send({ email: 'a@b.com' });
  assert.equal(res.status, 400);
});

test('POST /api/auth/claim-admin rejects a password shorter than 12 chars (WR-01)', async () => {
  const pool = createMockPool();
  const app = buildApp({ pool });

  const res = await supertest(app)
    .post('/api/auth/claim-admin')
    .send({ email: 'admin@test.com', password: 'short' });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /at least 12 characters/i);
  // No admin must be created on a rejected password.
  assert.equal(pool.users.length, 0, 'no user row may be created for a too-short password');
});

test('POST /api/auth/claim-admin concurrent calls on empty table create exactly one admin (P10)', async () => {
  const pool = createMockPool();
  const app = buildApp({ pool });

  const [res1, res2] = await Promise.all([
    supertest(app).post('/api/auth/claim-admin').send({ email: 'race1@test.com', password: 'password-1-12c' }),
    supertest(app).post('/api/auth/claim-admin').send({ email: 'race2@test.com', password: 'password-2-12c' }),
  ]);

  const statuses = [res1.status, res2.status].sort();
  // One must succeed (2xx), one must fail (409)
  assert.ok((res1.status >= 200 && res1.status < 300) || (res2.status >= 200 && res2.status < 300),
    'exactly one request must succeed');
  assert.ok(res1.status === 409 || res2.status === 409,
    'exactly one request must return 409');

  // Final user count must be 1
  assert.equal(pool.users.length, 1, 'only one admin must exist after concurrent claims');
  assert.equal(pool.users[0].role, 'admin', 'the created user must have role admin');

  // T-20-BOOTSTRAP-RACE: the exactly-one result must come from the advisory lock,
  // not from the mock's incidental ordering. The mock yields between the existence
  // check and the insert, so WITHOUT pg_advisory_xact_lock both requests would
  // observe an empty table and both insert (count would be 2). Assert the lock was
  // actually acquired so a regression to the lockless pool.query path fails here.
  assert.ok(pool.advisoryCalls >= 1, 'claim-admin must acquire pg_advisory_xact_lock');
  void statuses;
});

// -- Plan 21-05 Task 1: POST /accept-invite, POST /forgot-password, POST /reset-confirm --

// Helper: seed a pending invite in the mock pool
function seedInvite(pool, { email = 'invited@test.com', role = 'member', hoursFromNow = 48 } = {}) {
  const rawToken = 'raw-invite-token-' + Math.random().toString(36).slice(2);
  const { hashToken: ht } = { hashToken: (t) => require('crypto').createHash('sha256').update(t).digest('hex') };
  void ht; // We'll hash in tests using imported hashToken
  const expiresAt = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  pool.invites.push({
    id: pool.invites.length + 1,
    email,
    role,
    status: 'pending',
    token_hash: null, // caller will set via hashToken
    expires_at: expiresAt,
    used_at: null,
  });
  return { rawToken, expiresAt, invite: pool.invites[pool.invites.length - 1] };
}

test('POST /api/auth/accept-invite with valid token creates user, issues session, returns user (PWD-01)', async () => {
  const pool = createMockPool();
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  pool.invites.push({
    id: 1,
    email: 'invited@test.com',
    role: 'member',
    status: 'pending',
    token_hash: tokenHash,
    expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000),
    used_at: null,
  });

  const app = buildApp({ pool });
  const res = await supertest(app)
    .post('/api/auth/accept-invite')
    .send({ token: rawToken, password: 'strongpass-12ch' });

  assert.equal(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.ok(res.body.ok, 'response must include ok: true');
  assert.ok(res.body.user, 'response must include user');
  assert.equal(res.body.user.email, 'invited@test.com');
  assert.equal(res.body.user.role, 'member');

  // Session cookie must be set
  const setCookie = res.headers['set-cookie'];
  assert.ok(setCookie, 'hc_session cookie must be set');
  const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie;
  assert.ok(cookieStr.includes('hc_session='), 'cookie must be hc_session');

  // Invite must now be marked accepted
  assert.equal(pool.invites[0].status, 'accepted', 'invite status must be accepted after redemption');
  // User must exist in pool
  assert.equal(pool.users.length, 1, 'one user must be created');
  assert.equal(pool.users[0].email, 'invited@test.com');
});

test('POST /api/auth/accept-invite with invalid token returns 400 (T-21-05-REPLAY)', async () => {
  const pool = createMockPool();
  const app = buildApp({ pool });

  const res = await supertest(app)
    .post('/api/auth/accept-invite')
    .send({ token: 'invalid-or-already-used-token', password: 'strongpass-12ch' });

  assert.equal(res.status, 400, `expected 400, got ${res.status}`);
  assert.ok(res.body.error, 'must return error');
  assert.match(res.body.error, /invalid|expired/i);
  assert.equal(pool.users.length, 0, 'no user must be created for an invalid invite');
});

test('POST /api/auth/accept-invite with already-used token returns 400 (T-21-05-REPLAY — second use)', async () => {
  const pool = createMockPool();
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  pool.invites.push({
    id: 1,
    email: 'used@test.com',
    role: 'member',
    status: 'accepted', // already redeemed
    token_hash: tokenHash,
    expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000),
    used_at: new Date(),
  });

  const app = buildApp({ pool });
  const res = await supertest(app)
    .post('/api/auth/accept-invite')
    .send({ token: rawToken, password: 'strongpass-12ch' });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /invalid|expired/i);
});

test('POST /api/auth/accept-invite with weak password returns 400', async () => {
  const pool = createMockPool();
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  pool.invites.push({
    id: 1,
    email: 'weak@test.com',
    role: 'member',
    status: 'pending',
    token_hash: tokenHash,
    expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000),
    used_at: null,
  });

  const app = buildApp({ pool });
  const res = await supertest(app)
    .post('/api/auth/accept-invite')
    .send({ token: rawToken, password: 'short' });

  assert.equal(res.status, 400);
  assert.ok(res.body.error, 'must return error');
  // Invite must NOT be redeemed on password rejection
  assert.equal(pool.invites[0].status, 'pending', 'invite must remain pending on password rejection');
  assert.equal(pool.users.length, 0, 'no user must be created for a weak password');
});

test('POST /api/auth/forgot-password returns identical body for known vs unknown email (T-21-05-ENUM)', async () => {
  const pool = createMockPool();
  const passwordHash = await hashPassword('correct-password-12ch');
  pool.users.push({ id: 1, email: 'known@test.com', password_hash: passwordHash, role: 'member' });

  const app = buildApp({ pool });

  const resKnown = await supertest(app)
    .post('/api/auth/forgot-password')
    .send({ email: 'known@test.com' });
  const resUnknown = await supertest(app)
    .post('/api/auth/forgot-password')
    .send({ email: 'unknown@test.com' });

  assert.equal(resKnown.status, 200, `known: expected 200, got ${resKnown.status}`);
  assert.equal(resUnknown.status, 200, `unknown: expected 200, got ${resUnknown.status}`);
  // Bodies must be byte-identical (enumeration safety)
  assert.deepEqual(
    resKnown.body,
    resUnknown.body,
    `Response bodies must be identical for enumeration safety. Known: ${JSON.stringify(resKnown.body)} Unknown: ${JSON.stringify(resUnknown.body)}`,
  );
  assert.ok(resKnown.body.message, 'response must include a message');
});

test('POST /api/auth/forgot-password for known user calls sendPasswordReset (PWD-02)', async () => {
  const pool = createMockPool();
  const passwordHash = await hashPassword('correct-password-12ch');
  pool.users.push({ id: 1, email: 'user@test.com', password_hash: passwordHash, role: 'member' });

  let resetCallArgs = null;
  const sendPasswordReset = async (to, resetUrl) => {
    resetCallArgs = { to, resetUrl };
  };

  const app = buildApp({ pool, sendPasswordReset, appBaseUrl: 'https://app.example.com' });
  const res = await supertest(app)
    .post('/api/auth/forgot-password')
    .send({ email: 'user@test.com' });

  assert.equal(res.status, 200);
  assert.ok(resetCallArgs !== null, 'sendPasswordReset must have been called for a known email');
  assert.equal(resetCallArgs.to, 'user@test.com');
  assert.ok(resetCallArgs.resetUrl.startsWith('https://app.example.com'), 'reset URL must use appBaseUrl');
  // A reset token must have been stored
  assert.equal(pool.passwordResetTokens.length, 1, 'reset token must be persisted');
});

test('POST /api/auth/forgot-password for unknown email does NOT call sendPasswordReset (PWD-02 — enumeration)', async () => {
  const pool = createMockPool(); // empty
  let sendCalled = false;
  const sendPasswordReset = async () => { sendCalled = true; };
  const app = buildApp({ pool, sendPasswordReset });

  const res = await supertest(app)
    .post('/api/auth/forgot-password')
    .send({ email: 'nobody@test.com' });

  assert.equal(res.status, 200);
  assert.ok(!sendCalled, 'sendPasswordReset must NOT be called for unknown email');
  assert.equal(pool.passwordResetTokens.length, 0, 'no reset token must be persisted for unknown email');
});

test('POST /api/auth/reset-confirm with valid token resets password and revokes sessions (PWD-03)', async () => {
  const pool = createMockPool();
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const passwordHash = await hashPassword('old-password-12ch');
  pool.users.push({ id: 1, email: 'user@test.com', password_hash: passwordHash, role: 'member' });
  // Add a session to prove it gets revoked
  pool.sessions.push({ id: 1, user_id: 1, token_hash: 'session-hash', csrf_token: null, expires_at: new Date(Date.now() + 7 * 86400 * 1000) });
  pool.passwordResetTokens.push({
    id: 1,
    user_id: 1,
    token_hash: tokenHash,
    expires_at: new Date(Date.now() + 60 * 60 * 1000),
    used_at: null,
  });

  const app = buildApp({ pool });
  const res = await supertest(app)
    .post('/api/auth/reset-confirm')
    .send({ token: rawToken, password: 'new-strong-password-12ch' });

  assert.equal(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.ok(res.body.ok, 'response must include ok: true');
  // Sessions must be revoked
  assert.equal(pool.sessions.length, 0, 'all sessions must be revoked after password reset');
  // Password hash must be updated (argon2id — just check it changed)
  assert.notEqual(pool.users[0].password_hash, passwordHash, 'password hash must be updated');
  // Token must be marked used
  assert.ok(pool.passwordResetTokens[0].used_at !== null, 'reset token must be marked used');
});

test('POST /api/auth/reset-confirm with already-used token returns 400 (T-21-05-REPLAY)', async () => {
  const pool = createMockPool();
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  pool.users.push({ id: 1, email: 'user@test.com', password_hash: 'hash', role: 'member' });
  pool.passwordResetTokens.push({
    id: 1,
    user_id: 1,
    token_hash: tokenHash,
    expires_at: new Date(Date.now() + 60 * 60 * 1000),
    used_at: new Date(), // already used
  });

  const app = buildApp({ pool });
  const res = await supertest(app)
    .post('/api/auth/reset-confirm')
    .send({ token: rawToken, password: 'new-strong-password-12ch' });

  assert.equal(res.status, 400);
  assert.ok(res.body.error, 'must return error');
  assert.match(res.body.error, /expired|already been used/i);
});

test('POST /api/auth/reset-confirm with weak password returns 400 (D-14)', async () => {
  const pool = createMockPool();
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  pool.users.push({ id: 1, email: 'user@test.com', password_hash: 'hash', role: 'member' });
  pool.passwordResetTokens.push({
    id: 1,
    user_id: 1,
    token_hash: tokenHash,
    expires_at: new Date(Date.now() + 60 * 60 * 1000),
    used_at: null,
  });

  const app = buildApp({ pool });
  const res = await supertest(app)
    .post('/api/auth/reset-confirm')
    .send({ token: rawToken, password: 'weak' });

  assert.equal(res.status, 400);
  assert.ok(res.body.error, 'must return error');
  // Token must NOT be consumed on validation failure
  assert.ok(pool.passwordResetTokens[0].used_at === null, 'reset token must NOT be marked used on weak password');
});

// -- Task 2 (TDD): createAuthProtectedRouter — GET /me, DELETE /logout --

/**
 * Build a minimal test app with the protected router mounted after a stub gate
 * middleware that attaches req.hcSession (simulating what Plan 09's gate does).
 */
function buildProtectedApp({ pool, hcSession } = {}) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  // Stub gate: sets req.hcSession from the provided fixture
  app.use((req, _res, next) => {
    req.hcSession = hcSession ?? null;
    next();
  });
  app.use('/api/auth', createAuthProtectedRouter({ pool }));
  return app;
}

test('GET /api/auth/me returns 200 with { user: { id, role } } from req.hcSession (AUTH-03)', async () => {
  const pool = createMockPool();
  const hcSession = { id: 42, user_id: 7, role: 'admin', csrfToken: null };
  const app = buildProtectedApp({ pool, hcSession });

  const res = await supertest(app).get('/api/auth/me');
  assert.equal(res.status, 200);
  assert.ok(res.body.user, 'response must include user');
  assert.equal(res.body.user.id, 7, 'user.id must match hcSession.user_id');
  assert.equal(res.body.user.role, 'admin', 'user.role must match hcSession.role');
});

test('GET /api/auth/me includes email when present in hcSession', async () => {
  const pool = createMockPool();
  const hcSession = { id: 1, user_id: 2, role: 'member', email: 'user@test.com', csrfToken: null };
  const app = buildProtectedApp({ pool, hcSession });

  const res = await supertest(app).get('/api/auth/me');
  assert.equal(res.status, 200);
  assert.equal(res.body.user.email, 'user@test.com');
});

test('DELETE /api/auth/logout returns 200 { ok: true } and clears hc_session cookie (AUTH-03)', async () => {
  const pool = createMockPool();
  // Create a real session row in the mock pool for logout to revoke
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  pool.sessions.push({ id: 1, user_id: 1, token_hash: tokenHash, csrf_token: null, expires_at: expiresAt });

  const hcSession = { id: 1, user_id: 1, role: 'member', csrfToken: null };
  const app = buildProtectedApp({ pool, hcSession });

  const res = await supertest(app)
    .delete('/api/auth/logout')
    .set('Cookie', `hc_session=${rawToken}`);

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });

  // Cookie must be cleared (Set-Cookie with Max-Age=0 or expired date or empty value)
  const setCookie = res.headers['set-cookie'];
  assert.ok(setCookie, 'Set-Cookie header must be present after logout');
  const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie;
  assert.ok(
    /hc_session=;|hc_session=(%20)?;|max-age=0/i.test(cookieStr),
    `hc_session cookie must be cleared (Max-Age=0 or empty), got: ${cookieStr}`,
  );
});

test('DELETE /api/auth/logout destroys the server-side session (AUTH-03 — revokeSession called)', async () => {
  const pool = createMockPool();
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  pool.sessions.push({ id: 1, user_id: 1, token_hash: tokenHash, csrf_token: null, expires_at: expiresAt });
  pool.users.push({ id: 1, email: 'u@test.com', password_hash: 'x', role: 'member' });

  const hcSession = { id: 1, user_id: 1, role: 'member', csrfToken: null };
  const app = buildProtectedApp({ pool, hcSession });

  // Before logout: session exists
  assert.equal(pool.sessions.length, 1, 'session must exist before logout');

  await supertest(app)
    .delete('/api/auth/logout')
    .set('Cookie', `hc_session=${rawToken}`);

  // After logout: session row must be gone (revokeSession deleted it)
  assert.equal(pool.sessions.length, 0, 'session must be gone after logout (server-side destruction AUTH-03)');
});

test('DELETE /api/auth/logout with no hc_session cookie still returns 200 { ok: true }', async () => {
  const pool = createMockPool();
  const hcSession = { id: 1, user_id: 1, role: 'member', csrfToken: null };
  const app = buildProtectedApp({ pool, hcSession });

  // No cookie — should succeed gracefully (nothing to revoke)
  const res = await supertest(app).delete('/api/auth/logout');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
});

// -- Plan 21-05 Task 2: PATCH /password (change own password) --

test('PATCH /api/auth/password with correct current password changes password and revokes sessions (PWD-01)', async () => {
  const pool = createMockPool();
  const oldPasswordHash = await hashPassword('old-password-12ch');
  pool.users.push({ id: 1, email: 'user@test.com', password_hash: oldPasswordHash, role: 'member' });
  // Add a session row to verify it gets revoked
  pool.sessions.push({ id: 1, user_id: 1, token_hash: 'some-hash', csrf_token: null, expires_at: new Date(Date.now() + 7 * 86400 * 1000) });

  const hcSession = { id: 1, user_id: 1, role: 'member', email: 'user@test.com', csrfToken: null };
  const app = buildProtectedApp({ pool, hcSession });

  const res = await supertest(app)
    .patch('/api/auth/password')
    .send({ currentPassword: 'old-password-12ch', newPassword: 'new-strong-password-12ch' });

  assert.equal(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.ok(res.body.ok, 'response must include ok: true');
  // All sessions must be revoked (forces re-login on other devices)
  assert.equal(pool.sessions.length, 0, 'all sessions must be revoked after password change (PWD-01)');
  // Password hash must have changed
  assert.notEqual(pool.users[0].password_hash, oldPasswordHash, 'password hash must be updated');
});

test('PATCH /api/auth/password with wrong current password returns 400 (not 401)', async () => {
  const pool = createMockPool();
  const oldPasswordHash = await hashPassword('correct-password-12ch');
  pool.users.push({ id: 1, email: 'user@test.com', password_hash: oldPasswordHash, role: 'member' });

  const hcSession = { id: 1, user_id: 1, role: 'member', email: 'user@test.com', csrfToken: null };
  const app = buildProtectedApp({ pool, hcSession });

  const res = await supertest(app)
    .patch('/api/auth/password')
    .send({ currentPassword: 'wrong-password-12ch', newPassword: 'new-strong-password-12ch' });

  assert.equal(res.status, 400, `expected 400, got ${res.status}`);
  assert.match(res.body.error, /current password is incorrect/i);
  // Password must NOT have changed
  assert.equal(pool.users[0].password_hash, oldPasswordHash, 'password must not change on wrong current password');
});

test('PATCH /api/auth/password with weak new password returns 400 (D-14)', async () => {
  const pool = createMockPool();
  const oldPasswordHash = await hashPassword('correct-password-12ch');
  pool.users.push({ id: 1, email: 'user@test.com', password_hash: oldPasswordHash, role: 'member' });

  const hcSession = { id: 1, user_id: 1, role: 'member', email: 'user@test.com', csrfToken: null };
  const app = buildProtectedApp({ pool, hcSession });

  const res = await supertest(app)
    .patch('/api/auth/password')
    .send({ currentPassword: 'correct-password-12ch', newPassword: 'weak' });

  assert.equal(res.status, 400);
  assert.ok(res.body.error, 'must return error');
  // Password must NOT have changed
  assert.equal(pool.users[0].password_hash, oldPasswordHash, 'password must not change on weak new password');
});

test('PATCH /api/auth/password with no session returns 401', async () => {
  const pool = createMockPool();
  const app = buildProtectedApp({ pool, hcSession: null });

  const res = await supertest(app)
    .patch('/api/auth/password')
    .send({ currentPassword: 'any', newPassword: 'any' });

  assert.equal(res.status, 401);
});

test('PATCH /api/auth/password missing required fields returns 400', async () => {
  const pool = createMockPool();
  const hcSession = { id: 1, user_id: 1, role: 'member', csrfToken: null };
  const app = buildProtectedApp({ pool, hcSession });

  let res = await supertest(app)
    .patch('/api/auth/password')
    .send({ newPassword: 'new-strong-password-12ch' });
  assert.equal(res.status, 400);

  res = await supertest(app)
    .patch('/api/auth/password')
    .send({ currentPassword: 'old-password-12ch' });
  assert.equal(res.status, 400);
});
