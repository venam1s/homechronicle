import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../hooks/useEvents.js', () => ({
  useWeekdayStats: vi.fn(),
}));
vi.mock('../hooks/useAccentRgb.js', () => ({
  useAccentRgb: vi.fn(() => [37, 99, 235]),
}));
vi.mock('../hooks/usePreference.js', () => ({
  usePreference: vi.fn(() => [30, vi.fn()]),
}));

import { useWeekdayStats } from '../hooks/useEvents.js';
import WeekdayHeatmap from './WeekdayHeatmap.jsx';

describe('WeekdayHeatmap', () => {
  beforeEach(() => {
    useWeekdayStats.mockReturnValue({
      data: [{ day_of_week: '1', hour: '9', count: '4' }],
      isLoading: false,
      isError: false,
    });
  });

  it('renders seven day rows with 24 hour cells each', () => {
    render(<WeekdayHeatmap />);
    expect(screen.getByText('Weekday Heatmap')).toBeInTheDocument();
    const rows = document.querySelectorAll('[data-testid="weekday-heatmap-row"]');
    expect(rows).toHaveLength(7);
    expect(rows[0].querySelectorAll('[title]')).toHaveLength(24);
  });

  it('stretches the rows to fill the panel so it sits as tall as the monthly heatmap', () => {
    render(<WeekdayHeatmap />);
    const root = screen.getByText('Weekday Heatmap').closest('.h-full');
    expect(root).not.toBeNull();
    expect(root.className).toContain('flex-col');

    const rows = document.querySelector('[data-testid="weekday-heatmap-rows"]');
    expect(rows.className).toContain('flex-1');
    expect(rows.style.gridTemplateRows).toBe('repeat(7, minmax(18px, 1fr))');
  });

  it('keeps the 18px column cap and lets cells grow taller only up to 1.5x their width', () => {
    render(<WeekdayHeatmap />);
    const cell = screen.getAllByTitle(/event/)[0];
    expect(cell.style.width).toBe('100%');
    expect(cell.style.maxWidth).toBe('18px');
    expect(cell.style.aspectRatio).toBe('1 / 1.5');
    expect(cell.style.maxHeight).toBe('100%');
  });

  it('renders empty state when no data', () => {
    useWeekdayStats.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<WeekdayHeatmap />);
    expect(screen.getByText('No data yet.')).toBeInTheDocument();
  });
});
