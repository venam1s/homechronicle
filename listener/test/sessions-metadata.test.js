/**
 * sessions-metadata.test.js — RED scaffold for the self-scoped session list +
 * ownership-scoped revoke (Phase 23, Plan 01 RED / Plan 02 GREEN).
 *
 * These tests import listSessionsForUser and revokeSessionById from ../src/db.js,
 * which DO NOT EXIST yet — the named-import resolution fails at module load, so
 * this whole file is RED until Plan 02 implements the functions. The assertions
 * pin the contracts (SQL shape + param binding order) Plan 02 must satisfy:
 *
 *   listSessionsForUser(pool, userId)        — SELECT ... WHERE user_id = $1;
 *                                              never returns token_hash/csrf_token (D-02)
 *   revokeSessionById(pool, userId, sessionId) — DELETE FROM sessions
 *                                              WHERE id = $1 AND user_id = $2
 *                                              params bound [sessionId, userId] (D-04, T-23-IDOR)
 *
 * The fake-pool capture pattern records the SQL string + params passed to
 * pool.query (mirrors listener/test/db-session.test.js).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { listSessionsForUser, revokeSessionById } from '../src/db.js';

// Fake pool that captures every query(sql, params) call and returns a canned result.
function makeCapturePool(result = { rows: [], rowCount: 0 }) {
  const calls = [];
  return {
    calls,
    query(sql, params) {
      calls.push({ sql: String(sql), params: params ?? [] });
      return Promise.resolve(result);
    },
  };
}

test('listSessionsForUser issues a SELECT scoped WHERE user_id = $1 (self-scoped, D-02)', async () => {
  const pool = makeCapturePool({
    rows: [
      {
        id: 1,
        created_at: new Date(),
        last_seen_at: new Date(),
        expires_at: new Date(),
        user_agent: 'Test/1.0',
        ip_address: '10.0.0.1',
      },
    ],
  });

  const rows = await listSessionsForUser(pool, 42);

  assert.equal(pool.calls.length, 1, 'exactly one query issued');
  const { sql, params } = pool.calls[0];
  assert.match(sql, /SELECT/i);
  assert.match(sql, /FROM\s+sessions/i);
  assert.match(sql, /WHERE\s+user_id\s*=\s*\$1/i, 'self-scoped on user_id = $1');
  assert.deepEqual(params, [42], 'bound to the caller user_id only');

  // D-02: secrets must never be selected/serialized
  assert.doesNotMatch(sql, /token_hash/i, 'token_hash must not be selected');
  assert.doesNotMatch(sql, /csrf_token/i, 'csrf_token must not be selected');
  for (const row of rows) {
    assert.equal(row.token_hash, undefined, 'token_hash never returned');
    assert.equal(row.csrf_token, undefined, 'csrf_token never returned');
  }
});

test('revokeSessionById deletes WHERE id=$1 AND user_id=$2 with params [sessionId, userId] (D-04, T-23-IDOR)', async () => {
  const pool = makeCapturePool({ rows: [], rowCount: 1 });

  // Call order is (pool, userId, sessionId) per CONTEXT D-04.
  const userId = 42;
  const sessionId = 99;
  await revokeSessionById(pool, userId, sessionId);

  assert.equal(pool.calls.length, 1, 'exactly one query issued');
  const { sql, params } = pool.calls[0];
  assert.match(sql, /DELETE\s+FROM\s+sessions/i);
  assert.match(sql, /WHERE\s+id\s*=\s*\$1\s+AND\s+user_id\s*=\s*\$2/i, 'ownership-scoped delete');
  assert.deepEqual(
    params,
    [sessionId, userId],
    'params bound [sessionId, userId] so a guessed id cannot revoke another user\'s session',
  );
});
