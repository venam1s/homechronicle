---
phase: 25-per-user-quiet-hours-phase-2
plan: "02"
subsystem: web/settings
tags: [quiet-hours, per-user-prefs, usePreference, TDD, QH-06, QH-07, QH-08, QH-11]
dependency_graph:
  requires:
    - "25-01 (session-aware quiet-hours handler + /stats/quiet-hours)"
    - "24-06 (usePreference layer + UserPreferencesProvider)"
    - "24-07 (setPrefsBlob CR-01 fix — shared debounce buffer)"
  provides:
    - "SettingsTab quiet-hours controls wired to per-user blob when authenticated"
    - "Presence-check prefill (blobHasQh) so Phase-24 users prefill from shared config without write-on-mount"
    - "Four-key grouped setPrefsBlob write (QH-08)"
  affects:
    - "web/src/components/setup/SettingsTab.jsx"
    - "web/src/components/setup/SettingsTab.blob.test.jsx"
tech_stack:
  added: []
  patterns:
    - "Presence-check prefill: blobHasQh = !!user && prefs != null && 'quietHoursEnabled' in prefs"
    - "Grouped blob write: setPrefsBlob({ all four QH keys }) in each change handler"
key_files:
  created: []
  modified:
    - web/src/components/setup/SettingsTab.jsx
    - web/src/components/setup/SettingsTab.blob.test.jsx
decisions:
  - "D-25-03: Effective QH values branch on blobHasQh (presence check), NOT on user truthiness — avoids seeding a Phase-24 user's blob on mount when the blob exists but lacks quiet-hours keys"
  - "QH-08: All four QH keys written together in every change handler (quietHoursEnabled, quietHoursStart, quietHoursEnd, quietHoursExcludedAccessories) so the presence predicate stays coherent across writes"
  - "QH keys excluded from D12_KEYS in UserPreferencesProvider — no force-seed per D-25-03"
  - "Anon path unchanged: change handlers keep existing autoSave → saveRetentionMutation path"
metrics:
  duration: "~15 minutes"
  completed: "2026-06-14T13:35:24Z"
  tasks_completed: 2
  files_changed: 2
---

# Phase 25 Plan 02: Quiet-Hours UI Wiring Summary

**One-liner:** Per-user quiet-hours controls in SettingsTab wired to usePreference blob via presence-check (blobHasQh) with four-key grouped setPrefsBlob writes.

## Tasks Completed

| Task | Commit | Description |
|------|--------|-------------|
| 1 — RED tests | dde4b16 | Add quiet-hours authed/anon/prefill test suites (D/E/F) to SettingsTab.blob.test.jsx |
| 2 — GREEN impl | 379847f | Wire QH controls through usePreference + blobHasQh presence check + grouped setPrefsBlob |

## What Was Built

### Task 1: Test suites D/E/F (RED)

Added three quiet-hours suites to `SettingsTab.blob.test.jsx`:

- **Suite D (anon path):** Verifies QH enabled toggle routes to `saveRetentionMutation.mutateAsync` when unauthenticated — the existing `autoSave` path unchanged.
- **Suite E (authed grouped write):** Verifies that clicking the QH enabled toggle calls `setPrefsBlob` with all four keys (`quietHoursEnabled`, `quietHoursStart`, `quietHoursEnd`, `quietHoursExcludedAccessories`) in a single call (QH-08).
- **Suite F (prefill no-write-on-mount):** Verifies an authed user whose blob has non-QH keys but lacks `quietHoursEnabled` renders the checkbox from `retentionConfig` values AND that `setPrefsBlob` is NOT called on mount (QH-07).

Also added a top-level `vi.mock('../../hooks/useUserPreferences.js')` to make Suites E/F testable; updated Suite C to use `vi.importActual` to bypass the mock and keep the seed test working.

### Task 2: SettingsTab.jsx wiring (GREEN)

1. **Import `useUserPreferences`** — accesses `prefs` and `setPrefsBlob` directly in the component.
2. **Four `usePreference` calls** for `quietHoursEnabled` (default false), `quietHoursStart` (default 23), `quietHoursEnd` (default 6), `quietHoursExcludedAccessories` (default [], JSON codec) with `hc_pref_*` localStorage keys matching Phase-24 naming.
3. **`blobHasQh` derivation** — `!!user && prefs != null && 'quietHoursEnabled' in prefs` — gates effective-value source on blob key presence, not user truthiness (D-25-03 correction).
4. **Effective values** — `effectiveQhEnabled/Start/End/Excluded` use `blobHasQh ? blobValue : retentionConfig?.value` so Phase-24 users prefill correctly without triggering a write-on-mount.
5. **Change handlers** — when authed, call `setPrefsBlob({ quietHoursEnabled, quietHoursStart, quietHoursEnd, quietHoursExcludedAccessories })` with all four keys; when anon, call existing `setQuietHours*Input` + `autoSave`.
6. **Excluded accessories chip** — renders from `effectiveQhExcluded`; remove-chip handler calls `setPrefsBlob` for authed or `saveRetentionMutation` for anon.

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced. All QH writes flow through the existing `setPrefsBlob → PUT /api/me/preferences` path scoped to `req.hcSession.user_id` server-side (T-25-IDOR-UI mitigated by Phase 24 server implementation, unchanged here).

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `web/src/components/setup/SettingsTab.jsx` exists | FOUND |
| `web/src/components/setup/SettingsTab.blob.test.jsx` exists | FOUND |
| `25-02-SUMMARY.md` exists | FOUND |
| Commit dde4b16 (RED tests) | FOUND |
| Commit 379847f (GREEN impl) | FOUND |
| `cd web && npm test` exits 0 (331 passed) | PASSED |
