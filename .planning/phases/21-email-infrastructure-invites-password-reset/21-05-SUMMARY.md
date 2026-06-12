---
phase: 21-email-infrastructure-invites-password-reset
plan: 05
subsystem: auth
tags: [express, auth-router, invites, password-reset, enumeration-safe, csrf]

requires:
  - phase: 21-03
    provides: redeemInvite / redeemResetToken / createUser / issueSession (db.js)
  - phase: 21-04
    provides: sendPasswordReset / isEmailEnabled (emails.js)
  - phase: 21-02
    provides: validatePasswordStrength (security.js)
provides:
  - "POST /api/auth/accept-invite — atomic redeem invite → create user (invite role) → issue session"
  - "POST /api/auth/forgot-password — enumeration-safe (identical body + constant delay, fire-and-forget email)"
  - "POST /api/auth/reset-confirm — atomic redeem reset token → set new password"
  - "PATCH /api/auth/password — verify current, enforce strength, re-hash, revoke other sessions"
affects: [phase-21-07, phase-21-08, phase-22-email-alerts]

tech-stack:
  added: []
  patterns: [enumeration-safe response with node:timers/promises constant delay]

key-files:
  created: []
  modified:
    - listener/src/auth-router.js
    - listener/test/auth-router.integration.test.js

key-decisions:
  - "accept-invite, forgot-password, reset-confirm mount inside createAuthPublicRouter (before the gate + CSRF) → CSRF-exempt + behind authLimiter (SEC-02/SEC-03)."
  - "change-password is in the protected router (session required)."
  - "forgot-password returns an IDENTICAL body for known/unknown emails with a constant artificial delay; the email send is fire-and-forget (PWD-02, T-21-05-ENUM)."

patterns-established:
  - "Atomic single-use redemption then user/session creation — never a non-atomic check-then-act."

status: complete
reconstructed: true
---

## Plan 21-05 — Public auth routes + change-password

Added the public invite/reset routes and the protected change-password route to
`auth-router.js`. Requirements: USER-02, USER-03, PWD-01, PWD-02.

## What was built

- **POST /api/auth/accept-invite** — atomically redeems the invite, creates the user with
  the invite's role, and issues a session.
- **POST /api/auth/forgot-password** — enumeration-safe: identical response body for known
  and unknown emails, constant artificial delay, fire-and-forget `sendPasswordReset`.
- **POST /api/auth/reset-confirm** — atomically redeems the reset token and sets the new
  password (strength-checked).
- **PATCH /api/auth/password** (protected) — verifies the current password, enforces
  strength, re-hashes, and revokes the user's other sessions.

## Commits

- `ba689cb` test(21-05): failing tests for public invite+reset routes and change-password (RED)
- `b0c3dba` feat(21-05): implement accept-invite, forgot-password, reset-confirm
- `1441c49` feat(21-05): implement change-password route

15 new integration tests added to `auth-router.integration.test.js` (mock pool extended
with invites + password_reset_tokens stores). TDD RED→GREEN; full suite 528/528 at plan
close.

> Note: this SUMMARY was reconstructed after the fact — the original was written in the
> executor's worktree but not committed before the worktree was removed (lost-SUMMARY
> hazard #2070). Content is drawn from the executor's completion report and the commits
> above, which are present in `main` history.

## Self-Check: PASSED

- Both tasks executed and committed (`ba689cb`, `b0c3dba`, `1441c49`).
- Routes present in `listener/src/auth-router.js`; verified live on beta (login,
  forgot-password, accept-invite all exercised during Phase 21 human-verify).
