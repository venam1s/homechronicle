import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../hooks/useEvents.js', () => ({
  useBatteryLevels: vi.fn(),
}));

import { useBatteryLevels } from '../hooks/useEvents.js';
import BatteryLevelsPanel from './BatteryLevelsPanel.jsx';

describe('BatteryLevelsPanel', () => {
  beforeEach(() => {
    useBatteryLevels.mockReset();
  });

  it('shows loading state', () => {
    useBatteryLevels.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<BatteryLevelsPanel />);
    expect(screen.getByText(/Checking battery levels/i)).toBeInTheDocument();
  });

  it('shows empty state when no battery devices', () => {
    useBatteryLevels.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<BatteryLevelsPanel />);
    expect(screen.getByText(/No battery-powered devices reporting/i)).toBeInTheDocument();
  });

  it('renders battery rows with percentage', () => {
    useBatteryLevels.mockReturnValue({
      data: [
        { accessoryId: 'b', accessoryName: 'Sensor B', roomName: 'Bed', batteryLevel: 15, lowBattery: true, lastUpdated: '2026-06-01T10:00:00Z' },
        { accessoryId: 'a', accessoryName: 'Lock A', roomName: 'Door', batteryLevel: 80, lowBattery: false, lastUpdated: '2026-06-01T10:00:00Z' },
      ],
      isLoading: false,
      isError: false,
    });
    render(<BatteryLevelsPanel />);
    expect(screen.getByText('Sensor B')).toBeInTheDocument();
    expect(screen.getByText('15%')).toBeInTheDocument();
    expect(screen.getByText('Lock A')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
  });
});
