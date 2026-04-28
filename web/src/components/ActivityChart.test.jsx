import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../hooks/useEvents.js', () => ({
  useHourlyStats: vi.fn(),
}));
vi.mock('../hooks/useAccentRgb.js', () => ({
  useAccentRgb: vi.fn(() => [37, 99, 235]),
}));

import { useHourlyStats } from '../hooks/useEvents.js';
import ActivityChart from './ActivityChart.jsx';

const MOCK_HOURLY = Array.from({ length: 24 }, (_, h) => ({
  hour: String(h),
  count: String(h * 3),
}));

describe('ActivityChart', () => {
  beforeEach(() => {
    useHourlyStats.mockReturnValue({ data: MOCK_HOURLY, isLoading: false, isError: false });
  });

  it('CHART-03: renders without error after Recharts v3 upgrade', () => {
    render(<ActivityChart />);
    expect(screen.getByText('Events by Hour')).toBeInTheDocument();
  });

  it('CHART-01: renders BarChart without throwing (pre-gradient refactor baseline)', () => {
    const { container } = render(<ActivityChart />);
    expect(container.querySelector('.recharts-responsive-container')).not.toBeNull();
  });

  it('renders empty state when no data', () => {
    useHourlyStats.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<ActivityChart />);
    expect(screen.getByText('No activity in the last 30 days.')).toBeInTheDocument();
  });

  it('renders error state', () => {
    useHourlyStats.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<ActivityChart />);
    expect(screen.getByText('Failed to load hourly stats.')).toBeInTheDocument();
  });
});
