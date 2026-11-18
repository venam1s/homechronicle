# Fit-to-content Dashboard Panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nine list-style dashboard panels collapse to one grid row when empty and grow to fit their content, up to a user-set ceiling (default 5 rows), instead of sitting in a fixed-height box.

**Architecture:** The react-grid-layout item height stays the source of truth for geometry, but for `fit` panels the stored `h` becomes a ceiling. `DashboardPanel` measures its content with a `ResizeObserver`; `DashboardGrid` converts pixels to rows and feeds `min(rows, ceiling)` into the `layouts` prop. `useDashboardLayout` stops persisting view-mode layout changes (only Customize mode can move anything) and runs a one-time migration that raises existing stored heights for fit panels to the new default ceiling.

**Tech Stack:** React 19, react-grid-layout 2.2.3, TanStack Query, Tailwind v4, vitest + jsdom + Testing Library. ES modules, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-17-fit-to-content-panels-design.md`

## Global Constraints

- Grid constants are fixed: `GRID_ROW_HEIGHT = 64`, `GRID_MARGIN = [16, 16]`. An item of `h` rows is `h * 64 + (h - 1) * 16` px tall.
- Fit panels (exactly these nine ids): `quietHours`, `anomalies`, `staleDevices`, `alertsSummary`, `topMovers`, `batteryLevels`, `recentEpisodes`, `sensorEnvironment`, `roomSparklines`.
- Default ceiling for every fit panel: `lg.h = 5`. Collapse floor: `minH = 1`.
- Layout changes that arrive while not editing are discarded, never persisted.
- While editing on desktop (`lg`), fit panels render at the ceiling. While editing on mobile (`sm`), and in view mode on both breakpoints, they render fitted.
- Unmeasured fit panels start at 1 row. Measurements are cached at module level, keyed by panel id, so they survive tab switches.
- Empty, loading, error and not-configured states of fit panels are a single line: icon, title, middle dot, message. Message text of existing states is unchanged except Quiet Hours not-configured, which becomes exactly `Not set up. Configure in Settings.`
- Nothing inside a fit panel's body may size itself from the grid cell (no `h-full`, no `flex-1 min-h-0` fill wrappers).
- Light and dark themes: no new colours; reuse existing `hc-*` tokens only.
- Commits: `git add <explicit paths>` then `git commit --only <same paths> -m "..."`. Never `git add -A`. No Co-Authored-By or AI attribution trailers.
- Run `cd web && npm test` before claiming any task done. All tests must pass.

## Review Focus

Inputs the spec implies but which are easy to break; each has a pinned test in the task named.

1. **User drags a fit panel's ceiling below its content, then leaves Customize.** Expected: panel renders at the ceiling and scrolls inside. Pinned in Task 2 (`applyFitHeights` clamps `fitRows` 4 to stored 3).
2. **A hidden fit panel is restored from the tray on a later visit.** Expected: it gets ceiling 5 from the registry and starts at 1 row until measured, then grows. Pinned in Task 2 (unmeasured starts at 1) and Task 3 (`showPanel` seeds `h: 5`).
3. **User already migrated, then lowered a ceiling to 3, then reloads.** Expected: stays 3; the migration must not re-raise. Pinned in Task 3.
4. **Reset to defaults in Customize mode.** Expected: fit panels return to ceiling 5 and the layout stays stable on the next load. Pinned in Task 3.
5. **Non-fit panels (charts, KPIs) must be untouched by all of this.** Expected: `applyFitHeights` passes them through unchanged in both modes, and an edit-mode height change on one still persists. Pinned in Task 2 and Task 3.

---

### Task 1: Registry: mark the fit panels, raise ceilings, renumber the default layout

**Files:**
- Modify: `web/src/lib/dashboardPanels.js`
- Test: `web/src/lib/dashboardPanels.test.js`

**Interfaces:**
- Produces: `fit: true` on the nine panels; `export const FIT_PANEL_IDS` (array of the nine ids in registry order); `quietHours` no longer `bare`.

- [ ] **Step 1: Write the failing tests** (append to `dashboardPanels.test.js`)

```js
import { FIT_PANEL_IDS, PANELS, PANEL_BY_ID } from './dashboardPanels.js';

describe('fit-to-content panels', () => {
  it('names exactly the nine list panels', () => {
    expect(FIT_PANEL_IDS).toEqual([
      'quietHours', 'anomalies', 'staleDevices', 'alertsSummary', 'topMovers',
      'roomSparklines', 'sensorEnvironment', 'batteryLevels', 'recentEpisodes',
    ]);
    for (const id of FIT_PANEL_IDS) expect(PANEL_BY_ID[id].fit).toBe(true);
    for (const p of PANELS) if (!FIT_PANEL_IDS.includes(p.id)) expect(p.fit).toBeUndefined();
  });

  it('every fit panel defaults to a 5-row ceiling and a 1-row floor', () => {
    for (const id of FIT_PANEL_IDS) {
      expect(PANEL_BY_ID[id].lg.h).toBe(5);
      expect(PANEL_BY_ID[id].minH).toBe(1);
      expect(PANEL_BY_ID[id].maxH).toBeUndefined();
    }
  });

  it('quiet hours lets the grid wrapper draw its card', () => {
    expect(PANEL_BY_ID.quietHours.bare).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd web && npx vitest run src/lib/dashboardPanels.test.js`
Expected: FAIL, `FIT_PANEL_IDS` is not exported.

- [ ] **Step 3: Edit the registry**

In `PANELS`, for each of the nine ids add `fit: true`, set `lg.h: 5`, set `minH: 1`. Remove `bare: true` from `quietHours`. Then renumber `lg.y` so the default layout is gap-free with no overlaps. Use these rows:

| id | x | y | w | h |
|---|---|---|---|---|
| houseSummary | 0 | 0 | 12 | 1 |
| kpis | 0 | 1 | 12 | 2 |
| roomMap | 0 | 3 | 7 | 5 |
| rhythmArc | 7 | 3 | 5 | 5 |
| trend | 0 | 8 | 12 | 5 |
| hourly | 0 | 13 | 6 | 4 |
| rooms | 6 | 13 | 6 | 4 |
| quietHours | 0 | 17 | 12 | 5 |
| activityFeed | 0 | 22 | 6 | 6 |
| roomBreakdown | 6 | 22 | 6 | 6 |
| topDevices | 0 | 28 | 6 | 5 |
| weekdayHeatmap | 6 | 28 | 6 | 5 |
| monthlyHeatmap | 0 | 33 | 12 | 4 |
| anomalies | 0 | 37 | 6 | 5 |
| staleDevices | 6 | 37 | 6 | 5 |
| weekOverWeek | 0 | 42 | 12 | 2 |
| healthDonut | 0 | 44 | 6 | 4 |
| alertsSummary | 6 | 44 | 6 | 5 |
| topMovers | 0 | 49 | 6 | 5 |
| dayNight | 6 | 49 | 6 | 4 |
| quietCompliance | 0 | 54 | 6 | 4 |
| roomSparklines | 6 | 54 | 6 | 5 |
| sensorEnvironment | 0 | 59 | 6 | 5 |
| batteryLevels | 6 | 59 | 6 | 5 |
| recentEpisodes | 0 | 64 | 6 | 5 |
| retentionHealth | 6 | 64 | 6 | 4 |
| eventTypeBreakdown | 0 | 69 | 6 | 4 |
| categories | 6 | 68 | 6 | 6 |

Add after `OPTIONAL_PANEL_IDS`:

```js
export const FIT_PANEL_IDS = PANELS.filter((p) => p.fit).map((p) => p.id);
```

Add a short comment block above the registry explaining `fit` (stored `h` is the ceiling, `minH` the collapse floor, see spec), in the style of the existing `houseSummary` notes but no longer than ten lines.

- [ ] **Step 4: Run the registry tests**

Run: `cd web && npx vitest run src/lib/dashboardPanels.test.js`
Expected: PASS, including the existing "no overlapping panels" and "core panels above optional" tests.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/dashboardPanels.js web/src/lib/dashboardPanels.test.js
git commit --only web/src/lib/dashboardPanels.js web/src/lib/dashboardPanels.test.js -m "feat(dashboard): mark list panels fit-to-content with a 5-row default ceiling"
```

---

### Task 2: Row arithmetic, measurement cache, and effective-layout helper

**Files:**
- Create: `web/src/lib/fitRows.js`
- Test: `web/src/lib/fitRows.test.js`

**Interfaces:**
- Consumes: `GRID_ROW_HEIGHT`, `GRID_MARGIN`, `PANEL_BY_ID` from `dashboardPanels.js`.
- Produces:
  - `rowsForHeight(px: number): number` — `max(1, ceil((px + marginY) / (rowHeight + marginY)))`.
  - `rememberFitRows(id: string, rows: number): void` — module-level cache write.
  - `recallFitRows(): Record<string, number>` — plain-object snapshot of the cache.
  - `resetFitRowsCache(): void` — test helper.
  - `applyFitHeights(layouts: {lg: Item[], sm: Item[]}, fitRows: Record<string, number>, opts: { editing?: boolean }): {lg: Item[], sm: Item[]}` — returns new arrays; fit items get `h = clamp(fitRows[id] ?? 1, 1, item.h)` except on `lg` while `editing`, where they are unchanged. Non-fit items are passed through by reference.

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect, beforeEach } from 'vitest';
import {
  rowsForHeight, rememberFitRows, recallFitRows, resetFitRowsCache, applyFitHeights,
} from './fitRows.js';

beforeEach(() => resetFitRowsCache());

describe('rowsForHeight', () => {
  it.each([[0, 1], [64, 1], [65, 2], [144, 2], [145, 3], [224, 3], [225, 4]])(
    '%ipx needs %i row(s)', (px, rows) => expect(rowsForHeight(px)).toBe(rows),
  );
});

describe('fit rows cache', () => {
  it('remembers rows per panel and snapshots as a plain object', () => {
    rememberFitRows('quietHours', 3);
    expect(recallFitRows()).toEqual({ quietHours: 3 });
    rememberFitRows('quietHours', 1);
    expect(recallFitRows().quietHours).toBe(1);
  });
});

describe('applyFitHeights', () => {
  const item = (i, h, extra = {}) => ({ i, x: 0, y: 0, w: 6, h, minH: 1, ...extra });
  const layouts = {
    lg: [item('quietHours', 5), item('trend', 5, { minH: 3 })],
    sm: [item('quietHours', 5), item('trend', 5, { minH: 3 })],
  };

  it('collapses a fit panel to its measured rows in view mode', () => {
    const out = applyFitHeights(layouts, { quietHours: 2 }, { editing: false });
    expect(out.lg.find((it) => it.i === 'quietHours').h).toBe(2);
    expect(out.sm.find((it) => it.i === 'quietHours').h).toBe(2);
  });

  it('never exceeds the stored ceiling (Review Focus 1)', () => {
    const out = applyFitHeights({ lg: [item('quietHours', 3)], sm: [] }, { quietHours: 4 }, {});
    expect(out.lg[0].h).toBe(3);
  });

  it('starts an unmeasured fit panel at 1 row (Review Focus 2)', () => {
    const out = applyFitHeights(layouts, {}, { editing: false });
    expect(out.lg.find((it) => it.i === 'quietHours').h).toBe(1);
  });

  it('pins fit panels to the ceiling while editing on lg only', () => {
    const out = applyFitHeights(layouts, { quietHours: 2 }, { editing: true });
    expect(out.lg.find((it) => it.i === 'quietHours').h).toBe(5);
    expect(out.sm.find((it) => it.i === 'quietHours').h).toBe(2);
  });

  it('passes non-fit panels through by reference (Review Focus 5)', () => {
    const out = applyFitHeights(layouts, { trend: 1 }, { editing: false });
    expect(out.lg.find((it) => it.i === 'trend')).toBe(layouts.lg[1]);
    expect(out.lg.find((it) => it.i === 'trend').h).toBe(5);
  });

  it('does not mutate its input', () => {
    const before = JSON.stringify(layouts);
    applyFitHeights(layouts, { quietHours: 1 }, {});
    expect(JSON.stringify(layouts)).toBe(before);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd web && npx vitest run src/lib/fitRows.test.js`
Expected: FAIL, cannot resolve `./fitRows.js`.

- [ ] **Step 3: Implement `web/src/lib/fitRows.js`**

Export the five functions with the signatures above. `applyFitHeights` decides "is fit" via `PANEL_BY_ID[item.i]?.fit`. Header comment: three lines on why stored `h` is a ceiling for fit panels and why the cache is module-level (DashboardPage unmounts on every tab switch).

- [ ] **Step 4: Run the tests**

Run: `cd web && npx vitest run src/lib/fitRows.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/fitRows.js web/src/lib/fitRows.test.js
git commit --only web/src/lib/fitRows.js web/src/lib/fitRows.test.js -m "feat(dashboard): row arithmetic and effective-layout helper for fit panels"
```

---

### Task 3: Layout hook: editing gate, mobile ceiling preservation, one-time ceiling migration

**Files:**
- Modify: `web/src/hooks/useDashboardLayout.js`
- Test: `web/src/hooks/useDashboardLayout.test.js`

**Interfaces:**
- Consumes: `PANEL_BY_ID`, `GRID_COLS` from `dashboardPanels.js`.
- Produces:
  - `applyLayoutChange(current, allLayouts, { editing = false } = {})` — third parameter is new. Returns without persisting when `editing` is false. While editing, for fit panels on `sm` the stored `h` is kept and only `x/y/w` are taken.
  - Stored blob shape gains `fitV: 1` (`FIT_V` constant). `sanitizeLayouts` returns `{ lg, sm, fitV: 1 }`; when the input lacks `fitV === 1`, each fit panel's `h` on each breakpoint is raised to `Math.max(h, defaultH)` (`defaultH` = `panel.lg.h` for `lg`, `panel.smH ?? panel.lg.h` for `sm`).
  - The hook's returned `layouts` is `{ lg, sm }` only (marker stripped) so `DashboardGrid` keeps iterating `Object.keys(layouts)` safely.
  - Loops over breakpoints use `const BREAKPOINTS = Object.keys(GRID_COLS)` rather than `Object.keys(sanitized)`.

- [ ] **Step 1: Update the two existing tests that persist through `applyLayoutChange`**

In `useDashboardLayout.test.js`, the tests `applyLayoutChange records new geometry when an item moves` and `keeps hidden-panel geometry across a visible-only layout change` pass `{ editing: true }` as the third argument. Leave `applyLayoutChange is a no-op (same reference) when nothing moved` unchanged (it must hold in both modes). Read `still seeds optional panels when the grid persists a layout during mount` and, if it calls `applyLayoutChange`, pass `{ editing: true }` there too so the scenario it guards still exercises a write.

- [ ] **Step 2: Write the failing tests** (append inside `describe('useDashboardLayout')`)

```js
it('discards a layout change that arrives while not editing', () => {
  const { result } = renderHook(() => useDashboardLayout(), { wrapper: makeWrapper() });
  const before = result.current.layouts;
  const moved = before.lg.map((it) => (it.i === 'trend' ? { ...it, y: 99 } : it));
  act(() => result.current.applyLayoutChange(moved, { lg: moved, sm: before.sm }));
  expect(result.current.layouts).toBe(before);
  expect(window.localStorage.getItem('hc_dashboard_layouts')).toBeNull();
});

it('takes a new height for a non-fit panel while editing on lg (Review Focus 5)', () => {
  const { result } = renderHook(() => useDashboardLayout(), { wrapper: makeWrapper() });
  const moved = result.current.layouts.lg.map((it) => (it.i === 'trend' ? { ...it, h: 4 } : it));
  act(() => result.current.applyLayoutChange(moved, { lg: moved, sm: result.current.layouts.sm }, { editing: true }));
  expect(result.current.layouts.lg.find((it) => it.i === 'trend').h).toBe(4);
});

it('takes a new ceiling for a fit panel while editing on lg', () => {
  const { result } = renderHook(() => useDashboardLayout(), { wrapper: makeWrapper() });
  const moved = result.current.layouts.lg.map((it) => (it.i === 'quietHours' ? { ...it, h: 3 } : it));
  act(() => result.current.applyLayoutChange(moved, { lg: moved, sm: result.current.layouts.sm }, { editing: true }));
  expect(result.current.layouts.lg.find((it) => it.i === 'quietHours').h).toBe(3);
});

it('keeps the stored ceiling for a fit panel while editing on sm (fitted height is not a ceiling)', () => {
  const { result } = renderHook(() => useDashboardLayout(), { wrapper: makeWrapper() });
  const sm = result.current.layouts.sm.map((it) => (it.i === 'quietHours' ? { ...it, h: 1, y: it.y } : it));
  act(() => result.current.applyLayoutChange(sm, { lg: result.current.layouts.lg, sm }, { editing: true }));
  expect(result.current.layouts.sm.find((it) => it.i === 'quietHours').h).toBe(5);
});

it('raises legacy fixed heights of fit panels to the default ceiling once and writes through', async () => {
  const stored = defaultLayouts();
  stored.lg = stored.lg.map((it) => (it.i === 'quietHours' ? { ...it, h: 2 } : it));
  stored.sm = stored.sm.map((it) => (it.i === 'anomalies' ? { ...it, h: 4 } : it));
  window.localStorage.setItem('hc_dashboard_layouts', JSON.stringify(stored)); // no fitV
  const { result } = renderHook(() => useDashboardLayout(), { wrapper: makeWrapper() });
  expect(result.current.layouts.lg.find((it) => it.i === 'quietHours').h).toBe(5);
  expect(result.current.layouts.sm.find((it) => it.i === 'anomalies').h).toBe(5);
  expect(result.current.layouts.fitV).toBeUndefined();
  await waitFor(() => {
    const persisted = JSON.parse(window.localStorage.getItem('hc_dashboard_layouts'));
    expect(persisted.fitV).toBe(1);
    expect(persisted.lg.find((it) => it.i === 'quietHours').h).toBe(5);
  });
});

it('does not re-raise a ceiling the user lowered after migration (Review Focus 3)', () => {
  const stored = { ...defaultLayouts(), fitV: 1 };
  stored.lg = stored.lg.map((it) => (it.i === 'quietHours' ? { ...it, h: 3 } : it));
  window.localStorage.setItem('hc_dashboard_layouts', JSON.stringify(stored));
  const { result } = renderHook(() => useDashboardLayout(), { wrapper: makeWrapper() });
  expect(result.current.layouts.lg.find((it) => it.i === 'quietHours').h).toBe(3);
});

it('reset returns fit panels to the default ceiling (Review Focus 4)', () => {
  const stored = { ...defaultLayouts(), fitV: 1 };
  stored.lg = stored.lg.map((it) => (it.i === 'quietHours' ? { ...it, h: 2 } : it));
  window.localStorage.setItem('hc_dashboard_layouts', JSON.stringify(stored));
  const { result } = renderHook(() => useDashboardLayout(), { wrapper: makeWrapper() });
  act(() => result.current.reset());
  expect(result.current.layouts.lg.find((it) => it.i === 'quietHours').h).toBe(5);
});

it('showPanel seeds a restored fit panel with the default ceiling (Review Focus 2)', () => {
  const stored = { ...defaultLayouts(), fitV: 1 };
  stored.lg = stored.lg.filter((it) => it.i !== 'batteryLevels');
  stored.sm = stored.sm.filter((it) => it.i !== 'batteryLevels');
  window.localStorage.setItem('hc_dashboard_layouts', JSON.stringify(stored));
  window.localStorage.setItem('hc_dashboard_hidden', JSON.stringify(['batteryLevels']));
  const { result } = renderHook(() => useDashboardLayout(), { wrapper: makeWrapper() });
  act(() => result.current.showPanel('batteryLevels'));
  expect(result.current.layouts.lg.find((it) => it.i === 'batteryLevels').h).toBe(5);
});
```

Add `waitFor` to the Testing Library import.

- [ ] **Step 3: Run to verify they fail**

Run: `cd web && npx vitest run src/hooks/useDashboardLayout.test.js`
Expected: the new tests FAIL (view-mode change is persisted; `fitV` missing; sm ceiling overwritten). The two tests updated in Step 1 PASS.

- [ ] **Step 4: Implement in `useDashboardLayout.js`**

- Add `const FIT_V = 1;` and `const BREAKPOINTS = Object.keys(GRID_COLS);` (import `GRID_COLS`).
- `sanitizeLayouts(stored)`: iterate `BREAKPOINTS`; after the existing clamp, if `stored?.fitV !== FIT_V` and `panel?.fit`, raise `h` to `Math.max(h, defaultH)`; return `{ ...out, fitV: FIT_V }`.
- `layouts` memo: strip `fitV` before returning. Keep referential stability (one memo).
- Seed effect: before the optional-panel early return, if `initialRawRef.current.layouts` is a non-null object and its `fitV !== FIT_V`, call `setStoredLayouts(sanitizeLayouts(initialRawRef.current.layouts))`. Comment: view-mode writes no longer happen, so this is the only moment the one-time raise reaches storage.
- `applyLayoutChange(_current, allLayouts, { editing = false } = {})`: first line after the type guard is `if (!editing) return;`. In the merge, when `bp === 'sm' && PANEL_BY_ID[it.i]?.fit`, set `h: prevItem?.h ?? (Number(it.h) || 1)`. Iterate `BREAKPOINTS`. Update the comment above the function: RGL still fires on mount and breakpoint change, and those are now dropped by the editing gate rather than by the no-op comparison alone.
- `showPanel`: iterate `BREAKPOINTS`.

- [ ] **Step 5: Run the hook tests, then the whole suite**

Run: `cd web && npx vitest run src/hooks/useDashboardLayout.test.js && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/hooks/useDashboardLayout.js web/src/hooks/useDashboardLayout.test.js
git commit --only web/src/hooks/useDashboardLayout.js web/src/hooks/useDashboardLayout.test.js -m "feat(dashboard): stored height is a ceiling for fit panels; drop view-mode layout writes"
```

---

### Task 4: `PanelEmptyLine` single-line state component

**Files:**
- Create: `web/src/components/PanelEmptyLine.jsx`
- Test: `web/src/components/PanelEmptyLine.test.jsx`

**Interfaces:**
- Produces: `export default function PanelEmptyLine({ icon, title, message, tone = 'muted', children })`.
  - `icon`: an already-sized element (e.g. `<Moon size={14} />`) or omitted.
  - `title`: panel title, `text-sm font-semibold text-hc-fg`, does not shrink.
  - `message`: `text-sm`, `truncate`, `title={message}`; colour `text-hc-muted` for `tone='muted'`, `text-hc-danger-text` for `tone='danger'`.
  - Between title and message a `·` in `text-hc-muted`, `aria-hidden`.
  - `children`: optional trailing element rendered with `ml-auto shrink-0` (used by Quiet Hours' non-embedded dismiss button).
  - Root: `<div className="flex items-center gap-2 min-w-0 text-sm">`. The root must have no vertical padding or margin: the 1-row budget is 24px of content.

- [ ] **Step 1: Write the failing tests**

```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PanelEmptyLine from './PanelEmptyLine.jsx';

describe('PanelEmptyLine', () => {
  it('renders title, separator and message on one flex row', () => {
    const { container } = render(<PanelEmptyLine title="Quiet Hours" message="No unexpected activity" />);
    expect(screen.getByText('Quiet Hours')).toBeInTheDocument();
    expect(screen.getByText('No unexpected activity')).toBeInTheDocument();
    expect(container.firstChild.className).toMatch(/\bflex\b/);
    expect(container.firstChild.className).toMatch(/items-center/);
  });

  it('truncates the message and exposes the full text as a tooltip', () => {
    const msg = 'No unexpected activity during quiet hours (11 PM – 6 AM)';
    render(<PanelEmptyLine title="Quiet Hours" message={msg} />);
    const el = screen.getByText(msg);
    expect(el.className).toMatch(/truncate/);
    expect(el).toHaveAttribute('title', msg);
  });

  it('uses the danger token for tone="danger" and muted otherwise', () => {
    const { rerender } = render(<PanelEmptyLine title="T" message="bad" tone="danger" />);
    expect(screen.getByText('bad').className).toMatch(/text-hc-danger-text/);
    rerender(<PanelEmptyLine title="T" message="ok" />);
    expect(screen.getByText('ok').className).toMatch(/text-hc-muted/);
  });

  it('renders a trailing child pushed to the end', () => {
    render(<PanelEmptyLine title="T" message="m"><button>x</button></PanelEmptyLine>);
    expect(screen.getByRole('button', { name: 'x' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd web && npx vitest run src/components/PanelEmptyLine.test.jsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `PanelEmptyLine.jsx`** per the interface. Use `clsx` for the tone class.

- [ ] **Step 4: Run the tests**

Run: `cd web && npx vitest run src/components/PanelEmptyLine.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/PanelEmptyLine.jsx web/src/components/PanelEmptyLine.test.jsx
git commit --only web/src/components/PanelEmptyLine.jsx web/src/components/PanelEmptyLine.test.jsx -m "feat(dashboard): single-line empty-state component for fit panels"
```

---

### Task 5: `DashboardPanel` measures content height for fit panels

**Files:**
- Modify: `web/src/components/DashboardPanel.jsx`
- Test: `web/src/components/DashboardPanel.test.jsx`

**Interfaces:**
- Produces: new props `fit` (bool, default false) and `onContentHeight(px: number)`.
  - When `fit`, `body` is rendered inside `<div data-fit-measure>` directly inside the existing body container (`flex-1 min-h-0 overflow-auto ...`). That inner div is a plain block: no `h-full`, no flex classes.
  - A `ResizeObserver` observes the measure div while mounted and `fit` is true; disconnected on unmount or when `fit` turns false.
  - Reported px = the height the root would have if it were sized to content exactly: `root.offsetHeight - bodyContainer.clientHeight + measure.offsetHeight + paddingTop(bodyContainer) + paddingBottom(bodyContainer)`, paddings read from `getComputedStyle` as `parseFloat(value) || 0` (jsdom returns empty strings, and `NaN` rows would wedge the grid). (The first two terms are borders plus the edit header; `clientHeight` includes padding, so it is added back explicitly.)
  - `onContentHeight` is called synchronously from the observer callback and once on mount after the observer attaches. No debounce: `ResizeObserver` is already frame-batched; integer-row gating lives in the grid.

- [ ] **Step 1: Write the failing tests** (append to `DashboardPanel.test.jsx`)

```jsx
describe('DashboardPanel fit measurement', () => {
  let observers;
  const RealRO = globalThis.ResizeObserver;
  beforeEach(() => {
    observers = [];
    globalThis.ResizeObserver = class {
      constructor(cb) { this.cb = cb; this.observed = []; observers.push(this); }
      observe(el) { this.observed.push(el); }
      unobserve() {}
      disconnect() { this.disconnected = true; }
    };
  });
  afterEach(() => { globalThis.ResizeObserver = RealRO; });

  it('does not observe anything for a non-fit panel', () => {
    render(<DashboardPanel title="Trend" editing={false} body={<div>b</div>} />);
    expect(observers).toHaveLength(0);
  });

  it('observes an intrinsic-height wrapper around the body for a fit panel', () => {
    const { container } = render(
      <DashboardPanel title="Quiet Hours" editing={false} fit onContentHeight={() => {}} body={<div>b</div>} />,
    );
    const measure = container.querySelector('[data-fit-measure]');
    expect(measure).not.toBeNull();
    expect(measure.className).not.toMatch(/h-full|flex-1/);
    expect(observers).toHaveLength(1);
    expect(observers[0].observed).toContain(measure);
  });

  it('reports a pixel height when the observer fires', () => {
    const onContentHeight = vi.fn();
    const { container } = render(
      <DashboardPanel title="Quiet Hours" editing={false} fit onContentHeight={onContentHeight} body={<div>b</div>} />,
    );
    const measure = container.querySelector('[data-fit-measure]');
    Object.defineProperty(measure, 'offsetHeight', { value: 60, configurable: true });
    onContentHeight.mockClear();
    observers[0].cb([]);
    expect(onContentHeight).toHaveBeenCalledTimes(1);
    expect(onContentHeight.mock.calls[0][0]).toBeGreaterThanOrEqual(60);
  });

  it('disconnects on unmount', () => {
    const { unmount } = render(
      <DashboardPanel title="Q" editing={false} fit onContentHeight={() => {}} body={<div>b</div>} />,
    );
    unmount();
    expect(observers[0].disconnected).toBe(true);
  });
});
```

Add `beforeEach, afterEach` to the vitest import.

- [ ] **Step 2: Run to verify they fail**

Run: `cd web && npx vitest run src/components/DashboardPanel.test.jsx`
Expected: the four new tests FAIL (no measure wrapper, no observer).

- [ ] **Step 3: Implement** in `DashboardPanel.jsx`: add the two props, a `useRef` for the root, body container and measure div, and a `useEffect` keyed on `[fit, onContentHeight]` that creates the observer, observes, reports once, and disconnects in cleanup. Extend the component's doc comment with a paragraph on fit measurement (why the measured element must have intrinsic height).

- [ ] **Step 4: Run the component tests**

Run: `cd web && npx vitest run src/components/DashboardPanel.test.jsx`
Expected: PASS (existing tests included).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/DashboardPanel.jsx web/src/components/DashboardPanel.test.jsx
git commit --only web/src/components/DashboardPanel.jsx web/src/components/DashboardPanel.test.jsx -m "feat(dashboard): DashboardPanel reports content height for fit panels"
```

---

### Task 6: Wire the grid and the Customize hint

**Files:**
- Modify: `web/src/components/DashboardGrid.jsx`
- Modify: `web/src/pages/DashboardPage.jsx`

**Interfaces:**
- Consumes: `rowsForHeight`, `rememberFitRows`, `recallFitRows`, `applyFitHeights` from `lib/fitRows.js`; `DashboardPanel` props `fit`, `onContentHeight`; `applyLayoutChange(current, all, { editing })` from Task 3.
- Produces: no new exports.

- [ ] **Step 1: Wire `DashboardGrid.jsx`**

- `const [fitRows, setFitRows] = useState(() => recallFitRows());`
- `const reportContentHeight = useCallback((id, px) => { const rows = rowsForHeight(px); rememberFitRows(id, rows); setFitRows((prev) => (prev[id] === rows ? prev : { ...prev, [id]: rows })); }, []);`
- `const effectiveLayouts = useMemo(() => applyFitHeights(visibleLayouts, fitRows, { editing }), [visibleLayouts, fitRows, editing]);` and pass `layouts={effectiveLayouts}` to `Responsive`.
- `onLayoutChange={(current, all) => onLayoutChange(current, all, { editing })}`.
- In the `visiblePanels.map`, pass `fit={!!panel.fit}` and, for fit panels only, `onContentHeight={(px) => reportContentHeight(panel.id, px)}`. Per-panel callbacks may be memoised with a `useMemo` map keyed by id so the `DashboardPanel` effect does not re-run every render; builder's call, but the effect dependency on `onContentHeight` means an inline arrow would re-attach the observer each render, so do memoise.
- Replace the comment block above `renderPanelBody` or add one near `effectiveLayouts`: four lines on view mode fitting, edit mode pinning on `lg`, and why view-mode `onLayoutChange` is discarded by the hook.

- [ ] **Step 2: Update the Customize hint in `DashboardPage.jsx`**

Change the `<p>` shown while editing to:

```
Drag panels by their header to rearrange, drag the bottom-right corner to resize, or remove them with ✕. List panels fit their content; dragging their corner sets the maximum height. Changes save automatically.
```

- [ ] **Step 3: Run the whole web suite**

Run: `cd web && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/DashboardGrid.jsx web/src/pages/DashboardPage.jsx
git commit --only web/src/components/DashboardGrid.jsx web/src/pages/DashboardPage.jsx -m "feat(dashboard): fit list panels to content, ceiling set by resize in Customize"
```

---

### Task 7: Quiet Hours panel: uncarded when embedded, single-line states

**Files:**
- Modify: `web/src/components/QuietHoursPanel.jsx`
- Test: `web/src/components/QuietHoursPanel.test.jsx`

**Interfaces:**
- Consumes: `PanelEmptyLine` (Task 4).
- Produces: when `embedded`, the root is a plain `<div>` (no `bg-hc-panel`, `border`, `rounded-xl`, `p-*`, `h-full`, `flex`), because the grid wrapper now draws the card (registry dropped `bare` in Task 1). Non-embedded keeps today's card classes minus `h-full flex flex-col`.
  - Loading: `<PanelEmptyLine icon={<Moon size={14} className="text-hc-quiet-text" />} title="Quiet Hours" message="Checking quiet hours…" />`
  - Error / no data: same, message `No quiet hours data yet.`
  - Not configured (`data.enabled === false`): same, message exactly `Not set up. Configure in Settings.`; the non-embedded dismiss `<X>` button goes in `children`.
  - Empty: same, message `No unexpected activity (${startLocal} – ${endLocal})`; the `CheckCircle2` icon replaces `Moon` as the `icon`.
  - Populated: unchanged markup except the list wrapper loses `flex-1 min-h-0 overflow-auto` (keep `space-y-2`).

- [ ] **Step 1: Write the failing tests** (new `describe` in `QuietHoursPanel.test.jsx`; the file's `useQuietHours` mock returns a shared `quietHoursData` object, so mutate it per test or switch the mock to read from a `let current` variable)

```jsx
describe('QuietHoursPanel embedded states fit one row', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ user: null });
    useUserPreferences.mockReturnValue({ prefs: null, setPrefsBlob: vi.fn() });
  });

  it('embedded root draws no card chrome (the grid wrapper does)', () => {
    const { container } = renderWithClient(<QuietHoursPanel embedded />);
    // QueryClientProvider renders no DOM, so the panel root is container.firstChild.
    expect(container.querySelector('.bg-hc-panel')).toBeNull();
    expect(container.firstChild.className).not.toMatch(/h-full|border|rounded-xl|p-4/);
  });

  it('shows a single-line all-clear with the local range when nothing is flagged', () => {
    setQuietHoursData({ enabled: true, quietHoursStart: 23, quietHoursEnd: 6, events: [] });
    renderWithClient(<QuietHoursPanel embedded />);
    const msg = screen.getByText(/No unexpected activity \(/);
    expect(msg.className).toMatch(/truncate/);
    expect(screen.getByText('Quiet Hours')).toBeInTheDocument();
  });

  it('shows the short not-configured line', () => {
    setQuietHoursData({ enabled: false });
    renderWithClient(<QuietHoursPanel embedded />);
    expect(screen.getByText('Not set up. Configure in Settings.')).toBeInTheDocument();
    expect(screen.queryByTitle('Dismiss')).toBeNull();
  });

  it('populated list has no cell-filling wrapper', () => {
    setQuietHoursData(populatedFixture);
    const { container } = renderWithClient(<QuietHoursPanel embedded />);
    expect(container.querySelector('.flex-1.min-h-0')).toBeNull();
    expect(container.querySelector('.h-full')).toBeNull();
  });
});
```

Where `setQuietHoursData(obj)` reassigns the object the mocked `useQuietHours` returns, and `populatedFixture` is the existing `quietHoursData` with one event. Restore the populated fixture in a `beforeEach` at the top of the file so the existing M-9 tests are unaffected.

- [ ] **Step 2: Run to verify they fail**

Run: `cd web && npx vitest run src/components/QuietHoursPanel.test.jsx`
Expected: new tests FAIL; M-9 tests PASS.

- [ ] **Step 3: Implement** per the interface above. Delete the now-unused `header` constant if nothing references it.

- [ ] **Step 4: Run the tests**

Run: `cd web && npx vitest run src/components/QuietHoursPanel.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/QuietHoursPanel.jsx web/src/components/QuietHoursPanel.test.jsx
git commit --only web/src/components/QuietHoursPanel.jsx web/src/components/QuietHoursPanel.test.jsx -m "feat(dashboard): quiet hours panel collapses to one line when clear"
```

---

### Task 8: The other eight fit panels: single-line states, no cell-filling wrappers

**Files:**
- Modify: `web/src/components/AnomalyPanel.jsx`, `StaleDevicesPanel.jsx`, `AlertsSummaryPanel.jsx`, `TopMoversPanel.jsx`, `BatteryLevelsPanel.jsx`, `RecentEpisodesPanel.jsx`, `SensorEnvironmentPanel.jsx`, `RoomSparklinesPanel.jsx`
- Test: existing `AnomalyPanel.test.jsx`, `BatteryLevelsPanel.test.jsx` (must keep passing); add `StaleDevicesPanel.test.jsx`

**Interfaces:**
- Consumes: `PanelEmptyLine`.
- Produces: in each panel, every loading / error / empty return becomes `<PanelEmptyLine icon={…} title="<panel title>" message="<existing text>" />` with the message strings unchanged. `AnomalyPanel`'s error state uses `tone="danger"`. Icons: Anomaly `AlertTriangle` (warning token), Stale `Unplug` (stale token), Alerts `Bell`, Top Movers none, Battery `Battery`, Recent Episodes `Sparkles`, Sensor `Thermometer`, Room Trends none. The populated states keep their headers; remove `h-full flex flex-col min-h-0` from the populated root and `flex-1 min-h-0 overflow-auto` from the list wrapper in Battery, Recent Episodes and Sensor Environment.
- `StaleDevicesPanel` currently renders empty/loading states with no title at all; it now shows `Stale Devices` as the title in those states.

- [ ] **Step 1: Write the failing test** `StaleDevicesPanel.test.jsx`

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
let accessories = [];
vi.mock('../hooks/useEvents.js', () => ({ useAccessories: () => ({ data: accessories, isLoading: false }) }));
import StaleDevicesPanel from './StaleDevicesPanel.jsx';

describe('StaleDevicesPanel', () => {
  it('shows a titled single-line all-clear when nothing is stale', () => {
    accessories = [{ accessory_id: 'a', accessory_name: 'Lamp', health: { isStale: false } }];
    render(<StaleDevicesPanel />);
    expect(screen.getByText('Stale Devices')).toBeInTheDocument();
    expect(screen.getByText('No stale devices right now.').className).toMatch(/truncate/);
  });

  it('lists stale devices', () => {
    accessories = [{ accessory_id: 'b', accessory_name: 'Sensor', health: { isStale: true, missedHeartbeats: 3 } }];
    render(<StaleDevicesPanel />);
    expect(screen.getByText('Sensor')).toBeInTheDocument();
    expect(screen.getByText('3 missed heartbeats')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run src/components/StaleDevicesPanel.test.jsx`
Expected: first test FAILS (no title rendered in the empty state).

- [ ] **Step 3: Convert the eight panels** per the interface.

- [ ] **Step 4: Run the whole web suite**

Run: `cd web && npm test`
Expected: PASS, including the existing Anomaly and Battery tests (their asserted strings are unchanged).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/AnomalyPanel.jsx web/src/components/StaleDevicesPanel.jsx web/src/components/StaleDevicesPanel.test.jsx web/src/components/AlertsSummaryPanel.jsx web/src/components/TopMoversPanel.jsx web/src/components/BatteryLevelsPanel.jsx web/src/components/RecentEpisodesPanel.jsx web/src/components/SensorEnvironmentPanel.jsx web/src/components/RoomSparklinesPanel.jsx
git commit --only web/src/components/AnomalyPanel.jsx web/src/components/StaleDevicesPanel.jsx web/src/components/StaleDevicesPanel.test.jsx web/src/components/AlertsSummaryPanel.jsx web/src/components/TopMoversPanel.jsx web/src/components/BatteryLevelsPanel.jsx web/src/components/RecentEpisodesPanel.jsx web/src/components/SensorEnvironmentPanel.jsx web/src/components/RoomSparklinesPanel.jsx -m "feat(dashboard): single-line empty states and intrinsic heights for list panels"
```

---

### Task 9: Browser verification and graph update

**Files:** none modified (unless a fix is needed; then commit it with its own message).

- [ ] **Step 1: Build and start the web app against a listener**

Run `./scripts/dev-local.sh` from the repo root if Postgres is available locally, otherwise `cd web && npm run dev` with `VITE_API_BASE_URL` pointed at any reachable HomeChronicle API. Open the Dashboard at a desktop width (≥ 1024px).

- [ ] **Step 2: Check each of these, in both light and dark theme**

- Quiet Hours with nothing flagged is one grid row tall (64px box) with the icon, "Quiet Hours", a dot and the all-clear text on one line, no scrollbar, no clipped text.
- A fit panel with content (e.g. Stale Devices or Battery Levels with several rows) is taller than one row, has no internal scrollbar, and the panels below sit directly under it with the normal 16px gap.
- Click Customize: fit panels expand to 5 rows (or the stored ceiling). Drag Quiet Hours' corner down to 2 rows, click Done: it renders fitted, at most 2 rows, and scrolls inside if content exceeds that. Reload: the ceiling is still 2 (set it back to 5 afterwards with Customize or Reset).
- Switch to Timeline and back to Dashboard: no visible height jump on the empty panels.
- Narrow the window below 768px: single column, fit panels fitted; enter Customize on mobile width: fit panels stay fitted (no 5-row blank boxes).
- DevTools console shows no React warnings about maximum update depth or `ResizeObserver` loops.

- [ ] **Step 3: Update the knowledge graph**

Run: `graphify update .` from the repo root (AST-only, no API cost).

- [ ] **Step 4: Report** what passed and anything that did not, with a screenshot of the collapsed Quiet Hours row if the harness allows one.
