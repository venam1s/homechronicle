/**
 * query-cache.test.js — unit tests for the in-memory TTL cache.
 *
 * Covers: fresh hit, stale-while-revalidate, cold miss, in-flight dedup (M-4),
 * and negative caching (M-4).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// Import as a namespace so we can re-import a fresh module per test group via
// dynamic import (Node test runner shares module cache). We use a single import
// here and rely on invalidate() to reset state between tests.
import { cached, invalidate } from '../src/query-cache.js';

// -- Helpers --

/** Returns a queryFn that resolves with `value` after `delayMs`. */
function makeQueryFn(value, { delayMs = 0, shouldReject = false } = {}) {
  let callCount = 0;
  const fn = async () => {
    callCount += 1;
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    if (shouldReject) throw new Error(`queryFn error: ${value}`);
    return value;
  };
  Object.defineProperty(fn, 'callCount', { get: () => callCount });
  return fn;
}

const TTL = 1_000; // 1 s — long enough that tests don't race against expiry

// -- Tests --

test('cached() returns the result on a cold miss', async () => {
  invalidate('test:cold-miss');
  const fn = makeQueryFn('hello');
  const result = await cached('test:cold-miss', fn, TTL);
  assert.equal(result, 'hello');
  assert.equal(fn.callCount, 1);
});

test('cached() returns the cached value without calling queryFn again (fresh hit)', async () => {
  invalidate('test:fresh-hit');
  const fn = makeQueryFn('cached-value');
  await cached('test:fresh-hit', fn, TTL);
  const result = await cached('test:fresh-hit', fn, TTL);
  assert.equal(result, 'cached-value');
  assert.equal(fn.callCount, 1, 'queryFn must be called only once on a fresh hit');
});

test('invalidate() removes a specific key, forcing next call to re-query', async () => {
  invalidate('test:invalidate');
  const fn = makeQueryFn('v1');
  await cached('test:invalidate', fn, TTL);
  invalidate('test:invalidate');
  await cached('test:invalidate', fn, TTL);
  assert.equal(fn.callCount, 2, 'queryFn must be called again after invalidation');
});

// -- In-flight dedup (M-4) --

test('concurrent cold-miss callers share one queryFn() invocation (M-4 in-flight dedup)', async () => {
  invalidate('test:inflight');
  const fn = makeQueryFn('shared', { delayMs: 20 });

  // Fire two concurrent calls before the first resolves
  const [r1, r2] = await Promise.all([
    cached('test:inflight', fn, TTL),
    cached('test:inflight', fn, TTL),
  ]);

  assert.equal(r1, 'shared');
  assert.equal(r2, 'shared');
  assert.equal(fn.callCount, 1, 'queryFn must be invoked exactly once for concurrent cold misses');
});

test('in-flight dedup does not prevent a new query after the first resolves', async () => {
  invalidate('test:inflight-seq');
  const fn = makeQueryFn('seq', { delayMs: 5 });

  // Serial calls after resolution: second should still hit the cache, not re-invoke
  await cached('test:inflight-seq', fn, TTL);
  await cached('test:inflight-seq', fn, TTL);
  assert.equal(fn.callCount, 1, 'second serial call must hit the cache, not re-invoke queryFn');
});

// -- Negative caching (M-4) --

test('when queryFn() rejects, immediate retries reject without re-invoking queryFn (M-4 negative cache)', async () => {
  invalidate('test:negative');
  const fn = makeQueryFn('err', { shouldReject: true });

  // First call must reject
  await assert.rejects(() => cached('test:negative', fn, TTL), /queryFn error/);
  assert.equal(fn.callCount, 1);

  // Immediate second call must also reject WITHOUT calling queryFn again
  await assert.rejects(() => cached('test:negative', fn, TTL), /queryFn error/);
  assert.equal(fn.callCount, 1, 'queryFn must NOT be called again within the negative-cache window');
});

test('concurrent callers on a failing queryFn share one invocation (M-4 dedup + negative cache)', async () => {
  invalidate('test:negative-concurrent');
  const fn = makeQueryFn('concurrent-err', { shouldReject: true, delayMs: 20 });

  const results = await Promise.allSettled([
    cached('test:negative-concurrent', fn, TTL),
    cached('test:negative-concurrent', fn, TTL),
  ]);

  assert.equal(results[0].status, 'rejected');
  assert.equal(results[1].status, 'rejected');
  assert.equal(fn.callCount, 1, 'failing queryFn must be invoked only once across concurrent callers');
});
