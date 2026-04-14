---
phase: 11-sidebar-navigation-shell
plan: "01"
subsystem: web-ui
tags: [sidebar, navigation, theme, accessibility, tdd]
dependency_graph:
  requires: [10-design-token-foundation]
  provides: [Sidebar component, BrandLogo collapsed variant]
  affects: [web/src/components/Sidebar.jsx, web/src/components/BrandLogo.jsx]
tech_stack:
  added: []
  patterns: [lucide-react icons, clsx conditional classes, useTheme hook, useAccent hook]
key_files:
  created:
    - web/src/components/Sidebar.jsx
    - web/src/components/Sidebar.test.jsx
  modified:
    - web/src/components/BrandLogo.jsx
decisions:
  - "STYLES/ACCENT_SWATCH/ACCENT_SWATCH_DARK constants moved to Sidebar.jsx (not App.jsx) per plan spec"
  - "Collapsed popover uses useState(accentOpen) local to Sidebar for theme/accent panel"
  - "Pre-existing SettingsTab test failures excluded per plan acceptance criteria"
metrics:
  duration: "~10 minutes"
  completed_date: "2026-04-14"
  tasks_completed: 2
  files_changed: 3
---

# Phase 11 Plan 01: Sidebar Component Shell Summary

**One-liner:** Collapsible sidebar with 5 nav items, active state, theme/accent controls, edge handle, and BrandLogo icon-only collapsed variant — fully TDD tested.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create Sidebar component with nav, footer, theme controls, and edge handle | 4be23a9 | web/src/components/Sidebar.jsx, web/src/components/Sidebar.test.jsx |
| 2 | Add collapsed prop to BrandLogo for icon-only variant | 493309b | web/src/components/BrandLogo.jsx |

## What Was Built

### Sidebar.jsx

Standalone collapsible sidebar component with:

- **5 nav items** (Dashboard, Devices, Timeline, Alerts, Settings) mapped from `NAV_ITEMS` constant with lucide icons
- **Active state** via `aria-current="page"` and `bg-hc-interactive-hover text-hc-accent-strong` classes
- **Collapsed mode** — icons only, `title` tooltip attributes, `justify-center` layout
- **Edge handle** — absolutely positioned on right border, opacity-0 until group-hover, chevron direction matches state, `aria-label` toggles between "Collapse sidebar" / "Expand sidebar"
- **Theme controls** (expanded) — Sun/Moon/Monitor icon cycles system→light→dark→system, 8 accent dot swatches
- **Theme controls** (collapsed) — Paintbrush2 button with absolute-positioned popover panel
- **Footer** — version button calling `onOpenChangelog`, Sparkles for new version indicator, green update badge, GitLab issues link
- **STYLES, ACCENT_SWATCH, ACCENT_SWATCH_DARK** constants defined in this file (migrated from App.jsx intent per plan)

### Sidebar.test.jsx

9 unit tests covering all plan-specified behaviors:
- NAV-01: 5 buttons render with correct accessible names and SVG icon children
- NAV-05: `aria-current="page"` only on active item
- NAV-02: edge handle calls `onToggle`, collapsed title attributes, expanded no-title
- Clicking nav item calls `onNavigate` with correct id
- Edge handle aria-label switches correctly
- `role="navigation"` with `aria-label="Main navigation"`

### BrandLogo.jsx

Added `collapsed` prop:
- `collapsed=true` renders `viewBox="4 8 116 96"` cropped to house+chart icon, `width:28 height:28`
- `collapsed=false` (default) renders full `viewBox="0 0 420 120"` with text elements unchanged
- Shared `defs` and `iconGroup` JSX variables avoid duplication

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — Sidebar.jsx is a pure component with all functionality wired. BrandLogo renders both variants correctly.

## Threat Flags

No new trust boundaries or security-relevant surfaces introduced. This is pure UI layout restructuring with no API calls, auth paths, or schema changes.

## Self-Check: PASSED

- [x] web/src/components/Sidebar.jsx exists
- [x] web/src/components/Sidebar.test.jsx exists
- [x] web/src/components/BrandLogo.jsx modified with collapsed prop
- [x] Commit 4be23a9 exists (Sidebar component)
- [x] Commit 493309b exists (BrandLogo collapsed variant)
- [x] All 9 Sidebar tests pass
- [x] Full test suite passes (3 pre-existing SettingsTab failures excluded per plan)
