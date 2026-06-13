---
phase: quick-260613-nwt
plan: 01
subsystem: web / Settings UI
tags: [settings, ui, react, tabs, access-control, refactor]
requires: []
provides:
  - "4-tab Configuration layout (About/Device Management/Data management/Toast)"
  - "Admin-only AdminAdvancedSection (Log level + Danger Zone)"
  - "Settings defaults to Configuration for all roles"
affects:
  - web/src/components/setup/SettingsTab.jsx
  - web/src/pages/SettingsPage.jsx
tech-stack:
  added: []
  patterns: [tabbed-panel, role-gated-render]
key-files:
  created:
    - web/src/components/setup/AdminAdvancedSection.jsx
    - web/src/components/setup/AdminAdvancedSection.test.jsx
  modified:
    - web/src/components/setup/SettingsTab.jsx
    - web/src/components/setup/SettingsTab.test.jsx
    - web/src/pages/SettingsPage.jsx
decisions:
  - "Log level + Danger Zone (only deletion UI in the app) moved into an admin-only component to enforce 'members cannot delete devices/data'"
  - "Data management tab folds Retention + Alerts & Quiet Hours + Timeline into the single existing Data Management Card (they already shared one Card.Body)"
  - "Log-level save toast/error wiring re-homed into AdminAdvancedSection (the old path lived in SettingsTab.flushAutoSave, which did not move)"
metrics:
  duration: ~20m
  completed: 2026-06-13
---

# Quick 260613-nwt: Restructure Settings UI — Tabbed Configuration + Admin-only Advanced Summary

Reorganized the Settings UI into a 4-tab Configuration panel and moved the Log level control and Danger Zone (the app's only deletion UI) into a new admin-only `AdminAdvancedSection`, enforcing that non-admins cannot delete devices or data. Pure reorganization plus one intentional access-control change — every existing handler, debounce, mutation, and toast/error path preserved.

## What changed

**Task 1 — `AdminAdvancedSection.jsx` (new, admin-only)**
- Moved verbatim from SettingsTab: `LOG_LEVELS` constant, all Danger Zone state (`dangerOpen`, `dangerPairFilter`, `confirmDeleteAccessory`, `wipeConfirmText`, `wipePending`, `confirmDeletePairing`, `removeAllState`, `removeAllConfirmText`, `matterDeleteError`), the `logLevelInput` sync effect, derived danger values, `handleRemoveAll`, `handleWipeAll`, and the full Danger Zone `<section>` (red-* classes and the `removeAllConfirmText === '_'` sentinel kept byte-for-byte).
- Log-level wiring re-homed: a direct `saveLogLevelMutation.mutateAsync(value)` handler that toasts `'Setting saved'` on success (gated on `retentionConfig?.toastsEnabled !== false`) and on failure toasts `'Failed to save setting'` + `queryClient.invalidateQueries(['setup','log-level'])`. No debounce — a single select needs none; behaviorally equivalent to the old debounced `flushAutoSave` path.
- New test file: 6 tests (log-level render/change/error-invalidate, Danger Zone expand + empty states, no remove-all block when empty, expand+confirm delete of a paired HomeKit accessory).

**Task 2 — `SettingsTab.jsx` (4 tabs, Advanced stripped)**
- Added keyboard-accessible tab bar (`role="tablist"` / `role="tab"` / `aria-selected`, Enter/Space handlers) for About / Device Management / Data management / Toast; About active by default.
- Each section group wrapped in `{tab === '<id>' && (...)}`. Data management folds Retention + Alerts & Quiet Hours + Timeline (already one Card). Floating Save button stays mounted at component root (fixed, visible on every tab when dirty).
- Removed log level + Danger Zone entirely; `flushAutoSave` simplified to the retention-only path (dropped the `logLevel` branch, `saveLogLevelMutation` dep, and the `['setup','log-level']` invalidate). `paired` and `dbAccessories` retained in the destructure — still used by the quiet-hours excluded-accessory label lookup.
- Removed four newly-orphaned lucide icons (`AlertTriangle`, `ChevronDown`, `Loader`, `Trash2`); kept `Loader2` (floating Save), `Download`/`X` (data tab).
- Tests updated: Scheduled Repair assertions now click into the Device Management tab first; added About-default, Data-tab-reveal, and "Log level"/"Danger Zone" absence assertions.

**Task 3 — `SettingsPage.jsx` (default + admin render)**
- Default sub-section is now `'configuration'` for all roles (login landing page — Dashboard — unchanged). Non-admin `'admin'` redirect guard unchanged.
- `AdminAdvancedSection setup={setup}` rendered inside `activeSection === 'admin' && isAdmin`, after `UsersPanel` + `SMTPConfigSection`.

## Verification

- `cd web && npm test` — full suite green: **42 files / 301 tests** (was 290; +6 AdminAdvancedSection, +5 SettingsTab tab tests).
- `cd web && npm run build` — production build clean.
- `grep "Danger Zone|deletePairing|LOG_LEVELS|Log level" SettingsTab.jsx` → no matches.
- `grep -rln "Danger Zone" web/src/components/setup/` → AdminAdvancedSection.jsx (+ its test); only a negative `queryByText` assertion in SettingsTab.test.jsx.
- `grep "AdminAdvancedSection|useState('configuration')" SettingsPage.jsx` → import + render + default confirmed.
- No new hardcoded hex colors; only carried-forward `red-*` Danger Zone classes remain.

## Deviations from Plan

None — plan executed exactly as written.

## Notes

- The Vite `INEFFECTIVE_DYNAMIC_IMPORT` build warning for `src/lib/api.js` is pre-existing (carried verbatim from the old SettingsTab `handleWipeAll` dynamic import, now in AdminAdvancedSection) — not a regression.
- `CheckCircle2` import in SettingsTab.jsx is pre-existing-unused (present before this task); left as out-of-scope.

## Commits

- `fb8d835` feat(quick-260613-nwt): add admin-only AdminAdvancedSection (log level + Danger Zone)
- `913b2d1` refactor(quick-260613-nwt): convert SettingsTab to 4-tab Configuration; strip Advanced/Danger Zone
- `fc4d75e` feat(quick-260613-nwt): default Settings to Configuration; render AdminAdvancedSection admin-only

## Self-Check: PASSED
