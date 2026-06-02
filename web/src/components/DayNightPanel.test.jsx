import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../hooks/useEvents.js', () => ({
  useHourlyStats: vi.fn(),
  useQuietHours: vi.fn(),
}));

import { useHourlyStats, useQuietHours } from '../hooks/useEvents.js';
import DayNightPanel, { computeDayNightSplit } from './DayNightPanel.jsx';

// Build a flat hourly row array where every hour has the same count (uniform).
// With uniform data, bucketing is a permutation — night count = windowSize * c
// regardless of timezone offset, making assertions TZ-invariant.
function uniformHourlyRows(c) {
  return Array.from({ length: 24 }, (_, h) => ({ hour: String(h), count: String(c) }));
}

const QUIET_OFF = { enabled: false, quietHoursStart: 23, quietHoursEnd: 6 };

// Default night window is [22, 7) local — 9 hours (midnight-wrap).
// With uniform c=4: night = 9*4=36, day = 15*4=60, total = 96
describe('computeDayNightSplit — default window (no quiet hours)', () => {
  it('buckets correctly for default midnight-wrap [22,7) window', () => {
    const rows = uniformHourlyRows(4);
    const result = computeDayNightSplit(rows, QUIET_OFF);
    expect(result.total).toBe(96);
    expect(result.night).toBe(36); // hours 22,23,0,1,2,3,4,5,6 = 9 * 4
    expect(result.day).toBe(60);   // remaining 15 hours * 4
    expect(result.nightPct).toBeCloseTo(37.5);
    expect(result.dayPct).toBeCloseTo(62.5);
  });

  it('handles total === 0 gracefully', () => {
    const result = computeDayNightSplit([], QUIET_OFF);
    expect(result.total).toBe(0);
    expect(result.day).toBe(0);
    expect(result.night).toBe(0);
    expect(result.dayPct).toBe(0);
    expect(result.nightPct).toBe(0);
  });
});

// When quiet hours enabled, the UTC start/end are converted to local.
// With uniform data, the only thing that matters is the window size.
describe('computeDayNightSplit — quiet hours enabled (UTC->local conversion)', () => {
  it('UTC [8,20) (non-wrap) — 12 night hours (after local conversion, window size stays 12)', () => {
    const rows = uniformHourlyRows(3);
    const quiet = { enabled: true, quietHoursStart: 8, quietHoursEnd: 20 };
    const result = computeDayNightSplit(rows, quiet);
    // night window size = 12 hours (20-8), total = 72
    expect(result.total).toBe(72);
    expect(result.night).toBe(36); // 12 * 3
    expect(result.day).toBe(36);   // 12 * 3
    expect(result.nightPct).toBeCloseTo(50);
  });

  it('UTC [23,6) (wrap) — 7 night hours window', () => {
    const rows = uniformHourlyRows(2);
    const quiet = { enabled: true, quietHoursStart: 23, quietHoursEnd: 6 };
    const result = computeDayNightSplit(rows, quiet);
    // night window = 7 hours (23,0,1,2,3,4,5 in UTC, converted to local — same size)
    expect(result.total).toBe(48);
    expect(result.night).toBe(14); // 7 * 2
    expect(result.day).toBe(34);   // 17 * 2
    expect(result.nightPct).toBeCloseTo((14 / 48) * 100);
  });
});

// Render smoke tests (hook-mocked, asserting only DOM text, not recharts internals).
describe('DayNightPanel render', () => {
  beforeEach(() => {
    useHourlyStats.mockReturnValue({
      data: uniformHourlyRows(4),
      isLoading: false,
      isError: false,
    });
    useQuietHours.mockReturnValue({
      data: QUIET_OFF,
      isLoading: false,
      isError: false,
    });
  });

  it('renders the Day vs Night header', () => {
    render(<DayNightPanel />);
    expect(screen.getByText('Day vs Night')).toBeInTheDocument();
  });

  it('renders legend with day and night percentages', () => {
    render(<DayNightPanel />);
    // The legend has standalone "Day" and "Night" span text nodes
    // Use getAllByText in case multiple matches exist, then check at least one
    expect(screen.getAllByText(/^Day$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^Night$/i).length).toBeGreaterThan(0);
  });

  it('renders empty state when no data', () => {
    useHourlyStats.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<DayNightPanel />);
    expect(screen.getByText(/Not enough activity yet/i)).toBeInTheDocument();
  });

  it('renders loading state', () => {
    useHourlyStats.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<DayNightPanel />);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });
});
