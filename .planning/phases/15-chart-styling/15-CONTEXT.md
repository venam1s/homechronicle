# Phase 15: Chart Styling - Context

**Gathered:** 2026-04-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Upgrade Recharts v2 to v3 and modernize all chart visuals with gradient fills, smooth curves, and sparklines on KPI cards. All existing chart types (activity bar chart, daily trend area chart, accessory detail charts, heatmaps) are preserved with updated styling. All chart colors continue to use the design token system from Phase 10.

</domain>

<decisions>
## Implementation Decisions

### Gradient & Curve Style
- **D-01:** Apply consistent SVG linearGradient fills to all area and bar charts. TrendChart already has gradient fills — extend the same pattern to ActivityChart and AccessoryDetail charts.
- **D-02:** Replace ActivityChart's per-Cell opacity pattern with a single gradient fill matching TrendChart's approach. Keep rounded bar tops (`radius={[3,3,0,0]}`).
- **D-03:** Use `type="monotone"` for smooth curves on all line/area charts (TrendChart already uses this).
- **D-04:** Tooltip styling continues to use existing CSS custom properties (`--hc-tooltip-bg`, `--hc-tooltip-border`, `--hc-tooltip-text`).

### Sparkline Implementation
- **D-05:** Add sparkline mini-charts to KPI cards using tiny `<AreaChart>` components — no axes, no tooltip, no grid, no legend. Gradient fill matching the card's accent color.
- **D-06:** Only the "Events Today" KPI card gets a sparkline — it has natural daily time-series data from `useDailyStats`. Device health counts (online/offline/stale) are point-in-time metrics without historical API support, making sparklines misleading for those cards.
- **D-07:** Sparkline shows 7-day trend data (last 7 daily counts). Reuse existing `useDailyStats(7)` hook — no new API endpoint needed.

### Heatmap Styling
- **D-08:** Preserve heatmap grid/cell-based styling — heatmaps are a fundamentally different visualization that doesn't benefit from line/area gradient treatment.
- **D-09:** Ensure all heatmap color scales use design tokens (`--hc-accent-rgb` based) for theme consistency. Update any remaining hardcoded colors.

### Recharts v3 Migration
- **D-10:** In-place upgrade: bump `recharts` from `^2.12.7` to latest v3 in package.json. Fix any breaking API changes across all chart components.
- **D-11:** Verify `react-is` peer dependency compatibility with React 19. Apply override in package.json if needed (pending todo from STATE.md).
- **D-12:** No Recharts v2 references should remain in package.json after this phase — clean upgrade in one phase.

### TrendChart Window Selector Fix
- **D-13:** The TrendChart window selector buttons still use hardcoded `bg-blue-100 text-blue-700` and `text-gray-400 hover:text-gray-600 hover:bg-gray-100` instead of design tokens. Fix during this phase as part of chart styling cleanup.

### Claude's Discretion
- Exact sparkline height and aspect ratio within KPI cards
- Whether sparkline area uses the same gradient opacity as TrendChart (0.15→0) or a denser fill for small size
- Whether to add subtle animation on chart transitions (Recharts v3 animation props)
- Handling of any other Recharts v3 breaking changes discovered during migration
- Whether AccessoryDetail's PieChart gets gradient treatment or stays flat (flat may be more readable for small pie charts)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Chart Components (all must be updated)
- `web/src/components/ActivityChart.jsx` — Bar chart, Events by Hour (96 lines, uses useAccentRgb, Cell-based coloring)
- `web/src/components/TrendChart.jsx` — Area chart, Daily Activity (142 lines, already has gradient fill + monotone curves)
- `web/src/components/AccessoryDetail.jsx` — Multiple charts: AreaChart, LineChart, PieChart for accessory analytics
- `web/src/components/WeekdayHeatmap.jsx` — Weekday heatmap grid
- `web/src/components/MonthlyHeatmap.jsx` — Monthly heatmap grid
- `web/src/components/HeatmapLane.jsx` — Individual heatmap lane
- `web/src/components/HeatmapGrid.jsx` — Heatmap grid container

### KPI Cards (sparkline target)
- `web/src/components/KpiCards.jsx` — Device health KPI cards with trend deltas (Phase 14 output)
- `web/src/hooks/useEvents.js` — `useDailyStats()` hook for sparkline data source

### Design Token System (Phase 10 output)
- `web/src/index.css` — CSS custom properties: `--hc-accent-rgb`, `--hc-chart-grid`, `--hc-chart-tick`, tooltip tokens
- `web/src/hooks/useAccentRgb.js` — Accent color hook used by all chart components

### Package Config
- `web/package.json` — Current recharts `^2.12.7`, react `^19.2.4`
- `web/package-lock.json` — Current react-is resolution (v18.3.1 via recharts)

### Requirements
- `.planning/REQUIREMENTS.md` — CHART-01, CHART-02, CHART-03 (Phase 15 requirements)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TrendChart.jsx` gradient pattern (SVG `<linearGradient>` + `<Area fill={url(#id)}>`) — canonical pattern to replicate across charts
- `useAccentRgb()` hook — already used by all 3 chart components for theme-aware colors
- `SkeletonChart` loading component — used by ActivityChart and TrendChart
- `TOOLTIP_STYLE` object pattern — shared tooltip styling using CSS custom properties
- `Card` compound component — KPI cards already wrapped in Card from Phase 14

### Established Patterns
- Charts use `ResponsiveContainer` wrapper with `width="100%" height={N}`
- Grid uses `CartesianGrid strokeDasharray="3 3" stroke="var(--hc-chart-grid)" vertical={false}`
- Axes use `tick={{ fontSize: 10, fill: 'var(--hc-chart-tick)' }} tickLine={false} axisLine={false}`
- Accent colors constructed via template literal: `` `rgb(${accent[0]},${accent[1]},${accent[2]})` ``

### Integration Points
- `DashboardPage.jsx` — renders TrendChart, ActivityChart, KPI cards; sparkline will be embedded in KpiCards
- `AccessoryDetail.jsx` — self-contained chart section within accessory detail view
- `web/package.json` — Recharts version bump + potential react-is override

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The roadmap success criteria define the target: gradient fills, smooth curves, sparklines, theme-aware colors, no Recharts v2 references remaining.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 15-chart-styling*
*Context gathered: 2026-04-15*
