---
phase: 17-token-debt-cleanup
plan: "02"
subsystem: web-ui
tags: [token-sweep, tailwind, dark-mode, accessibility]
dependency_graph:
  requires: []
  provides: [tokenized-accessory-list, tokenized-help-modals, tokenized-setup-tabs]
  affects: [web/src/components/AccessoryList.jsx, web/src/components/PinHelpModal.jsx, web/src/components/MatterHelpModal.jsx, web/src/components/setup/AddDevicesTab.jsx, web/src/components/setup/MyDevicesTab.jsx, web/src/components/setup/SettingsTab.jsx]
tech_stack:
  added: []
  patterns: [semantic-design-tokens, bg-hc-panel, bg-hc-panel-mid, text-hc-muted, text-hc-fg, text-hc-fg-strong, border-hc-panel-border, divide-hc-panel-border, bg-hc-border-strong, bg-hc-fg-strong, text-hc-panel]
key_files:
  created: []
  modified:
    - web/src/components/AccessoryList.jsx
    - web/src/components/PinHelpModal.jsx
    - web/src/components/MatterHelpModal.jsx
    - web/src/components/setup/AddDevicesTab.jsx
    - web/src/components/setup/MyDevicesTab.jsx
    - web/src/components/setup/SettingsTab.jsx
decisions:
  - "bg-hc-border-strong used for activity dot fallback and legend swatch (D-2 special case)"
  - "placeholder-gray-400 replaced with placeholder-hc-muted throughout MyDevicesTab inputs"
  - "SettingsTab tooltip fixed: bg-gray-900 bg-hc-panel-mid text-white -> bg-hc-fg-strong text-hc-panel"
  - "bg-white bg-hc-panel-mid side-by-side leftovers in MyDevicesTab resolved by removing bg-white"
  - "text-gray-300 separator dots in AccessoryList -> text-hc-muted (D-3 special case)"
metrics:
  duration_minutes: 45
  completed_date: "2026-04-16"
  tasks_completed: 2
  files_modified: 6
---

# Phase 17 Plan 02: Medium-Density Token Sweep Summary

Replace all hardcoded Tailwind gray/white classes in AccessoryList, both help modals, and all three setup tabs with semantic hc-* design tokens, including special case handling and partial migration cleanup.

## One-Liner

Token sweep of 6 medium-density files (~160 instances): AccessoryList activity dots, PinHelpModal/MatterHelpModal inline code blocks, MyDevicesTab input fields, and SettingsTab tooltip contrast fix.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Token sweep for AccessoryList and both help modals | a0ad0ea | AccessoryList.jsx, PinHelpModal.jsx, MatterHelpModal.jsx |
| 2 | Token sweep and cleanup for setup tabs | 8d21035 | AddDevicesTab.jsx, MyDevicesTab.jsx, SettingsTab.jsx |

## Verification Results

All acceptance criteria passed:

- `grep -E "text-gray-|bg-gray-|bg-white|border-gray-|divide-gray-|hover:bg-gray-|hover:text-gray-"` returns 0 for all 6 files
- `grep "bg-hc-border-strong" web/src/components/AccessoryList.jsx | wc -l` = 2 (activityDot fallback + legend swatch)
- `grep "bg-hc-fg-strong text-hc-panel" web/src/components/setup/SettingsTab.jsx | wc -l` = 1 (tooltip fix)
- `grep "text-hc-fg-muted"` across all 6 files = 0 (no invalid token used)
- vitest: 87 tests passed, 16 test files

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing cleanup] Additional bg-white leftovers in MyDevicesTab**
- **Found during:** Task 2
- **Issue:** MyDevicesTab had `bg-white bg-hc-panel-mid` side-by-side on 7 input className strings (lines 39, 349, 363, 500, 514, 630, 643). The plan only explicitly listed lines 321 and 470 as partial migration leftovers but these were also leftover double-classes. All were required to pass the zero-gray acceptance criterion.
- **Fix:** Removed `bg-white` from all 7 occurrences, leaving `bg-hc-panel-mid`
- **Files modified:** web/src/components/setup/MyDevicesTab.jsx
- **Commit:** 8d21035

**2. [Rule 2 - Missing cleanup] placeholder-gray-400 in MyDevicesTab inputs**
- **Found during:** Task 2
- **Issue:** RoomAutocomplete and note inputs used `placeholder-gray-400` which is a hardcoded gray class. The plan's mapping table did not explicitly list placeholder- utilities but the acceptance criterion requires zero gray instances.
- **Fix:** Replaced with `placeholder-hc-muted` throughout all input fields in MyDevicesTab
- **Files modified:** web/src/components/setup/MyDevicesTab.jsx
- **Commit:** 8d21035

## Known Stubs

None. All token replacements are functional semantic tokens connected to the @theme CSS custom properties defined in web/src/index.css.

## Threat Flags

None. Pure CSS class name changes with no security surface.

## Self-Check: PASSED

- FOUND: web/src/components/AccessoryList.jsx
- FOUND: web/src/components/PinHelpModal.jsx
- FOUND: web/src/components/MatterHelpModal.jsx
- FOUND: web/src/components/setup/AddDevicesTab.jsx
- FOUND: web/src/components/setup/MyDevicesTab.jsx
- FOUND: web/src/components/setup/SettingsTab.jsx
- FOUND: commit a0ad0ea (Task 1)
- FOUND: commit 8d21035 (Task 2)
