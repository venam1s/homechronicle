import { describe, it, expect } from 'vitest';
import { buildTrendValues } from './characteristicTrend.js';

const T1 = '2026-11-08T10:00:00Z';
const T2 = '2026-11-08T11:00:00Z';

describe('buildTrendValues', () => {
  it("plots temperature points in the user's unit", () => {
    const { values, isNumeric } = buildTrendValues(
      [{ timestamp: T1, new_value: '23.5' }, { timestamp: T2, new_value: '24' }],
      { characteristic: 'CurrentTemperature', temperatureUnit: 'f' },
    );
    expect(isNumeric).toBe(true);
    expect(values[0].value).toBe(74.3);
    expect(values[0].raw).toBe('74.3 °F');
    expect(values[1].value).toBe(75.2);
    expect(values[1].raw).toBe('75.2 °F');
    expect(values[0].ts).toBe(new Date(T1).getTime());
  });

  it('leaves other characteristics raw', () => {
    const { values, isNumeric } = buildTrendValues(
      [{ timestamp: T1, new_value: '40' }],
      { characteristic: 'Brightness', temperatureUnit: 'f' },
    );
    expect(isNumeric).toBe(true);
    expect(values[0].value).toBe(40);
    expect(values[0].raw).toBe('40');
  });

  it('keeps the boolean step shape', () => {
    const { values, isNumeric } = buildTrendValues(
      [{ timestamp: T1, new_value: 'true' }, { timestamp: T2, new_value: 'false' }],
      { characteristic: 'On' },
    );
    expect(isNumeric).toBe(false);
    expect(values.map((v) => v.value)).toEqual([1, 0]);
  });

  it('returns an empty shape for no points', () => {
    expect(buildTrendValues([], { characteristic: 'On' })).toEqual({ values: [], isNumeric: false });
    expect(buildTrendValues(undefined, { characteristic: 'On' })).toEqual({ values: [], isNumeric: false });
  });
});
