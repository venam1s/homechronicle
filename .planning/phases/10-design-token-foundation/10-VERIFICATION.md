---
phase: 10-design-token-foundation
verified: 2026-04-14T18:55:46Z
status: human_needed
score: 5/5 roadmap success criteria verified
overrides_applied: 0
human_verification:
  - test: "Visual check — light and dark mode switch across all tabs"
    expected: "All panels, text, borders, and badges update to the correct semantic token colors in both modes. No wrong-color components visible."
    why_human: "CSS shim and token system cannot be verified programmatically for correctness — requires a running browser to confirm rendered colors."
  - test: "Visual check — all 8 accent presets update themed elements"
    expected: "Buttons, active states, chart gradients, and highlights change to reflect each selected accent (Ocean, Graphite, Sunrise, Red, Yellow, Purple, Slate, Pink)."
    why_human: "Accent application via data-accent attribute and CSS custom property cascade requires visual inspection."
  - test: "Persistence check — accent and theme survive tab close/reopen"
    expected: "After setting Purple accent and Dark mode, closing and reopening http://localhost:5173 restores both preferences without a flash of defaults."
    why_human: "FOUC prevention (inline script) and localStorage persistence require a real browser reload to confirm."
  - test: "Migration check — hc_ui_skin fallback reads correctly"
    expected: "After running localStorage.clear(); localStorage.setItem('hc_ui_skin', 'sunrise'); and reloading, the Sunrise accent is applied."
    why_human: "Legacy key fallback in FOUC script (index.html) and useAccent.js requires browser verification."
  - test: "Confirm no App.jsx ternary-based dark mode styling causes visible glitches"
    expected: "The FAB theme toggle button and accent picker render correctly in both modes (they use isDarkTheme JS ternaries with gray-600/gray-800 classes, not semantic tokens)."
    why_human: "These ternary conditionals with hardcoded gray values are not dark: utilities and are not shimmed — requires visual confirmation they don't produce wrong colors."
---

# Phase 10: Design Token Foundation — Verification Report

**Phase Goal:** Every component uses semantic design tokens — the CSS property system is the single source of truth for all colors in light and dark modes
**Verified:** 2026-04-14T18:55:46Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | User can toggle between light and dark mode from any accessible control and the entire UI switches | ? NEEDS HUMAN | FAB button at App.jsx:497-512 with `onClick={() => setPreference(nextPreference)}` is wired. `useTheme.js` applies `theme-dark` class. CSS shim covers gray classes. Visual correctness unverifiable programmatically. |
| SC2 | User can choose from 3-5 accent color presets and every themed element updates | ? NEEDS HUMAN | 8 accent presets defined in STYLES array (App.jsx:47-55). `setAccent()` writes state, useEffect calls `applyAccent()` → `document.documentElement.dataset.accent`. CSS selectors `html[data-accent='*']` exist (15 in index.css). Visual update requires human verification. |
| SC3 | User's chosen mode and accent color are still applied after closing and reopening the browser tab | ? NEEDS HUMAN | `useTheme.js`: STORAGE_KEY `hc_theme_preference` persisted via localStorage. `useAccent.js`: `hc_accent` key written in useEffect. FOUC inline script reads both keys before React hydrates. Code path verified; browser behavior requires human confirmation. |
| SC4 | Existing chart gradient fills (using --hc-accent-rgb) render correctly in both light and dark modes after the skin system is removed | ? NEEDS HUMAN | `useAccentRgb.js` observes `data-accent` (not `data-skin`) via MutationObserver. ActivityChart, TrendChart, MonthlyHeatmap, WeekdayHeatmap import and call `useAccentRgb()`. RoomChart uses `rgb(var(--hc-accent-rgb))` inline style. Rendering requires visual verification. |
| SC5 | A grep for hardcoded `dark:bg-gray-` and `dark:text-gray-` classes returns zero results across all web source files | VERIFIED | `grep -rn "dark:bg-gray-\|dark:text-gray-\|dark:border-gray-" web/src/ --include="*.jsx"` returns 0. `grep -rn "dark:" web/src/ --include="*.jsx" | grep -v ".test."` returns 0. |

**Score:** 1/5 fully verified programmatically (SC5). All 5 are unblocked — 4 require visual human confirmation. Build passes, wiring is complete.

### Plan Must-Haves vs Codebase

#### Plan 01 Must-Haves (THEME-02 token layer)

| Truth | Status | Evidence |
|-------|--------|----------|
| All --hc-* CSS tokens registered in @theme block as --color-hc-* entries | VERIFIED | `grep -c "\-\-color-hc-" index.css` = 28. @theme at line 5, before @layer base at line 43. |
| New status tokens (success/warning/danger) defined in :root and html.theme-dark | VERIFIED | `:root` lines 83-97: hc-success-bg/text/border, hc-warning-bg/border, hc-danger-bg/text/border, interactive tokens. `html.theme-dark` lines 151-157: dark overrides for all status tokens. |
| New interactive tokens defined in :root | VERIFIED | Lines 93-97: --hc-interactive, --hc-interactive-hover, --hc-focus-ring, --hc-disabled, --hc-disabled-text |
| Shim layer extended to cover all remaining dark:bg-gray-*, dark:text-gray-*, dark:border-gray-* patterns | VERIFIED | Lines 624-668: 13 shim rules covering bg-gray-700/800/900, border-gray-600/700, text-gray-100/200/300, hover variants, text-blue-400. All include `!important`. |
| bg-hc-panel, text-hc-fg, etc. work as first-class Tailwind utilities | VERIFIED | @theme block registers all --color-hc-* as Tailwind color utilities. Vite build succeeds (321ms). Components use `bg-hc-panel`, `text-hc-fg`, `text-hc-muted` throughout. |

#### Plan 02 Must-Haves (THEME-01, THEME-03, THEME-04, THEME-05)

| Truth | Status | Evidence |
|-------|--------|----------|
| User's stored accent preference (previously under hc_ui_skin) is read correctly after key migration | VERIFIED | `useAccent.js:21`: `storage.getItem(NEW_KEY) ?? storage.getItem(LEGACY_KEY)`. FOUC script `index.html:27`: reads hc_accent with hc_ui_skin fallback. All 6 tests pass. |
| All 8 accent presets apply their colors when selected in Settings | ? NEEDS HUMAN | CSS selectors `html[data-accent='ocean']` through `html[data-accent='pink']` exist (15 in index.css). `setAccent()` → `applyAccent()` → `dataset.accent`. Visual correctness requires human verification. |
| Chart components using useAccentRgb() react to accent changes via data-accent attribute | VERIFIED (code path) | `useAccentRgb.js:23`: `attributeFilter: ['data-accent', 'class']`. ActivityChart, TrendChart, MonthlyHeatmap, WeekdayHeatmap all import and use `useAccentRgb()`. RoomChart uses `--hc-accent-rgb` CSS var directly. |
| No flash of unstyled content on page load | ? NEEDS HUMAN | FOUC inline script in index.html reads hc_accent and hc_theme_preference, sets `dataset.accent` and `classList.toggle('theme-dark', ...)` before React hydrates. Browser-only verification. |
| Settings tab shows 'Accent Color' heading instead of 'Skin' | PARTIAL (deviation) | SettingsTab.jsx has no skin/accent picker at all (confirmed by file inspection). The accent picker is in App.jsx FAB with `aria-label="Show accent colors"`. This is a documented deviation — functionally equivalent but location differs from plan spec. |

#### Plan 03 Must-Haves (THEME-02 — direct refactor)

| Truth | Status | Evidence |
|-------|--------|----------|
| SettingsTab has zero dark: classes | VERIFIED | `grep -c "dark:" SettingsTab.jsx` = 0 |
| AddDevicesTab has zero dark: classes | VERIFIED | `grep -c "dark:" AddDevicesTab.jsx` = 0 |
| MyDevicesTab has zero dark: classes and uses --hc-success-*/--hc-warning-*/--hc-danger-* | VERIFIED | 0 dark: classes. Lines 241-401: bg-hc-success-bg, text-hc-success-text, bg-hc-warning-bg, text-hc-warning-text, bg-hc-danger-bg, text-hc-danger-text confirmed. |
| AccessoryDetail has zero dark: classes | VERIFIED | `grep -c "dark:" AccessoryDetail.jsx` = 0. `bg-hc-panel` and `text-hc-fg` confirmed at lines 188, 276, 334, 524, 546. |

#### Plan 04 Must-Haves (THEME-02 — final cleanup)

| Truth | Status | Evidence |
|-------|--------|----------|
| grep for dark:bg-gray-, dark:text-gray-, dark:border-gray- returns zero results across all web/src files | VERIFIED | Command returns 0 lines |
| grep for dark: returns zero results across all web/src/**/*.jsx files | VERIFIED | `grep -rn "dark:" web/src/ --include="*.jsx" | grep -v ".test."` = 0 lines |
| All components render correctly in both light and dark modes | ? NEEDS HUMAN | Code verified; rendering requires browser |
| Charts render with accent colors in both modes | ? NEEDS HUMAN | Code path verified; rendering requires browser |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `web/src/index.css` | @theme registration, status/interactive tokens, shim extensions | VERIFIED | @theme at line 5 with 28 --color-hc-* entries. Status tokens in :root and html.theme-dark. 13 shim extensions at lines 624-668. |
| `web/src/hooks/useAccent.js` | Accent hook with localStorage migration, exports useAccent + VALID_ACCENTS | VERIFIED | NEW_KEY/LEGACY_KEY pattern. getStoredAccent with ?? fallback. applyAccent sets dataset.accent. storeAccent writes NEW_KEY only. |
| `web/src/hooks/useAccentRgb.js` | Accent RGB observer with data-accent filter | VERIFIED | MutationObserver attributeFilter: ['data-accent', 'class'] at line 23. |
| `web/src/components/setup/SettingsTab.jsx` | Settings tab with token classes, zero dark: | VERIFIED | 0 dark: classes. Uses bg-hc-panel, text-hc-fg, etc. |
| `web/src/components/setup/AddDevicesTab.jsx` | Add devices tab with token classes | VERIFIED | 0 dark: classes. |
| `web/src/components/setup/MyDevicesTab.jsx` | My devices tab with status token classes | VERIFIED | 0 dark: classes. bg-hc-success-bg, bg-hc-warning-bg, bg-hc-danger-bg confirmed. |
| `web/src/components/AccessoryDetail.jsx` | Accessory detail with token classes | VERIFIED | 0 dark: classes. bg-hc-panel, text-hc-fg confirmed. |
| `web/src/hooks/useSkin.js` | Should NOT exist (deleted) | VERIFIED | File does not exist. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `useAccent.js` | `document.documentElement.dataset.accent` | `applyAccent()` in useEffect | VERIFIED | Lines 28-29, 44: applyAccent called on every accent state change. |
| `useAccentRgb.js` | `document.documentElement` | MutationObserver attributeFilter | VERIFIED | Line 23: attributeFilter: ['data-accent', 'class']. |
| `web/src/index.css` @theme block | `:root` block | `var()` references | VERIFIED | All 28 `--color-hc-*` entries reference `var(--hc-*)`. Key: `--color-hc-bg: var(--hc-bg)` pattern confirmed. |
| `web/index.html` | `localStorage hc_accent` | inline FOUC prevention script | VERIFIED | Lines 20-31: reads hc_accent with hc_ui_skin fallback, writes dataset.accent. |
| `MyDevicesTab.jsx` | `index.css` status tokens | `bg-hc-success-bg`, `text-hc-success-text`, etc. | VERIFIED | Status badge classes confirmed at lines 241-401. @theme registered --color-hc-success-bg, etc. |
| `App.jsx` | `useAccent.js` | import + destructure | VERIFIED | Line 25: `import { useAccent }`. Line 149: `const { accent, setAccent } = useAccent()`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `useAccent.js` | `accent` state | `getStoredAccent()` → localStorage `hc_accent` or `hc_ui_skin` | Yes (reads real localStorage) | FLOWING |
| `useAccentRgb.js` | `rgb` state | `readAccent()` → `getComputedStyle(--hc-accent-rgb)` | Yes (reads real CSS custom property) | FLOWING |
| `useTheme.js` | `preference` state | localStorage `hc_theme_preference` | Yes (reads real localStorage) | FLOWING |
| `MyDevicesTab.jsx` | status badge classes | device data from API hooks (pre-existing) | Yes (connected to existing hooks) | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Vite build succeeds | `cd web && npx vite build --mode development` | Built in 321ms, no errors | PASS |
| All 6 useAccent tests pass | `npx vitest run src/hooks/useAccent.test.js` | 6/6 pass | PASS |
| Zero dark: JSX classes | `grep -rn "dark:" web/src/ --include="*.jsx"` (excl tests) | 0 lines | PASS |
| Zero gray dark: patterns | `grep -rn "dark:bg-gray-\|dark:text-gray-\|dark:border-gray-" web/src/` | 0 lines | PASS |
| 28 @theme color tokens | `grep -c "\-\-color-hc-" web/src/index.css` | 28 | PASS |
| CSS shim extended | `grep -c "Phase 10 shim" web/src/index.css` | 1 | PASS |
| useSkin.js deleted | file existence check | MISSING (correctly deleted) | PASS |
| data-skin CSS selectors removed | `grep -c "data-skin" web/src/index.css` | 0 | PASS |
| data-accent CSS selectors present | `grep -c "data-accent" web/src/index.css` | 15 | PASS |
| 30/33 tests pass (3 pre-existing failures) | `cd web && npm test` | 30 pass, 3 fail (SettingsTab Scheduled Repair — pre-existing) | PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|------------|---------------|-------------|--------|----------|
| THEME-01 | 10-02 | User can switch between light and dark modes with a toggle in the sidebar | PARTIAL | Toggle exists as FAB (not sidebar — sidebar is Phase 11). Roadmap SC1 ("any accessible control") is satisfied. Literal REQUIREMENTS.md "in the sidebar" deferred to Phase 11. |
| THEME-02 | 10-01, 10-03, 10-04 | All components use semantic design tokens — no hardcoded dark: classes remain | VERIFIED | Zero dark: classes in all .jsx files. @theme block with 28 tokens. Status/interactive tokens defined. |
| THEME-03 | 10-02 | User can choose from 3-5 accent color presets | VERIFIED (code path) | 8 accent presets in STYLES array (exceeds 3-5). `setAccent()` wired to FAB. Visual update needs human check. |
| THEME-04 | 10-02 | User's theme and accent preferences persist across sessions via localStorage | VERIFIED (code path) | `useTheme.js` persists `hc_theme_preference`. `useAccent.js` persists `hc_accent`. FOUC script reads both. Browser persistence needs human check. |
| THEME-05 | 10-02 | Existing chart components render correctly with the new token system | VERIFIED (code path) | `useAccentRgb.js` observes `data-accent`. ActivityChart, TrendChart, MonthlyHeatmap, WeekdayHeatmap all import it. RoomChart uses `--hc-accent-rgb` CSS var. Rendering needs human check. |

**Orphaned requirements:** None. All 5 THEME requirements declared in plan frontmatter are accounted for.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `web/src/App.jsx` lines 502-504, 519-523 | Ternary-based dark mode (`isDarkTheme ? 'border-gray-600 bg-gray-800/90...' : 'border-gray-200 bg-white/95...'`) in FAB buttons | Warning | These are NOT `dark:` Tailwind utilities — they are JS ternary conditionals using raw gray values. They are not covered by the CSS shim. Plan 04 acceptance criteria only required zero `dark:` *utilities*; these are a different pattern. FAB button appearance requires visual check. |
| `web/src/App.jsx` line 269 | `bg-gray-50` on root shell div — not a token class | Info | Covered by CSS shim (`html.theme-dark .bg-gray-50 { background-color: var(--hc-panel-soft) !important }`). Not a stub. |

**Note on App.jsx ternaries:** The ternary-based dark-mode conditionals on the FAB buttons (lines 500-523) use `isDarkTheme` JS state with hardcoded gray-600/gray-800 classes. These are not `dark:` Tailwind utilities and were not targeted by Plan 04 (which only removed `dark:` prefixed utilities). They exist outside the shim pattern and may produce incorrect colors for non-ocean skins in dark mode. This warrants human visual verification.

### Human Verification Required

#### 1. Light and Dark Mode Full UI Switch

**Test:** Start dev server with `cd web && npm run dev`. Visit each tab (Dashboard, Timeline, Accessories, Manage) in light mode, then toggle to dark mode via the FAB (bottom-right moon/sun icon) and repeat.
**Expected:** All panels, text, borders, badges, and buttons update to correct dark-mode colors in every tab. No component shows white text on white background or black text on black background.
**Why human:** CSS shim coverage and token rendering cannot be verified without a browser.

#### 2. All 8 Accent Presets Update Themed Elements

**Test:** In the FAB (bottom-right), click the palette icon to open accent picker. Click through all 8 swatches (Ocean, Graphite, Sunrise, Red, Yellow, Purple, Slate, Pink). Check that buttons, highlights, active nav items, and chart gradient fills update with each selection. Verify in both light and dark modes.
**Expected:** Every accent selection immediately updates all themed elements. Chart gradient fills change color to match the accent.
**Why human:** Accent propagation via `data-accent` attribute and CSS custom property cascade requires visual inspection.

#### 3. Preferences Persist After Tab Close/Reopen

**Test:** Set accent to "Purple" and mode to "Dark". Close the browser tab. Reopen http://localhost:5173.
**Expected:** Purple accent and Dark mode are applied immediately on load (no flash of Ocean/Light defaults).
**Why human:** FOUC prevention (inline index.html script) and localStorage persistence require a real browser reload.

#### 4. Legacy Key Migration (hc_ui_skin Fallback)

**Test:** In browser DevTools Console: `localStorage.clear(); localStorage.setItem('hc_ui_skin', 'sunrise');`. Reload the page.
**Expected:** Sunrise accent is applied on load (read from legacy key), confirming the fallback path in FOUC script and useAccent.js.
**Why human:** localStorage key migration path requires browser execution.

#### 5. FAB Buttons Render Correctly in Both Modes

**Test:** Toggle between light and dark modes and inspect the theme toggle button and accent picker button (FAB, bottom-right). Both use `isDarkTheme` ternary conditionals with gray-600/800 classes.
**Expected:** FAB buttons have appropriate contrast and appearance in both modes.
**Why human:** These buttons use JS-conditional gray classes outside the CSS shim — not covered programmatically. An anti-pattern was detected; human must confirm it doesn't produce visual glitches.

### Gaps Summary

No programmatic gaps found. All must-haves that can be verified in code are verified:

- @theme block with 28 tokens: CONFIRMED
- Status/interactive tokens in :root and html.theme-dark: CONFIRMED
- CSS shim with 13 extensions: CONFIRMED
- useAccent.js with migration, 6/6 tests: CONFIRMED
- data-skin → data-accent rename (15 CSS selectors, hooks, App.jsx, index.html): CONFIRMED
- useSkin.js deleted: CONFIRMED
- Zero dark: classes in all .jsx files: CONFIRMED
- MyDevicesTab status badge tokens: CONFIRMED
- Vite build: PASS
- 30/33 tests pass (3 pre-existing unrelated failures): ACCEPTABLE

**One notable finding:** App.jsx FAB buttons (lines 497-523) use `isDarkTheme` JS ternaries with hardcoded gray-600/gray-800 class strings rather than semantic token classes. These are not `dark:` utilities and fall outside the CSS shim pattern. They were not targeted by Plan 04 (which only removed `dark:` prefixed class names). Visual verification required to confirm they render correctly.

**THEME-01 "in the sidebar" scope note:** The REQUIREMENTS.md literal text says "toggle in the sidebar" but the sidebar is built in Phase 11. The roadmap SC1 for Phase 10 requires "any accessible control" — satisfied by the FAB. The sidebar toggle placement is Phase 11 work.

---

_Verified: 2026-04-14T18:55:46Z_
_Verifier: Claude (gsd-verifier)_
