/**
 * auth-gate-empty-token.test.js — SEC-07 cutover guard (Phase 23, Plan 01).
 *
 * Proves the nginx X-API-Token cutover does NOT open an auth bypass: when nginx
 * stops injecting the token (AUTH_ENABLED=true), an unauthenticated request with
 * no session cookie and an empty/absent x-api-token header MUST still be rejected
 * with 401. The empty-token branch short-circuits via secureTokenEquals(API_TOKEN, "")
 * → false → 401 (the highest-priority assertion below: T-23-BYPASS).
 *
 * COMPOSITION-TEST-GAP NOTE: the live gate is inline app.use middleware in
 * index.js (index.js exports NOTHING), so this test re-implements it via
 * makeGate(), copied byte-identically from listener/test/gate.test.js. makeGate()
 * MUST stay byte-identical to the inline gate in index.js — a re-implemented gate
 * can silently drift. The live composed path is additionally covered by Plan 03's
 * browser human-verify (no login → 401).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import supertest from 'supertest';
import { hashToken, generateToken, secureTokenEquals } from '../src/security.js';
import { extractBearerToken } from '../src/utils.js';

const PUBLIC_AUTH_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/claim-admin',
  '/api/auth/csrf-token',
  '/api/auth/user-count',
  '/api/health',
]);

// Gate factory — byte-identical to index.js / gate.test.js. Keep in sync.
function makeGate({ AUTH_ENABLED, API_TOKEN, API_TOKEN_READS_ENABLED = false, pool }) {
  return async function gate(req, res, next) {
    if (!AUTH_ENABLED) {
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

    if (req.method === 'OPTIONS') return next();
    if (PUBLIC_AUTH_PATHS.has(req.path)) return next();

    const rawCookie = req.cookies?.hc_session;
    if (rawCookie) {
      const session = await pool.validateSession(hashToken(rawCookie));
      if (session) {
        req.hcSession = { ...session, csrfToken: session.csrf_token ?? null };
        return next();
      }
    }

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

function buildApp({ AUTH_ENABLED, API_TOKEN = '', API_TOKEN_READS_ENABLED = false, pool }) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.use(makeGate({ AUTH_ENABLED, API_TOKEN, API_TOKEN_READS_ENABLED, pool }));
  app.get('/api/data', (req, res) => res.json({ ok: true, hcSession: req.hcSession ?? null }));
  return app;
}

function createMockPool({ sessions = [] } = {}) {
  return {
    sessions,
    async validateSession(tokenHash) {
      return sessions.find((s) => s.token_hash === tokenHash) ?? null;
    },
  };
}

// ---------------------------------------------------------------------------
// Three SEC-07 cutover scenarios (AUTH_ENABLED=true, nginx no longer injects token)
// ---------------------------------------------------------------------------

// (a) valid session cookie + empty/absent x-api-token → authorized
test('SEC-07: valid session cookie + empty x-api-token → 200 (session is sole browser auth path)', async () => {
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const session = { id: 5, user_id: 11, role: 'member', csrf_token: null, token_hash: tokenHash };
  const pool = createMockPool({ sessions: [session] });
  const app = buildApp({ AUTH_ENABLED: true, API_TOKEN: '', pool });

  const res = await supertest(app)
    .get('/api/data')
    .set('Cookie', `hc_session=${rawToken}`)
    .set('x-api-token', ''); // nginx injects empty value when auth on

  assert.equal(res.status, 200);
  assert.equal(res.body.hcSession.user_id, 11);
});

// (b) HIGHEST PRIORITY — no session + no token → 401 (the cutover must not bypass auth)
test('SEC-07 (T-23-BYPASS): no session cookie + no token → 401 (cutover does not bypass auth)', async () => {
  const pool = createMockPool();
  const app = buildApp({ AUTH_ENABLED: true, API_TOKEN: 'svc-token', pool });

  const res = await supertest(app).get('/api/data'); // no cookie, no x-api-token

  assert.equal(res.status, 401);
  assert.equal(res.headers['www-authenticate'], 'Bearer realm="homechronicle-api"');
});

// (b') empty x-api-token + no session → 401 (empty-token short-circuit, not a bypass)
test('SEC-07 (T-23-BYPASS): empty x-api-token + no session → 401 (secureTokenEquals short-circuits)', async () => {
  const pool = createMockPool();
  const app = buildApp({ AUTH_ENABLED: true, API_TOKEN: 'svc-token', pool });

  const res = await supertest(app).get('/api/data').set('x-api-token', '');

  assert.equal(res.status, 401);
});

// (c) no session + valid API_TOKEN → authorized (service-token path intact)
test('SEC-07: no session + valid API_TOKEN via x-api-token → 200 (service token path intact)', async () => {
  const pool = createMockPool();
  const app = buildApp({ AUTH_ENABLED: true, API_TOKEN: 'svc-token', pool });

  const res = await supertest(app).get('/api/data').set('x-api-token', 'svc-token');

  assert.equal(res.status, 200);
  assert.equal(res.body.hcSession, null);
});
