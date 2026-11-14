/**
 * setup-store-caps.test.js — input caps on the member-writable JSON stores.
 *
 * PATCH /room, /category, /display-name and /note are deliberately not
 * admin-only, so any authenticated member can write them. They previously
 * accepted an uncapped, untyped `accessoryId` straight into a JSON-store KEY
 * and uncapped text into the value, which let a member grow rooms.json /
 * notes.json / display-names.json without bound (audit API L-3) and turned a
 * non-string value into a 500 via `.trim()`.
 *
 * These tests pin the write-side caps. They also pin the two properties the
 * caps must NOT break: clearing a key always works, and an entry that already
 * exists can still be updated once the store is at its ceiling.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSetupRouter } from '../src/setup-router.js';

function getRouteHandler(router, method, path) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (layer.route.path !== path) continue;
    if (!layer.route.methods[method.toLowerCase()]) continue;
    return layer.route.stack.at(-1).handle;
  }
  throw new Error(`Route not found: ${method} ${path}`);
}

async function invoke(handler, body = {}) {
  let statusCode = 200;
  let jsonBody = null;
  const req = { query: {}, params: {}, body };
  const res = {
    status(code) { statusCode = code; return this; },
    json(payload) { jsonBody = payload; return this; },
    setHeader() { return this; },
  };
  await handler(req, res);
  return { statusCode, jsonBody };
}

class MockHttpClient {
  async pairSetup() {}
  getLongTermData() { return { key: 'test' }; }
  async getAccessories() { return { accessories: [] }; }
}

/**
 * Build a router whose four stores are backed by mutable objects, so a test can
 * assert on what was actually persisted.
 */
function makeRouter(seed = {}) {
  const stores = {
    rooms: { ...(seed.rooms ?? {}) },
    categories: { ...(seed.categories ?? {}) },
    displayNames: { ...(seed.displayNames ?? {}) },
    notes: { ...(seed.notes ?? {}) },
  };
  const router = createSetupRouter({
    pool: { async query() { return { rows: [] }; } },
    getDiscoveryCache: () => [],
    setDiscoveryCache: () => {},
    runDiscoveryScan: async () => [],
    loadPairings: () => ({}),
    savePairings: async () => {},
    loadRooms: () => stores.rooms,
    saveRooms: async (next) => { stores.rooms = next; },
    loadCategories: () => stores.categories,
    saveCategories: async (next) => { stores.categories = next; },
    loadDisplayNames: () => stores.displayNames,
    saveDisplayNames: async (next) => { stores.displayNames = next; },
    loadNotes: () => stores.notes,
    saveNotes: async (next) => { stores.notes = next; },
    discoverDeviceForRepair: async () => null,
    savePairingForRepair: async () => {},
    startSubscribers: () => {},
    stopSubscriber: () => {},
    resetSubscriberStats: () => {},
    getPairingForLookup: () => null,
    HttpClient: MockHttpClient,
  });
  return { router, stores };
}

const LONG_KEY = 'k'.repeat(201);
const LONG_NAME = 'n'.repeat(201);

// Each case: the route, the field carrying free text, and the store it writes.
const TEXT_ROUTES = [
  { path: '/room', field: 'roomName', store: 'rooms', maxLen: 200 },
  { path: '/display-name', field: 'displayName', store: 'displayNames', maxLen: 200 },
  { path: '/note', field: 'note', store: 'notes', maxLen: 2000 },
];

// -- accessoryId (the store KEY) --

for (const { path } of [...TEXT_ROUTES, { path: '/category' }]) {
  test(`PATCH ${path} — rejects an over-long accessoryId instead of using it as a store key`, async () => {
    const { router, stores } = makeRouter();
    const handler = getRouteHandler(router, 'PATCH', path);
    const { statusCode, jsonBody } = await invoke(handler, { accessoryId: LONG_KEY, roomName: 'x', displayName: 'x', note: 'x', category: 'lighting' });

    assert.equal(statusCode, 400);
    assert.match(jsonBody.error, /accessoryId must be 200 characters or fewer/);
    for (const store of Object.values(stores)) {
      assert.deepEqual(store, {}, 'nothing may be persisted on a rejected write');
    }
  });

  test(`PATCH ${path} — rejects a non-string accessoryId`, async () => {
    const { router } = makeRouter();
    const handler = getRouteHandler(router, 'PATCH', path);
    const { statusCode, jsonBody } = await invoke(handler, { accessoryId: { evil: true }, roomName: 'x', displayName: 'x', note: 'x', category: 'lighting' });

    assert.equal(statusCode, 400);
    assert.match(jsonBody.error, /accessoryId is required/);
  });
}

// -- free-text values --

for (const { path, field, maxLen } of TEXT_ROUTES) {
  test(`PATCH ${path} — rejects ${field} over ${maxLen} characters`, async () => {
    const { router, stores } = makeRouter();
    const handler = getRouteHandler(router, 'PATCH', path);
    const { statusCode, jsonBody } = await invoke(handler, { accessoryId: 'AA:BB', [field]: 'x'.repeat(maxLen + 1) });

    assert.equal(statusCode, 400);
    assert.match(jsonBody.error, new RegExp(`${field} must be ${maxLen} characters or fewer`));
    for (const store of Object.values(stores)) {
      assert.deepEqual(store, {});
    }
  });

  test(`PATCH ${path} — rejects a non-string ${field} with 400, not a 500 from .trim()`, async () => {
    const { router } = makeRouter();
    const handler = getRouteHandler(router, 'PATCH', path);
    const { statusCode, jsonBody } = await invoke(handler, { accessoryId: 'AA:BB', [field]: 42 });

    assert.equal(statusCode, 400);
    assert.match(jsonBody.error, new RegExp(`${field} must be a string`));
  });

  // /display-name is excluded from the happy-path assertion below: its success
  // branch runs the history-rename pipeline, which needs a real pool. The cap
  // itself is asserted by the rejection tests above, which return before it.
  if (path === '/display-name') continue;

  test(`PATCH ${path} — accepts a value at exactly the cap`, async () => {
    const { router, stores } = makeRouter();
    const handler = getRouteHandler(router, 'PATCH', path);
    const atCap = 'x'.repeat(maxLen);
    const { statusCode } = await invoke(handler, { accessoryId: 'AA:BB', [field]: atCap });

    assert.equal(statusCode, 200);
    assert.equal(stores[field === 'note' ? 'notes' : 'rooms']['AA:BB'], atCap);
  });
}

// -- real-world key shapes must still be accepted --

test('PATCH /room — accepts the key shapes HomeChronicle actually uses', async () => {
  // HAP MAC, split-service id (MAC:aid:iid), Matter nodeId and nodeId:endpoint.
  const keys = ['AA:BB:CC:DD:EE:FF', 'AA:BB:CC:DD:EE:FF:1:12', '0123456789ABCDEF', '0123456789ABCDEF:3'];
  for (const key of keys) {
    const { router, stores } = makeRouter();
    const handler = getRouteHandler(router, 'PATCH', '/room');
    const { statusCode } = await invoke(handler, { accessoryId: key, roomName: 'Kitchen' });

    assert.equal(statusCode, 200, `key ${key} must be accepted`);
    assert.equal(stores.rooms[key], 'Kitchen');
  }
});

// -- the entry ceiling may never block a clear or an update --

test('PATCH /room — refuses a NEW key once the store is full', async () => {
  const rooms = {};
  for (let i = 0; i < 5000; i += 1) rooms[`dev-${i}`] = 'Room';
  const { router } = makeRouter({ rooms });
  const handler = getRouteHandler(router, 'PATCH', '/room');
  const { statusCode, jsonBody } = await invoke(handler, { accessoryId: 'brand-new', roomName: 'Kitchen' });

  assert.equal(statusCode, 400);
  assert.match(jsonBody.error, /Too many room entries/);
});

test('PATCH /room — a full store can still be UPDATED and CLEARED', async () => {
  const rooms = {};
  for (let i = 0; i < 5000; i += 1) rooms[`dev-${i}`] = 'Room';
  const { router, stores } = makeRouter({ rooms });
  const handler = getRouteHandler(router, 'PATCH', '/room');

  const updated = await invoke(handler, { accessoryId: 'dev-7', roomName: 'Kitchen' });
  assert.equal(updated.statusCode, 200, 'updating an existing key must not be blocked by the ceiling');
  assert.equal(stores.rooms['dev-7'], 'Kitchen');

  const cleared = await invoke(handler, { accessoryId: 'dev-7', roomName: '' });
  assert.equal(cleared.statusCode, 200, 'clearing must never be blocked — a full store must be recoverable');
  assert.equal('dev-7' in stores.rooms, false);
});

// -- the key cap must not lock out existing data or regress accepted input --

test('PATCH /room — a finite numeric accessoryId is coerced, not rejected', async () => {
  // The pre-cap code accepted any truthy value. A numeric Matter nodeId from an
  // older caller must keep working rather than 400 on every save.
  const { router, stores } = makeRouter();
  const handler = getRouteHandler(router, 'PATCH', '/room');
  const { statusCode } = await invoke(handler, { accessoryId: 12345, roomName: 'Hall' });

  assert.equal(statusCode, 200);
  assert.equal(stores.rooms['12345'], 'Hall');
});

test('PATCH /room — an over-long key that ALREADY exists can still be cleared', async () => {
  // The cap targets junk keys; keys written before it existed must stay
  // removable through the API instead of needing a hand-edit of rooms.json.
  const legacyKey = 'k'.repeat(400);
  const { router, stores } = makeRouter({ rooms: { [legacyKey]: 'Old' } });
  const handler = getRouteHandler(router, 'PATCH', '/room');
  const { statusCode } = await invoke(handler, { accessoryId: legacyKey, roomName: '' });

  assert.equal(statusCode, 200, 'an existing over-long key must be clearable');
  assert.equal(legacyKey in stores.rooms, false);
});

test('PATCH /room — an over-long key that does NOT exist is still refused', async () => {
  const { router, stores } = makeRouter({ rooms: { 'AA:BB': 'Kitchen' } });
  const handler = getRouteHandler(router, 'PATCH', '/room');
  const { statusCode } = await invoke(handler, { accessoryId: 'z'.repeat(400), roomName: 'New' });

  assert.equal(statusCode, 400);
  assert.deepEqual(stores.rooms, { 'AA:BB': 'Kitchen' }, 'the store is untouched');
});

test('PATCH /note — clearing an absent key is a no-op success', async () => {
  const { router, stores } = makeRouter();
  const handler = getRouteHandler(router, 'PATCH', '/note');
  const { statusCode } = await invoke(handler, { accessoryId: 'AA:BB' });

  assert.equal(statusCode, 200);
  assert.deepEqual(stores.notes, {});
});
