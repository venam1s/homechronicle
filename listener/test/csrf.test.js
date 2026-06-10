/*
 * csrf.test.js — csrf-sync async-hook spike + SEC-02 rejection integration test
 *
 * SPIKE VERDICT (Plan 20-06):
 * ============================================================
 * csrf-sync DOES NOT await an async storeTokenInState hook.
 *
 * Source evidence (node_modules/csrf-sync/lib/index.js, generateToken):
 *   const generateToken = (req, overwrite = false) => {
 *     if (!overwrite && typeof getTokenFromState(req) === "string") {
 *       return getTokenFromState(req);
 *     }
 *     const newToken = randomBytes(size).toString("hex");
 *     storeTokenInState(req, newToken);   // <-- NOT awaited; return value discarded
 *     return newToken;
 *   };
 *
 * storeTokenInState is called synchronously and its return value (a Promise when
 * async) is discarded. generateToken is itself NOT async. csrfSynchronisedProtection
 * is also a plain synchronous middleware that calls next() without any await.
 *
 * COUPLING STRATEGY FOR PLANS 08/09 — STRATEGY B (sync-store + lazy DB flush):
 * ============================================================
 * Because csrf-sync fires-and-forgets storeTokenInState, an awaited DB write
 * inside that hook would race the response — the hook may not finish before the
 * next middleware or response handler runs. The safe coupling is:
 *
 *   storeTokenInState: (req, token) => {
 *     // SYNC: set the token on the in-memory session object immediately
 *     if (req.hcSession) {
 *       req.hcSession.csrfToken = token;
 *       // LAZY DB FLUSH: fire-and-forget; token is already safe in-memory
 *       updateSessionCsrfToken(pool, req.hcSession.id, token)
 *         .catch(err => log.error('[csrf] lazy flush failed:', err.message));
 *     }
 *   },
 *
 *   getTokenFromState: (req) => req.hcSession?.csrfToken ?? null,
 *
 * The in-memory token on req.hcSession is authoritative for the lifetime of the
 * request. The DB column (sessions.csrf_token) is the durable store, persisted
 * asynchronously. On the next request, validateSession() rehydrates req.hcSession
 * from the DB row, so the persisted value is available. If the lazy flush fails
 * (rare transient DB error), the worst outcome is that the CSRF token for that
 * session reverts to the previous value on the next request — forcing the client
 * to re-fetch /api/auth/csrf-token. This is an acceptable degradation.
 *
 * DO NOT use strategy A (awaited DB write inside storeTokenInState) — csrf-sync
 * would schedule it as a fire-and-forget Promise, making validation unreliable.
 *
 * SEC-02 integration test (Plan 09):
 * ============================================================
 * Full wiring test asserting the complete POST-login CSRF flow:
 *   1. POST /api/auth/login (pre-gate, no X-CSRF-Token needed) → 200 + hc_session cookie
 *   2. GET /api/auth/csrf-token (public, no X-CSRF-Token needed) → { csrfToken }
 *   3. POST /api/events WITHOUT X-CSRF-Token header → 403 (EBADCSRFTOKEN)
 *   4. POST /api/events WITH correct X-CSRF-Token header → 200
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { csrfSync } from 'csrf-sync';

// -- Spike: confirm csrf-sync async hook await behavior --

test('csrf-sync generateToken calls storeTokenInState synchronously (fire-and-forget)', () => {
  const callOrder = [];
  let resolveStore;

  const { generateToken } = csrfSync({
    getTokenFromState: (req) => req._csrfToken ?? null,
    storeTokenInState: async (req, token) => {
      // This async function captures call order BEFORE the deferred resolves
      callOrder.push('store-called');
      // The deferred lets us detect whether csrf-sync awaited completion
      await new Promise((resolve) => { resolveStore = resolve; });
      callOrder.push('store-resolved');
      req._csrfToken = token;
    },
    getTokenFromRequest: (req) => req.headers?.['x-csrf-token'] ?? null,
  });

  const req = { _csrfToken: null, headers: {} };

  // Call generateToken — if storeTokenInState were awaited, generateToken
  // would have to be async and we'd need to await it. It is NOT async.
  const token = generateToken(req);

  // Immediately after generateToken returns:
  // - 'store-called' should be present (the hook was invoked)
  // - 'store-resolved' should NOT be present (the promise was not awaited)
  assert.ok(typeof token === 'string', 'generateToken must return a string token');
  assert.ok(token.length > 0, 'token must be non-empty');
  assert.equal(callOrder.includes('store-called'), true,
    'storeTokenInState must be called during generateToken');
  assert.equal(callOrder.includes('store-resolved'), false,
    'VERDICT: csrf-sync does NOT await storeTokenInState — promise was fire-and-forget');

  // The in-memory write did NOT happen yet (hook is still mid-promise)
  // This confirms that storeTokenInState must write synchronously to be safe.
  assert.equal(req._csrfToken, null,
    'req._csrfToken not yet set — async hook body not awaited before generateToken returned');

  // Clean up: resolve the pending promise so the test process can exit cleanly
  if (resolveStore) resolveStore();

  console.log('[csrf-sync spike] VERDICT: storeTokenInState is fire-and-forget (NOT awaited)');
  console.log('[csrf-sync spike] COUPLING STRATEGY: B — sync-store on req.hcSession.csrfToken + lazy DB flush');
});

test('csrf-sync exported API surface matches expected hook names (A3 assumption check)', () => {
  const result = csrfSync({
    getTokenFromState: (req) => req._t ?? null,
    storeTokenInState: (req, token) => { req._t = token; },
    getTokenFromRequest: (req) => req.headers?.['x-csrf-token'] ?? null,
  });

  // Verify the API surface is intact (assumption A3)
  assert.equal(typeof result.csrfSynchronisedProtection, 'function',
    'csrfSynchronisedProtection middleware must be exported');
  assert.equal(typeof result.generateToken, 'function',
    'generateToken must be exported');
  assert.equal(typeof result.isRequestValid, 'function',
    'isRequestValid must be exported');
  assert.equal(typeof result.revokeToken, 'function',
    'revokeToken must be exported');
  assert.equal(typeof result.invalidCsrfTokenError, 'object',
    'invalidCsrfTokenError must be exported');

  console.log('[csrf-sync spike] API surface confirmed: csrfSynchronisedProtection, generateToken, isRequestValid, revokeToken, invalidCsrfTokenError');
});

test('csrf-sync csrfSynchronisedProtection calls next() synchronously (no await in middleware)', () => {
  const { csrfSynchronisedProtection, generateToken } = csrfSync({
    getTokenFromState: (req) => req._csrfToken ?? null,
    storeTokenInState: (req, token) => { req._csrfToken = token; },
    getTokenFromRequest: (req) => req.headers?.['x-csrf-token'] ?? null,
  });

  // Scenario: GET request (ignored method) — must call next() synchronously
  const req = { method: 'GET', _csrfToken: null, headers: {} };
  let nextCalled = false;
  csrfSynchronisedProtection(req, {}, () => { nextCalled = true; });
  assert.equal(nextCalled, true, 'next() must be called synchronously for ignored methods');

  // Scenario: POST with valid CSRF token — must call next() synchronously
  const req2 = { method: 'POST', _csrfToken: null, headers: {} };
  const token = generateToken(req2);
  req2.headers['x-csrf-token'] = token;
  let next2Called = false;
  csrfSynchronisedProtection(req2, {}, () => { next2Called = true; });
  assert.equal(next2Called, true, 'next() must be called synchronously for valid CSRF token');

  // Scenario: POST without CSRF token — must call next(error) synchronously
  const req3 = { method: 'POST', _csrfToken: 'expected-token', headers: {} };
  let next3Arg = undefined;
  csrfSynchronisedProtection(req3, {}, (arg) => { next3Arg = arg; });
  assert.ok(next3Arg instanceof Error, 'next(error) must be called for invalid CSRF token');
  assert.equal(next3Arg.status, 403, 'CSRF error must be HTTP 403');
  assert.equal(next3Arg.code, 'EBADCSRFTOKEN', 'CSRF error code must be EBADCSRFTOKEN');

  console.log('[csrf-sync spike] csrfSynchronisedProtection is fully synchronous — no await in middleware path');
});

// ---------------------------------------------------------------------------
// SEC-02 integration test — full POST-login CSRF flow (Plan 09)
// ---------------------------------------------------------------------------
//
// Wires an Express test app identically to index.js production mount order:
//   cookie-parser → public auth router (pre-gate) → gate → csrfSynchronisedProtection → protected routes
//
// The mock pool provides in-memory users and sessions so no real DB is needed.

import supertest from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { createCsrf } from '../src/csrf.js';
import { createAuthPublicRouter } from '../src/auth-router.js';
import { hashToken, generateToken, hashPassword, secureTokenEquals } from '../src/security.js';
import { extractBearerToken } from '../src/utils.js';

// -- Minimal mock pool wiring all queries needed by the SEC-02 test app --
function createSec02Pool() {
  const users = [];
  const sessions = [];
  let nextUserId = 1;
  let nextSessionId = 1;

  return {
    users,
    sessions,
    async query(sql, params) {
      const s = sql.replace(/\s+/g, ' ').trim();

      // getUserCount
      if (s.includes('COUNT(*)') && s.includes('users')) {
        return { rows: [{ count: String(users.length) }] };
      }
      // findUserByEmail
      if (s.startsWith('SELECT') && s.includes('users') && s.includes('email')) {
        const email = params[0];
        const user = users.find((u) => u.email === email) ?? null;
        return { rows: user ? [user] : [] };
      }
      // createSession INSERT
      if (s.startsWith('INSERT') && s.includes('sessions')) {
        const [userId, tokenHash, expiresAt] = params;
        const session = { id: nextSessionId++, user_id: userId, token_hash: tokenHash, expires_at: expiresAt, csrf_token: null };
        sessions.push(session);
        return { rows: [session] };
      }
      // validateSession (UPDATE ... RETURNING): called by db.js validateSession()
      // Must be checked BEFORE updateSessionCsrfToken because the RETURNING clause
      // includes csrf_token — otherwise updateSessionCsrfToken check fires first.
      if (s.includes('UPDATE') && s.includes('sessions') && s.includes('last_seen_at') && s.includes('RETURNING')) {
        const tokenHash = params[0];
        const session = sessions.find((s) => s.token_hash === tokenHash);
        return { rows: session ? [{ id: session.id, user_id: session.user_id, csrf_token: session.csrf_token, expires_at: session.expires_at ?? new Date(Date.now() + 86400000) }] : [] };
      }
      // updateSessionCsrfToken (lazy flush): UPDATE sessions SET csrf_token = $1 WHERE id = $2
      if (s.includes('csrf_token') && s.includes('UPDATE') && s.includes('sessions')) {
        const [csrfToken, sessionId] = params;
        const session = sessions.find((s) => s.id === sessionId);
        if (session) session.csrf_token = csrfToken;
        return { rows: [] };
      }
      // validateSession role join: SELECT role FROM users WHERE id = $1
      if (s.startsWith('SELECT') && s.includes('role') && s.includes('users') && s.includes('id')) {
        const userId = params[0];
        const user = users.find((u) => u.id === userId);
        return { rows: user ? [{ role: user.role }] : [] };
      }
      // revokeSession DELETE
      if (s.includes('DELETE') && s.includes('sessions')) {
        return { rows: [] };
      }
      return { rows: [] };
    },
    // validateSession called by the gate middleware
    // Returns raw DB-style object (snake_case fields) matching real db.js validateSession
    async validateSession(tokenHash) {
      const session = sessions.find((s) => s.token_hash === tokenHash) ?? null;
      if (!session) return null;
      // Simulate the role join that real validateSession does (SELECT role FROM users)
      const user = users.find((u) => u.id === session.user_id);
      return user ? { ...session, role: user.role } : null;
    },
  };
}

// -- Build the SEC-02 test app (mirrors index.js middleware order) --
//
// Mount order (per index.js production wiring):
//   cookie-parser
//   → public auth router (/api/auth pre-gate: login, claim-admin, user-count)
//   → gate (validates session cookie → req.hcSession)
//   → csrfSynchronisedProtection (reads/writes req.hcSession.csrfToken)
//   → protected routes + GET /api/auth/csrf-token (post-gate, session required)
//
// NOTE: GET /api/auth/csrf-token is intentionally placed AFTER the gate in this
// test app so that req.hcSession is populated when generateCsrfToken runs and
// storeTokenInState can persist the token. In production index.js, the same
// ordering holds: the pre-gate public router skips csrf-token (not listed there);
// the post-login call to GET /csrf-token with a valid session cookie hits the
// post-gate route where req.hcSession is available.
async function buildSec02App(pool) {
  const { csrfSynchronisedProtection, generateCsrfToken } = createCsrf({ pool });

  const DAY_MS = 24 * 60 * 60 * 1000;

  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  // 1. Public auth router — BEFORE the gate (login, claim-admin, csrf-token, user-count).
  //    GET /csrf-token in auth-router.js is session-aware: when a valid hc_session cookie
  //    is present it loads the session via validateSession() and sets req.hcSession so
  //    that storeTokenInState can persist the CSRF token (Strategy B: in-memory + lazy DB).
  app.use('/api/auth', createAuthPublicRouter({
    pool,
    SESSION_COOKIE_SECURE: false,
    SESSION_MAX_AGE_DEFAULT: 7 * DAY_MS,
    SESSION_MAX_AGE_REMEMBER: 30 * DAY_MS,
    generateCsrfToken,
  }));

  // 2. Gate — AUTH_ENABLED=true, no API_TOKEN (session-only path).
  //    csrf-token is reachable pre-gate; other /api/auth paths are exempt too.
  const PUBLIC_GATE_PATHS = new Set([
    '/api/auth/login',
    '/api/auth/claim-admin',
    '/api/auth/csrf-token',
    '/api/auth/user-count',
    '/api/health',
  ]);
  app.use(async (req, res, next) => {
    if (req.method === 'OPTIONS') return next();
    if (PUBLIC_GATE_PATHS.has(req.path)) return next();
    const rawCookie = req.cookies?.hc_session;
    if (rawCookie) {
      const session = await pool.validateSession(hashToken(rawCookie));
      if (session) {
        // Normalize snake_case DB columns to camelCase (matches index.js gate)
        req.hcSession = { ...session, csrfToken: session.csrf_token ?? null };
        return next();
      }
    }
    res.setHeader('WWW-Authenticate', 'Bearer realm="homechronicle-api"');
    return res.status(401).json({ error: 'Unauthorized' });
  });

  // 3. CSRF protection — AFTER gate so req.hcSession is populated before
  //    storeTokenInState / getTokenFromState run (Strategy B coupling)
  app.use(csrfSynchronisedProtection);

  // 4. Protected /api/events stub (simulates the events router POST endpoint)
  app.post('/api/events', (req, res) => res.json({ ok: true }));

  // 5. Global error handler — handles EBADCSRFTOKEN (SEC-02)
  app.use(function globalExpressErrorHandler(err, req, res, _next) {
    if (err.code === 'EBADCSRFTOKEN') {
      return res.status(403).json({ error: 'Invalid or missing CSRF token' });
    }
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

test('SEC-02: POST /api/events without X-CSRF-Token after login returns 403', async (t) => {
  // Seed user with argon2id password hash
  const pool = createSec02Pool();
  const passwordHash = await hashPassword('hunter2');
  pool.users.push({ id: 1, email: 'admin@example.com', password_hash: passwordHash, role: 'admin' });

  const app = await buildSec02App(pool);
  const agent = supertest.agent(app);

  // Step 1: POST /api/auth/login — pre-gate route, no X-CSRF-Token required
  const loginRes = await agent
    .post('/api/auth/login')
    .send({ email: 'admin@example.com', password: 'hunter2' });
  assert.equal(loginRes.status, 200, 'login must succeed');
  assert.ok(loginRes.headers['set-cookie'], 'hc_session cookie must be set');

  // Step 2: GET /api/auth/csrf-token — public route, returns real csrf-sync token
  const csrfRes = await agent.get('/api/auth/csrf-token');
  assert.equal(csrfRes.status, 200, 'csrf-token endpoint must succeed');
  assert.ok(typeof csrfRes.body.csrfToken === 'string', 'must return a csrfToken string');
  const csrfToken = csrfRes.body.csrfToken;

  // Step 3: POST /api/events WITHOUT X-CSRF-Token header → 403 (SEC-02)
  const noTokenRes = await agent.post('/api/events').send({ test: true });
  assert.equal(noTokenRes.status, 403, 'POST without X-CSRF-Token must be rejected with 403');
  assert.equal(noTokenRes.body.error, 'Invalid or missing CSRF token');

  // Step 4: POST /api/events WITH correct X-CSRF-Token header → 200
  const withTokenRes = await agent
    .post('/api/events')
    .set('X-CSRF-Token', csrfToken)
    .send({ test: true });
  assert.equal(withTokenRes.status, 200, 'POST with valid X-CSRF-Token must succeed');
  assert.deepEqual(withTokenRes.body, { ok: true });
});
