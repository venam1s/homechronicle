import test from 'node:test';
import assert from 'node:assert/strict';

// -- performPairSetupAndPersist tests --

test('performPairSetupAndPersist success — saves merged pairing and returns longTermData + pairing', async () => {
  const { performPairSetupAndPersist } = await import('../src/repair-helpers.js');

  const sentinel = { ltk: 'NEW_LTK_BYTES' };
  const closeCalls = [];
  const pairSetupCalls = [];

  const MockHttpClient = class {
    constructor(deviceId, address, port) {
      this.deviceId = deviceId;
      this.address = address;
      this.port = port;
    }
    async pairSetup(pin) { pairSetupCalls.push(pin); }
    getLongTermData() { return sentinel; }
    close() { closeCalls.push(true); }
  };

  const existingPairings = {
    'dev-a': { name: 'Device A', protocol: 'homekit', category: 2, address: 'old', port: 9999, longTermData: 'OLD' },
  };
  const savePairingsCalls = [];

  const result = await performPairSetupAndPersist(
    { deviceId: 'dev-a', pin: '111-22-333', address: '10.0.0.1', port: 51234 },
    {
      HttpClient: MockHttpClient,
      loadPairings: () => ({ ...existingPairings }),
      savePairings: async (p) => { savePairingsCalls.push(p); },
    }
  );

  // pairSetup called with correct pin
  assert.equal(pairSetupCalls.length, 1, 'pairSetup should be called once');
  assert.equal(pairSetupCalls[0], '111-22-333', 'pairSetup called with correct pin');

  // close was called
  assert.equal(closeCalls.length, 1, 'close should be called');

  // savePairings called once with merged record
  assert.equal(savePairingsCalls.length, 1, 'savePairings should be called once');
  const saved = savePairingsCalls[0]['dev-a'];
  assert.equal(saved.address, '10.0.0.1', 'address updated');
  assert.equal(saved.port, 51234, 'port updated');
  assert.deepEqual(saved.longTermData, sentinel, 'longTermData updated');
  assert.equal(saved.pin, '111-22-333', 'pin persisted');
  assert.ok(typeof saved.pairedAt === 'string', 'pairedAt is an ISO string');

  // Return value shape
  assert.deepEqual(result.longTermData, sentinel, 'return longTermData matches sentinel');
  assert.ok(result.pairing != null, 'return pairing is present');
});

test('performPairSetupAndPersist pairSetup throws — rethrows, savePairings not called, close still called', async () => {
  const { performPairSetupAndPersist } = await import('../src/repair-helpers.js');

  const closeCalls = [];
  const savePairingsCalls = [];

  const MockHttpClient = class {
    constructor() {}
    async pairSetup() { throw new Error('0x02'); }
    getLongTermData() { return null; }
    close() { closeCalls.push(true); }
  };

  await assert.rejects(
    () => performPairSetupAndPersist(
      { deviceId: 'dev-b', pin: '000-00-000', address: '10.0.0.2', port: 51234 },
      {
        HttpClient: MockHttpClient,
        loadPairings: () => ({ 'dev-b': { name: 'Fail Device' } }),
        savePairings: async (p) => { savePairingsCalls.push(p); },
      }
    ),
    /0x02/,
    'should rethrow pairSetup error'
  );

  assert.equal(savePairingsCalls.length, 0, 'savePairings should NOT be called on pairSetup failure');
  assert.equal(closeCalls.length, 1, 'close should still be called via try/finally');
});

test('performPairSetupAndPersist preserves existing fields on the pairing entry', async () => {
  const { performPairSetupAndPersist } = await import('../src/repair-helpers.js');

  const newLtd = { ltk: 'FRESH' };
  const MockHttpClient = class {
    constructor() {}
    async pairSetup() {}
    getLongTermData() { return newLtd; }
    close() {}
  };

  const existingPairings = {
    'dev-x': { protocol: 'homekit', name: 'Foo', category: 5, address: 'old', port: 1000, longTermData: 'OLD' },
  };
  const savePairingsCalls = [];

  await performPairSetupAndPersist(
    { deviceId: 'dev-x', pin: '999-88-777', address: '192.168.1.1', port: 55000 },
    {
      HttpClient: MockHttpClient,
      loadPairings: () => ({ ...existingPairings }),
      savePairings: async (p) => { savePairingsCalls.push(p); },
    }
  );

  const saved = savePairingsCalls[0]['dev-x'];
  // Existing fields preserved
  assert.equal(saved.protocol, 'homekit', 'protocol preserved');
  assert.equal(saved.name, 'Foo', 'name preserved');
  assert.equal(saved.category, 5, 'category preserved');
  // New fields applied
  assert.equal(saved.address, '192.168.1.1', 'address updated');
  assert.equal(saved.port, 55000, 'port updated');
  assert.deepEqual(saved.longTermData, newLtd, 'longTermData updated');
  assert.equal(saved.pin, '999-88-777', 'pin updated');
  assert.ok(typeof saved.pairedAt === 'string', 'pairedAt set');
});

test('performPairSetupAndPersist passes pairMethod through to pairSetup', async () => {
  const { performPairSetupAndPersist } = await import('../src/repair-helpers.js');

  const pairSetupCalls = [];
  const MockHttpClient = class {
    async pairSetup(pin, method) { pairSetupCalls.push({ pin, method }); }
    getLongTermData() { return {}; }
    close() {}
  };

  await performPairSetupAndPersist(
    { deviceId: 'dev-a', pin: '111-22-333', address: '10.0.0.1', port: 51234, pairMethod: 0 },
    { HttpClient: MockHttpClient, loadPairings: () => ({}), savePairings: async () => {} },
  );

  assert.deepEqual(pairSetupCalls, [{ pin: '111-22-333', method: 0 }]);
});
