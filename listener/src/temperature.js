/**
 * Temperature unit helpers.
 *
 * Readings and alert thresholds are stored in °C everywhere; these helpers
 * convert at the edges where a person reads or types a number. Kept identical
 * to web/src/lib/temperature.js (there is no shared package) — the two test
 * files share one conversion table to catch drift.
 */

export const TEMPERATURE_CHARACTERISTICS = [
  'CurrentTemperature',
  'TargetTemperature',
  'HeatingThresholdTemperature',
  'CoolingThresholdTemperature',
];

const TEMPERATURE_CHARACTERISTICS_LOWER = new Set(TEMPERATURE_CHARACTERISTICS.map((n) => n.toLowerCase()));

const SYMBOLS = { c: '°C', f: '°F' };

/** True for the four temperature characteristics, matched case-insensitively. */
export function isTemperatureCharacteristic(name) {
  return typeof name === 'string' && TEMPERATURE_CHARACTERISTICS_LOWER.has(name.toLowerCase());
}

/** 'f' / 'F' → 'f'; anything else → 'c'. */
export function normalizeTemperatureUnit(value) {
  return typeof value === 'string' && value.toLowerCase() === 'f' ? 'f' : 'c';
}

export function temperatureSymbol(unit) {
  return SYMBOLS[normalizeTemperatureUnit(unit)];
}

export function celsiusToUnit(celsius, unit) {
  return normalizeTemperatureUnit(unit) === 'f' ? celsius * 9 / 5 + 32 : celsius;
}

export function unitToCelsius(value, unit) {
  return normalizeTemperatureUnit(unit) === 'f' ? (value - 32) * 5 / 9 : value;
}

export function roundTo(n, decimals) {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

/**
 * Format a stored Celsius value (number or string) in the given unit with one
 * decimal, e.g. "74.3 °F". Returns null when the value is not a number.
 */
export function formatTemperature(value, unit = 'c') {
  const n = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(n)) return null;
  return `${celsiusToUnit(n, unit).toFixed(1)} ${temperatureSymbol(unit)}`;
}
