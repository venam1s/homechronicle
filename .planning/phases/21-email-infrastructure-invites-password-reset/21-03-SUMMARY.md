---
phase: 21-email-infrastructure-invites-password-reset
plan: "03"
subsystem: listener/db
tags: [db-crud, invite-lifecycle, password-reset, session-guard, tdd, wave-1]
dependency_graph:
  requires:
    - listener/migrations/0004_invites_reset_tokens.sql (21-01)
  provides:
    - listener/src/db.js::createInvite
    - listener/src/db.js::findInviteByEmail
    - listener/src/db.js::listInvites
    - listener/src/db.js::revokeInvite
    - listener/src/db.js::redeemInvite
    - listener/src/db.js::createPasswordResetToken
    - listener/src/db.js::redeemResetToken
    - listener/src/db.js::listUsers
    - listener/src/db.js::disableUser
    - listener/src/db.js::enableUser
    - listener/src/db.js::removeUser
    - listener/src/db.js::revokeSessionsForUser
    - listener/src/db.js::setUserRole
    - listener/src/db.js::countAdmins
    - listener/src/db.js::validateSession (disabled_at guard)
  affects:
    - listener/src/auth-router.js (validateSession behavior changed — disabled users instantly lose sessions)
    - listener/src/auth-router.js (findUserByEmail now returns disabled_at)
    - listener/test/auth-router.integration.test.js (mock pool updated for new findUserByEmail SELECT)
tech_stack:
  added: []
  patterns:
    - Atomic single-statement UPDATE WHERE used_at IS NULL RETURNING (invite + reset token redemption)
    - pool-first positional arg for all new db.js exports
    - JSDoc on all exported functions
    - disabled_at IS NULL guard in validateSession WHERE clause (Pitfall 6)
key_files:
  created: []
  modified:
    - listener/src/db.js
    - listener/test/db-invites.test.js (Wave 0 stub replaced)
    - listener/test/db-session.test.js (extended with Phase-21 user-mgmt tests)
    - listener/test/auth-router.integration.test.js (mock pool fix for findUserByEmail)
decisions:
  - "redeemInvite and redeemResetToken use single-statement atomic UPDATE WHERE used_at IS NULL RETURNING — no transaction needed; UNIQUE token_hash on the table ensures only one concurrent UPDATE wins (T-21-03-REPLAY)"
  - "findUserByEmail SELECT extended to include disabled_at now (needed by Plan 21-05 forgot-password before this plan's routers are written)"
  - "countAdmins uses COUNT(*)::int cast so return type is JS number not string"
  - "disableUser does NOT call revokeSessionsForUser inline — routers handle the two-step (disable + revoke) for correct transactional composition with the last-admin guard (Plan 21-06)"
metrics:
  duration: "~45 minutes"
  completed: "2026-06-11"
  tasks_completed: 2
  tasks_total: 2
  files_created: 0
  files_modified: 4
---

# Phase 21 Plan 03: db.js CRUD Extension Summary

**One-liner:** 11 new exported db.js functions (invite + reset-token + user-management CRUD) plus the validateSession disabled_at guard — disabled users lose session validity on their very next request.

## Tasks Completed

| Task | Name | Commits | Key Files |
|------|------|---------|-----------|
| 1 (RED) | Failing tests for invite + reset-token CRUD | 0c7582d | listener/test/db-invites.test.js |
| 1 (GREEN) | Invite + reset-token CRUD + atomic redemption | 520f5c8 | listener/src/db.js |
| 2 (RED) | Failing tests for user-mgmt CRUD + disabled_at guard | 29a54ef | listener/test/db-session.test.js |
| 2 (GREEN) | User-mgmt CRUD + validateSession disabled_at guard | 73c03cf | listener/src/db.js, listener/test/auth-router.integration.test.js |

## What Was Built

### Task 1 — Invite CRUD + Password Reset Token CRUD

Added to `listener/src/db.js` under `// -- Invite CRUD --`:

- `createInvite(pool, { email, tokenHash, role='member', invitedBy=null, expiresAt })` — INSERT RETURNING id/email/role/expires_at
- `findInviteByEmail(pool, email)` — SELECT most recent pending invite for duplicate-check (used by invite-create route in Plan 21-06)
- `listInvites(pool)` — SELECT pending non-expired invites ORDER BY created_at DESC
- `revokeInvite(pool, inviteId)` — UPDATE WHERE status='pending' RETURNING id; returns null if already handled
- `redeemInvite(pool, tokenHash)` — atomic UPDATE WHERE status='pending' AND expires_at>NOW() AND used_at IS NULL RETURNING id/email/role

Added under `// -- Password Reset Token CRUD --`:

- `createPasswordResetToken(pool, { userId, tokenHash, expiresAt })` — INSERT RETURNING id
- `redeemResetToken(pool, tokenHash)` — atomic UPDATE WHERE expires_at>NOW() AND used_at IS NULL RETURNING id/user_id

**Atomicity guarantee:** Both `redeemInvite` and `redeemResetToken` are single-statement UPDATE operations. The `UNIQUE token_hash` column ensures only one concurrent UPDATE wins the race — a second call on the same token_hash finds `used_at IS NOT NULL` and returns zero rows → null (T-21-03-REPLAY). No transaction block required.

**Token security:** db.js functions receive `token_hash` (SHA-256 hex) only. They never call `generateToken()` — hashing happens in callers (routers). Verified: `grep -c "generateToken" listener/src/db.js` = 0 (T-21-03-TOKENLEAK).

Wave 0 stub in `listener/test/db-invites.test.js` replaced with 27 real tests covering all behaviors including double-redeem-returns-null for both invite and reset token.

### Task 2 — User Management CRUD + validateSession Guard

**The most security-critical line in this phase:**
```javascript
WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.id = s.user_id AND u.disabled_at IS NULL
```
`validateSession` now rejects sessions for disabled users immediately on the next request (USER-05, T-21-03-DISABLED). No grace period — the WHERE clause filter means the UPDATE returns zero rows → null.

Added to `listener/src/db.js` under `// -- User Management CRUD --`:

- `listUsers(pool)` — SELECT id/email/role/created_at/disabled_at ORDER BY created_at (USER-01)
- `disableUser(pool, userId)` — UPDATE SET disabled_at=NOW() RETURNING id/role/disabled_at
- `enableUser(pool, userId)` — UPDATE SET disabled_at=NULL RETURNING id/role/disabled_at
- `removeUser(pool, userId)` — DELETE RETURNING id; sessions cascade-delete via FK ON DELETE CASCADE (T-21-03-ORPHAN)
- `revokeSessionsForUser(pool, userId)` — DELETE FROM sessions WHERE user_id=$1 (used on disable + password change)
- `setUserRole(pool, userId, role)` — UPDATE SET role=$2 RETURNING id/email/role
- `countAdmins(pool)` — SELECT COUNT(*)::int WHERE role='admin' AND disabled_at IS NULL (primitive for last-admin guard in Plan 21-06)

`findUserByEmail` SELECT extended to include `disabled_at` (needed by Plan 21-05 forgot-password to skip disabled users).

`listener/test/db-session.test.js` extended with 18 new behavioral tests and 4 new source-inspection tests (40 total, was 22).

## Verification Results

```
cd listener && node --test test/db-invites.test.js
  tests 27, pass 27, fail 0

cd listener && node --test test/db-session.test.js
  tests 40, pass 40, fail 0

cd listener && node --test test/db-invites.test.js test/db-session.test.js
  tests 67, pass 67, fail 0

cd listener && npm test (full suite)
  tests 492, pass 492, fail 0
```

- `grep -c "disabled_at IS NULL" listener/src/db.js` = 2 (validateSession + countAdmins): PASS
- `grep -c "generateToken" listener/src/db.js` = 0: PASS
- Second redeemInvite on same token returns null: PASS (test line 202)
- Second redeemResetToken on same token returns null: PASS (test line 219)
- redeemResetToken on expired token returns null: PASS (test line 226)
- validateSession returns null after disableUser: PASS (test line 249)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] auth-router.integration.test.js mock pool broke after findUserByEmail SELECT extended**

- **Found during:** Task 2 GREEN — 5 auth-router integration tests failed with 500 (unexpected SQL)
- **Issue:** I added `disabled_at` to `findUserByEmail`'s SELECT, but the integration test's mock pool had a hardcoded pattern matching the old SQL: `SELECT id, email, password_hash, role FROM users WHERE email`
- **Fix:** Updated mock pool SQL matcher to `FROM users WHERE email` (more robust, matches both old and new SELECT)
- **Files modified:** `listener/test/auth-router.integration.test.js`
- **Commit:** 73c03cf (included in GREEN commit)

## TDD Gate Compliance

Both tasks followed strict RED → GREEN TDD:

- Task 1 RED: `0c7582d` — tests imported non-existent exports (`createInvite`, etc.), confirmed ERR_MODULE_NOT_FOUND
- Task 1 GREEN: `520f5c8` — 27/27 db-invites.test.js pass (plus mock pool fix for listInvites SQL pattern)
- Task 2 RED: `29a54ef` — import of non-existent `countAdmins` caused SyntaxError; tests confirmed failing
- Task 2 GREEN: `73c03cf` — 40/40 db-session.test.js + 492/492 full suite pass

## Known Stubs

None — all functions are fully implemented and tested.

## Threat Surface Scan

All changes are in `listener/src/db.js` (internal data layer, no new network endpoints). The threat model threats are fully mitigated:

| Threat ID | Status |
|-----------|--------|
| T-21-03-DISABLED | MITIGATED — `AND u.disabled_at IS NULL` in validateSession WHERE clause |
| T-21-03-REPLAY | MITIGATED — atomic UPDATE WHERE used_at IS NULL; double-redeem test proves null on second call |
| T-21-03-TOKENLEAK | MITIGATED — only token_hash stored; generateToken() count in db.js = 0 |
| T-21-03-ORPHAN | MITIGATED — removeUser relies on FK CASCADE; revokeSessionsForUser available for explicit purge |

No new network endpoints, auth paths, or file access patterns introduced.

## Self-Check: PASSED
