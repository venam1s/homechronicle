# Stack Research — UI Redesign (v1.2)

**Domain:** React SPA UI overhaul (charts, sidebar nav, theming, dashboard layout)
**Researched:** 2026-04-14
**Confidence:** HIGH for charting and theming (verified official sources); MEDIUM for sidebar (shadcn copy-paste pattern, Vite-specific state persistence needs validation)

---

## Existing Stack (Untouched — Do Not Re-research)

| Technology | Version | Role |
|------------|---------|------|
| React | 19.2.x | UI framework |
| Vite | 8.x | Dev server + bundler |
| Tailwind CSS | 4.2.x | Utility CSS |
| TanStack Query | 5.51.x | Data fetching |
| Lucide React | 0.408.x | Icons |
| Recharts | 2.12.x | Charts (current, needs upgrade) |

---

## New Capabilities Required

Three distinct areas need new or upgraded packages: charting, sidebar navigation, and theming. The backend is untouched.

---

## Domain 1: Charting Library

### Recommendation: Upgrade Recharts 2.x → 3.x. Do NOT switch libraries.

**Version:** recharts ^3.8.1 (latest as of April 2026; was 2.12.7 in project)
**Install:** `npm install recharts@^3`

#### Why stay with Recharts

The case for switching is weaker than it appears. Recharts v3 now delivers gradient fills, smooth curves (`type="natural"` via D3 curve interpolation), CSS variable colors for dark mode, SVG drop shadows, and tooltip customization. The shadcn/ui chart component — the de facto standard for Tailwind-based dashboards in 2026 — is built on Recharts v3 and provides pre-styled, copy-paste chart components.

Recharts is already in the project. Switching to ApexCharts or Nivo would add ~130KB+ to the bundle while introducing new APIs that don't integrate with shadcn/ui's chart layer.

**Confidence:** HIGH — verified against recharts GitHub releases (3.8.1 published April 2026), shadcn/ui chart docs (explicitly states "Chart component now uses Recharts v3"), bundlephobia references.

#### Charting library comparison

| Criterion | Recharts v3 | ApexCharts v4 | Nivo | Chart.js |
|-----------|-------------|---------------|------|----------|
| React 19 support | YES (3.x series) | YES (react-apexcharts 2.1.0) | YES (issue #2618 closed) | YES (via react-chartjs-2) |
| Bundle size (gzip) | ~130KB incl. D3 | ~131KB (apexcharts alone) | ~150KB+ | ~60KB (canvas-only) |
| Rendering | SVG | SVG | SVG / Canvas / HTML | Canvas |
| Gradient fills | YES (SVG linearGradient) | YES (built-in) | YES | YES |
| Smooth curves | YES (D3 curve types) | YES | YES | YES |
| CSS variable theming | YES (fill="url()" + CSS vars) | Partial (JS config) | Partial | NO |
| shadcn/ui integration | NATIVE (built on Recharts) | NO | NO | NO |
| Tree-shaking | YES (D3 submodules) | YES (v5.10.1+ /core export) | NO (monolithic) | YES |
| Already in project | YES | NO | NO | NO |

**Why not ApexCharts:** Bundle size is equivalent to Recharts but adds a second charting dependency. react-apexcharts v2.1.0 is maintained (published March 2026) but React 19 peer dependency compatibility was not explicitly confirmed in official documentation. Theming uses a JS config object rather than CSS variables, which fights the Tailwind v4 CSS-variable approach.

**Why not Nivo:** React 19 support was added (issue #2618 resolved) but required `--legacy-peer-deps` historically. Larger bundle. No shadcn/ui integration. Multiple render modes (SVG/Canvas/HTML) add complexity without clear benefit for this use case.

**Why not Chart.js:** Canvas-based. Smallest bundle at ~60KB but CSS variable theming is not native and dark mode integration is manual. Better for very large datasets (10K+ data points) — not a concern for HomeChronicle's device event volumes.

#### Recharts v3 upgrade notes

The project currently uses `recharts: ^2.12.7`. v3 has breaking changes: chart composition API is the same but some prop names changed. The `react-is` package may need a version override to match React 19.

```bash
# web/package.json overrides block (if react-is conflict occurs)
"overrides": {
  "react-is": "^19.0.0"
}
```

Gradient fill pattern for area charts (stays the same between v2 and v3):

```jsx
<defs>
  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
    <stop offset="5%" stopColor="var(--hc-accent)" stopOpacity={0.4} />
    <stop offset="95%" stopColor="var(--hc-accent)" stopOpacity={0} />
  </linearGradient>
</defs>
<Area type="natural" fill="url(#colorValue)" stroke="var(--hc-accent)" />
```

---

## Domain 2: Sidebar Navigation

### Recommendation: shadcn/ui Sidebar — copy-paste source files (no shadcn CLI needed)

**Pattern:** Copy-paste component source into `web/src/components/sidebar/`
**Radix UI packages to install:** listed below

The shadcn/ui Sidebar component is the right choice. It is not an npm package — it is a set of source files you copy into your project. It supports React 19 + Tailwind v4 natively (shadcn confirmed "It's here!" for both in their 2026 docs). It provides 16 sidebar variants including the exact `collapsible="icon"` mode (expanded ↔ icon-only) required by the PROJECT.md spec.

**Confidence:** MEDIUM — shadcn/ui Tailwind v4 + React 19 support is confirmed. Vite-specific sidebar state persistence via localStorage (not cookies, which require Next.js server context) needs implementation care.

#### Required Radix UI packages

The shadcn Sidebar component pulls in these Radix UI primitives:

```bash
# Install in web/
npm install @radix-ui/react-slot @radix-ui/react-separator @radix-ui/react-dialog @radix-ui/react-tooltip @radix-ui/react-collapsible
```

Additionally needed for the full sidebar pattern:

```bash
npm install class-variance-authority
```

Note: `lucide-react` is already installed. `clsx` is already installed.

#### Sidebar state persistence (Vite, no Next.js)

The official shadcn docs use `next/headers` cookies for SSR sidebar state persistence. In a Vite SPA, use `localStorage` instead:

```jsx
// web/src/components/sidebar/sidebar-provider.jsx
const STORAGE_KEY = 'hc-sidebar-open';

function SidebarProvider({ children, defaultOpen = true }) {
  const [open, setOpen] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored !== null ? stored === 'true' : defaultOpen;
  });

  const toggle = () => {
    setOpen(prev => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  return (
    <SidebarContext.Provider value={{ open, toggle }}>
      {children}
    </SidebarContext.Provider>
  );
}
```

#### Collapsible icon mode

When `open === false`, sidebar items should show only their Lucide icon with a `<Tooltip>` providing the label. This uses `group-data-[collapsible=icon]:hidden` Tailwind classes on text spans and `group-data-[collapsible=icon]:flex` on icon wrappers — the exact pattern shadcn uses internally.

#### Alternatives not chosen

| Option | Why Not |
|--------|---------|
| Build sidebar from scratch | More work, no accessibility primitives built-in, reinvents what shadcn already solved |
| Headless UI sidebar | Headless UI v2 doesn't have a sidebar primitive; only Dialog/Popover/etc. |
| Flowbite React | Additional component library dependency; integrates less cleanly with Tailwind v4 CSS-first config |
| react-pro-sidebar | npm package, not copy-paste; adds bundle weight; not Tailwind v4 native |

---

## Domain 3: Theming System

### Recommendation: Native Tailwind v4 CSS custom properties — no additional library

**Pattern:** `@theme inline` directive + `[data-theme="dark"]` CSS selector overrides
**No new npm packages required**

The existing 8-skin system uses CSS custom properties (`--hc-accent-rgb`, `--hc-panel-mid`, etc.) set via JavaScript. Replace this with a Tailwind v4-native pattern that: (1) defines semantic color tokens in `@theme inline`, (2) overrides those tokens under `[data-theme="dark"]`, and (3) toggles `data-theme` on `<html>` via a simple React context.

**Confidence:** HIGH — pattern verified against official Tailwind v4 theme docs, GitHub discussion #18471 (Tailwind team's own recommended approach), and shadcn/ui v4 theming docs.

#### How it works in Tailwind v4

```css
/* web/src/index.css */
@import "tailwindcss";

/* Step 1: Define semantic tokens that generate utility classes */
@theme inline {
  --color-surface:     var(--hc-surface);
  --color-surface-mid: var(--hc-surface-mid);
  --color-surface-low: var(--hc-surface-low);
  --color-text:        var(--hc-text);
  --color-text-muted:  var(--hc-text-muted);
  --color-accent:      var(--hc-accent);
  --color-accent-soft: var(--hc-accent-soft);
  --color-border:      var(--hc-border);
}

/* Step 2: Light theme default values */
:root {
  --hc-surface:     oklch(0.98 0.005 240);
  --hc-surface-mid: oklch(0.95 0.008 240);
  --hc-surface-low: oklch(0.92 0.010 240);
  --hc-text:        oklch(0.18 0.020 240);
  --hc-text-muted:  oklch(0.50 0.015 240);
  --hc-accent:      oklch(0.60 0.18 240);
  --hc-accent-soft: oklch(0.85 0.08 240);
  --hc-border:      oklch(0.88 0.008 240);
}

/* Step 3: Dark theme overrides — just replace the values */
[data-theme="dark"] {
  --hc-surface:     oklch(0.14 0.010 240);
  --hc-surface-mid: oklch(0.18 0.012 240);
  --hc-surface-low: oklch(0.22 0.014 240);
  --hc-text:        oklch(0.95 0.008 240);
  --hc-text-muted:  oklch(0.65 0.012 240);
  --hc-accent:      oklch(0.72 0.18 240);
  --hc-accent-soft: oklch(0.30 0.10 240);
  --hc-border:      oklch(0.28 0.012 240);
}
```

The `@theme inline` directive is key: it tells Tailwind to generate `bg-surface`, `text-text-muted`, `border-border`, etc. as utility classes that reference the CSS variables. No rebuild needed when the theme switches — the variables change at runtime.

#### React ThemeProvider

```jsx
// web/src/components/theme-provider.jsx
import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext(null);
const STORAGE_KEY = 'hc-theme';

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
```

#### Why not next-themes

`next-themes` is a Next.js-specific package. The project's existing `useSkin()` hook already handles localStorage theme state. The Tailwind v4 CSS variable approach means no third-party theme library is needed — the pattern is 30 lines of React context.

#### Why not the 8-skin system

The 8-skin system sets many CSS variables via inline JavaScript and requires maintaining skin definitions in a JS config. With Tailwind v4's `@theme inline`, the color system lives entirely in CSS. Two polished modes (light + dark) replace eight mediocre skins. This reduces the CSS variable surface from ~40 variables per skin × 8 skins to ~8 semantic tokens × 2 themes.

---

## Domain 4: Card Layout and Dashboard Widgets

### Recommendation: Tailwind v4 utilities only — no component library

KPI stat cards, activity feeds, and room breakdown widgets are standard card layouts. Tailwind v4 provides everything needed: `rounded-xl`, `shadow-sm`, `bg-surface`, `border-border`. No additional component library (MUI, Mantine, Ant Design) should be introduced.

The card pattern:

```jsx
// Standard card wrapper
<div className="rounded-xl bg-surface border border-border shadow-sm p-4">
  {children}
</div>
```

KPI stat cards (online/offline/stale counts) are simple number + label + trend indicator. These require no charting library — just Tailwind and Lucide icons.

**What NOT to add:** MUI, Mantine, Ant Design, Chakra UI, Radix Themes. These bring their own CSS-in-JS or component systems that conflict with Tailwind v4's utility approach. The project is already Tailwind-native; adding a component library introduces a parallel styling system.

---

## Consolidated Install

```bash
# From web/
npm install recharts@^3

# Radix UI primitives for sidebar (5 packages)
npm install @radix-ui/react-slot @radix-ui/react-separator @radix-ui/react-dialog @radix-ui/react-tooltip @radix-ui/react-collapsible

# CVA for sidebar variant logic
npm install class-variance-authority
```

That is the complete set of new npm installs. Theming and card layout require zero new packages.

---

## Version Compatibility

| Package | Version | React 19 | Tailwind v4 | Notes |
|---------|---------|-----------|-------------|-------|
| recharts | ^3.8.1 | YES | YES (CSS vars) | May need `overrides.react-is: ^19.0.0` if peer dep conflict |
| @radix-ui/react-collapsible | ^1.1.x | YES | YES | Latest: 1.1.12 (Aug 2025) |
| @radix-ui/react-tooltip | ^1.x | YES | YES | Peer dep on radix-ui/react-popper |
| @radix-ui/react-dialog | ^1.x | YES | YES | Used for mobile overlay sidebar |
| @radix-ui/react-slot | ^1.x | YES | YES | Used for asChild prop pattern |
| @radix-ui/react-separator | ^1.x | YES | YES | Used for sidebar dividers |
| class-variance-authority | ^0.7.x | YES | YES | Framework-agnostic, no peer deps |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| ApexCharts / react-apexcharts | Same bundle size as Recharts v3, no shadcn integration, JS-config theming conflicts with CSS var approach | Recharts v3 |
| Nivo | Larger bundle, historically needs `--legacy-peer-deps` for React 19, no shadcn integration | Recharts v3 |
| next-themes | Next.js-specific; SPA doesn't need SSR theme flash prevention | Custom React context + localStorage (30 lines) |
| shadcn CLI (`npx shadcn init`) | Designed for TypeScript projects; generates config HomeChronicle doesn't use (components.json, path aliases). Copy-paste the sidebar source files directly | Manual copy-paste of sidebar/ source |
| MUI / Mantine / Ant Design | Parallel styling system; conflicts with Tailwind v4 | Tailwind utilities |
| react-pro-sidebar / other sidebar npm packages | Bundle weight, not Tailwind v4 native | shadcn sidebar copy-paste |
| Chart.js | Canvas rendering; no CSS variable theming; worse DX for composable React charts | Recharts v3 |

---

## Sources

- Recharts GitHub releases — 3.8.1 current as of April 2026: https://github.com/recharts/recharts/releases
- shadcn/ui chart docs — "chart component now uses Recharts v3": https://ui.shadcn.com/docs/components/radix/chart
- shadcn/ui Tailwind v4 + React 19 support confirmation: https://ui.shadcn.com/docs/tailwind-v4
- shadcn/ui sidebar blocks (16 variants, icon collapse confirmed): https://ui.shadcn.com/blocks/sidebar
- Tailwind v4 @theme directive official docs: https://tailwindcss.com/docs/theme
- Tailwind v4 theming best practices (official team discussion): https://github.com/tailwindlabs/tailwindcss/discussions/18471
- Nivo React 19 support (issue closed): https://github.com/plouc/nivo/issues/2618
- ApexCharts react-apexcharts npm (v2.1.0, March 2026): https://www.npmjs.com/package/react-apexcharts
- LogRocket React chart libraries comparison 2025: https://blog.logrocket.com/best-react-chart-libraries-2025/
- shadcn sidebar Vite + localStorage pattern (community): https://adiletsatylganov.medium.com/how-to-keep-shadcn-sidebar-state-when-reloading-a-page-client-side-90310a146fe0

---
*Stack research for: HomeChronicle v1.2 UI Redesign*
*Researched: 2026-04-14*
