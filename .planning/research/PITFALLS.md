# Pitfalls Research

**Domain:** React 19 + Tailwind v4 dashboard UI redesign — sidebar navigation, theming migration, chart library swap
**Project:** HomeChronicle v1.2 UI Redesign
**Researched:** 2026-04-14
**Confidence:** HIGH (codebase-verified; pitfalls grounded in actual code patterns found in web/src/)

---

## Critical Pitfalls

Mistakes that require rewrites, break dark mode across the app, or create inaccessible navigation.

---

### Pitfall 1: Hardcoded Tailwind `dark:` Variants Survive the Theming Migration and Break New Theme

**What goes wrong:**
The new theming system replaces the 8-skin system's CSS custom properties (`--hc-accent-rgb`, `--hc-panel`, etc.) with a new design token structure. But 339 `dark:text-*`, `dark:bg-*`, `dark:border-*` class instances are spread across 30+ components. These classes are driven by Tailwind's `dark:` variant, which in this codebase is defined as `(&:where(.theme-dark, .theme-dark *))` in `index.css`. Migrating the CSS token layer does not touch these hardcoded Tailwind classes. The result: components that mix both systems produce inconsistent dark mode — some surfaces follow the new token, others follow hardcoded `gray-800` / `gray-900` values that do not map to the new palette.

**Why it happens:**
The current codebase uses a hybrid: custom properties for accent/panel/border colors and Tailwind semantic colors (`gray-*`, `slate-*`) for component-local styling. Developers doing the theming migration focus on `index.css` and the `--hc-*` tokens but miss the 573 hardcoded Tailwind color instances inside component JSX.

**How to avoid:**
- Before touching any theme tokens, audit all `dark:` classes: `grep -r "dark:text-\|dark:bg-\|dark:border-" web/src/components/` — currently 339 instances.
- Establish a rule before the first redesign commit: all colors must be expressed via `--hc-*` custom properties or the new token layer, not hardcoded Tailwind semantic classes. Replace `dark:bg-gray-800` with `bg-[var(--hc-panel)]`.
- Migrate the token layer and one component fully as a template before touching the rest. Verify both light and dark modes before proceeding.

**Warning signs:**
- New component uses `dark:bg-gray-900` alongside `bg-[var(--hc-panel)]` in the same file.
- After theming phase, `grep -r "dark:bg-gray\|dark:text-gray" web/src/` returns more than a handful of banner/badge-specific results.
- Light mode looks correct but dark mode has gray blobs at inconsistent lightness levels.

**Phase to address:** Theming Migration phase (must precede all visual component work)

---

### Pitfall 2: Recharts SVG Gradients and `useAccentRgb` Break When Skin System Is Removed

**What goes wrong:**
Recharts gradient fills (`<defs><linearGradient>`) pass colors as SVG `stopColor` attributes using the pattern `rgb(var(--hc-accent-rgb))`. The `useAccentRgb()` hook reads `--hc-accent-rgb` from `document.documentElement` via `getComputedStyle`. If the new theming system removes or renames this variable and the chart components are not updated simultaneously, every gradient in every chart renders transparent or with a stale color. `AccessoryDetail.jsx`, `TrendChart.jsx`, `ActivityChart.jsx`, `WeekdayHeatmap.jsx`, and `MonthlyHeatmap.jsx` all use this hook.

Additionally, SVG `stopColor` does not accept CSS `var()` expressions in all browsers — the existing code works by reading the computed value at render time in JavaScript and passing the resolved RGB triplet as a string. This JS-driven approach breaks if the hook runs before the CSS variable is applied (e.g., during SSR or if the skin data-attribute is set asynchronously).

**Why it happens:**
SVG elements live outside the normal CSS cascade for some properties. `stopColor` in particular requires an explicit resolved color, not a `var()` reference. The `useAccentRgb()` hook was built as a workaround, but it tightly couples all chart components to the skin system's `--hc-accent-rgb` variable name.

**How to avoid:**
- If replacing the skin system, keep `--hc-accent-rgb` as an alias in the new token layer, or update all chart components to use the new token name atomically.
- Do not rename the variable without a global search-and-replace across both `index.css` and all JSX files that reference it (currently ~50 locations).
- If switching chart libraries (e.g., from Recharts to ECharts or Nivo), the gradient definition mechanism changes entirely — evaluate the new library's theming story before committing to a migration.

**Warning signs:**
- After a theming commit, charts render without the accent color gradient.
- `useAccentRgb()` returns `[0, 0, 0]` or the fallback value (indicates the CSS variable was not found at read time).
- `getComputedStyle(document.documentElement).getPropertyValue('--hc-accent-rgb')` returns an empty string.

**Phase to address:** Theming Migration phase — audit and migrate `useAccentRgb` usages before removing skin system

---

### Pitfall 3: Top-Tab-to-Sidebar Swap Breaks Navigation State Held in `App.jsx`

**What goes wrong:**
The current app has a single `useState('dashboard')` in `App.jsx` controlling tab selection. Eight other pieces of state (`selectedAccessoryId`, `timelineInitialFilters`, `dashboardDays`, `syncDashboardRanges`, `isSkinPickerOpen`, `scrolled`, `isStandalonePwa`, `isMobileViewport`) all live alongside it. A sidebar-based layout requires extracting navigation into a separate component or hook — but if `setTab` and the cross-tab callbacks (`handleSelectRoom`, `handleToastNavigateToAccessory`, `handleSelectAccessory`) remain in `App.jsx` while the sidebar renders in a child, prop-drilling or context becomes necessary. Developers commonly do a "visual sidebar" swap (style change only) without restructuring state, leaving `App.jsx` at 535 lines doing layout, navigation, theme management, and data routing simultaneously.

**Why it happens:**
The existing `App.jsx` is a monolith that renders both the navigation shell and all tab content. Making it a sidebar visually is a tempting quick win, but the component structure (nav + content in one component) breaks responsive collapse, makes keyboard focus management impossible, and prevents independent testing of the sidebar.

**How to avoid:**
- Extract navigation state to a `useNavigation()` hook before building sidebar components.
- Define `AppLayout.jsx` (sidebar + main content area), `Sidebar.jsx` (nav items, collapse state), and let `App.jsx` become a thin provider.
- Sidebar collapse state belongs in the layout component with CSS-driven transitions, not in global state that triggers full re-renders of dashboard content.
- Test the sidebar in isolation — its only required props should be `activeSection`, `onNavigate`, and `collapsed`.

**Warning signs:**
- Sidebar component receives more than 3 props from `App.jsx` directly.
- `setTab` is passed down 2+ component levels (prop drilling).
- Adding a new nav item requires changes in `App.jsx` instead of only `Sidebar.jsx`.

**Phase to address:** Sidebar Navigation phase (first structural task)

---

### Pitfall 4: Sidebar Width Transition Causes Content Layout Thrash and Chart Re-renders

**What goes wrong:**
Animating sidebar width with `transition: width 0.2s ease` causes the main content area to reflow on every animation frame. Charts built on `ResponsiveContainer` (Recharts) detect the container resize, recalculate SVG dimensions, and re-render on each frame. On a dashboard with 5+ charts, the collapse animation becomes janky (< 30 fps) on low-powered hardware (Raspberry Pi, NAS), which is exactly the target platform.

Additionally, if sidebar width is expressed in pixels (`width: 240px` → `width: 64px`), any component using `position: fixed` (the current FAB, toast stack) must also be updated — fixed elements are relative to the viewport, not the layout grid, so they do not shift automatically.

**Why it happens:**
Width transitions trigger CSS layout recalculation on every frame. `ResponsiveContainer` in Recharts uses a `ResizeObserver` that fires on every pixel change. The cascade: width changes → layout reflows → `ResizeObserver` fires → React re-renders chart → SVG redraws. This compounds for every visible chart.

**How to avoid:**
- Use `transform: translateX()` + `opacity` for the sidebar animation instead of `width`. Keep the sidebar at its full expanded width but transform it off-screen when collapsed, and use a CSS class on the layout grid to adjust the main content margin immediately without animating.
- Alternatively: animate only `opacity`, not width, and toggle a class that changes layout via CSS Grid `grid-template-columns` (instant, not animated) — users do not need an animated width change, they need quick access to nav.
- Set `debounce` on `ResponsiveContainer` resize events if using Recharts, or switch to fixed-dimension SVGs for charts inside panels that sit adjacent to the sidebar.
- The FAB and toast stack must update their `right`/`bottom` positioning when the sidebar state changes — test this explicitly.

**Warning signs:**
- `vite build` profiler shows chart components in the hot path during sidebar interaction.
- Sidebar animation drops below 60fps on a device throttled to 4x CPU slowdown in Chrome DevTools.
- Toast or FAB position overlaps sidebar on narrow viewports after collapse.

**Phase to address:** Sidebar Navigation phase (responsive collapse implementation)

---

### Pitfall 5: Chart Library Swap Introduces 200+ KB of Bundle Bloat

**What goes wrong:**
Recharts + D3 dependencies are currently isolated in a `vendor-charts` chunk (see `vite.config.js` `manualChunks`). If a new chart library is added alongside Recharts during a partial migration — even temporarily — both vendor bundles ship to the client. Recharts + its D3 transitive dependencies are approximately 250 KB gzipped. Adding a second library (ECharts at ~220 KB gzipped, Nivo at ~300 KB) doubles the chart bundle.

Self-hosted users on home networks (RPi serving over LAN) tolerate large bundles but initial loads over WAN (remote access via reverse proxy) are noticeably slow. More importantly, the `vendor-charts` chunk is loaded eagerly on the dashboard tab, not lazily.

**Why it happens:**
Chart migrations are typically done component-by-component. During the transition period, both libraries exist in `package.json`. Developers forget to remove the old library once all components are migrated, or keep one component on the old library "temporarily" that never gets updated.

**How to avoid:**
- Choose a single target chart library before writing any chart code. Do not migrate incrementally across a release boundary.
- Keep the `manualChunks` config in `vite.config.js` explicit — when the old library is removed, the chunk key must be updated to match the new library's package name, otherwise it falls into the main bundle.
- Run `npm run build` and inspect the chunk sizes after every chart library addition. The `dist/` output shows chunk names and sizes.
- If keeping Recharts: the `recharts` v3 migration guide (see Sources) documents breaking API changes from v2 — verify `^2.12.7` compatibility with any new React 19 features used.

**Warning signs:**
- Both `recharts` and a second chart library appear in `web/package.json` `dependencies` after the migration phase ends.
- `vendor-charts` chunk exceeds 400 KB gzipped.
- `vite build` output shows chart library code in `vendor-react` or the main bundle (indicates `manualChunks` pattern did not match the new package name).

**Phase to address:** Chart Library Overhaul phase (complete migration in one phase, do not straddle releases)

---

### Pitfall 6: `localStorage` Key Conflicts Between Old Skin System and New Theming System

**What goes wrong:**
The current skin system stores user preferences under `hc_ui_skin` and `hc_theme_preference`. The new theming system will likely replace the 8-skin concept with a simpler light/dark-only model. If the new code reads `hc_ui_skin` and gets an old skin name (`'ocean'`, `'purple'`, etc.) that no longer maps to a valid theme, it must either fall back gracefully or render incorrectly. Users upgrading from v1.1 to v1.2 will have old skin keys in their browser.

Additionally, the `hc_dashboard_trend_days`, `hc_dashboard_global_days`, `hc_dashboard_sync_ranges` keys are stored per-component. If the new dashboard widgets are restructured (different component names, different storage keys), users lose their saved range preferences silently.

**Why it happens:**
`localStorage` keys are set-and-forget with no versioning or migration. The skin key becomes invalid when the valid skin set changes. No existing code checks for cross-version compatibility.

**How to avoid:**
- When removing the skin system, update `useSkin()` to clear the `hc_ui_skin` key and reset to a new default on first load after the upgrade (check against a new set of valid skin names, fall back to the new default).
- Add a one-time migration constant: if `localStorage.getItem('hc_ui_skin')` is non-null and not in the new valid set, remove it and set the new default.
- If dashboard widget storage keys change, keep the old key as a read-once migration source: read old key, write new key, remove old key.

**Warning signs:**
- After upgrading from v1.1, the skin picker (or its replacement) renders in an error state or shows a blank.
- `useSkin()` `getStoredSkin()` returns the fallback `'ocean'` for all users post-upgrade, even those who had set a different skin.
- Console errors about unknown skin values.

**Phase to address:** Theming Migration phase (include localStorage migration logic in skin system removal)

---

## Technical Debt Patterns

Shortcuts that seem reasonable during a fast redesign but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Keep `App.jsx` as a monolith, just restyle it | No structural change, fast | Sidebar state becomes deeply prop-drilled; impossible to independently test sidebar or layout | Never — extract layout before visual work |
| Add new chart library alongside Recharts during transition | Lower risk during migration | Bundle doubles; `vendor-charts` chunk explodes; Vite `manualChunks` must cover both | Only acceptable within a single phase that ends with Recharts removal |
| Use `dark:bg-gray-*` Tailwind classes instead of `--hc-*` tokens for new components | Faster to write | 339 existing instances + new ones = impossible to audit; theme overhaul requires touching every file again | Never for new components in this milestone |
| Use `width` CSS transitions for sidebar collapse | Easy to implement | Layout thrash, chart re-renders, FAB position bugs on RPi | Never — use `transform` or grid-template-columns toggle |
| Delay accessibility (ARIA, keyboard nav) to a follow-up PR | Faster shipping | Sidebar with no `role="navigation"`, no `aria-current`, no keyboard nav is a regression from current tab nav | Never — bake ARIA into Sidebar.jsx from the start |
| Copy-paste existing component styles into new sidebar/card components | Fast | Style drift within 2 weeks as both sets evolve; inconsistency the new theming was meant to fix | Only during initial prototyping, never in a committed component |

---

## Integration Gotchas

Issues specific to wiring new UI features to this codebase's existing systems.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Sidebar + TanStack Query refetch indicators | Sidebar triggers full page re-render on collapse, causing background queries to show loading spinners momentarily | Sidebar state must not be in `QueryClientProvider`'s ancestor render tree; use a sibling layout context |
| New dashboard widgets + existing hooks | Creating a new `useRoomBreakdown()` hook that issues the same `/api/events/room-stats` query as `RoomChart.jsx` with different query keys, causing duplicate API calls | Reuse existing query keys; widgets should use the same `useQuery({ queryKey: ['stats', ...] })` calls so the cache is shared |
| `useTheme` + new sidebar dark mode toggle | Moving the theme toggle into the sidebar creates a second render path for `applyTheme()` — both the FAB toggle and sidebar toggle must share one `useTheme` instance | `useTheme()` is idempotent (same localStorage key); two consumers is fine, but both must call the same hook — do not fork the logic |
| Responsive sidebar + `isMobileViewport` detection | The existing `isMobileViewport` state in `App.jsx` uses `matchMedia('(max-width: 767px)')` but the new sidebar breakpoint may be different (e.g., 1024px for icon-only mode) | Define sidebar breakpoint as a CSS custom property and use `matchMedia` against the same value; keep `isMobileViewport` for bottom-nav PWA detection separate from `isSidebarCollapsed` |
| New card-based layout + existing `ErrorBoundary` | Current `ErrorBoundary` wraps entire tab content; with card-based layout, one failing widget should not blank the entire dashboard | Wrap each new widget with its own `ErrorBoundary`; the current per-tab boundary is still needed but is no longer sufficient |
| Chart library swap + existing `TOOLTIP_STYLE` pattern | Every chart currently injects `--hc-tooltip-bg`, `--hc-tooltip-text`, `--hc-tooltip-border` via `TOOLTIP_STYLE` constant. New library may have a different tooltip customization API | Audit the new library's tooltip API before migrating; ensure the `--hc-tooltip-*` tokens are preserved or aliased in the new theme layer |

---

## Performance Traps

Patterns that work fine on a dev machine but fail on Raspberry Pi or NAS.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Animating sidebar width with CSS `transition: width` | Janky animation + chart re-renders during collapse | Use CSS transform or grid-template-column toggle; no width animation | Immediately on any device with slow CPU / GPU (RPi 4, older NAS) |
| Multiple `ResponsiveContainer` instances on dashboard | All charts resize simultaneously on any layout change (window resize, sidebar toggle) | Debounce ResizeObserver; use fixed-height charts; consider switching to fixed-dimension SVG for charts in panels | 4+ charts visible simultaneously |
| New widgets issuing independent API calls with unique query keys | Dashboard fires 8+ simultaneous API requests on load | Consolidate query keys; the existing stats hooks cover most data needs | From day one — but noticed only when checking Network tab |
| Lucide icon imports not tree-shaken | Bundle size creep from icon library as more icons are added for sidebar nav | Always import named icons: `import { Home } from 'lucide-react'` — never `import * as Icons` | Subtle; noticed when vendor-react chunk grows unexpectedly |
| `localStorage` sync inside `useEffect` on every render | Each component reads/writes storage on each state update | Guard with previous-value comparison or derive values lazily; the existing `useTheme` and `useSkin` hooks already do this correctly — follow that pattern in new hooks | Not a crash risk, but causes unnecessary storage writes during sidebar expand/collapse cycles |

---

## UX Pitfalls

User experience regressions that are easy to introduce during a visual overhaul.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Active nav item not visually distinguished in sidebar | User cannot tell which section is selected after tab-to-sidebar migration | `aria-current="page"` on active item + distinct background + left-border accent using `--hc-accent-rgb` |
| Sidebar collapses to icon-only but icons have no tooltips | Users cannot identify sections after collapse | Add `title` attribute + CSS tooltip (no library needed) on each icon-only nav item |
| Collapsing sidebar shifts main content instead of overlapping on mobile | Content jumps left/right on narrow screens | On mobile, sidebar should overlay content (position: fixed) rather than pushing it; use a backdrop overlay |
| Removing the 8-skin system without a replacement color preference | Users who had set a non-default skin see only the default after upgrade | Either preserve 1-2 curated accent colors in the new system, or explicitly communicate the removal in the changelog |
| Dark mode not applied before first paint (FOUC) | Brief white flash on dark mode load | Apply theme class synchronously via inline `<script>` in `index.html` or ensure `useTheme` reads localStorage synchronously in initializer (current implementation already does this correctly — preserve this on migration) |
| New card-based layout loses the scroll position between tab/section changes | Users navigating back to Dashboard see it scrolled to the bottom | Scroll-to-top on section change; the current `key={tab}` on the content div resets scroll — preserve this in the sidebar navigation system |

---

## Accessibility Regressions

Specific to this codebase's current state — 74 ARIA attribute usages currently, most in modal/button contexts.

| Regression | Risk | Prevention |
|------------|------|------------|
| `<nav>` landmark not present on sidebar | Screen readers cannot identify the primary navigation region | Wrap `<Sidebar>` in `<nav aria-label="Primary navigation">` |
| Tab navigation replaced with non-keyboard-accessible sidebar buttons | Keyboard users lose ability to navigate sections | Each sidebar item must be a `<button>` or `<a>`; current tab buttons already handle this — do not regress |
| `aria-current="page"` missing on active sidebar item | Screen readers announce all items the same | Set `aria-current="page"` on the active item; remove it from all others on navigation |
| Focus not managed after sidebar expands from icon-only | Focus trapped in icon-only mode or lost on expand | When sidebar expands, move focus to the expanded nav label of the previously active item |
| New widgets added to dashboard without `aria-label` on icon-only stat cards | Screen reader users hear "button" with no context | Every KPI card action/icon needs `aria-label` describing what it represents |
| `ErrorBoundary` fallback has no accessible error announcement | Silently blank panel for screen reader users | Fallback must include a visible, focusable error message with `role="alert"` |

---

## "Looks Done But Isn't" Checklist

Things that appear complete in a browser but are missing critical pieces.

- [ ] **Sidebar navigation:** Verify `aria-current="page"` updates on each section change — not just on initial render
- [ ] **Dark mode:** Run both light and dark against every new component; the existing `@custom-variant dark (&:where(.theme-dark, .theme-dark *))` definition must be preserved or re-declared in the new token layer
- [ ] **Sidebar collapse on mobile:** Test with DevTools device simulation at 375px, 768px, and 1024px — confirm no content hidden behind collapsed sidebar
- [ ] **Chart theming:** Verify `useAccentRgb()` returns correct values after skin system removal; check heatmap cells, trend gradient, and bar fill colors in both light and dark
- [ ] **localStorage migration:** Confirm users with `hc_ui_skin='purple'` do not get a console error or broken UI after upgrade
- [ ] **Fixed-position elements:** Confirm FAB and toast stack are not obscured by sidebar on any viewport width
- [ ] **Bundle size:** Run `npm run build` and verify `vendor-charts` chunk has not grown unexpectedly; if both Recharts and a new library are in package.json, the chunk will be oversized
- [ ] **Error boundaries:** Each new dashboard widget (KPI cards, live feed, room breakdown) has its own `ErrorBoundary` wrapper, not just the tab-level one
- [ ] **Query deduplication:** Open Network tab on dashboard load and count `/api/` requests; there should be no duplicate requests for the same data from new widgets
- [ ] **Skin system removal:** `data-skin` attribute no longer set on `<html>` (or is set to a new valid value); old skin-specific CSS in `index.css` is removed to avoid dead code growing the CSS bundle

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Dark mode broken across 30+ components due to mixed token/Tailwind approach | HIGH | Systematic grep + replace pass; use `sed -i` to convert `dark:bg-gray-*` to `bg-[var(--hc-panel)]` patterns; requires visual QA of every component |
| Chart gradients broke after skin removal | MEDIUM | Re-add `--hc-accent-rgb` as an alias to the new accent token in `index.css`; no component changes needed if alias resolves correctly |
| Bundle doubled due to two chart libraries | LOW | Remove old library from `package.json`, update `vite.config.js` `manualChunks`, run build; no functional changes needed if migration was complete |
| App.jsx sidebar prop-drilling became unmanageable | HIGH | Extract `NavigationContext` (React context), move `activeSection`/`setActiveSection` into it, update all consumers; this is a structural refactor that must happen before adding more nav-adjacent features |
| localStorage skin keys broke for all users on upgrade | LOW | Deploy a patch that checks for old skin keys and migrates/clears them; can be done in `useSkin()` with a version guard constant |
| Sidebar collapse animation causes chart re-renders on RPi | MEDIUM | Switch animation strategy from width-transition to CSS Grid template-columns toggle; targeted change to layout CSS only, no component changes |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Mixed Tailwind `dark:` classes + CSS tokens (Pitfall 1) | Theming Migration | `grep -r "dark:bg-gray\|dark:text-gray" web/src/` returns zero results |
| `useAccentRgb` / SVG gradient break on skin removal (Pitfall 2) | Theming Migration | All charts render correct accent color in light and dark after `data-skin` attribute removed |
| `App.jsx` monolith not restructured before sidebar work (Pitfall 3) | Sidebar Navigation (pre-condition) | Sidebar component has ≤3 props; `setTab` is not passed as a prop |
| Sidebar width transition layout thrash (Pitfall 4) | Sidebar Navigation | Sidebar collapse animation maintains 60fps at 4x CPU throttle in Chrome DevTools; charts do not flicker |
| Bundle bloat from two chart libraries (Pitfall 5) | Chart Library Overhaul | `npm run build` shows only one chart library in `vendor-charts`; chunk ≤ 300 KB gzipped |
| `localStorage` key conflicts on upgrade (Pitfall 6) | Theming Migration | Users with old `hc_ui_skin` key see valid UI after upgrade; no console errors |
| Accessibility regressions in sidebar nav | Sidebar Navigation | Axe DevTools scan returns zero violations on sidebar; keyboard nav moves focus correctly between sections |
| New dashboard widget query duplication | New Widgets phase | Network tab on dashboard load shows no duplicate API calls; new widgets reuse existing query keys |

---

## Sources

- Codebase audit: `web/src/App.jsx` (535 lines), `web/src/index.css` (339 dark: classes, 86 `--hc-*` custom property definitions)
- Codebase audit: `useAccentRgb.js`, `useTheme.js`, `useSkin.js` — skin system implementation
- Codebase audit: `vite.config.js` `manualChunks` — `vendor-charts` chunk pattern
- [Recharts 3.0 migration guide](https://github.com/recharts/recharts/wiki/3.0-migration-guide) — breaking changes from v2.12.x
- [Best React chart libraries 2025 — LogRocket](https://blog.logrocket.com/best-react-chart-libraries-2025/)
- [Tailwind CSS v4 migration guide — official docs](https://tailwindcss.com/docs/upgrade-guide)
- [Tailwind v4: CSS-first config migration — Medium](https://medium.com/better-dev-nextjs-react/tailwind-v4-migration-from-javascript-config-to-css-first-in-2025-ff3f59b215ca)
- [How to and not to build sidebar layouts — Akash Hamirwasia](https://akashhamirwasia.com/blog/how-to-and-not-to-build-sidebar-layouts/)
- [Preventing layout shift from scrollbars — DEV Community](https://dev.to/rashidshamloo/preventing-the-layout-shift-caused-by-scrollbars-2flp)
- [Dynamic SVGs in light and dark mode — Jonathan Harrell](https://www.jonathanharrell.com/blog/light-dark-mode-svgs)
- [React accessibility best practices — AllAccessible](https://www.allaccessible.org/blog/react-accessibility-best-practices-guide)
- [WAI-ARIA keyboard interface practices — W3C](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/)

---
*Pitfalls research for: HomeChronicle v1.2 UI Redesign (React 19 + Tailwind v4)*
*Researched: 2026-04-14*
