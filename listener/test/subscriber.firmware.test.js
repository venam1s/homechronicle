import test from 'node:test';
import assert from 'node:assert/strict';
import { __testHooks } from '../src/subscriber.js';

// detectFirmwareChanges({ oldFirmwareByAccessoryId, identitiesByAccessoryId, deviceId, accessoryName, rooms })
// returns an array of insertEvent-compatible payload objects

test('firmware change: emits event when firmware_revision changes', () => {
  const { detectFirmwareChanges } = __testHooks;

  const oldFirmwareByAccessoryId = new Map([['dev-1', '1.0']]);
  const identitiesByAccessoryId = new Map([
    ['dev-1', { firmware_revision: '1.1', child_name: null }],
  ]);

  const events = detectFirmwareChanges({
    oldFirmwareByAccessoryId,
    identitiesByAccessoryId,
    deviceId: 'dev-1',
    accessoryName: 'Smart Plug',
    rooms: {},
  });

  assert.equal(events.length, 1);
  const ev = events[0];
  assert.equal(ev.accessoryId, 'dev-1');
  assert.equal(ev.accessoryName, 'Smart Plug');
  assert.equal(ev.characteristic, 'FirmwareRevision');
  assert.equal(ev.serviceType, 'AccessoryInformation');
  assert.equal(ev.oldValue, '1.0');
  assert.equal(ev.newValue, '1.1');
  assert.equal(ev.protocol, 'homekit');
  assert.equal(ev.transport, 'ip');
});

test('firmware change: no event when prevIdentity is null (first connect after restart)', () => {
  const { detectFirmwareChanges } = __testHooks;

  // oldFirmwareByAccessoryId is empty because prevIdentity was null
  const oldFirmwareByAccessoryId = new Map();
  const identitiesByAccessoryId = new Map([
    ['dev-1', { firmware_revision: '1.1', child_name: null }],
  ]);

  const events = detectFirmwareChanges({
    oldFirmwareByAccessoryId,
    identitiesByAccessoryId,
    deviceId: 'dev-1',
    accessoryName: 'Smart Plug',
    rooms: {},
  });

  assert.equal(events.length, 0);
});

test('firmware change: no event when prevIdentity.firmware_revision is null', () => {
  const { detectFirmwareChanges } = __testHooks;

  // Key exists but with null value — device never reported firmware
  const oldFirmwareByAccessoryId = new Map();
  const identitiesByAccessoryId = new Map([
    ['dev-1', { firmware_revision: '1.0', child_name: null }],
  ]);

  // Simulate: prev had null firmware (so it was never added to oldFirmwareByAccessoryId)
  const events = detectFirmwareChanges({
    oldFirmwareByAccessoryId,
    identitiesByAccessoryId,
    deviceId: 'dev-1',
    accessoryName: 'Smart Plug',
    rooms: {},
  });

  assert.equal(events.length, 0);
});

test('firmware change: no event when firmware_revision is unchanged', () => {
  const { detectFirmwareChanges } = __testHooks;

  const oldFirmwareByAccessoryId = new Map([['dev-1', '1.0']]);
  const identitiesByAccessoryId = new Map([
    ['dev-1', { firmware_revision: '1.0', child_name: null }],
  ]);

  const events = detectFirmwareChanges({
    oldFirmwareByAccessoryId,
    identitiesByAccessoryId,
    deviceId: 'dev-1',
    accessoryName: 'Smart Plug',
    rooms: {},
  });

  assert.equal(events.length, 0);
});

test('firmware change: bridge children tracked individually — only changed child emits', () => {
  const { detectFirmwareChanges } = __testHooks;

  // aid 1 (dev-1) unchanged, aid 2 (dev-1:2) changed
  const oldFirmwareByAccessoryId = new Map([
    ['dev-1', '1.0'],
    ['dev-1:2', '2.0'],
  ]);
  const identitiesByAccessoryId = new Map([
    ['dev-1', { firmware_revision: '1.0', child_name: 'Bridge' }],
    ['dev-1:2', { firmware_revision: '2.1', child_name: 'Child Device' }],
  ]);

  const events = detectFirmwareChanges({
    oldFirmwareByAccessoryId,
    identitiesByAccessoryId,
    deviceId: 'dev-1',
    accessoryName: 'My Bridge',
    rooms: {},
  });

  assert.equal(events.length, 1);
  const ev = events[0];
  assert.equal(ev.accessoryId, 'dev-1:2');
  assert.equal(ev.oldValue, '2.0');
  assert.equal(ev.newValue, '2.1');
});

test('firmware change: whitespace-only differences do not emit', () => {
  const { detectFirmwareChanges } = __testHooks;

  // Old value was stored trimmed; new has leading/trailing spaces
  const oldFirmwareByAccessoryId = new Map([['dev-1', '1.0']]);
  const identitiesByAccessoryId = new Map([
    ['dev-1', { firmware_revision: ' 1.0 ', child_name: null }],
  ]);

  const events = detectFirmwareChanges({
    oldFirmwareByAccessoryId,
    identitiesByAccessoryId,
    deviceId: 'dev-1',
    accessoryName: 'Smart Plug',
    rooms: {},
  });

  assert.equal(events.length, 0);
});
