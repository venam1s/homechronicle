import test from 'node:test';
import assert from 'node:assert/strict';
import { runAlertDeliveriesRetentionSweep } from '../src/db.js';

// -- Static source inspection tests (following project pattern) --

test('runAlertDeliveriesRetentionSweep is exported from db.js', () => {
  assert.equal(typeof runAlertDeliveriesRetentionSweep, 'function');
});

test('db.js source contains DELETE FROM alert_deliveries WHERE sent_at', async () => {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const src = await fs.readFile(path.join(dir, '../src/db.js'), 'utf-8');
  assert.ok(
    src.includes('DELETE FROM alert_deliveries WHERE sent_at'),
    'db.js must contain DELETE FROM alert_deliveries WHERE sent_at',
  );
});

test('db.js runAlertDeliveriesRetentionSweep source contains BEGIN and COMMIT and ROLLBACK', async () => {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const src = await fs.readFile(path.join(dir, '../src/db.js'), 'utf-8');

  // Extract the function body
  const fnStart = src.indexOf('async function runAlertDeliveriesRetentionSweep(');
  assert.ok(fnStart !== -1, 'runAlertDeliveriesRetentionSweep function not found in db.js');
  const fnBody = src.slice(fnStart, fnStart + 800);
  assert.ok(fnBody.includes("'BEGIN'"), "Function must call client.query('BEGIN')");
  assert.ok(fnBody.includes("'COMMIT'"), "Function must call client.query('COMMIT')");
  assert.ok(fnBody.includes("'ROLLBACK'"), "Function must call client.query('ROLLBACK')");
});

test('db.js runAlertDeliveriesRetentionSweep source calls client.release()', async () => {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const src = await fs.readFile(path.join(dir, '../src/db.js'), 'utf-8');
  const fnStart = src.indexOf('async function runAlertDeliveriesRetentionSweep(');
  const fnBody = src.slice(fnStart, fnStart + 800);
  assert.ok(fnBody.includes('client.release()'), 'Function must call client.release() in finally block');
});

test('db.js runAlertDeliveriesRetentionSweep uses parameterized $1 for retentionDays', async () => {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const src = await fs.readFile(path.join(dir, '../src/db.js'), 'utf-8');
  assert.ok(
    src.includes('$1::int'),
    'SQL must use parameterized $1::int for retentionDays',
  );
});

test('db.js runAlertDeliveriesRetentionSweep has early return guard for non-positive retentionDays', async () => {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const src = await fs.readFile(path.join(dir, '../src/db.js'), 'utf-8');
  const fnStart = src.indexOf('async function runAlertDeliveriesRetentionSweep(');
  const fnBody = src.slice(fnStart, fnStart + 400);
  assert.ok(
    fnBody.includes('Number.isFinite') && fnBody.includes('<= 0'),
    'Function must guard against non-positive retentionDays using Number.isFinite and <= 0',
  );
});

// -- Behavioral tests using mock pool --

test('runAlertDeliveriesRetentionSweep returns { deleted: 0 } for retentionDays=0', async () => {
  const result = await runAlertDeliveriesRetentionSweep({ retentionDays: 0 });
  assert.equal(result.deleted, 0);
});

test('runAlertDeliveriesRetentionSweep returns { deleted: 0 } for retentionDays=-1', async () => {
  const result = await runAlertDeliveriesRetentionSweep({ retentionDays: -1 });
  assert.equal(result.deleted, 0);
});

test('runAlertDeliveriesRetentionSweep returns { deleted: 0 } for retentionDays=NaN', async () => {
  const result = await runAlertDeliveriesRetentionSweep({ retentionDays: NaN });
  assert.equal(result.deleted, 0);
});

test('runAlertDeliveriesRetentionSweep returns { deleted: 0 } for retentionDays=Infinity', async () => {
  const result = await runAlertDeliveriesRetentionSweep({ retentionDays: Infinity });
  assert.equal(result.deleted, 0);
});
