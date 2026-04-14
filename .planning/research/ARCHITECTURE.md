# Architecture Research

**Domain:** React SPA UI Redesign — sidebar layout, theme system, chart migration
**Researched:** 2026-04-14
**Confidence:** HIGH (based on direct codebase inspection)

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                          main.jsx  (UNCHANGED)                        │
│  QueryClientProvider → ToastProvider → <App />                       │
└─────────────────────────────┬────────────────────────────────────────┘
                               │
┌──────────────────────────────▼────────────────────────────────────────┐
│                    App.jsx  (REPLACED — new thin shell)               │
│  ThemeProvider → sidebar layout → conditional page render            │
└──────┬──────────────────────────────┬────────────────────────────────┘
       │ controlled props             │ active section
       ▼                              ▼
┌──────────────┐       ┌─────────────────────────────────────────────┐
│  Sidebar.jsx │       │  Page components (one per nav section)       │
│  (NEW)       │       │                                              │
│  nav items   │       │  DashboardPage.jsx  (extracted from App.jsx) │
│  collapse    │       │  TimelinePage.jsx   (extracted from App.jsx) │
│  theme ctrl  │       │  DevicesPage.jsx    (extracted from App.jsx) │
└──────────────┘       │  AlertsPage.jsx     (split from Setup.jsx)   │
                       │  SettingsPage.jsx   (split from Setup.jsx)   │
                       └──────────────────┬──────────────────────────┘
                                          │ unchanged imports
                       ┌──────────────────▼──────────────────────────┐
                       │  Existing components (KEEP UNTOUCHED)        │
                       │  Timeline, AccessoryList, AccessoryDetail     │
                       │  ActivityChart, TrendChart, StatsCards        │
                       │  AnomalyPanel, StaleDevicesPanel             │
                       │  ErrorBoundary, Toast system                 │
                       └──────────────────┬──────────────────────────┘
                                          │ unchanged
                       ┌──────────────────▼──────────────────────────┐
                       │  Existing hooks (ZERO CHANGES)               │
                       │  useEvents, useAccessories, useSetup         │
                       │  useAlerts, useTheme, useSkin, useAccentRgb  │
                       └─────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Migration Status |
|-----------|----------------|-----------------|
| `App.jsx` | Root shell: ThemeProvider, sidebar + content layout, section routing | REPLACE (535 lines → ~80 lines) |
| `Sidebar.jsx` | Vertical nav, collapse/expand, active section highlight, theme/skin controls | NEW |
| `SidebarItem.jsx` | Stateless nav item with icon + label + active state | NEW |
| `ThemeProvider.jsx` | Context exposing `{ resolvedTheme, preference, setPreference, skin, setSkin }` | NEW |
| `useSidebarState.js` | Collapse state + active section + localStorage persistence | NEW |
| `DashboardPage.jsx` | Extracts dashboard content block from App.jsx; no API/hook changes | EXTRACT |
| `TimelinePage.jsx` | Extracts timeline block + `timelineInitialFilters` state | EXTRACT |
| `DevicesPage.jsx` | Extracts accessories block + `selectedAccessoryId` drill-down state | EXTRACT |
| `AlertsPage.jsx` | Carved from Setup.jsx — alert rule CRUD only | SPLIT |
| `SettingsPage.jsx` | Carved from Setup.jsx — retention, repair, API config | SPLIT |
| All chart components | Self-contained Recharts wrappers; theme-aware via CSS vars | KEEP AS-IS |
| All hooks | TanStack Query data fetching — no changes needed | KEEP AS-IS |
| `index.css` | Add sidebar CSS custom properties; remove FAB skin-picker styles | MODIFY |
| `main.jsx` | Provider tree entry point | UNCHANGED |

## Recommended Project Structure

```
web/src/
├── components/
│   ├── layout/               # NEW: structural chrome only
│   │   ├── Sidebar.jsx
│   │   └── SidebarItem.jsx
│   ├── [all existing components unchanged]
│   └── ...
├── pages/                    # NEW: one component per nav section
│   ├── DashboardPage.jsx
│   ├── TimelinePage.jsx
│   ├── DevicesPage.jsx
│   ├── AlertsPage.jsx
│   └── SettingsPage.jsx
├── hooks/
│   ├── useSidebarState.js    # NEW
│   ├── [all existing hooks unchanged]
│   └── ...
├── contexts/                 # NEW: React context for cross-cutting state
│   └── ThemeContext.jsx
├── App.jsx                   # REPLACED: thin shell only
├── index.css                 # MODIFIED: sidebar tokens added
└── main.jsx                  # UNCHANGED
```

### Structure Rationale

- `components/layout/`: Isolates structural chrome (sidebar) from content components. New files only — nothing existing moves.
- `pages/`: Promotes the five nav sections to first-class components. Extracts the dense content blocks from App.jsx without changing anything inside them.
- `contexts/`: Standard React pattern for cross-cutting state (theme/skin) that Sidebar needs without prop drilling. Single file, minimal surface area.
- `hooks/useSidebarState.js`: Owns collapse state + active section + localStorage persistence, keeping App.jsx slim.
- Existing `components/` and `hooks/` files stay exactly where they are. No barrel files, no path alias changes.

## Architectural Patterns

### Pattern 1: Shell Replacement, Content Preserved

**What:** App.jsx is replaced with a new thin shell. The layout changes (sidebar replaces top tabs), but all page content is extracted unchanged. Each page component is a wrapper that imports exactly what App.jsx already imported for that tab.

**When to use:** The only correct pattern here. All data-fetching hooks, chart components, and state management already work correctly. Changing the navigation chrome is independent of the content it wraps.

**Trade-offs:** Avoids big-bang risk. Each page component can be extracted and smoke-tested independently. The main challenge is App.jsx's 535 lines contain navigation, scroll effects, changelog, toast config, live event subscription, history handling, and all dashboard content mixed together — extraction must be methodical, moving one concern at a time.

**Example:**
```jsx
// New App.jsx — thin shell (~80 lines)
export default function App() {
  const { section, setSection, collapsed, setCollapsed } = useSidebarState();
  // ... toast config, changelog, live events (kept here, not in pages)

  return (
    <ThemeProvider>
      <div className="flex min-h-screen" style={{ background: 'var(--hc-bg)' }}>
        <Sidebar section={section} onNavigate={setSection} collapsed={collapsed} onToggle={() => setCollapsed(v => !v)} />
        <main className="flex-1 overflow-auto">
          {section === 'dashboard' && <ErrorBoundary key="dashboard"><DashboardPage /></ErrorBoundary>}
          {section === 'timeline'  && <ErrorBoundary key="timeline"><TimelinePage /></ErrorBoundary>}
          {section === 'devices'   && <ErrorBoundary key="devices"><DevicesPage /></ErrorBoundary>}
          {section === 'alerts'    && <ErrorBoundary key="alerts"><AlertsPage /></ErrorBoundary>}
          {section === 'settings'  && <ErrorBoundary key="settings"><SettingsPage /></ErrorBoundary>}
        </main>
      </div>
    </ThemeProvider>
  );
}
```

### Pattern 2: CSS Custom Properties — Extend, Don't Replace

**What:** The existing `--hc-*` CSS custom property system already covers light/dark theme and 8-skin accent colors. The new design adds sidebar-specific tokens (`--hc-sidebar-bg`, `--hc-sidebar-item-active`, width variables) but does NOT replace the existing system.

**When to use:** All 8 chart components pass `var(--hc-chart-tick)`, `var(--hc-chart-grid)`, `var(--hc-tooltip-bg)` directly as Recharts style strings. `useAccentRgb()` reads `--hc-accent-rgb` from `getComputedStyle`. Moving theme to a JavaScript system (next-themes, CSS-in-JS) would require touching every chart component.

**Trade-offs:** Staying in CSS vars means charts remain theme-aware with zero changes. The new design is constrained to using these token names or extending them — cannot do arbitrary semantic color scales. For a self-hosted dashboard with a focused scope, this is the right trade-off.

**Example additions to index.css:**
```css
:root {
  /* Sidebar layout */
  --hc-sidebar-width-open: 220px;
  --hc-sidebar-width-collapsed: 56px;
  --hc-sidebar-bg: var(--hc-panel);
  --hc-sidebar-border: var(--hc-panel-border);
  --hc-sidebar-item-hover: var(--hc-panel-soft);
  --hc-sidebar-item-active-bg: var(--hc-accent-soft);
  --hc-sidebar-item-active-text: var(--hc-accent-strong);
}
/* No dark-mode overrides needed — sidebar vars already delegate to existing --hc-panel tokens */
```

### Pattern 3: ThemeProvider Context — Eliminate Prop Drilling

**What:** Currently `useTheme()` and `useSkin()` are called in App.jsx, with results used only locally. A new `ThemeProvider` wraps the app and provides `{ resolvedTheme, preference, setPreference, skin, setSkin }` via context so Sidebar can access them without App.jsx passing 5+ props down.

**When to use:** The Sidebar needs to render theme/skin controls (the current FAB behavior moves into the sidebar footer). Without context, App.jsx would need to prop-drill theme state through `Sidebar` to `SidebarFooter`.

**Trade-offs:** Minimal complexity — a single `createContext` + `useContext`. The existing `useTheme` and `useSkin` hooks remain completely unchanged; `ThemeProvider` just calls them and exposes the values.

**Example:**
```jsx
// contexts/ThemeContext.jsx
const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const { preference, resolvedTheme, setPreference } = useTheme();
  const { skin, setSkin } = useSkin();
  return (
    <ThemeContext.Provider value={{ preference, resolvedTheme, setPreference, skin, setSkin }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useThemeContext = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeContext must be used within ThemeProvider');
  return ctx;
};
```

### Pattern 4: Recharts — Improve Styling Before Considering a Swap

**What:** All 8 chart components use Recharts with `--hc-*` CSS variable references. They already support gradient fills (TrendChart uses `<linearGradient>`) and smooth curves (`type="monotone"`).

**When to use:** Evaluate whether improved gradient colors, updated area opacity, and better axis styling on existing Recharts components satisfy the visual goal before committing to a library migration.

**Trade-offs:** Staying with Recharts avoids rewriting all 8 chart components and re-verifying theme integration. A library swap (Nivo, Tremor charts, or Victory) would require touching every chart and all of their `--hc-*` color references. If a swap is needed, it must be done chart-by-chart — never all at once.

**Recommendation:** Default to improving Recharts styling in Phase 5. The specific charts most likely to expose Recharts limitations are the heatmaps (HeatmapGrid, HeatmapLane, WeekdayHeatmap) — these use custom SVG cells rather than Recharts primitives and may benefit from a D3-based approach if the redesign calls for significantly richer heatmap visuals.

### Pattern 5: Navigation State Without a Router

**What:** Sidebar section state lives in `useSidebarState.js` (localStorage-backed local React state). App.jsx already uses `window.history.pushState` + `popstate` for the AccessoryDetail back-navigation; this is preserved inside `DevicesPage.jsx`.

**When to use:** The codebase has no URL router, and adding one would require updating every `setTab()` call, every history reference, and Vite dev server proxy config. For a self-hosted single-user dashboard, URL-based deep linking to sections is not a user need.

**Trade-offs:** No direct URL linking to a specific section. Acceptable given the use case.

**Example:**
```js
// hooks/useSidebarState.js
const SECTION_KEY = 'hc_active_section';
const COLLAPSE_KEY = 'hc_sidebar_collapsed';
const VALID = ['dashboard', 'timeline', 'devices', 'alerts', 'settings'];

export function useSidebarState() {
  const [section, setSection] = useState(() => {
    try {
      const v = localStorage.getItem(SECTION_KEY);
      return VALID.includes(v) ? v : 'dashboard';
    } catch { return 'dashboard'; }
  });
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === 'true'; }
    catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem(SECTION_KEY, section); } catch { /* ignore */ }
  }, [section]);

  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, String(collapsed)); } catch { /* ignore */ }
  }, [collapsed]);

  return { section, setSection, collapsed, setCollapsed };
}
```

## Data Flow

### Navigation Flow (New)

```
User clicks sidebar item
    ↓
Sidebar.jsx calls onNavigate(section)
    ↓
App.jsx: setSection(section) [from useSidebarState]
    ↓
Conditional render: {section === 'dashboard' && <DashboardPage />}
    ↓
DashboardPage renders existing chart/widget components unchanged
```

### Accessory Drill-Down (Existing — Preserved in DevicesPage)

```
DevicesPage → AccessoryList → onSelectAccessory(id)
    ↓
DevicesPage: setSelectedId(id) + history.pushState
    ↓
DevicesPage renders <AccessoryDetail accessoryId={id} onBack={...} />
    ↓
popstate event → DevicesPage clears selectedId
```

### Theme/Skin Data Flow (Refactored)

```
ThemeProvider (wraps App.jsx)
  calls useTheme() + useSkin() — hooks unchanged
  provides via ThemeContext
Sidebar.jsx: useThemeContext() → renders theme toggle + skin picker
Charts: read --hc-* CSS vars directly via Recharts style strings (no JS bridge)
```

### Cross-Tab Navigation (Preserved)

```
AnomalyPanel / QuietHoursPanel → props callback onNavigate('timeline', filters)
    ↓
DashboardPage passes callback up to App.jsx (or uses ThemeContext alternative)
    ↓
App.jsx: setSection('timeline') + passes filters to TimelinePage
```

Note: The `handleToastNavigateToAccessory` and `handleSelectRoom` callbacks in App.jsx need to survive the extraction. These are cross-page navigation callbacks that App.jsx owns because it controls active section. They should stay in App.jsx and be passed as props to DashboardPage.

### API Data Flow (Unchanged)

```
Page component renders
    ↓
useXxx() TanStack Query hook (zero changes)
    ↓
fetchJson('/api/...') → listener REST API → PostgreSQL
    ↓
Component renders with data, skeleton on load, error state on failure
```

## Integration Points — New vs Modified

### New Components

| Component | File | What It Owns |
|-----------|------|--------------|
| `Sidebar` | `components/layout/Sidebar.jsx` | Vertical nav, collapse toggle, theme controls at footer |
| `SidebarItem` | `components/layout/SidebarItem.jsx` | One nav item: icon + label + active highlight |
| `ThemeProvider` | `contexts/ThemeContext.jsx` | Wraps app; exposes theme + skin state via context |
| `useSidebarState` | `hooks/useSidebarState.js` | Collapse state + active section + localStorage |

### Extracted Components (logic unchanged, location changes)

| Component | Extracted From | Key State It Takes With It |
|-----------|---------------|---------------------------|
| `DashboardPage` | App.jsx (lines ~306–400) | `dashboardDays`, `syncDashboardRanges`; receives `onNavigateToTimeline`, `onSelectAccessory` as props |
| `TimelinePage` | App.jsx (line ~304) | `timelineInitialFilters` (received as prop from App.jsx) |
| `DevicesPage` | App.jsx (lines ~402–408) | `selectedAccessoryId` local state + `history.pushState` popstate logic |

### Split Components (from Setup.jsx)

| Component | Split From | Content |
|-----------|------------|---------|
| `AlertsPage` | `Setup.jsx` / `components/setup/` | Alert rule CRUD — uses existing alert hooks |
| `SettingsPage` | `Setup.jsx` / `components/setup/` | Retention, repair scheduler, API config, HAP pairing |

### Modified Files

| File | Change |
|------|--------|
| `App.jsx` | Full replacement: thin shell (~80 lines) using new layout components |
| `index.css` | Add `--hc-sidebar-*` tokens; remove FAB skin-picker CSS rules |

### Unchanged Files (verified by inspection)

All hook files, all chart components, all existing page-content components, `main.jsx`, `lib/api.js`, `lib/episodes.js`, `lib/queryKeys.js` — zero changes needed.

## Build Order

The following phase sequence respects component dependencies and delivers an incrementally testable result at each step.

**Phase 1 — Shell and Navigation Foundation**
Deliverable: sidebar renders, navigation works, all existing content still functions.
- Create `useSidebarState.js` (section + collapse + localStorage)
- Create `Sidebar.jsx` + `SidebarItem.jsx` (5 nav items, static)
- Replace App.jsx shell with sidebar + content area layout
- Add `--hc-sidebar-*` CSS tokens to index.css
- Keep theme/skin FAB in place temporarily (remove in Phase 2)

**Phase 2 — ThemeProvider + Theme Controls in Sidebar**
Deliverable: theme/skin switching works from sidebar footer; FAB removed.
- Create `contexts/ThemeContext.jsx`
- Wire theme toggle + skin swatch row into Sidebar footer
- Remove floating FAB from App.jsx and its associated CSS from index.css

**Phase 3 — Page Extraction**
Deliverable: App.jsx is a thin shell; each nav section is its own component.
- Extract `DashboardPage.jsx` from App.jsx dashboard block
- Extract `TimelinePage.jsx` from App.jsx timeline block
- Extract `DevicesPage.jsx` from App.jsx accessories block + history state
- Split `AlertsPage.jsx` from Setup.jsx alert section
- Split `SettingsPage.jsx` from Setup.jsx settings section
- App.jsx contains only layout, provider, and conditional render

**Phase 4 — New Dashboard Widgets**
Deliverable: richer dashboard with health KPIs, live feed, room breakdown.
- Add `KpiCards.jsx`: online/offline/stale device counts (uses existing `useAccessories`)
- Add `LiveFeed.jsx`: scrollable recent events widget (uses existing `useEvents`)
- Room-by-room breakdown (uses existing `useRoomStats` + `RoomChart`)
- Slot new widgets into `DashboardPage.jsx` alongside existing charts

**Phase 5 — Chart Styling Improvements**
Deliverable: modern-looking charts; Recharts-first, library swap only if needed.
- Improve gradient fills and stroke weights on TrendChart, ActivityChart
- Evaluate heatmap components — if Recharts is insufficient, replace heatmaps only
- Any library swap is scoped to one component at a time with visual verification

**Phase 6 — Responsive Sidebar**
Deliverable: fully responsive layout; sidebar collapses to icon-only on narrow viewports.
- Add viewport breakpoint logic (auto-collapse below ~768px)
- Remove old `isBottomNav` / `isStandalonePwa` PWA bottom-nav logic
- Verify PWA standalone mode still works with sidebar layout

## Anti-Patterns

### Anti-Pattern 1: Big-Bang Rewrite

**What people do:** Rewrite App.jsx, all chart components, and the theme system simultaneously.

**Why it's wrong:** App.jsx contains 7+ distinct concerns (navigation, scroll effects, changelog, toast config, live events, history, dashboard content). Attempting to change all at once makes it impossible to isolate regressions. Existing charts are theme-correct today — touching them unnecessarily risks introducing dark mode regressions.

**Do this instead:** Phase 1 changes only the shell. Existing page content is extracted unchanged in Phase 3. Chart styling is last (Phase 5) because it has no dependencies on the layout work.

### Anti-Pattern 2: Adding React Router

**What people do:** Add `react-router-dom` to enable URL-based navigation.

**Why it's wrong:** The codebase has no router. Adding one requires updating every navigation call, every history reference, and the Vite dev server proxy configuration. It is a large migration surface with no user-visible benefit for a self-hosted dashboard.

**Do this instead:** Use `useSidebarState.js` with localStorage. The only deep-link case (accessory detail) already works via `history.pushState` and should stay that way.

### Anti-Pattern 3: Replacing the CSS Custom Property System

**What people do:** Introduce a JavaScript theme object or CSS-in-JS to replace `--hc-*` CSS variables.

**Why it's wrong:** All 8 chart components pass `var(--hc-chart-grid)`, `var(--hc-tooltip-bg)` etc. as Recharts style strings. `useAccentRgb()` reads `--hc-accent-rgb` via `getComputedStyle`. A JavaScript theme system would require touching every chart component and every CSS var reference.

**Do this instead:** Extend the existing CSS var system with sidebar-specific tokens. The `html.theme-dark` class-toggle approach continues to work unchanged.

### Anti-Pattern 4: Swapping All Charts at Once

**What people do:** Replace Recharts with a different library for all 8 chart components in a single phase.

**Why it's wrong:** All charts share the `--hc-*` CSS var integration pattern and `useAccentRgb()`. Replacing them all at once means 8 simultaneous regressions to debug with no ability to bisect.

**Do this instead:** Improve Recharts styling first. If a library swap is needed for specific chart types, do one component at a time and verify theme integration before proceeding to the next.

### Anti-Pattern 5: Moving ManageTab State Without Tracing Dependencies

**What people do:** Delete `Setup.jsx` and redistribute its markup without checking shared state.

**Why it's wrong:** `Setup.jsx` is large and contains alert rules, retention config, repair scheduler, and HAP pairing flows. Some subsections share toast notification patterns. Blindly splitting breaks save/error flow without obvious error messages.

**Do this instead:** In Phase 3, create `AlertsPage.jsx` and `SettingsPage.jsx` as thin wrappers that import subsection components from the existing `components/setup/` directory. Move markup only when the internal boundaries are clearly understood.

## Scaling Considerations

This is a self-hosted single-user SPA. Scaling concerns are about code maintainability.

| Concern | At v1.2 | If Grows Beyond |
|---------|---------|-----------------|
| Sidebar nav items | 5 items — fine as static array in Sidebar.jsx | If > 8 items, move to a nav config object |
| CSS token count | ~25 vars + ~6 new sidebar vars | If > 60 tokens, extract to a `tokens.css` file |
| Dashboard widget count | 8–10 widgets | If > 12 or user-reorderable, introduce a grid layout system |
| Chart library | Recharts — per-component upgrade path | Library swap safe if done one component at a time |
| Page component count | 5 pages | If > 10 sections, add a `routes` config array + dynamic render |

## Sources

- Direct inspection: `web/src/App.jsx` (535 lines) — all current state inventoried
- Direct inspection: `web/src/index.css` — CSS custom property system and skin/theme class approach confirmed
- Direct inspection: `web/src/hooks/useTheme.js`, `useSkin.js`, `useAccentRgb.js` — hook-local state, no context
- Direct inspection: `web/src/components/ActivityChart.jsx`, `TrendChart.jsx` — Recharts CSS var usage confirmed
- Direct inspection: `web/src/main.jsx` — provider tree: QueryClientProvider → ToastProvider → App
- Direct inspection: `web/package.json` — Recharts 2.12.7, no existing router, no chart alternatives installed
- Direct inspection: `web/src/hooks/useEvents.js` — all data hooks confirmed stable; zero changes required
- `.planning/PROJECT.md` — milestone scope, constraints, and target features confirmed

---
*Architecture research for: HomeChronicle v1.2 UI Redesign*
*Researched: 2026-04-14*
