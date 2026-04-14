# Project Research Summary

**Project:** HomeChronicle v1.2 UI Redesign
**Domain:** React SPA dashboard overhaul — sidebar navigation, design token system, chart improvements, new dashboard widgets
**Researched:** 2026-04-14
**Confidence:** HIGH

## Executive Summary

HomeChronicle v1.2 is a visual and structural overhaul of an existing React 19 + Tailwind v4 SPA. The existing backend, API, and data-fetching hooks are untouched; all work is confined to the frontend shell, navigation, theming, and dashboard widget layer. The recommended approach is an incremental, phase-by-phase extraction: replace App.jsx's navigation shell with a collapsible sidebar, migrate the CSS custom property system to clean semantic tokens, extract existing tab content into page components, add new dashboard widgets using existing hooks, then improve chart styling. Every phase has a working, testable state at its end — no big-bang rewrites.

The core stack decision is to stay entirely within the existing dependency set plus targeted additions. Recharts upgrades to v3 (not replaced). The sidebar is built from shadcn/ui copy-paste source files backed by Radix UI primitives (5 packages + class-variance-authority). Theming uses Tailwind v4's `@theme inline` directive with CSS custom properties — no new theming library. This keeps the bundle impact minimal and preserves all existing chart components' theme integration, which depends heavily on `--hc-*` CSS variables read at render time.

The two highest risks are (1) the 339 hardcoded `dark:bg-gray-*` / `dark:text-gray-*` Tailwind classes scattered across 30+ components that will produce inconsistent dark mode if not replaced with semantic tokens before new components are built, and (2) the `useAccentRgb()` hook that reads `--hc-accent-rgb` via `getComputedStyle` for SVG gradient fills in 5 chart components — this breaks silently if the skin system is removed without keeping the variable as an alias. Both risks are addressed by making the theming migration the first phase and establishing a firm rule against hardcoded Tailwind color classes in any new component.

## Key Findings

### Recommended Stack

The stack requires three targeted additions on top of what is already installed. Recharts upgrades from v2.12.7 to v3.8.1 — it is already in the project, natively integrates with shadcn/ui's chart layer, and v3 adds gradient fills and smooth D3 curves. The sidebar uses shadcn/ui's copy-paste pattern (not an npm package) backed by 5 Radix UI primitives and `class-variance-authority`. Theming is handled entirely by Tailwind v4's `@theme inline` directive with no third-party theme library. Total new installs: 7 packages.

**Core technologies:**
- `recharts ^3`: Charting — upgrade in-place, shadcn integration, D3 curves, CSS var theming; existing 8 chart components preserved
- `@radix-ui/react-slot`, `react-separator`, `react-dialog`, `react-tooltip`, `react-collapsible`: Sidebar primitives — accessibility and interaction baked in; copy-paste into `components/layout/`
- `class-variance-authority`: Sidebar variant logic — framework-agnostic, no peer dep conflicts
- Tailwind v4 `@theme inline` directive (no install): Semantic token system — generates `bg-surface`, `text-text-muted` etc. as utility classes referencing CSS variables; zero runtime overhead
- `localStorage` for sidebar and theme state persistence — no Next.js server context needed; pattern already used by existing `useTheme` and `useSkin` hooks

### Expected Features

**Must have (table stakes — v1.2 launch blockers):**
- Collapsible sidebar (expanded/icon-only) with persistent collapse state — top tabs feel dated in 2026; 240–280px expanded, 64–72px icon-only
- Responsive sidebar: full at 1024px+, icon-only at 768–1024px, sheet drawer overlay on mobile
- Active nav item highlight with `aria-current="page"` — users must always know their location
- Semantic design token system (light + dark modes) replacing 8-skin system — foundational for all other visual work
- Consistent card surface system via design tokens — eliminates `dark:bg-gray-800` scatter
- KPI stat cards with trend delta indicators (today vs yesterday percentage) — users expect at-a-glance metrics
- Chart visual upgrade: gradient fills, smooth curves via Recharts v3 — current charts look dated
- Light/dark mode toggle visible in sidebar footer (not hidden FAB)

**Should have (differentiators, add in v1.2.x if time allows):**
- Live activity feed widget with scroll-lock pause behavior — surfaces the event log's core value on the dashboard
- Room-by-room device health widget grid — home automation users think in rooms; no new API needed (join existing endpoints client-side)
- Device health KPI card (online/offline/stale counts) — promotes product from chart viewer to reliability monitor
- Single accent color picker with 5–8 preset swatches replacing skin picker — simpler than 8 skins

**Defer (v1.3+):**
- Draggable/rearrangeable widgets — layout persistence complexity not worth it for single-user home server
- Sidebar section accordion groups — only needed when nav items exceed 6–7
- Dashboard layout density toggle (compact/comfortable)
- Keyboard navigation shortcuts

### Architecture Approach

The architecture is a shell replacement with content preservation. App.jsx (535 lines, 7+ mixed concerns) is replaced by a thin shell (~80 lines) that renders `ThemeProvider`, `Sidebar`, and conditional page components. All existing hooks, chart components, and content components are extracted unchanged into `pages/` — `DashboardPage`, `TimelinePage`, `DevicesPage`, `AlertsPage`, `SettingsPage`. New structural files live in `components/layout/` and `contexts/`. The CSS custom property system is extended, not replaced: new sidebar tokens (`--hc-sidebar-width-open`, `--hc-sidebar-bg`, etc.) delegate to existing `--hc-panel-*` tokens. `useTheme()` and `useSkin()` hooks remain unchanged and are wrapped by a new `ThemeContext` to eliminate prop drilling to the sidebar.

**Major components:**
1. `Sidebar.jsx` + `SidebarItem.jsx` — vertical nav, collapse/expand, theme controls in footer; collapse state isolated in `useSidebarState.js`
2. `ThemeContext.jsx` — wraps app, exposes `{preference, resolvedTheme, skin, setSkin}` so sidebar can access without prop drilling through App.jsx
3. `pages/` (5 components) — `DashboardPage`, `TimelinePage`, `DevicesPage`, `AlertsPage`, `SettingsPage` extracted from App.jsx and Setup.jsx with zero internal changes
4. `KpiCards.jsx` + `LiveFeed.jsx` — new dashboard widgets composed from existing `useAccessories` and `useEvents` hooks with shared query keys
5. `index.css` modifications — `@theme inline` semantic tokens, `--hc-sidebar-*` tokens, removal of FAB skin-picker CSS

### Critical Pitfalls

1. **Hardcoded `dark:bg-gray-*` classes survive theming migration** — establish a no-hardcoded-colors rule before writing any new component; audit 339 existing instances with grep before Phase 1; all colors must use `--hc-*` tokens
2. **`useAccentRgb()` breaks when skin system is removed** — keep `--hc-accent-rgb` as an alias in the new token layer; SVG `stopColor` cannot use CSS `var()` directly; 5 chart components using this hook must be verified in both modes after skin removal
3. **App.jsx monolith not restructured before sidebar work** — extract `useSidebarState` and define clean component boundaries before visual sidebar work; sidebar must receive only 3 props; prop-drilling `setTab` is the warning sign
4. **Sidebar width CSS transition causes chart re-renders on Raspberry Pi** — animate with `transform` or CSS Grid `grid-template-columns` toggle, never `transition: width`; `ResponsiveContainer` fires `ResizeObserver` on every pixel change
5. **`localStorage` key conflicts on upgrade from v1.1** — users have `hc_ui_skin='ocean'` (and other old skin names) stored; `useSkin()` must validate against new valid set on first load and migrate/clear invalid keys

## Implications for Roadmap

Based on combined research, the natural phase structure is dictated by component dependencies: tokens before components, shell before pages, pages before widgets, styling last.

### Phase 1: Design Token Foundation
**Rationale:** Every subsequent component needs consistent surface, border, and accent tokens or the dark mode regression (Pitfall 1) is guaranteed. This is a hard prerequisite — no new UI code should be written without it.
**Delivers:** `@theme inline` semantic token system in `index.css`; all 339 `dark:bg-gray-*` instances replaced with token-based classes; `--hc-accent-rgb` preserved as alias; `localStorage` migration for old skin keys
**Addresses:** Semantic design token system (table stakes), consistent card dark mode (table stakes)
**Avoids:** Pitfall 1 (mixed token/Tailwind dark mode), Pitfall 2 (useAccentRgb break), Pitfall 6 (localStorage key conflicts)

### Phase 2: Sidebar Navigation Shell
**Rationale:** Navigation restructure is the highest-risk change because it touches the shell every component renders inside. Do it second, immediately after tokens are stable, so all new sidebar components use the token system from day one.
**Delivers:** `useSidebarState.js`, `Sidebar.jsx`, `SidebarItem.jsx`, App.jsx replaced as thin shell, `--hc-sidebar-*` CSS tokens, sidebar collapse animation using transform (not width), ARIA landmark and `aria-current` on sidebar items, theme toggle moved to sidebar footer, FAB removed
**Uses:** Radix UI primitives, class-variance-authority, shadcn sidebar copy-paste pattern, Tailwind v4 tokens from Phase 1
**Avoids:** Pitfall 3 (App.jsx monolith), Pitfall 4 (layout thrash on RPi), accessibility regressions

### Phase 3: Page Extraction
**Rationale:** App.jsx still contains all tab content after Phase 2's shell replacement. Extracting to page components reduces App.jsx to its proper responsibility (layout + routing) and creates clean boundaries for adding widgets in Phase 4.
**Delivers:** `DashboardPage.jsx`, `TimelinePage.jsx`, `DevicesPage.jsx`, `AlertsPage.jsx`, `SettingsPage.jsx`; App.jsx at ~80 lines; `ThemeContext.jsx` wrapping existing hooks; all existing functionality identical with zero behavior change
**Implements:** Shell replacement + content preserved pattern; ThemeProvider context eliminating prop drilling

### Phase 4: Responsive Sidebar
**Rationale:** Responsive behavior is a distinct concern from base navigation — different breakpoints, sheet/drawer pattern, bottom-nav removal. Separating it from Phase 2 reduces scope and allows mobile testing in isolation.
**Delivers:** Auto-collapse below 768px, sheet/drawer overlay on mobile, sidebar breakpoints aligned with `isMobileViewport` detection, old `isBottomNav` / `isStandalonePwa` bottom-nav logic removed
**Addresses:** Responsive layout (table stakes)
**Avoids:** UX pitfall of sidebar pushing content on mobile (must overlay, not push)

### Phase 5: Dashboard Widgets
**Rationale:** New widgets compose from existing hooks using existing query keys — no structural risk. Comes after page extraction so widgets slot cleanly into `DashboardPage.jsx`.
**Delivers:** `KpiCards.jsx` (online/offline/stale device counts with trend deltas), `LiveFeed.jsx` (scrollable recent events with scroll-lock pause), room-by-room health widget grid, per-widget `ErrorBoundary` wrappers
**Uses:** Existing `useAccessories`, `useEvents`, `useDailyStats`, `useRoomStats` hooks; no new API endpoints; shared TanStack Query keys to prevent duplicate requests
**Addresses:** KPI cards (table stakes), device health KPI (differentiator), live activity feed (differentiator), room breakdown (differentiator)

### Phase 6: Chart Styling
**Rationale:** Chart improvements have no dependencies on layout work and are entirely cosmetic. If the Recharts v3 upgrade introduces peer dep conflicts, it does not block any other phase.
**Delivers:** Recharts upgraded to ^3.8.1; gradient fills and smooth curves (`type="natural"`) on TrendChart and ActivityChart; improved axis and tick styling; heatmap components evaluated for D3 upgrade if needed; `react-is` override in package.json if peer dep conflict arises
**Avoids:** Pitfall 5 (bundle bloat from two chart libraries — complete Recharts v3 migration in one phase, remove v2 reference in same PR)

### Phase Ordering Rationale

- Tokens must come first. The 339 hardcoded Tailwind color classes create a trap for every component written without the token system. This sequence rule cannot be bent.
- Sidebar before page extraction because App.jsx must become a thin shell before content extraction is clean. Extracting pages from a 535-line monolith that still controls navigation is harder to reason about than extracting from an ~80-line shell.
- Page extraction before new widgets because new widgets need to live inside their page component, and those files don't exist until Phase 3.
- Responsive sidebar isolated in Phase 4 because the mobile breakpoint logic (auto-collapse, sheet drawer, bottom-nav removal) deserves its own verification pass at every viewport width.
- Charts last because they are cosmetic, have no layout dependencies, and Recharts v3 peer dep risk should not gate layout work.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 (Design Tokens):** The full audit of 339 `dark:` class instances needs manual review — some may be intentional badge/status colors that should not be converted to semantic tokens. Requires a grep + review pass before writing the phase plan.
- **Phase 2 (Sidebar):** The exact shadcn sidebar source files to copy and any Vite-specific adjustments (no Next.js `cookies()`, no `@` path aliases) need validation. A minimal working sidebar prototype is recommended before writing the phase plan. MEDIUM confidence.
- **Phase 4 (Responsive):** The interaction between new sidebar breakpoints and the existing `isMobileViewport` / `isStandalonePwa` PWA detection logic in App.jsx needs tracing before planning. Live references in current codebase.

Phases with standard, well-documented patterns (skip research-phase):
- **Phase 3 (Page Extraction):** Pure mechanical extraction — move code into new files, verify imports. Architecture research already specifies exactly what state goes where.
- **Phase 5 (Dashboard Widgets):** Existing hooks cover all data needs. Standard React component composition with shared query keys.
- **Phase 6 (Chart Styling):** Recharts v3 migration guide is published. Standard in-place upgrade.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Recharts v3 release confirmed (April 2026); shadcn/ui Tailwind v4 + React 19 support confirmed by official docs; only MEDIUM flag is Vite-specific sidebar localStorage state (vs Next.js cookies) |
| Features | HIGH | Patterns drawn from Home Assistant, Grafana, Linear plus direct codebase analysis; feature dependencies mapped against existing API endpoints — no backend gaps |
| Architecture | HIGH | Based entirely on direct codebase inspection of App.jsx, index.css, hooks, and chart components; every component boundary and state location verified against actual source files |
| Pitfalls | HIGH | All 6 critical pitfalls grounded in specific counted instances from the actual codebase (339 `dark:` classes, 5 `useAccentRgb` usages, specific localStorage key names) — not speculative |

**Overall confidence:** HIGH

### Gaps to Address

- **Sidebar copy-paste file list:** The exact set of shadcn sidebar source files to copy should be validated with a minimal working prototype in a branch before writing the Phase 2 plan.
- **`--hc-accent-rgb` usage count:** PITFALLS.md cites ~50 locations; confirm with a grep before Phase 1 to scope migration work accurately.
- **PWA bottom-nav removal impact:** The `isStandalonePwa` detection serves existing PWA-installed users. Removing bottom nav in Phase 4 needs explicit changelog communication and should be evaluated for whether a sidebar sheet adequately serves PWA mode.
- **Recharts v3 peer dep conflict:** The `react-is` override may be needed in `web/package.json`. Verify as the first step of Phase 6.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `web/src/App.jsx`, `web/src/index.css`, `web/src/hooks/`, `web/src/components/` — all architecture findings verified against source
- Recharts GitHub releases — v3.8.1 confirmed published April 2026: https://github.com/recharts/recharts/releases
- shadcn/ui official docs — Tailwind v4 + React 19 confirmed: https://ui.shadcn.com/docs/tailwind-v4
- shadcn/ui sidebar blocks — 16 variants including icon-collapse: https://ui.shadcn.com/blocks/sidebar
- Tailwind v4 `@theme` directive official docs: https://tailwindcss.com/docs/theme
- Tailwind v4 theming best practices — official team discussion: https://github.com/tailwindlabs/tailwindcss/discussions/18471

### Secondary (MEDIUM confidence)
- shadcn Vite + localStorage sidebar state pattern (community): https://adiletsatylganov.medium.com/how-to-keep-shadcn-sidebar-state-when-reloading-a-page-client-side-90310a146fe0
- Dashboard design patterns 2026: https://artofstyleframe.com/blog/dashboard-design-patterns-web-apps/
- KPI card best practices: https://tabulareditor.com/blog/kpi-card-best-practices-dashboard-design
- Sidebar layout pitfalls: https://akashhamirwasia.com/blog/how-to-and-not-to-build-sidebar-layouts/
- Recharts 3.0 migration guide: https://github.com/recharts/recharts/wiki/3.0-migration-guide

### Tertiary (LOW confidence)
- W3C ARIA keyboard interface practices — standard patterns applied to sidebar: https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/

---
*Research completed: 2026-04-14*
*Ready for roadmap: yes*
