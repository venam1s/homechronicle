import test from 'node:test';
import assert from 'node:assert/strict';
import { createEventsRouter, buildEventFilters } from '../src/events-router.js';

function getRouteHandler(router, method, path) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (layer.route.path !== path) continue;
    if (!layer.route.methods[method.toLowerCase()]) continue;
    return layer.route.stack.at(-1).handle;
  }
  throw new Error(`Route not found: ${method} ${path}`);
}

async function invokeStream(handler, query = {}) {
  let statusCode = 200;
  let jsonBody = null;
  let ended = false;
  const chunks = [];
  const headers = {};
  const res = {
    headersSent: false,
    setHeader(k, v) { headers[k] = v; },
    status(code) { statusCode = code; return this; },
    json(payload) { jsonBody = payload; return this; },
    write(chunk) { this.headersSent = true; chunks.push(chunk); },
    end() { ended = true; },
  };
  await handler({ query }, res);
  return { statusCode, jsonBody, headers, body: chunks.join(''), ended };
}

function row(id, ts, overrides = {}) {
  return {
    id,
    timestamp: new Date(ts),
    cursor_ts: `${ts.replace('T', ' ').replace('Z', '')}123+00`,
    accessory_id: 'a1',
    accessory_name: 'Lamp',
    room_name: 'Old Room',
    service_type: 'Lightbulb',
    characteristic: 'On',
    old_value: 'false',
    new_value: 'true',
    protocol: 'homekit',
    transport: 'ip',
    endpoint_id: null,
    cluster_id: null,
    attribute_id: null,
    raw_iid: 9,
    ...overrides,
  };
}

// Pool serving `rows` in keyset batches, recording each query.
function makePool(rows, total = rows.length) {
  const seen = [];
  return {
    seen,
    async query(sql, params = []) {
      seen.push({ sql, params });
      if (sql.includes('COUNT(*)')) return { rows: [{ total: String(total) }] };
      const limit = params[params.length - 1];
      const hasCursor = sql.includes('(timestamp, id) >');
      const afterId = hasCursor ? params[params.length - 2] : 0;
      return { rows: rows.filter((r) => r.id > afterId).slice(0, limit) };
    },
  };
}

test('buildEventFilters builds the same conditions the Timeline list uses', () => {
  const { conditions, params } = buildEventFilters({ room: 'Kitchen', accessory: 'lamp', characteristic: 'On', from: 'a', to: 'b' });
  assert.deepEqual(conditions, [
    'room_name = $1', 'accessory_name ILIKE $2', 'characteristic = $3', 'timestamp >= $4', 'timestamp <= $5',
  ]);
  assert.deepEqual(params, ['Kitchen', '%lamp%', 'On', 'a', 'b']);
});

test('GET /events/export streams CSV with a real BOM, header row, room overrides and filters', async () => {
  const pool = makePool([row(1, '2026-10-01T10:00:00Z'), row(2, '2026-10-01T11:00:00Z', { accessory_name: '=cmd()' })]);
  const router = createEventsRouter({ pool, getRooms: () => ({ a1: 'Kitchen' }) });
  const res = await invokeStream(getRouteHandler(router, 'GET', '/events/export'), { format: 'csv', room: 'Old Room' });

  assert.equal(res.statusCode, 200);
  assert.ok(res.ended);
  assert.match(res.headers['Content-Type'], /text\/csv/);
  assert.match(res.headers['Content-Disposition'], /homechronicle-events-\d{8}-\d{4}\.csv/);
  assert.equal(res.headers['X-Export-Rows'], '2');
  assert.equal(Buffer.from(res.body, 'utf8').subarray(0, 3).toString('hex'), 'efbbbf');
  const lines = res.body.slice(1).trim().split('\n');
  assert.equal(lines[0], 'id,timestamp,accessory_id,accessory_name,room_name,service_type,characteristic,old_value,new_value,protocol,transport,endpoint_id,cluster_id,attribute_id,raw_iid');
  assert.equal(lines.length, 3);
  assert.match(lines[1], /^1,2026-10-01T10:00:00.000Z,a1,Lamp,Kitchen,/);
  assert.match(lines[2], /,'=cmd\(\),/, 'formula-leading names are neutralised');
  assert.ok(pool.seen.every((q) => q.sql.includes('COUNT(*)') || q.sql.includes('room_name = $1')));
  assert.ok(pool.seen.find((q) => q.sql.includes('ORDER BY timestamp ASC, id ASC')));
});

test('GET /events/export pages with a text timestamp cursor so microseconds are not lost', async () => {
  const rows = Array.from({ length: 5001 }, (_, i) => row(i + 1, '2026-10-01T10:00:00Z'));
  const pool = makePool(rows);
  const router = createEventsRouter({ pool, getRooms: () => ({}) });
  const res = await invokeStream(getRouteHandler(router, 'GET', '/events/export'), { format: 'csv' });

  assert.equal(res.body.trim().split('\n').length, 5002);
  const second = pool.seen.filter((q) => q.sql.includes('ORDER BY'))[1];
  assert.match(second.sql, /\(timestamp, id\) > \(\$1::timestamptz, \$2\)/);
  assert.equal(typeof second.params[0], 'string');
  assert.equal(second.params[1], 5000);
});

test('GET /events/export returns valid JSON, including when empty', async () => {
  for (const rows of [[row(1, '2026-10-01T10:00:00Z'), row(2, '2026-10-01T11:00:00Z')], []]) {
    const router = createEventsRouter({ pool: makePool(rows), getRooms: () => ({}) });
    const res = await invokeStream(getRouteHandler(router, 'GET', '/events/export'), { format: 'json' });
    const parsed = JSON.parse(res.body);
    assert.equal(parsed.length, rows.length);
    if (rows.length) {
      assert.equal(parsed[0].accessory_name, 'Lamp');
      assert.ok(!('cursor_ts' in parsed[0]));
    }
  }
});

test('GET /events/export flags truncation at the row cap', async () => {
  const router = createEventsRouter({ pool: makePool([row(1, '2026-10-01T10:00:00Z')], 900_000), getRooms: () => ({}) });
  const res = await invokeStream(getRouteHandler(router, 'GET', '/events/export'), { format: 'csv' });
  assert.equal(res.headers['X-Export-Total'], '900000');
  assert.equal(res.headers['X-Export-Rows'], '500000');
  assert.equal(res.headers['X-Export-Truncated'], 'true');
});

test('GET /events/export rejects an unknown format', async () => {
  const router = createEventsRouter({ pool: makePool([]), getRooms: () => ({}) });
  const res = await invokeStream(getRouteHandler(router, 'GET', '/events/export'), { format: 'xml' });
  assert.equal(res.statusCode, 400);
});

// -- Streaming hygiene (code review #3): backpressure and client disconnect --

import { EventEmitter } from 'node:events';

function makeEmitterRes({ writeReturns = () => true } = {}) {
  const res = new EventEmitter();
  res.headersSent = false;
  res.chunks = [];
  res.setHeader = () => {};
  res.status = () => res;
  res.json = () => res;
  res.write = (chunk) => { res.headersSent = true; res.chunks.push(chunk); return writeReturns(res.chunks.length); };
  res.end = () => { res.ended = true; };
  return res;
}

test('GET /events/export waits for drain before querying the next batch', async () => {
  const rows = Array.from({ length: 10001 }, (_, i) => row(i + 1, '2026-10-01T10:00:00Z'));
  const pool = makePool(rows);
  const router = createEventsRouter({ pool, getRooms: () => ({}) });
  // Header write (1) is fine; the first data chunk (2) reports a full buffer.
  const res = makeEmitterRes({ writeReturns: (n) => n !== 2 });
  const done = getRouteHandler(router, 'GET', '/events/export')({ query: { format: 'csv' } }, res);

  await new Promise((r) => setTimeout(r, 20));
  const batchQueries = () => pool.seen.filter((q) => q.sql.includes('ORDER BY')).length;
  assert.equal(batchQueries(), 1, 'no second batch while the client buffer is full');
  res.emit('drain');
  await done;
  assert.equal(batchQueries(), 3);
  assert.ok(res.ended);
});

test('GET /events/export stops querying once the client disconnects', async () => {
  const rows = Array.from({ length: 20001 }, (_, i) => row(i + 1, '2026-10-01T10:00:00Z'));
  const pool = makePool(rows);
  const router = createEventsRouter({ pool, getRooms: () => ({}) });
  const res = makeEmitterRes({ writeReturns: (n) => n !== 2 });
  const done = getRouteHandler(router, 'GET', '/events/export')({ query: { format: 'csv' } }, res);

  await new Promise((r) => setTimeout(r, 20));
  res.emit('close');
  await done;
  assert.equal(pool.seen.filter((q) => q.sql.includes('ORDER BY')).length, 1);
});

test('GET /events/export/check reports the counts an export would have, without streaming', async () => {
  const pool = makePool([], 812345);
  const router = createEventsRouter({ pool, getRooms: () => ({}) });
  const handler = getRouteHandler(router, 'GET', '/events/export/check');
  const { statusCode, jsonBody, body } = await invokeStream(handler, { room: 'Kitchen' });

  assert.equal(statusCode, 200);
  assert.deepEqual(jsonBody, { total: 812345, rows: 500000, truncated: true });
  assert.equal(body, '');
  assert.equal(pool.seen.length, 1);
  assert.deepEqual(pool.seen[0].params, ['Kitchen']);
});

test('GET /events/export/check returns JSON 500 when the count fails', async () => {
  const pool = { async query() { throw new Error('db down'); } };
  const router = createEventsRouter({ pool, getRooms: () => ({}) });
  const handler = getRouteHandler(router, 'GET', '/events/export/check');
  const { statusCode, jsonBody } = await invokeStream(handler, {});
  assert.equal(statusCode, 500);
  assert.deepEqual(jsonBody, { error: 'Internal server error' });
});

test('GET /events/export/check reports 429 once the export limit is used up, without spending it', async () => {
  const prev = process.env.EVENTS_EXPORT_RATE_LIMIT_MAX;
  const pool = makePool([], 3);
  const router = createEventsRouter({ pool, getRooms: () => ({}) });
  const exportLayer = router.stack.find((l) => l.route?.path === '/events/export');
  const limiter = exportLayer.route.stack[0].handle;
  const check = getRouteHandler(router, 'GET', '/events/export/check');
  const req = { query: {}, ip: '10.9.9.9', headers: {}, app: { get: () => false } };
  const res = () => ({ statusCode: 200, setHeader() {}, getHeader() {}, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, send() { return this; }, on() {} });

  const first = res();
  await check(req, first);
  assert.equal(first.statusCode, 200, 'a check alone spends nothing');

  // Spend the whole export allowance (default 10) through the export limiter.
  for (let i = 0; i < 10; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => limiter(req, res(), resolve));
  }
  const blocked = res();
  await check(req, blocked);
  assert.equal(blocked.statusCode, 429);
  assert.equal(prev, process.env.EVENTS_EXPORT_RATE_LIMIT_MAX);
});
