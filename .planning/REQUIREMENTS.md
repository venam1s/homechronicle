# Requirements: HomeChronicle Code Health

**Defined:** 2026-04-02
**Core Value:** A reliable, maintainable codebase that self-hosted users can trust to run unattended for months without performance degradation or silent failures.

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Error Handling

- [x] **ERR-01**: Listener registers `process.on('unhandledRejection')` handler that logs the error without exiting
- [x] **ERR-02**: Listener registers `process.on('uncaughtException')` handler that logs the error and calls `process.exit(1)`
- [x] **ERR-03**: Express app has a global error middleware as the last `app.use()` that logs errors and returns a structured JSON response
- [x] **ERR-04**: All silent `catch {}` blocks in discovery and Matter cleanup paths are replaced with `log.debug()` calls

### Database Migrations

- [x] **MIG-01**: `node-pg-migrate` v8 is installed and configured with a programmatic runner called at listener startup
- [x] **MIG-02**: Existing schema is captured as migration 0001 that is auto-skipped on existing installs (via `--fake` or equivalent)
- [x] **MIG-03**: `listener/migrations/` directory contains versioned migration files
- [x] **MIG-04**: `db/init.sql` is retired — migrations are the sole schema source for both fresh and upgraded installs
- [x] **MIG-05**: `migrateDb()` function is removed or reduced to only call the migration runner

### Performance

- [x] **PERF-01**: Unfiltered `/api/events` pagination uses `reltuples` estimate instead of `COUNT(*)`, with a fallback to exact count when `reltuples <= 0` (fresh installs)
- [x] **PERF-02**: Filtered `/api/events` pagination continues to use exact `COUNT(*)` (already scoped by index)
- [x] **PERF-03**: API response includes an `estimated: true` flag when estimated count is used
- [x] **PERF-04**: `alert_deliveries` table has a retention sweep that deletes rows older than a configurable threshold (default 90 days)
- [x] **PERF-05**: `alert_deliveries` table has an index on `sent_at` for efficient retention sweep and listing queries

### Router Extraction

- [x] **RTR-01**: `parseIntInRange` and other shared utilities are extracted to `listener/src/utils.js`
- [x] **RTR-02**: Archive and data management routes are extracted to `listener/src/archive-router.js`
- [x] **RTR-03**: Stats routes are extracted to `listener/src/stats-router.js`
- [x] **RTR-04**: Health endpoint is extracted to `listener/src/health-router.js`
- [x] **RTR-05**: Accessories routes are extracted to `listener/src/accessories-router.js`
- [ ] **RTR-06**: Setup, pairing, rooms, display-names, notes, and log-level routes are extracted to `listener/src/setup-router.js`
- [x] **RTR-07**: Extracted routers use the factory function pattern (`createXxxRouter(deps)`) consistent with existing routers
- [ ] **RTR-08**: `discoveryCache` is passed to setup-router via getter/setter callbacks, not by value
- [x] **RTR-09**: `retentionSettings` is passed to routers via `getRetentionSettings()` callback
- [ ] **RTR-10**: After extraction, `index.js` contains only store init, Matter/HAP bootstrap, background jobs, global middleware, router mounts, and `app.listen()` (~300-400 lines)

### Testing

- [x] **TST-01**: Integration tests exist for `archive-router.js` following the existing mock-pool pattern
- [x] **TST-02**: Integration tests exist for `stats-router.js`
- [x] **TST-03**: Integration tests exist for `health-router.js`
- [x] **TST-04**: Integration tests exist for `accessories-router.js`
- [ ] **TST-05**: Integration tests exist for `setup-router.js`
- [x] **TST-06**: All existing tests continue to pass after extraction (`npm test` in listener/)

## v2 Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Observability

- **OBS-01**: Centralized `config.js` module for all environment variable parsing
- **OBS-02**: Optional JSON structured logging format for production
- **OBS-03**: Request ID propagation through log entries
- **OBS-04**: Optional Prometheus metrics endpoint

### Scalability

- **SCAL-01**: Database connection pool tuning via environment variables
- **SCAL-02**: In-memory query cache LRU eviction with max-entries limit
- **SCAL-03**: Keyset/cursor pagination for events API
- **SCAL-04**: Time-based table partitioning for event_logs

## Out of Scope

| Feature | Reason |
|---------|--------|
| HTTPS/TLS termination | Documentation concern, not code — users configure their own reverse proxy |
| Database backup scripts | Operational docs, not code health |
| Frontend test coverage | Separate concern from backend health milestone |
| E2E test expansion | Separate concern |
| CORS default changes | Low risk, low impact — defer |
| Pairing PIN encryption | Acceptable for self-hosted use per security review |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ERR-01 | Phase 1 | Complete |
| ERR-02 | Phase 1 | Complete |
| ERR-03 | Phase 1 | Complete |
| ERR-04 | Phase 1 | Complete |
| MIG-01 | Phase 2 | Complete |
| MIG-02 | Phase 2 | Complete |
| MIG-03 | Phase 2 | Complete |
| MIG-04 | Phase 2 | Complete |
| MIG-05 | Phase 2 | Complete |
| PERF-04 | Phase 2 | Complete |
| PERF-05 | Phase 2 | Complete |
| PERF-01 | Phase 3 | Complete |
| PERF-02 | Phase 3 | Complete |
| PERF-03 | Phase 3 | Complete |
| RTR-01 | Phase 4 | Complete |
| RTR-02 | Phase 4 | Complete |
| RTR-03 | Phase 4 | Complete |
| RTR-04 | Phase 4 | Complete |
| RTR-07 | Phase 4 | Complete |
| RTR-09 | Phase 4 | Complete |
| TST-01 | Phase 4 | Complete |
| TST-02 | Phase 4 | Complete |
| TST-03 | Phase 4 | Complete |
| TST-06 | Phase 4 | Complete |
| RTR-05 | Phase 5 | Complete |
| TST-04 | Phase 5 | Complete |
| RTR-06 | Phase 6 | Pending |
| RTR-08 | Phase 6 | Pending |
| RTR-10 | Phase 6 | Pending |
| TST-05 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0

---
*Requirements defined: 2026-04-02*
*Last updated: 2026-04-02 after roadmap creation*
