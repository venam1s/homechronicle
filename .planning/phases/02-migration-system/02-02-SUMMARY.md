---
phase: 02-migration-system
plan: "02"
subsystem: listener/database
tags: [retention, alert-deliveries, docker, migrations, env-vars]
dependency_graph:
  requires: [02-01]
  provides: [alert-deliveries-retention, init-sql-retirement]
  affects: [listener/src/db.js, listener/src/index.js, docker-compose.yml, docker-compose.beta.yml, docker-compose.portainer.yml, Dockerfile.standalone, db/init.sql]
tech_stack:
  added: []
  patterns: [transaction-pattern, retention-sweep, env-var-defaulting]
key_files:
  created:
    - listener/test/db-alert-retention.test.js
  modified:
    - listener/src/db.js
    - listener/src/index.js
    - docker-compose.yml
    - docker-compose.beta.yml
    - docker-compose.portainer.yml
    - Dockerfile.standalone
    - db/init.sql
    - .env.example
decisions:
  - "Static source inspection for tests — consistent with project pattern (no ESM mock.module() support in Node.js native test runner)"
  - "db/init.sql kept as reference but fully retired from all Docker entrypoints"
metrics:
  duration_minutes: 8
  completed_date: "2026-04-02"
  tasks_completed: 2
  files_changed: 8
---

# Phase 02 Plan 02: Alert Deliveries Retention Sweep and init.sql Retirement Summary

**One-liner:** Added alert_deliveries retention sweep with ALERT_RETENTION_DAYS env var (default 90), wired into runRetentionSweepSafe(), and removed db/init.sql from all Docker configs — migrations are now the sole schema source.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Add runAlertDeliveriesRetentionSweep() to db.js and wire into index.js | ccd4e84 | listener/src/db.js, listener/src/index.js, listener/test/db-alert-retention.test.js, .env.example |
| 2 | Retire db/init.sql from Docker configs and add deprecation comment | 9e994e8 | docker-compose.yml, docker-compose.beta.yml, docker-compose.portainer.yml, Dockerfile.standalone, db/init.sql |

## What Was Built

- **runAlertDeliveriesRetentionSweep()** in `listener/src/db.js` — DELETE FROM alert_deliveries WHERE sent_at < NOW() - (N days), wrapped in BEGIN/COMMIT/ROLLBACK transaction, with early-return guard for non-positive retentionDays. Same pattern as runRetentionSweep().
- **ALERT_RETENTION_DAYS** constant in `listener/src/index.js` — parsed from env var with 90-day default.
- **runRetentionSweepSafe() extension** — alert_deliveries sweep now runs after event_logs sweep, with its own try/catch and log.info on deletion.
- **10 unit tests** in `listener/test/db-alert-retention.test.js` — static source inspection (function signature, SQL pattern, BEGIN/COMMIT/ROLLBACK, client.release(), parameterized $1) plus behavioral tests for invalid retentionDays (0, -1, NaN, Infinity).
- **db/init.sql retirement** — init.sql volume mount removed from docker-compose.yml, docker-compose.beta.yml, docker-compose.portainer.yml; COPY removed from Dockerfile.standalone. Deprecation comment added to db/init.sql.
- **.env.example** — ALERT_RETENTION_DAYS documented with comment.

## Decisions Made

1. **Static source inspection for tests**: Consistent with the project's established test pattern (as in matter-controller.test.js and db-migration.test.js). Node.js native test runner has no reliable ESM mock.module() support.
2. **init.sql retained as reference**: File kept on disk with DEPRECATED comment — existing content unchanged. Useful for operators who want a human-readable schema reference.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all functionality is fully implemented.

## Verification Results

- `npm test` in listener/: 169/169 tests pass
- `grep -c 'init.sql' docker-compose.yml docker-compose.beta.yml docker-compose.portainer.yml Dockerfile.standalone`: all 0
- `head -3 db/init.sql`: shows DEPRECATED comment
- `grep 'ALERT_RETENTION_DAYS' listener/src/index.js .env.example`: present in both
- `grep 'runAlertDeliveriesRetentionSweep' listener/src/db.js listener/src/index.js`: present in both

## Self-Check: PASSED
