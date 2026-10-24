import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dirname, '../migrations/0009_alert_threshold_operators.sql'), 'utf8');
const splitIdx = sql.indexOf('-- Down Migration');
const upHalf = sql.slice(0, splitIdx);
const downHalf = sql.slice(splitIdx);

test('0009 has Up and Down markers', () => {
  assert.ok(sql.includes('-- Up Migration'));
  assert.ok(splitIdx > 0);
});

test('0009 Up widens chk_alert_operator to include above and below', () => {
  assert.match(upHalf, /DROP CONSTRAINT IF EXISTS chk_alert_operator/);
  assert.match(upHalf, /'equals', 'not_equals', 'contains', 'above', 'below'/);
});

test('0009 Down removes threshold rules before restoring the narrow constraint', () => {
  const del = downHalf.indexOf("DELETE FROM alert_rules WHERE operator IN ('above', 'below')");
  const add = downHalf.indexOf('ADD CONSTRAINT chk_alert_operator');
  assert.ok(del > 0 && add > del);
  assert.match(downHalf, /CHECK \(operator IN \('equals', 'not_equals', 'contains'\)\)/);
});
