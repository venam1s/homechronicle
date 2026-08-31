import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Timeline imports a lot; stub the data layer so the helper can be exercised
// in isolation. Only withQuietDivider is under test here.
vi.mock('../hooks/useEvents.js', () => ({
  useEvents: () => ({ data: { events: [], pages: 1 }, isLoading: false, isError: false }),
  useAnomalies: () => ({ data: { devices: [], rooms: [] } }),
  useQuietHours: () => ({ data: undefined }),
}));

const { withQuietDivider } = await import('./Timeline.jsx');

/** An entry shaped like the timeline's, starting at the given local hour. */
function entryAt(hour, id) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return { kind: 'scene', scenes: [[{ id, timestamp: d.toISOString() }]] };
}

const renderEntry = (entry) => <div key={entry.scenes[0][0].id}>{entry.scenes[0][0].id}</div>;
const DIVIDER = /quiet hours ·/i;

describe('withQuietDivider', () => {
  // Entries are newest-first, so an overnight quiet window lands at the end.
  const entries = [entryAt(14, 'afternoon'), entryAt(9, 'morning'), entryAt(2, 'night')];

  it('rules off the first entry inside the quiet window', () => {
    render(<div>{withQuietDivider(entries, { quietOn: true, quietStart: 23, quietEnd: 6 }, renderEntry)}</div>);
    expect(screen.getByText(DIVIDER)).toBeInTheDocument();
    // Every entry still renders — the divider adds, it does not filter.
    for (const id of ['afternoon', 'morning', 'night']) {
      expect(screen.getByText(id)).toBeInTheDocument();
    }
  });

  it('draws the divider exactly once, however many quiet entries there are', () => {
    const many = [entryAt(14, 'a'), entryAt(3, 'b'), entryAt(2, 'c'), entryAt(1, 'd')];
    render(<div>{withQuietDivider(many, { quietOn: true, quietStart: 23, quietEnd: 6 }, renderEntry)}</div>);
    expect(screen.getAllByText(DIVIDER)).toHaveLength(1);
  });

  it('draws nothing when no entry falls in the window', () => {
    render(<div>{withQuietDivider([entryAt(14, 'a'), entryAt(9, 'b')], { quietOn: true, quietStart: 23, quietEnd: 6 }, renderEntry)}</div>);
    expect(screen.queryByText(DIVIDER)).toBeNull();
  });

  it('draws nothing when quiet hours are disabled', () => {
    render(<div>{withQuietDivider(entries, { quietOn: false, quietStart: 23, quietEnd: 6 }, renderEntry)}</div>);
    expect(screen.queryByText(DIVIDER)).toBeNull();
  });

  it('handles a same-day window that does not wrap midnight', () => {
    const day = [entryAt(20, 'evening'), entryAt(13, 'lunch'), entryAt(8, 'early')];
    render(<div>{withQuietDivider(day, { quietOn: true, quietStart: 12, quietEnd: 15 }, renderEntry)}</div>);
    expect(screen.getByText(DIVIDER)).toBeInTheDocument();
  });

  it('survives an entry with an unusable timestamp', () => {
    const broken = [{ kind: 'scene', scenes: [[{ id: 'broken' }]] }, entryAt(2, 'night')];
    expect(() =>
      render(<div>{withQuietDivider(broken, { quietOn: true, quietStart: 23, quietEnd: 6 }, renderEntry)}</div>),
    ).not.toThrow();
    expect(screen.getByText('broken')).toBeInTheDocument();
  });
});
