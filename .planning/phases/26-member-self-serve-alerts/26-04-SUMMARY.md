---
phase: 26-member-self-serve-alerts
plan: "04"
subsystem: web-ui
tags: [alerts, navigation, ux, auth, smtp, member-self-serve]
dependency_graph:
  requires: []
  provides: [alerts-nav-always-visible, email-option-smtp-gate, member-recipient-lock]
  affects: [web/src/components/Sidebar.jsx, web/src/App.jsx, web/src/components/setup/SettingsTab.jsx, web/src/components/Alerts.jsx]
tech_stack:
  added: []
  patterns: [react-conditional-disable, role-based-readonly-input, smtp-gate-ui]
key_files:
  created: []
  modified:
    - web/src/components/Sidebar.jsx
    - web/src/App.jsx
    - web/src/components/setup/SettingsTab.jsx
    - web/src/components/Alerts.jsx
    - web/src/components/Sidebar.test.jsx
    - web/src/components/Alerts.test.jsx
decisions:
  - "D-11: Alerts nav always visible — featureFlag:'alerts' entry and alertsEnabled filter removed from Sidebar"
  - "D-12: App bounce-off-alerts effect removed along with ['setup','alerts'] query and alertsEnabled derivation"
  - "D-13: Webhook Alerts enable toggle removed from SettingsTab; webhook-timeout and defaultQuietMinutes admin controls preserved ungated"
  - "D-14: Email radio disabled (not hidden) when SMTP unconfigured; member recipient input readOnly+disabled prefilled from user.email; server is authoritative control"
metrics:
  duration: "~20 minutes"
  completed: "2026-06-15"
  tasks_completed: 2
  files_modified: 6
---

# Phase 26 Plan 04: Remove Client Gates + Harden Alerts Page Summary

Removed three client-side alerts gates (Sidebar nav filter, App route gate + bounce effect, SettingsTab master toggle) so Alerts is always visible to authenticated users, and hardened the Alerts page: disabled the Email channel option with a message when SMTP is unconfigured, and locked the recipient input read-only for members prefilled from their account email.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Remove client gates (Sidebar, App, SettingsTab) + nav-always-visible test | 249835f | Sidebar.jsx, App.jsx, SettingsTab.jsx, Sidebar.test.jsx |
| 2 | Alerts page — disable Email option when SMTP off + member recipient lock | 46db6a1 | Alerts.jsx, Alerts.test.jsx |

## What Was Built

**Task 1 — Client gate removal:**
- `Sidebar.jsx`: Removed `featureFlag: 'alerts'` from the Alerts NAV_ITEMS entry; removed `alertsEnabled` prop; set `const visibleNavItems = NAV_ITEMS` (unconditional)
- `App.jsx`: Removed `['setup','alerts']` query, `alertsEnabled` derivation, the bounce-off-alerts `useEffect`, and both `alertsEnabled={alertsEnabled}` props passed to Sidebar
- `SettingsTab.jsx`: Removed the Webhook Alerts enable toggle (checkbox + `saveAlertsMutation.mutate({ enabled: v })`); un-gated the webhook-timeout and defaultQuietMinutes sub-blocks so they always render; removed now-unused `alertsEnabledInput` state and its sync `useEffect`
- `Sidebar.test.jsx`: Added Test 20 (MALERT-07) asserting Alerts nav renders without any `alertsEnabled` prop

**Task 2 — Alerts page hardening:**
- `Alerts.jsx`: Email radio `disabled={smtpUnconfigured}` with visual opacity; added "Email not configured — ask an admin to set up SMTP" `<p>` message below the radio group when SMTP unconfigured
- `Alerts.jsx`: Recipient input `readOnly={user?.role === 'member'}` and `disabled={user?.role === 'member'}`; value bound to `user?.email` for members; admin remains editable
- `Alerts.test.jsx`: Refactored `useAuth` mock to use `vi.hoisted` so per-test role overrides work; added MALERT-06 suite (3 tests) and MALERT-05 suite (2 tests)

## Verification

- `cd web && npm test` — 366/366 passed (47 files); up from 361 pre-plan
- Acceptance grep checks: no `featureFlag:'alerts'`, no `alertsEnabled` in App/Sidebar, no `alertsEnabledInput` in SettingsTab, `smtpUnconfigured` in Alerts.jsx, `role === 'member'` in Alerts.jsx

## Deviations from Plan

None — plan executed exactly as written.

Note: The plan describes "Email `<option>`" (implying a `<select>` element), but the actual implementation uses radio buttons. The equivalent `disabled` attribute was applied to the radio input; the accompanying message was placed as a `<p>` element below the radio group. This is functionally equivalent and consistent with the existing UI pattern — not a deviation from intent.

## Threat Flags

None — all changes are client-side UI guards over server-authoritative enforcement (plan 26-02). T-26-UI-BYPASS accepted per threat model: server enforces member email lock and SMTP rejection.

## Known Stubs

None.

## Self-Check: PASSED

- `web/src/components/Sidebar.jsx` exists: FOUND
- `web/src/App.jsx` exists: FOUND
- `web/src/components/setup/SettingsTab.jsx` exists: FOUND
- `web/src/components/Alerts.jsx` exists: FOUND
- Commit 249835f: FOUND
- Commit 46db6a1: FOUND
