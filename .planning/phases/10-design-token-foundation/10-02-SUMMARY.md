---
phase: 10-design-token-foundation
plan: 02
subsystem: web-ui
tags: [accent, skin-rename, design-tokens, fouc, localstorage-migration]
dependency_graph:
  requires: [10-01]
  provides: [useAccent-hook, data-accent-attribute, hc_accent-localstorage]
  affects: [web/src/index.css, web/src/App.jsx, web/index.html, web/src/hooks/useAccentRgb.js]
tech_stack:
  added: []
  patterns: [localStorage-migration-with-fallback, dataset-attribute-rename, tdd-vitest]
key_files:
  created:
    - web/src/hooks/useAccent.js
    - web/src/hooks/useAccent.test.js
  modified:
    - web/src/index.css
    - web/src/hooks/useAccentRgb.js
    - web/src/App.jsx
    - web/index.html
  deleted:
    - web/src/hooks/useSkin.js
decisions:
  - useAccent exports getStoredAccent, applyAccent, storeAccent as named exports to enable unit testing without React hook lifecycle
  - SettingsTab has no skin/accent picker — it lives entirely in App.jsx FAB; no SettingsTab label change was needed
  - Pre-existing SettingsTab.test.jsx failures (3 checkbox tests) confirmed pre-existing before this plan
metrics:
  duration: 25m
  completed: 2026-04-14
  tasks_completed: 2
  files_modified: 6
---

# Phase 10 Plan 02: Accent Rename — Summary

**One-liner:** Rename skin system to accent — new useAccent.js hook with hc_ui_skin migration fallback, 15 CSS selectors renamed to data-accent, FOUC script updated, useSkin.js deleted.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create useAccent.js hook with localStorage migration and tests | 7ca6ce0 | web/src/hooks/useAccent.js, web/src/hooks/useAccent.test.js |
| 2 | Atomic rename — CSS selectors, useAccentRgb, App.jsx, index.html | 6d49797 | web/src/index.css, web/src/hooks/useAccentRgb.js, web/src/App.jsx, web/index.html, web/src/hooks/useSkin.js (deleted) |

## What Was Built

**Task 1 — useAccent.js hook (TDD)**

New `web/src/hooks/useAccent.js` ports `useSkin.js` with vocabulary rename:
- `NEW_KEY = 'hc_accent'`, `LEGACY_KEY = 'hc_ui_skin'`
- `getStoredAccent()` reads `hc_accent` first, falls back to `hc_ui_skin` via `??` nullish coalescing
- `applyAccent(accent)` writes `document.documentElement.dataset.accent` (not dataset.skin)
- `storeAccent(accent, storage)` writes only to `NEW_KEY` — legacy key is never written
- `VALID_ACCENTS` Set exported for validation and consumer use
- 6 vitest tests cover all specified behaviors; all pass

**Task 2 — Atomic rename**

All `data-skin` references replaced with `data-accent` atomically to avoid mismatch (RESEARCH.md Pitfall 2):
- `web/src/index.css`: 15 CSS attribute selectors renamed (`html[data-skin='*']` → `html[data-accent='*']`)
- `web/src/hooks/useAccentRgb.js`: `attributeFilter` updated from `['data-skin', 'class']` to `['data-accent', 'class']`
- `web/src/App.jsx`: `useSkin` import → `useAccent`, `skin`/`setSkin` → `accent`/`setAccent`, `SKIN_SWATCH` → `ACCENT_SWATCH`, `isSkinPickerOpen` → `isAccentPickerOpen`
- `web/index.html`: FOUC script reads `hc_accent` with `hc_ui_skin` legacy fallback, writes `dataset.accent`
- `web/src/hooks/useSkin.js`: deleted (no remaining consumers)

## Verification

- `grep -rn "data-skin" web/src/` → 0 results (PASS)
- `grep -rn "useSkin" web/src/` → 0 results (PASS)
- `grep -c "data-accent" web/src/index.css` → 15 (PASS)
- `npx vite build` → built in 290ms (PASS)
- `npm test` → 30 passed, 3 pre-existing failures in SettingsTab checkbox tests (unrelated to this plan)

## Deviations from Plan

### Note: SettingsTab has no "Skin" label

The plan's Task 2 action says to update `SettingsTab.jsx` to rename "Skin" heading to "Accent Color". After reading the file, SettingsTab has no skin picker, skin label, or skin props at all — the color picker is in `App.jsx`'s FAB (floating action button), not in SettingsTab. The FAB button `aria-label` was updated from `'Hide color themes'`/`'Show color themes'` to `'Hide accent colors'`/`'Show accent colors'` as part of the App.jsx rename. No separate SettingsTab change was needed.

## Known Stubs

None — all accent functionality is fully wired.

## Self-Check: PASSED
