/*
 * csrf.test.js — csrf-sync async-hook spike + SEC-02 rejection test scaffold
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
 * TODO(Plan 08): full SEC-02 rejection test
 * ============================================================
 * Once auth-router + gate + csrf-sync middleware are wired in Plan 08, add a
 * full integration test here that asserts:
 *   1. POST /api/auth/login (no X-CSRF-Token required — pre-gate route) → 200 + cookie
 *   2. GET /api/auth/csrf-token (no X-CSRF-Token required — public) → { csrfToken: <token> }
 *   3. POST /api/events WITHOUT X-CSRF-Token header → 403 (EBADCSRFTOKEN)
 *   4. POST /api/events WITH correct X-CSRF-Token header → 200 (or 401 if no session)
 * This test requires: fake pool, auth-router, csrf-sync middleware, gate middleware,
 * and an Express test app wired identically to the production index.js setup.
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
