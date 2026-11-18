import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../hooks/useEvents.js', () => ({
  useDailyStats: vi.fn(),
}));
vi.mock('../hooks/useAccentRgb.js', () => ({
  useAccentRgb: vi.fn(() => [37, 99, 235]),
}));

import { useDailyStats } from '../hooks/useEvents.js';
import MonthlyHeatmap from './MonthlyHeatmap.jsx';

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

describe('MonthlyHeatmap', () => {
  beforeEach(() => {
    const today = new Date();
    useDailyStats.mockReturnValue({
      data: [{ day: ymd(today), count: '4' }],
      isLoading: false,
    });
  });

  it('renders twelve month rows', () => {
    render(<MonthlyHeatmap />);
    expect(screen.getByText('Monthly Heatmap')).toBeInTheDocument();
    const rows = document.querySelectorAll('[data-testid="monthly-heatmap-row"]');
    expect(rows).toHaveLength(12);
  });

  it('sizes day cells like the weekday heatmap: fluid grid columns capped at 18px squares', () => {
    render(<MonthlyHeatmap />);
    const row = document.querySelector('[data-testid="monthly-heatmap-row"]');
    expect(row.style.gridTemplateColumns).toContain('repeat(31, minmax(0, 1fr))');

    const cell = screen.getAllByTitle(/event/)[0];
    expect(cell.style.width).toBe('100%');
    expect(cell.style.maxWidth).toBe('18px');
    expect(cell.style.aspectRatio).toBe('1 / 1');
  });

  it('renders empty state when no data', () => {
    useDailyStats.mockReturnValue({ data: [], isLoading: false });
    render(<MonthlyHeatmap />);
    expect(screen.getByText('No activity in the last 12 months.')).toBeInTheDocument();
  });
});
