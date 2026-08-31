import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

import { useDashboardLayout } from '../hooks/useDashboardLayout.js';
import { getStoredPalette } from '../hooks/usePalette.js';
import { PANEL_IDS, OPTIONAL_PANEL_IDS } from './dashboardPanels.js';

vi.mock('../lib/api.js', () => ({
  API_BASE: 'http://localhost:3001/api',
  fetchJson: vi.fn(),
}));

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  return function W({ children }) { return createElement(QueryClientProvider, { client: qc }, children); };
}

/**
 * The dashboard layout a v0.3 install had on disk: the twelve pre-v0.4 core
 * panels in their old order and geometry. Deliberately hand-written rather than
 * imported, because importing today's defaults would make the test tautological
 * — the point is to load something the CURRENT registry did not produce.
 */
const V03_CORE = [
  ['kpis', 0, 0, 12, 2], ['quietHours', 0, 2, 12, 2], ['trend', 0, 4, 12, 5],
  ['hourly', 0, 9, 6, 4], ['rooms', 6, 9, 6, 4], ['topDevices', 0, 13, 6, 5],
  ['weekdayHeatmap', 6, 13, 6, 5], ['monthlyHeatmap', 0, 18, 12, 4],
  ['activityFeed', 0, 22, 6, 6], ['roomBreakdown', 6, 22, 6, 6],
  ['anomalies', 0, 28, 6, 4], ['staleDevices', 6, 28, 6, 4],
];

function seedV03Install({ accent = 'purple' } = {}) {
  window.localStorage.clear();
  // A v0.3 user picked an accent...
  window.localStorage.setItem('hc_accent', accent);
  // ...and had arranged their dashboard.
  const lg = V03_CORE.map(([i, x, y, w, h]) => ({ i, x, y, w, h }));
  const sm = V03_CORE.map(([i], idx) => ({ i, x: 0, y: idx * 3, w: 1, h: 3 }));
  window.localStorage.setItem('hc_dashboard_layouts', JSON.stringify({ lg, sm }));
}

/**
 * The composed v0.4 upgrade path.
 *
 * PAL-06, DASH-03 and DASH-08 are each covered in isolation elsewhere. What a
 * real upgrading install experiences is all three AT ONCE, from one storage
 * state — which is the thing most likely to break and the thing no
 * single-requirement test observes.
 */
describe('upgrading a v0.3 install to v0.4', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it('PAL-06: the stored accent becomes the nearest palette, not the default', () => {
    seedV03Install({ accent: 'purple' });
    expect(getStoredPalette()).toBe('iris');
  });

  it('PAL-06: every v0.3 accent resolves to a real palette', () => {
    for (const accent of ['ocean', 'graphite', 'sunrise', 'red', 'yellow', 'purple', 'slate', 'pink']) {
      seedV03Install({ accent });
      const palette = getStoredPalette();
      expect(palette, `accent ${accent}`).toBeTruthy();
      expect(palette, `accent ${accent} fell back to the default`).not.toBe(undefined);
    }
  });

  it('DASH-03: the arranged layout survives verbatim', () => {
    seedV03Install();
    const { result } = renderHook(() => useDashboardLayout(), { wrapper: wrapper() });

    for (const [id, x, y, w, h] of V03_CORE) {
      const item = result.current.layouts.lg.find((l) => l.i === id);
      expect(item, `${id} lost from the layout`).toBeDefined();
      expect({ x: item.x, y: item.y, w: item.w, h: item.h }, `${id} was moved`).toEqual({ x, y, w, h });
    }
  });

  it('DASH-08: the three new panels appear, and are removable like any other', () => {
    seedV03Install();
    const { result } = renderHook(() => useDashboardLayout(), { wrapper: wrapper() });

    for (const id of ['houseSummary', 'roomMap', 'rhythmArc']) {
      expect(result.current.isHidden(id), `${id} should be visible after upgrade`).toBe(false);
      expect(result.current.layouts.lg.some((l) => l.i === id), `${id} needs geometry`).toBe(true);
    }
  });

  it('does not drag the optional panels along with them', () => {
    seedV03Install();
    const { result } = renderHook(() => useDashboardLayout(), { wrapper: wrapper() });

    // The v0.3 layout predates every optional panel, so they seed into the tray
    // rather than piling onto an upgrading user's dashboard uninvited.
    for (const id of OPTIONAL_PANEL_IDS) {
      expect(result.current.isHidden(id), `${id} should stay in the tray`).toBe(true);
    }
  });

  it('ends up knowing about every registered panel', () => {
    seedV03Install();
    const { result } = renderHook(() => useDashboardLayout(), { wrapper: wrapper() });
    expect(result.current.layouts.lg.map((l) => l.i).sort()).toEqual([...PANEL_IDS].sort());
  });
});
