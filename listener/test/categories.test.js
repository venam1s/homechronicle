import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, autoCategory, resolveCategory, isValidCategory, categoryLabel } from '../src/categories.js';

test('autoCategory maps HomeKit and Matter service types', () => {
  assert.equal(autoCategory(['MotionSensor']), 'security');
  assert.equal(autoCategory(['BooleanState']), 'security');
  assert.equal(autoCategory(['SmokeCoAlarm']), 'safety');
  assert.equal(autoCategory(['DoorLock']), 'access');
  assert.equal(autoCategory(['TemperatureMeasurement']), 'climate');
  assert.equal(autoCategory(['Lightbulb']), 'lighting');
  assert.equal(autoCategory(['Outlet']), 'power');
});

test('autoCategory resolves a device from all its service types by precedence', () => {
  // A Matter light reports OnOff as well as LevelControl/ColorControl.
  assert.equal(autoCategory(['OnOff', 'LevelControl', 'ColorControl']), 'lighting');
  // A Matter plug.
  assert.equal(autoCategory(['OnOff', 'ElectricalPowerMeasurement']), 'power');
  // Battery and firmware events never pull a sensor into Other.
  assert.equal(autoCategory(['Battery', 'AccessoryInformation', 'MotionSensor']), 'security');
  // A motion sensor that also measures light is still a motion sensor.
  assert.equal(autoCategory(['LightSensor', 'MotionSensor']), 'security');
});

test('autoCategory puts unknown, numeric Matter device-type codes and empty input in Other', () => {
  assert.equal(autoCategory(['Battery']), 'other');
  assert.equal(autoCategory(['256']), 'other');
  assert.equal(autoCategory(['ABCDEF']), 'other');
  assert.equal(autoCategory([null]), 'other');
  assert.equal(autoCategory([]), 'other');
  assert.equal(autoCategory(undefined), 'other');
});

test('resolveCategory prefers a valid override and ignores an invalid one', () => {
  assert.deepEqual(resolveCategory('a1', ['Switch'], { a1: 'cleaning' }), { category: 'cleaning', auto: 'power', override: 'cleaning' });
  assert.deepEqual(resolveCategory('a1', ['Switch'], { a1: 'bogus' }), { category: 'power', auto: 'power', override: null });
  assert.deepEqual(resolveCategory('a1', ['Switch'], {}), { category: 'power', auto: 'power', override: null });
});

test('category ids are unique and labelled', () => {
  assert.equal(new Set(CATEGORIES.map((c) => c.id)).size, CATEGORIES.length);
  assert.ok(isValidCategory('cleaning'));
  assert.ok(!isValidCategory('nope'));
  assert.equal(categoryLabel('access'), 'Doors & locks');
  assert.equal(categoryLabel('nope'), 'Other');
});

test('resolveCategory: a split outlet follows its plug\'s override until it has its own', () => {
  const MAC = 'AA:BB:CC:DD:EE:FF';
  const overrides = { [`${MAC}:7`]: 'lighting', [`${MAC}:7:20`]: 'other' };
  assert.equal(resolveCategory(`${MAC}:7:10`, new Set(['Outlet']), overrides).category, 'lighting');
  assert.equal(resolveCategory(`${MAC}:7:10`, new Set(['Outlet']), overrides).override, 'lighting');
  assert.equal(resolveCategory(`${MAC}:7:20`, new Set(['Outlet']), overrides).category, 'other');
  // A bridge child does not inherit the bridge's override.
  assert.equal(resolveCategory(`${MAC}:3`, new Set(['Outlet']), { [MAC]: 'lighting' }).override, null);
});
