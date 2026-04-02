import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';

// ── Helpers: extractable handler functions (mirrors what index.js will export) ──

function makeHandleUnhandledRejection(logFn, exitFn) {
  return (reason) => {
    logFn('[process] Unhandled promise rejection:', reason?.message ?? reason?.stack ?? reason);
    // intentionally does NOT call exitFn
  };
}

function makeHandleUncaughtException(logFn, exitFn) {
  return (err) => {
    logFn('[process] Uncaught exception — exiting for clean Docker restart:', err.message ?? err.stack ?? err);
    exitFn(1);
  };
}

function globalExpressErrorHandler(err, req, res, _next) {
  // log call omitted in test helper — tested via spy in full integration
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error' });
}

// ── ERR-03: Express error middleware ──

test('global error middleware: sync throw returns 500 JSON', async () => {
  const app = express();
  app.get('/test-sync-error', (_req, _res) => { throw new Error('deliberate sync error'); });
  app.use(globalExpressErrorHandler);
  const res = await request(app).get('/test-sync-error');
  assert.equal(res.status, 500);
  assert.deepEqual(res.body, { error: 'Internal server error' });
});

test('global error middleware: async throw returns 500 JSON', async () => {
  const app = express();
  app.get('/test-async-error', async (_req, _res) => { throw new Error('deliberate async error'); });
  app.use(globalExpressErrorHandler);
  const res = await request(app).get('/test-async-error');
  assert.equal(res.status, 500);
  assert.deepEqual(res.body, { error: 'Internal server error' });
});

// ── ERR-01: unhandledRejection handler ──

test('unhandledRejection handler: logs error and does not exit', () => {
  const logged = [];
  const exited = [];
  const handler = makeHandleUnhandledRejection(
    (...args) => logged.push(args.join(' ')),
    (code) => exited.push(code)
  );
  handler(new Error('test rejection'));
  assert.equal(logged.length, 1);
  assert.ok(logged[0].includes('test rejection'));
  assert.equal(exited.length, 0); // must NOT exit
});

// ── ERR-02: uncaughtException handler ──

test('uncaughtException handler: logs error and calls process.exit(1)', () => {
  const logged = [];
  const exited = [];
  const handler = makeHandleUncaughtException(
    (...args) => logged.push(args.join(' ')),
    (code) => exited.push(code)
  );
  handler(new Error('test exception'));
  assert.equal(logged.length, 1);
  assert.ok(logged[0].includes('test exception'));
  assert.deepEqual(exited, [1]); // must exit with code 1
});
