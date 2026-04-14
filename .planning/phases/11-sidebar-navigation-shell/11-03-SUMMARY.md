---
phase: 11-sidebar-navigation-shell
plan: 03
status: complete
started: 2026-04-14T21:17:00Z
completed: 2026-04-14T21:25:00Z
---

# Plan 11-03 Summary: App.jsx Rewrite as Thin Grid Shell

## What was built

Rewrote App.jsx from 536 lines to 95 lines — a thin CSS grid shell that renders the Sidebar component and delegates all page content to 5 extracted page components. Removed header, footer, and floating action buttons entirely.

## Tasks completed

### Task 1: Rewrite App.jsx and add CSS grid class
- Rewrote App.jsx as a grid shell with `gridTemplateColumns: collapsed ? '56px 1fr' : '240px 1fr'`
- Added `.app-layout` CSS class to index.css with `display: grid`, `grid-template-rows: 100dvh`, and `transition: grid-template-columns 200ms ease` (no width transition per D-11)
- Sidebar collapse state persists in localStorage key `hc_sidebar_collapsed`
- Moved dashboard state (days/sync/localStorage) into DashboardPage — no longer props from App
- Updated DashboardPage to use design tokens (bg-hc-panel, text-hc-accent-strong, etc.) instead of hardcoded colors
- Removed: header, footer, FABs, scroll listener, PWA detection, mobile viewport detection, theme/accent hooks, all dashboard widget imports, TABS/STYLES/ACCENT_SWATCH constants

### Task 2: Rewrite App.smoke.test.jsx
- Replaced tab-based mocks with sidebar + page component mocks
- Test 1: Renders sidebar and navigates to all 5 pages
- Test 2: Accessory detail via popstate with browser back support
- Removed old mocks for dashboard widgets, Setup.jsx, Accessories tab

### Task 3: Visual verification
- Human approval confirmed: all 15 verification steps passed
- Sidebar nav, collapse/expand, localStorage persistence, theme controls, dark mode, all 5 pages, no FABs

## Commits

- `1154c37` feat(11-03): rewrite App.jsx as thin grid shell with sidebar navigation
- `028c8f8` test(11-03): rewrite smoke test for sidebar navigation structure

## Verification

- `wc -l web/src/App.jsx` → 95 lines (under 100 target)
- Smoke tests: 2/2 pass
- Sidebar tests: 9/9 pass
- Full suite: 39/42 pass (3 pre-existing SettingsTab failures)
- No `hc-fab`, `<header`, `<footer`, `useTheme`, `useAccent`, `ACCENT_SWATCH` in App.jsx
- `.app-layout` class has `display: grid` and `transition: grid-template-columns` (not width)
- Visual verification approved by user

## Requirements covered

- **NAV-03**: Sidebar collapse state persists in localStorage across page refreshes
- **LAYOUT-02**: App.jsx is a thin shell (95 lines) delegating to page components
