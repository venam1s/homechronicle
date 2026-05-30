import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDashboardLayout } from './useDashboardLayout.js';
import { PANEL_IDS, defaultLayouts } from '../lib/dashboardPanels.js';

beforeEach(() => {
  window.localStorage.clear();
});

describe('useDashboardLayout', () => {
  it('starts with all panels visible and the default layout', () => {
    const { result } = renderHook(() => useDashboardLayout());
    expect(result.current.hidden.size).toBe(0);
    expect(result.current.layouts.lg.map((i) => i.i).sort()).toEqual([...PANEL_IDS].sort());
  });

  it('hidePanel adds to the hidden set and persists', () => {
    const { result } = renderHook(() => useDashboardLayout());
    act(() => result.current.hidePanel(PANEL_IDS[0]));
    expect(result.current.isHidden(PANEL_IDS[0])).toBe(true);
    expect(JSON.parse(window.localStorage.getItem('hc_dashboard_hidden'))).toContain(PANEL_IDS[0]);
  });

  it('showPanel un-hides and guarantees geometry in every breakpoint', () => {
    const { result } = renderHook(() => useDashboardLayout());
    const id = PANEL_IDS[1];
    act(() => result.current.hidePanel(id));
    act(() => result.current.showPanel(id));
    expect(result.current.isHidden(id)).toBe(false);
    expect(result.current.layouts.lg.some((i) => i.i === id)).toBe(true);
    expect(result.current.layouts.sm.some((i) => i.i === id)).toBe(true);
  });

  it('ignores unknown panel ids', () => {
    const { result } = renderHook(() => useDashboardLayout());
    act(() => result.current.hidePanel('bogus'));
    expect(result.current.hidden.size).toBe(0);
  });

  it('applyLayoutChange is a no-op (same reference) when nothing moved', () => {
    const { result } = renderHook(() => useDashboardLayout());
    const before = result.current.layouts;
    act(() => result.current.applyLayoutChange(before.lg, { lg: before.lg, sm: before.sm }));
    // Identity preserved => React bails out of re-render => no RGL feedback loop.
    expect(result.current.layouts).toBe(before);
  });

  it('applyLayoutChange records new geometry when an item moves', () => {
    const { result } = renderHook(() => useDashboardLayout());
    const id = result.current.layouts.lg[0].i;
    const moved = result.current.layouts.lg.map((it) =>
      it.i === id ? { ...it, x: 0, y: 99 } : it,
    );
    act(() => result.current.applyLayoutChange(moved, { lg: moved, sm: result.current.layouts.sm }));
    expect(result.current.layouts.lg.find((it) => it.i === id).y).toBe(99);
  });

  it('keeps hidden-panel geometry across a visible-only layout change', () => {
    const { result } = renderHook(() => useDashboardLayout());
    const hiddenId = PANEL_IDS[PANEL_IDS.length - 1];
    act(() => result.current.hidePanel(hiddenId));
    const visibleLg = result.current.layouts.lg.filter((it) => it.i !== hiddenId);
    const visibleSm = result.current.layouts.sm.filter((it) => it.i !== hiddenId);
    act(() => result.current.applyLayoutChange(visibleLg, { lg: visibleLg, sm: visibleSm }));
    expect(result.current.layouts.lg.some((it) => it.i === hiddenId)).toBe(true);
  });

  it('reset restores defaults and clears hidden panels', () => {
    const { result } = renderHook(() => useDashboardLayout());
    act(() => result.current.hidePanel(PANEL_IDS[0]));
    act(() => result.current.reset());
    expect(result.current.hidden.size).toBe(0);
    expect(result.current.layouts.lg.length).toBe(defaultLayouts().lg.length);
  });

  it('falls back to defaults when stored data is corrupt', () => {
    window.localStorage.setItem('hc_dashboard_layouts', '{bad json');
    window.localStorage.setItem('hc_dashboard_hidden', 'also bad');
    const { result } = renderHook(() => useDashboardLayout());
    expect(result.current.layouts.lg.length).toBeGreaterThan(0);
    expect(result.current.hidden.size).toBe(0);
  });

  it('drops unknown panel ids found in stored layouts', () => {
    window.localStorage.setItem(
      'hc_dashboard_layouts',
      JSON.stringify({ lg: [{ i: 'ghost', x: 0, y: 0, w: 2, h: 2 }], sm: [] }),
    );
    const { result } = renderHook(() => useDashboardLayout());
    expect(result.current.layouts.lg.some((i) => i.i === 'ghost')).toBe(false);
    expect(result.current.layouts.lg.length).toBeGreaterThan(0);
  });
});
