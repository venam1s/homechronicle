import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TEMPERATURE_CHARACTERISTICS, isTemperatureCharacteristic, normalizeTemperatureUnit,
  temperatureSymbol, celsiusToUnit, unitToCelsius, roundTo, formatTemperature,
} from '../src/temperature.js';

// Shared with web/src/lib/temperature.test.js — keep the two tables identical.
const CONVERSIONS = [[0, 32.0], [100, 212.0], [23.5, 74.3], [-10, 14.0], [18.14, 64.7], [37, 98.6]];

test('names exactly the four temperature characteristics, case-insensitively', () => {
  assert.deepEqual(TEMPERATURE_CHARACTERISTICS, [
    'CurrentTemperature', 'TargetTemperature', 'HeatingThresholdTemperature', 'CoolingThresholdTemperature',
  ]);
  assert.equal(isTemperatureCharacteristic('currenttemperature'), true);
  assert.equal(isTemperatureCharacteristic('ColorTemperature'), false);
  assert.equal(isTemperatureCharacteristic(null), false);
});

test('normalizes the unit and falls back to c', () => {
  assert.equal(normalizeTemperatureUnit('f'), 'f');
  assert.equal(normalizeTemperatureUnit('F'), 'f');
  assert.deepEqual(['c', 'kelvin', 42, null, undefined].map(normalizeTemperatureUnit), ['c', 'c', 'c', 'c', 'c']);
  assert.equal(temperatureSymbol('f'), '°F');
  assert.equal(temperatureSymbol('c'), '°C');
});

for (const [c, f] of CONVERSIONS) {
  test(`${c} °C formats as ${f} °F`, () => {
    assert.equal(formatTemperature(c, 'f'), `${f.toFixed(1)} °F`);
    assert.equal(formatTemperature(String(c), 'f'), `${f.toFixed(1)} °F`);
    assert.equal(roundTo(celsiusToUnit(c, 'f'), 1), f);
  });
}

test('formats Celsius with one decimal and a space', () => {
  assert.equal(formatTemperature('18.14'), '18.1 °C');
  assert.equal(formatTemperature(23.5, 'c'), '23.5 °C');
});

test('converts a typed Fahrenheit threshold back to Celsius', () => {
  assert.equal(roundTo(unitToCelsius(75, 'f'), 2), 23.89);
  assert.equal(unitToCelsius(32, 'f'), 0);
  assert.equal(unitToCelsius(21, 'c'), 21);
});

test('returns null for values that are not numbers', () => {
  assert.equal(formatTemperature(null, 'f'), null);
  assert.equal(formatTemperature('', 'f'), null);
  assert.equal(formatTemperature('--', 'c'), null);
});
