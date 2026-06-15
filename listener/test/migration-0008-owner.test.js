/**
 * migration-0008-owner.test.js
 *
 * Source-inspection + JS backfill simulation tests for 0008_alert_rules_owner.sql.
 *
 * No live database or pg import — DDL-against-live-DB is Manual-Only per 26-VALIDATION.md.
 * Backfill semantics are verified by modelling the UPDATE in JavaScript, following the
 * integration-test convention described in the project README.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  join(__dirname, '../migrations/0008_alert_rules_owner.sql'),
  'utf8',
);

// Split so Up-only and Down-only assertions target the correct half.
const splitIdx = sql.indexOf('-- Down Migration');
assert.ok(splitIdx > 0, 'Migration file must contain -- Down Migration marker');
const upHalf = sql.slice(0, splitIdx);
const downHalf = sql.slice(splitIdx);

// ---------------------------------------------------------------------------
// Section markers
// ---------------------------------------------------------------------------

test('0008 migration has both -- Up Migration and -- Down Migration markers', () => {
  assert.ok(sql.includes('-- Up Migration'), 'must contain -- Up Migration');
  assert.ok(sql.includes('-- Down Migration'), 'must contain -- Down Migration');
});

// ---------------------------------------------------------------------------
// Up: user_id column
// ---------------------------------------------------------------------------

test('0008 Up: adds user_id column with IF NOT EXISTS guard', () => {
  assert.ok(
    upHalf.includes('ADD COLUMN IF NOT EXISTS user_id'),
    'Up must contain ADD COLUMN IF NOT EXISTS user_id',
  );
});

test('0008 Up: user_id is BIGINT (not INTEGER)', () => {
  assert.ok(
    upHalf.includes('user_id BIGINT'),
    'Up must define user_id as BIGINT (matches users.id BIGSERIAL)',
  );
  assert.ok(
    !upHalf.includes('user_id INTEGER'),
    'Up must NOT use INTEGER for user_id',
  );
});

test('0008 Up: user_id references users(id) ON DELETE CASCADE', () => {
  assert.ok(
    upHalf.includes('REFERENCES users(id) ON DELETE CASCADE'),
    'Up must have REFERENCES users(id) ON DELETE CASCADE',
  );
});

test('0008 Up: user_id column is nullable — no NOT NULL constraint', () => {
  // The ADD COLUMN line must not have NOT NULL immediately after the type.
  // We check the ADD COLUMN clause in isolation.
  const addColLine = upHalf
    .split('\n')
    .find((l) => l.includes('ADD COLUMN IF NOT EXISTS user_id'));
  assert.ok(addColLine, 'must contain the ADD COLUMN line');
  assert.ok(
    !addColLine.includes('NOT NULL'),
    'user_id column must be nullable (no NOT NULL) — auth-off installs may have no admin',
  );
});

test('0008 Up: does NOT create a new table (D-02: reuse alert_rules)', () => {
  assert.ok(
    !upHalf.includes('CREATE TABLE'),
    'Up must not contain CREATE TABLE (alert_rules is reused, no separate per-user table)',
  );
});

test('0008 Up: does NOT touch alert_deliveries (D-05)', () => {
  assert.ok(
    !upHalf.includes('alert_deliveries'),
    'Up must not modify alert_deliveries',
  );
});

// ---------------------------------------------------------------------------
// Up: index
// ---------------------------------------------------------------------------

test('0008 Up: creates ix_alert_rules_user_id index with IF NOT EXISTS', () => {
  assert.ok(
    upHalf.includes('CREATE INDEX IF NOT EXISTS ix_alert_rules_user_id'),
    'Up must contain CREATE INDEX IF NOT EXISTS ix_alert_rules_user_id',
  );
  assert.ok(
    upHalf.includes('ON alert_rules (user_id)'),
    'Index must be ON alert_rules (user_id)',
  );
});

// ---------------------------------------------------------------------------
// Up: backfill statement (SQL source inspection)
// ---------------------------------------------------------------------------

test('0008 Up: backfill UPDATE targets alert_rules WHERE user_id IS NULL', () => {
  assert.ok(
    upHalf.includes('UPDATE alert_rules'),
    'Up must contain UPDATE alert_rules',
  );
  assert.ok(
    upHalf.includes('WHERE user_id IS NULL'),
    'Backfill must only touch rows WHERE user_id IS NULL',
  );
});

test('0008 Up: backfill selects admin user with lowest id (ORDER BY id ASC LIMIT 1)', () => {
  assert.ok(
    upHalf.includes("WHERE role = 'admin' ORDER BY id ASC LIMIT 1"),
    "Backfill subquery must use WHERE role = 'admin' ORDER BY id ASC LIMIT 1",
  );
});

test('0008 Up: backfill subquery targets users table', () => {
  assert.ok(
    upHalf.includes('SELECT id FROM users'),
    'Backfill subquery must SELECT id FROM users',
  );
});

// ---------------------------------------------------------------------------
// Behavioral simulation: backfill semantics (in-process JS model)
// ---------------------------------------------------------------------------

/**
 * Simulates the backfill UPDATE in JavaScript to verify its semantics
 * without a live Postgres connection.
 *
 * The SQL:
 *   UPDATE alert_rules
 *     SET user_id = (SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1)
 *     WHERE user_id IS NULL;
 */
function simulateBackfill(alertRules, users) {
  // Replicate the subquery: SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1
  const adminUsers = users
    .filter((u) => u.role === 'admin')
    .sort((a, b) => a.id - b.id);
  const lowestAdminId = adminUsers.length > 0 ? adminUsers[0].id : null;

  // Replicate the UPDATE: SET user_id = <subquery> WHERE user_id IS NULL
  return alertRules.map((rule) => ({
    ...rule,
    user_id: rule.user_id == null ? lowestAdminId : rule.user_id,
  }));
}

test('backfill: assigns user_id to lowest-id admin for a pre-existing webhook rule', () => {
  const users = [
    { id: 10, role: 'admin', email: 'admin1@example.com' },
    { id: 3, role: 'admin', email: 'admin2@example.com' },   // lowest id
    { id: 5, role: 'member', email: 'member@example.com' },
  ];

  const alertRules = [
    { id: 1, name: 'motion alert', channel: 'webhook', target_url: 'https://hooks.example.com/motion', user_id: null },
  ];

  const result = simulateBackfill(alertRules, users);

  assert.equal(
    result[0].user_id,
    3,
    'user_id must be set to the lowest-id admin (id=3)',
  );
});

test('backfill: pre-existing webhook rule target_url is intact after backfill', () => {
  const users = [{ id: 1, role: 'admin', email: 'admin@example.com' }];
  const alertRules = [
    { id: 42, name: 'door alert', channel: 'webhook', target_url: 'https://hooks.example.com/door', user_id: null },
  ];

  const result = simulateBackfill(alertRules, users);

  assert.equal(
    result[0].target_url,
    'https://hooks.example.com/door',
    'target_url must be preserved unchanged after backfill',
  );
});

test('backfill: user_id stays NULL when no admin user exists (auth-off / A1)', () => {
  const users = [
    { id: 7, role: 'member', email: 'member@example.com' },
  ];

  const alertRules = [
    { id: 1, name: 'motion alert', channel: 'webhook', target_url: 'https://hooks.example.com/x', user_id: null },
  ];

  const result = simulateBackfill(alertRules, users);

  assert.equal(
    result[0].user_id,
    null,
    'user_id must remain NULL when no admin user exists',
  );
});

test('backfill: rows with an existing user_id are not overwritten', () => {
  const users = [{ id: 1, role: 'admin', email: 'admin@example.com' }];
  const alertRules = [
    { id: 1, name: 'rule A', channel: 'webhook', target_url: 'https://hooks.example.com/a', user_id: 99 }, // already set
    { id: 2, name: 'rule B', channel: 'webhook', target_url: 'https://hooks.example.com/b', user_id: null }, // needs backfill
  ];

  const result = simulateBackfill(alertRules, users);

  assert.equal(result[0].user_id, 99, 'pre-existing user_id must not be overwritten');
  assert.equal(result[1].user_id, 1, 'null user_id must be backfilled to admin id=1');
});

// ---------------------------------------------------------------------------
// Down: rollback
// ---------------------------------------------------------------------------

test('0008 Down: drops ix_alert_rules_user_id index with IF EXISTS', () => {
  assert.ok(
    downHalf.includes('DROP INDEX IF EXISTS ix_alert_rules_user_id'),
    'Down must contain DROP INDEX IF EXISTS ix_alert_rules_user_id',
  );
});

test('0008 Down: drops user_id column with IF EXISTS', () => {
  assert.ok(
    downHalf.includes('DROP COLUMN IF EXISTS user_id'),
    'Down must contain DROP COLUMN IF EXISTS user_id',
  );
});

test('0008 Down: does NOT touch alert_deliveries (D-05)', () => {
  assert.ok(
    !downHalf.includes('alert_deliveries'),
    'Down must not modify alert_deliveries',
  );
});
