import test from 'node:test';
import assert from 'node:assert/strict';
import { parentAccessoryId, parentBridgeId, roomFor, serviceSplitId } from '../src/utils.js';
import { moveSplitServiceHistory } from '../src/db.js';

const MAC = 'AA:BB:CC:DD:EE:FF';

test('serviceSplitId / parentAccessoryId / parentBridgeId agree on split ids', () => {
  assert.equal(serviceSplitId(MAC, 7, 10), `${MAC}:7:10`);
  assert.equal(parentAccessoryId(`${MAC}:7:10`), `${MAC}:7`);
  assert.equal(parentAccessoryId(`${MAC}:1:10`), MAC);
  assert.equal(parentBridgeId(`${MAC}:7:10`), MAC);
  assert.equal(parentBridgeId(`${MAC}:1:10`), MAC);
  // Not split ids: bridge children, devices, Matter endpoints.
  assert.equal(parentAccessoryId(`${MAC}:7`), null);
  assert.equal(parentAccessoryId(MAC), null);
  assert.equal(parentAccessoryId('1234:2'), null);
});

test('roomFor: own room, then parent accessory, then bridge', () => {
  const split = `${MAC}:7:10`;
  assert.equal(roomFor({ [split]: 'Porch', [`${MAC}:7`]: 'Front', [MAC]: 'Office' }, split), 'Porch');
  assert.equal(roomFor({ [`${MAC}:7`]: 'Front', [MAC]: 'Office' }, split), 'Front');
  assert.equal(roomFor({ [MAC]: 'Office' }, split), 'Office');
  assert.equal(roomFor({ [MAC]: 'Office' }, `${MAC}:7`), 'Office');
  assert.equal(roomFor({}, split), undefined);
  assert.equal(roomFor({ [MAC]: 'Office' }, MAC), 'Office');
  // Matter endpoints still fall back to their node.
  assert.equal(roomFor({ 1234: 'Den' }, '1234:2'), 'Den');
});

function fakeClient({ toMove = true, toRename = false } = {}) {
  const queries = [];
  return {
    queries,
    async query(sql, params = []) {
      const flat = sql.replace(/\s+/g, ' ').trim();
      queries.push({ sql: flat, params });
      if (flat.includes('unnest($1::text[], $2::int[])')) return { rows: toMove ? [{ '?column?': 1 }] : [] };
      if (flat.includes('unnest($1::text[], $2::text[])')) return { rows: toRename ? [{ '?column?': 1 }] : [] };
      if (flat.includes('SELECT DISTINCT name')) return { rows: [{ name: 'Holiday Outlet' }] };
      if (flat.startsWith('UPDATE event_logs') && flat.includes('raw_iid = ANY')) {
        if (!toMove) return { rowCount: 0 };
        return { rowCount: flat.startsWith('UPDATE event_logs_archive') ? 1 : 3 };
      }
      if (flat.startsWith('UPDATE event_logs')) return { rowCount: toRename ? 2 : 0 };
      return { rows: [], rowCount: 0 };
    },
  };
}

const splits = [
  { accessoryId: `${MAC}:7:10`, parentAccessoryId: `${MAC}:7`, name: 'Holiday Outlet Tree', serviceType: 'Outlet', iids: [11] },
  { accessoryId: `${MAC}:7:20`, parentAccessoryId: `${MAC}:7`, name: 'Holiday Outlet Garland', serviceType: 'Outlet', iids: [21] },
];

test('moveSplitServiceHistory moves each service\'s events by raw_iid, live and archived', async () => {
  const client = fakeClient();
  const moved = await moveSplitServiceHistory(splits, client);
  assert.equal(moved, 8);

  const moves = client.queries.filter((q) => q.sql.startsWith('UPDATE event_logs') && q.sql.includes('raw_iid = ANY'));
  assert.equal(moves.length, 4);
  assert.deepEqual(moves[0].params, [`${MAC}:7:10`, 'Holiday Outlet Tree', null, `${MAC}:7`, [11]]);
  assert.match(moves[1].sql, /^UPDATE event_logs_archive/);
  assert.deepEqual(moves[2].params, [`${MAC}:7:20`, 'Holiday Outlet Garland', null, `${MAC}:7`, [21]]);
  for (const u of moves) assert.match(u.sql, /WHERE accessory_id = \$4 AND raw_iid = ANY\(\$5::int\[\]\)/);

  // Mutes on the plug's old name carry over to each outlet.
  const mutes = client.queries.filter((q) => q.sql.startsWith('UPDATE user_preferences'));
  assert.deepEqual(mutes.map((q) => q.params), [
    [['Holiday Outlet'], 'Holiday Outlet Tree'],
    [['Holiday Outlet'], 'Holiday Outlet Garland'],
  ]);

  assert.equal(client.queries[client.queries.length - 1].sql, 'COMMIT');
});

test('moveSplitServiceHistory renames a split service\'s past events when its name changed', async () => {
  // v0.6.0-beta.2 named split services after the service alone ("Clean");
  // the next connect brings that history in line with the new names.
  const client = fakeClient({ toMove: false, toRename: true });
  const changed = await moveSplitServiceHistory(splits, client);
  assert.equal(changed, 8); // 2 rows renamed per table per service

  const renames = client.queries.filter((q) => q.sql.startsWith('UPDATE event_logs') && !q.sql.includes('raw_iid = ANY'));
  assert.equal(renames.length, 4);
  assert.deepEqual(renames[0].params, [`${MAC}:7:10`, 'Holiday Outlet Tree', null, 'Holiday Outlet Tree']);
  assert.match(renames[0].sql, /COALESCE\(reported_name, accessory_name\) IS DISTINCT FROM \$4/);
});

test('moveSplitServiceHistory is only cheap checks once everything matches', async () => {
  const client = fakeClient({ toMove: false, toRename: false });
  assert.equal(await moveSplitServiceHistory(splits, client), 0);
  assert.equal(client.queries.length, 4); // move + rename probe, live and archive; no transaction
  assert.deepEqual(client.queries[0].params, [[`${MAC}:7`, `${MAC}:7`], [11, 21]]);
  assert.deepEqual(client.queries[1].params, [[`${MAC}:7:10`, `${MAC}:7:20`], ['Holiday Outlet Tree', 'Holiday Outlet Garland']]);
});

test('moveSplitServiceHistory ignores an empty split list', async () => {
  const client = fakeClient();
  assert.equal(await moveSplitServiceHistory([], client), 0);
  assert.equal(client.queries.length, 0);
});
