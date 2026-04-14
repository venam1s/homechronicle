---
phase: 10-design-token-foundation
reviewed: 2026-04-14T00:00:00Z
depth: standard
files_reviewed: 28
files_reviewed_list:
  - web/src/index.css
  - web/src/hooks/useAccent.js
  - web/src/hooks/useAccentRgb.js
  - web/src/App.jsx
  - web/index.html
  - web/src/components/setup/SettingsTab.jsx
  - web/src/components/setup/AddDevicesTab.jsx
  - web/src/components/setup/MyDevicesTab.jsx
  - web/src/components/AccessoryDetail.jsx
  - web/src/components/Alerts.jsx
  - web/src/components/setup/RepairFlow.jsx
  - web/src/components/QuietHoursPanel.jsx
  - web/src/components/AnomalyPanel.jsx
  - web/src/components/ChangelogModal.jsx
  - web/src/components/StaleDevicesPanel.jsx
  - web/src/components/FilterBar.jsx
  - web/src/components/setup/SetupTabs.jsx
  - web/src/components/setup/BridgeChildrenRow.jsx
  - web/src/components/PairingHealthBanner.jsx
  - web/src/components/ActivityChart.jsx
  - web/src/components/TrendChart.jsx
  - web/src/components/MonthlyHeatmap.jsx
  - web/src/components/WeekdayHeatmap.jsx
  - web/src/components/TopDevices.jsx
  - web/src/components/RoomChart.jsx
  - web/src/components/HeatmapLane.jsx
  - web/src/components/EventRow.jsx
  - web/src/components/AccessoryList.jsx
findings:
  critical: 0
  warning: 4
  info: 6
  total: 10
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-04-14
**Depth:** standard
**Files Reviewed:** 28
**Status:** issues_found

## Summary

These files form the Phase 10 design-token foundation work: the CSS token layer (`index.css`), two new hooks (`useAccent`, `useAccentRgb`), and the full set of UI components that will consume the migrated tokens. The token system itself is well-structured — CSS custom properties are correctly layered in `@layer base`, the Tailwind `@theme` bridge is clean, and both hooks have solid SSR guards and storage-failure handling.

The warnings found are logic/correctness issues rather than stylistic ones: a render-phase side-effect in `QuietHoursPanel` that can cause an infinite loop, unused dynamic imports inside `handleWipeAll` in `SettingsTab`, a rounding error in the UTC-to-local rotation in `HeatmapLane`, and inconsistent migration of Tailwind gray tokens on `StaleDevicesPanel` that will break dark mode once the shim overrides are removed.

The info items cover leftover hardcoded Tailwind color tokens that have not yet been migrated to design tokens, minor dead code, and a missing `aria-label` on a focusable element.

---

## Warnings

### WR-01: Render-phase side effect in `QuietHoursPanel` causes potential infinite re-render

**File:** `web/src/components/QuietHoursPanel.jsx:55-58`
**Issue:** The following block runs unconditionally at the top level of the render function — not inside a `useEffect`:

```js
if (dismissed && data?.enabled) {
  localStorage.setItem(DISMISS_KEY, '1');   // line 56 (actually removeItem)
  setDismissed(false);                       // line 57
}
```

Calling `setDismissed(false)` directly during render triggers an immediate re-render. On the next render `dismissed` is now `false`, but `data?.enabled` may still be `true`, so the condition doesn't fire again — however if any upstream query re-fetches and briefly returns `enabled: true` while `dismissed` is `false`, this can repeatedly set state mid-render and cause React to warn about "Cannot update during a render" or produce cascading re-renders. The pattern is also fragile: `localStorage.removeItem` is called on every render pass where the condition is true, not just once.

**Fix:** Move the logic into a `useEffect`:
```jsx
useEffect(() => {
  if (dismissed && data?.enabled) {
    localStorage.removeItem(DISMISS_KEY);
    setDismissed(false);
  }
}, [dismissed, data?.enabled]);
```

---

### WR-02: Dead dynamic imports inside `handleWipeAll` — `useQueryClient` is imported at module scope

**File:** `web/src/components/setup/SettingsTab.jsx:356-367`
**Issue:** `handleWipeAll` performs dynamic `import()` of both `../../lib/api.js` and `@tanstack/react-query` at runtime, but both are already statically imported at the top of the file. The dynamic re-imports shadow the static ones with new bindings, but the `useQueryClient` import is never actually called here (the comment says "invalidation already happens via mutation callbacks"). The `fetchJson` dynamic import is redundant and the `useQueryClient` import resolves to a hook that cannot be called outside a React component — if this code path is ever reached after tree-shaking changes the module graph it could silently fail.

```js
// Lines 356-363 — both of these are unnecessary:
const { fetchJson } = await import('../../lib/api.js');
const { useQueryClient } = await import('@tanstack/react-query');
```

**Fix:** Remove both dynamic imports. Use the statically-imported `fetchJson` (already in scope) and remove the unused `useQueryClient` import line entirely:
```js
async function handleWipeAll() {
  if (wipeConfirmText !== 'DELETE') return;
  setWipePending(true);
  try {
    await fetchJson('/api/data/all', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'DELETE ALL' }),
    });
    window.location.reload();
  } finally {
    setWipePending(false);
  }
}
```

---

### WR-03: Off-by-rounding in `HeatmapLane` UTC-to-local rotation can misplace hour buckets

**File:** `web/src/components/HeatmapLane.jsx:18-21`
**Issue:** `rotateToLocal` computes the UTC hour index with `Math.round(utcH)` instead of `Math.floor`. The offset calculation (`-new Date().getTimezoneOffset() / 60`) produces whole hours for most zones, but half-hour and quarter-hour offsets (India +5:30, Australia +9:30, Nepal +5:45, etc.) result in a fractional `utcH`. `Math.round` will round 0.5 fractional hours up, which moves an event into the wrong bucket for users in those time zones.

```js
// line 20 — should be Math.floor, not Math.round
return utcArr[Math.round(utcH)];  // bug
```

`ActivityChart.jsx` handles this correctly with `Math.floor`:
```js
return { ..., count: utc[Math.floor(utcH) % 24] };  // correct
```

**Fix:**
```js
return utcArr[Math.floor(utcH) % 24];
```

---

### WR-04: `StaleDevicesPanel` uses un-shim-covered Tailwind gray tokens — will break when shim overrides are removed

**File:** `web/src/components/StaleDevicesPanel.jsx:19,28,35,36`
**Issue:** The component uses `text-gray-400` and `text-gray-400` Tailwind classes for body text and headers, bypassing the design-token system. The existing `html.theme-dark .text-gray-400` overrides in `index.css` cover these today, but those overrides are part of the compatibility shim that Phase 10 is working to remove. Once the shim is stripped, `text-gray-400` will render as the hardcoded Tailwind gray in dark mode rather than `var(--hc-muted)`.

Specific lines:
- Line 19: `className="text-sm text-gray-400"` (loading state)
- Line 28: `<p className="text-sm text-gray-400">No stale devices right now.</p>`
- Line 35: `<span className="text-xs text-gray-400">heartbeat lagging</span>`

All sibling panels (`AnomalyPanel`, `QuietHoursPanel`) already use `text-hc-muted` and `text-hc-fg` tokens here.

**Fix:** Replace `text-gray-400` with `text-hc-muted` in the loading/empty/header labels of `StaleDevicesPanel`:
```jsx
// Line 19
<div className="text-sm text-hc-muted">Checking device heartbeat…</div>
// Line 28
<p className="text-sm text-hc-muted">No stale devices right now.</p>
// Line 35
<span className="text-xs text-hc-muted">heartbeat lagging</span>
```

---

## Info

### IN-01: Hardcoded Tailwind blue token `bg-blue-50` used for active tab state in `App.jsx` — not migrated to accent token

**File:** `web/src/App.jsx:290-291`
**Issue:** The active tab button uses `bg-blue-50 text-blue-600`. The `@layer utilities` shim in `index.css` currently redirects `bg-blue-50` to `var(--hc-accent-soft)` and `text-blue-600` to `var(--hc-accent-strong)`, so it works today. But it relies on the compatibility shim staying in place. The accent-picker button on line 479 also uses `ring-2 ring-blue-500` (hardcoded blue, not theme-aware).

**Fix:** Use the token utility classes directly:
```jsx
// active tab
'bg-hc-accent-soft text-hc-accent-strong'
// accent-picker selected ring (line 479)
'ring-2 ring-[rgba(var(--hc-accent-rgb),0.7)]'
```

---

### IN-02: `ChangelogModal` close button footer uses inline `style` for accent color instead of token class

**File:** `web/src/components/ChangelogModal.jsx:59`
**Issue:** The close button uses `style={{ backgroundColor: 'rgb(var(--hc-accent-rgb))', color: '#fff' }}` rather than a Tailwind token class. This works but is inconsistent with the token approach being established in Phase 10.

**Fix:**
```jsx
className="w-full py-2 text-sm font-medium rounded-xl transition-colors bg-[rgb(var(--hc-accent-rgb))] text-white"
```

---

### IN-03: `useAccent.js` — `setAccent` wrapper function is a no-op passthrough; can be removed

**File:** `web/src/hooks/useAccent.js:53-55`
**Issue:** The exported `setAccent` function simply calls `setAccentState(newAccent)` with no additional logic. This wrapper adds no value and requires callers to understand that `setAccent` does not validate the input against `VALID_ACCENTS`.

```js
function setAccent(newAccent) {
  setAccentState(newAccent);  // no validation, no transform
}
```

**Fix:** Either remove the wrapper and return `setAccentState` directly, or add the validation that would justify the wrapper:
```js
function setAccent(newAccent) {
  if (!VALID_ACCENTS.has(newAccent)) return;
  setAccentState(newAccent);
}
```

---

### IN-04: `EventRow` uses hardcoded `bg-blue-50` and `text-gray-*` Tailwind tokens not yet migrated

**File:** `web/src/components/EventRow.jsx:45-49, 58-64, 93-94, 99`
**Issue:** Highlighted state uses `bg-blue-50` (line 46), and text content throughout uses `text-gray-900`, `text-gray-400`, `text-gray-600`. These are all covered by the current dark-mode shim but are not using the design tokens directly. When shim lines are removed, `text-gray-900` will not automatically adapt to dark mode.

**Fix:** Replace with token equivalents:
- `bg-blue-50` → `bg-hc-accent-soft`
- `text-gray-900` → `text-hc-fg-strong`
- `text-gray-600` → `text-hc-fg`
- `text-gray-400` → `text-hc-muted`

---

### IN-05: `AccessoryList` uses `bg-white`, `bg-gray-50`, and `bg-blue-50` Tailwind tokens not yet migrated

**File:** `web/src/components/AccessoryList.jsx:122, 208, 215, 249`
**Issue:** Multiple `bg-white`, `bg-gray-50`, and `bg-blue-50` class usages appear directly on panels and the icon container. These are covered by the shim today but will need to be `bg-hc-panel`, `bg-hc-panel-soft`, and `bg-hc-accent-soft` respectively once the shim is removed.

---

### IN-06: `index.css` — standalone PWA styles are duplicated three times

**File:** `web/src/index.css:277-396`
**Issue:** The same five CSS rules (`.hc-app-header`, `.hc-tab-nav`, `.hc-tab-btn`, `.hc-tab-label`, `.hc-pwa-main`, `.hc-fab`) are defined three times in full:
1. `@media (display-mode: standalone)` (lines 277-316)
2. `html.hc-standalone` (lines 318-355)
3. `@media (max-width: 767px) and (not (display-mode: standalone)) html:not(.hc-standalone)` (lines 357-397)

The rules are byte-for-byte identical. This is 120+ lines of duplicated CSS. While not a bug, the duplication means any future change must be made in three places and is easily missed.

**Fix:** Extract shared declarations into a CSS custom class or Tailwind layer utility, then apply that class from each of the three selectors.

---

_Reviewed: 2026-04-14_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
