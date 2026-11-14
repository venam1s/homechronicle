/**
 * updates-router-dedup.test.js — cold-cache stampede and release-URL scheme.
 *
 * /api/updates/latest is in PUBLIC_AUTH_PATHS. The stated reason it is safe to
 * expose anonymously is that "the listener answers from a 12-hour cache, so
 * anonymous traffic hits memory, not the network" — but the cache was only
 * assigned after every host settled, so N concurrent requests on a cold cache
 * each fired their own pair of upstream GETs. One shared in-flight promise makes
 * a cold check exactly one call per host.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpdatesRouter, normalizeRelease } from '../src/updates-router.js';

function getRouteHandler(router, method, path) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (layer.route.path !== path) continue;
    if (!layer.route.methods[method.toLowerCase()]) continue;
    return layer.route.stack.at(-1).handle;
  }
  throw new Error(`Route not found: ${method} ${path}`);
}

function invoke(handler) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      setHeader() { return this; },
      status(code) { this.statusCode = code; return this; },
      json(payload) { resolve({ statusCode: this.statusCode, body: payload }); return this; },
    };
    handler({ query: {}, params: {}, body: {} }, res);
  });
}

test('concurrent cold-cache requests make exactly one upstream call per host', async () => {
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });

  const fetchImpl = async () => {
    calls += 1;
    await gate; // hold every fetch open so all requests overlap
    return { ok: true, json: async () => [{ tag_name: 'v9.9.9', html_url: 'https://example.com/r' }] };
  };

  const router = createUpdatesRouter({ fetchImpl });
  const handler = getRouteHandler(router, 'GET', '/latest');

  // 10 simultaneous anonymous requests against a cold cache.
  const inFlight = Array.from({ length: 10 }, () => invoke(handler));
  await new Promise((r) => setImmediate(r));
  release();
  const results = await Promise.all(inFlight);

  // Two configured hosts (GitHub + GitLab) => 2 calls total, not 20.
  assert.equal(calls, 2, `expected 1 call per host, got ${calls}`);
  for (const { statusCode, body } of results) {
    assert.equal(statusCode, 200);
    assert.equal(body.releases.length, 1, 'every caller still gets the full answer');
  }
});

test('a later request is served from cache without any new upstream call', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: true, json: async () => [{ tag_name: 'v1.0.0', html_url: 'https://example.com/r' }] };
  };
  const handler = getRouteHandler(createUpdatesRouter({ fetchImpl }), 'GET', '/latest');

  await invoke(handler);
  const afterFirst = calls;
  await invoke(handler);

  assert.equal(calls, afterFirst, 'the second request must not reach the network');
});

test('an unreachable upstream still answers 200 with upstreamOk false', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error('offline'); };
  const handler = getRouteHandler(createUpdatesRouter({ fetchImpl }), 'GET', '/latest');

  const first = await invoke(handler);
  assert.equal(first.statusCode, 200, 'an offline box must not see an error over this');
  assert.equal(first.body.upstreamOk, false);
  assert.deepEqual(first.body.releases, []);
  assert.ok(calls >= 2, 'both hosts were attempted');
});

// -- release URL scheme (the UI renders this as an href) --

test('normalizeRelease keeps https release URLs', () => {
  const out = normalizeRelease({ tag_name: 'v1.2.3', html_url: 'https://github.com/x/y/releases/tag/v1.2.3' });
  assert.equal(out.url, 'https://github.com/x/y/releases/tag/v1.2.3');
});

test('normalizeRelease drops a non-https release URL rather than handing it to the UI', () => {
  for (const bad of ['javascript:alert(1)', 'http://example.com/r', 'data:text/html,x', 'not-a-url', 42]) {
    const out = normalizeRelease({ tag_name: 'v1.2.3', html_url: bad });
    assert.equal(out.url, null, `${String(bad)} must not survive as an href`);
    assert.equal(out.tag, 'v1.2.3', 'the release itself is still reported');
  }
});
