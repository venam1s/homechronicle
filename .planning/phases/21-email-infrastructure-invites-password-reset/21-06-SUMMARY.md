---
phase: 21-email-infrastructure-invites-password-reset
plan: "06"
subsystem: listener/users-router
tags: [users-crud, invite-lifecycle, admin-guards, last-admin, session-revocation, tdd, wave-2]
dependency_graph:
  requires:
    - listener/src/db.js::listUsers (21-03)
    - listener/src/db.js::createInvite (21-03)
    - listener/src/db.js::findInviteByEmail (21-03)
    - listener/src/db.js::listInvites (21-03)
    - listener/src/db.js::revokeInvite (21-03)
    - listener/src/db.js::disableUser (21-03)
    - listener/src/db.js::enableUser (21-03)
    - listener/src/db.js::removeUser (21-03)
    - listener/src/db.js::revokeSessionsForUser (21-03)
    - listener/src/db.js::setUserRole (21-03)
    - listener/src/db.js::countAdmins (21-03)
    - listener/src/db.js::findUserByEmail (21-03)
    - listener/src/emails.js::sendInvite (21-04)
    - listener/src/emails.js::isEmailEnabled (21-04)
    - listener/src/security.js::generateToken (Phase 20)
    - listener/src/security.js::hashToken (Phase 20)
  provides:
    - listener/src/users-router.js::createUsersRouter
  affects:
    - listener/src/index.js (mount /api/users — deferred to Plan 21-07)
tech_stack:
  added: []
  patterns:
    - TDD RED/GREEN (tests first, then implementation)
    - Factory function pattern (createUsersRouter) matching retention-router.js
    - Per-router write rate limiter (usersWriteLimiter 60/min)
    - requireAdmin helper (401 no session / 403 non-admin)
    - pg_advisory_xact_lock(20_240_002) for last-admin guard under transaction
    - Token security: raw token in URL, hashToken (SHA-256) stored in DB
    - Fire-and-forget email with inviteUrl always returned (D-10 fallback)
key_files:
  created:
    - listener/src/users-router.js
  modified:
    - listener/test/users-router.test.js (Wave 0 stub replaced with 33 real tests)
decisions:
  - "Inline SQL for disable/setRole guard mutations rather than calling db.js helpers — the advisory lock transaction must wrap both the count-check AND the mutation, which the standalone db.js helpers (disableUser/revokeSessionsForUser/setUserRole) cannot do atomically without a client connection. For these guarded mutations only, SQL is inlined in the transaction block."
  - "resend endpoint uses revokeInvite (returns email/role) then createInvite for a new record — this gives a clean audit trail (old invite marked revoked, new invite created) without any UPDATE on used invites."
  - "The fake pool matcher for findInviteByEmail uses 'FROM invites' (not 'FROM invites WHERE') because the actual SQL has a newline between FROM and WHERE — substring match is more robust than exact whitespace."
metrics:
  duration: "~11 minutes"
  completed: "2026-06-11"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 1
---

# Phase 21 Plan 06: users-router.js — Users & Invites CRUD Summary

**One-liner:** Admin-only /api/users router with invite lifecycle (create/list/revoke/resend), user management (list/disable/enable/setRole/remove), and last-admin + self guards enforced server-side under pg_advisory_xact_lock(20_240_002).

## Tasks Completed

| Task | Name | Commits | Key Files |
|------|------|---------|-----------|
| Both RED | Failing tests for users-router (Tasks 1+2 combined) | 5392981 | listener/test/users-router.test.js |
| Both GREEN | createUsersRouter implementation + test fix | 9c3bdb8 | listener/src/users-router.js, listener/test/users-router.test.js |

## What Was Built

### users-router.js

Factory function `createUsersRouter({ pool, sendInvite, isEmailEnabled, appBaseUrl })` with 7 routes:

**Invite management:**

- `GET /invites` — `listInvites(pool)` → maps to `{ id, email, role, status, expiresAt }` (USER-07)
- `POST /invite` — validates email + role; checks `findUserByEmail` (400 account-exists copy); checks `findInviteByEmail` (400 pending-invite copy); mints raw token via `generateToken()`, stores `hashToken(raw)` in DB via `createInvite`; builds `${appBaseUrl}/accept-invite?token=${raw}`; if `isEmailEnabled()` calls `sendInvite` fire-and-forget with caught failure; **always returns `{ inviteUrl, emailed, email }`** (D-10/EMAIL-03 degradation); invite TTL = 72h (D-11)
- `DELETE /invites/:id` — `revokeInvite(pool, id)`; returns 404 on null (USER-04)
- `POST /invites/:id/resend` — revoke old invite (getting its email/role), create new invite with fresh token + reset expiry, re-email if enabled; return new `inviteUrl` (D-13)

**User management:**

- `GET /` — `listUsers(pool)` → maps `disabled_at` to `status: 'disabled'|'active'` (USER-01)
- `PATCH /:id` — three actions:
  - `enable`: `enableUser(pool, targetId)` — no guard needed
  - `disable`: self-guard first (400 if `userId === targetId`, D-06); then `pool.connect()` → `BEGIN` → `pg_advisory_xact_lock(20_240_002)` → `COUNT active admins` → 400 if `<= 1`; inline `UPDATE users SET disabled_at = NOW()` + `DELETE FROM sessions WHERE user_id` in same transaction; `COMMIT` (USER-05/06)
  - `setRole`: promote (no guard) or demote (guard: advisory lock + count check → 400 if only admin); `setUserRole` inline SQL (D-09)
- `DELETE /:id` — self-guard first; then advisory lock transaction → count check → inline `DELETE FROM users` (sessions cascade via FK — T-21-06-STALESESSION) (USER-06, D-06)

**Security surface:**
- `requireAdmin(req, res)` helper: 401 (no session) / 403 (non-admin) — applied first in every handler
- Per-router `usersWriteLimiter` (60 req/min) — T-21-06-INVITEFLOOD
- Raw token only in URL; `hashToken(raw)` (SHA-256) stored in DB — T-21-06-TOKENLEAK
- `ADMIN_GUARD_LOCK_KEY = 20_240_002` — T-21-06-LASTADMIN

### Test coverage (33 tests)

Wave 0 stub replaced with:
- 3 GET /api/users shape + status mapping tests
- 3 role guard tests (403 member, 401 no session)  
- 1 GET /invites list test
- 7 POST /invite tests: D-10 copyable link (3 variants), duplicate-account 400, duplicate-invite 400, invalid role 400, missing email 400, token hash security
- 2 DELETE /invites/:id tests: success + 404
- 2 POST /invites/:id/resend tests: success + 404
- 3 PATCH disable tests: success+sessions revoked, self-400, last-admin-400
- 1 PATCH enable test
- 3 PATCH setRole tests: demote-only-admin-400, promote-200, demote-with-multiple-200
- 3 DELETE tests: self-400, last-admin-400, member-200
- 3 source-inspection tests: exports, hashToken present, pg_advisory_xact_lock present

## Verification Results

```
cd listener && node --test test/users-router.test.js
  tests 33, pass 33, fail 0

cd listener && npm test (full suite)
  tests 545, pass 545, fail 0 (was 513 before this plan)
```

- `grep -c "hashToken" listener/src/users-router.js` = 3: PASS
- `grep -c "pg_advisory_xact_lock" listener/src/users-router.js` = 3: PASS
- inviteUrl always returned even when isEmailEnabled() = false: PASS (test line 177)
- inviteUrl always returned even when sendInvite throws: PASS (test line 201)
- duplicate pending invite returns 400: PASS (test line 308)
- disabling self returns 400: PASS (test line 233)
- disabling last admin returns 400: PASS (test line 244)
- removing self returns 400: PASS (test line 292)
- removing last admin returns 400: PASS (test line 299)
- demoting only admin returns 400: PASS (test line 262)
- disable revokes sessions (DELETE FROM sessions called): PASS (test line 228)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fake pool SQL matcher false-negative for findInviteByEmail**

- **Found during:** GREEN phase — "duplicate pending invite returns 400" test was returning 200
- **Issue:** The SQL for `findInviteByEmail` has a newline between `FROM invites` and `WHERE email` (multi-line template literal). Test behavior entry `{ match: 'FROM invites WHERE', ... }` with a single space never matched the actual SQL that has a newline + padding.
- **Fix:** Changed test match from `'FROM invites WHERE'` to `'FROM invites'` (substring without whitespace assumption)
- **Files modified:** `listener/test/users-router.test.js`
- **Commit:** 9c3bdb8 (included in GREEN commit)

**2. [Rule 1 - Implementation] Inline SQL for guarded mutations instead of db.js helpers**

- **Found during:** Implementation design — the plan specified using `disableUser(pool, userId)` and `revokeSessionsForUser(pool, userId)` from db.js, but those functions call `pool.query()` directly and cannot participate in a client transaction.
- **Issue:** The advisory lock must wrap BOTH the count check AND the mutation in a single transaction on the same `client`. Using standalone `pool.query()` helpers breaks the transaction atomicity.
- **Fix:** Inlined the equivalent SQL (`UPDATE users SET disabled_at = NOW()` and `DELETE FROM sessions WHERE user_id`) inside the `client.query()` transaction block for `disable` and `setRole` (demote). `enable` and `setRole` (promote) have no guard → use `pool.query()` helpers as planned.
- **Files modified:** `listener/src/users-router.js`
- **Commit:** 9c3bdb8

## TDD Gate Compliance

Both tasks followed RED → GREEN TDD:

- RED commit `5392981`: `users-router.js` did not exist → import failed with `ERR_MODULE_NOT_FOUND` (confirmed failure)
- GREEN commit `9c3bdb8`: 33/33 pass, full suite 545/545 pass

## Known Stubs

None — all routes are fully implemented and tested.

## Threat Surface Scan

All STRIDE threats in the plan's `<threat_model>` are mitigated:

| Threat ID | Status |
|-----------|--------|
| T-21-06-LASTADMIN | MITIGATED — pg_advisory_xact_lock(20_240_002) + count ≤ 1 check in same transaction |
| T-21-06-PRIVESC | MITIGATED — requireAdmin checks role === 'admin' on every route; tested |
| T-21-06-SELFLOCK | MITIGATED — assertNotSelf check before transaction for disable/remove |
| T-21-06-STALESESSION | MITIGATED — disable: inline DELETE FROM sessions in same transaction; remove: FK CASCADE + user deleted |
| T-21-06-INVITEFLOOD | MITIGATED — usersWriteLimiter (60/min) + admin-only + duplicate-pending-invite 400 |
| T-21-06-TOKENLEAK | MITIGATED — only hashToken(raw) stored; raw only in URL; verified by token-hash security test |

No new threat surface beyond what was planned.

## Self-Check: PASSED
