import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const hourly = vi.fn();
const quiet = vi.fn(() => ({ data: { enabled: true, quietHoursStart: 3, quietHoursEnd: 10 } }));
vi.mock('../hooks/useEvents.js', () => ({
  useHourlyStats: () => hourly(),
  useQuietHours: () => quiet(),
}));

const { default: RhythmArcPanel, GEOMETRY, arcPath } = await import('./RhythmArcPanel.jsx');

/**
 * The dial's labels are positioned by arithmetic, so the arithmetic is what
 * gets tested. The bug: "noon" was pinned at y=10 while the apex of a 10px
 * stroke sat at y=14 — the label ran through the arc. Nothing caught it,
 * because a label overlapping a path is invisible to the DOM.
 */
const {
  R, CX, CY, STROKE, DOT_R, DOT_STROKE, FONT_SIZE, VIEWBOX_H, NOON_LABEL_Y, EDGE_LABEL_Y,
} = GEOMETRY;

// SVG `y` on <text> is the BASELINE. Cap height is roughly the font size, and
// descenders fall a little below; both matter for a clearance check.
const textTop = (baseline) => baseline - FONT_SIZE;
const textBottom = (baseline) => baseline + FONT_SIZE * 0.25;

const arcApexTop = CY - R - STROKE / 2;
const arcEndsBottom = CY + STROKE / 2;
// The "now" dot is the widest thing on the dial; at noon it sits at the apex.
const dotTopAtNoon = (CY - R) - DOT_R - DOT_STROKE / 2;

describe('rhythm arc geometry', () => {
  it('keeps the noon label clear of the arc', () => {
    expect(textBottom(NOON_LABEL_Y)).toBeLessThan(arcApexTop);
  });

  // Regression: the reported overlap was exactly this.
  it('leaves a visible gap, not merely a touching edge', () => {
    expect(arcApexTop - textBottom(NOON_LABEL_Y)).toBeGreaterThanOrEqual(3);
  });

  it('keeps the noon label clear of the now dot when now IS noon', () => {
    expect(textBottom(NOON_LABEL_Y)).toBeLessThan(dotTopAtNoon);
  });

  it('keeps the midnight labels below the arc ends', () => {
    expect(textTop(EDGE_LABEL_Y)).toBeGreaterThan(arcEndsBottom);
  });

  it('fits every label inside the viewBox', () => {
    expect(textTop(NOON_LABEL_Y)).toBeGreaterThanOrEqual(0);
    expect(textBottom(EDGE_LABEL_Y)).toBeLessThanOrEqual(VIEWBOX_H);
  });

  it('fits the whole dial, stroke included, inside the viewBox', () => {
    expect(arcApexTop).toBeGreaterThanOrEqual(0);
    expect(arcEndsBottom).toBeLessThanOrEqual(VIEWBOX_H);
    expect(CX + R + STROKE / 2).toBeLessThanOrEqual(200);
  });
});

// The API buckets by UTC hour. The dial used to plot those slots directly
// against local labels, "now" and quiet hours, so in EDT 8 AM activity was
// drawn at noon.
describe('rhythm arc hours', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('reports the busiest hour in local time', () => {
    vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(240); // EDT
    hourly.mockReturnValue({ data: [{ hour: 12, count: 50 }, { hour: 2, count: 1 }], isLoading: false });
    render(<RhythmArcPanel />);
    expect(screen.getByLabelText('Daily rhythm, busiest around 8 AM')).toBeInTheDocument();
  });
});

// The dial is a half circle: no span, however long, may take the large arc.
// A 13-hour busy band (9 AM–10 PM on prod) set the flag and looped the band
// off the dial.
describe('rhythm arc paths', () => {
  const flags = (d) => d.match(/A \S+ \S+ 0 (\d) (\d)/).slice(1);

  it('never sets the large-arc flag', () => {
    for (const [from, to] of [[9, 22], [0, 24], [2, 20], [6, 7]]) {
      expect(flags(arcPath(from, to))[0]).toBe('0');
    }
  });

  it('stays on the dial: every point of a long arc is on or above the baseline', () => {
    const d = arcPath(9, 22);
    const [, x1, y1, x2, y2] = d.match(/M (\S+) (\S+) A .* (\S+) (\S+)$/).map(Number);
    // Both ends sit on the upper half circle.
    expect(y1).toBeLessThanOrEqual(GEOMETRY.CY);
    expect(y2).toBeLessThanOrEqual(GEOMETRY.CY);
    expect(x1).toBeLessThan(x2);
    // Small arc + clockwise sweep from left to right runs over the top.
    expect(flags(d)).toEqual(['0', '1']);
  });
});

// Quiet hours are drawn as one arc, or two when the window crosses midnight.
// The split used to test "is midnight inside the window", which is also true
// for a window that STARTS at midnight: 12 AM–5 AM drew 0–5 plus 0–24, and
// the whole dial turned the quiet-hours colour.
describe('rhythm quiet-hours arcs', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  const quietArcs = (container) =>
    [...container.querySelectorAll('path')].filter((p) => p.getAttribute('stroke') === 'var(--hc-room-3)');

  function renderWithQuiet(startUtc, endUtc) {
    vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(240); // EDT
    hourly.mockReturnValue({ data: [{ hour: 14, count: 5 }], isLoading: false });
    quiet.mockReturnValue({ data: { enabled: true, quietHoursStart: startUtc, quietHoursEnd: endUtc } });
    return render(<RhythmArcPanel />);
  }

  it('draws one arc, 12 AM to 5 AM, for a window starting at midnight', () => {
    const { container } = renderWithQuiet(4, 9); // 4–9 UTC = 12 AM–5 AM EDT
    const arcs = quietArcs(container);
    expect(arcs).toHaveLength(1);
    expect(arcs[0].getAttribute('d')).toBe(arcPath(0, 5));
  });

  it('splits a window that crosses midnight into two arcs', () => {
    const { container } = renderWithQuiet(3, 10); // 11 PM–6 AM EDT
    expect(quietArcs(container).map((p) => p.getAttribute('d'))).toEqual([arcPath(0, 6), arcPath(23, 24)]);
  });
});
