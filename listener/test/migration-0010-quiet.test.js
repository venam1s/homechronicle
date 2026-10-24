import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dirname, '../migrations/0010_alert_quiet_operator.sql'), 'utf8');
const splitIdx = sql.indexOf('-- Down Migration');
const upHalf = sql.slice(0, splitIdx);
const downHalf = sql.slice(splitIdx);

test('0010 Up adds silent_for and keeps the threshold operators', () => {
  assert.ok(sql.includes('-- Up Migration') && splitIdx > 0);
  assert.match(upHalf, /'equals', 'not_equals', 'contains', 'above', 'below', 'silent_for'/);
});

test('0010 Down removes quiet rules before restoring the 0009 constraint', () => {
  const del = downHalf.indexOf("DELETE FROM alert_rules WHERE operator = 'silent_for'");
  const add = downHalf.indexOf('ADD CONSTRAINT chk_alert_operator');
  assert.ok(del > 0 && add > del);
  assert.match(downHalf, /CHECK \(operator IN \('equals', 'not_equals', 'contains', 'above', 'below'\)\)/);
});
