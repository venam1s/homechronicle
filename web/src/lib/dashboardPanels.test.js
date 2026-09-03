import { describe, it, expect } from 'vitest';
import {
  PANELS,
  PANEL_IDS,
  PANEL_TITLES,
  OPTIONAL_PANEL_IDS,
  GRID_COLS,
  defaultLayouts,
  defaultLayoutItem,
} from './dashboardPanels.js';

describe('dashboardPanels registry', () => {
  it('has unique, non-empty panel ids', () => {
    expect(PANEL_IDS.length).toBeGreaterThan(0);
    expect(new Set(PANEL_IDS).size).toBe(PANEL_IDS.length);
    for (const id of PANEL_IDS) expect(id).toBeTruthy();
  });

  it('exposes a title for every panel', () => {
    for (const p of PANELS) expect(PANEL_TITLES[p.id]).toBe(p.title);
  });

  it('defaultLayouts includes every panel in both breakpoints', () => {
    const { lg, sm } = defaultLayouts();
    expect(lg.map((i) => i.i).sort()).toEqual([...PANEL_IDS].sort());
    expect(sm.map((i) => i.i).sort()).toEqual([...PANEL_IDS].sort());
  });

  it('lg items fit within the grid column count and respect their own minimums', () => {
    const { lg } = defaultLayouts();
    for (const it of lg) {
      expect(it.x).toBeGreaterThanOrEqual(0);
      expect(it.x + it.w).toBeLessThanOrEqual(GRID_COLS.lg);
      expect(it.w).toBeGreaterThanOrEqual(it.minW ?? 1);
      expect(it.h).toBeGreaterThanOrEqual(it.minH ?? 1);
    }
  });

  it('includes the quiet hours panel', () => {
    expect(PANEL_IDS).toContain('quietHours');
    expect(PANEL_TITLES.quietHours).toBe('Quiet Hours');
  });

  it('includes dayNight panel and does NOT contain activityClock', () => {
    expect(PANEL_IDS).toContain('dayNight');
    expect(PANEL_IDS).not.toContain('activityClock');
  });

  it('OPTIONAL_PANEL_IDS has exactly 12 ids, all in PANEL_IDS', () => {
    expect(OPTIONAL_PANEL_IDS).toHaveLength(12);
    for (const id of OPTIONAL_PANEL_IDS) {
      expect(PANEL_IDS).toContain(id);
    }
  });

  it('includes the 5 Tier 2 optional panels after the original 12 non-optional panels', () => {
    const tier2 = ['sensorEnvironment', 'batteryLevels', 'recentEpisodes', 'retentionHealth', 'eventTypeBreakdown'];
    for (const id of tier2) {
      expect(OPTIONAL_PANEL_IDS).toContain(id);
      expect(PANEL_IDS.indexOf(id)).toBeGreaterThanOrEqual(15);
    }
  });

  it('optional panels appear AFTER the core panels', () => {
    // v0.4 added three core panels (houseSummary, roomMap, rhythmArc), so the
    // core block is 15 and the lede now leads. The invariant under test is the
    // ordering, not the historic counts.
    const nonOptionalCount = PANELS.filter((p) => !p.optional).length;
    expect(nonOptionalCount).toBe(15);
    expect(PANEL_IDS[0]).toBe('houseSummary');
    for (const id of OPTIONAL_PANEL_IDS) {
      expect(PANEL_IDS.indexOf(id)).toBeGreaterThanOrEqual(nonOptionalCount);
    }
  });

  it('sm layout is a single, gap-free column in registry order', () => {
    const { sm } = defaultLayouts();
    expect(sm.map((i) => i.i)).toEqual(PANEL_IDS);
    let y = 0;
    for (const it of sm) {
      expect(it.x).toBe(0);
      expect(it.w).toBe(1);
      expect(it.y).toBe(y);
      y += it.h;
    }
  });

  it('returns fresh copies each call (callers can mutate safely)', () => {
    const a = defaultLayouts();
    a.lg[0].x = 99;
    const b = defaultLayouts();
    expect(b.lg[0].x).not.toBe(99);
  });

  it('defaultLayoutItem resolves known ids and rejects unknown ones', () => {
    const first = PANELS[0];
    expect(defaultLayoutItem(first.id, 'lg').i).toBe(first.id);
    expect(defaultLayoutItem(first.id, 'sm').w).toBe(1);
    expect(defaultLayoutItem('does-not-exist')).toBeNull();
  });
});

// -- v0.4 dashboard restyle additions --

describe('v0.4 default arrangement', () => {
  // DASH-01: these ids are persisted in every user's saved layout. Renaming or
  // dropping one silently discards that panel from their dashboard on load.
  it('still contains every registered panel, ids unchanged', () => {
    // DASH-08: the three v0.4 panels are non-optional, so sanitizeLayouts gives
    // an existing user default geometry for them and they simply appear.
    expect(PANEL_IDS).toEqual([
      'houseSummary', 'kpis', 'roomMap', 'rhythmArc',
      'trend', 'hourly', 'rooms', 'quietHours', 'activityFeed',
      'roomBreakdown', 'topDevices', 'weekdayHeatmap', 'monthlyHeatmap',
      'anomalies', 'staleDevices',
      'weekOverWeek', 'healthDonut', 'alertsSummary', 'topMovers', 'dayNight',
      'quietCompliance', 'roomSparklines', 'sensorEnvironment', 'batteryLevels',
      'recentEpisodes', 'retentionHealth', 'eventTypeBreakdown',
    ]);
  });

  // react-grid-layout silently pushes overlapping items down, so a bad default
  // never looks broken — it just isn't the layout that was declared. This
  // caught recentEpisodes running into eventTypeBreakdown at row 55.
  it('declares a default lg layout with no overlapping panels', () => {
    const occupied = new Map();
    const overlaps = [];
    for (const panel of PANELS) {
      const { x, y, w, h } = panel.lg;
      for (let cx = x; cx < x + w; cx += 1) {
        for (let cy = y; cy < y + h; cy += 1) {
          const key = `${cx},${cy}`;
          if (occupied.has(key)) overlaps.push(`${panel.id} overlaps ${occupied.get(key)}`);
          else occupied.set(key, panel.id);
        }
      }
    }
    expect([...new Set(overlaps)]).toEqual([]);
  });

  // DASH-04: the Almanac reading order — headline numbers, the thirty-day
  // shape, then the shape of a day.
  it('opens with the lede, the headline numbers, then the day at a glance', () => {
    const core = PANELS.filter((p) => !p.optional).map((p) => p.id);
    expect(core.slice(0, 5)).toEqual(['houseSummary', 'kpis', 'roomMap', 'rhythmArc', 'trend']);
    expect(PANELS.find((p) => p.id === 'houseSummary').lg.y).toBe(0);
  });

  // DASH-08: these must NOT be optional, or an existing user would have to go
  // hunting in the hidden tray for panels they were never told about.
  it.each(['houseSummary', 'roomMap', 'rhythmArc'])('%s is a core panel, not opt-in', (id) => {
    expect(OPTIONAL_PANEL_IDS).not.toContain(id);
    expect(PANEL_IDS).toContain(id);
  });

  it('lays the core panels out above the optional ones', () => {
    const lastCore = Math.max(...PANELS.filter((p) => !p.optional).map((p) => p.lg.y + p.lg.h));
    const firstOptional = Math.min(...PANELS.filter((p) => p.optional).map((p) => p.lg.y));
    expect(firstOptional).toBeGreaterThanOrEqual(lastCore);
  });
});

// -- The lede's height --
//
// houseSummary is one heading and one sentence, about 52px. It shipped as h:2
// with minH:2, which is a 144px box: ~95px of dead space above the fold, and
// minH:2 meant the grid REFUSED to let anyone drag it smaller. "No matter what
// I do it doesn't collapse" was the grid enforcing the minimum, not a styling
// problem.
describe('house summary lede sizing', () => {
  const lede = () => PANELS.find((p) => p.id === 'houseSummary');

  it('defaults to a single row', () => {
    expect(lede().lg.h).toBe(1);
  });

  it('can be dragged down to a single row', () => {
    // This is the half that matters for anyone with a saved layout: the new
    // default never reaches them, but a lower minH lets them collapse it.
    expect(lede().minH).toBe(1);
  });

  // Desktop maxH is pinned to minH (1), measured in a real browser to fit the
  // heading (single line, truncated) + paragraph (up to 2 lines, line-clamp-2)
  // + the panel's own spacing at any width >= 768px, even with worst-case
  // realistic content. Pinning maxH to 1 is also what lets sanitizeLayouts'
  // registry-derived clamp force-correct a legacy stale stored height down to
  // 1 for already-onboarded desktop users (Math.min is the only thing that
  // pulls a stored value DOWN — see useDashboardLayout.js sanitizeLayouts()).
  it('is capped at a single row on desktop', () => {
    expect(lede().maxH).toBe(1);
  });

  // Mobile needs its own, taller window: measured in a real browser, the
  // paragraph's two-clause sentence commonly wraps to 2 lines in a single
  // narrow phone column even for ordinary (non-extreme) content — a single
  // 64px row can't hold a 1-line heading plus a 2-line paragraph no matter
  // how much of the panel's own py-1/gap-1 spacing is trimmed. smH/smMinH/
  // smMaxH override the desktop lg.h/minH/maxH for exactly this case, and
  // pinning smMinH == smMaxH == 2 means the ONLY thing that could shrink it
  // (a stale stored value clamped while maxH was still shared across
  // breakpoints) gets forced back to 2 on next load, same as the desktop
  // migration forces a stale h:2 down to 1.
  it('uses a taller row on mobile — the two-clause sentence commonly wraps there', () => {
    expect(lede().smH).toBe(2);
    expect(lede().smMinH).toBe(2);
    expect(lede().smMaxH).toBe(2);
    const { sm } = defaultLayouts();
    const smItem = sm.find((i) => i.i === 'houseSummary');
    expect(smItem.h).toBe(2);
    expect(smItem.minH).toBe(2);
    expect(smItem.maxH).toBe(2);
  });

  it('keeps the mobile column gap-free with the override applied', () => {
    const { sm } = defaultLayouts();
    let y = 0;
    for (const item of sm) {
      expect(item.y).toBe(y);
      y += item.h;
    }
  });

  it('still leads the dashboard at the top-left', () => {
    expect(PANEL_IDS[0]).toBe('houseSummary');
    expect(lede().lg.y).toBe(0);
    expect(lede().lg.x).toBe(0);
  });

  // Shifting the lede up a row moved everything below it; overlapping panels
  // are silently pushed around by react-grid-layout rather than looking broken.
  it('leaves no overlaps after the row shift', () => {
    const occupied = new Map();
    const overlaps = [];
    for (const panel of PANELS) {
      const { x, y, w, h } = panel.lg;
      for (let cx = x; cx < x + w; cx += 1) {
        for (let cy = y; cy < y + h; cy += 1) {
          const key = `${cx},${cy}`;
          if (occupied.has(key)) overlaps.push(`${panel.id} overlaps ${occupied.get(key)}`);
          else occupied.set(key, panel.id);
        }
      }
    }
    expect([...new Set(overlaps)]).toEqual([]);
  });
});
