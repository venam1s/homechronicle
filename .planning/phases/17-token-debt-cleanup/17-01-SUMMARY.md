---
phase: 17-token-debt-cleanup
plan: "01"
subsystem: web-ui
tags: [card-migration, design-tokens, tailwind, accessibility-detail]
dependency_graph:
  requires: [Card.jsx, index.css @theme tokens]
  provides: [AccessoryDetail.jsx fully tokenized]
  affects: [web/src/components/AccessoryDetail.jsx]
tech_stack:
  added: []
  patterns: [Card compound component, semantic design token classes]
key_files:
  created: []
  modified:
    - web/src/components/AccessoryDetail.jsx
decisions:
  - "Icon+text titles passed as JSX span with flex items-center gap-2 to Card.Header title prop — preserves alignment without changing Card.Header API"
  - "hover:bg-gray-50/50 replaced with hover:bg-hc-panel-mid/50 — opacity modifier preserved"
  - "Conditional amber border on Reliability section passed via Card className prop"
  - "Stats grid items use Card.Body compact=true since original padding was flat p-4"
  - "Window selector buttons passed via Card.Header actions prop in Activity Over Time"
  - "Page indicator text passed via Card.Header actions prop in Full History"
metrics:
  duration_minutes: 12
  completed_date: "2026-04-16"
  tasks_completed: 1
  tasks_total: 1
  files_changed: 1
requirements: [THEME-02, LAYOUT-01]
---

# Phase 17 Plan 01: AccessoryDetail Card Migration and Token Sweep Summary

**One-liner:** Card compound component migration for all 15 AccessoryDetail section wrappers plus full semantic token replacement of ~81 hardcoded gray/white Tailwind classes.

## What Was Built

Migrated `web/src/components/AccessoryDetail.jsx` — the heaviest token-debt file in the codebase — to use the Card compound component and design tokens throughout.

### Card structural migration

All 15 section wrappers converted from `<div className="bg-white rounded-xl shadow-sm ...">` to Card compound component:

| Section | Card structure |
|---------|---------------|
| Loading state | `<Card><Card.Body>` |
| Error state | `<Card><Card.Body>` |
| Header (hero) | `<Card><Card.Body>` |
| Stats grid (3 items) | `<Card><Card.Body compact>` each |
| Device Info | `<Card><Card.Header><Card.Body>` |
| Firmware History | `<Card><Card.Header><Card.Body>` |
| Connection Reliability | `<Card className={...}><Card.Header><Card.Body>` |
| Anomaly Indicators | `<Card><Card.Header><Card.Body>` |
| Activity Over Time | `<Card><Card.Header actions={...}><Card.Body>` |
| State Duration Donut | `<Card><Card.Header><Card.Body>` |
| Activity Heatmap | `<Card><Card.Header><Card.Body>` |
| Characteristic Summary | `<Card><Card.Header><Card.Body>` |
| Current State | `<Card><Card.Header><Card.Body>` |
| Full History | `<Card><Card.Header actions={...}><Card.Body>` |

Sub-components `StateDurationDonut`, `ActivityHeatmap`, and `CharSummaryTable` also converted to return Card elements instead of bare `<section>` wrappers.

### Token sweep

All hardcoded gray/white Tailwind classes replaced with semantic tokens:

| Replaced | With |
|---------|------|
| `text-gray-300/400/500` | `text-hc-muted` |
| `text-gray-600/700` | `text-hc-fg` |
| `text-gray-800/900` | `text-hc-fg-strong` |
| `bg-white` | `bg-hc-panel` (via Card) |
| `bg-gray-50/100` | `bg-hc-panel-mid` |
| `border-gray-100/200` | `border-hc-panel-border` |
| `divide-gray-100` | `divide-hc-panel-border` |
| `hover:bg-gray-50` | `hover:bg-hc-panel-mid` |
| `hover:bg-gray-50/50` | `hover:bg-hc-panel-mid/50` |

## Verification Results

- `grep -c "import.*Card"`: **1** (pass)
- `grep -E "bg-white|text-gray-|bg-gray-|border-gray-|divide-gray-|hover:bg-gray-|hover:text-gray-" | wc -l`: **0** (pass)
- `grep -c "Card.Header"`: **10** (pass, >= 10 required)
- `grep -c "Card.Body"`: **32** (pass, >= 10 required)
- `grep "text-hc-fg-muted" | wc -l`: **0** (pass — wrong token name absent)
- Vitest: **87/87 tests pass**

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Card structural migration and token sweep | acddae5 | web/src/components/AccessoryDetail.jsx |

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

The advisor's pre-work guidance was incorporated:
- Icons in Card.Header titles wrapped in `<span className="flex items-center gap-2">` for proper alignment
- `hover:bg-gray-50/50` replaced with `hover:bg-hc-panel-mid/50` (preserving Tailwind opacity modifier)
- Conditional amber border on Reliability section moved to `Card className` prop

## Known Stubs

None. All Card migrations wire live data through unchanged data paths.

## Threat Flags

No new security surface introduced. Pure CSS class replacement with no authentication, input handling, API routes, or data flow changes.

## Self-Check: PASSED

- [x] `web/src/components/AccessoryDetail.jsx` modified and committed at acddae5
- [x] All acceptance criteria green
- [x] 87 web tests passing
- [x] SUMMARY.md created
