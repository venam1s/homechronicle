---
phase: 23-security-hardening-nginx-cutover
plan: 04
subsystem: database
tags: [postgres, retention, sweep, invites, password-reset, node-test]

# Dependency graph
requires:
  - phase: 23-security-hardening-nginx-cutover
    provides: sessions API (Plan 02) — full listener suite green baseline
  - phase: 21-email-infrastructure-invites-password-reset
    provides: invites + password_reset_tokens tables (migration 0004)
provides:
  - db.js runInviteTokenSweep + runPasswordResetTokenSweep (delete-only, transactional)
  - both folded into runRetentionSweepSafe (startup + existing setInterval, no new timer)
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-level-pool delete-only sweep mirroring runSessionRetentionSweep; isolated try/catch per sweep"

key-files:
  created:
    - listener/test/token-sweep.test.js
  modified:
    - listener/src/db.js
    - listener/src/index.js

key-decisions:
  - "token-sweep.test.js uses SOURCE-INSPECTION (read db.js, assert DELETE predicate + transactional shape + { deleted } return), NOT the fake-pool execution the plan's <behavior> described: runInviteTokenSweep/runPasswordResetTokenSweep use the module-level pool (per the plan's own <interfaces> — no pool arg), which cannot be injected with a fake pool and would hit a real DB if executed. This mirrors the established pattern for runAlertDeliveriesRetentionSweep (test/db-alert-retention.test.js)."
  - "Invite predicate: used_at IS NOT NULL OR expires_at < NOW() OR status != 'pending' (status is NOT NULL DEFAULT 'pending' per migration 0004 → != is null-safe). Reset predicate: used_at IS NOT NULL OR expires_at < NOW()."
  - "No new timer — both sweeps appended as independent try/catch blocks inside runRetentionSweepSafe after the sessions sweep; the existing startup call + setInterval drive them (D-05)."

patterns-established:
  - "Each retention sweep is isolated in its own try/catch logging [retention] ... so one failing never blocks the others"

requirements-completed: [SEC-06]

# Metrics
duration: ~15min
completed: 2026-06-13
---

# Phase 23 / Plan 04: Token Sweep Summary

**SEC-06: expired/consumed invite and password-reset-token rows are now purged automatically inside the existing retention cycle (startup + periodic, no new timer) — the relocated token-sweep RED scaffold goes RED→GREEN within this plan and the full listener suite is 607/607.**

## Accomplishments
- `db.js`: `runInviteTokenSweep()` (DELETE FROM invites WHERE used_at IS NOT NULL OR expires_at < NOW() OR status != 'pending') and `runPasswordResetTokenSweep()` (DELETE FROM password_reset_tokens WHERE used_at IS NOT NULL OR expires_at < NOW()) — both delete-only, transactional (BEGIN/COMMIT/ROLLBACK + client.release in finally), return `{ deleted }`, mirroring `runSessionRetentionSweep`.
- `index.js`: both added to the `./db.js` import and appended as two independent try/catch blocks inside `runRetentionSweepSafe` after the sessions sweep; no new `setInterval`.
- `token-sweep.test.js` (relocated from Plan 01): source-inspection of both sweep predicates + transactional shape + `{ deleted }` return. +4 tests.

## Task Commits
1. **Task 1: db.js sweeps + RED→GREEN test** — `feat(23-04): runInviteTokenSweep + runPasswordResetTokenSweep delete-only functions + RED→GREEN test`
2. **Task 2: fold into runRetentionSweepSafe** — `feat(23-04): fold invite + reset-token sweeps into runRetentionSweepSafe (no new timer)`

## Self-Check: PASSED
- `cd listener && npm test` → 607/607 pass, 0 fail (the last Phase-23 RED scaffold is now GREEN).
- SWEEP-OK (exports + predicates) and WIRING-OK (import + both calls in index.js) greps pass.
- No new timer added (verified: only the two new try/catch blocks inside the existing runRetentionSweepSafe).

## Deviation
- Test uses source-inspection rather than fake-pool execution (module-level pool can't be injected) — matches the existing runAlertDeliveriesRetentionSweep test pattern; same predicate/shape coverage.
