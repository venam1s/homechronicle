---
phase: 23-security-hardening-nginx-cutover
plan: 02
subsystem: auth
tags: [sessions, postgres, express, csrf, idor, node-test]

# Dependency graph
requires:
  - phase: 23-security-hardening-nginx-cutover
    provides: migration 0006 (sessions.user_agent/ip_address) + sessions-metadata RED scaffold (Plan 01)
provides:
  - db.js listSessionsForUser (self-scoped, no token_hash/csrf_token) + revokeSessionById (ownership-scoped DELETE)
  - createSession UA/IP columns with 512-char UA truncation (T-23-UA-DOS)
  - GET /api/auth/sessions + DELETE /api/auth/sessions/:id (CSRF-protected by mount position)
  - issueSession UA/IP threading at login/claim-admin/accept-invite (::ffff: stripped)
affects: [23-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ownership-scoped delete: DELETE WHERE id=$1 AND user_id=$2 (params [sessionId, userId]) → cross-user guess deletes nothing → 404"
    - "CSRF protection by router mount position (no per-route middleware)"

key-files:
  created: []
  modified:
    - listener/src/db.js
    - listener/src/auth-router.js
    - listener/test/db-session.test.js
    - listener/test/csrf.test.js

key-decisions:
  - "revokeSessionById uses CONTEXT D-04 arg order (pool, userId, sessionId) with params bound [sessionId, userId] — NOT the reversed PATTERNS.md excerpt"
  - "DELETE-without-CSRF 403 test placed in csrf.test.js (not auth-router.integration.test.js as the plan named): the realistic gate→csrf→protected-router chain already exists in csrf.test.js's buildSec02App; the integration harness mounts only the public router with no CSRF middleware, so duplicating that chain there would be error-prone and less faithful. csrf.test.js is in Task 1's files_modified. Acceptance INTENT (explicit DELETE-without-CSRF→403 test) fully met."
  - "csrf.test.js + auth-router.integration.test.js createSession fake-pool branches destructure only the first 3 params, so the 5-column INSERT leaves them green with no edit needed (only db-session.test.js's branch was extended to capture/assert UA+IP)."
  - "API layer does NOT forbid revoking the current session (D-03 'exclude current from bulk revoke' is a Plan-05 UI concern); the endpoint legitimately revokes any session the caller owns."

patterns-established:
  - "extractSessionMeta(req): trust-proxy req.ip with ::ffff: stripped + empty→null; UA passed through (truncated in createSession)"

requirements-completed: [SEC-05]

# Metrics
duration: ~20min
completed: 2026-06-13
---

# Phase 23 / Plan 02: Self-scoped Sessions API Summary

**SEC-05 backend: a user can list their own active sessions and revoke any one of them, with ownership enforced in SQL (T-23-IDOR) and the revoke mutation CSRF-protected by mount position (T-23-CSRF) — greens the Plan-01 RED session scaffold; full listener suite 603/603.**

## Accomplishments
- `db.js`: `listSessionsForUser(pool, userId)` (SELECT scoped `WHERE user_id=$1 AND expires_at > NOW()`, never selects token_hash/csrf_token — D-02); `revokeSessionById(pool, userId, sessionId)` (DELETE `WHERE id=$1 AND user_id=$2`, params `[sessionId, userId]`, returns rowCount>0 — D-04/T-23-IDOR); `createSession` grown to 5 columns with `user_agent` truncated to 512 chars (T-23-UA-DOS).
- `auth-router.js`: `GET /api/auth/sessions` (self-scoped, `current` marker via strict `id != null && String(s.id)===String(currentId)`); `DELETE /api/auth/sessions/:id` (ownership-scoped, 404 on non-delete, CSRF by mount position); `extractSessionMeta(req)` helper; `issueSession` threads UA/IP at all three login paths (`::ffff:` stripped, empty→null).
- Tests: 3 new db-session tests (UA/IP persistence, 2000→512 truncation, null defaults); 1 new csrf.test.js test (DELETE without X-CSRF-Token → 403). Plan-01 `sessions-metadata.test.js` now GREEN.

## Task Commits
1. **Task 1: db.js functions + UA truncation + db-session tests** — `feat(23-02): listSessionsForUser + revokeSessionById + createSession UA/IP columns`
2. **Task 2: auth routes + issueSession threading + CSRF test** — `feat(23-02): self-scoped GET/DELETE auth sessions routes + issueSession UA/IP threading + CSRF test`

## Self-Check: PASSED
- `cd listener && npm test` → 603/603 pass, 0 fail.
- Task 1 greps: SIG-OK. Task 2 greps: ROUTES-OK.
- sessions-metadata.test.js GREEN; DELETE-without-CSRF→403 GREEN; UA-truncation (2000→512) GREEN.

## Deviation
- The DELETE-without-CSRF 403 test lives in `listener/test/csrf.test.js` (the file holding the real gate→csrf→protected-router harness) rather than `auth-router.integration.test.js` (whose harness mounts only the public router, no CSRF). Same protection proven; both files are in the phase's declared test set.
