import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { format, subDays } from 'date-fns';

vi.mock('../hooks/useEvents.js', () => ({
  useDailyStats: vi.fn(),
  useTopDevices: vi.fn(),
  useRoomStats: vi.fn(),
}));
vi.mock('../hooks/useAccentRgb.js', () => ({
  useAccentRgb: vi.fn(() => [37, 99, 235]),
}));

import { useDailyStats, useTopDevices, useRoomStats } from '../hooks/useEvents.js';
import KpiCards from './KpiCards.jsx';

const MOCK_DAILY = [
  { day: `${format(new Date(), 'yyyy-MM-dd')}T00:00:00`, count: '15' },
  { day: `${format(subDays(new Date(), 1), 'yyyy-MM-dd')}T00:00:00`, count: '13' },
];

const MOCK_DAILY_DOWN = [
  { day: `${format(new Date(), 'yyyy-MM-dd')}T00:00:00`, count: '10' },
  { day: `${format(subDays(new Date(), 1), 'yyyy-MM-dd')}T00:00:00`, count: '11' },
];

const MOCK_TOP_DEVICES = [
  { accessory_name: 'Living Room Lamp', event_count: '380' },
];

const MOCK_ROOMS = [
  { room_name: 'Kitchen', count: '200' },
  { room_name: null, count: '50' },
];

describe('KpiCards', () => {
  beforeEach(() => {
    useDailyStats.mockReturnValue({ data: MOCK_DAILY, isLoading: false, isError: false });
    useTopDevices.mockReturnValue({ data: MOCK_TOP_DEVICES, isLoading: false, isError: false });
    useRoomStats.mockReturnValue({ data: MOCK_ROOMS, isLoading: false, isError: false });
  });

  it('Test 1: renders 4 KPI cards with labels TODAY, THIS WEEK, TOP DEVICE, TOP ROOM', () => {
    render(<KpiCards dashboardDays={7} />);
    expect(screen.getByText('TODAY')).toBeInTheDocument();
    expect(screen.getByText('THIS WEEK')).toBeInTheDocument();
    expect(screen.getByText('TOP DEVICE')).toBeInTheDocument();
    expect(screen.getByText('TOP ROOM')).toBeInTheDocument();
  });

  it('Test 2: displays correct Today and This Week counts', () => {
    render(<KpiCards dashboardDays={7} />);
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('28')).toBeInTheDocument(); // 15 + 13
  });

  it('Test 3: displays top device name and event count', () => {
    render(<KpiCards dashboardDays={7} />);
    expect(screen.getByText('Living Room Lamp')).toBeInTheDocument();
    expect(screen.getByText('380 events')).toBeInTheDocument();
  });

  it('Test 4: displays top room name and event count', () => {
    render(<KpiCards dashboardDays={7} />);
    expect(screen.getByText('Kitchen')).toBeInTheDocument();
    expect(screen.getByText('200 events')).toBeInTheDocument();
  });

  it('Test 5: Events Today card shows trend delta "+2" with TrendingUp icon when today > yesterday', () => {
    render(<KpiCards dashboardDays={7} />);
    expect(screen.getByText('+2')).toBeInTheDocument();
    const trendSpan = screen.getByText('+2').closest('span');
    expect(trendSpan.querySelector('svg')).not.toBeNull();
  });

  it('Test 6: Events Today card shows trend delta "-1" with TrendingDown icon when today < yesterday', () => {
    useDailyStats.mockReturnValue({ data: MOCK_DAILY_DOWN, isLoading: false, isError: false });
    render(<KpiCards dashboardDays={7} />);
    expect(screen.getByText('-1')).toBeInTheDocument();
    const trendSpan = screen.getByText('-1').closest('span');
    expect(trendSpan.querySelector('svg')).not.toBeNull();
  });

  it('Test 7: When useDailyStats returns empty array, Events Today shows "0"', () => {
    useDailyStats.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<KpiCards dashboardDays={7} />);
    // The Today card value "0" and This Week card value "0" — both appear as exact text
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(1);
  });

  it('Test 8: Loading state shows skeleton shimmer', () => {
    useDailyStats.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    useTopDevices.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    useRoomStats.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const { container } = render(<KpiCards dashboardDays={7} />);
    expect(container.querySelector('.skeleton')).not.toBeNull();
  });

  it('Test 9: Events Today card renders sparkline container', () => {
    const { container } = render(<KpiCards dashboardDays={7} />);
    expect(container.querySelector('.recharts-responsive-container')).not.toBeNull();
  });

  it('Test 10: Only Today card renders sparkline, not other cards', () => {
    const { container } = render(<KpiCards dashboardDays={7} />);
    const containers = container.querySelectorAll('.recharts-responsive-container');
    expect(containers.length).toBe(1);
  });

  it('Test 11: skips null room names and shows first named room', () => {
    useRoomStats.mockReturnValue({ data: [{ room_name: null, count: '500' }, { room_name: 'Office', count: '100' }], isLoading: false });
    render(<KpiCards dashboardDays={7} />);
    expect(screen.getByText('Office')).toBeInTheDocument();
  });
});
