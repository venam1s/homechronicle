/**
 * migration.0007.test.js — Source-inspection tests for 0007_user_preferences.sql
 *
 * Uses readFileSync source-inspection (no database connection, no pg import).
 * Mirrors the pattern established in migration.0005.test.js.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  join(__dirname, '../migrations/0007_user_preferences.sql'),
  'utf8',
);

// Split on -- Down Migration so Up-only and Down-only assertions target the correct half.
const splitIdx = sql.indexOf('-- Down Migration');
assert.ok(splitIdx > 0, 'Migration file must contain -- Down Migration marker');
const upHalf = sql.slice(0, splitIdx);
const downHalf = sql.slice(splitIdx);

// -- Section markers --

test('0007 migration has both -- Up Migration and -- Down Migration markers', () => {
  assert.ok(sql.includes('-- Up Migration'), 'must contain -- Up Migration');
  assert.ok(sql.includes('-- Down Migration'), 'must contain -- Down Migration');
});

// -- Up: CREATE TABLE IF NOT EXISTS user_preferences --

test('0007 Up: creates user_preferences table with IF NOT EXISTS guard', () => {
  assert.ok(
    upHalf.includes('CREATE TABLE IF NOT EXISTS user_preferences'),
    'Up must contain CREATE TABLE IF NOT EXISTS user_preferences',
  );
});

test('0007 Up: user_id column is BIGINT PRIMARY KEY (not INTEGER)', () => {
  assert.ok(
    upHalf.includes('BIGINT PRIMARY KEY'),
    'Up must define user_id as BIGINT PRIMARY KEY',
  );
  // Regression guard: INTEGER is wrong for a FK to users.id BIGSERIAL.
  // We check that ' INTEGER ' does not appear as the user_id column type.
  assert.ok(
    !upHalf.includes(' INTEGER '),
    'Up must NOT use INTEGER for user_id (users.id is BIGSERIAL/BIGINT)',
  );
});

test('0007 Up: user_id references users(id) ON DELETE CASCADE', () => {
  assert.ok(
    upHalf.includes('REFERENCES users(id) ON DELETE CASCADE'),
    'Up must have REFERENCES users(id) ON DELETE CASCADE',
  );
});

test('0007 Up: prefs column is JSONB NOT NULL DEFAULT', () => {
  assert.ok(
    upHalf.includes('prefs') && upHalf.includes('JSONB NOT NULL DEFAULT'),
    'Up must define prefs as JSONB NOT NULL DEFAULT',
  );
});

test('0007 Up: updated_at column is TIMESTAMPTZ NOT NULL DEFAULT', () => {
  assert.ok(
    upHalf.includes('updated_at') && upHalf.includes('TIMESTAMPTZ NOT NULL DEFAULT'),
    'Up must define updated_at as TIMESTAMPTZ NOT NULL DEFAULT',
  );
});

test('0007 Up: does not ALTER any existing table (purely additive)', () => {
  assert.ok(
    !upHalf.includes('ALTER TABLE'),
    'Up must not contain ALTER TABLE (must be purely additive)',
  );
});

// -- Down: DROP TABLE IF EXISTS user_preferences --

test('0007 Down: drops user_preferences table with IF EXISTS guard', () => {
  assert.ok(
    downHalf.includes('DROP TABLE IF EXISTS user_preferences'),
    'Down must contain DROP TABLE IF EXISTS user_preferences',
  );
});
