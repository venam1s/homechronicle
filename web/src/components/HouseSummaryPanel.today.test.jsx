import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { format, subDays } from 'date-fns';

const daily = vi.fn();
vi.mock('../hooks/useEvents.js', () => ({
  useDailyStats: () => daily(),
  useRoomStats: () => ({ data: [] }),
  useQuietHours: () => ({ data: undefined }),
}));

const { default: HouseSummaryPanel } = await import('./HouseSummaryPanel.jsx');

describe('HouseSummaryPanel today count', () => {
  afterEach(() => { vi.useRealTimers(); });

  // The daily series is keyed by the browser's local calendar day (the API is
  // asked for that zone). Late in the evening the UTC date has already rolled
  // over; the panel must still read the local day's row, as the Today card does.
  it('keys "today" and "yesterday" on the local date, not the UTC date', () => {
    const now = new Date();
    now.setHours(23, 30, 0, 0);
    vi.useFakeTimers({ now, toFake: ['Date'] });

    daily.mockReturnValue({
      data: [
        { day: format(subDays(now, 1), 'yyyy-MM-dd'), count: '451' },
        { day: format(now, 'yyyy-MM-dd'), count: '88' },
      ],
    });
    const { container } = render(<HouseSummaryPanel />);
    expect(container.textContent).toMatch(/88 events so far today — 363 fewer than yesterday\./);
  });
});
