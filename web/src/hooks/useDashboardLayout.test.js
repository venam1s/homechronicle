import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useDashboardLayout } from './useDashboardLayout.js';
import { PANEL_IDS, OPTIONAL_PANEL_IDS, defaultLayouts } from '../lib/dashboardPanels.js';

// Mock the network layer so useAuth/useUserPreferences queries fail fast (retry:false),
// yielding user=null and the pure-localStorage anonymous path (D-15). Option B: no
// useAuth mock — the hook runs normally but resolves to an unauthenticated state.
vi.mock('../lib/api.js', () => ({
  API_BASE: 'http://localhost:3001/api',
  fetchJson: vi.fn(),
}));

// Wrap each renderHook with a QueryClientProvider so usePreference (now used internally
// by useDashboardLayout) can resolve useAuth/useUserPreferences without throwing
// "No QueryClient set". With no session, the anon localStorage path is exercised and
// all existing assertions remain byte-identical (D-15). This wrapper is the sole
// sanctioned modification to this test file (predecided checkpoint Option B).
function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe('useDashboardLayout', () => {
  it('fresh load hides exactly the optional panels and shows the non-optional panels', () => {
    // On a clean install (no stored state), the 7 optional panels are seeded into
    // hidden so they land in the "+ Add" tray; the 12 non-optional panels are visible.
    const { result } = renderHook(() => useDashboardLayout(), { wrapper: makeWrapper() });
    expect(result.current.hidden.size).toBe(OPTIONAL_PANEL_IDS.length);
    for (const id of OPTIONAL_PANEL_IDS) {
      expect(result.current.isHidden(id)).toBe(true);
    }
    const nonOptionalIds = PANEL_IDS.filter((id) => !OPTIONAL_PANEL_IDS.includes(id));
    for (const id of nonOptionalIds) {
      expect(result.current.isHidden(id)).toBe(false);
    }
    // All panels (visible + hidden) must appear in the stored layout geometry.
    expect(result.current.layouts.lg.map((i) => i.i).sort()).toEqual([...PANEL_IDS].sort());
  });

  it('hidePanel adds to the hidden set and persists', () => {
    const { result } = renderHook(() => useDashboardLayout(), { wrapper: makeWrapper() });
    act(() => result.current.hidePanel(PANEL_IDS[0]));
    expect(result.current.isHidden(PANEL_IDS[0])).toBe(true);
    expect(JSON.parse(window.localStorage.getItem('hc_dashboard_hidden'))).toContain(PANEL_IDS[0]);
  });

  it('showPanel un-hides and guarantees geometry in every breakpoint', () => {
    const { result } = renderHook(() => useDashboardLayout(), { wrapper: makeWrapper() });
    const id = PANEL_IDS[1];
    act(() => result.current.hidePanel(id));
    act(() => result.current.showPanel(id));
    expect(result.current.isHidden(id)).toBe(false);
    expect(result.current.layouts.lg.some((i) => i.i === id)).toBe(true);
    expect(result.current.layouts.sm.some((i) => i.i === id)).toBe(true);
  });

  it('ignores unknown panel ids', () => {
    const { result } = renderHook(() => useDashboardLayout(), { wrapper: makeWrapper() });
    act(() => result.current.hidePanel('bogus'));
    // 'bogus' must not have been added to hidden (only optional panels are seeded in).
    expect([...result.current.hidden]).not.toContain('bogus');
  });

  it('applyLayoutChange is a no-op (same reference) when nothing moved', () => {
    const { result } = renderHook(() => useDashboardLayout(), { wrapper: makeWrapper() });
    const before = result.current.layouts;
    act(() => result.current.applyLayoutChange(before.lg, { lg: before.lg, sm: before.sm }));
    // Identity preserved => React bails out of re-render => no RGL feedback loop.
    expect(result.current.layouts).toBe(before);
  });

  it('applyLayoutChange records new geometry when an item moves', () => {
    const { result } = renderHook(() => useDashboardLayout(), { wrapper: makeWrapper() });
    const id = result.current.layouts.lg[0].i;
    const moved = result.current.layouts.lg.map((it) =>
      it.i === id ? { ...it, x: 0, y: 99 } : it,
    );
    act(() => result.current.applyLayoutChange(moved, { lg: moved, sm: result.current.layouts.sm }));
    expect(result.current.layouts.lg.find((it) => it.i === id).y).toBe(99);
  });

  it('keeps hidden-panel geometry across a visible-only layout change', () => {
    const { result } = renderHook(() => useDashboardLayout(), { wrapper: makeWrapper() });
    const hiddenId = PANEL_IDS[PANEL_IDS.length - 1];
    act(() => result.current.hidePanel(hiddenId));
    const visibleLg = result.current.layouts.lg.filter((it) => it.i !== hiddenId);
    const visibleSm = result.current.layouts.sm.filter((it) => it.i !== hiddenId);
    act(() => result.current.applyLayoutChange(visibleLg, { lg: visibleLg, sm: visibleSm }));
    expect(result.current.layouts.lg.some((it) => it.i === hiddenId)).toBe(true);
  });

  it('reset restores defaults and clears hidden panels', () => {
    const { result } = renderHook(() => useDashboardLayout(), { wrapper: makeWrapper() });
    act(() => result.current.hidePanel(PANEL_IDS[0]));
    act(() => result.current.reset());
    expect(result.current.hidden.size).toBe(0);
    expect(result.current.layouts.lg.length).toBe(defaultLayouts().lg.length);
  });

  it('falls back to defaults when stored data is corrupt', () => {
    window.localStorage.setItem('hc_dashboard_layouts', '{bad json');
    window.localStorage.setItem('hc_dashboard_hidden', 'also bad');
    const { result } = renderHook(() => useDashboardLayout(), { wrapper: makeWrapper() });
    expect(result.current.layouts.lg.length).toBeGreaterThan(0);
    // Corrupt storage is treated as fresh install — optional panels seed into hidden.
    expect(result.current.hidden.size).toBe(OPTIONAL_PANEL_IDS.length);
    for (const id of OPTIONAL_PANEL_IDS) {
      expect(result.current.isHidden(id)).toBe(true);
    }
  });

  it('adds newly-registered panels missing from a stored layout (upgrade migration)', () => {
    // Simulate an older saved layout that predates a panel being added.
    const partial = defaultLayouts();
    const dropped = partial.lg[0].i;
    partial.lg = partial.lg.filter((it) => it.i !== dropped);
    partial.sm = partial.sm.filter((it) => it.i !== dropped);
    window.localStorage.setItem('hc_dashboard_layouts', JSON.stringify(partial));

    const { result } = renderHook(() => useDashboardLayout(), { wrapper: makeWrapper() });
    expect(result.current.layouts.lg.some((it) => it.i === dropped)).toBe(true);
    expect(result.current.layouts.sm.some((it) => it.i === dropped)).toBe(true);
    // and it is visible (not auto-hidden)
    expect(result.current.isHidden(dropped)).toBe(false);
  });

  it('drops unknown panel ids found in stored layouts', () => {
    window.localStorage.setItem(
      'hc_dashboard_layouts',
      JSON.stringify({ lg: [{ i: 'ghost', x: 0, y: 0, w: 2, h: 2 }], sm: [] }),
    );
    const { result } = renderHook(() => useDashboardLayout(), { wrapper: makeWrapper() });
    expect(result.current.layouts.lg.some((i) => i.i === 'ghost')).toBe(false);
    expect(result.current.layouts.lg.length).toBeGreaterThan(0);
  });

  it('existing user with only non-optional layout: new optional panels land in hidden tray', () => {
    // Simulate an existing user whose stored layout contains only the 12 original panels
    // (no optional ids). On load, every optional panel must be seeded into hidden.
    const nonOptionalIds = PANEL_IDS.filter((id) => !OPTIONAL_PANEL_IDS.includes(id));
    const baseLayouts = defaultLayouts();
    const partialLg = baseLayouts.lg.filter((it) => nonOptionalIds.includes(it.i));
    const partialSm = baseLayouts.sm.filter((it) => nonOptionalIds.includes(it.i));
    window.localStorage.setItem(
      'hc_dashboard_layouts',
      JSON.stringify({ lg: partialLg, sm: partialSm }),
    );
    window.localStorage.setItem('hc_dashboard_hidden', JSON.stringify([]));

    const { result } = renderHook(() => useDashboardLayout(), { wrapper: makeWrapper() });

    // All optional panels must be in the hidden tray.
    for (const id of OPTIONAL_PANEL_IDS) {
      expect(result.current.isHidden(id)).toBe(true);
    }
    // Non-optional panels must be visible.
    for (const id of nonOptionalIds) {
      expect(result.current.isHidden(id)).toBe(false);
    }
  });

  it('optional panel previously shown by user stays visible on reload', () => {
    // If the user had explicitly shown an optional panel (it is in their stored
    // layout), it must NOT be seeded into hidden on the next load.
    const shownOptionalId = OPTIONAL_PANEL_IDS[0];
    const nonOptionalIds = PANEL_IDS.filter((id) => !OPTIONAL_PANEL_IDS.includes(id));
    const baseLayouts = defaultLayouts();
    const storedLg = [
      ...baseLayouts.lg.filter((it) => nonOptionalIds.includes(it.i)),
      // The user previously added this optional panel.
      baseLayouts.lg.find((it) => it.i === shownOptionalId),
    ];
    // lg and sm are always persisted together, so the stored sm must mirror lg
    // (non-optional panels + the one optional the user added). Leaving sm as the
    // full default would list every optional panel and falsely mark them "known".
    const storedSm = [
      ...baseLayouts.sm.filter((it) => nonOptionalIds.includes(it.i)),
      baseLayouts.sm.find((it) => it.i === shownOptionalId),
    ];
    window.localStorage.setItem(
      'hc_dashboard_layouts',
      JSON.stringify({ lg: storedLg, sm: storedSm }),
    );
    window.localStorage.setItem('hc_dashboard_hidden', JSON.stringify([]));

    const { result } = renderHook(() => useDashboardLayout(), { wrapper: makeWrapper() });

    // The previously-shown optional panel must remain visible.
    expect(result.current.isHidden(shownOptionalId)).toBe(false);
    // Other optional panels that were not in the stored layout must be hidden.
    for (const id of OPTIONAL_PANEL_IDS.filter((id) => id !== shownOptionalId)) {
      expect(result.current.isHidden(id)).toBe(true);
    }
  });

  it('optional panel explicitly in stored hidden list stays hidden (not double-seeded)', () => {
    // If the user previously saw and hid an optional panel, it must stay hidden
    // and not appear twice in the hidden set.
    const hiddenOptionalId = OPTIONAL_PANEL_IDS[0];
    window.localStorage.setItem('hc_dashboard_hidden', JSON.stringify([hiddenOptionalId]));

    const { result } = renderHook(() => useDashboardLayout(), { wrapper: makeWrapper() });
    expect(result.current.isHidden(hiddenOptionalId)).toBe(true);
    // Count occurrences in hidden set — Set prevents duplicates but verify the
    // size accounts for all optional panels exactly once.
    const hiddenArr = [...result.current.hidden];
    const occurrences = hiddenArr.filter((id) => id === hiddenOptionalId).length;
    expect(occurrences).toBe(1);
  });
});
