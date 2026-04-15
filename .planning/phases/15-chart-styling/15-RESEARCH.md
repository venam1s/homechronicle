# Phase 15: Chart Styling - Research

**Researched:** 2026-04-15
**Domain:** Recharts v2 → v3 upgrade, SVG gradient fills, sparklines, theme-aware chart colors
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Apply SVG linearGradient fills to all area and bar charts. TrendChart is the canonical pattern — extend to ActivityChart and AccessoryDetail.
- **D-02:** Replace ActivityChart's per-Cell opacity with a single gradient fill. Keep `radius={[3,3,0,0]}`.
- **D-03:** Use `type="monotone"` on all line/area charts.
- **D-04:** Tooltip continues to use `--hc-tooltip-bg`, `--hc-tooltip-border`, `--hc-tooltip-text` tokens.
- **D-05:** Sparkline: tiny `<AreaChart>` — no axes, tooltip, grid, or legend. Gradient fill matching card accent.
- **D-06:** Sparkline only on "Events Today" KPI card. Health count cards (online/offline/stale) stay text-only.
- **D-07:** Sparkline shows 7-day trend. Reuse `useDailyStats(7)` — no new API endpoint.
- **D-08:** Heatmaps preserve cell-based opacity approach — no area gradient treatment.
- **D-09:** Heatmap color scales use `--hc-accent-rgb`-based tokens. Update any remaining hardcoded colors.
- **D-10:** In-place upgrade: bump `recharts` from `^2.12.7` to latest v3 in `web/package.json`.
- **D-11:** Verify `react-is` peer dependency compatibility with React 19. Apply override if needed.
- **D-12:** No Recharts v2 references remain after this phase.
- **D-13:** TrendChart window selector hardcoded `bg-blue-100 text-blue-700` replaced with design tokens.

### Claude's Discretion

- Exact sparkline height and aspect ratio within KPI cards
- Sparkline gradient opacity (same as TrendChart 0.15→0 or denser fill for compact size)
- Whether to add subtle Recharts v3 animation on chart transitions
- Handling of any other Recharts v3 breaking changes discovered during migration
- Whether AccessoryDetail PieChart gets gradient treatment or stays flat

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CHART-01 | Charts use modern styling with gradient fills, smooth curves, and theme-aware colors | SVG `<linearGradient>` pattern verified in Context7 and TrendChart. `type="monotone"` for smooth curves. All colors via `--hc-accent-rgb` and chart tokens. |
| CHART-02 | KPI cards include sparkline/mini trend visualizations | `<AreaChart height={36}>` with no axes/tooltip/grid. Data from existing `useDailyStats(7)`. |
| CHART-03 | Existing chart types (activity, heatmap, state duration, event history) are preserved with updated styling | Recharts v3 preserves all used component APIs. Heatmap components use custom SVG cells — no Recharts API changes there. |
</phase_requirements>

---

## Summary

Phase 15 performs two parallel tasks: upgrade Recharts from v2 to v3, and apply consistent gradient/curve styling across all chart components. The two tasks overlap — the upgrade is required to complete the styling (one clean bump, no lingering v2 refs), but the styling work is largely independent of version-specific API changes.

**Recharts v3 (latest: 3.8.1)** is on npm and supports React 19 in its peer deps. The v2→v3 migration was designed to minimize breaking changes for standard usage. The most impactful internal change is a full rewrite of state management (now uses Redux + RTK internally), which adds transitive bundle weight but does not affect the component API surface used by this project. All chart component types this project uses — `AreaChart`, `BarChart`, `LineChart`, `PieChart`, `ResponsiveContainer`, `CartesianGrid`, `XAxis`, `YAxis`, `Tooltip`, `Area`, `Bar`, `Line`, `Cell` — are preserved in v3.

**Styling work** is well-scoped. TrendChart and AccessoryDetail's AreaChart already implement the canonical gradient pattern correctly. The remaining work is: (1) migrate ActivityChart from per-Cell opacity to a single gradient fill, (2) add sparkline to the "Events Today" KPI card, (3) fix hardcoded `bg-blue-100` window selector buttons in TrendChart, AccessoryDetail, WeekdayHeatmap, and RoomChart, and (4) ensure AccessoryDetail LineChart uses `type="monotone"` and accent stroke.

**Primary recommendation:** Bump package version first, run tests, fix any API breaks, then apply styling changes. Treat them as two sequential sub-tasks within a single plan wave to avoid chasing moving targets.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Chart rendering | Browser / Client | — | All Recharts components render client-side SVG; no SSR involved |
| Sparkline data | Browser / Client | API (reused) | `useDailyStats(7)` fetches from `/api/stats/daily` — existing endpoint, no new server work |
| Theme token resolution | Browser / Client | — | CSS custom properties resolved at paint time; tokens already exist from Phase 10 |
| Package upgrade | Build | — | `web/package.json` change; affects Vite bundle, no runtime service changes |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| recharts | 3.8.1 | Chart rendering | Locked in D-10/D-12; project standard [VERIFIED: npm registry] |
| react | 19.2.4 | UI framework | Project standard [VERIFIED: web/package.json] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| useAccentRgb | internal hook | Read `--hc-accent-rgb` as [r,g,b] array | All chart components needing accent color |
| useDailyStats | internal hook | Daily event count series | Sparkline and TrendChart data source |
| clsx | 2.1.1 | Conditional class composition | Window selector active/inactive classes |

### Version Verification

```
recharts@3.8.1  (published 2025-10-xx)  — confirmed latest stable [VERIFIED: npm registry]
react-is latest: 19.2.5                  — confirmed [VERIFIED: npm registry]
```

### Installation

```bash
# From web/ directory
npm install recharts@^3.8.1
```

**react-is peer dependency:**

Recharts v3 peer-requires `react-is ^16 || ^17 || ^18 || ^19`. The current lockfile has `react-is@18.3.1` (pulled in transitively via recharts v2). With React 19 already in the project, the overrides field is the correct mechanism — it forces the resolution without adding a package the project itself never imports:

```json
// web/package.json
"overrides": {
  "react-is": "^19.0.0"
}
```

[VERIFIED: Context7 confirms npm overrides pattern for recharts peer deps]

The pending STATE.md todo "Verify react-is override need" is resolved: an override is not strictly required (the peer range includes `^19`), but it prevents lockfile drift and is semantically correct. [ASSUMED — based on peer dep range analysis, not an actual install test]

---

## Architecture Patterns

### Sequencing Constraint

**Bump first, style second.** The Recharts v2→v3 bump adds Redux, RTK, Immer, and 4 other packages to `package-lock.json`. This is a large lockfile diff that's hard to review mixed with component changes. Plan structure:

1. Task: Bump `recharts@^3.8.1` + add `overrides.react-is` → run `npm install` → run `npm test` → commit
2. Task: Apply styling changes (gradient fills, window selector tokens, sparkline, Cell removal) → run `npm test` → commit

This isolation ensures: if tests fail after the bump, the cause is isolated to the version change; if they fail after styling, the cause is isolated to component changes.

### System Architecture Diagram

```
useDailyStats(7) ──────────────────────────────────────────────┐
                                                               ▼
KpiCards.jsx                                           EventsToday card
  └── <SparklineChart />                               ├── <AreaChart height=36>
        └── data: last 7 daily rows                    │     └── gradient fill (0.3→0)
                                                       │     └── no axes/grid/tooltip
                                                       └── count value + delta text

useHourlyStats() ──────────────────────────────────────────────┐
                                                               ▼
ActivityChart.jsx                                      <BarChart>
  └── utcHoursToLocal() transform                      └── <defs><linearGradient id="activityBarGradient">
                                                       └── <Bar fill="url(#activityBarGradient)">
                                                           (replaces per-Cell opacity)

useDailyStats(days) ───────────────────────────────────────────┐
                                                               ▼
TrendChart.jsx                                         <AreaChart>
  └── gradientId keyed on accent values                └── <defs><linearGradient> (existing)
  └── window selector (fix hardcoded blue)             └── type="monotone" (existing)

useCharacteristicTrend() ──────────────────────────────────────┐
                                                               ▼
AccessoryDetail.jsx/CharacteristicTrend                <LineChart>
  └── type: isNumeric ? 'monotone' : 'stepAfter'        └── stroke="rgb(var(--hc-accent-rgb))"
                                                           (update to monotone for numeric)

useAccessoryDetail() ──────────────────────────────────────────┐
                                                               ▼
AccessoryDetail.jsx/Activity Over Time                 <AreaChart>
  └── gradient already applied (stopOpacity 0.2→0.01)  └── Already correct, minor: fix window selector
  └── window selector hardcoded blue                    └── align gradient opacity to canonical 0.15→0
```

### Recommended File Change Inventory

```
web/
├── package.json                   # recharts bump to ^3.8.1 + overrides.react-is: ^19.0.0
├── src/components/
│   ├── ActivityChart.jsx          # Replace Cell-per-bar → single gradient fill; remove Cell import
│   ├── TrendChart.jsx             # Fix hardcoded window selector classes (D-13)
│   ├── WeekdayHeatmap.jsx         # Fix hardcoded window selector classes (discovered)
│   ├── RoomChart.jsx              # Fix hardcoded window selector classes (discovered)
│   ├── AccessoryDetail.jsx        # Fix window selector + align gradient opacity + LineChart stroke opacity (rgba 0.85 → rgb full)
│   └── KpiCards.jsx               # Add sparkline to Events Today card
```

### Pattern 1: SVG LinearGradient Fill (Area Charts)

Canonical pattern already in `TrendChart.jsx`. Replicate exactly for AccessoryDetail AreaChart alignment.

```jsx
// Source: TrendChart.jsx (existing), Context7 /recharts/recharts
const gradientId = useMemo(() => `trendGradient-${accent.join('-')}`, [accent]);
const accentStr = `rgb(${accent[0]},${accent[1]},${accent[2]})`;

<AreaChart ...>
  <defs>
    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
      <stop offset="5%"  stopColor={accentStr} stopOpacity={0.15} />
      <stop offset="95%" stopColor={accentStr} stopOpacity={0}    />
    </linearGradient>
  </defs>
  <Area
    type="monotone"
    dataKey="count"
    stroke={accentStr}
    strokeWidth={2}
    fill={`url(#${gradientId})`}
    dot={false}
    activeDot={{ r: 4, strokeWidth: 0 }}
  />
</AreaChart>
```

Note: `AccessoryDetail` has a static gradient ID `"accessoryActivityGradient"` — this is fine since the accent color is applied via CSS variable string `"rgb(var(--hc-accent-rgb))"` rather than the hook. No conflict. [VERIFIED: existing source]

### Pattern 2: Bar Chart Gradient (ActivityChart)

Replace the per-Cell opacity loop with a single gradient applied to the `<Bar>`. The gradient runs top-to-bottom (x1=0, y1=0, x2=0, y2=1) — this applies to each individual bar, not the chart area.

```jsx
// Source: UI-SPEC.md D-02
<BarChart ...>
  <defs>
    <linearGradient id="activityBarGradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="5%"  stopColor={accentStr} stopOpacity={0.85} />
      <stop offset="95%" stopColor={accentStr} stopOpacity={0.35} />
    </linearGradient>
  </defs>
  <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={20}
       fill="url(#activityBarGradient)" />
  {/* Remove all <Cell> children + remove Cell from recharts import */}
</BarChart>
```

**Caveat:** In SVG, a `linearGradient` without `gradientUnits="userSpaceOnUse"` defaults to `objectBoundingBox`, which means each bar gets its own top-to-bottom gradient. This is the intended behavior. [VERIFIED: SVG spec, confirmed working in Recharts examples]

### Pattern 3: Sparkline (KpiCards)

Minimal `<AreaChart>` with no interactive or decorative chrome. Use `isAnimationActive={false}` per UI-SPEC — sparkline is decorative inside a card that already animates in.

```jsx
// Source: UI-SPEC.md D-05/D-06/D-07
const sparkData = (daily ?? []).slice(-7).map((d, i) => ({ i, count: Number(d.count ?? 0) }));

<ResponsiveContainer width="100%" height={36}>
  <AreaChart data={sparkData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
    <defs>
      <linearGradient id="sparklineGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%"  stopColor={accentStr} stopOpacity={0.3} />
        <stop offset="95%" stopColor={accentStr} stopOpacity={0}   />
      </linearGradient>
    </defs>
    <Area
      type="monotone"
      dataKey="count"
      stroke={accentStr}
      strokeWidth={1.5}
      fill="url(#sparklineGradient)"
      dot={false}
      isAnimationActive={false}
    />
  </AreaChart>
</ResponsiveContainer>
```

**Data wiring:** `KpiCards` already calls `useDailyStats(dashboardDays)`. The component needs to also call `useDailyStats(7)` (or use existing call if `dashboardDays === 7`). Since the sparkline always shows 7-day trend regardless of `dashboardDays`, add a separate `useDailyStats(7)` call for sparkline data. TanStack Query will deduplicate if `dashboardDays` is already 7.

### Pattern 4: Window Selector Token Replacement

Applies to: TrendChart, AccessoryDetail, WeekdayHeatmap, RoomChart.

```jsx
// Replace:
days === d ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'

// With:
days === d ? 'bg-hc-accent-soft text-hc-accent-stronger font-medium' : 'text-hc-muted hover:text-hc-fg hover:bg-hc-panel-mid'
```

[VERIFIED: existing token definitions in web/src/index.css lines 20-22, 74-76]

### Anti-Patterns to Avoid

- **Per-Cell opacity pattern in BarChart:** Current ActivityChart uses `<Cell>` children with different `rgba()` opacity values per bar to simulate a gradient. This is not a gradient — it just discretizes the data by relative value. Replace with a real SVG `linearGradient` on `<Bar fill="url(...)">`.
- **Duplicate gradient IDs across component instances:** TrendChart correctly keys the gradient ID on accent values (`trendGradient-${accent.join('-')}`). If multiple TrendChart instances render simultaneously, their gradient IDs may collide if not keyed uniquely. The current approach handles this; don't simplify to a static ID.
- **CSS animation on chart container width:** Per Roadmap v1.2 locked decision, never add `transition: width` or animate `grid-template-columns` on the chart wrapper — causes ResizeObserver re-render churn on RPi/NAS.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Responsive chart containers | Custom ResizeObserver + state | `<ResponsiveContainer>` | Recharts handles this efficiently; custom impl causes ResizeObserver loops |
| Gradient color stops | CSS gradients on divs | SVG `<linearGradient>` inside `<defs>` | SVG gradients integrate with chart rendering pipeline; CSS gradients don't apply to SVG children |
| Tick label formatting | Custom SVG text elements | `tick={{ fontSize, fill }}` prop | Recharts positions ticks correctly relative to axis scale |
| Mini sparkline from scratch | Canvas drawing, custom SVG | `<AreaChart>` with stripped props | Recharts handles data binding, scale, and responsiveness |

**Key insight:** For Recharts specifically, the SVG `<defs>` pattern for gradients is the canonical approach — all other chart libraries use the same mechanism. The gradient ID must be unique per chart instance when multiple charts of the same type coexist on the page.

---

## Recharts v3 Breaking Changes — Relevant to This Project

[VERIFIED: https://github.com/recharts/recharts/wiki/3.0-migration-guide, fetched 2026-04-15]

### Changes That Apply

| Change | Impact | Action Required |
|--------|--------|-----------------|
| `accessibilityLayer` enabled by default | Adds ARIA roles and keyboard focus to chart SVG. May add small layout-affecting attributes. | Set `accessibilityLayer={false}` if it causes visual/layout issues in tests. Otherwise accept the default — it's an improvement. |
| `blendStroke` (Pie) removed | Not used in this project | None |
| `animateNewValues` (Area) removed | Not used in this project | None |
| Bundle now includes Redux/RTK/Immer | Adds ~30-40KB gzipped to vendor bundle | Document; accept as-is. Users on RPi benefit from Recharts' improved internal performance. |

### Changes That Do NOT Apply

| Change | Why Not Applicable |
|--------|-------------------|
| `CategoricalChartState` internal props removed | Project doesn't use `Customized` component or pass internal state through events |
| `CartesianGrid xAxisId/yAxisId` alignment | Only affects multi-axis charts. This project uses single X + single Y axis per chart. |
| `activeIndex` prop removed | Not used in any chart component |
| Multiple YAxis ordering by ID | Not used in this project |

### Bundle Size Impact

Recharts v3 introduced a full Redux/RTK internal state management rewrite. The following packages are now direct dependencies of recharts:

- `react-redux` (8.x or 9.x)
- `@reduxjs/toolkit` (1.x or 2.x)
- `immer`
- `reselect`
- `es-toolkit`

These are not tree-shakable out of the recharts bundle because Recharts uses them at runtime. Estimated bundle impact: +30-50KB gzipped in the vendor chunk. [ASSUMED — estimate based on known sizes of these packages; exact impact needs a build comparison]

For RPi/NAS self-hosted users this is a one-time parse cost, not ongoing. The improved rendering performance (faster re-renders, fewer spurious state updates) in v3 likely offsets this for interactive use.

---

## Hardcoded Color Inventory (Complete)

The UI-SPEC identified 5 chart-related hardcoded color instances. Research found an additional two in components outside the UI-SPEC scope:

| Component | File | Line | Hardcoded | Replacement | In Scope? |
|-----------|------|------|-----------|-------------|-----------|
| TrendChart window selector (active) | TrendChart.jsx:96 | 96 | `bg-blue-100 text-blue-700` | `bg-hc-accent-soft text-hc-accent-stronger` | Yes (D-13) |
| TrendChart window selector (inactive) | TrendChart.jsx:97 | 97 | `text-gray-400 hover:text-gray-600 hover:bg-gray-100` | `text-hc-muted hover:text-hc-fg hover:bg-hc-panel-mid` | Yes (D-13) |
| AccessoryDetail window selector (active) | AccessoryDetail.jsx:693 | 693 | `bg-blue-100 text-blue-700` | `bg-hc-accent-soft text-hc-accent-stronger` | Yes |
| AccessoryDetail window selector (inactive) | AccessoryDetail.jsx:694 | 694 | `text-gray-400 hover:text-gray-600 hover:bg-gray-100` | `text-hc-muted hover:text-hc-fg hover:bg-hc-panel-mid` | Yes |
| AccessoryDetail heatmap border | AccessoryDetail.jsx:798 | ~798 | `style={{ borderColor: 'rgba(139,92,246,0.3)' }}` | `style={{ borderColor: 'rgba(var(--hc-accent-rgb), 0.3)' }}` | Yes |
| WeekdayHeatmap window selector | WeekdayHeatmap.jsx:101-102 | 101 | `bg-blue-100 text-blue-700` / `text-gray-400 hover:...` | Same token replacement | Yes (discovered) |
| RoomChart window selector | RoomChart.jsx:75-76 | 75 | `bg-blue-100 text-blue-700` / `text-gray-400 hover:...` | Same token replacement | Yes (discovered) |
| AccessoryDetail donut DONUT_COLORS | AccessoryDetail.jsx:117-118 | 117 | 10 hardcoded hex colors | Preserve as-is — categorical distinction requires non-semantic colors | Intentionally excluded |

[VERIFIED: grep of web/src/components for bg-blue-100 and text-blue-700, 2026-04-15]

---

## What Is Already Correct (No Changes Needed)

Reviewing chart components identified areas that are already fully compliant with the Phase 15 target state:

| Component | Already Correct |
|-----------|-----------------|
| TrendChart gradient | `linearGradient` with `stopOpacity={0.15}→{0}`, `type="monotone"`, accent-keyed gradient ID |
| TrendChart tooltip | Uses `--hc-tooltip-*` CSS custom properties |
| AccessoryDetail AreaChart gradient | `linearGradient` with `stopOpacity={0.2}→{0.01}`, `rgb(var(--hc-accent-rgb))` stroke |
| AccessoryDetail LineChart `type` | Already uses `type={chartData.isNumeric ? 'monotone' : 'stepAfter'}` — this is correct; monotone for numeric data, stepAfter for boolean/discrete data |
| WeekdayHeatmap cell colors | `rgba(${accent[0]},${accent[1]},${accent[2]}, …)` — already uses accent hook |
| CartesianGrid | `stroke="var(--hc-chart-grid)"` — token-based throughout |
| Axis ticks | `fill: 'var(--hc-chart-tick)'` — token-based throughout |

---

## Common Pitfalls

### Pitfall 1: Gradient ID Collision

**What goes wrong:** If multiple instances of the same chart component render simultaneously (e.g., two TrendChart components in different tabs), and both define `<linearGradient id="trendGradient">`, the second one silently overrides the first in the SVG document scope. The first chart may render with the second chart's color or render flat.

**Why it happens:** SVG `id` attributes are document-scoped. Recharts renders all `<defs>` content into the same SVG document.

**How to avoid:** Key gradient IDs on accent values (TrendChart already does this: `trendGradient-${accent.join('-')}`). For the sparkline, a static ID `"sparklineGradient"` is fine since only one KPI sparkline exists at a time.

**Warning signs:** Chart area appears white/transparent; gradient shows wrong color.

### Pitfall 2: gradientUnits Confusion for BarChart

**What goes wrong:** Developer expects gradient to span the entire chart height (chart-level gradient), but `objectBoundingBox` (the SVG default, used by Recharts) applies the gradient to each bar's bounding box independently. Each bar gets its own top-to-bottom gradient.

**Why it happens:** SVG gradient `gradientUnits` default is `objectBoundingBox`.

**How to avoid:** This is actually the desired behavior for ActivityChart (each bar fades top-to-bottom). No action needed. If a chart-spanning gradient is ever needed, use `gradientUnits="userSpaceOnUse"` with explicit coordinate values.

**Warning signs:** Looks correct at max-value bars, looks odd at short bars (gradient still covers 5%→95% of each individual bar).

### Pitfall 3: Recharts v3 accessibilityLayer Layout Impact

**What goes wrong:** `accessibilityLayer` (enabled by default in v3) adds a transparent keyboard-focusable overlay to the chart SVG. In some layouts this overlay captures click/hover events unexpectedly, or adds a tiny focus ring that shifts layout.

**Why it happens:** v3 default behavior change from v2.

**How to avoid:** Run visual tests after upgrade. If layout or interaction breaks, add `accessibilityLayer={false}` to the top-level chart component.

**Warning signs:** Hover tooltips stop working; chart has unexpected blue focus ring.

### Pitfall 4: react-is Version Mismatch Warning

**What goes wrong:** npm install after bumping recharts to v3 may print a peer dependency warning about `react-is`. The build still succeeds but CI may fail if warnings are treated as errors.

**Why it happens:** Recharts v3 peer-requires `react-is ^16 || ^17 || ^18 || ^19`. The current lockfile has v18.3.1. This satisfies the peer range but is not the same major as the project's React 19.

**How to avoid:** Add `"react-is": "^19.0.0"` to devDependencies in `web/package.json` to lock it to v19 in the lockfile.

**Warning signs:** `npm install` output shows peer dependency conflict warnings.

### Pitfall 5: Sparkline Data Misalignment

**What goes wrong:** `useDailyStats(7)` returns up to 7 rows but may return fewer if there is no activity on some days. The sparkline renders with gaps or a shorter array than expected.

**Why it happens:** The API returns only days that have events, not all 7 days.

**How to avoid:** Follow the same pattern as TrendChart — backfill missing days with `count: 0` using `date-fns` and `subDays`. The `chartData` memo in TrendChart is the canonical example.

**Warning signs:** Sparkline shows fewer points than 7 days; x-axis looks compressed.

---

## Code Examples

### Verified: TrendChart Gradient (Canonical, v2 and v3 compatible)

```jsx
// Source: web/src/components/TrendChart.jsx (existing, verified 2026-04-15)
const gradientId = useMemo(() => `trendGradient-${accent.join('-')}`, [accent]);
const accentStr = `rgb(${accent[0]},${accent[1]},${accent[2]})`;

<AreaChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
  <defs>
    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
      <stop offset="5%"  stopColor={accentStr} stopOpacity={0.15} />
      <stop offset="95%" stopColor={accentStr} stopOpacity={0}    />
    </linearGradient>
  </defs>
  <Area type="monotone" dataKey="count" stroke={accentStr} strokeWidth={2}
        fill={`url(#${gradientId})`} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
</AreaChart>
```

### Verified: Recharts v3 npm Override for react-is (if needed)

```json
// Source: Context7 /recharts/recharts (recharts wiki How-to-install)
// web/package.json — add if react-is peer dep warnings occur
{
  "overrides": {
    "react-is": "^19.0.0"
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Recharts v2 per-Cell opacity for bar emphasis | Recharts v3 + single SVG linearGradient fill | Phase 15 | Simpler code, consistent with area charts |
| Recharts v2 internal CategoricalChartState exposed to consumers | Recharts v3 internal Redux state, hooks API for external access | Recharts 3.0 | No impact for this project — internal props not used |
| No sparklines on KPI cards | 36px AreaChart sparkline on Events Today card | Phase 15 | Visual trend context without new API endpoint |

**Deprecated/outdated:**
- Per-Cell opacity pattern in BarChart: replaced by single gradient fill
- Hardcoded `bg-blue-100 text-blue-700` window selectors: replaced by design tokens from Phase 10

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | react-is override is not strictly required for React 19 (peer dep range includes `^19`) | Standard Stack | Minor — npm install may show warnings or fail without override; easily fixed by adding explicit devDep |
| A2 | Recharts v3 bundle adds ~30-50KB gzipped from Redux/RTK/Immer | Breaking Changes | Low — actual size may vary; does not affect planning decisions |
| A3 | AccessoryDetail LineChart `type="stepAfter"` for boolean/discrete data is correct and should not be changed to `type="monotone"` | What Is Already Correct | Medium — if D-03 is interpreted as "all lines must be monotone," the planner should preserve the existing conditional |

---

## Open Questions (RESOLVED)

1. **AccessoryDetail AreaChart gradient opacity alignment**
   - RESOLVED: Align to canonical 0.15→0 per TrendChart pattern (implemented in Plan 02, Task 2 D2)

2. **AccessoryDetail LineChart stroke opacity**
   - RESOLVED: Use full opacity `rgb(var(--hc-accent-rgb))` per UI-SPEC contract (implemented in Plan 02, Task 2 D4)

---

## Environment Availability

Step 2.6: No external dependencies beyond npm. The upgrade is a package.json change plus `npm install`. Node.js and npm are confirmed available.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| npm | Package upgrade | Yes | project standard | — |
| recharts@3.8.1 | Chart rendering | Yes (on npm) | 3.8.1 | — |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.x |
| Config file | `web/vite.config.js` |
| Quick run command | `npm test -- --reporter=verbose` (from `web/`) |
| Full suite command | `npm test` (from `web/`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHART-01 | ActivityChart renders gradient fill (no Cell children) | unit | `npm test -- --reporter=verbose ActivityChart` | No — Wave 0 gap |
| CHART-02 | KpiCards "Events Today" card renders sparkline AreaChart | unit | `npm test -- --reporter=verbose KpiCards` | Yes (KpiCards.test.jsx) — needs new test |
| CHART-03 | TrendChart renders without errors after v3 upgrade | unit | `npm test -- --reporter=verbose TrendChart` | No — Wave 0 gap |
| CHART-03 | AccessoryDetail chart section renders without errors | unit/smoke | `npm test` (via App.smoke.test.jsx if accessible) | Partial |

**Note on visual-only styling changes:** Gradient fill, smooth curves, and color token substitutions are visual changes that Vitest/jsdom cannot assert directly (jsdom renders SVG as empty elements). Tests for CHART-01 and CHART-03 should verify: (1) component renders without throwing, (2) expected Recharts component types are present in the output (via `container.querySelector`), and (3) no `<Cell>` children remain in ActivityChart's Bar after the refactor.

### Sampling Rate

- **Per task commit:** `npm test` from `web/` — all 10 existing test files, ~5s
- **Per wave merge:** `npm test` full suite
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `web/src/components/ActivityChart.test.jsx` — covers CHART-01 (renders without error, no Cell children after gradient refactor)
- [ ] `web/src/components/TrendChart.test.jsx` — covers CHART-03 (renders without error after v3 upgrade)
- [ ] Add to `KpiCards.test.jsx` — sparkline renders inside Events Today card (CHART-02)

---

## Security Domain

This phase contains no authentication, authorization, user input, cryptography, or session management. It is chart styling and a package upgrade.

Security enforcement: N/A for this phase. No ASVS categories apply.

---

## Sources

### Primary (HIGH confidence)
- `/recharts/recharts` (Context7) — gradient AreaChart pattern, BarChart usage, migration guide snippets
- `npm view recharts@3.8.1` — version 3.8.1 confirmed as latest stable, peer deps verified
- `web/src/components/TrendChart.jsx` — canonical existing gradient pattern
- `web/src/components/ActivityChart.jsx` — per-Cell pattern to be replaced
- `web/src/components/KpiCards.jsx` — sparkline integration target
- `web/src/index.css` — all `--hc-chart-*`, `--hc-tooltip-*`, `--hc-accent-*` tokens verified present

### Secondary (MEDIUM confidence)
- https://github.com/recharts/recharts/wiki/3.0-migration-guide — breaking changes list (fetched 2026-04-15)
- `web/src/components/WeekdayHeatmap.jsx`, `RoomChart.jsx`, `AccessoryDetail.jsx` — hardcoded color inventory

### Tertiary (LOW confidence)
- Bundle size estimate for Redux/RTK/Immer addition (~30-50KB gzipped) — [ASSUMED] based on known package sizes, not measured

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — npm registry confirmed, peer deps verified
- Architecture: HIGH — based on reading all affected source files
- Pitfalls: HIGH — gradient ID collision and gradientUnits are well-documented SVG behaviors
- v3 migration impact: MEDIUM — wiki reviewed, but only runtime install will confirm `accessibilityLayer` behavior

**Research date:** 2026-04-15
**Valid until:** 2026-06-15 (Recharts minor releases won't break this; major releases unlikely in 60 days)
