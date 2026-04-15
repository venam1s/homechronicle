# Phase 15: Chart Styling - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-15
**Phase:** 15-chart-styling
**Mode:** --auto (all decisions auto-selected)
**Areas discussed:** Gradient & Curve Style, Sparkline Implementation, Heatmap Styling, Recharts v3 Migration

---

## Gradient & Curve Style

| Option | Description | Selected |
|--------|-------------|----------|
| Consistent gradient fills on all charts | Apply SVG linearGradient to bar + area charts, matching TrendChart pattern | ✓ |
| Gradient on area charts only | Keep bar charts with solid/opacity fills | |
| Minimal changes | Only fix token usage, no visual changes | |

**User's choice:** [auto] Consistent gradient fills on all charts (recommended default)
**Notes:** TrendChart already has the gradient pattern. ActivityChart uses per-Cell opacity which should be replaced.

| Option | Description | Selected |
|--------|-------------|----------|
| Gradient fill with rounded bars | Replace Cell opacity with gradient, keep rounded tops | ✓ |
| Keep per-Cell opacity pattern | Preserve existing ActivityChart visual | |

**User's choice:** [auto] Gradient fill with rounded bars (recommended default)

---

## Sparkline Implementation

| Option | Description | Selected |
|--------|-------------|----------|
| Inline Recharts mini-chart | Tiny AreaChart inside KPI cards, no axes/tooltip | ✓ |
| SVG path sparkline | Hand-drawn SVG path, lighter weight | |
| Canvas sparkline | Custom canvas element | |

**User's choice:** [auto] Inline Recharts mini-chart (recommended default)
**Notes:** Reuses existing Recharts dependency. Minimal code for a tiny area chart.

| Option | Description | Selected |
|--------|-------------|----------|
| Events Today only | Only card with natural time-series data | ✓ |
| All KPI cards | Sparklines on every card | |
| Events Today + Online devices | Two cards with sparklines | |

**User's choice:** [auto] Events Today only (recommended default)
**Notes:** Device health counts are point-in-time without historical API. Sparklines would be misleading.

---

## Heatmap Styling

| Option | Description | Selected |
|--------|-------------|----------|
| Preserve grid styling, update tokens only | Heatmaps are fundamentally different from line/area charts | ✓ |
| Full gradient treatment | Apply gradients to heatmap cells | |

**User's choice:** [auto] Preserve grid styling, update tokens only (recommended default)
**Notes:** Cell-based visualization doesn't benefit from line/area gradient treatment.

---

## Recharts v3 Migration

| Option | Description | Selected |
|--------|-------------|----------|
| In-place upgrade with compatibility fixes | Bump version, fix breaking changes, verify react-is | ✓ |
| Gradual migration with wrapper | Add compatibility layer during transition | |
| Replace with different library | Switch to Nivo, Victory, or similar | |

**User's choice:** [auto] In-place upgrade with compatibility fixes (recommended default)
**Notes:** Roadmap decision already locked: staying on Recharts, upgrading v2→v3 in-place.

---

## Claude's Discretion

- Sparkline height/aspect ratio within KPI cards
- Sparkline gradient opacity (dense vs subtle)
- Chart transition animations (Recharts v3 props)
- AccessoryDetail PieChart gradient treatment
- Recharts v3 breaking change handling specifics

## Deferred Ideas

None — discussion stayed within phase scope.
