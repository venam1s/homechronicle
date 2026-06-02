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
      expect(PANEL_IDS.indexOf(id)).toBeGreaterThanOrEqual(12);
    }
  });

  it('optional panels appear AFTER the original 12 non-optional panels', () => {
    const nonOptionalCount = PANELS.filter((p) => !p.optional).length;
    expect(nonOptionalCount).toBe(12);
    // PANEL_IDS[0] must stay kpis
    expect(PANEL_IDS[0]).toBe('kpis');
    // Optional panels must all be after index 11
    for (const id of OPTIONAL_PANEL_IDS) {
      expect(PANEL_IDS.indexOf(id)).toBeGreaterThanOrEqual(12);
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
