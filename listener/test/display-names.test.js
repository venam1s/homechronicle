import test from 'node:test';
import assert from 'node:assert/strict';
import { withDisplayName, renameAccessoryEvents, reconcileDisplayNames } from '../src/display-names.js';

test('withDisplayName replaces the reported name', () => {
  assert.equal(withDisplayName('PB01009G24410010060', 'OccupancySensor', 'Neakasa'), 'Neakasa');
  assert.equal(withDisplayName('Lamp', null, '  Desk Lamp  '), 'Desk Lamp');
});

test('withDisplayName keeps the per-service suffix of a multi-service accessory', () => {
  assert.equal(
    withDisplayName('PB01009G24410010060 · OccupancySensor', 'OccupancySensor', 'Neakasa'),
    'Neakasa · OccupancySensor',
  );
  assert.equal(
    withDisplayName('PB01009G24410010060 · FilterMaintenance', 'FilterMaintenance', 'Neakasa'),
    'Neakasa · FilterMaintenance',
  );
});

test('withDisplayName leaves the name alone without a display name', () => {
  assert.equal(withDisplayName('Lamp', 'Lightbulb', undefined), 'Lamp');
  assert.equal(withDisplayName('Lamp', 'Lightbulb', '   '), 'Lamp');
});

function recordingPool({ failOn = null, rowCount = 2 } = {}) {
  const calls = [];
  let released = false;
  const client = {
    async query(sql, params = []) {
      calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      if (failOn && sql.includes(failOn)) throw new Error('boom');
      return { rows: [], rowCount: /^\s*UPDATE (event_logs|event_logs_archive)\b/.test(sql) ? rowCount : 0 };
    },
    release() { released = true; },
  };
  return { pool: { connect: async () => client }, calls, isReleased: () => released };
}

test('renameAccessoryEvents renames live and archived events and the rules that named the device, in one transaction', async () => {
  const { pool, calls, isReleased } = recordingPool();
  const updated = await renameAccessoryEvents(pool, 'AA:BB:2', ' Neakasa ');

  assert.equal(updated, 4, 'live + archive row counts');
  assert.equal(calls[0].sql, 'BEGIN');
  assert.match(calls[1].sql, /^UPDATE alert_rules/);
  assert.match(calls[2].sql, /^UPDATE event_logs SET reported_name = COALESCE\(reported_name, accessory_name\)/);
  assert.match(calls[3].sql, /^UPDATE event_logs_archive /);
  assert.deepEqual(calls[2].params, ['AA:BB:2', 'Neakasa'], 'exact accessory id, trimmed name');
  assert.equal(calls.at(-1).sql, 'COMMIT');
  assert.ok(isReleased());
});

test('renameAccessoryEvents with an empty name restores the reported names', async () => {
  const { pool, calls } = recordingPool();
  await renameAccessoryEvents(pool, 'AA:BB:2', '');

  assert.match(calls[1].sql, /^UPDATE alert_rules/);
  assert.match(calls[2].sql, /^UPDATE event_logs SET accessory_name = reported_name, reported_name = NULL/);
  assert.match(calls[3].sql, /^UPDATE event_logs_archive SET accessory_name = reported_name/);
  assert.deepEqual(calls[2].params, ['AA:BB:2']);
});

test('renameAccessoryEvents rolls back and rethrows on failure', async () => {
  const { pool, calls, isReleased } = recordingPool({ failOn: 'event_logs_archive' });
  await assert.rejects(renameAccessoryEvents(pool, 'AA:BB:2', 'Neakasa'), /boom/);
  assert.equal(calls.at(-1).sql, 'ROLLBACK');
  assert.ok(isReleased());
});

test('reconcileDisplayNames keeps going past a failing accessory', async () => {
  const seen = [];
  const pool = {
    async connect() {
      return {
        async query(sql, params = []) {
          if (/^\s*UPDATE event_logs\b/.test(sql)) {
            seen.push(params[0]);
            if (params[0] === 'bad') throw new Error('boom');
          }
          return { rows: [], rowCount: 0 };
        },
        release() {},
      };
    },
  };
  await reconcileDisplayNames(pool, { bad: 'X', good: 'Y' });
  assert.deepEqual(seen, ['bad', 'good']);
});

test('reconcileDisplayNames leaves the archive alone (no accessory_id index there)', async () => {
  const tables = [];
  const pool = {
    async connect() {
      return {
        async query(sql) {
          const m = /^\s*UPDATE (event_logs\w*)/.exec(sql);
          if (m) tables.push(m[1]);
          return { rows: [], rowCount: 0 };
        },
        release() {},
      };
    },
  };
  await reconcileDisplayNames(pool, { 'AA:BB:2': 'Neakasa' });
  assert.deepEqual(tables, ['event_logs']);
});

test('insertEvent stores the display name and keeps the reported name', async () => {
  const { insertEvent, setDisplayNameLookup } = await import('../src/db.js');
  const inserts = [];
  const executor = {
    async query(sql, params) {
      inserts.push(params);
      return { rows: [{ id: 1, timestamp: 't', accessory_name: params[1] }] };
    },
  };
  const event = {
    accessoryId: 'AA:BB:2', accessoryName: 'PB01009G24410010060 · OccupancySensor',
    serviceType: 'OccupancySensor', characteristic: 'OccupancyDetected', newValue: 1,
  };
  try {
    setDisplayNameLookup(() => ({ 'AA:BB:2': 'Neakasa', 'AA:BB': 'Bridge' }));
    const row = await insertEvent(event, executor);
    assert.equal(row.accessory_name, 'Neakasa · OccupancySensor');
    assert.equal(inserts[0][1], 'Neakasa · OccupancySensor');
    assert.equal(inserts[0][13], 'PB01009G24410010060 · OccupancySensor');

    setDisplayNameLookup(() => ({ 'AA:BB': 'Bridge' }));
    await insertEvent(event, executor);
    assert.equal(inserts[1][1], 'PB01009G24410010060 · OccupancySensor', 'a bridge name does not rename its children');
    assert.equal(inserts[1][13], null);
  } finally {
    setDisplayNameLookup(null);
  }
});
