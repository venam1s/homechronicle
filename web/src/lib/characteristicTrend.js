import { format } from 'date-fns';
import { isTemperatureCharacteristic, celsiusToUnit, roundTo, formatTemperature } from './temperature.js';

/**
 * Shape the device page's characteristic-trend points for Recharts.
 *
 * A series is numeric when more than 80% of its points parse as numbers;
 * otherwise booleans are plotted as a 0/1 step. For a temperature
 * characteristic the plotted value is converted to the user's unit and `raw`
 * (what the tooltip shows) is the formatted reading, e.g. "74.3 °F".
 *
 * @returns {{ values: Array<{ time: string, ts: number, value: number, raw: string }>, isNumeric: boolean }}
 */
export function buildTrendValues(points, { characteristic, temperatureUnit = 'c' } = {}) {
  const list = Array.isArray(points) ? points : [];
  if (!list.length) return { values: [], isNumeric: false };

  const numericCount = list.filter((p) => Number.isFinite(Number(p.new_value))).length;
  const isNumeric = numericCount / list.length > 0.8;
  const isTemperature = isNumeric && isTemperatureCharacteristic(characteristic);

  const values = list.map((p) => {
    const n = Number(p.new_value);
    let value;
    if (!isNumeric) value = p.new_value === 'true' || p.new_value === '1' ? 1 : 0;
    else if (isTemperature) value = roundTo(celsiusToUnit(n, temperatureUnit), 1);
    else value = n;
    return {
      time: format(new Date(p.timestamp), 'MMM d HH:mm'),
      ts: new Date(p.timestamp).getTime(),
      value,
      raw: (isTemperature ? formatTemperature(p.new_value, temperatureUnit) : null) ?? p.new_value,
    };
  });

  return { values, isNumeric };
}
