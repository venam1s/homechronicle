/**
 * gate.test.js — integration tests for the async token-OR-session-OR-public gate
 * wired into listener/src/index.js (Plan 20-09, Task 2).
 *
 * Tests cover:
 *   AUTH_ENABLED=false — legacy v1.3 API_TOKEN-only behavior preserved verbatim
 *   AUTH_ENABLED=true  — session + token + public path logic (D-01, D-02, D-03, D-08)
 *
 * The gate is extracted into a helper `makeGate()` so the integration test app can
 * mount it without requiring the full index.js boot sequence.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import supertest from 'supertest';
import { hashToken, generateToken, secureTokenEquals } from '../src/security.js';
import { extractBearerToken } from '../src/utils.js';
// The REAL list, not a copy: these files each kept their own and both had
// drifted from index.js (missing /api/auth/config and /api/auth/invite-status).
import { PUBLIC_AUTH_PATHS } from '../src/public-paths.js';
import { readFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Gate factory — mirrors the gate in index.js exactly.
// Keep in sync with index.js when the gate implementation changes.
// ---------------------------------------------------------------------------


/**
 * Build the async session gate middleware.
 *
 * @param {object} opts
 * @param {boolean} opts.AUTH_ENABLED
 * @param {string}  opts.API_TOKEN         — empty string if not set
 * @param {boolean} opts.API_TOKEN_READS_ENABLED
 * @param {import('pg').Pool} opts.pool    — mock pool with validateSession stub
 */
function makeGate({ AUTH_ENABLED, API_TOKEN, API_TOKEN_READS_ENABLED = false, pool }) {
  return async function gate(req, res, next) {
    if (!AUTH_ENABLED) {
      // Legacy v1.3 behavior — verbatim (D-08)
      if (!API_TOKEN) return next();
      if (req.method === 'OPTIONS') return next();
      const isReadMethod = req.method === 'GET' || req.method === 'HEAD';
      if (isReadMethod && !API_TOKEN_READS_ENABLED) return next();
      const providedToken = String(
        req.get('x-api-token') ?? extractBearerToken(req.get('authorization'))
      ).trim();
      if (secureTokenEquals(API_TOKEN, providedToken)) return next();
      res.setHeader('WWW-Authenticate', 'Bearer realm="homechronicle-api"');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // AUTH_ENABLED=true path
    if (req.method === 'OPTIONS') return next();
    if (PUBLIC_AUTH_PATHS.has(req.path)) return next();

    // Session cookie FIRST (D-01/D-03/CR-02): browser sessions win even when nginx
    // unconditionally injects X-API-Token. SHA-256 hash before validateSession (D-12).
    const rawCookie = req.cookies?.hc_session;
    if (rawCookie) {
      const session = await pool.validateSession(hashToken(rawCookie));
      if (session) {
        // Normalize snake_case → camelCase (mirrors index.js gate)
        req.hcSession = { ...session, csrfToken: session.csrf_token ?? null };
        return next();
      }
    }

    // Service-token fallback: API_TOKEN still authorizes alongside sessions (AUTH-08/P11)
    if (API_TOKEN) {
      const providedToken = String(
        req.get('x-api-token') ?? extractBearerToken(req.get('authorization'))
      ).trim();
      if (secureTokenEquals(API_TOKEN, providedToken)) return next();
    }

    res.setHeader('WWW-Authenticate', 'Bearer realm="homechronicle-api"');
    return res.status(401).json({ error: 'Unauthorized' });
  };
}

// ---------------------------------------------------------------------------
// Test app builder
// ---------------------------------------------------------------------------

/**
 * Build a minimal express app that mounts the gate, then a protected /api/data
 * route and public /api/auth/csrf-token route.
 */
function buildApp({ AUTH_ENABLED, API_TOKEN = '', API_TOKEN_READS_ENABLED = false, pool }) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  // Simulate public auth router (pre-gate)
  app.get('/api/auth/csrf-token', (_req, res) => res.json({ csrfToken: 'test-token' }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  // The gate
  app.use(makeGate({ AUTH_ENABLED, API_TOKEN, API_TOKEN_READS_ENABLED, pool }));

  // Protected route
  app.get('/api/data', (req, res) => {
    res.json({ ok: true, hcSession: req.hcSession ?? null });
  });
  app.post('/api/data', (req, res) => {
    res.json({ ok: true });
  });

  return app;
}

// ---------------------------------------------------------------------------
// Mock pool
// ---------------------------------------------------------------------------

function createMockPool({ sessions = [] } = {}) {
  return {
    sessions,
    async validateSession(tokenHash) {
      return sessions.find((s) => s.token_hash === tokenHash) ?? null;
    },
  };
}

// ---------------------------------------------------------------------------
// Tests: AUTH_ENABLED=false (legacy v1.3 behavior — D-08)
// ---------------------------------------------------------------------------

test('gate AUTH_ENABLED=false: no API_TOKEN — all requests pass through', async () => {
  const pool = createMockPool();
  const app = buildApp({ AUTH_ENABLED: false, API_TOKEN: '', pool });
  const res = await supertest(app).get('/api/data');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true, hcSession: null });
});

test('gate AUTH_ENABLED=false: with API_TOKEN — GET without token passes (reads not enforced by default)', async () => {
  const pool = createMockPool();
  const app = buildApp({ AUTH_ENABLED: false, API_TOKEN: 'secret', API_TOKEN_READS_ENABLED: false, pool });
  const res = await supertest(app).get('/api/data');
  assert.equal(res.status, 200);
});

test('gate AUTH_ENABLED=false: with API_TOKEN + API_TOKEN_READS_ENABLED — GET without token returns 401', async () => {
  const pool = createMockPool();
  const app = buildApp({ AUTH_ENABLED: false, API_TOKEN: 'secret', API_TOKEN_READS_ENABLED: true, pool });
  const res = await supertest(app).get('/api/data');
  assert.equal(res.status, 401);
});

test('gate AUTH_ENABLED=false: with API_TOKEN — POST with wrong token returns 401', async () => {
  const pool = createMockPool();
  const app = buildApp({ AUTH_ENABLED: false, API_TOKEN: 'secret', pool });
  const res = await supertest(app).post('/api/data').set('x-api-token', 'wrong');
  assert.equal(res.status, 401);
});

test('gate AUTH_ENABLED=false: with API_TOKEN — POST with correct x-api-token passes', async () => {
  const pool = createMockPool();
  const app = buildApp({ AUTH_ENABLED: false, API_TOKEN: 'secret', pool });
  const res = await supertest(app).post('/api/data').set('x-api-token', 'secret');
  assert.equal(res.status, 200);
});

test('gate AUTH_ENABLED=false: with API_TOKEN — POST with correct Bearer token passes', async () => {
  const pool = createMockPool();
  const app = buildApp({ AUTH_ENABLED: false, API_TOKEN: 'secret', pool });
  const res = await supertest(app).post('/api/data').set('Authorization', 'Bearer secret');
  assert.equal(res.status, 200);
});

test('gate AUTH_ENABLED=false: OPTIONS always passes', async () => {
  const pool = createMockPool();
  const app = buildApp({ AUTH_ENABLED: false, API_TOKEN: 'secret', pool });
  const res = await supertest(app).options('/api/data');
  // OPTIONS returns 404 from express (no route) but gate passes it through
  assert.notEqual(res.status, 401);
});

// ---------------------------------------------------------------------------
// Tests: AUTH_ENABLED=true
// ---------------------------------------------------------------------------

test('gate AUTH_ENABLED=true: public path /api/auth/csrf-token passes without session', async () => {
  const pool = createMockPool();
  const app = buildApp({ AUTH_ENABLED: true, pool });
  const res = await supertest(app).get('/api/auth/csrf-token');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { csrfToken: 'test-token' });
});

test('gate AUTH_ENABLED=true: public path /api/health passes without session', async () => {
  const pool = createMockPool();
  const app = buildApp({ AUTH_ENABLED: true, pool });
  const res = await supertest(app).get('/api/health');
  assert.equal(res.status, 200);
});

test('gate AUTH_ENABLED=true: protected GET without session or token returns 401', async () => {
  const pool = createMockPool();
  const app = buildApp({ AUTH_ENABLED: true, pool });
  const res = await supertest(app).get('/api/data');
  assert.equal(res.status, 401);
  assert.equal(res.headers['www-authenticate'], 'Bearer realm="homechronicle-api"');
});

test('gate AUTH_ENABLED=true: protected POST without session or token returns 401', async () => {
  const pool = createMockPool();
  const app = buildApp({ AUTH_ENABLED: true, pool });
  const res = await supertest(app).post('/api/data').send({});
  assert.equal(res.status, 401);
});

test('gate AUTH_ENABLED=true: valid API_TOKEN in x-api-token header passes (AUTH-08)', async () => {
  const pool = createMockPool();
  const app = buildApp({ AUTH_ENABLED: true, API_TOKEN: 'svc-token', pool });
  const res = await supertest(app).get('/api/data').set('x-api-token', 'svc-token');
  assert.equal(res.status, 200);
});

test('gate AUTH_ENABLED=true: valid API_TOKEN in Authorization Bearer header passes (AUTH-08)', async () => {
  const pool = createMockPool();
  const app = buildApp({ AUTH_ENABLED: true, API_TOKEN: 'svc-token', pool });
  const res = await supertest(app).get('/api/data').set('Authorization', 'Bearer svc-token');
  assert.equal(res.status, 200);
});

test('gate AUTH_ENABLED=true: wrong API_TOKEN does NOT fall through to session (returns 401)', async () => {
  // When API_TOKEN is set but token is wrong, session is not tried
  // because the cookie is also absent — result is 401
  const pool = createMockPool();
  const app = buildApp({ AUTH_ENABLED: true, API_TOKEN: 'svc-token', pool });
  const res = await supertest(app).get('/api/data').set('x-api-token', 'wrong');
  assert.equal(res.status, 401);
});

test('gate AUTH_ENABLED=true: valid session cookie passes and populates req.hcSession', async () => {
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const session = { id: 1, user_id: 42, role: 'admin', csrf_token: null, token_hash: tokenHash };
  const pool = createMockPool({ sessions: [session] });
  const app = buildApp({ AUTH_ENABLED: true, pool });

  const res = await supertest(app)
    .get('/api/data')
    .set('Cookie', `hc_session=${rawToken}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.hcSession.id, 1);
  assert.equal(res.body.hcSession.user_id, 42);
  assert.equal(res.body.hcSession.role, 'admin');
});

test('gate AUTH_ENABLED=true: expired/invalid session cookie returns 401', async () => {
  const pool = createMockPool({ sessions: [] }); // no valid sessions
  const app = buildApp({ AUTH_ENABLED: true, pool });

  const res = await supertest(app)
    .get('/api/data')
    .set('Cookie', 'hc_session=bogus-raw-token');

  assert.equal(res.status, 401);
});

test('gate AUTH_ENABLED=true: no API_TOKEN set — session still authorizes (D-03)', async () => {
  // When API_TOKEN is empty, session cookie is the only auth path
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const session = { id: 2, user_id: 7, role: 'user', csrf_token: null, token_hash: tokenHash };
  const pool = createMockPool({ sessions: [session] });
  const app = buildApp({ AUTH_ENABLED: true, API_TOKEN: '', pool });

  const res = await supertest(app)
    .get('/api/data')
    .set('Cookie', `hc_session=${rawToken}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.hcSession.user_id, 7);
});

test('gate AUTH_ENABLED=true: OPTIONS passes without session', async () => {
  const pool = createMockPool();
  const app = buildApp({ AUTH_ENABLED: true, pool });
  const res = await supertest(app).options('/api/data');
  assert.notEqual(res.status, 401);
});

// ---------------------------------------------------------------------------
// Tests: CR-02 session-first ordering regression (Plan 20-11)
// ---------------------------------------------------------------------------

test('gate AUTH_ENABLED=true: session wins over X-API-Token when BOTH present (CR-02)', async () => {
  // CR-02: In Docker topology, nginx injects X-API-Token unconditionally.
  // With session-first ordering, a valid hc_session cookie must populate
  // req.hcSession even when X-API-Token header is also present.
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const session = {
    id: 99,
    user_id: 777,
    role: 'admin',
    csrf_token: 'tok-abc',
    token_hash: tokenHash,
  };
  const pool = createMockPool({ sessions: [session] });
  const app = buildApp({ AUTH_ENABLED: true, API_TOKEN: 'svc-token', pool });

  const res = await supertest(app)
    .get('/api/data')
    .set('Cookie', `hc_session=${rawToken}`)
    .set('x-api-token', 'svc-token'); // nginx injection — session must still win

  assert.equal(res.status, 200);
  // Session-first: req.hcSession must be populated from the cookie, not the token path
  // (the token path never sets req.hcSession; only validateSession does)
  assert.ok(res.body.hcSession, 'req.hcSession must be populated from the session cookie');
  assert.equal(res.body.hcSession.user_id, 777, 'user_id must come from the session row');
  assert.equal(res.body.hcSession.id, 99, 'session.id must match the DB session');
});

test('gate AUTH_ENABLED=true: API_TOKEN fallback — valid token no session → authorized, no hcSession (AUTH-08)', async () => {
  // AUTH-08: API_TOKEN must still authorize when no valid session cookie exists.
  // Token fallback must NOT populate req.hcSession (only session path does).
  const pool = createMockPool({ sessions: [] }); // no valid sessions
  const app = buildApp({ AUTH_ENABLED: true, API_TOKEN: 'svc-token', pool });

  const res = await supertest(app)
    .get('/api/data')
    .set('x-api-token', 'svc-token');

  assert.equal(res.status, 200, 'valid API_TOKEN must authorize (AUTH-08 not weakened)');
  assert.equal(res.body.hcSession, null, 'req.hcSession must NOT be set via token-only path');
});

// ---------------------------------------------------------------------------
// The public path list itself
// ---------------------------------------------------------------------------

test('the update check is reachable without a session', async () => {
  // Requested deliberately: the endpoint reports gitlab.com's published
  // release tags, which are public information and say nothing about this
  // instance. It answers from a 12h cache, so anonymous traffic hits memory
  // rather than making the box issue outbound requests on demand.
  assert.ok(PUBLIC_AUTH_PATHS.has('/api/updates/latest'));

  const pool = createMockPool();
  const app = buildApp({ AUTH_ENABLED: true, API_TOKEN: 'secret', pool });
  app.get('/api/updates/latest', (_req, res) => res.json({ enabled: true, releases: [] }));

  const res = await supertest(app).get('/api/updates/latest');
  assert.equal(res.status, 200, 'anonymous GET should pass the gate');
});

test('making it public did not open anything else', async () => {
  // Exact match only — no prefix or wildcard behaviour that could expose a
  // sibling route.
  assert.equal(PUBLIC_AUTH_PATHS.has('/api/updates'), false);

  const pool = createMockPool();
  const app = buildApp({ AUTH_ENABLED: true, API_TOKEN: 'secret', pool });
  for (const path of ['/api/data', '/api/updates']) {
    // eslint-disable-next-line no-await-in-loop
    const res = await supertest(app).get(path);
    assert.equal(res.status, 401, `${path} must still require auth`);
  }
});

test('index.js uses the shared list rather than an inline copy', () => {
  // The copies in this file and auth-gate-empty-token.test.js had ALREADY
  // drifted from index.js, both missing /api/auth/config and
  // /api/auth/invite-status. One list, imported everywhere.
  const src = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.ok(
    !/const PUBLIC_AUTH_PATHS\s*=\s*new Set\(/.test(src),
    'index.js must import PUBLIC_AUTH_PATHS, not redeclare it',
  );
  assert.ok(src.includes("from './public-paths.js'"));
});
