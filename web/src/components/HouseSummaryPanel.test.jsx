import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';

const quiet = vi.fn();
vi.mock('../hooks/useEvents.js', () => ({
  useDailyStats: () => ({ data: [] }),
  useRoomStats: () => ({ data: [] }),
  useQuietHours: () => quiet(),
}));

const { default: HouseSummaryPanel } = await import('./HouseSummaryPanel.jsx');

describe('HouseSummaryPanel quiet-hours clause', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('names the configured window in local time', () => {
    vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(240); // EDT
    quiet.mockReturnValue({ data: { enabled: true, quietHoursStart: 4, quietHoursEnd: 9, events: [] } });
    const { container } = render(<HouseSummaryPanel />);
    expect(container.textContent).toMatch(/Nothing stirred during quiet hours \(12 AM – 5 AM\)/);
  });

  // A failed or still-loading request used to produce "quiet hours (7 PM –
  // 2 AM)" in EDT: the 11 PM–6 AM UTC default, presented as the house's setting.
  it('leaves the clause out when quiet hours are unknown', () => {
    quiet.mockReturnValue({ data: undefined });
    const { container } = render(<HouseSummaryPanel />);
    expect(container.textContent).not.toMatch(/quiet hours/i);
  });

  it('leaves the clause out when quiet hours are turned off', () => {
    quiet.mockReturnValue({ data: { enabled: false, quietHoursStart: 23, quietHoursEnd: 6 } });
    const { container } = render(<HouseSummaryPanel />);
    expect(container.textContent).not.toMatch(/quiet hours/i);
  });
});
