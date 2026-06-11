/**
 * db-invites.test.js — Wave 0 stub for invite + reset-token CRUD in db.js
 *
 * Requirements covered by this file (to be filled in by Plan 21-03):
 *   USER-03 — redeemInvite() is atomic (UPDATE WHERE used_at IS NULL RETURNING);
 *             second call on same token returns null (no double-use)
 *   PWD-03  — redeemResetToken() is atomic; second call returns null;
 *             used_at is set after first redemption
 *
 * NOTE: This is a Wave 0 stub. The placeholder test below MUST be replaced
 * (not merely appended to) by Plan 21-03 with the real invite CRUD and
 * reset-token CRUD atomic redemption tests using mock pools.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// Wave 0 placeholder — replaced by Plan 21-03
test('db-invites.test.js Wave 0 stub placeholder (USER-03, PWD-03)', () => {
  assert.ok(true, 'Wave 0 stub: Plan 21-03 will replace this with real invite+reset token CRUD tests');
});
