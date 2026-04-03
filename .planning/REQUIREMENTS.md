# Requirements: HomeChronicle

**Defined:** 2026-04-02
**Core Value:** A reliable, maintainable codebase that self-hosted users can trust to run unattended for months without performance degradation or silent failures.

## v1.0 Requirements (Complete)

All v1.0 requirements validated — see MILESTONES archive for details.

<details>
<summary>v1.0 Code Health (30 requirements, all complete)</summary>

### Error Handling

- [x] **ERR-01**: Listener registers `process.on('unhandledRejection')` handler that logs the error without exiting
- [x] **ERR-02**: Listener registers `process.on('uncaughtException')` handler that logs the error and calls `process.exit(1)`
- [x] **ERR-03**: Express app has a global error middleware as the last `app.use()` that logs errors and returns a structured JSON response
- [x] **ERR-04**: All silent `catch {}` blocks in discovery and Matter cleanup paths are replaced with `log.debug()` calls

### Database Migrations

- [x] **MIG-01**: `node-pg-migrate` v8 is installed and configured with a programmatic runner called at listener startup
- [x] **MIG-02**: Existing schema is captured as migration 0001 that is auto-skipped on existing installs
- [x] **MIG-03**: `listener/migrations/` directory contains versioned migration files
- [x] **MIG-04**: `db/init.sql` is retired — migrations are the sole schema source
- [x] **MIG-05**: `migrateDb()` function is removed or reduced to only call the migration runner

### Performance

- [x] **PERF-01**: Unfiltered `/api/events` pagination uses `reltuples` estimate instead of `COUNT(*)`
- [x] **PERF-02**: Filtered `/api/events` pagination continues to use exact `COUNT(*)`
- [x] **PERF-03**: API response includes an `estimated: true` flag when estimated count is used
- [x] **PERF-04**: `alert_deliveries` table has a retention sweep
- [x] **PERF-05**: `alert_deliveries` table has an index on `sent_at`

### Router Extraction

- [x] **RTR-01**: Shared utilities extracted to `listener/src/utils.js`
- [x] **RTR-02**: Archive routes extracted to `listener/src/archive-router.js`
- [x] **RTR-03**: Stats routes extracted to `listener/src/stats-router.js`
- [x] **RTR-04**: Health endpoint extracted to `listener/src/health-router.js`
- [x] **RTR-05**: Accessories routes extracted to `listener/src/accessories-router.js`
- [x] **RTR-06**: Setup routes extracted to `listener/src/setup-router.js`
- [x] **RTR-07**: Factory function pattern used consistently
- [x] **RTR-08**: `discoveryCache` passed via getter/setter callbacks
- [x] **RTR-09**: `retentionSettings` passed via callback
- [x] **RTR-10**: `index.js` reduced to ~477 lines

### Testing

- [x] **TST-01**: Integration tests for `archive-router.js`
- [x] **TST-02**: Integration tests for `stats-router.js`
- [x] **TST-03**: Integration tests for `health-router.js`
- [x] **TST-04**: Integration tests for `accessories-router.js`
- [x] **TST-05**: Integration tests for `setup-router.js`
- [x] **TST-06**: All existing tests pass after extraction

</details>

## v1.1 Requirements

Requirements for milestone v1.1 — Scheduled Repair.

### Scheduled Repair

- [ ] **SREP-01**: User can enable/disable scheduled repair from Manage > Settings (disabled by default)
- [x] **SREP-02**: When enabled, listener runs a daily repair cycle that re-pairs only HomeKit devices flagged as `needs_repair`
- [ ] **SREP-03**: Scheduled repair setting persists across container restarts via JsonObjectStore
- [ ] **SREP-04**: Settings UI explains why users might want scheduled repair enabled (informational text)
- [x] **SREP-05**: Scheduled repair runs and outcomes are logged (which devices were repaired, skipped, or failed)

## Future Requirements

Deferred to future milestones.

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
| HTTPS/TLS termination | Documentation concern, not code |
| Database backup scripts | Operational docs, not code health |
| Frontend test coverage | Separate concern |
| E2E test expansion | Separate concern |
| Configurable repair interval | Daily is sufficient; revisit if users request it |
| Matter device repair | Matter uses polling, not persistent connections |
| Repair notifications/alerts | Could integrate with alert system later |
| Repair history UI | Logs are sufficient for v1.1 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SREP-01 | Phase 9 | Pending |
| SREP-02 | Phase 8 | Complete |
| SREP-03 | Phase 8 | Pending |
| SREP-04 | Phase 9 | Pending |
| SREP-05 | Phase 8 | Complete |

**Coverage:**
- v1.1 requirements: 5 total
- Mapped to phases: 5
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-02*
*Last updated: 2026-04-03 after roadmap creation for v1.1*
