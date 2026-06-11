---
phase: 20-auth-foundation
plan: "11"
subsystem: auth
tags: [session-auth, csrf, cors, express, csrf-sync, gate]

# Dependency graph
requires:
  - phase: 20-09
    provides: "Session gate middleware, csrf.js factory, csrfSynchronisedProtection mount, auth-router.js"
provides:
  - "Session-first gate ordering: browser sessions populate req.hcSession even when nginx injects X-API-Token"
  - "CORS credentials:true so Access-Control-Allow-Credentials is emitted for dev cross-origin workflow"
  - "skipCsrfProtection predicate: sessionless API_TOKEN callers bypass CSRF; real sessions still protected"
  - "GET /me null guard: returns 401 (not 500) when req.hcSession absent, breaking infinite login loop"
  - "generateCsrfToken(req) arity fix: omits res arg so overwrite=false, reuses existing session token"
  - "Regression tests for every fixed interaction (435 tests, up from 431)"
affects:
  - "20-12: CSRF token recovery (client-side sessionStorage missing CSRF for returning sessions)"
  - "23-hardening: nginx token injection removal makes CR-02 moot at cutover"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Session-first gate ordering: session cookie checked BEFORE API_TOKEN fallback so nginx token injection does not shadow browser sessions (D-01/D-03)"
    - "skipCsrfProtection predicate pattern: !req.hcSession gates CSRF skip — only absent-session (service-token) callers skip, real sessions always CSRF-protected"
    - "Null guard before session field access: check req.hcSession falsy before any .user_id/.role access to prevent TypeError → 500"

key-files:
  created: []
  modified:
    - listener/src/index.js
    - listener/src/csrf.js
    - listener/src/auth-router.js
    - listener/test/gate.test.js
    - listener/test/csrf.test.js

key-decisions:
  - "Session-first gate ordering is the correct fix for CR-02: session cookie validated via validateSession(pool, hashToken(cookie)) BEFORE the API_TOKEN secureTokenEquals check, so nginx token injection no longer shadows browser sessions"
  - "skipCsrfProtection: (req) => !req.hcSession is the canonical pattern for exempting service-token callers while keeping session callers protected — predicate mirrors the gate's decision about who authenticated"
  - "generateCsrfToken(req) with no second arg is correct: csrf-sync's overwrite defaults to false, reusing existing session token instead of regenerating on every call"
  - "AUTH_ENABLED=false branch left byte-identical to 20-09 version to satisfy D-08 (v1.3 verbatim revert)"

patterns-established:
  - "makeGate() in gate.test.js must stay in sync with index.js gate; comment 'Keep in sync with index.js' is the sync contract"
  - "csrf.test.js SEC-02 test is the integration test for the full POST-login CSRF flow; new tests use the same harness pattern"

requirements-completed: [AUTH-02, AUTH-03, AUTH-04, AUTH-06, AUTH-08, SEC-02, SEC-04]

# Metrics
duration: 30min
completed: 2026-06-11
---

# Phase 20 Plan 11: Gap Closure Summary

**Session-first gate reorder + CORS credentials + skipCsrfProtection close four BLOCKER gaps that prevented browser login from working in the Docker topology where nginx unconditionally injects X-API-Token**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-06-11T03:18:00Z
- **Completed:** 2026-06-11T03:48:13Z
- **Tasks:** 3 (Task 3 has RED + GREEN commits)
- **Files modified:** 5

## Accomplishments
- Flipped AUTH_ENABLED=true gate to session-first ordering: browser sessions now populate req.hcSession even when nginx injects X-API-Token on every request (CR-02 BLOCKER closed)
- Added `credentials: true` to cors() so Access-Control-Allow-Credentials is emitted (CR-04 BLOCKER closed)
- Added `skipCsrfProtection: (req) => !req.hcSession` to csrfSync so API_TOKEN callers without sessions pass mutations without an X-CSRF-Token header (CR-01/CR-03 BLOCKER closed)
- Fixed GET /me null guard: returns 401 instead of TypeError → 500 when req.hcSession absent, breaking the infinite login loop AuthGate was experiencing (BLOCKER closed)
- Fixed generateCsrfToken arity: removed `res` second argument so csrf-sync defaults overwrite=false, reusing existing session token instead of regenerating on every GET /csrf-token call (WARNING closed)
- Added 4 regression tests (2 in gate.test.js, 2 in csrf.test.js); test suite grows from 431 to 435, all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Flip gate to session-first + CORS credentials + skipCsrfProtection** - `4ad3c11` (feat)
2. **Task 2: Null-guard GET /me + fix generateCsrfToken arity** - `bf84528` (feat)
3. **Task 3 RED: Add failing gate tests for session-first ordering** - `b19690b` (test)
4. **Task 3 GREEN: Update makeGate() + add CSRF/me regression tests** - `f67a620` (feat)

## Files Created/Modified
- `listener/src/index.js` - Session-first gate ordering in AUTH_ENABLED=true branch; `credentials: true` added to cors() options
- `listener/src/csrf.js` - `skipCsrfProtection: (req) => !req.hcSession` added to csrfSync() options
- `listener/src/auth-router.js` - GET /me null guard (401 before dereferencing session); generateCsrfToken(req) arity fix
- `listener/test/gate.test.js` - makeGate() updated to session-first; CR-02 regression test (session wins over X-API-Token); AUTH-08 token-fallback test
- `listener/test/csrf.test.js` - AUTH-08/skipCsrfProtection test; GET /me 401 null-guard test; import of createAuthProtectedRouter added

## Decisions Made
- Gate ordering: session cookie FIRST (validateSession DB lookup), API_TOKEN FALLBACK. This is the only correct ordering for a topology where nginx unconditionally injects the service token — attempting to check the token first means req.hcSession is never populated for browser users.
- skipCsrfProtection predicate `!req.hcSession` is correct and safe: req.hcSession is only set by validateSession() after a successful DB lookup; a spoofed request cannot fabricate it. Real sessions always run through CSRF protection; SEC-02 test confirms this invariant.
- No changes to the AUTH_ENABLED=false branch (D-08 compliance verified via git diff).

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
- The worktree does not have node_modules in `listener/`. Resolved by creating a symlink: `listener/node_modules -> /Users/marcsmith/ai-projects/homechronicle/listener/node_modules`. Tests were run from the worktree using this symlink. The symlink is not committed (it is only a worktree-local artifact; the main repo's node_modules are shared).

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- The four BLOCKER gaps from 20-VERIFICATION.md are closed. Phase 20 session auth flow is now structurally correct end-to-end for the Docker topology.
- One WARNING gap remains (CR-05 from 20-VERIFICATION.md): CSRF token is stored only in per-tab sessionStorage at login, with no recovery path for returning sessions (new tab, browser restart). This must be addressed in Plan 20-12 (CSRF token recovery).
- Plan 20-12 should add an automatic /auth/csrf-token re-fetch in AuthGate or useAuth when the user is authenticated but sessionStorage has no CSRF token.

## Threat Flags

No new security-relevant surface introduced. All changes are within the scope of the existing auth gate composition documented in the plan's threat model (T-20-11-01 through T-20-11-06).

## Self-Check

Will be run after SUMMARY commit.

---
*Phase: 20-auth-foundation*
*Completed: 2026-06-11*
