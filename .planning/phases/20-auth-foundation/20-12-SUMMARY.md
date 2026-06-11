---
phase: 20-auth-foundation
plan: "12"
subsystem: web-frontend/auth
tags: [csrf, auth-gate, session-recovery, tdd]
dependency_graph:
  requires: ["20-09"]
  provides: ["csrf-recovery-on-auth-gate-load"]
  affects: ["web/src/components/AuthGate.jsx"]
tech_stack:
  added: []
  patterns: ["useEffect keyed on query data for side-effect on success", "non-fatal async fetch inside useEffect with IIFE pattern"]
key_files:
  created: []
  modified:
    - web/src/components/AuthGate.jsx
    - web/src/components/AuthGate.test.jsx
decisions:
  - "Used useEffect keyed on /auth/me data rather than a second useQuery to keep the recovery as a non-blocking side effect that does not affect render output"
  - "Recovery is idempotent by checking sessionStorage.getItem('csrfToken') before fetching, so a just-logged-in tab's token is never clobbered"
  - "Non-fatal: wrapped in try/catch so CSRF recovery failure does not block children rendering"
metrics:
  duration: "~3 minutes"
  completed: "2026-06-11T03:38:25Z"
  tasks_completed: 2
  files_modified: 2
---

# Phase 20 Plan 12: CSRF Token Recovery in AuthGate Summary

**One-liner:** AuthGate now fetches /auth/csrf-token on load for authenticated returning sessions that lack a sessionStorage token, closing CR-05 gap.

## What Was Built

Added CSRF token recovery to `AuthGate.jsx` using a `useEffect` keyed on the `/auth/me` query result. When a user is authenticated (data truthy) but `sessionStorage` holds no `csrfToken`, AuthGate fetches `GET /auth/csrf-token` and stores the returned token. This closes the CR-05 gap identified in `20-VERIFICATION.md`: returning sessions (new tab, browser restart) with a valid `hc_session` cookie can now perform mutations including logout.

**Key behaviors:**
- Recovery fires only when `/auth/me` succeeds (data truthy) — unauthenticated users are redirected to /login without triggering the fetch (SEC-02 preserved)
- Idempotent: if `sessionStorage.csrfToken` already exists, no fetch occurs (preserves tokens a just-logged-in tab set via LoginPage)
- Non-fatal: recovery failure is caught silently; children still render

**Test coverage:** 3 new regression tests added to `AuthGate.test.jsx`:
1. Absent-token recovery: authenticated + empty storage → fetchJson called with /auth/csrf-token, sessionStorage populated
2. Present-token no-clobber: authenticated + existing token → no /auth/csrf-token call, existing token preserved
3. Unauthenticated no-fetch: 401 from /me → redirect to /login, no /auth/csrf-token call

Full web suite: 171 tests passing (was 168, +3).

## Commits

| Task | Type | Hash | Description |
|------|------|------|-------------|
| Task 1 RED | test | 6b3c88a | test(20-12): add failing CSRF recovery tests for AuthGate (RED) |
| Task 1 GREEN | feat | 9d1bf0c | feat(20-12): add CSRF token recovery to AuthGate (GREEN) |

## Deviations from Plan

None - plan executed exactly as written. Both TDD gate commits exist (RED: 6b3c88a, GREEN: 9d1bf0c).

## TDD Gate Compliance

- RED gate commit: 6b3c88a (test) — 3 failing tests added, 1 confirmed failing before implementation
- GREEN gate commit: 9d1bf0c (feat) — all 7 AuthGate tests pass; full suite 171/171 green

## Requirements Addressed

| Requirement | Description | Status |
|-------------|-------------|--------|
| AUTH-03 | Logout destroys server-side session | UNBLOCKED — returning sessions can now recover CSRF token and call DELETE /logout |
| AUTH-06 | Remember-me returning sessions can mutate | UNBLOCKED — returning sessions (browser restart) recover CSRF token on AuthGate load |
| SEC-02 | CSRF synchronizer token on mutations; pre-auth routes exempt | PRESERVED — recovery only fires for authenticated users |

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced.

## Self-Check: PASSED

- web/src/components/AuthGate.jsx: EXISTS (modified)
- web/src/components/AuthGate.test.jsx: EXISTS (modified)
- Commit 6b3c88a: EXISTS
- Commit 9d1bf0c: EXISTS
- grep "auth/csrf-token" AuthGate.jsx: MATCHES (lines 16, 27)
- grep "sessionStorage" AuthGate.jsx: MATCHES (lines 21, 22, 28, 29)
- Recovery conditional on data truthy: VERIFIED (useEffect returns early if !data)
- Full web suite 171 tests: VERIFIED
