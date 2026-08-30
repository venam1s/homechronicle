import test from 'node:test';
import assert from 'node:assert/strict';
import { withTimeout } from '../src/utils.js';

test('resolves with the inner value when the promise settles first', async () => {
  const result = await withTimeout(Promise.resolve('ok'), 20, null, 'fast-op');
  assert.equal(result, 'ok');
});

test('does not fire onTimeout on the success path', async () => {
  let onTimeoutCalled = false;
  const p = new Promise((resolve) => setTimeout(() => resolve('done'), 5));
  const result = await withTimeout(p, 25, () => { onTimeoutCalled = true; }, 'quick-op');
  assert.equal(result, 'done');
  // Give the timer a moment in case it fired erroneously.
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(onTimeoutCalled, false);
});

test('rejects with a labeled ETIMEDOUT error when the deadline wins', async () => {
  const neverSettles = new Promise(() => {});
  await assert.rejects(
    () => withTimeout(neverSettles, 10, null, 'slow-op'),
    (err) => {
      assert.equal(err.code, 'ETIMEDOUT');
      assert.match(err.message, /slow-op/);
      assert.match(err.message, /timed out after 10ms/);
      return true;
    }
  );
});

test('invokes onTimeout exactly once on expiry', async () => {
  let calls = 0;
  const neverSettles = new Promise(() => {});
  await assert.rejects(() => withTimeout(neverSettles, 10, () => { calls += 1; }, 'op'));
  assert.equal(calls, 1);
});

test('an onTimeout that throws is swallowed and the timeout rejection still surfaces', async () => {
  const neverSettles = new Promise(() => {});
  await assert.rejects(
    () => withTimeout(neverSettles, 10, () => { throw new Error('cleanup exploded'); }, 'op'),
    (err) => {
      assert.equal(err.code, 'ETIMEDOUT');
      return true;
    }
  );
});

test('a non-finite ms returns the promise unbounded (opt-out)', async () => {
  const result = await withTimeout(Promise.resolve('unbounded'), NaN, null, 'op');
  assert.equal(result, 'unbounded');
});

test('a non-positive ms returns the promise unbounded (opt-out)', async () => {
  const result = await withTimeout(Promise.resolve('unbounded'), 0, null, 'op');
  assert.equal(result, 'unbounded');
  const result2 = await withTimeout(Promise.resolve('still unbounded'), -5, null, 'op');
  assert.equal(result2, 'still unbounded');
});

test('clears the underlying timer on the success path (no dangling handle)', async () => {
  // Indirect check: resolving quickly with a longer timeout must not leave
  // the process waiting on the timer. We can't directly inspect the timer,
  // but we can confirm onTimeout never fires well past the timeout window.
  let onTimeoutCalled = false;
  await withTimeout(Promise.resolve('ok'), 15, () => { onTimeoutCalled = true; }, 'op');
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(onTimeoutCalled, false);
});
