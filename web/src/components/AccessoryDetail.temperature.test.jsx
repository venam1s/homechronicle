import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AccessoryDetail from './AccessoryDetail.jsx';

const { detail, summary } = vi.hoisted(() => ({
  detail: {
    accessory: {
      accessory_id: 'h3',
      accessory_name: 'Office Sensor',
      room_name: 'Office',
      service_type: 'TemperatureSensor',
      category: 'climate',
      category_auto: 'climate',
      category_override: null,
      protocol: 'homekit',
      health: {},
    },
    history: {
      total: 1,
      page: 1,
      pages: 1,
      events: [
        { id: 1, characteristic: 'CurrentTemperature', old_value: '23', new_value: '24', timestamp: '2026-11-08T10:00:00Z' },
      ],
    },
    uptime: {},
    current_state: [
      { characteristic: 'CurrentTemperature', new_value: '24', timestamp: '2026-11-08T10:00:00Z', raw_iid: 9 },
    ],
    activity: { days: 30, daily: [] },
  },
  summary: {
    characteristics: [
      { characteristic: 'CurrentTemperature', numeric_count: 3, change_count: 3, min_val: 20, avg_val: 22, max_val: 24, distinct_values: 3 },
      { characteristic: 'CurrentRelativeHumidity', numeric_count: 3, change_count: 3, min_val: 40, avg_val: 45, max_val: 50, distinct_values: 3 },
    ],
  },
}));

vi.mock('../hooks/useEvents.js', () => ({
  useAccessoryDetail: () => ({ data: detail, isLoading: false, isError: false }),
  useAccessoryAnomalies: () => ({ data: { outliers: [] } }),
  useCharacteristicTrend: () => ({ data: null }),
  useAccessoryHeatmap: () => ({ data: null }),
  useAccessoryStateDuration: () => ({ data: null }),
  useAccessoryCharSummary: () => ({ data: summary, isLoading: false }),
}));

vi.mock('../hooks/useCategories.js', () => ({
  useCategories: () => ({ data: { categories: [{ id: 'climate', label: 'Climate' }], overrides: {} } }),
  useSetCategory: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));

vi.mock('../hooks/useTemperatureUnit.js', () => ({
  useTemperatureUnit: () => ({ unit: 'f', symbol: '°F', setUnit: vi.fn() }),
}));

describe('AccessoryDetail temperature unit', () => {
  it('shows the current state and history in Fahrenheit', () => {
    render(<AccessoryDetail accessoryId="h3" onBack={() => {}} />);
    // Current-state tile and history headline both describe the latest reading.
    expect(screen.getAllByText('75.2 °F').length).toBeGreaterThanOrEqual(2);
    // The raw old → new line under the history row.
    expect(screen.getByText(/73\.4 °F → 75\.2 °F/)).toBeInTheDocument();
  });

  it('converts the characteristic summary for temperature rows only', () => {
    render(<AccessoryDetail accessoryId="h3" onBack={() => {}} />);
    expect(screen.getByText('68 °F')).toBeInTheDocument();
    expect(screen.getByText('71.6 °F')).toBeInTheDocument();
    expect(screen.getAllByText('75.2 °F').length).toBeGreaterThanOrEqual(3);
    // Humidity stays a bare number.
    expect(screen.getByText('45')).toBeInTheDocument();
  });
});
