import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatterRouter } from '../src/matter-router.js';

function getRouteHandler(router, method, path) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (layer.route.path !== path) continue;
    if (!layer.route.methods[method.toLowerCase()]) continue;
    return layer.route.stack[0].handle;
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
  const router = createMatterRouter({
    insertEvent: async (event) => {
      inserted.push(event);
      return { id: inserted.length, timestamp: new Date().toISOString() };
    },
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
