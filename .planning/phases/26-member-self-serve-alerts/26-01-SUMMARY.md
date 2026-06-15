---
phase: 26-member-self-serve-alerts
plan: "01"
subsystem: listener/migrations
tags: [migration, schema, alert_rules, ownership, phase-26]
dependency_graph:
  requires: [migration-0007-user-preferences]
  provides: [alert_rules.user_id, ix_alert_rules_user_id]
  affects: [alert_rules]
tech_stack:
  added: []
  patterns: [additive-migration, source-inspection-tests, js-backfill-simulation]
key_files:
  created:
    - listener/migrations/0008_alert_rules_owner.sql
    - listener/test/migration-0008-owner.test.js
  modified: []
decisions:
  - "D-03: migration 0008 uses ADD COLUMN user_id BIGINT nullable (auth-off installs may have no admin)"
  - "D-04: backfill sets user_id to lowest-id admin; subquery returns NULL when no admin exists (A1)"
  - "D-05: alert_deliveries untouched; delivery ownership derived by joining rule_id"
  - "D-02: alert_rules table reused; no new table; processAlertsForEvent unchanged"
metrics:
  duration: "~3 minutes"
  completed: "2026-06-15"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 0
  tests_added: 18
  tests_total: 703
requirements: [MALERT-03]
---

# Phase 26 Plan 01: Alert Rules Owner Migration Summary

**One-liner:** Additive SQL migration adds nullable `user_id BIGINT REFERENCES users(id) ON DELETE CASCADE` + `ix_alert_rules_user_id` index to `alert_rules`, backfilling existing rows to the bootstrap admin; 18-test suite verifies backfill semantics in-process without a live DB.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Write migration 0008_alert_rules_owner.sql | 862d436 | listener/migrations/0008_alert_rules_owner.sql |
| 2 | Backfill + column verification test | d0e606e | listener/test/migration-0008-owner.test.js |

## What Was Built

**Migration `0008_alert_rules_owner.sql`** — purely additive schema change following the `0007_user_preferences.sql` format-of-record (bare SQL with `-- Up Migration` / `-- Down Migration` markers):

Up section:
1. `ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE CASCADE` — nullable by design; auth-off installs with no admin user leave it NULL (A1/D-03)
2. `CREATE INDEX IF NOT EXISTS ix_alert_rules_user_id ON alert_rules (user_id)` — supports efficient per-user WHERE clauses in plan 26-02
3. Backfill UPDATE: assigns existing rows to the lowest-id admin; when no admin exists the subquery yields NULL and rows stay NULL (D-04)

Down section: `DROP INDEX IF EXISTS` + `DROP COLUMN IF EXISTS` — clean rollback without data loss to other columns.

Constraints respected: no `CREATE TABLE` (D-02), no `alert_deliveries` touch (D-05), no `processAlertsForEvent` change (D-02).

**Test `migration-0008-owner.test.js`** — 18 tests in two tiers:
- Source-inspection tests (read SQL file, assert on string content): Up/Down markers, column type/nullability, index, no new table, no deliveries touch, Down rollback statements
- JS backfill simulation: models the UPDATE semantics in-process to assert (1) lowest-id admin wins, (2) target_url untouched, (3) NULL when no admin, (4) pre-existing user_id not overwritten

Full suite: 703/703 tests pass.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

```
grep gate:       OK (ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE CASCADE, ix_alert_rules_user_id, no CREATE TABLE)
npm test:        703/703 pass
```

Manual-only verification (per 26-VALIDATION.md): `0008` Up/Down applies cleanly on a real Postgres snapshot — not performed in this plan (DDL-against-live-DB is out of scope).

## Known Stubs

None. Migration and tests are complete. No UI or API surface is introduced in this plan.

## Threat Flags

None. This plan introduces only an additive schema migration with no new network endpoints, auth paths, or trust boundary crossings.

## Self-Check: PASSED

- [x] `listener/migrations/0008_alert_rules_owner.sql` exists
- [x] `listener/test/migration-0008-owner.test.js` exists
- [x] Commit 862d436 present (`feat(26-01): add migration 0008_alert_rules_owner`)
- [x] Commit d0e606e present (`test(26-01): backfill + column verification tests for migration 0008`)
- [x] All 18 new tests pass; 703/703 total listener tests pass
