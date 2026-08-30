// Regression coverage for src/shutdown.js's createGracefulShutdown().
//
// This exercises the REAL module (not a re-implementation) — test/error-
// handlers.test.js re-implementing its handlers locally is exactly the
// pattern that let a keystone bug ship invisibly (Phase 23 SEC-07), so this
// file imports and drives the actual createGracefulShutdown().

import test from 'node:test';
import assert from 'node:assert/strict';
import { createGracefulShutdown, SHUTDOWN_DEADLINE_MS } from '../src/shutdown.js';

test('SHUTDOWN_DEADLINE_MS is exported and is 8000', () => {
  assert.equal(SHUTDOWN_DEADLINE_MS, 8_000);
});

test('runs steps in declaration order', async () => {
  const order = [];
  const exitCalls = [];
  const { shutdown } = createGracefulShutdown({
    steps: [
      { name: 'first', run: async () => { order.push('first'); } },
      { name: 'second', run: () => { order.push('second'); } },
      { name: 'third', run: async () => { order.push('third'); } },
    ],
    deadlineMs: 1_000,
    exit: (code) => exitCalls.push(code),
  });

  await shutdown('SIGTERM');

  assert.deepEqual(order, ['first', 'second', 'third']);
});

test('a step that throws is logged and the remaining steps still run', async () => {
  const order = [];
  const exitCalls = [];
  const { shutdown } = createGracefulShutdown({
    steps: [
      { name: 'ok-1', run: () => { order.push('ok-1'); } },
      { name: 'bad', run: () => { throw new Error('boom'); } },
      { name: 'ok-2', run: async () => { order.push('ok-2'); } },
    ],
    deadlineMs: 1_000,
    exit: (code) => exitCalls.push(code),
  });

  await shutdown('SIGTERM');

  assert.deepEqual(order, ['ok-1', 'ok-2']);
  assert.deepEqual(exitCalls, [0]);
});

test('a step that rejects is logged and the remaining steps still run', async () => {
  const order = [];
  const { shutdown } = createGracefulShutdown({
    steps: [
      { name: 'ok-1', run: () => { order.push('ok-1'); } },
      { name: 'bad-async', run: async () => { throw new Error('async boom'); } },
      { name: 'ok-2', run: () => { order.push('ok-2'); } },
    ],
    deadlineMs: 1_000,
    exit: () => {},
  });

  await shutdown('SIGTERM');

  assert.deepEqual(order, ['ok-1', 'ok-2']);
});

test('exit is called exactly once with 0', async () => {
  const exitCalls = [];
  const { shutdown } = createGracefulShutdown({
    steps: [{ name: 'noop', run: () => {} }],
    deadlineMs: 1_000,
    exit: (code) => exitCalls.push(code),
  });

  await shutdown('SIGTERM');

  assert.deepEqual(exitCalls, [0]);
});

test('a second signal while a shutdown is in flight is a no-op', async () => {
  const exitCalls = [];
  let resolveFirstStep;
  const firstStepGate = new Promise((resolve) => { resolveFirstStep = resolve; });
  let stepRunCount = 0;

  const { shutdown } = createGracefulShutdown({
    steps: [
      { name: 'slow', run: async () => { stepRunCount += 1; await firstStepGate; } },
    ],
    deadlineMs: 5_000,
    exit: (code) => exitCalls.push(code),
  });

  const first = shutdown('SIGTERM');
  // Second signal arrives while the first shutdown is still in flight.
  const second = shutdown('SIGINT');

  await second; // resolves immediately (no-op)
  assert.equal(stepRunCount, 1, 'the step must not have run a second time');
  assert.equal(exitCalls.length, 0, 'exit must not have been called yet');

  resolveFirstStep();
  await first;

  assert.deepEqual(exitCalls, [0], 'exit must be called exactly once overall');
});

test('when a step hangs past deadlineMs the hard timer fires and still exits 0', async () => {
  const exitCalls = [];
  const { shutdown } = createGracefulShutdown({
    steps: [
      { name: 'hangs-forever', run: () => new Promise(() => {}) },
    ],
    deadlineMs: 25,
    exit: (code) => exitCalls.push(code),
  });

  // Do not await shutdown() itself — the hung step means the step loop
  // never completes, so the promise this returns never resolves. Instead
  // wait past the deadline and assert exit fired via the hard timer.
  void shutdown('SIGTERM');

  await new Promise((resolve) => setTimeout(resolve, 100));

  assert.deepEqual(exitCalls, [0]);
});

test('isShuttingDown reflects in-flight state', async () => {
  let resolveStep;
  const stepGate = new Promise((resolve) => { resolveStep = resolve; });
  const { shutdown, isShuttingDown } = createGracefulShutdown({
    steps: [{ name: 'slow', run: async () => { await stepGate; } }],
    deadlineMs: 5_000,
    exit: () => {},
  });

  assert.equal(isShuttingDown(), false);
  const promise = shutdown('SIGTERM');
  assert.equal(isShuttingDown(), true);
  resolveStep();
  await promise;
  assert.equal(isShuttingDown(), true, 'stays true after a completed shutdown (process is exiting)');
});

test('defaults steps to an empty array and still exits cleanly', async () => {
  const exitCalls = [];
  const { shutdown } = createGracefulShutdown({
    deadlineMs: 1_000,
    exit: (code) => exitCalls.push(code),
  });

  await shutdown('SIGTERM');

  assert.deepEqual(exitCalls, [0]);
});
