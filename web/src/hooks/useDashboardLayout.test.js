import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, useEffect } from 'react';
import { useDashboardLayout } from './useDashboardLayout.js';
import { PANEL_IDS, OPTIONAL_PANEL_IDS, PANEL_BY_ID, defaultLayouts } from '../lib/dashboardPanels.js';

const LAYOUTS_KEY_FOR_TEST = 'hc_dashboard_layouts';

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

  // Regression: optional panels were never hidden on a fresh install.
  //
  // react-grid-layout persists a full layout from its own mount effect, and
  // child effects run BEFORE parent effects. The seeding effect therefore read
  // storage that the grid had already filled in, concluded every optional panel
  // was known, and seeded nothing — a fresh install opened with all 24 panels.
  // jsdom never caught it because renderHook has no grid to write first.
  //
  // This reproduces the ordering with a child whose effect writes the layout.
  it('still seeds optional panels when the grid persists a layout during mount', () => {
    function GridLikeChild() {
      // Stands in for RGL's onLayoutChange firing on mount.
      useEffect(() => {
        window.localStorage.setItem(LAYOUTS_KEY_FOR_TEST, JSON.stringify(defaultLayouts()));
      }, []);
      return null;
    }

    let captured;
    function Host() {
      captured = useDashboardLayout();
      return createElement(GridLikeChild);
    }

    render(createElement(Host), { wrapper: makeWrapper() });

    expect(captured.hidden.size).toBe(OPTIONAL_PANEL_IDS.length);
    for (const id of OPTIONAL_PANEL_IDS) {
      expect(captured.isHidden(id), `${id} should be hidden on a fresh install`).toBe(true);
    }
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

  // DASH-03 / v0.4: the Almanac restyle reordered the DEFAULT arrangement. A
  // user who has already arranged their dashboard must not have it rearranged
  // underneath them — defaults are consulted only for panels absent from
  // storage, never to correct panels that are present.
  it('leaves a stored layout untouched when the default arrangement changes', () => {
    const stored = {
      lg: PANEL_IDS.map((id, i) => ({ i: id, x: 0, y: i * 3, w: 12, h: 3 })),
      sm: PANEL_IDS.map((id, i) => ({ i: id, x: 0, y: i * 3, w: 1, h: 3 })),
    };
    window.localStorage.setItem('hc_dashboard_layouts', JSON.stringify(stored));

    const { result } = renderHook(() => useDashboardLayout(), { wrapper: makeWrapper() });

    // Every stored position survives verbatim — no snapping to the new defaults.
    for (const item of stored.lg) {
      const loaded = result.current.layouts.lg.find((l) => l.i === item.i);
      expect(loaded, `${item.i} missing after load`).toBeDefined();
      expect({ x: loaded.x, y: loaded.y, w: loaded.w }, `${item.i} moved`)
        .toEqual({ x: item.x, y: item.y, w: item.w });
    }
  });

  // Regression: minH/maxH are app-defined resize constraints, not user data. Before
  // this fix, sanitizeLayouts trusted a stored minH/maxH when present, so a
  // constraint captured before a release tightened it (e.g. house-summary's minH
  // going 2 -> 1 in commit 98c4402) would round-trip through localStorage forever —
  // locking an already-onboarded user out of ever dragging the panel down to the
  // new, smaller floor, even though a fresh install got it immediately.
  it('re-derives minH/maxH from the current registry, ignoring a stale stored value', () => {
    const stored = defaultLayouts();
    // Simulate a layout saved before minH tightened: houseSummary persisted with
    // the old (looser) minH:2, one full row taller than what the registry allows now.
    stored.lg = stored.lg.map((it) =>
      it.i === 'houseSummary' ? { ...it, h: 2, minH: 2, maxH: 5 } : it,
    );
    window.localStorage.setItem('hc_dashboard_layouts', JSON.stringify(stored));

    const { result } = renderHook(() => useDashboardLayout(), { wrapper: makeWrapper() });

    const loaded = result.current.layouts.lg.find((it) => it.i === 'houseSummary');
    const registry = PANEL_BY_ID.houseSummary;
    // The resize floor/ceiling reflect the CURRENT registry, not the stale stored
    // values — so the user is no longer locked out of dragging down to the new floor.
    expect(loaded.minH).toBe(registry.minH);
    expect(loaded.maxH).toBe(registry.maxH);
    // Stored height (genuine user/carried-forward data) is preserved as long as it
    // still fits inside the current [minH, maxH] window — but the registry's window
    // for houseSummary is now [1, 1], so a stale stored h:2 no longer fits and gets
    // clamped down to the new ceiling. This is the exact real-world scenario the
    // fix targets: an already-onboarded user's oversized box collapses on next load,
    // with no manual resize required.
    expect(loaded.h).toBe(registry.maxH);
  });

  // Regression: minH/maxH were being re-derived from a SINGLE registry value
  // shared by both breakpoints, but houseSummary now genuinely needs a
  // different ceiling per breakpoint (lg:1, tight to a one-line desktop
  // reading; sm:2, because the same content commonly wraps to two lines in a
  // single narrow mobile column). A shared maxH can't satisfy both: pinning
  // it to 1 (needed to force-correct a legacy stale desktop h:2 down to 1
  // without a manual resize) would also clamp a correct, already-persisted
  // mobile h:2 down to 1 on every subsequent load -- and react-grid-layout
  // persists a layout from its own mount effect, so "subsequent load" is as
  // soon as the second page view, not some rare edge case. Per-breakpoint
  // `smMaxH` (mirroring the existing `smH` override pattern) lets lg and sm
  // each reach their own correct value.
  it('re-derives per-breakpoint maxH: lg clamps a legacy h:2 down to 1, sm keeps its own h:2 ceiling', () => {
    const stored = defaultLayouts();
    stored.lg = stored.lg.map((it) =>
      it.i === 'houseSummary' ? { ...it, h: 2, minH: 2, maxH: 5 } : it,
    );
    stored.sm = stored.sm.map((it) =>
      it.i === 'houseSummary' ? { ...it, h: 2, minH: 2, maxH: 5 } : it,
    );
    window.localStorage.setItem('hc_dashboard_layouts', JSON.stringify(stored));

    const { result } = renderHook(() => useDashboardLayout(), { wrapper: makeWrapper() });

    const loadedLg = result.current.layouts.lg.find((it) => it.i === 'houseSummary');
    const loadedSm = result.current.layouts.sm.find((it) => it.i === 'houseSummary');

    // lg: registry ceiling is 1 -- a stale stored h:2 (pre-dating the fix) is
    // force-corrected down, closing the desktop dead-space gap with no manual resize.
    expect(loadedLg.maxH).toBe(1);
    expect(loadedLg.h).toBe(1);
    // sm: registry ceiling is its own smMaxH (2) -- the stored h:2 is the CORRECT
    // mobile value (content wraps to two lines there) and must not be clamped
    // down to lg's tighter ceiling just because they share a panel id.
    expect(loadedSm.maxH).toBe(2);
    expect(loadedSm.h).toBe(2);
  });

  // Regression: the mirror case. maxH is the only thing that can pull a
  // stored value DOWN (Math.min); minH is the only thing that can force one
  // UP (Math.max). Anyone who loaded the dashboard on mobile while maxH:1 was
  // still shared across both breakpoints (the first pass of this fix) would
  // have had their sm height clamped and persisted at 1 -- a bare minH:1
  // floor leaves them stuck there forever with no way to recover, since
  // mobile resize is disabled. smMinH is required, not optional, for the
  // fix to actually be durable for that population.
  it('re-derives per-breakpoint minH: a stale sm h:1 (from when maxH was still shared) recovers to 2', () => {
    const stored = defaultLayouts();
    stored.sm = stored.sm.map((it) =>
      it.i === 'houseSummary' ? { ...it, h: 1, minH: 1, maxH: 1 } : it,
    );
    window.localStorage.setItem('hc_dashboard_layouts', JSON.stringify(stored));

    const { result } = renderHook(() => useDashboardLayout(), { wrapper: makeWrapper() });
    const loadedSm = result.current.layouts.sm.find((it) => it.i === 'houseSummary');

    expect(loadedSm.minH).toBe(2);
    expect(loadedSm.h).toBe(2);
  });

  // Regression: the same disease as houseSummary, one panel down. The KPI card
  // row's content height used to sit BETWEEN two row sizes on desktop (160px
  // of cards vs a 144px h:2 box), so users enlarged the panel to h:3 to kill
  // the scrollbar and got a ~64px blank band under the cards instead — the
  // "gap between widgets" report. KpiCards now fits h:2, and the registry pins
  // maxH:2 so that persisted h:3 is clamped back down on load. On mobile the
  // 2x2 card stack measures ~256px, so the old shared h:2 (144px) box has
  // always overflowed there: smMinH:4 migrates a stored sm h:2 UP to 4.
  it('kpis: clamps a stale desktop h:3 down to 2 and raises a stale mobile h:2 up to 4', () => {
    const stored = defaultLayouts();
    stored.lg = stored.lg.map((it) =>
      it.i === 'kpis' ? { ...it, h: 3 } : it,
    );
    stored.sm = stored.sm.map((it) =>
      it.i === 'kpis' ? { ...it, h: 2, minH: 2 } : it,
    );
    window.localStorage.setItem('hc_dashboard_layouts', JSON.stringify(stored));

    const { result } = renderHook(() => useDashboardLayout(), { wrapper: makeWrapper() });

    const loadedLg = result.current.layouts.lg.find((it) => it.i === 'kpis');
    const loadedSm = result.current.layouts.sm.find((it) => it.i === 'kpis');

    expect(loadedLg.maxH).toBe(2);
    expect(loadedLg.h).toBe(2);
    expect(loadedSm.minH).toBe(4);
    expect(loadedSm.h).toBe(4);
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
