/**
 * require-admin-session.test.js
 *
 * Tests for the requireAdminSession middleware (H-1 / admin-only enforcement).
 *
 * Uses two complementary strategies:
 *
 * 1. Direct unit tests on the function from security.js — verifies all three
 *    semantics cleanly without Express routing overhead.
 *
 * 2. Route-level integration tests on representative gated routes
 *    (DELETE /data/all, PATCH /retention, POST /alerts/rules) using stack[0]
 *    to reach the guard layer (NOT .at(-1) which skips to the business handler).
 *    A `next` spy confirms pass-through vs rejection.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { requireAdminSession } from '../src/security.js';
import { createArchiveRouter } from '../src/archive-router.js';
import { createRetentionRouter } from '../src/retention-router.js';
import { createAlertsRouter } from '../src/alerts-router.js';

// -- Helpers --

/**
 * Build a minimal req/res/next triple for middleware testing.
 * next spy records whether next() was called.
 */
function makeCtx({ hcSession } = {}) {
  let statusCode = 200;
  let jsonBody = null;
  let nextCalled = false;

  const req = { hcSession };
  const res = {
    status(code) { statusCode = code; return this; },
    json(payload) { jsonBody = payload; return this; },
  };
  const next = () => { nextCalled = true; };

  return { req, res, next, getStatus: () => statusCode, getJson: () => jsonBody, wasNextCalled: () => nextCalled };
}

/**
 * Extract the guard (first handler) from a named route on a router.
 * Stack entries without a .route are middleware layers — skip them.
 */
function getGuardHandler(router, method, path) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (layer.route.path !== path) continue;
    if (!layer.route.methods[method.toLowerCase()]) continue;
    return layer.route.stack[0].handle;
  }
  throw new Error(`Route not found: ${method} ${path}`);
}

// -- Unit tests: requireAdminSession directly --

test('requireAdminSession: member session (role=member) → 403 Forbidden', () => {
  const { req, res, next, getStatus, getJson, wasNextCalled } = makeCtx({
    hcSession: { user_id: 5, role: 'member', email: 'member@test.com' },
  });
  requireAdminSession(req, res, next);

  assert.strictEqual(getStatus(), 403);
  assert.deepStrictEqual(getJson(), { error: 'Forbidden' });
  assert.strictEqual(wasNextCalled(), false, 'next() must NOT be called for member');
});

test('requireAdminSession: admin session (role=admin) → calls next(), no 403', () => {
  const { req, res, next, getStatus, wasNextCalled } = makeCtx({
    hcSession: { user_id: 1, role: 'admin', email: 'admin@test.com' },
  });
  requireAdminSession(req, res, next);

  assert.strictEqual(wasNextCalled(), true, 'next() must be called for admin');
  assert.notStrictEqual(getStatus(), 403);
});

test('requireAdminSession: no session (service token / AUTH_ENABLED=false) → calls next(), no 403', () => {
  const { req, res, next, getStatus, wasNextCalled } = makeCtx({ hcSession: undefined });
  requireAdminSession(req, res, next);

  assert.strictEqual(wasNextCalled(), true, 'next() must be called when no session');
  assert.notStrictEqual(getStatus(), 403);
});

test('requireAdminSession: null session → calls next(), no 403 (legacy path)', () => {
  const { req, res, next, wasNextCalled } = makeCtx({ hcSession: null });
  requireAdminSession(req, res, next);

  assert.strictEqual(wasNextCalled(), true, 'next() must be called when hcSession is null');
});

test('requireAdminSession: role=viewer → 403 Forbidden (any non-admin role is blocked)', () => {
  const { req, res, next, getStatus, wasNextCalled } = makeCtx({
    hcSession: { user_id: 3, role: 'viewer' },
  });
  requireAdminSession(req, res, next);

  assert.strictEqual(getStatus(), 403);
  assert.strictEqual(wasNextCalled(), false);
});

// -- Route-level integration tests --
//
// These verify that requireAdminSession is actually wired as stack[0] on the
// representative gated routes. They invoke the guard layer directly, confirm
// member→403 / admin→next() / no-session→next() at the routing level.
//
// We do NOT use .at(-1) (business handler) — that bypasses the guard entirely.

// ---- DELETE /data/all (archive-router) ----

const fakePool = {
  async query() { return { rows: [], rowCount: 0 }; },
};
const noop = () => {};
const archiveRouter = createArchiveRouter({
  pool: fakePool,
  loadRooms: () => ({}),
  saveRooms: noop,
  loadDisplayNames: () => ({}),
  saveDisplayNames: noop,
  loadNotes: () => ({}),
  saveNotes: noop,
});

test('DELETE /data/all guard: member → 403', () => {
  const guard = getGuardHandler(archiveRouter, 'DELETE', '/data/all');
  const { req, res, next, getStatus, getJson, wasNextCalled } = makeCtx({
    hcSession: { user_id: 7, role: 'member' },
  });
  guard(req, res, next);

  assert.strictEqual(getStatus(), 403);
  assert.deepStrictEqual(getJson(), { error: 'Forbidden' });
  assert.strictEqual(wasNextCalled(), false);
});

test('DELETE /data/all guard: admin → next() called, not 403', () => {
  const guard = getGuardHandler(archiveRouter, 'DELETE', '/data/all');
  const { req, res, next, getStatus, wasNextCalled } = makeCtx({
    hcSession: { user_id: 1, role: 'admin' },
  });
  guard(req, res, next);

  assert.strictEqual(wasNextCalled(), true);
  assert.notStrictEqual(getStatus(), 403);
});

test('DELETE /data/all guard: no session → next() called, not 403 (service token path)', () => {
  const guard = getGuardHandler(archiveRouter, 'DELETE', '/data/all');
  const { req, res, next, getStatus, wasNextCalled } = makeCtx({ hcSession: undefined });
  guard(req, res, next);

  assert.strictEqual(wasNextCalled(), true);
  assert.notStrictEqual(getStatus(), 403);
});

// ---- DELETE /data/accessory (archive-router) ----

test('DELETE /data/accessory guard: member → 403', () => {
  const guard = getGuardHandler(archiveRouter, 'DELETE', '/data/accessory');
  const { req, res, next, getStatus, getJson, wasNextCalled } = makeCtx({
    hcSession: { user_id: 7, role: 'member' },
  });
  guard(req, res, next);

  assert.strictEqual(getStatus(), 403);
  assert.deepStrictEqual(getJson(), { error: 'Forbidden' });
  assert.strictEqual(wasNextCalled(), false);
});

test('DELETE /data/accessory guard: no session → next() called', () => {
  const guard = getGuardHandler(archiveRouter, 'DELETE', '/data/accessory');
  const { req, res, next, wasNextCalled } = makeCtx({ hcSession: undefined });
  guard(req, res, next);
  assert.strictEqual(wasNextCalled(), true);
});

// ---- PATCH /retention (retention-router) ----

const retentionRouter = createRetentionRouter({
  getSettings: () => ({ retentionDays: 365 }),
  saveSettings: async () => {},
  sweepMs: 0,
});

test('PATCH /retention guard: member → 403', () => {
  const guard = getGuardHandler(retentionRouter, 'PATCH', '/retention');
  const { req, res, next, getStatus, getJson, wasNextCalled } = makeCtx({
    hcSession: { user_id: 7, role: 'member' },
  });
  guard(req, res, next);

  assert.strictEqual(getStatus(), 403);
  assert.deepStrictEqual(getJson(), { error: 'Forbidden' });
  assert.strictEqual(wasNextCalled(), false);
});

test('PATCH /retention guard: admin → next() called', () => {
  const guard = getGuardHandler(retentionRouter, 'PATCH', '/retention');
  const { req, res, next, getStatus, wasNextCalled } = makeCtx({
    hcSession: { user_id: 1, role: 'admin' },
  });
  guard(req, res, next);

  assert.strictEqual(wasNextCalled(), true);
  assert.notStrictEqual(getStatus(), 403);
});

test('PATCH /retention guard: no session → next() called (AUTH_ENABLED=false path)', () => {
  const guard = getGuardHandler(retentionRouter, 'PATCH', '/retention');
  const { req, res, next, wasNextCalled } = makeCtx({ hcSession: undefined });
  guard(req, res, next);
  assert.strictEqual(wasNextCalled(), true);
});

// ---- POST /rules (alerts-router) ----

const alertsRouter = createAlertsRouter({ pool: fakePool });

test('POST /rules guard: member → 403', () => {
  const guard = getGuardHandler(alertsRouter, 'POST', '/rules');
  const { req, res, next, getStatus, getJson, wasNextCalled } = makeCtx({
    hcSession: { user_id: 7, role: 'member' },
  });
  guard(req, res, next);

  assert.strictEqual(getStatus(), 403);
  assert.deepStrictEqual(getJson(), { error: 'Forbidden' });
  assert.strictEqual(wasNextCalled(), false);
});

test('POST /rules guard: admin → next() called', () => {
  const guard = getGuardHandler(alertsRouter, 'POST', '/rules');
  const { req, res, next, getStatus, wasNextCalled } = makeCtx({
    hcSession: { user_id: 1, role: 'admin' },
  });
  guard(req, res, next);

  assert.strictEqual(wasNextCalled(), true);
  assert.notStrictEqual(getStatus(), 403);
});

test('POST /rules guard: no session → next() called', () => {
  const guard = getGuardHandler(alertsRouter, 'POST', '/rules');
  const { req, res, next, wasNextCalled } = makeCtx({ hcSession: undefined });
  guard(req, res, next);
  assert.strictEqual(wasNextCalled(), true);
});

test('PATCH /rules/:id guard: member → 403', () => {
  const guard = getGuardHandler(alertsRouter, 'PATCH', '/rules/:id');
  const { req, res, next, getStatus, wasNextCalled } = makeCtx({
    hcSession: { user_id: 7, role: 'member' },
  });
  guard(req, res, next);

  assert.strictEqual(getStatus(), 403);
  assert.strictEqual(wasNextCalled(), false);
});

test('DELETE /rules/:id guard: member → 403', () => {
  const guard = getGuardHandler(alertsRouter, 'DELETE', '/rules/:id');
  const { req, res, next, getStatus, wasNextCalled } = makeCtx({
    hcSession: { user_id: 7, role: 'member' },
  });
  guard(req, res, next);

  assert.strictEqual(getStatus(), 403);
  assert.strictEqual(wasNextCalled(), false);
});
