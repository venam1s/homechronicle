/**
 * db-migration.test.js — Unit tests for migrateDb() in db.js.
 *
 * Tests use source inspection (matching the project's matter-controller.test.js
 * pattern) since ES module mocking is not available in the Node.js built-in
 * test runner. Structural and behavioral assertions are validated against
 * the source text.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, '../src/db.js'), 'utf8');

// -- Test 1: runner is imported from node-pg-migrate --

test('migrateDb() imports runner from node-pg-migrate', () => {
  assert.ok(
    source.includes("import { runner } from 'node-pg-migrate'"),
    'db.js must import runner from node-pg-migrate',
  );
});

// -- Test 2: Existing install without pgmigrations — fake-apply baseline --

test('migrateDb() fake-applies baseline on existing install without pgmigrations', () => {
  assert.ok(
    source.includes('fake: true'),
    'migrateDb() must include fake: true for existing-install fake-apply',
  );
  assert.ok(
    source.includes('count: 1'),
    'migrateDb() must include count: 1 to fake-apply only the baseline migration',
  );
  assert.ok(
    source.includes('hasEventLogs && !baselineAlreadyTracked'),
    'migrateDb() must gate fake-apply on hasEventLogs && !baselineAlreadyTracked',
  );
});

// -- Test 3: Existing install where pgmigrations already tracks baseline — no fake-apply --

test('migrateDb() skips fake-apply when baseline is already tracked in pgmigrations', () => {
  assert.ok(
    source.includes('baselineAlreadyTracked'),
    'migrateDb() must track whether baseline is already in pgmigrations',
  );
  assert.ok(
    source.includes("name = '0001_baseline'"),
    "migrateDb() must query pgmigrations for '0001_baseline' row",
  );
});

// -- Test 4: Fresh install — runner called once without fake --

test('migrateDb() calls runner for all pending migrations unconditionally', () => {
  // There must be at least 2 runner() calls: one conditional fake-apply + one unconditional run
  const runnerCallCount = (source.match(/await runner\(/g) || []).length;
  assert.ok(
    runnerCallCount >= 2,
    `migrateDb() must contain at least 2 await runner() calls, found ${runnerCallCount}`,
  );
});

// -- Test 5: No inline DDL --

test('migrateDb() does not contain inline CREATE TABLE or ALTER TABLE DDL', () => {
  const migrateDbStart = source.indexOf('export async function migrateDb()');
  assert.ok(migrateDbStart >= 0, 'migrateDb() must be exported from db.js');

  const migrateDbBody = source.slice(migrateDbStart);
  assert.ok(
    !migrateDbBody.includes('CREATE TABLE'),
    'migrateDb() must not contain inline CREATE TABLE DDL',
  );
  assert.ok(
    !migrateDbBody.includes('ALTER TABLE'),
    'migrateDb() must not contain inline ALTER TABLE DDL',
  );
  assert.ok(
    !migrateDbBody.includes('CREATE EXTENSION'),
    'migrateDb() must not contain inline CREATE EXTENSION DDL',
  );
  assert.ok(
    !migrateDbBody.includes('initial_poll_cleanup'),
    'migrateDb() must not contain initial_poll_cleanup logic',
  );
});

// -- Additional structural assertions --

test('migrateDb() uses migrationsTable pgmigrations', () => {
  assert.ok(
    source.includes("migrationsTable: 'pgmigrations'"),
    "migrateDb() must use migrationsTable: 'pgmigrations'",
  );
});

test('migrateDb() queries information_schema.tables for existing-install detection', () => {
  assert.ok(
    source.includes('information_schema.tables'),
    'migrateDb() must query information_schema.tables to detect existing installs',
  );
  assert.ok(
    source.includes("table_name = 'event_logs'"),
    "migrateDb() must check for event_logs table to detect existing installs",
  );
});

test('db.js preserves all original exports', () => {
  assert.ok(source.includes('export async function insertEvent('), 'insertEvent must remain exported');
  assert.ok(source.includes('export async function migrateDb()'), 'migrateDb must remain exported');
  assert.ok(source.includes('export async function runRetentionSweep('), 'runRetentionSweep must remain exported');
  assert.ok(source.includes('export { pool }'), 'pool must remain exported');
});

test('db.js imports path and fileURLToPath for migrations directory resolution', () => {
  assert.ok(
    source.includes("import { fileURLToPath } from 'url'") ||
    source.includes("import { fileURLToPath } from 'node:url'"),
    'db.js must import fileURLToPath for ESM __dirname equivalent',
  );
  assert.ok(
    source.includes("import path from 'path'") ||
    source.includes("import path from 'node:path'"),
    'db.js must import path for migrations directory resolution',
  );
});
