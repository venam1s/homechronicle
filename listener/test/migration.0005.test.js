/**
 * migration.0005.test.js — Source-inspection tests for 0005_email_alert_channel.sql
 *
 * Uses readFileSync source-inspection (no database connection, no pg import).
 * Mirrors the pattern established in db-migration.test.js / matter-controller.test.js.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  join(__dirname, '../migrations/0005_email_alert_channel.sql'),
  'utf8',
);

// Split on -- Down Migration so Up-only and Down-only assertions target the correct half.
const splitIdx = sql.indexOf('-- Down Migration');
assert.ok(splitIdx > 0, 'Migration file must contain -- Down Migration marker');
const upHalf = sql.slice(0, splitIdx);
const downHalf = sql.slice(splitIdx);

// -- Section markers --

test('0005 migration has both -- Up Migration and -- Down Migration markers', () => {
  assert.ok(sql.includes('-- Up Migration'), 'must contain -- Up Migration');
  assert.ok(sql.includes('-- Down Migration'), 'must contain -- Down Migration');
});

// -- Up: alert_rules additive changes --

test('0005 Up: drops NOT NULL on alert_rules.target_url', () => {
  assert.ok(
    upHalf.includes('ALTER TABLE alert_rules ALTER COLUMN target_url DROP NOT NULL'),
    'Up must drop NOT NULL on alert_rules.target_url',
  );
});

test('0005 Up: adds channel column to alert_rules', () => {
  assert.ok(
    upHalf.includes("ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'webhook'"),
    'Up must add channel column with NOT NULL DEFAULT webhook to alert_rules',
  );
});

test('0005 Up: adds target_email column to alert_rules', () => {
  assert.ok(
    upHalf.includes('ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS target_email TEXT'),
    'Up must add target_email column to alert_rules',
  );
});

// -- Up: alert_rules constraints --

test('0005 Up: adds chk_alert_channel constraint on alert_rules', () => {
  assert.ok(
    upHalf.includes('ADD CONSTRAINT chk_alert_channel'),
    'Up must add chk_alert_channel constraint',
  );
  assert.ok(
    upHalf.includes("channel IN ('webhook', 'email')"),
    "chk_alert_channel must check channel IN ('webhook', 'email')",
  );
});

test('0005 Up: adds chk_alert_channel_fields constraint with both webhook and email branches', () => {
  assert.ok(
    upHalf.includes('ADD CONSTRAINT chk_alert_channel_fields'),
    'Up must add chk_alert_channel_fields constraint',
  );
  assert.ok(
    upHalf.includes("channel = 'webhook' AND target_url IS NOT NULL"),
    'chk_alert_channel_fields must include the webhook branch',
  );
  assert.ok(
    upHalf.includes("channel = 'email'   AND target_email IS NOT NULL"),
    'chk_alert_channel_fields must include the email branch',
  );
});

// -- Up: alert_deliveries additive changes --

test('0005 Up: drops NOT NULL on alert_deliveries.target_url', () => {
  assert.ok(
    upHalf.includes('ALTER TABLE alert_deliveries ALTER COLUMN target_url DROP NOT NULL'),
    'Up must drop NOT NULL on alert_deliveries.target_url',
  );
});

test('0005 Up: adds channel column to alert_deliveries', () => {
  assert.ok(
    upHalf.includes("ALTER TABLE alert_deliveries ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'webhook'"),
    'Up must add channel column with NOT NULL DEFAULT webhook to alert_deliveries',
  );
});

test('0005 Up: adds recipient column to alert_deliveries', () => {
  assert.ok(
    upHalf.includes('ALTER TABLE alert_deliveries ADD COLUMN IF NOT EXISTS recipient TEXT'),
    'Up must add recipient column to alert_deliveries',
  );
});

test('0005 Up: adds chk_alert_delivery_channel constraint on alert_deliveries', () => {
  assert.ok(
    upHalf.includes('ADD CONSTRAINT chk_alert_delivery_channel'),
    'Up must add chk_alert_delivery_channel constraint',
  );
});

// -- chk_alert_delivery_status must NOT be redefined or dropped --

test('0005 does not redefine or drop chk_alert_delivery_status', () => {
  assert.ok(
    !sql.includes('chk_alert_delivery_status'),
    'migration must not touch chk_alert_delivery_status (pre-existing status enum constraint)',
  );
});

// -- Down: restores NOT NULL (must appear only in Down half) --

test('0005 Down: restores NOT NULL on alert_rules.target_url', () => {
  assert.ok(
    downHalf.includes('ALTER TABLE alert_rules ALTER COLUMN target_url SET NOT NULL'),
    'Down must restore NOT NULL on alert_rules.target_url',
  );
  assert.ok(
    !upHalf.includes('alert_rules ALTER COLUMN target_url SET NOT NULL'),
    'SET NOT NULL must not appear in the Up half',
  );
});

test('0005 Down: restores NOT NULL on alert_deliveries.target_url', () => {
  assert.ok(
    downHalf.includes('ALTER TABLE alert_deliveries ALTER COLUMN target_url SET NOT NOT NULL') ||
    downHalf.includes('ALTER TABLE alert_deliveries ALTER COLUMN target_url SET NOT NULL'),
    'Down must restore NOT NULL on alert_deliveries.target_url',
  );
  assert.ok(
    !upHalf.includes('alert_deliveries ALTER COLUMN target_url SET NOT NULL'),
    'SET NOT NULL must not appear in the Up half',
  );
});

// -- Down: drops constraints and columns --

test('0005 Down: drops chk_alert_delivery_channel constraint', () => {
  assert.ok(
    downHalf.includes('DROP CONSTRAINT IF EXISTS chk_alert_delivery_channel'),
    'Down must drop chk_alert_delivery_channel',
  );
});

test('0005 Down: drops chk_alert_channel_fields and chk_alert_channel constraints', () => {
  assert.ok(
    downHalf.includes('DROP CONSTRAINT IF EXISTS chk_alert_channel_fields'),
    'Down must drop chk_alert_channel_fields',
  );
  assert.ok(
    downHalf.includes('DROP CONSTRAINT IF EXISTS chk_alert_channel'),
    'Down must drop chk_alert_channel',
  );
});

test('0005 Down: drops recipient and channel columns from alert_deliveries', () => {
  assert.ok(
    downHalf.includes('ALTER TABLE alert_deliveries DROP COLUMN IF EXISTS recipient'),
    'Down must drop recipient from alert_deliveries',
  );
  assert.ok(
    downHalf.includes('ALTER TABLE alert_deliveries DROP COLUMN IF EXISTS channel'),
    'Down must drop channel from alert_deliveries',
  );
});

test('0005 Down: drops target_email and channel columns from alert_rules', () => {
  assert.ok(
    downHalf.includes('ALTER TABLE alert_rules DROP COLUMN IF EXISTS target_email'),
    'Down must drop target_email from alert_rules',
  );
  assert.ok(
    downHalf.includes('ALTER TABLE alert_rules DROP COLUMN IF EXISTS channel'),
    'Down must drop channel from alert_rules',
  );
});

// -- DROP NOT NULL only in Up half, SET NOT NULL only in Down half --

test('0005 DROP NOT NULL appears only in the Up half', () => {
  assert.ok(
    !downHalf.includes('DROP NOT NULL'),
    'DROP NOT NULL must not appear in the Down half',
  );
});
