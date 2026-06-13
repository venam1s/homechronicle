---
phase: 23-security-hardening-nginx-cutover
plan: 05
subsystem: ui
tags: [react, tanstack-query, sessions, date-fns, settings, csrf]

# Dependency graph
requires:
  - phase: 23-security-hardening-nginx-cutover
    provides: GET/DELETE /api/auth/sessions (Plan 02)
provides:
  - useSessions + useRevokeSession hooks
  - ActiveSessionsPanel (per-row + bulk "Log out other devices", This-device marker)
  - mounted under Settings → Account
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bulk revoke realized purely in frontend (iterate non-current sessions over the existing DELETE) — no new backend endpoint"
    - "Per-row pendingSessionId so a single revoke disables only its own row"

key-files:
  created:
    - web/src/components/ActiveSessionsPanel.jsx
    - web/src/components/ActiveSessionsPanel.test.jsx
  modified:
    - web/src/hooks/useAuth.js
    - web/src/pages/SettingsPage.jsx

key-decisions:
  - "Bulk 'Log out other devices' iterates non-current sessions over the existing CSRF-protected DELETE /api/auth/sessions/:id (frontend Promise.all) — no new backend revoke-all endpoint (keeps within Plan-02's locked function list / D-04)."
  - "The current ('This device') session has NO revoke control and is excluded from the bulk action (D-03); it is ended via the existing Sidebar Sign-out."
  - "No manual CSRF wiring — fetchJson attaches X-CSRF-Token to all non-GET/HEAD methods incl. DELETE (api.js)."

patterns-established:
  - "deviceLabel(user_agent) abbreviates UA to 'Browser on OS', rendered as React-escaped text (T-23-XSS)"

requirements-completed: [SEC-05]

# Metrics
duration: ~20min
completed: 2026-06-13
---

# Phase 23 / Plan 05: Active Sessions UI Summary

**SEC-05 frontend: a user can view their active sessions under Settings → Account, revoke any single non-current session, or 'Log out other devices' in one click — current session marked 'This device' and excluded from every revoke path. Web suite 290/290 + build green.**

## Accomplishments
- `useAuth.js`: `useSessions()` (queryKey ['auth','sessions']) + `useRevokeSession()` (DELETE + invalidate same key).
- `ActiveSessionsPanel.jsx`: rows with device label (UA-abbreviated), IP, created/last-seen/expires (date-fns); "This device" badge + no revoke for the current session; per-row revoke with `pendingSessionId` scoping; bulk "Log out other devices" iterating non-current sessions over the existing DELETE; loading/empty/error states; --hc-* tokens, 8-pt spacing.
- `SettingsPage.jsx`: ActiveSessionsPanel mounted under the Account section after ChangePasswordSection.
- `ActiveSessionsPanel.test.jsx`: 4 tests (This-device no-revoke; non-current enabled; single revoke → DELETE for that id only + other row stays enabled + current never revoked; bulk revokes every non-current id and never the current).

## Task Commits
1. **Task 1: hooks** — `feat(23-05): useSessions + useRevokeSession TanStack Query hooks`
2. **Task 2: ActiveSessionsPanel + test** — `feat(23-05): ActiveSessionsPanel — per-row + bulk revoke, This device marker, scoped pending`
3. **Task 3: mount in SettingsPage** — `feat(23-05): mount ActiveSessionsPanel in Settings Account section`

## Self-Check: PASSED (checkpoint approved on test+build evidence)
- `cd web && npm test` → 290/290 pass; `npm run build` succeeds.
- HOOKS-OK / PANEL-OK / MOUNT-OK greps pass.

## Human-verify checkpoint
Approved by developer on the automated test+build evidence. The two-browser live flow is DEFERRED to deployment and recorded as a HUMAN-UAT item:
1. List own sessions; A marked "This device" (no revoke).
2. Revoke B from A → only B's row pending, B logged out next request, C's button stays enabled.
3. "Log out other devices" → all non-current revoked, A stays logged in.
4. "This device" never revocable from the panel / never bulk-revoked.
