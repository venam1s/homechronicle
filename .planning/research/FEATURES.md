# Feature Research

**Domain:** Self-hosted IoT event log dashboard — UI/UX redesign
**Researched:** 2026-04-14
**Confidence:** HIGH (patterns drawn from established dashboard ecosystem + existing codebase analysis)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Collapsible sidebar (expanded/icon-only) | Standard in every 2025+ dashboard product (Grafana, Linear, Notion, Vercel). Top tabs feel dated in 2026. | MEDIUM | 240–280px expanded, 64–72px icon-only collapsed. State persisted to localStorage. Lucide icons already present. |
| Active nav item highlight | Users need to know where they are — no highlight feels broken | LOW | Already done in top-tab bar; replicate in sidebar with accent background token. |
| Light/dark mode toggle | 82% of users enable dark mode when available (Android Authority 2024). A toggle is expected; a hidden FAB is not. | LOW | Already built — move the toggle to a visible sidebar footer location. |
| KPI summary cards at top of dashboard | Users expect most important numbers at a glance (F-scan pattern: top row, left side first) | LOW | StatsCards component already exists; needs trend indicators and device health counts added. |
| Responsive layout (sidebar collapses on narrow viewports) | Users expect dashboards to function at 1366px laptop width (22.4% of desktop traffic per nav.gallery research) | MEDIUM | Sidebar icon-only below ~1024px; sheet/drawer below ~768px. |
| Consistent card surface system | Cards as content containers are universal in modern dashboards. Hardcoded `bg-white` breaks in dark mode. | LOW | Currently inconsistent — some cards use `dark:bg-gray-800`, others don't. Semantic surface token fixes this globally. |
| Section labels / nav groups | More than 4 nav items needs visual grouping (e.g., "Monitor", "Manage") | LOW | Sidebar allows labeled groups; top tabs cannot. Relevant once Alerts and Settings are promoted to nav items. |
| Smooth sidebar expand/collapse transition | Jarring instant width changes feel unfinished | LOW | CSS `transition: width 200ms ease` + `overflow: hidden` on labels. |
| Tooltip labels in icon-only mode | Icon-only sidebar requires tooltips so users know what each icon does | LOW | Show tooltip on hover only when sidebar is collapsed. Already have Lucide icons paired with label strings in TABS constant. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Room-by-room device health widget | Home automation users think in rooms. "Kitchen: 2 stale devices" is immediately actionable. Home Assistant's room-based Lovelace cards are widely cited as a key UX advantage. | MEDIUM | Room stats API already exists (`/api/stats/rooms`). New: grid of room cards with device counts, last-seen, online/offline badges. Client-side join with accessories list for health status. |
| Live activity feed widget on dashboard | Surfaces the event log's core value immediately — visitors see real-time activity, not just static charts. No equivalent in Grafana or standalone chart tools. | MEDIUM | TanStack Query polling + existing event hook provides the stream. New: dedicated feed widget showing last N events with accessory, value change, timestamp. Critical: scroll-lock toggle to pause auto-scroll when user is reading. |
| Device health KPI card (online/offline/stale counts) | Promotes HomeChronicle from "chart viewer" to "reliability monitor." Stale device detection already exists in StaleDevicesPanel. | LOW | New KPI card summarizing: total devices, online now, stale (>24h). Derived client-side from existing accessories list. No new API needed. |
| Trend delta indicators on KPI cards | "247 events today (+12% vs yesterday)" makes metrics actionable vs decorative. Expected in business dashboards, uncommon in self-hosted tools. | LOW | Daily stats API already returns per-day counts. Client-side delta calculation in StatsCards; render up/down arrow with percentage. |
| Semantic design token system (not skin picker) | Replacing 8 arbitrary color skins with a token-based system (`--color-surface`, `--color-accent`) makes the UI coherent and extensible. Eliminates per-component `dark:` class scatter. | MEDIUM | Tailwind v4 `@theme` directive — all custom properties defined once in CSS, applied semantically throughout components. Enables accent color customization later without a new skin. |
| Single accent color (replaces 8 skins) | Most users pick one skin and never change it. A single configurable accent color (with 5–8 preset swatches) is simpler to implement and maintain. Linear, Raycast, and Arc all use this model. | LOW | Once token system is in place, accent is just one token swap. Preset swatches replace the current skin picker. |
| Persistent sidebar state across sessions | Power users who prefer narrow mode don't want to re-collapse every page load. | LOW | localStorage key for collapsed state; restore on mount. Same pattern as existing dashboard date range persistence. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Draggable / user-rearrangeable widgets | "Customize your layout" sounds appealing | Requires layout persistence layer (serializing grid positions per user), conflict resolution when widget APIs change, and adds significant complexity for a feature most home-server users configure once and forget. Grafana's draggable panels are frequently cited as confusing for non-technical users. | Fixed opinionated layout that is well-designed. Offer layout density toggle (compact/comfortable) if real feedback requests it. |
| WebSocket real-time event push | "True" live feed without polling | Adds server complexity (WebSocket lifecycle, reconnect, auth token threading) for a home server with < 10 concurrent users. Polling at 5–10s is indistinguishable from real-time for home automation events that change on seconds-to-minutes timescales. | Keep TanStack Query polling. Existing 10s staleTime already works well. |
| Per-widget date range controls | Every chart has its own time picker | Already tried and addressed with the Synced/Unsync toggle. Per-widget pickers fragment the user's mental model — they lose track of which widgets show which period. | Single global date range with the existing sync toggle. Deep-dive overrides belong in detail views (AccessoryDetail), not the dashboard. |
| Dark sidebar + light content area (two-tone layout) | Trendy two-tone pattern (dark left rail, light main) seen in Linear, Raycast | Requires all content area components to be designed against a light background only, conflicting with existing full dark-mode support. Maintaining two different panel backgrounds doubles theming surface and breaks the existing `dark:` class investments. | Single consistent surface color per mode. Sidebar uses slightly elevated surface (`--color-surface-raised`) but tracks the active theme. |
| Preserving all 8 color skins in redesign | User familiarity with existing skins | The 8-skin system was a workaround for the absence of a real design system. Carrying it forward means maintaining 8x the CSS custom properties and testing 16 combinations (8 skins x 2 modes). Most users pick one skin and never change. | One polished light mode, one polished dark mode, with a single user-configurable accent color. 5–8 preset accent swatches replace the skin list. |
| AI/predictive anomaly detection | 2025/2026 dashboard trend | Adds model inference dependency; opacity erodes trust for a reliability monitor. HomeChronicle's existing rule-based outlier detection is fully explainable and sufficient for home use. | Improve thresholds and presentation of the existing AnomalyPanel. |

---

## Feature Dependencies

```
[Semantic Design Token System]
    └──requires──> [Tailwind v4 @theme directive migration from current CSS vars]
    └──enables──> [Sidebar Navigation theming]
    └──enables──> [Consistent card dark mode (replaces scattered dark:bg-gray-800)]
    └──replaces──> [8-skin system + --hc-accent-rgb + --hc-panel-mid custom properties]

[Sidebar Navigation]
    └──requires──> [Semantic Design Token System] (sidebar surface + border tokens)
    └──requires──> [React layout restructure] (App.jsx: header → sidebar + main grid)
    └──conflicts──> [Bottom navigation bar] (existing isBottomNav mobile pattern in App.jsx)

[Responsive Sidebar (mobile drawer)]
    └──requires──> [Sidebar Navigation] (base component)
    └──replaces──> [isBottomNav / bottom nav bar on mobile]

[KPI Cards with Trend Indicators]
    └──requires──> [Daily stats API] (already exists: useDailyStats)
    └──enhances──> [Device Health KPI Card]

[Device Health KPI Card]
    └──requires──> [Accessories list with status] (already exists: /api/accessories)
    └──requires──> [Stale device detection logic] (already in StaleDevicesPanel — extract to hook)

[Room-by-Room Widget]
    └──requires──> [Room stats API] (already exists: /api/stats/rooms)
    └──requires──> [Accessories list] (already exists) for health status join
    └──enhances──> [Device Health KPI Card] (room drill-down from KPI)

[Live Activity Feed Widget]
    └──requires──> [Events polling hook] (already exists: useEvents)
    └──requires──> [Scroll-lock behavior] (new: pause auto-scroll when user interacts)
    └──enhances──> [Toast navigation] (already exists: clickable toasts navigate to timeline)
```

### Dependency Notes

- **Design tokens are foundational — do them first.** The sidebar, new cards, and all new widgets need consistent surface/border/text tokens or you recreate the same `dark:bg-gray-800` scatter that already exists. Every subsequent component depends on this.
- **Sidebar restructures App.jsx layout.** Moving from header tabs to a sidebar changes the top-level flex/grid layout. This is the highest-risk change — it touches the shell every component renders inside. Do this early and in isolation.
- **Bottom nav conflict must be resolved.** The current `isBottomNav` logic (PWA + mobile) shows bottom navigation. Sidebar redesign must choose: sidebar-as-drawer on mobile (sheet pattern), OR keep bottom nav for PWA. They cannot cleanly coexist. Recommendation: sidebar sheet on mobile replaces bottom nav; bottom nav is removed.
- **Live feed scroll-lock is non-negotiable.** When a user is reading the feed and new events arrive, auto-scroll that steals focus is a critical UX failure. Slack, GitHub, and Datadog all implement "paused — click to resume" for this reason. Budget this into the live feed implementation.
- **Room health requires no new API.** Join existing `/api/accessories` (with `lastSeen` timestamps) against `/api/stats/rooms` client-side. No backend changes needed.

---

## MVP Definition

### Launch With (v1.2 — the redesign milestone)

Minimum required for the redesign to feel complete and shippable.

- [ ] Semantic design token system (light + dark) — foundational, do first
- [ ] Collapsible sidebar with icon-only collapsed mode — replaces top tab bar
- [ ] Responsive sidebar: sheet drawer on mobile, icon-only at 768–1024px, full at 1024px+
- [ ] KPI cards with trend delta indicators (today vs yesterday) and device health counts
- [ ] Modern card layout with consistent surface tokens (dark mode working throughout)
- [ ] Chart visual overhaul — gradient fills, smooth curves on Recharts (or replacement)

### Add After Validation (v1.2.x — post-launch iteration)

- [ ] Live activity feed widget — high value but scroll-lock UX complexity; get core layout right first
- [ ] Room-by-room device health widget grid — needs UI design to determine optimal card density
- [ ] Single accent color picker with preset swatches — once token system is stable

### Future Consideration (v1.3+)

- [ ] Sidebar section accordion groups — only needed when nav items grow beyond 6–7
- [ ] Dashboard layout density toggle (compact/comfortable) — only if user feedback requests it
- [ ] Keyboard navigation shortcuts for sidebar — power user feature

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Semantic design tokens (light/dark) | HIGH | MEDIUM | P1 |
| Collapsible sidebar navigation | HIGH | MEDIUM | P1 |
| Responsive sidebar (mobile drawer) | HIGH | MEDIUM | P1 |
| KPI cards with trend indicators | HIGH | LOW | P1 |
| Consistent card dark mode (token-based) | HIGH | LOW | P1 |
| Chart visual overhaul (gradient fills) | MEDIUM | MEDIUM | P1 |
| Live activity feed widget | HIGH | MEDIUM | P2 |
| Room-by-room health widget | HIGH | MEDIUM | P2 |
| Device health summary KPI card | MEDIUM | LOW | P2 |
| Single accent color picker | LOW | LOW | P2 |
| Sidebar section accordion groups | LOW | LOW | P3 |
| Dashboard density toggle | LOW | LOW | P3 |

**Priority key:**
- P1: Required to ship v1.2 — missing these means it is not a redesign
- P2: Add within milestone if time allows; defer to v1.2.x if not
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

Relevant comparisons are self-hosted dashboard tools and modern SaaS dashboards.

| Feature | Home Assistant (Lovelace) | Grafana OSS | HomeChronicle v1.2 Approach |
|---------|--------------------------|-------------|------------------------------|
| Navigation | Left sidebar with sections, collapsible | Left sidebar, collapses to icons | Adopt sidebar pattern; simpler than Grafana (5 items vs dozens) |
| KPI cards | Entity state cards with icons | Stat panels with thresholds and trend arrows | Add trend delta and device health status to existing StatsCards |
| Live activity | Entity history panels, no dedicated feed | No live feed (chart-centric) | Dedicated feed widget is a differentiator vs both |
| Room grouping | First-class room concept, room cards in Lovelace | No room concept | Room health widget grid inspired by Lovelace room layout |
| Theming | 60+ community themes via HACS | Light/dark + custom palette variables | 2 polished modes + accent color; no theme marketplace needed |
| Mobile | Mobile-first PWA | Desktop-first, limited mobile | Sidebar with mobile sheet drawer; remove bottom-nav in favor of sidebar |
| Charts | Community cards (Recharts, custom) | Native time-series panels with gradient support | Recharts with gradient fills and smooth curves; evaluate upgrade vs replacement |

---

## Sources

- [Dashboard Design Patterns for Modern Web Apps 2026](https://artofstyleframe.com/blog/dashboard-design-patterns-web-apps/)
- [8+ Best Sidebar Menu Design Examples 2026](https://www.navbar.gallery/blog/best-side-bar-navigation-menu-design-examples)
- [Building a Collapsible Admin Sidebar with React Router — DEV Community](https://dev.to/cristiansifuentes/building-a-collapsible-admin-sidebar-with-react-router-uselocation-pro-patterns-7im)
- [Dark Mode in React: Scalable Theme System with Tailwind](https://medium.com/@roman_fedyskyi/dark-mode-in-react-a-scalable-theme-system-with-tailwind-d14e9c1afd1a)
- [Activity Stream UI Pattern](https://ui-patterns.com/patterns/ActivityStream)
- [Designing Chronological Activity Feeds](https://www.aubergine.co/insights/a-guide-to-designing-chronological-activity-feeds)
- [KPI Card Best Practices — Tabular Editor](https://tabulareditor.com/blog/kpi-card-best-practices-dashboard-design)
- [Dashboard Design Best Practices 2025](https://5of10.com/articles/dashboard-design-best-practices/)
- [Best Home Assistant Dashboard Ideas 2026](https://www.seeedstudio.com/blog/2026/01/09/best-home-assistant-dashboards/)
- [IoT Dashboard Design Tips — Lemberg Solutions](https://lembergsolutions.com/blog/5-tips-make-your-ui-design-iot-dashboard-work)
- [Tailwind CSS v4 Tutorial: Build a Dashboard 2026](https://tech-insider.org/tailwind-css-tutorial-dashboard-v4-2026/)
- HomeChronicle codebase: `web/src/App.jsx`, `web/src/components/StatsCards.jsx`, component inventory in `web/src/components/`

---
*Feature research for: HomeChronicle v1.2 UI Redesign — modern dashboard UI patterns*
*Researched: 2026-04-14*
