import { describe, it, expect } from 'vitest';
import {
  TEMPERATURE_CHARACTERISTICS, isTemperatureCharacteristic, normalizeTemperatureUnit,
  temperatureSymbol, celsiusToUnit, unitToCelsius, roundTo, formatTemperature,
} from './temperature.js';

// Shared with listener/test/temperature.test.js — keep the two tables identical.
const CONVERSIONS = [[0, 32.0], [100, 212.0], [23.5, 74.3], [-10, 14.0], [18.14, 64.7], [37, 98.6]];

describe('temperature', () => {
  it('names exactly the four temperature characteristics, case-insensitively', () => {
    expect(TEMPERATURE_CHARACTERISTICS).toEqual([
      'CurrentTemperature', 'TargetTemperature', 'HeatingThresholdTemperature', 'CoolingThresholdTemperature',
    ]);
    expect(isTemperatureCharacteristic('currenttemperature')).toBe(true);
    expect(isTemperatureCharacteristic('ColorTemperature')).toBe(false);
    expect(isTemperatureCharacteristic(null)).toBe(false);
  });

  it('normalizes the unit and falls back to c', () => {
    expect(normalizeTemperatureUnit('f')).toBe('f');
    expect(normalizeTemperatureUnit('F')).toBe('f');
    expect(['c', 'kelvin', 42, null, undefined].map(normalizeTemperatureUnit)).toEqual(['c', 'c', 'c', 'c', 'c']);
    expect(temperatureSymbol('f')).toBe('°F');
    expect(temperatureSymbol('c')).toBe('°C');
  });

  it.each(CONVERSIONS)('%s °C formats as %s °F', (c, f) => {
    expect(formatTemperature(c, 'f')).toBe(`${f.toFixed(1)} °F`);
    expect(formatTemperature(String(c), 'f')).toBe(`${f.toFixed(1)} °F`);
    expect(roundTo(celsiusToUnit(c, 'f'), 1)).toBe(f);
  });

  it('formats Celsius with one decimal and a space', () => {
    expect(formatTemperature('18.14')).toBe('18.1 °C');
    expect(formatTemperature(23.5, 'c')).toBe('23.5 °C');
  });

  it('converts a typed Fahrenheit threshold back to Celsius', () => {
    expect(roundTo(unitToCelsius(75, 'f'), 2)).toBe(23.89);
    expect(unitToCelsius(32, 'f')).toBe(0);
    expect(unitToCelsius(21, 'c')).toBe(21);
  });

  it('returns null for values that are not numbers', () => {
    expect(formatTemperature(null, 'f')).toBeNull();
    expect(formatTemperature('', 'f')).toBeNull();
    expect(formatTemperature('--', 'c')).toBeNull();
  });
});
