import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeReading,
  mappedCharacteristics,
  unverifiedMappings,
} from '../src/matter-normalize.js';

// Cluster ids, for readability.
const ON_OFF = 0x0006;
const LEVEL = 0x0008;
const BOOLEAN = 0x0045;
const TEMP = 0x0402;
const HUMIDITY = 0x0405;
const PRESSURE = 0x0403;
const ILLUMINANCE = 0x0400;
const OCCUPANCY = 0x0406;
const COLOR = 0x0300;
const LOCK = 0x0101;
const COVERING = 0x0102;
const FAN = 0x0202;
const THERMOSTAT = 0x0201;
const POWER = 0x0090;
const SMOKE_CO = 0x005c;

const read = (clusterId, attributeId, value) =>
  normalizeReading({ clusterId, attributeId, value });

describe('matter normalization — names', () => {
  // The bug: Matter emitted its own vocabulary, so `describeChange` fell
  // through to "On Off: true" and alert rules on `On` never matched.
  test('OnOff reports as the HomeKit characteristic On', () => {
    assert.equal(read(ON_OFF, 0, true).characteristic, 'On');
  });

  // The worse bug: four different clusters all reported as `MeasuredValue`,
  // so nothing could tell a temperature from a humidity reading.
  test('the four MeasuredValue clusters get distinct characteristics', () => {
    const names = [
      read(TEMP, 0, 2350).characteristic,
      read(HUMIDITY, 0, 4500).characteristic,
      read(PRESSURE, 0, 1013).characteristic,
      read(ILLUMINANCE, 0, 30000).characteristic,
    ];
    assert.deepEqual(names, [
      'CurrentTemperature', 'CurrentRelativeHumidity', 'AirPressure', 'CurrentAmbientLightLevel',
    ]);
    assert.equal(new Set(names).size, 4, 'each must be distinguishable');
  });

  test('unmapped attributes are dropped rather than logged raw', () => {
    assert.equal(read(0xbeef, 0, 1), null);
    assert.equal(read(ON_OFF, 0x99, 1), null);
  });
});

describe('matter normalization — units', () => {
  test('temperature converts from centi-degrees to °C', () => {
    assert.equal(read(TEMP, 0, 2350).value, 23.5);
    assert.equal(read(TEMP, 0, -500).value, -5);
  });

  test('humidity converts from centi-percent and clamps to 0-100', () => {
    assert.equal(read(HUMIDITY, 0, 4500).value, 45);
    assert.equal(read(HUMIDITY, 0, 20000).value, 100);
  });

  test('brightness rescales 0-254 onto 0-100', () => {
    assert.equal(read(LEVEL, 0, 0).value, 0);
    assert.equal(read(LEVEL, 0, 127).value, 50);
    assert.equal(read(LEVEL, 0, 254).value, 100);
  });

  test('hue rescales 0-254 onto 0-360 and saturation onto 0-100', () => {
    assert.equal(read(COLOR, 0, 254).value, 360);
    assert.equal(read(COLOR, 1, 254).value, 100);
  });

  test('colour temperature passes through — both protocols use mireds', () => {
    assert.equal(read(COLOR, 7, 370).value, 370);
  });

  // Matter stores illuminance logarithmically. Logging it raw was wrong by
  // orders of magnitude: 30000 is ~1000 lux, not 30000.
  test('illuminance is decoded from its log encoding', () => {
    assert.equal(read(ILLUMINANCE, 0, 30001).value, 1000);
    assert.equal(read(ILLUMINANCE, 0, 40001).value, 10000);
  });

  test('illuminance 0 is the "unknown" sentinel, not darkness', () => {
    assert.equal(read(ILLUMINANCE, 0, 0), null);
  });

  test('pressure converts from 0.1 kPa', () => {
    assert.equal(read(PRESSURE, 0, 1013).value, 101.3);
  });

  test('active power converts from milliwatts to watts', () => {
    assert.equal(read(POWER, 8, 45500).value, 45.5);
  });

  test('fan speed passes through as a percentage', () => {
    assert.equal(read(FAN, 3, 42).value, 42);
  });
});

describe('matter normalization — booleans and enums', () => {
  test('occupancy reads bit 0 of the bitmap', () => {
    assert.equal(read(OCCUPANCY, 0, 1).value, 1);
    assert.equal(read(OCCUPANCY, 0, 0).value, 0);
    assert.equal(read(OCCUPANCY, 0, { occupied: true }).value, 1);
  });

  test('smoke and CO alarms collapse Warning/Critical to detected', () => {
    assert.equal(read(SMOKE_CO, 1, 0).value, 0);
    assert.equal(read(SMOKE_CO, 1, 1).value, 1);
    assert.equal(read(SMOKE_CO, 1, 2).value, 1);
    assert.equal(read(SMOKE_CO, 2, 2).characteristic, 'CarbonMonoxideDetected');
    assert.equal(read(SMOKE_CO, 3, 1).characteristic, 'StatusLowBattery');
  });

  test('fan mode Off maps to inactive, any other mode to active', () => {
    assert.equal(read(FAN, 0, 0).value, 0);
    assert.equal(read(FAN, 0, 3).value, 1);
  });
});

// These four disagree between the protocols. Getting one backwards means a
// door reads locked when it is open, so they are pinned explicitly.
describe('matter normalization — the inverted mappings', () => {
  test('contact sensor: Matter true (closed) becomes HAP 0 (contact detected)', () => {
    assert.equal(read(BOOLEAN, 0, true).value, 0);
    assert.equal(read(BOOLEAN, 0, false).value, 1);
  });

  test('door lock enum is re-ordered, not passed through', () => {
    assert.equal(read(LOCK, 0, 1).value, 1);   // Matter Locked   -> HAP Secured
    assert.equal(read(LOCK, 0, 2).value, 0);   // Matter Unlocked -> HAP Unsecured
    assert.equal(read(LOCK, 0, 0).value, 3);   // NotFullyLocked  -> Unknown
  });

  test('window covering position is both rescaled and inverted', () => {
    // Matter 0 = fully open; HAP 100 = fully open.
    assert.equal(read(COVERING, 0x0e, 0).value, 100);
    assert.equal(read(COVERING, 0x0e, 10000).value, 0);
    assert.equal(read(COVERING, 0x0e, 2500).value, 75);
  });

  test('window covering motion maps onto HAP PositionState', () => {
    assert.equal(read(COVERING, 0x0a, 1).value, 1);   // opening -> increasing
    assert.equal(read(COVERING, 0x0a, 2).value, 0);   // closing -> decreasing
    assert.equal(read(COVERING, 0x0a, 0).value, 2);   // stopped
  });

  test('thermostat mode enum is re-ordered', () => {
    assert.equal(read(THERMOSTAT, 0x1c, 0).value, 0);   // Off
    assert.equal(read(THERMOSTAT, 0x1c, 1).value, 3);   // Auto
    assert.equal(read(THERMOSTAT, 0x1c, 3).value, 2);   // Cool
    assert.equal(read(THERMOSTAT, 0x1c, 4).value, 1);   // Heat
  });

  test('thermostat local temperature converts like any other temperature', () => {
    assert.equal(read(THERMOSTAT, 0, 2100).characteristic, 'CurrentTemperature');
    assert.equal(read(THERMOSTAT, 0, 2100).value, 21);
  });

  // Anything relying on hardware verification must stay declared, so it can be
  // checked deliberately rather than discovered by a user.
  test('the unverified mappings are declared', () => {
    const chars = unverifiedMappings().map((m) => m.characteristic).sort();
    assert.deepEqual(chars, [
      'ContactSensorState', 'CurrentPosition', 'LockCurrentState', 'TargetHeatingCoolingState',
    ]);
    for (const m of unverifiedMappings()) assert.ok(m.why, `${m.characteristic} must say why`);
  });
});

describe('matter normalization — junk input', () => {
  test('non-numeric values are dropped, not coerced to NaN', () => {
    for (const junk of ['', 'abc', null, undefined, {}]) {
      const out = read(TEMP, 0, junk);
      assert.ok(out === null || Number.isFinite(out.value), `${JSON.stringify(junk)} produced ${JSON.stringify(out)}`);
    }
  });

  test('every mapped characteristic is a non-empty string', () => {
    for (const c of mappedCharacteristics()) {
      assert.equal(typeof c, 'string');
      assert.ok(c.length > 0);
    }
  });
});

// The UI has the matching half of this contract in web/src/lib/icons.test.js.
// If this list changes, that one must change with it — otherwise the new
// characteristic reaches the timeline as a raw "Name: value" headline.
test('the emitted vocabulary is exactly what the UI is pinned to', () => {
  assert.deepEqual(mappedCharacteristics(), [
    'Active', 'ActivePower', 'AirPressure', 'Brightness', 'CarbonMonoxideDetected',
    'ColorTemperature', 'ContactSensorState', 'CurrentAmbientLightLevel', 'CurrentPosition',
    'CurrentRelativeHumidity', 'CurrentTemperature', 'Hue', 'LockCurrentState',
    'OccupancyDetected', 'On', 'PositionState', 'RotationSpeed', 'Saturation', 'SmokeDetected',
    'StatusLowBattery', 'TargetHeatingCoolingState',
  ]);
});
