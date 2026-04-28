import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../hooks/useEvents.js', () => ({
  useDailyStats: vi.fn(),
}));
vi.mock('../hooks/useAccentRgb.js', () => ({
  useAccentRgb: vi.fn(() => [37, 99, 235]),
}));

import { useDailyStats } from '../hooks/useEvents.js';
import TrendChart from './TrendChart.jsx';

const MOCK_DAILY = Array.from({ length: 7 }, (_, i) => ({
  day: `2026-04-${String(i + 1).padStart(2, '0')}T00:00:00`,
  count: String(i * 5),
}));

describe('TrendChart', () => {
  beforeEach(() => {
    useDailyStats.mockReturnValue({ data: MOCK_DAILY, isLoading: false, isError: false });
  });

  it('CHART-03: renders without error after Recharts v3 upgrade', () => {
    render(<TrendChart />);
    expect(screen.getByText('Daily Activity')).toBeInTheDocument();
  });

  it('renders AreaChart container', () => {
    const { container } = render(<TrendChart />);
    expect(container.querySelector('.recharts-responsive-container')).not.toBeNull();
  });

  it('renders empty state when no data', () => {
    useDailyStats.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<TrendChart />);
    expect(screen.getByText(/No activity in the last/)).toBeInTheDocument();
  });

  it('renders error state', () => {
    useDailyStats.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<TrendChart />);
    expect(screen.getByText('Failed to load daily stats.')).toBeInTheDocument();
  });
});
