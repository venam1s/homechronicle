/**
 * auth-router.integration.test.js
 * Integration tests for createAuthPublicRouter and createAuthProtectedRouter:
 *   GET  /csrf-token   — public, no session required (SEC-02)
 *   GET  /user-count   — public probe (Plan 05 cross-plan contract)
 *   POST /login        — AUTH-02, AUTH-06, SEC-01, SEC-04
 *   POST /claim-admin  — AUTH-01, P10 atomic bootstrap
 *   GET  /me           — AUTH-03, returns session user
 *   DELETE /logout     — AUTH-03, revokes server-side session + clears cookie
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
 */
function buildApp({
  pool,
  SESSION_COOKIE_SECURE = false,
  generateCsrfToken = (_req, _res) => 'test-csrf-token-value',
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
    }),
  );
  return app;
}

/**
 * Minimal in-memory pool that satisfies auth-router queries.
 * Supports: users table (INSERT, SELECT by email, COUNT), sessions table (INSERT, DELETE by token_hash).
 */
function createMockPool() {
  const users = [];
  const sessions = [];
  let nextUserId = 1;
  let nextSessionId = 1;

  return {
    users,
    sessions,
    async query(sql, params = []) {
      const s = sql.trim().replace(/\s+/g, ' ');

      // getUserCount
      if (s.includes('COUNT(*) AS n FROM users')) {
        return { rows: [{ n: String(users.length) }] };
      }

      // Atomic claim-admin: INSERT INTO users ... SELECT $1, $2, 'admin' WHERE NOT EXISTS ...
      // The role is a literal 'admin' in the SQL, not a parameter — only email ($1) and passwordHash ($2) are params.
      if (s.startsWith('INSERT INTO users') && s.includes('WHERE NOT EXISTS')) {
        if (users.length > 0) {
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

      // findUserByEmail
      if (s.includes('SELECT id, email, password_hash, role FROM users WHERE email')) {
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

      throw new Error(`Unexpected SQL: ${sql}`);
    },
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
  void statuses;
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
