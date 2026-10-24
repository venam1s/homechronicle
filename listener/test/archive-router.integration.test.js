import test from 'node:test';
import assert from 'node:assert/strict';
import { createArchiveRouter } from '../src/archive-router.js';

function getRouteHandler(router, method, path) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (layer.route.path !== path) continue;
    if (!layer.route.methods[method.toLowerCase()]) continue;
    return layer.route.stack.at(-1).handle;
  }
  throw new Error(`Route not found: ${method} ${path}`);
}

async function invoke(handler, { query = {}, params = {}, body = {} } = {}) {
  let statusCode = 200;
  let jsonBody = null;
  const req = { query, params, body };
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      jsonBody = payload;
      return this;
    },
  };
  await handler(req, res);
  return { statusCode, jsonBody };
}

async function invokeStream(handler, { query = {}, params = {}, body = {} } = {}) {
  let statusCode = 200;
  let jsonBody = null;
  const chunks = [];
  const headers = {};
  let headersSent = false;

  const req = { query, params, body };
  const res = {
    headersSent,
    setHeader(name, val) {
      headers[name] = val;
      headersSent = true;
      this.headersSent = true;
    },
    write(chunk) {
      chunks.push(chunk);
    },
    end() {
      // stream ended
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      jsonBody = payload;
      return this;
    },
  };
  await handler(req, res);
  return { statusCode, jsonBody, chunks, headers };
}

function createStubDeps() {
  return {
    loadRooms: () => ({}),
    saveRooms: async () => {},
    loadDisplayNames: () => ({}),
    saveDisplayNames: async () => {},
    loadNotes: () => ({}),
    saveNotes: async () => {},
  };
}

// -- GET /archive/export --

test('GET /archive/export — happy path with data streams CSV rows', async () => {
  let callCount = 0;
  const pool = {
    async query(sql, _params) {
      callCount++;
      if (sql.includes('COUNT(*) AS cnt')) {
        return { rows: [{ cnt: '2' }] };
      }
      // First SELECT batch: return one row
      if (callCount === 2) {
        return {
          rows: [{
            source_id: '1',
            timestamp: new Date('2026-01-01T00:00:00.000Z'),
            accessory_id: 'a1',
            accessory_name: 'Lamp',
            room_name: 'Living',
            service_type: 'Lightbulb',
            characteristic: 'On',
            old_value: 'false',
            new_value: 'true',
            protocol: null,
            transport: null,
            endpoint_id: null,
            cluster_id: null,
            attribute_id: null,
            archived_at: null,
          }],
        };
      }
      // Second SELECT batch: empty — signals end
      return { rows: [] };
    },
  };

  const router = createArchiveRouter({ pool, ...createStubDeps() });
  const handler = getRouteHandler(router, 'GET', '/archive/export');
  const { statusCode, chunks, headers } = await invokeStream(handler);

  assert.equal(statusCode, 200);
  assert.ok(headers['Content-Type'].includes('text/csv'), 'Content-Type should be text/csv');
  assert.ok(headers['Content-Disposition'].includes('homechronicle-archive.csv'), 'Content-Disposition should include filename');
  assert.ok(chunks.length >= 2, `Expected at least 2 chunks (header + data row), got ${chunks.length}`);
  assert.ok(chunks[0].includes('source_id'), 'First chunk should be header row');
  assert.equal(
    Buffer.from(chunks[0], 'utf8').subarray(0, 3).toString('hex'),
    'efbbbf',
    'CSV must start with the UTF-8 BOM bytes, not the BOM characters re-encoded as mojibake',
  );
  assert.ok(chunks[1].includes('a1'), 'Second chunk should include accessory data');
});

test('GET /archive/export — empty archive returns 404', async () => {
  const pool = {
    async query(sql) {
      if (sql.includes('COUNT(*) AS cnt')) {
        return { rows: [{ cnt: '0' }] };
      }
      return { rows: [] };
    },
  };

  const router = createArchiveRouter({ pool, ...createStubDeps() });
  const handler = getRouteHandler(router, 'GET', '/archive/export');
  const { statusCode, jsonBody } = await invokeStream(handler);

  assert.equal(statusCode, 404);
  assert.ok(jsonBody.error.includes('No archived events'), `Expected 'No archived events' in error, got: ${jsonBody.error}`);
});

// -- GET /archive/count --

test('GET /archive/count — returns count as number', async () => {
  const pool = {
    async query() {
      return { rows: [{ count: '42' }] };
    },
  };

  const router = createArchiveRouter({ pool, ...createStubDeps() });
  const handler = getRouteHandler(router, 'GET', '/archive/count');
  const { statusCode, jsonBody } = await invoke(handler);

  assert.equal(statusCode, 200);
  assert.equal(jsonBody.count, 42);
});

// -- DELETE /data/accessory --

test('DELETE /data/accessory — happy path deletes events and cleans up stores', async () => {
  const pool = {
    async query() {
      return { rowCount: 5 };
    },
  };

  let savedRooms = null;
  let savedNames = null;
  let savedNotes = null;

  const deps = {
    loadRooms: () => ({ a1: 'Room' }),
    saveRooms: async (rooms) => { savedRooms = rooms; },
    loadDisplayNames: () => ({ a1: 'Name' }),
    saveDisplayNames: async (names) => { savedNames = names; },
    loadNotes: () => ({ a1: 'Note' }),
    saveNotes: async (notes) => { savedNotes = notes; },
  };

  const router = createArchiveRouter({ pool, ...deps });
  const handler = getRouteHandler(router, 'DELETE', '/data/accessory');
  const { statusCode, jsonBody } = await invoke(handler, { body: { accessoryId: 'a1' } });

  assert.equal(statusCode, 200);
  assert.equal(jsonBody.success, true);
  assert.equal(jsonBody.deleted, 5);
  assert.ok(!('a1' in savedRooms), 'a1 should be removed from rooms');
  assert.ok(!('a1' in savedNames), 'a1 should be removed from display names');
  assert.ok(!('a1' in savedNotes), 'a1 should be removed from notes');
});

test('DELETE /data/accessory — missing accessoryId returns 400', async () => {
  const pool = { async query() { return { rowCount: 0 }; } };

  const router = createArchiveRouter({ pool, ...createStubDeps() });
  const handler = getRouteHandler(router, 'DELETE', '/data/accessory');
  const { statusCode, jsonBody } = await invoke(handler, { body: {} });

  assert.equal(statusCode, 400);
  assert.ok(jsonBody.error.includes('accessoryId'), `Expected 'accessoryId' in error, got: ${jsonBody.error}`);
});

// -- DELETE /data/all --

test('DELETE /data/all — happy path wipes all events and stores', async () => {
  const pool = {
    async query() {
      return { rowCount: 100 };
    },
  };

  let savedRooms = null;
  let savedNames = null;
  let savedNotes = null;

  const deps = {
    loadRooms: () => ({}),
    saveRooms: async (rooms) => { savedRooms = rooms; },
    loadDisplayNames: () => ({}),
    saveDisplayNames: async (names) => { savedNames = names; },
    loadNotes: () => ({}),
    saveNotes: async (notes) => { savedNotes = notes; },
  };

  const router = createArchiveRouter({ pool, ...deps });
  const handler = getRouteHandler(router, 'DELETE', '/data/all');
  const { statusCode, jsonBody } = await invoke(handler, { body: { confirm: 'DELETE ALL' } });

  assert.equal(statusCode, 200);
  assert.equal(jsonBody.success, true);
  assert.equal(jsonBody.deleted, 100);
  assert.deepEqual(savedRooms, {});
  assert.deepEqual(savedNames, {});
  assert.deepEqual(savedNotes, {});
});

test('DELETE /data/all — missing confirm returns 400', async () => {
  const pool = { async query() { return { rowCount: 0 }; } };

  const router = createArchiveRouter({ pool, ...createStubDeps() });
  const handler = getRouteHandler(router, 'DELETE', '/data/all');
  const { statusCode, jsonBody } = await invoke(handler, { body: {} });

  assert.equal(statusCode, 400);
  assert.ok(jsonBody.error.includes('DELETE ALL'), `Expected 'DELETE ALL' in error, got: ${jsonBody.error}`);
});
