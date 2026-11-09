import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../hooks/useEvents.js', () => ({
  useSensorEnvironment: vi.fn(),
}));

const { unitState } = vi.hoisted(() => ({ unitState: { unit: 'c', symbol: '°C', setUnit: () => {} } }));
vi.mock('../hooks/useTemperatureUnit.js', () => ({
  useTemperatureUnit: () => unitState,
}));

import { useSensorEnvironment } from '../hooks/useEvents.js';
import SensorEnvironmentPanel from './SensorEnvironmentPanel.jsx';

describe('SensorEnvironmentPanel', () => {
  beforeEach(() => {
    useSensorEnvironment.mockReset();
  });

  it('shows loading state', () => {
    useSensorEnvironment.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<SensorEnvironmentPanel />);
    expect(screen.getByText(/Loading sensor readings/i)).toBeInTheDocument();
  });

  it('shows empty state when no readings', () => {
    useSensorEnvironment.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<SensorEnvironmentPanel />);
    expect(screen.getByText(/No sensor readings yet/i)).toBeInTheDocument();
  });

  it('renders temperature and humidity rows', () => {
    useSensorEnvironment.mockReturnValue({
      data: [
        { accessoryId: 'a1', accessoryName: 'Hall Sensor', roomName: 'Hall', temperature: 21.5, humidity: 45, lastUpdated: '2026-06-01T10:00:00Z' },
        { accessoryId: 'a2', accessoryName: 'Bedroom Thermo', roomName: 'Bedroom', temperature: 20.5, humidity: null, lastUpdated: '2026-06-01T09:00:00Z' },
      ],
      isLoading: false,
      isError: false,
    });
    render(<SensorEnvironmentPanel />);
    expect(screen.getByText('Hall Sensor')).toBeInTheDocument();
    expect(screen.getByText('21.5 °C')).toBeInTheDocument();
    expect(screen.getByText('45%')).toBeInTheDocument();
    expect(screen.getByText('Bedroom Thermo')).toBeInTheDocument();
    expect(screen.getByText('20.5 °C')).toBeInTheDocument();
  });

  it('shows Fahrenheit when the unit is f', () => {
    unitState.unit = 'f';
    unitState.symbol = '°F';
    try {
      useSensorEnvironment.mockReturnValue({
        data: [
          { accessoryId: 'a1', accessoryName: 'Hall Sensor', roomName: 'Hall', temperature: 23.5, humidity: 45, lastUpdated: '2026-06-01T10:00:00Z' },
        ],
        isLoading: false,
        isError: false,
      });
      render(<SensorEnvironmentPanel />);
      expect(screen.getByText('74.3 °F')).toBeInTheDocument();
      expect(screen.getByText('45%')).toBeInTheDocument();
    } finally {
      unitState.unit = 'c';
      unitState.symbol = '°C';
    }
  });
});
