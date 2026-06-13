/**
 * token-sweep.test.js — SEC-06 / D-06 invite + password-reset-token cleanup
 * (Phase 23, Plan 04). Relocated here from Plan 01 per the REVIEWS.md cross-wave
 * fix so its RED→GREEN happens within one plan.
 *
 * runInviteTokenSweep / runPasswordResetTokenSweep use the MODULE-LEVEL pool (no
 * pool arg), so they cannot be exercised with an injected fake pool without a real
 * DB. This mirrors the established pattern for runAlertDeliveriesRetentionSweep
 * (test/db-alert-retention.test.js): assert the export exists, then source-inspect
 * db.js for the DELETE predicate, transactional shape, and { deleted } return.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { runInviteTokenSweep, runPasswordResetTokenSweep } from '../src/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbSource = readFileSync(join(__dirname, '../src/db.js'), 'utf8');

function fnBody(name) {
  const start = dbSource.indexOf(`async function ${name}(`);
  assert.ok(start !== -1, `${name} not found in db.js`);
  // Slice to the next top-level export (or a generous window) — enough to cover the body.
  return dbSource.slice(start, start + 800);
}

test('runInviteTokenSweep + runPasswordResetTokenSweep are exported from db.js', () => {
  assert.equal(typeof runInviteTokenSweep, 'function');
  assert.equal(typeof runPasswordResetTokenSweep, 'function');
});

test('runInviteTokenSweep deletes consumed/expired invites (used_at, expires_at, status)', () => {
  const body = fnBody('runInviteTokenSweep');
  assert.match(body, /DELETE\s+FROM\s+invites/i);
  assert.match(body, /used_at\s+IS\s+NOT\s+NULL/i);
  assert.match(body, /expires_at\s*<\s*NOW\(\)/i);
  assert.match(body, /status\s*!=\s*'pending'/i);
  assert.match(body, /return\s*\{\s*deleted:/);
});

test('runPasswordResetTokenSweep deletes used/expired reset tokens (used_at, expires_at)', () => {
  const body = fnBody('runPasswordResetTokenSweep');
  assert.match(body, /DELETE\s+FROM\s+password_reset_tokens/i);
  assert.match(body, /used_at\s+IS\s+NOT\s+NULL/i);
  assert.match(body, /expires_at\s*<\s*NOW\(\)/i);
  assert.match(body, /return\s*\{\s*deleted:/);
});

test('both sweeps run transactionally (BEGIN/COMMIT/ROLLBACK + client.release)', () => {
  for (const name of ['runInviteTokenSweep', 'runPasswordResetTokenSweep']) {
    const body = fnBody(name);
    assert.match(body, /BEGIN/, `${name} uses BEGIN`);
    assert.match(body, /COMMIT/, `${name} uses COMMIT`);
    assert.match(body, /ROLLBACK/, `${name} uses ROLLBACK`);
    assert.match(body, /client\.release\(\)/, `${name} releases the client`);
  }
});
