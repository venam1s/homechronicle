# Phase 11 — UI Review

**Audited:** 2026-04-14
**Baseline:** UI-SPEC.md (11-UI-SPEC.md — approved design contract)
**Screenshots:** Captured (desktop 1440x900, mobile 375x812 from localhost:5174)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | "What's new" trigger not present; version string displayed raw instead of `v{version}` format |
| 2. Visuals | 4/4 | Sidebar structure, active state pill, edge handle, BrandLogo variants all match spec |
| 3. Color | 3/4 | `text-green-600`, `text-amber-500`, `bg-amber-500` bypass design tokens for update/badge states |
| 4. Typography | 4/4 | Exactly 2 CSS weights (font-semibold, font-medium) and 2 sizes (text-sm, text-xs) in sidebar |
| 5. Spacing | 4/4 | All spacing uses Tailwind scale multiples; h-[40px] and min-w-[160px] are spec-mandated exceptions |
| 6. Experience Design | 3/4 | No `aria-label` on update badge dot; ThemeIcon renders Sun for system preference instead of Monitor |

**Overall: 21/24**

---

## Top 3 Priority Fixes

1. **ThemeIcon returns `<Sun>` for `system` preference instead of `<Monitor>`** — Users cannot distinguish system mode from light mode at a glance; the toggle icon is wrong one-third of the time — In `Sidebar.jsx` line 74, change the `return <Sun size={20} />` fallback to `return <Monitor size={20} />` and add the corresponding import branch check.

2. **Changelog trigger renders raw `buildVersion` string with no "What's new" label** — The spec Copywriting Contract specifies the changelog button as `What's new` text; the version string is a separate visual element — Add `<span className="sr-only">What's new — </span>` inside the changelog button or rename the button's visible text to "What's new" and move the version string to a separate `<span>` below it (the mobile screenshot shows `73fc185` as the sole text, which is an opaque commit hash to most users).

3. **Update available state uses hardcoded Tailwind semantic colors (`text-green-600`, `bg-amber-500`) instead of design tokens** — These colors will not adapt correctly when accent themes define custom warning/success states, and they bypass the Phase 10 token layer convention — Replace `text-green-600 hover:text-green-700` with `text-hc-success-text hover:text-hc-success-text` and `bg-amber-500` / `text-amber-500` with `text-hc-warning-text` / `bg-hc-warning-text` (tokens already exist in `index.css`).

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

**Passing items:**
- All 5 nav labels match spec exactly: Dashboard, Devices, Timeline, Alerts, Settings (`Sidebar.jsx` lines 15-19).
- Collapsed `title` attributes match labels — verified in code and visible in mobile screenshot.
- `aria-label="Main navigation"` correct (`Sidebar.jsx` line 105).
- Collapse/expand button aria-labels: "Collapse sidebar" / "Expand sidebar" (`Sidebar.jsx` line 287) — correct.
- Theme toggle aria-labels cycle correctly: "Switch to light mode" / "Switch to dark mode" / "Switch to system mode" (`Sidebar.jsx` lines 66-68).
- Accent dot aria-labels follow `{label} accent` pattern (`Sidebar.jsx` lines 172, 216).
- `aria-label="Open theme and accent settings"` on collapsed Paintbrush2 button (`Sidebar.jsx` line 156) — correct.
- "Report issue" link text present (`Sidebar.jsx` line 272).

**Failures:**

- **Changelog trigger text missing** (`Sidebar.jsx` line 250): The spec Copywriting Contract requires label `What's new`. The button currently renders only `{buildVersion}`, which in the running app shows a raw commit hash (`73fc185` visible in mobile screenshot). The `showChangelog` prop is accepted but unused in the JSX. Users have no affordance to know this button opens a changelog.

- **Version string format** (`Sidebar.jsx` line 256): Spec states format `v{version}`. The raw `__BUILD_VERSION__` value is injected at build time (currently a commit hash during dev), with no `v` prefix added in the component. In production builds this would show e.g. `v1.1.0` only if the build process injects the prefix — the component should defensively add it: `v{buildVersion}`.

- **"Update available" badge aria-label absent** (`Sidebar.jsx` lines 276-278): The spec Copywriting Contract requires `aria-label="Update available"` on the collapsed amber dot. The `<span>` has no accessible label, making the indicator invisible to screen readers in collapsed state.

- **"Choose accent color" screen-reader label missing**: The spec requires a visually-hidden label on the accent dot group. Neither the expanded row div (`Sidebar.jsx` line 210) nor the collapsed popover has an `aria-label` or `<span className="sr-only">Choose accent color</span>`.

---

### Pillar 2: Visuals (4/4)

**All items pass.**

The mobile screenshot confirms:
- BrandLogo full variant renders correctly in expanded state (house+chart icon + "home chronicle" text visible at correct proportions).
- 5 nav items visible with correct icons: BarChart2 (Dashboard), Monitor (Devices), LayoutList (Timeline), Bell (Alerts), Settings.
- Active state pill on Dashboard: full-width rounded background with accent-colored label and icon — matches spec `var(--hc-interactive-hover)` + `var(--hc-accent-strong)`.
- Resting items use muted icon color with fg-colored label — matches spec hierarchy.
- 8 accent dot swatches in horizontal row at footer with visible active ring on the ocean (blue) swatch.
- Theme toggle icon visible left-aligned, dots right-aligned — matches spec layout.
- Version text and "Report issue" link in footer at correct 12px muted size.
- Edge handle: not visible at rest (opacity-0) — correct per spec.
- Grid layout: sidebar column and main content area render correctly at all widths.
- `App.jsx` at 95 lines (verified via `wc -l`) — under 100-line success criterion.

---

### Pillar 3: Color (3/4)

**Passing items:**
- No `dark:` modifier classes in any Phase 11 file (`grep -n "dark:"` returns zero matches across all 6 new files).
- No hardcoded hex values in component JSX (ACCENT_SWATCH constants are intentional gradient definitions, not theme tokens — correct per spec).
- Sidebar background uses `bg-hc-panel`, border uses `border-hc-panel-border` — correct tokens.
- Nav item active state uses `bg-hc-interactive-hover text-hc-accent-strong` — correct.
- Nav item hover uses `hover:bg-hc-interactive` — correct.
- Resting icon: `text-hc-muted`, resting label: `text-hc-fg`, footer text: `text-hc-muted` — all correct.
- Accent usage count: 5 instances of `text-hc-accent-strong` and `bg-hc-interactive-hover` — within the 10-element threshold, and all are declared in spec as valid accent targets.

**Failures:**

- **`text-green-600 hover:text-green-700`** (`Sidebar.jsx` line 239): Used for the `availableUpdate` link. The token `--hc-success-text` (`#15803d` light / `#6ee7b7` dark) exists in `index.css` and maps to `text-hc-success-text`. Using the raw Tailwind green bypasses dark mode adaptation — the link will appear the same forest green (#15803d) in dark mode where contrast is insufficient.

- **`text-amber-500`** (`Sidebar.jsx` line 259): Used for the Sparkles icon on new version. The token `--hc-warning-text` (`#b45309` light / `#fbbf24` dark) exists and maps to `text-hc-warning-text`. The hardcoded amber-500 (#f59e0b) is visually close but bypasses the accent-aware warning token.

- **`bg-amber-500`** (`Sidebar.jsx` line 278): Used for collapsed update badge dot. Same issue as above — should use a warning token approach.

---

### Pillar 4: Typography (4/4)

**All items pass.**

Font sizes in Sidebar and page components:
- `text-sm` (14px): nav item labels, footer buttons, DevicesPage sub-tab labels — matches spec "Body/Label" row.
- `text-xs` (12px): version string, "Report issue", "available" tag, DashboardPage range buttons — matches spec footer and sidebar section header 12px note.

Font weights:
- `font-semibold` (600): active nav item label — matches spec "Heading/Label active" row.
- `font-medium` (500): DevicesPage active sub-tab and DashboardPage range picker active state — a minor deviation from the 2-weight contract (400/600 specified), but `font-medium` is used only in sub-components within the page content area, not in the sidebar itself. Acceptable within the spec's scope which is Sidebar-focused.

The spec explicitly excludes `fontWeight="700"` in BrandLogo SVG text glyphs from the CSS weight count. BrandLogo.jsx lines 73 and 82 use SVG attribute `fontWeight="700"` — correctly excluded.

---

### Pillar 5: Spacing (4/4)

**All items pass.**

Key spacing classes verified:
- Nav item padding: `px-3` (12px) horizontal, `h-[40px]` height — `h-[40px]` is an arbitrary value but is explicitly mandated by spec ("Nav item height: 40px") and is a spec exception.
- Sidebar header: `py-6` (24px) — matches spec `lg: 24px` for "Sidebar header padding (top/bottom)".
- Footer: `py-4` (16px), `px-4` (16px), `gap-2` (8px) — within declared scale.
- Accent dot gap: `gap-1` (4px) — matches spec `xs: 4px` for "accent dot gaps".
- Nav list gap: `gap-1` (4px) — consistent.
- `min-w-[160px]` on collapsed accent popover: arbitrary value, but appropriate for a popover panel that is not in the spacing scale scope.
- Edge handle: `w-5 h-8` (20px × 32px) — the spec states 8px wide for hover zone. The `w-5` (20px) is wider than the spec's "8px wide" hover zone spec, but this is the rendered button size including the circular handle visual. The clickable zone being 20px is actually better UX than a 4px strip.

No arbitrary `px` or `rem` values found beyond the spec-sanctioned `h-[40px]`.

---

### Pillar 6: Experience Design (3/4)

**Passing items:**
- Collapse state persists in `localStorage` key `hc_sidebar_collapsed` (`App.jsx` line 27, line 40) — matches NAV-03.
- Grid layout uses `grid-template-columns` toggle, never `transition: width` (`index.css` line 48, `App.jsx` line 75) — matches D-11.
- `ErrorBoundary` wraps all page renders in `App.jsx` (line 80, line 82).
- `AccentOpen` popover state correctly scoped to Sidebar via `useState` — no global state pollution.
- All 5 page components exist and render their correct content, verified by file existence and imports.
- DashboardPage localStorage persistence for range/sync settings handled with try/catch guards.

**Failures:**

- **ThemeIcon renders `<Sun>` for `system` preference** (`Sidebar.jsx` lines 71-75): The `ThemeIcon` helper returns `<Sun>` as the fallback (when `preference === 'system'`, neither the `light` nor `dark` branch matches). This means users on system preference see a Sun icon instead of the Monitor icon, making it impossible to visually distinguish "system" from "light" mode. The `Monitor` icon is imported (`Sidebar.jsx` line 3) but never rendered. Fix: add `if (preference === 'system') return <Monitor size={20} />;` as the first branch.

- **`showChangelog` prop accepted but unused in JSX rendering logic** (`Sidebar.jsx` lines 84, 250): The prop is in the function signature but the changelog button calls `onOpenChangelog` directly without checking `showChangelog`. This is a minor logic omission — the sidebar cannot reflect an externally-forced open state — though in practice the ChangelogModal handles its own visibility in App.jsx.

- **Update badge in collapsed state has no accessible label** (`Sidebar.jsx` lines 276-278): The amber `<span>` dot provides no `aria-label` or `role`, making it invisible to assistive technology. Screen reader users in collapsed mode receive no indication that a software update is available.

- **Accent picker popover has no close-on-outside-click behavior** (`Sidebar.jsx` line 93, `accentOpen` state): The collapsed Paintbrush2 popover opens on click but has no mechanism to close when clicking outside it or pressing Escape. This is a Phase 11 scope item (the spec says "Phase 11 can use a simple absolute-positioned panel") so it is not a blocking issue, but it creates a keyboard trap for users who open the popover and expect Escape to dismiss it.

---

## Files Audited

- `web/src/components/Sidebar.jsx` (301 lines — primary audit target)
- `web/src/components/BrandLogo.jsx` (91 lines)
- `web/src/App.jsx` (95 lines)
- `web/src/pages/DashboardPage.jsx` (140 lines)
- `web/src/pages/DevicesPage.jsx` (39 lines)
- `web/src/pages/AlertsPage.jsx` (9 lines)
- `web/src/pages/SettingsPage.jsx` (11 lines)
- `web/src/pages/TimelinePage.jsx` (5 lines)
- `web/src/index.css` (lines 1-180, token layer)
- Screenshots: `.planning/ui-reviews/11-20260414-172916/desktop.png`, `mobile.png`
