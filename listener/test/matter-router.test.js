import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatterRouter } from '../src/matter-router.js';

function getRouteHandler(router, method, path) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (layer.route.path !== path) continue;
    if (!layer.route.methods[method.toLowerCase()]) continue;
    // Return the last handler in the stack (skip middleware like rate limiters)
    const stack = layer.route.stack;
    return stack[stack.length - 1].handle;
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

test('/api/setup/matter/pair stores Matter pairing metadata', async () => {
  let pairings = {};
  const router = createMatterRouter({
    insertEvent: async () => ({ id: 1, timestamp: new Date().toISOString() }),
    loadPairings: () => pairings,
    savePairings: async (next) => { pairings = next; },
    loadRooms: () => ({}),
    saveRooms: async () => {},
    loadNotes: () => ({}),
    saveNotes: async () => {},
    matterRuntime: null,
  });
  const handler = getRouteHandler(router, 'POST', '/setup/matter/pair');

  const response = await invoke(handler, {
    body: {
      nodeId: '0x1234abcd',
      name: 'Porch Sensor',
      transport: 'thread',
      address: 'fd00::10',
      port: 5540,
    },
  });

  const nodeKey = '305441741';
  assert.equal(response.statusCode, 200);
  assert.equal(response.jsonBody.success, true);
  assert.equal(pairings[nodeKey].protocol, 'matter');
  assert.equal(pairings[nodeKey].name, 'Porch Sensor');
  assert.equal(pairings[nodeKey].transport, 'thread');
  assert.equal(pairings[nodeKey].manualImport, true);
});

test('/api/setup/matter/pair generates nodeId when missing', async () => {
  let pairings = {};
  const calls = [];
  const runtime = {
    getStatus() {
      return { ok: true };
    },
    async commission(payload) {
      calls.push(payload);
      return { stdout: 'ok', stderr: '' };
    },
  };
  const router = createMatterRouter({
    insertEvent: async () => ({ id: 1, timestamp: new Date().toISOString() }),
    loadPairings: () => pairings,
    savePairings: async (next) => { pairings = next; },
    loadRooms: () => ({}),
    saveRooms: async () => {},
    matterRuntime: runtime,
  });
  const handler = getRouteHandler(router, 'POST', '/setup/matter/pair');

  const response = await invoke(handler, {
    body: {
      name: 'Generated Node',
      setupCode: 'MT:GENERATE',
      transport: 'ip',
      address: '192.168.1.55',
      port: 5540,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.jsonBody.success, true);
  assert.match(response.jsonBody.pairing.nodeId, /^0X[0-9A-F]{16}$/);
  assert.equal(pairings[response.jsonBody.pairing.nodeId].name, 'Generated Node');
  assert.equal(pairings[response.jsonBody.pairing.nodeId].protocol, 'matter');
  assert.equal(calls.length, 1);
});

test('/api/setup/matter/pair requires nodeId when setupCode is missing', async () => {
  const router = createMatterRouter({
    insertEvent: async () => ({ id: 1, timestamp: new Date().toISOString() }),
    loadPairings: () => ({}),
    savePairings: async () => {},
    loadRooms: () => ({}),
    saveRooms: async () => {},
    matterRuntime: null,
  });
  const handler = getRouteHandler(router, 'POST', '/setup/matter/pair');

  const response = await invoke(handler, {
    body: {
      name: 'Missing IDs',
    },
  });

  assert.equal(response.statusCode, 400);
  assert.match(response.jsonBody.error, /nodeId is required/i);
});

test('/api/matter/events inserts normalized Matter events', async () => {
  const inserted = [];
  const txQueries = [];
  const mockPool = {
    async connect() {
      return {
        async query(sql) { txQueries.push(sql.trim()); },
        release() {},
      };
    },
  };
  const router = createMatterRouter({
    insertEvent: async (event) => {
      inserted.push(event);
      return { id: inserted.length, timestamp: new Date().toISOString() };
    },
    pool: mockPool,
    loadPairings: () => ({
      '6699': {
        protocol: 'matter',
        name: 'Kitchen Contact',
        transport: 'thread',
        deviceType: 'ContactSensor',
      },
    }),
    savePairings: async () => {},
    loadRooms: () => ({ '6699:1': 'Kitchen' }),
    saveRooms: async () => {},
    loadNotes: () => ({}),
    saveNotes: async () => {},
    matterRuntime: null,
  });
  const handler = getRouteHandler(router, 'POST', '/matter/events');

  const response = await invoke(handler, {
    body: {
      events: [{
        nodeId: '0x1a2b',
        endpointId: 1,
        clusterId: 29,
        attributeId: 0,
        newValue: true,
      }],
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.jsonBody.inserted, 1);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].protocol, 'matter');
  assert.equal(inserted[0].transport, 'thread');
  assert.equal(inserted[0].accessoryId, '6699:1');
  assert.equal(inserted[0].roomName, 'Kitchen');
  assert.equal(inserted[0].characteristic, 'cluster:29/attribute:0');
});

test('/api/matter/events validates required fields', async () => {
  const router = createMatterRouter({
    insertEvent: async () => ({ id: 1, timestamp: new Date().toISOString() }),
    pool: { async connect() { return { async query() {}, release() {} }; } },
    loadPairings: () => ({}),
    savePairings: async () => {},
    loadRooms: () => ({}),
    saveRooms: async () => {},
    matterRuntime: null,
  });
  const handler = getRouteHandler(router, 'POST', '/matter/events');

  const response = await invoke(handler, {
    body: {
      events: [{ characteristic: 'On', newValue: true }],
    },
  });

  assert.equal(response.statusCode, 400);
  assert.match(response.jsonBody.error, /nodeId/i);
});

test('/api/setup/matter/commission calls matter runtime', async () => {
  const calls = [];
  const runtime = {
    getStatus() {
      return { ok: true };
    },
    async commission(payload) {
      calls.push(payload);
      return { stdout: 'ok', stderr: '' };
    },
  };
  const router = createMatterRouter({
    insertEvent: async () => ({ id: 1, timestamp: new Date().toISOString() }),
    loadPairings: () => ({}),
    savePairings: async () => {},
    loadRooms: () => ({}),
    saveRooms: async () => {},
    matterRuntime: runtime,
  });
  const handler = getRouteHandler(router, 'POST', '/setup/matter/commission');

  const response = await invoke(handler, {
    body: { nodeId: '0xabc', setupCode: 'MT:1234', transport: 'thread' },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.jsonBody.success, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].nodeId, '2748');
  assert.equal(calls[0].setupCode, 'MT:1234');
});

test('/api/setup/matter/pair commissions when setupCode is provided', async () => {
  let pairings = {};
  const calls = [];
  const runtime = {
    getStatus() {
      return { ok: true };
    },
    async commission(payload) {
      calls.push(payload);
      return { stdout: 'ok', stderr: '' };
    },
  };
  const router = createMatterRouter({
    insertEvent: async () => ({ id: 1, timestamp: new Date().toISOString() }),
    loadPairings: () => pairings,
    savePairings: async (next) => { pairings = next; },
    loadRooms: () => ({}),
    saveRooms: async () => {},
    loadNotes: () => ({}),
    saveNotes: async () => {},
    matterRuntime: runtime,
  });
  const handler = getRouteHandler(router, 'POST', '/setup/matter/pair');

  const response = await invoke(handler, {
    body: {
      nodeId: '0x2a',
      name: 'Door Sensor',
      setupCode: 'MT:AAAA',
      commissioningMethod: 'code',
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.jsonBody.success, true);
  assert.equal(calls.length, 1);
  assert.equal(pairings['42'].protocol, 'matter');
  assert.equal(pairings['42'].manualImport, undefined);
});

// --- Additional hardening tests ---

function makeTransactionClient(state) {
  return {
    queries: state.txQueries,
    async query(sql) {
      state.txQueries.push(sql.trim());
    },
    release() {
      state.txReleased = true;
    },
  };
}

function makeDefaultPool(state) {
  return {
    async connect() {
      return makeTransactionClient(state);
    },
    async query(sql, params) {
      state.queries.push({ sql, params });
      return { rows: [], rowCount: 0 };
    },
  };
}

function makeRouter(overrides = {}) {
  const state = {
    pairings: overrides.pairings ?? {},
    rooms: overrides.rooms ?? {},
    notes: overrides.notes ?? {},
    inserted: [],
    queries: [],
    txQueries: [],
    txReleased: false,
  };

  const defaultInsertEvent = async (evt) => {
    state.inserted.push(evt);
    return { id: state.inserted.length, timestamp: new Date().toISOString() };
  };

  const router = createMatterRouter({
    insertEvent: overrides.insertEvent ?? defaultInsertEvent,
    pool: overrides.pool !== undefined ? overrides.pool : makeDefaultPool(state),
    loadPairings: () => state.pairings,
    savePairings: async (next) => { state.pairings = next; },
    loadRooms: () => state.rooms,
    saveRooms: async (next) => { state.rooms = next; },
    loadNotes: () => state.notes,
    saveNotes: async (next) => { state.notes = next; },
    matterRuntime: overrides.matterRuntime ?? null,
    getMatterDiscoveryCache: overrides.getMatterDiscoveryCache ?? (() => []),
    setMatterDiscoveryCache: overrides.setMatterDiscoveryCache ?? (() => {}),
  });
  return { router, state };
}

// --- DELETE pairing tests ---

test('DELETE /setup/matter/pairing removes pairing, rooms, and notes', async () => {
  const { router, state } = makeRouter({
    pairings: {
      '100': { protocol: 'matter', nodeId: '100', name: 'Sensor' },
    },
    rooms: { '100': 'Kitchen', '100:1': 'Kitchen', '200': 'Bedroom' },
    notes: { '100': 'test note', '100:1': 'endpoint note', '200': 'other' },
  });
  const handler = getRouteHandler(router, 'DELETE', '/setup/matter/pairing/:nodeId');

  const response = await invoke(handler, { params: { nodeId: '100' } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.jsonBody.success, true);
  assert.equal(state.pairings['100'], undefined);
  assert.equal(state.rooms['100'], undefined);
  assert.equal(state.rooms['100:1'], undefined);
  assert.equal(state.rooms['200'], 'Bedroom'); // should not be deleted
  assert.equal(state.notes['100'], undefined);
  assert.equal(state.notes['100:1'], undefined);
  assert.equal(state.notes['200'], 'other');
});

test('DELETE /setup/matter/pairing returns 404 for non-existent pairing', async () => {
  const { router } = makeRouter();
  const handler = getRouteHandler(router, 'DELETE', '/setup/matter/pairing/:nodeId');

  const response = await invoke(handler, { params: { nodeId: '999' } });
  assert.equal(response.statusCode, 404);
  assert.match(response.jsonBody.error, /not found/i);
});

test('DELETE /setup/matter/pairing returns 404 for homekit pairing', async () => {
  const { router } = makeRouter({
    pairings: { '100': { protocol: 'homekit', name: 'Bridge' } },
  });
  const handler = getRouteHandler(router, 'DELETE', '/setup/matter/pairing/:nodeId');

  const response = await invoke(handler, { params: { nodeId: '100' } });
  assert.equal(response.statusCode, 404);
});

test('DELETE /setup/matter/pairing returns 400 for empty nodeId', async () => {
  const { router } = makeRouter();
  const handler = getRouteHandler(router, 'DELETE', '/setup/matter/pairing/:nodeId');

  const response = await invoke(handler, { params: { nodeId: '' } });
  assert.equal(response.statusCode, 400);
});

// The UI promises "Event data is not deleted" when unpairing, and HomeKit's
// unpair keeps history too. The purge here was dead code (index.js never passed
// `pool`), so wiring the pool in for /matter/events must not switch it on.
test('DELETE /setup/matter/pairing keeps the node\'s event history', async () => {
  const queries = [];
  const mockPool = {
    async query(sql, params) {
      queries.push({ sql, params });
      return { rowCount: 5 };
    },
  };
  const { router } = makeRouter({
    pairings: { '100': { protocol: 'matter', nodeId: '100', name: 'Sensor' } },
    pool: mockPool,
  });
  const handler = getRouteHandler(router, 'DELETE', '/setup/matter/pairing/:nodeId');

  const response = await invoke(handler, { params: { nodeId: '100' } });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.jsonBody, { success: true });
  assert.equal(queries.length, 0);
});

// --- GET pairings tests ---

test('GET /setup/matter/pairings returns only matter pairings', async () => {
  const { router } = makeRouter({
    pairings: {
      '100': { protocol: 'matter', nodeId: '100', name: 'Matter Device', transport: 'ip' },
      'abc-def': { protocol: 'homekit', name: 'HAP Bridge' },
      '200': { protocol: 'matter', nodeId: '200', name: 'Thread Sensor', transport: 'thread' },
    },
  });
  const handler = getRouteHandler(router, 'GET', '/setup/matter/pairings');

  const response = await invoke(handler);
  assert.equal(response.statusCode, 200);
  assert.equal(response.jsonBody.length, 2);
  assert.ok(response.jsonBody.every((p) => p.protocol === 'matter'));
});

// --- GET runtime tests ---

test('GET /setup/matter/runtime returns 503 when no runtime', async () => {
  const { router } = makeRouter({ matterRuntime: null });
  const handler = getRouteHandler(router, 'GET', '/setup/matter/runtime');

  const response = await invoke(handler);
  assert.equal(response.statusCode, 503);
  assert.match(response.jsonBody.error, /unavailable/i);
});

test('GET /setup/matter/runtime returns status when runtime exists', async () => {
  const { router } = makeRouter({
    matterRuntime: {
      getStatus: () => ({ controllerReady: true, nodes: [] }),
    },
  });
  const handler = getRouteHandler(router, 'GET', '/setup/matter/runtime');

  const response = await invoke(handler);
  assert.equal(response.statusCode, 200);
  assert.equal(response.jsonBody.controllerReady, true);
});

// --- POST commission edge cases ---

test('POST /setup/matter/commission returns 503 without runtime', async () => {
  const { router } = makeRouter({ matterRuntime: null });
  const handler = getRouteHandler(router, 'POST', '/setup/matter/commission');

  const response = await invoke(handler, {
    body: { setupCode: 'MT:1234' },
  });
  assert.equal(response.statusCode, 503);
});

test('POST /setup/matter/commission returns 400 without setupCode', async () => {
  const { router } = makeRouter({
    matterRuntime: { commission: async () => ({}) },
  });
  const handler = getRouteHandler(router, 'POST', '/setup/matter/commission');

  const response = await invoke(handler, { body: {} });
  assert.equal(response.statusCode, 400);
  assert.match(response.jsonBody.error, /setupCode/i);
});

test('POST /setup/matter/commission returns 400 on commission error', async () => {
  const { router } = makeRouter({
    matterRuntime: {
      commission: async () => { throw new Error('Commissioning timed out'); },
    },
  });
  const handler = getRouteHandler(router, 'POST', '/setup/matter/commission');

  const response = await invoke(handler, {
    body: { setupCode: 'MT:1234' },
  });
  assert.equal(response.statusCode, 400);
  assert.match(response.jsonBody.error, /commissioning failed/i);
});

// --- POST /setup/matter/pair edge cases ---

test('POST /setup/matter/pair requires name', async () => {
  const { router } = makeRouter();
  const handler = getRouteHandler(router, 'POST', '/setup/matter/pair');

  const response = await invoke(handler, {
    body: { nodeId: '100' },
  });
  assert.equal(response.statusCode, 400);
  assert.match(response.jsonBody.error, /name is required/i);
});

test('POST /setup/matter/pair returns 503 with setupCode but no runtime', async () => {
  const { router } = makeRouter({ matterRuntime: null });
  const handler = getRouteHandler(router, 'POST', '/setup/matter/pair');

  const response = await invoke(handler, {
    body: { name: 'Test Device', setupCode: 'MT:1234' },
  });
  assert.equal(response.statusCode, 503);
  assert.match(response.jsonBody.error, /not available/i);
});

test('POST /setup/matter/pair returns 400 when commissioning fails', async () => {
  const { router } = makeRouter({
    matterRuntime: {
      commission: async () => { throw new Error('Network unreachable'); },
    },
  });
  const handler = getRouteHandler(router, 'POST', '/setup/matter/pair');

  const response = await invoke(handler, {
    body: { nodeId: '100', name: 'Test Device', setupCode: 'MT:1234' },
  });
  assert.equal(response.statusCode, 400);
  assert.match(response.jsonBody.error, /pairing failed/i);
});

test('POST /setup/matter/pair uses actual nodeId from commissioning result', async () => {
  let pairings = {};
  const { router } = makeRouter({
    pairings,
    matterRuntime: {
      commission: async () => ({ nodeId: '999' }),
    },
  });
  // We need to access the state via the router's closure
  const handler = getRouteHandler(router, 'POST', '/setup/matter/pair');

  const response = await invoke(handler, {
    body: { nodeId: '100', name: 'Remapped Node', setupCode: 'MT:1234' },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.jsonBody.pairing.nodeId, '999');
});

// --- POST /matter/events edge cases ---

test('POST /matter/events rejects empty events array', async () => {
  const { router } = makeRouter();
  const handler = getRouteHandler(router, 'POST', '/matter/events');

  const response = await invoke(handler, { body: { events: [] } });
  assert.equal(response.statusCode, 400);
  assert.match(response.jsonBody.error, /events array/i);
});

test('POST /matter/events rejects event without newValue', async () => {
  const { router } = makeRouter();
  const handler = getRouteHandler(router, 'POST', '/matter/events');

  const response = await invoke(handler, {
    body: { events: [{ nodeId: '100', characteristic: 'OnOff' }] },
  });
  assert.equal(response.statusCode, 400);
  assert.match(response.jsonBody.error, /newValue/i);
});

test('POST /matter/events rejects event without characteristic or clusterId+attributeId', async () => {
  const { router } = makeRouter();
  const handler = getRouteHandler(router, 'POST', '/matter/events');

  const response = await invoke(handler, {
    body: { events: [{ nodeId: '100', newValue: true }] },
  });
  assert.equal(response.statusCode, 400);
  assert.match(response.jsonBody.error, /characteristic/i);
});

test('POST /matter/events accepts single event object via event field', async () => {
  const { router, state } = makeRouter({
    pairings: { '100': { protocol: 'matter', name: 'Test' } },
  });
  const handler = getRouteHandler(router, 'POST', '/matter/events');

  const response = await invoke(handler, {
    body: {
      event: { nodeId: '100', characteristic: 'OnOff', newValue: true },
    },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.jsonBody.inserted, 1);
  assert.equal(state.inserted.length, 1);
});

test('POST /matter/events handles multiple events in batch', async () => {
  const { router, state } = makeRouter({
    pairings: { '100': { protocol: 'matter', name: 'Multi' } },
  });
  const handler = getRouteHandler(router, 'POST', '/matter/events');

  const response = await invoke(handler, {
    body: {
      events: [
        { nodeId: '100', endpointId: 1, characteristic: 'OnOff', newValue: true },
        { nodeId: '100', endpointId: 2, characteristic: 'OnOff', newValue: false },
        { nodeId: '100', endpointId: 1, characteristic: 'CurrentLevel', newValue: 75 },
      ],
    },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.jsonBody.inserted, 3);
  assert.equal(state.inserted.length, 3);
  assert.equal(state.inserted[0].accessoryId, '100:1');
  assert.equal(state.inserted[1].accessoryId, '100:2');
});

test('POST /matter/events uses deviceId/pairingId as fallback for nodeId', async () => {
  const { router, state } = makeRouter({
    pairings: { '100': { protocol: 'matter', name: 'Fallback' } },
  });
  const handler = getRouteHandler(router, 'POST', '/matter/events');

  const response = await invoke(handler, {
    body: {
      events: [{ deviceId: '100', characteristic: 'OnOff', newValue: true }],
    },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(state.inserted[0].accessoryId, '100');
});

test('POST /matter/events constructs characteristic from clusterId+attributeId', async () => {
  const { router, state } = makeRouter({
    pairings: { '100': { protocol: 'matter', name: 'Cluster' } },
  });
  const handler = getRouteHandler(router, 'POST', '/matter/events');

  const response = await invoke(handler, {
    body: {
      events: [{
        nodeId: '100', endpointId: 1,
        clusterId: 6, attributeId: 0,
        newValue: true,
      }],
    },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(state.inserted[0].characteristic, 'cluster:6/attribute:0');
});

test('POST /matter/events preserves oldValue as string', async () => {
  const { router, state } = makeRouter({
    pairings: { '100': { protocol: 'matter', name: 'OldVal' } },
  });
  const handler = getRouteHandler(router, 'POST', '/matter/events');

  const response = await invoke(handler, {
    body: {
      events: [{
        nodeId: '100', characteristic: 'OnOff',
        oldValue: false, newValue: true,
      }],
    },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(state.inserted[0].oldValue, 'false');
});

test('POST /matter/events sets null oldValue for missing/null oldValue', async () => {
  const { router, state } = makeRouter({
    pairings: { '100': { protocol: 'matter', name: 'NullOld' } },
  });
  const handler = getRouteHandler(router, 'POST', '/matter/events');

  await invoke(handler, {
    body: {
      events: [
        { nodeId: '100', characteristic: 'OnOff', newValue: true },
        { nodeId: '100', characteristic: 'Level', oldValue: null, newValue: 50 },
      ],
    },
  });
  assert.equal(state.inserted[0].oldValue, null);
  assert.equal(state.inserted[1].oldValue, null);
});

// --- GET /setup/matter/discovered tests ---

test('GET /setup/matter/discovered returns cached devices with pairing status', async () => {
  const cache = [
    { id: 'dev1', instanceName: 'dev1', name: 'Device 1' },
    { id: 'dev2', instanceName: 'dev2', name: 'Device 2' },
  ];
  const { router } = makeRouter({
    pairings: { '100': { protocol: 'matter', nodeId: 'dev1', name: 'Paired' } },
    getMatterDiscoveryCache: () => cache,
  });
  const handler = getRouteHandler(router, 'GET', '/setup/matter/discovered');

  const response = await invoke(handler);
  assert.equal(response.statusCode, 200);
  assert.equal(response.jsonBody.devices.length, 2);
  assert.equal(response.jsonBody.devices[0].alreadyPaired, true);
  assert.equal(response.jsonBody.devices[1].alreadyPaired, false);
  assert.ok(response.jsonBody.cachedAt);
});

// --- POST /setup/matter/scan tests ---

test('POST /setup/matter/scan returns 503 without runtime', async () => {
  const { router } = makeRouter({ matterRuntime: null });
  const handler = getRouteHandler(router, 'POST', '/setup/matter/scan');

  const response = await invoke(handler);
  assert.equal(response.statusCode, 503);
});

test('POST /setup/matter/scan returns discovered devices', async () => {
  let cachedDevices = [];
  const { router } = makeRouter({
    matterRuntime: {
      scan: async () => [
        { instanceName: 'sensor1', deviceName: 'Motion', discriminator: 1234, address: '192.168.1.50', addresses: ['192.168.1.50'], port: 5540 },
      ],
    },
    setMatterDiscoveryCache: (d) => { cachedDevices = d; },
  });
  const handler = getRouteHandler(router, 'POST', '/setup/matter/scan');

  const response = await invoke(handler);
  assert.equal(response.statusCode, 200);
  assert.equal(response.jsonBody.devices.length, 1);
  assert.equal(response.jsonBody.devices[0].name, 'Motion');
  assert.equal(cachedDevices.length, 1);
});

test('POST /setup/matter/scan returns cached devices on error', async () => {
  const cachedDevices = [{ id: 'old', name: 'Cached' }];
  const { router } = makeRouter({
    matterRuntime: {
      scan: async () => { throw new Error('mDNS failed'); },
    },
    getMatterDiscoveryCache: () => cachedDevices,
  });
  const handler = getRouteHandler(router, 'POST', '/setup/matter/scan');

  const response = await invoke(handler);
  // Returns 200 with warning, not 500
  assert.equal(response.statusCode, 200);
  assert.ok(response.jsonBody.warning);
  assert.match(response.jsonBody.warning, /Matter scan failed/);
  assert.equal(response.jsonBody.devices.length, 1);
});

// --- /matter/events transaction tests (task 8) ---

test('POST /matter/events rejects batches over 1000 events before any DB work', async () => {
  const connectCalls = [];
  const { router } = makeRouter({
    pool: {
      async connect() {
        connectCalls.push(true);
        return { async query() {}, release() {} };
      },
    },
    pairings: { '100': { protocol: 'matter', name: 'Bulb' } },
  });
  const handler = getRouteHandler(router, 'POST', '/matter/events');

  const events = Array.from({ length: 1001 }, (_, i) => ({
    nodeId: '100', characteristic: 'OnOff', newValue: i % 2 === 0,
  }));
  const response = await invoke(handler, { body: { events } });

  assert.equal(response.statusCode, 400);
  assert.match(response.jsonBody.error, /too many events/i);
  assert.equal(connectCalls.length, 0, 'pool.connect() must not be called before the cap check');
});

test('POST /matter/events wraps successful batch in BEGIN/COMMIT transaction', async () => {
  const txQueries = [];
  let released = false;
  const { router } = makeRouter({
    pool: {
      async connect() {
        return {
          async query(sql) { txQueries.push(sql.trim()); },
          release() { released = true; },
        };
      },
    },
    pairings: { '100': { protocol: 'matter', name: 'Sensor' } },
  });
  const handler = getRouteHandler(router, 'POST', '/matter/events');

  const response = await invoke(handler, {
    body: {
      events: [
        { nodeId: '100', characteristic: 'OnOff', newValue: true },
        { nodeId: '100', characteristic: 'OnOff', newValue: false },
      ],
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.jsonBody.inserted, 2);
  assert.equal(txQueries[0], 'BEGIN');
  assert.equal(txQueries.at(-1), 'COMMIT');
  assert.equal(released, true);
});

test('POST /matter/events triggers ROLLBACK and no COMMIT on insert failure', async () => {
  const txQueries = [];
  let released = false;
  let insertCount = 0;
  const { router } = makeRouter({
    insertEvent: async () => {
      insertCount += 1;
      if (insertCount === 2) throw new Error('DB constraint violation');
      return { id: insertCount, timestamp: new Date().toISOString() };
    },
    pool: {
      async connect() {
        return {
          async query(sql) { txQueries.push(sql.trim()); },
          release() { released = true; },
        };
      },
    },
    pairings: { '100': { protocol: 'matter', name: 'Sensor' } },
  });
  const handler = getRouteHandler(router, 'POST', '/matter/events');

  const response = await invoke(handler, {
    body: {
      events: [
        { nodeId: '100', characteristic: 'OnOff', newValue: true },
        { nodeId: '100', characteristic: 'OnOff', newValue: false },
        { nodeId: '100', characteristic: 'OnOff', newValue: true },
      ],
    },
  });

  assert.equal(response.statusCode, 500);
  assert.ok(txQueries.includes('BEGIN'));
  assert.ok(txQueries.includes('ROLLBACK'));
  assert.equal(txQueries.includes('COMMIT'), false, 'COMMIT must not be issued on failure');
  assert.equal(released, true);
});

// --- nodeId normalization tests ---

test('nodeId normalization handles hex and decimal formats', async () => {
  let pairings = {};
  const { router } = makeRouter({ pairings });
  const handler = getRouteHandler(router, 'POST', '/setup/matter/pair');

  // Hex format
  const r1 = await invoke(handler, {
    body: { nodeId: '0xFF', name: 'Hex Device' },
  });
  assert.equal(r1.statusCode, 200);
  assert.equal(r1.jsonBody.pairing.nodeId, '255');
});
