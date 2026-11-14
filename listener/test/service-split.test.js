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

function fakeClient({ pendingRows = true } = {}) {
  const queries = [];
  return {
    queries,
    async query(sql, params = []) {
      queries.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      if (sql.includes('JOIN unnest')) return { rows: pendingRows ? [{ '?column?': 1 }] : [] };
      if (sql.includes('SELECT DISTINCT name')) return { rows: [{ name: 'Holiday Outlet' }] };
      if (sql.trim().startsWith('UPDATE event_logs_archive')) return { rowCount: 1 };
      if (sql.trim().startsWith('UPDATE event_logs')) return { rowCount: 3 };
      return { rows: [], rowCount: 0 };
    },
  };
}

const splits = [
  { accessoryId: `${MAC}:7:10`, parentAccessoryId: `${MAC}:7`, name: 'Tree', serviceType: 'Outlet', iids: [11] },
  { accessoryId: `${MAC}:7:20`, parentAccessoryId: `${MAC}:7`, name: 'Garland', serviceType: 'Outlet', iids: [21] },
];

test('moveSplitServiceHistory moves each service\'s events by raw_iid, live and archived', async () => {
  const client = fakeClient();
  const moved = await moveSplitServiceHistory(splits, client);
  assert.equal(moved, 8);

  const updates = client.queries.filter((q) => /^UPDATE event_logs/.test(q.sql));
  assert.equal(updates.length, 4);
  assert.deepEqual(updates[0].params, [`${MAC}:7:10`, 'Tree', null, `${MAC}:7`, [11]]);
  assert.match(updates[1].sql, /^UPDATE event_logs_archive/);
  assert.deepEqual(updates[2].params, [`${MAC}:7:20`, 'Garland', null, `${MAC}:7`, [21]]);
  for (const u of updates) assert.match(u.sql, /WHERE accessory_id = \$4 AND raw_iid = ANY\(\$5::int\[\]\)/);

  // Mutes on the plug's old name carry over to each outlet.
  const mutes = client.queries.filter((q) => q.sql.startsWith('UPDATE user_preferences'));
  assert.deepEqual(mutes.map((q) => q.params), [[['Holiday Outlet'], 'Tree'], [['Holiday Outlet'], 'Garland']]);

  assert.equal(client.queries[client.queries.length - 1].sql, 'COMMIT');
});

test('moveSplitServiceHistory is a single cheap check once nothing is left to move', async () => {
  const client = fakeClient({ pendingRows: false });
  assert.equal(await moveSplitServiceHistory(splits, client), 0);
  assert.equal(client.queries.length, 2); // live + archive probe, no transaction
  assert.deepEqual(client.queries[0].params, [[`${MAC}:7`, `${MAC}:7`], [11, 21]]);
});

test('moveSplitServiceHistory ignores an empty split list', async () => {
  const client = fakeClient();
  assert.equal(await moveSplitServiceHistory([], client), 0);
  assert.equal(client.queries.length, 0);
});
