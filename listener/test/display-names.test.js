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
  const find = (re) => calls.find((c) => re.test(c.sql));
  return { pool: { connect: async () => client }, calls, find, isReleased: () => released };
}

test('renameAccessoryEvents renames events, the rules and mutes that named the device, and records it, in one transaction', async () => {
  const { pool, calls, find, isReleased } = recordingPool();
  const updated = await renameAccessoryEvents(pool, 'AA:BB:2', ' Neakasa ');

  assert.equal(updated, 4, 'live + archive row counts');
  assert.equal(calls[0].sql, 'BEGIN');
  assert.ok(find(/UPDATE alert_rules r SET scope_value = m\.new_name, renamed_by_accessory_id/), 'rules follow, remembering who moved them');
  assert.ok(find(/UPDATE user_preferences up SET prefs = jsonb_set\(up\.prefs, '\{mutedDevices\}'/), 'mutes follow');
  assert.deepEqual(find(/^UPDATE event_logs SET reported_name = COALESCE/).params, ['AA:BB:2', 'Neakasa']);
  assert.ok(find(/^UPDATE event_logs_archive SET reported_name/));
  assert.deepEqual(find(/^INSERT INTO display_name_applied/).params, ['AA:BB:2', 'Neakasa']);
  assert.equal(calls.at(-1).sql, 'COMMIT');
  assert.ok(isReleased());
});

test('renameAccessoryEvents with an empty name restores events, moved rules, display-name rules and mutes', async () => {
  const { pool, calls, find } = recordingPool();
  await renameAccessoryEvents(pool, 'AA:BB:2', '');

  assert.ok(find(/SET scope_value = scope_value_before_rename/), 'rules a rename moved go back exactly');
  assert.ok(find(/UPDATE alert_rules r SET scope_value = m\.new_name, updated_at = NOW\(\) FROM mapping m WHERE r\.scope_type = 'accessory' AND r\.renamed_by_accessory_id IS NULL/), 'rules made against the display name move to the reported name');
  assert.ok(find(/UPDATE user_preferences/));
  assert.deepEqual(find(/^UPDATE event_logs SET accessory_name = reported_name, reported_name = NULL/).params, ['AA:BB:2']);
  assert.ok(find(/^UPDATE event_logs_archive SET accessory_name = reported_name/));
  assert.deepEqual(find(/^DELETE FROM display_name_applied/).params, ['AA:BB:2']);
  assert.equal(calls.at(-1).sql, 'COMMIT');
});

test('renameAccessoryEvents rolls back and rethrows on failure', async () => {
  const { pool, calls, isReleased } = recordingPool({ failOn: 'event_logs_archive' });
  await assert.rejects(renameAccessoryEvents(pool, 'AA:BB:2', 'Neakasa'), /boom/);
  assert.equal(calls.at(-1).sql, 'ROLLBACK');
  assert.ok(isReleased());
});

// Pool for reconcile tests: `applied` rows from display_name_applied; records
// each rename job as [id, name] (name '' = restore).
function reconcilePool(applied, { failFor = null } = {}) {
  const jobs = [];
  return {
    jobs,
    async query(sql) {
      assert.match(sql, /FROM display_name_applied/);
      return { rows: Object.entries(applied).map(([accessory_id, display_name]) => ({ accessory_id, display_name })) };
    },
    async connect() {
      return {
        async query(sql, params = []) {
          if (/^\s*UPDATE event_logs\b/.test(sql)) {
            jobs.push([params[0], params[1] ?? '']);
            if (params[0] === failFor) throw new Error('boom');
          }
          return { rows: [], rowCount: 0 };
        },
        release() {},
      };
    },
  };
}

test('reconcileDisplayNames renames what differs, restores what is gone, skips what matches', async () => {
  const pool = reconcilePool({ same: 'Lamp', changed: 'Old', gone: 'Neakasa', unknown: '' });
  const names = { same: 'Lamp', changed: 'New', added: 'Plug', unknown: 'Fan' };
  await reconcileDisplayNames(pool, () => names);
  assert.deepEqual(pool.jobs.sort(), [['added', 'Plug'], ['changed', 'New'], ['gone', ''], ['unknown', 'Fan']]);
});

test('reconcileDisplayNames applies the name current when each job runs, not its snapshot', async () => {
  const pool = reconcilePool({});
  const names = { a: 'Old' };
  const done = reconcileDisplayNames(pool, () => names);
  names.a = 'New'; // a PATCH lands while reconcile is queued
  await done;
  assert.deepEqual(pool.jobs, [['a', 'New']]);
});

test('reconcileDisplayNames keeps going past a failing accessory', async () => {
  const pool = reconcilePool({}, { failFor: 'bad' });
  await reconcileDisplayNames(pool, () => ({ bad: 'X', good: 'Y' }));
  assert.deepEqual(pool.jobs, [['bad', 'X'], ['good', 'Y']]);
});

test('scheduleRename runs renames one at a time, in order', async () => {
  const { scheduleRename } = await import('../src/display-names.js');
  const order = [];
  let release;
  const gate = new Promise((r) => { release = r; });
  const pool = {
    async connect() {
      return {
        async query(sql, params = []) {
          if (/^\s*UPDATE event_logs\b/.test(sql)) {
            order.push(`start ${params[0]}`);
            if (params[0] === 'first') await gate;
            order.push(`end ${params[0]}`);
          }
          return { rows: [], rowCount: 1 };
        },
        release() {},
      };
    },
  };
  const a = scheduleRename(pool, 'first', 'A');
  const b = scheduleRename(pool, 'second', 'B');
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(order, ['start first']);
  release();
  await Promise.all([a, b]);
  assert.deepEqual(order, ['start first', 'end first', 'start second', 'end second']);
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
