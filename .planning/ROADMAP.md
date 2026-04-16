# Roadmap: HomeChronicle — v1.2 UI Redesign

## Overview

Six sequential phases deliver the v1.2 UI overhaul. The ordering is dictated by component dependencies: design tokens must exist before any new component is written, the sidebar shell must exist before pages are extracted from it, pages must exist before new widgets slot into them, and chart styling is cosmetic with no layout dependencies so it comes last.

v1.1 (Scheduled Repair) ended at Phase 9. v1.2 continues from Phase 10.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 10: Design Token Foundation** - Replace all hardcoded Tailwind color classes with semantic CSS custom property tokens; establish light/dark/accent system (completed 2026-04-14)
- [x] **Phase 11: Sidebar Navigation Shell** - Replace top tab bar with collapsible vertical sidebar; App.jsx becomes thin shell (completed 2026-04-14)
- [x] **Phase 12: Page Extraction & Card Layout** - Extract tab content into page components; apply modern card-based layout (completed 2026-04-15)
- [x] **Phase 13: Responsive Sidebar** - Auto-collapse at mobile breakpoints; sheet drawer overlay on mobile (completed 2026-04-15)
- [x] **Phase 14: Dashboard Widgets** - KPI health cards, live activity feed, room-by-room breakdown (completed 2026-04-15)
- [x] **Phase 15: Chart Styling** - Recharts v3 upgrade with gradient fills, smooth curves, sparklines (completed 2026-04-15)
- [ ] **Phase 16: Verification Sweep & Requirements Update** - Create VERIFICATION.md for phases 11, 12, 15; update REQUIREMENTS.md checkboxes; fix ROADMAP inconsistencies
- [ ] **Phase 17: Token Debt Cleanup** - Migrate AccessoryDetail.jsx to tokens/Card, fix chart text-gray-400, tokenize FAB buttons and shell div

## Phase Details

### Phase 10: Design Token Foundation
**Goal**: Every component uses semantic design tokens — the CSS property system is the single source of truth for all colors in light and dark modes
**Depends on**: Phase 9 (v1.1 complete)
**Requirements**: THEME-01, THEME-02, THEME-03, THEME-04, THEME-05
**Success Criteria** (what must be TRUE):
  1. User can toggle between light and dark mode from any accessible control and the entire UI switches without any components showing wrong background or text colors
  2. User can choose from 3-5 accent color presets and every themed element (buttons, highlights, active states) updates to reflect the chosen accent
  3. User's chosen mode and accent color are still applied after closing and reopening the browser tab
  4. Existing chart gradient fills (using --hc-accent-rgb) render correctly in both light and dark modes after the skin system is removed
  5. A grep for hardcoded `dark:bg-gray-` and `dark:text-gray-` classes returns zero results across all web source files
**Plans:** 4/4 plans complete
Plans:
- [x] 10-01-PLAN.md — Token layer: @theme registration, status/interactive tokens, CSS shim extension
- [x] 10-02-PLAN.md — Accent rename: useSkin->useAccent hook, data-skin->data-accent CSS/JS/HTML, localStorage migration
- [x] 10-03-PLAN.md — Direct refactor: SettingsTab, AddDevicesTab, MyDevicesTab, AccessoryDetail (269 dark: classes)
- [x] 10-04-PLAN.md — Final cleanup: remaining 20 files (89 dark: classes) + visual verification checkpoint
**UI hint**: yes

### Phase 11: Sidebar Navigation Shell
**Goal**: Users navigate the app via a collapsible vertical sidebar that replaces the top tab bar, and App.jsx is a thin orchestration shell
**Depends on**: Phase 10
**Requirements**: NAV-01, NAV-02, NAV-03, NAV-05, LAYOUT-02
**Success Criteria** (what must be TRUE):
  1. User sees a vertical sidebar with named navigation sections (Dashboard, Devices, Timeline, Alerts, Settings) instead of the horizontal top tab bar
  2. User can click a collapse control and the sidebar shrinks to icon-only width; clicking again restores full labels
  3. The sidebar's expanded/collapsed state is preserved after a page refresh
  4. The currently active page has a distinct visual highlight in the sidebar that is unambiguous from the other items
  5. App.jsx renders in under 100 lines — all tab content remains behind the same pages but the file is now a layout shell
**Plans:** 3/3 plans complete
Plans:
- [x] 11-01-PLAN.md — Sidebar component with nav, theme controls, edge handle collapse, and BrandLogo collapsed variant
- [x] 11-02-PLAN.md — Extract 5 page components (DashboardPage, TimelinePage, DevicesPage, AlertsPage, SettingsPage)
- [x] 11-03-PLAN.md — Rewrite App.jsx as thin grid shell, wire sidebar + pages, rewrite smoke test
**UI hint**: yes

### Phase 12: Page Extraction & Card Layout
**Goal**: All existing functionality is accessible through extracted page components, and every content area uses a modern card-based layout
**Depends on**: Phase 11
**Requirements**: LAYOUT-01, LAYOUT-03
**Success Criteria** (what must be TRUE):
  1. All four original content areas (Dashboard, Timeline, Accessories, Manage/Settings) are reachable and fully functional through the sidebar navigation
  2. Every content panel uses card surfaces with soft shadows and consistent spacing — there are no raw colored div blocks or flat ungrouped lists
  3. All existing features (event filter, accessory detail, alerts management, settings) work identically to v1.1 with no regressions
**Plans:** 3/3 plans complete
Plans:
- [x] 12-01-PLAN.md — Card compound component (Card/Card.Header/Card.Body) and typography token system
- [x] 12-02-PLAN.md — Card wrapping and page headers for Dashboard, Devices, and Alerts pages
- [x] 12-03-PLAN.md — Card wrapping and page headers for Timeline and Settings pages + visual verification
**UI hint**: yes

### Phase 13: Responsive Sidebar
**Goal**: The sidebar behaves correctly at every viewport width — icon-only on tablet, sheet drawer on mobile
**Depends on**: Phase 11
**Requirements**: NAV-04, RESP-01, RESP-02
**Success Criteria** (what must be TRUE):
  1. On a viewport narrower than 768px, the sidebar disappears and a hamburger/menu control opens a slide-out sheet drawer that overlays content (does not push it)
  2. On a viewport between 768px and 1024px, the sidebar auto-collapses to icon-only without user action
  3. Dashboard widgets reflow to a single-column stack on mobile viewports
  4. Resizing the browser window from desktop to mobile and back does not leave the sidebar in an inconsistent state
**Plans:** 3/3 plans complete
Plans:
- [x] 13-01-PLAN.md — useMediaQuery hook + dead CSS removal + drawer CSS rules
- [x] 13-02-PLAN.md — Sidebar inDrawer prop + StatsCards/ActivityChart responsive reflow
- [x] 13-03-PLAN.md — App.jsx integration (drawer, top bar, breakpoint logic) + visual verification
**UI hint**: yes

### Phase 14: Dashboard Widgets
**Goal**: The dashboard surfaces actionable device health information through KPI cards, a live activity feed, and a room-by-room breakdown
**Depends on**: Phase 12
**Requirements**: WIDGET-01, WIDGET-02, WIDGET-03, WIDGET-04, WIDGET-05
**Success Criteria** (what must be TRUE):
  1. User sees KPI cards on the dashboard showing online, offline, and stale device counts at a glance
  2. Each KPI card shows a trend delta (e.g., "+2 from yesterday") so the user knows if their device health is improving or worsening
  3. User sees a live activity feed widget displaying the most recent events; the feed updates as new events arrive
  4. When the user scrolls up to read older feed entries, the feed stops auto-scrolling until the user scrolls back to the bottom
  5. User sees a room-by-room grid of cards each showing the device count and health status badge for that room
**Plans:** 3/3 plans complete
Plans:
- [x] 14-01-PLAN.md — KpiCards component + useEvents limit parameter extension
- [x] 14-02-PLAN.md — ActivityFeed with scroll-lock + RoomBreakdown with health badges
- [x] 14-03-PLAN.md — DashboardPage integration, StatsCards deletion, visual verification
**UI hint**: yes

### Phase 15: Chart Styling
**Goal**: All charts use Recharts v3 with gradient fills, smooth curves, and theme-aware colors; existing chart types are preserved
**Depends on**: Phase 10
**Requirements**: CHART-01, CHART-02, CHART-03
**Success Criteria** (what must be TRUE):
  1. Charts (activity, heatmap, state duration, event history) visually use gradient fills and smooth curves instead of flat stepped lines
  2. KPI cards include a sparkline mini-chart that visualizes the trend data supporting the delta indicator
  3. All chart colors update correctly when the user switches between light mode, dark mode, or accent color presets
  4. No Recharts v2 reference remains in package.json — the upgrade is complete in one phase
**Plans:** 3/3 plans complete
Plans:
- [x] 15-01-PLAN.md — Recharts v3 upgrade + test scaffolds
- [x] 15-02-PLAN.md — Chart gradient refactor + window selector token cleanup
- [x] 15-03-PLAN.md — KpiCards sparkline for Events Today card
**UI hint**: yes

### Phase 16: Verification Sweep & Requirements Update
**Goal**: All executed phases have VERIFICATION.md files and REQUIREMENTS.md accurately reflects the verified state of every v1.2 requirement
**Depends on**: Phase 15
**Requirements**: NAV-01, NAV-02, NAV-03, NAV-05, LAYOUT-02, LAYOUT-03, CHART-02
**Gap Closure:** Closes 7 unsatisfied requirements from v1.2 milestone audit (process/documentation gaps, not code gaps)
**Success Criteria** (what must be TRUE):
  1. Phase 11 has a VERIFICATION.md that confirms NAV-01, NAV-02, NAV-03, NAV-05, and LAYOUT-02 are satisfied
  2. Phase 12 has a VERIFICATION.md that confirms LAYOUT-03 is satisfied
  3. Phase 15 has a VERIFICATION.md that confirms CHART-02 is satisfied
  4. Every verified v1.2 requirement has `[x]` in REQUIREMENTS.md (currently 8 are unchecked despite being verified)
  5. ROADMAP progress table is consistent (Phase 15 shows 3/3 Complete)
**Plans:** 2 plans
Plans:
- [ ] 16-01-PLAN.md — Create VERIFICATION.md for phases 11, 12, 15
- [ ] 16-02-PLAN.md — REQUIREMENTS.md sweep and ROADMAP.md audit
**UI hint**: no

### Phase 17: Token Debt Cleanup
**Goal**: All remaining hardcoded color classes and non-tokenized panel wrappers are replaced with semantic design tokens or Card components
**Depends on**: Phase 16
**Requirements**: THEME-02, LAYOUT-01, CHART-03
**Gap Closure:** Closes 3 partial integration items and 5 tech debt items from v1.2 milestone audit
**Success Criteria** (what must be TRUE):
  1. AccessoryDetail.jsx uses Card compound component or semantic token classes instead of 15 hardcoded `bg-white rounded-xl shadow-sm` wrappers
  2. ActivityChart and TrendChart empty/error states use semantic tokens instead of `text-gray-400`
  3. App.jsx FAB buttons use semantic tokens instead of `isDarkTheme` JS ternaries with hardcoded gray-600/gray-800
  4. Root shell div uses semantic token instead of `bg-gray-50`
**Plans:** 0/0
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 10 -> 11 -> 12 -> 13 -> 14 -> 15 -> 16 -> 17
Note: Phase 15 depends only on Phase 10 (not 14), so it can run in parallel with 13-14 if needed.
Phases 16-17 are gap closure phases from the v1.2 milestone audit.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 10. Design Token Foundation | 4/4 | Complete    | 2026-04-14 |
| 11. Sidebar Navigation Shell | 3/3 | Complete   | 2026-04-14 |
| 12. Page Extraction & Card Layout | 3/3 | Complete   | 2026-04-15 |
| 13. Responsive Sidebar | 3/3 | Complete    | 2026-04-15 |
| 14. Dashboard Widgets | 3/3 | Complete    | 2026-04-15 |
| 15. Chart Styling | 3/3 | Complete    | 2026-04-15 |
| 16. Verification Sweep | 0/2 | Pending    |  |
| 17. Token Debt Cleanup | 0/0 | Pending    |  |
