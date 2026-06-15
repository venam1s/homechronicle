# Floating Mobile/Tablet Navigation — Design

**Date:** 2026-06-15
**Status:** Approved
**Scope:** Web UI (`web/`) — replaces mobile drawer navigation with a Reddit-style floating action button (FAB) menu.

## Problem

On mobile/PWA, navigation is a fixed top bar with a hamburger that opens a full-height drawer (`web/src/App.jsx` lines 150–197). The user wants a modern floating menu: a single hovering icon, bottom-left, that expands into the page links on tap and auto-collapses to the single icon when the content is scrolled.

## Decisions

- **Replace** the mobile top bar + hamburger drawer entirely. The FAB is the sole navigation under 1024px.
- **Position:** collapsed FAB sits **bottom-left**, expands **upward into a vertical stack**.
- **Collapsed glyph:** a generic menu/grid icon (not the active page's icon).
- **Breakpoint:** active on **mobile + tablet (<1024px)**. Desktop (≥1024px) keeps the existing sidebar unchanged.
- **Page-title bar dropped:** the removed top bar showed the active page title; pages render their own headings, so this is acceptable for the cleaner look.

## Component

**New file:** `web/src/components/FloatingNav.jsx` — single responsibility: render and drive the floating nav.

**Props:**
- `activePage: string` — current page id.
- `onNavigate: (page) => void` — App's `navigate` callback.
- `scrollRef: React.Ref` — ref to the scrolling `<main>` element (scroll-to-collapse source).

**Nav items** (mirror `Sidebar.jsx` lines 17–23):

| id | label | Lucide icon |
|---|---|---|
| dashboard | Dashboard | `BarChart2` |
| devices | Devices | `Monitor` |
| timeline | Timeline | `LayoutList` |
| alerts | Alerts | `Bell` |
| settings | Settings | `Settings` |

## Behavior

- **Collapsed (default):** circular FAB, bottom-left, fixed, `z-30`, safe-area aware (`env(safe-area-inset-bottom)` + `env(safe-area-inset-left)`). Generic glyph (`LayoutGrid`).
- **Tap FAB → expand:** vertical stack of the 5 page pills rises above the FAB, staggered in. Each pill = icon + label. Active page highlighted (`bg-hc-interactive-hover` + `text-hc-accent-strong`, matching Sidebar). FAB glyph swaps to `X` while open. A light backdrop scrim covers the rest of the screen.
- **Collapse triggers:**
  1. Tap a page → `onNavigate(page)` then close.
  2. Tap the backdrop scrim.
  3. Press `Escape`.
  4. **Scroll** the `<main>` element — passive listener via `scrollRef`, fires a collapse only when currently expanded.

## State

Expanded/collapsed is ephemeral `useState` inside `FloatingNav`. **Not** persisted — it is transient UI state, not a user preference.

## Integration (`web/src/App.jsx`)

- Add `const isFloatingNav = isMobile || isTablet;`
- **Remove** the mobile top bar (lines 151–168) and the mobile drawer + backdrop (lines 171–197).
- Sidebar renders only on desktop: `{!isFloatingNav && <Sidebar .../>}` (was `{!isMobile && ...}`).
- `gridCols`: `isFloatingNav ? '1fr' : (effectiveCollapsed ? '56px 1fr' : '240px 1fr')`.
- Add a ref to `<main>`; drop the `pt-12` class (no top bar). Pass the ref to `FloatingNav` as `scrollRef`.
- Render `<FloatingNav activePage={activePage} onNavigate={navigate} scrollRef={mainRef} />` when `isFloatingNav`.
- Drop now-unused `drawerOpen` state and the `isMobile`-resize drawer-close effect (lines 112–115) if no longer referenced.

## Theming

Uses existing `--hc-*` tokens only — `bg-hc-panel`, `border-hc-panel-border`, shadow for the FAB/stack; accent tokens for the active item. Fully theme- and accent-reactive (light/dark + 8 accents). No new CSS variables.

## Accessibility

- FAB is a `<button>` with `aria-expanded` and `aria-label="Open navigation menu"` / `"Close navigation menu"`.
- Expanded stack is a labeled group; each item is a `<button>` with `aria-current="page"` on the active one.
- Focus moves to the first item on open; `Escape` closes and returns focus to the FAB.

## Testing

- `web/src/components/FloatingNav.test.jsx` (Vitest + Testing Library, jsdom):
  - Renders collapsed FAB with the generic glyph and correct aria-label.
  - Tapping the FAB expands and reveals all 5 page items.
  - Clicking a page calls `onNavigate(id)` and collapses.
  - `Escape` and backdrop click collapse.
  - Scroll on the provided `scrollRef` element collapses when expanded.
  - Active page item carries `aria-current="page"`.

## Out of scope (YAGNI)

- Persisting expanded state.
- Drag-to-reposition the FAB.
- Replacing desktop sidebar behavior.
- Expanded-at-rest "bar" mode (tap-to-expand is the chosen interaction).
