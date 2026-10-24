import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell } from '../src/utils.js';

test('csvCell neutralises formula-leading text', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell('+cmd'), "'+cmd");
  assert.equal(csvCell('-2+3+cmd|x'), "'-2+3+cmd|x");
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
});

test('csvCell leaves plain numbers, including negatives, as numbers', () => {
  assert.equal(csvCell('-16.1'), '-16.1');
  assert.equal(csvCell('-18'), '-18');
  assert.equal(csvCell('+5'), '+5');
  assert.equal(csvCell(-3.5), '-3.5');
  assert.equal(csvCell('21.5'), '21.5');
});

test('csvCell quotes separators and handles empty values and dates', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(new Date('2026-10-24T00:00:00Z')), '2026-10-24T00:00:00.000Z');
});
