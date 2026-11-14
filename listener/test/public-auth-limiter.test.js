/**
 * public-auth-limiter.test.js — rate limiting on the pre-gate auth GETs.
 *
 * /csrf-token, /user-count, /config and /invite-status are listed in
 * PUBLIC_AUTH_PATHS, so they answer with no session and no API token. Three of
 * the four touch the database, which left an anonymous caller able to drive
 * unbounded DB work. These tests pin that a limiter is attached, and — just as
 * importantly — that it is NOT the 10-per-15-minutes authLimiter, which the SPA
 * would trip on normal use (it fetches /csrf-token on every load, every new tab
 * and every post-403 refresh).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthPublicRouter } from '../src/auth-router.js';

const PUBLIC_GETS = ['/csrf-token', '/user-count', '/config', '/invite-status'];

function makeRouter() {
  return createAuthPublicRouter({
    pool: { async query() { return { rows: [] }; } },
    SESSION_COOKIE_SECURE: false,
    SESSION_MAX_AGE_DEFAULT: 1000,
    SESSION_MAX_AGE_REMEMBER: 2000,
    generateCsrfToken: () => 'token',
  });
}

function layerFor(router, method, path) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (layer.route.path !== path) continue;
    if (!layer.route.methods[method.toLowerCase()]) continue;
    return layer.route;
  }
  throw new Error(`Route not found: ${method} ${path}`);
}

for (const path of PUBLIC_GETS) {
  test(`GET ${path} — has a rate limiter in front of the handler`, () => {
    const route = layerFor(makeRouter(), 'GET', path);
    assert.ok(
      route.stack.length >= 2,
      `${path} must have at least one middleware before its handler (the limiter)`,
    );
  });
}

/** Minimal res double. `send` matters: express-rate-limit calls it when blocking. */
function makeRes() {
  return {
    statusCode: 200,
    writableEnded: false,
    setHeader() { return this; },
    getHeader() { return undefined; },
    status(code) { this.statusCode = code; return this; },
    json() { return this; },
    send() { this.writableEnded = true; return this; },
    end() { this.writableEnded = true; return this; },
  };
}

/** Drive `limiter` n times from one IP; resolve how many calls reached next(). */
async function countAllowed(limiter, n) {
  let allowed = 0;
  for (let i = 0; i < n; i += 1) {
    const req = {
      ip: '203.0.113.9', query: {}, params: {}, body: {}, headers: {},
      get: () => undefined, app: { get: () => undefined },
    };
    const res = makeRes();
    // eslint-disable-next-line no-await-in-loop
    if (await new Promise((resolve) => {
      limiter(req, res, () => resolve(true));
      setImmediate(() => resolve(false));
    })) allowed += 1;
  }
  return allowed;
}

test('the public read limiter is far more generous than authLimiter', async () => {
  // authLimiter's ceiling is 10 per 15 minutes. If it were reused on these
  // routes the SPA would lock itself out of the login page, because it fetches
  // /csrf-token on every load, every new tab and every post-403 refresh. So 30
  // consecutive requests from one IP must all pass.
  const route = layerFor(makeRouter(), 'GET', '/config');
  const allowed = await countAllowed(route.stack[0].handle, 30);

  assert.equal(allowed, 30, `expected all 30 requests to pass, got ${allowed}`);
});

test('each public route has its own counter, so one cannot starve /csrf-token', async () => {
  // A shared limiter instance would let a caller hammering /user-count exhaust
  // the budget /csrf-token needs — and a 429 there means no login and no writes,
  // because AuthGate fetches it on load and api.js re-fetches it on every
  // post-403 retry. Draining one route must leave the other untouched.
  const router = makeRouter();
  const userCount = layerFor(router, 'GET', '/user-count').stack[0].handle;
  const csrf = layerFor(router, 'GET', '/csrf-token').stack[0].handle;

  // Drain /user-count well past its own ceiling.
  await countAllowed(userCount, 200);

  assert.equal(
    await countAllowed(csrf, 5), 5,
    '/csrf-token must still answer after /user-count was drained',
  );
});

test('the limiter driver actually observes blocking (guards the tests above)', async () => {
  // Proves the assertion above is not vacuous: the same driver against a
  // max:10 limiter must see exactly 10 allowed, so a regression that swapped in
  // authLimiter would be caught rather than silently passing.
  const { default: rateLimit } = await import('express-rate-limit');
  const { rateLimitKeyGenerator } = await import('../src/security.js');
  const tight = rateLimit({
    windowMs: 15 * 60 * 1000, max: 10, validate: false, keyGenerator: rateLimitKeyGenerator,
  });

  assert.equal(await countAllowed(tight, 30), 10);
});
