---
phase: 04-router-extraction-simple-groups
plan: "02"
subsystem: listener/api
tags: [router-extraction, stats, health, testing, refactor]
dependency_graph:
  requires: [04-01]
  provides: [stats-router, health-router, stats-integration-tests, health-integration-tests]
  affects: [listener/src/index.js, listener/src/stats-router.js, listener/src/health-router.js]
tech_stack:
  added: []
  patterns: [factory-function-router, getter-callback-injection, per-request-getter]
key_files:
  created:
    - listener/src/stats-router.js
    - listener/src/health-router.js
    - listener/test/stats-router.integration.test.js
    - listener/test/health-router.integration.test.js
  modified:
    - listener/src/index.js
decisions:
  - "getRetentionSettings() called per-request inside quiet-hours handler (RTR-09) — avoids capturing stale settings value at construction time"
  - "getMatterRuntime() called per-request inside health handler — avoids null capture pitfall when runtime starts null and is set later"
  - "detectOutliers imported directly in stats-router.js (pure function, no external deps)"
  - "cached injected as factory parameter (not imported) — enables test bypass with (_key, fn) => fn()"
metrics:
  duration_min: 8
  completed_date: "2026-04-02"
  tasks_completed: 3
  files_changed: 5
---

# Phase 04 Plan 02: Stats Router and Health Router Extraction Summary

**One-liner:** Extracted 10 stats routes and 1 health endpoint from index.js into factory-function routers with getter callback injection, adding 11 integration tests (191 total passing).

## What Was Built

### listener/src/stats-router.js

A `createStatsRouter({ pool, cached, getRooms, getRetentionSettings })` factory. Contains all 10 stats routes:

- `GET /stats/hourly` — cached 60s, events by UTC hour over 30 days
- `GET /stats/daily` — cached 60s, daily event counts with `days` param (7–365, default 30)
- `GET /stats/top-devices` — direct query, top 10 devices with room name override via `getRooms()`
- `GET /stats/rooms` — direct query, event totals grouped by room with room override
- `GET /stats/weekday` — cached 120s, day-of-week × hour-of-day matrix with `days` param (7–365, default 90)
- `GET /stats/heatmap` — cached 60s, accessory × hour heatmap over 7 days
- `GET /stats/device-patterns` — cached 120s, accessory × hour activity over 30 days
- `GET /stats/anomalies` — cached 120s, two parallel queries + `detectOutliers()` sliced to 50 each
- `GET /stats/quiet-hours` — direct query, reads `getRetentionSettings()` per-request (RTR-09)

Rate limiter uses `parseIntInRange` with `API_STATS_RATE_LIMIT_WINDOW_MS` / `API_STATS_RATE_LIMIT_MAX` env vars.

### listener/src/health-router.js

A `createHealthRouter({ pool, getSubscriberHealth, getMatterRuntime, loadPairings, alertsEnabled })` factory. Contains `GET /health`:

- DB connectivity check via `pool.query('SELECT 1')`
- Subscriber health with 2-minute grace period for transient disconnects
- `getMatterRuntime()` called per-request to avoid null capture
- Returns 200 (healthy) or 503 (unhealthy) with structured JSON

### listener/src/index.js

- Added imports for `createStatsRouter` and `createHealthRouter`
- Removed all 10 inline stats route handlers (`app.get('/api/stats/...')`)
- Removed inline health route handler (`app.get('/api/health', ...)`)
- Added `app.use('/api', createStatsRouter({ pool, cached, getRooms: loadRooms, getRetentionSettings: () => retentionSettings }))` mount
- Added `app.use('/api', createHealthRouter({ pool, getSubscriberHealth, getMatterRuntime: () => matterRuntime, loadPairings, alertsEnabled: ALERTS_ENABLED }))` mount

### Integration Tests

**listener/test/stats-router.integration.test.js** (7 tests):
1. hourly — returns rows
2. daily — respects `days` param (parsed via `parseIntInRange`)
3. top-devices — applies room overrides from `getRooms()`
4. quiet-hours disabled — returns early without querying DB
5. quiet-hours enabled — queries DB and returns events (RTR-09 getter verification)
6. anomalies — returns outlier structure with `generatedAt`, `devices`, `rooms`
7. hourly DB error — returns 500 with `'Internal server error'`

**listener/test/health-router.integration.test.js** (4 tests):
1. healthy (all OK) — 200, status ok, db ok, paired count, alertsEnabled, matter null
2. DB-down unhealthy — 503, status unhealthy, db unreachable
3. matter runtime present — reports commissionConfigured, activeNodes
4. grace period — recently disconnected subscriber (30s ago) is still healthy

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all routes are fully wired with real SQL queries matching the original index.js implementations.

## Self-Check: PASSED

Files created:
- listener/src/stats-router.js — exists
- listener/src/health-router.js — exists
- listener/test/stats-router.integration.test.js — exists
- listener/test/health-router.integration.test.js — exists

Commits:
- 40f20b3 — feat(04-02): extract stats routes into stats-router.js factory
- 4d39398 — feat(04-02): extract health endpoint into health-router.js factory
- 6ea79f3 — test(04-02): add integration tests for stats-router and health-router

Test results: 191 pass, 0 fail (was 180; added 11 new tests)
