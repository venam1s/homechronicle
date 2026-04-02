# Roadmap: HomeChronicle — Code Health Milestone

## Overview

Six sequential phases transform the 2,100-line `index.js` monolith into a maintainable, testable service. The sequence is lowest-risk-first: a zero-risk error handler safety net lands first, then a formal migration system before any new schema changes, then a COUNT optimization that delivers visible perf improvement independently, then router extraction in dependency order from simplest to most complex. Every router extraction ships with its integration tests in the same phase.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Error Handler Foundation** - Add process-level error containment and silent-catch logging
- [ ] **Phase 2: Migration System** - Adopt node-pg-migrate, retire init.sql, add alert_deliveries retention
- [x] **Phase 3: COUNT Optimization** - Replace full-table COUNT(*) with estimated reltuples for unfiltered pagination (completed 2026-04-02)
- [x] **Phase 4: Router Extraction (Simple)** - Extract utils, archive, data, stats, and health routers with integration tests (completed 2026-04-02)
- [x] **Phase 5: Router Extraction (Accessories)** - Extract accessories router with integration tests (completed 2026-04-02)
- [ ] **Phase 6: Router Extraction (Setup)** - Extract setup/pairing router with integration tests; index.js reaches target size

## Phase Details

### Phase 1: Error Handler Foundation
**Goal**: The listener process surfaces all errors rather than failing silently
**Depends on**: Nothing (first phase)
**Requirements**: ERR-01, ERR-02, ERR-03, ERR-04
**Success Criteria** (what must be TRUE):
  1. An unhandled promise rejection is logged at error level and the process continues running (HAP subscriptions survive)
  2. An uncaught exception is logged and the process exits with code 1 (Docker restarts it with full crash context)
  3. Any Express route that throws returns a structured JSON error response instead of crashing or hanging
  4. A pairing or Matter cleanup failure that was previously swallowed now emits a debug-level log line visible in `docker compose logs`
**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md — Register process handlers (ERR-01, ERR-02) + Express error middleware (ERR-03) + test file
- [x] 01-02-PLAN.md — Convert all silent catch blocks to log.debug() calls (ERR-04)

### Phase 2: Migration System
**Goal**: Database schema changes are versioned, reproducible, and safe to apply on existing installs
**Depends on**: Phase 1
**Requirements**: MIG-01, MIG-02, MIG-03, MIG-04, MIG-05, PERF-04, PERF-05
**Success Criteria** (what must be TRUE):
  1. A fresh Docker install runs all migrations and reaches a fully operational schema without manual SQL
  2. An existing install with live data runs the bootstrap and reaches the same schema state without data loss (init migration fake-applied)
  3. `alert_deliveries` rows older than the configured threshold are swept on startup and on schedule
  4. A `sent_at` index exists on `alert_deliveries` so listing and sweep queries avoid full scans
  5. `db/init.sql` is no longer the schema authority — migrations are the sole source for both new and upgraded installs
**Plans**: 2 plans

Plans:
- [x] 02-01-PLAN.md — Install node-pg-migrate, create migration files, rewrite migrateDb() with existing-install detection
- [x] 02-02-PLAN.md — Add alert_deliveries retention sweep, retire init.sql from Docker configs

### Phase 3: COUNT Optimization
**Goal**: Paginated timeline requests no longer trigger a full table scan on every load
**Depends on**: Phase 2
**Requirements**: PERF-01, PERF-02, PERF-03
**Success Criteria** (what must be TRUE):
  1. An unfiltered `/api/events` request returns a count sourced from `pg_class.reltuples` rather than `COUNT(*)`
  2. The API response includes `"estimated": true` when the estimated count is used so callers know the value is approximate
  3. A filtered `/api/events` request (by device, date range, etc.) still returns an exact `COUNT(*)` result
  4. On a fresh install where `reltuples` is zero or negative, the endpoint falls back to exact count and does not return zero
**Plans**: 1 plan

Plans:
- [x] 03-01-PLAN.md — TDD: Replace COUNT(*) with reltuples for unfiltered /api/events pagination

### Phase 4: Router Extraction (Simple Groups)
**Goal**: Archive, data, stats, and health routes live in dedicated router files; shared utilities no longer couple routers together
**Depends on**: Phase 3
**Requirements**: RTR-01, RTR-02, RTR-03, RTR-04, RTR-07, RTR-09, TST-01, TST-02, TST-03, TST-06
**Success Criteria** (what must be TRUE):
  1. `utils.js` exists and all existing `alerts-router.js` → `events-router.js` utility imports are replaced with imports from `utils.js`
  2. `archive-router.js`, `stats-router.js`, and `health-router.js` each exist as factory-function routers and are mounted in `index.js`
  3. Integration tests for each extracted router pass under `npm test` using the existing mock-pool pattern
  4. All pre-existing tests continue to pass (`npm test` green) after extraction
  5. `retentionSettings` is accessed via a `getRetentionSettings()` callback in every router that needs it, not captured by value at construction
**Plans**: 2 plans

Plans:
- [x] 04-01-PLAN.md — Extract utils.js + archive-router.js with integration tests (RTR-01, RTR-02, RTR-07, RTR-09, TST-01)
- [x] 04-02-PLAN.md — Extract stats-router.js + health-router.js with integration tests (RTR-03, RTR-04, RTR-07, RTR-09, TST-02, TST-03, TST-06)

### Phase 5: Router Extraction (Accessories)
**Goal**: Accessories routes live in a dedicated router file with full integration test coverage
**Depends on**: Phase 4
**Requirements**: RTR-05, TST-04
**Success Criteria** (what must be TRUE):
  1. `accessories-router.js` exists as a factory-function router and is mounted in `index.js`
  2. Integration tests for `accessories-router.js` pass under `npm test` covering list, detail, and characteristic history endpoints
  3. All pre-existing tests continue to pass after extraction
  4. `index.js` is below 800 lines after this extraction
**Plans**: 1 plan

Plans:
- [x] 05-01-PLAN.md — Extract accessories-router.js factory with integration tests (RTR-05, TST-04)

### Phase 6: Router Extraction (Setup)
**Goal**: Setup, pairing, rooms, display-names, notes, and log-level routes live in a dedicated router file; index.js reaches its target size
**Depends on**: Phase 5
**Requirements**: RTR-06, RTR-08, RTR-10, TST-05
**Success Criteria** (what must be TRUE):
  1. `setup-router.js` exists as a factory-function router covering pairing, repair, add-pairing, rooms, display-names, notes, and log-level endpoints
  2. `discoveryCache` is accessed exclusively via getter/setter callbacks injected at construction time — no snapshot captured at startup
  3. Integration tests for `setup-router.js` pass under `npm test` and include at least one test that exercises a route after simulating a cache state change
  4. `index.js` is between 300 and 400 lines and contains only store init, Matter/HAP bootstrap, background jobs, middleware registration, router mounts, and `app.listen()`
**Plans**: 2 plans

Plans:
- [ ] 06-01-PLAN.md — Extract setup-router.js factory with all 18 route handlers and wire into index.js (RTR-06, RTR-08, RTR-10)
- [ ] 06-02-PLAN.md — Create integration tests for setup-router.js (TST-05)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Error Handler Foundation | 1/2 | In Progress|  |
| 2. Migration System | 1/2 | In Progress|  |
| 3. COUNT Optimization | 1/1 | Complete   | 2026-04-02 |
| 4. Router Extraction (Simple) | 2/2 | Complete   | 2026-04-02 |
| 5. Router Extraction (Accessories) | 1/1 | Complete   | 2026-04-02 |
| 6. Router Extraction (Setup) | 0/2 | Not started | - |
