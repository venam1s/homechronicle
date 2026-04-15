import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { format, subDays } from 'date-fns';

vi.mock('../hooks/useEvents.js', () => ({
  useAccessories: vi.fn(),
  useDailyStats: vi.fn(),
}));
vi.mock('../hooks/useAccentRgb.js', () => ({
  useAccentRgb: vi.fn(() => [37, 99, 235]),
}));

import { useAccessories, useDailyStats } from '../hooks/useEvents.js';
import KpiCards from './KpiCards.jsx';

const MOCK_ACCESSORIES = [
  { accessory_id: 'a1', health: { status: 'online' } },
  { accessory_id: 'a2', health: { status: 'online' } },
  { accessory_id: 'a3', health: { status: 'online' } },
  { accessory_id: 'a4', health: { status: 'offline' } },
  { accessory_id: 'a5', health: { status: 'stale' } },
  { accessory_id: 'a6', health: { status: 'stale' } },
];

const MOCK_DAILY = [
  { day: `${format(new Date(), 'yyyy-MM-dd')}T00:00:00`, count: '15' },
  { day: `${format(subDays(new Date(), 1), 'yyyy-MM-dd')}T00:00:00`, count: '13' },
];

const MOCK_DAILY_DOWN = [
  { day: `${format(new Date(), 'yyyy-MM-dd')}T00:00:00`, count: '10' },
  { day: `${format(subDays(new Date(), 1), 'yyyy-MM-dd')}T00:00:00`, count: '11' },
];

describe('KpiCards', () => {
  beforeEach(() => {
    useAccessories.mockReturnValue({ data: MOCK_ACCESSORIES, isLoading: false, isError: false });
    useDailyStats.mockReturnValue({ data: MOCK_DAILY, isLoading: false, isError: false });
  });

  it('Test 1 (WIDGET-01): renders 4 KPI cards with labels ONLINE, OFFLINE, STALE, TODAY', () => {
    render(<KpiCards dashboardDays={7} />);
    expect(screen.getByText('ONLINE')).toBeInTheDocument();
    expect(screen.getByText('OFFLINE')).toBeInTheDocument();
    expect(screen.getByText('STALE')).toBeInTheDocument();
    expect(screen.getByText('TODAY')).toBeInTheDocument();
  });

  it('Test 2 (WIDGET-01): displays correct numeric counts from accessories health statuses', () => {
    render(<KpiCards dashboardDays={7} />);
    // 3 online, 1 offline, 2 stale from MOCK_ACCESSORIES
    const allText = screen.getAllByRole('generic').map(el => el.textContent);
    // Find the value elements by checking for these exact numbers
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('Test 3 (WIDGET-02): Events Today card shows trend delta "+2" with TrendingUp icon when today > yesterday', () => {
    render(<KpiCards dashboardDays={7} />);
    expect(screen.getByText('+2')).toBeInTheDocument();
    // TrendingUp SVG should be present
    const trendSpan = screen.getByText('+2').closest('span');
    expect(trendSpan.querySelector('svg')).not.toBeNull();
  });

  it('Test 4 (WIDGET-02): Events Today card shows trend delta "-1" with TrendingDown icon when today < yesterday', () => {
    useDailyStats.mockReturnValue({ data: MOCK_DAILY_DOWN, isLoading: false, isError: false });
    render(<KpiCards dashboardDays={7} />);
    expect(screen.getByText('-1')).toBeInTheDocument();
    const trendSpan = screen.getByText('-1').closest('span');
    expect(trendSpan.querySelector('svg')).not.toBeNull();
  });

  it('Test 5 (WIDGET-02): Health KPI cards (Online, Offline, Stale) show em-dash "—" in sub-text, never a trend arrow', () => {
    render(<KpiCards dashboardDays={7} />);
    // There should be 3 em-dashes (one for each health card)
    const emDashes = screen.getAllByText('—');
    expect(emDashes.length).toBeGreaterThanOrEqual(3);
  });

  it('Test 6 (D-04): When useDailyStats returns empty array, Events Today shows "0" value and "—" sub-text', () => {
    useDailyStats.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<KpiCards dashboardDays={7} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    // em-dash should appear for Events Today as well when no data
    const emDashes = screen.getAllByText('—');
    expect(emDashes.length).toBeGreaterThanOrEqual(4);
  });

  it('Test 7: Loading state shows skeleton shimmer (.skeleton class present)', () => {
    useAccessories.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    useDailyStats.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const { container } = render(<KpiCards dashboardDays={7} />);
    expect(container.querySelector('.skeleton')).not.toBeNull();
  });

  it('Test 8 (CHART-02): Events Today card renders sparkline container', () => {
    const { container } = render(<KpiCards dashboardDays={7} />);
    expect(container.querySelector('.recharts-responsive-container')).not.toBeNull();
  });

  it('Test 9 (CHART-02): Health cards (online, offline, stale) do not render sparkline', () => {
    const { container } = render(<KpiCards dashboardDays={7} />);
    // Only one ResponsiveContainer should exist (for the TODAY card sparkline)
    const containers = container.querySelectorAll('.recharts-responsive-container');
    expect(containers.length).toBe(1);
  });
});
