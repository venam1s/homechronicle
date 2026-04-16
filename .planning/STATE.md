---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: milestone
status: executing
stopped_at: Phase 17 context gathered
last_updated: "2026-04-16T03:38:34.724Z"
last_activity: 2026-04-16
progress:
  total_phases: 8
  completed_phases: 8
  total_plans: 25
  completed_plans: 25
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-14)

**Core value:** A reliable, maintainable codebase that self-hosted users can trust to run unattended for months without performance degradation or silent failures.
**Current focus:** Phase 17 — token-debt-cleanup

## Current Position

Phase: 17
Plan: Not started
Status: Executing Phase 17
Last activity: 2026-04-16

```
Progress: [███████░░░] 67% (4/6 phases)
```

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

- [Phase 08-01]: getRepairTargets uses session.pairingName fallback chain (pairing?.name ?? pairingName ?? deviceId)
- [Phase 08-01]: running flag kept true during saveSettings in nested finally to prevent concurrent cycle start
- [Phase 08-02]: onSettingsChange always calls stop() before conditional start() to handle hour changes as well as enable/disable
- [Phase 09-scheduled-repair-ui]: repairConfig query uses 60s refetchInterval to auto-refresh last-run status
- [Phase 09-scheduled-repair-ui]: Direct saveRepairMutation.mutate() on toggle/hour change — no debounce needed for repair config
- [Roadmap v1.2]: Design tokens phase comes first — 339 hardcoded dark: classes must be replaced before any new component is written
- [Roadmap v1.2]: Sidebar collapse uses CSS transform/grid-template-columns toggle, never transition: width — prevents chart ResizeObserver re-renders on RPi
- [Roadmap v1.2]: --hc-accent-rgb preserved as alias in new token layer — 5 chart components using useAccentRgb() depend on it
- [Roadmap v1.2]: Phase 15 (Chart Styling) depends only on Phase 10, not Phase 14 — can parallelize with 13-14 if needed
- [Roadmap v1.2]: Staying on Recharts, upgrading v2 → v3 in-place (not replacing with another library)
- [Phase 12]: Split Alerts.jsx into 3 Card sections (form, rules list, deliveries) for better visual hierarchy
- [Phase 12]: Wrapped 4 SettingsTab sections in Cards (About, Scheduled Repair, Data Management, Toast Notifications) keeping Advanced/Danger Zone with existing headings
- [Phase 15]: ActivityChart uses static gradient ID; AccessoryDetail aligned to TrendChart canonical 0.15/0 opacity
- [Phase 15]: Static sparklineGradient ID safe since only one sparkline renders per page

### Pending Todos

- Grep audit of 339 dark: class instances before Phase 10 planning — some may be intentional badge/status colors
- Validate exact shadcn sidebar source files to copy (Vite-specific, no Next.js cookies()) before Phase 11 planning
- Trace isMobileViewport / isStandalonePwa PWA detection logic in App.jsx before Phase 13 planning
- Confirm --hc-accent-rgb usage count before Phase 10 (research cites ~50 locations)
- Verify react-is override need for Recharts v3 peer dep before Phase 15

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260403-2fx | Firmware version tracking — log and surface firmware version changes | 2026-04-03 | bd176bd | [260403-2fx-firmware-version-tracking-log-and-surfac](./quick/260403-2fx-firmware-version-tracking-log-and-surfac/) |
| 260406-lo7 | Reorganize Settings tab - full layout rethink with improved visual hierarchy, section merging, and reordering | 2026-04-06 | 73fc185 | [260406-lo7-reorganize-settings-tab-full-layout-reth](./quick/260406-lo7-reorganize-settings-tab-full-layout-reth/) |
| 260406-nm4 | Make top banner sticky with scroll-collapse to a thinner version | 2026-04-06 | 8d28cb2 | [260406-nm4-make-top-banner-sticky-with-scroll-colla](./quick/260406-nm4-make-top-banner-sticky-with-scroll-colla/) |
| 260407-c76 | Add GitLab issues link and documentation link to the Settings tab in the web UI | 2026-04-07 | aedd6c0 | [260407-c76-add-gitlab-issues-link-and-documentation](./quick/260407-c76-add-gitlab-issues-link-and-documentation/) |
| 260407-e5i | Make dashboard stale devices and outlier rows clickable with navigation | 2026-04-07 | 2e975aa | [260407-e5i-make-dashboard-stale-devices-and-outlier](./quick/260407-e5i-make-dashboard-stale-devices-and-outlier/) |
| 260407-en9 | Fix State Duration chart for high-cardinality characteristics - aggregate into Other bucket | 2026-04-07 | bc5ab5b | [260407-en9-fix-state-duration-chart-for-high-cardin](./quick/260407-en9-fix-state-duration-chart-for-high-cardin/) |
| 260407-p92 | Show all bridge child accessories in Accessories tab via on-demand metadata cache refresh | 2026-04-07 | 8f34a19 | [260407-p92-show-all-bridge-child-accessories-in-acc](./quick/260407-p92-show-all-bridge-child-accessories-in-acc/) |
| 260407-qzp | Fix scene group blue color to use theme accent variable | 2026-04-07 | de001d8 | [260407-qzp-fix-scene-group-blue-color-to-use-theme-](./quick/260407-qzp-fix-scene-group-blue-color-to-use-theme-/) |
| 260411-uqw | Split multi-service HomeKit accessories into separate rows in GET /accessories | 2026-04-12 | 359088b | [260411-uqw-split-multi-service-homekit-accessories-](./quick/260411-uqw-split-multi-service-homekit-accessories-/) |
| 260412-gx7 | Update README.md alerts documentation for web UI | 2026-04-12 | b5fcb14 | [260412-gx7-update-readme-md-alerts-documentation-fo](./quick/260412-gx7-update-readme-md-alerts-documentation-fo/) |

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-04-16T02:56:13.668Z
Stopped at: Phase 17 context gathered
Resume file: .planning/phases/17-token-debt-cleanup/17-CONTEXT.md
