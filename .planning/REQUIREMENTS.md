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

## v1.1 Requirements (Complete)

<details>
<summary>v1.1 Scheduled Repair (5 requirements, all complete)</summary>

### Scheduled Repair

- [x] **SREP-01**: User can enable/disable scheduled repair from Manage > Settings (disabled by default)
- [x] **SREP-02**: When enabled, listener runs a daily repair cycle that re-pairs only HomeKit devices flagged as `needs_repair`
- [x] **SREP-03**: Scheduled repair setting persists across container restarts via JsonObjectStore
- [x] **SREP-04**: Settings UI explains why users might want scheduled repair enabled (informational text)
- [x] **SREP-05**: Scheduled repair runs and outcomes are logged (which devices were repaired, skipped, or failed)

</details>

## v1.2 Requirements

Requirements for milestone v1.2 — UI Redesign.

### Theming

- [x] **THEME-01**: User can switch between light and dark modes with a toggle in the sidebar
- [x] **THEME-02**: All components use semantic design tokens — no hardcoded dark: classes remain
- [x] **THEME-03**: User can choose from 3-5 accent color presets (e.g., blue, purple, teal, amber, rose)
- [x] **THEME-04**: User's theme and accent preferences persist across sessions via localStorage
- [x] **THEME-05**: Existing chart components render correctly with the new token system (--hc-accent-rgb compatibility)

### Navigation

- [x] **NAV-01**: User sees a vertical sidebar with reorganized navigation sections replacing the top tab bar
- [x] **NAV-02**: User can collapse the sidebar to icon-only mode
- [x] **NAV-03**: User's sidebar collapse preference persists across sessions
- [x] **NAV-04**: On mobile, user accesses navigation via a slide-out sheet drawer
- [x] **NAV-05**: Active page is clearly indicated in the sidebar with visual highlight

### Layout

- [x] **LAYOUT-01**: User sees a modern card-based layout with clean spacing, soft shadows, and contemporary typography
- [x] **LAYOUT-02**: App.jsx is restructured into a slim shell with extracted page components
- [x] **LAYOUT-03**: All existing functionality (Dashboard, Timeline, Accessories, Manage) remains accessible

### Widgets

- [x] **WIDGET-01**: User sees KPI health summary cards on the dashboard (online/offline/stale device counts)
- [x] **WIDGET-02**: KPI cards show trend deltas compared to previous period
- [x] **WIDGET-03**: User sees a live activity feed widget with recent events
- [x] **WIDGET-04**: Activity feed pauses scrolling when user is reading (scroll-lock behavior)
- [x] **WIDGET-05**: User sees room-by-room breakdown cards with device counts and health badges

### Charts

- [x] **CHART-01**: Charts use modern styling with gradient fills, smooth curves, and theme-aware colors
- [x] **CHART-02**: KPI cards include sparkline/mini trend visualizations
- [x] **CHART-03**: Existing chart types (activity, heatmap, state duration, event history) are preserved with updated styling

### Responsive

- [x] **RESP-01**: Sidebar auto-collapses to icon-only on narrow viewports
- [x] **RESP-02**: Dashboard widgets reflow to single-column on mobile

## v1.3 Requirements (In Progress)

Requirements for milestone v1.3 — Repair Reliability Fixes.

### Scheduled Repair — Subscriber Restart (Phase 18)

- [x] **REPAIR-01
**: The `needsRepair` success branch in `listener/src/repair-scheduler.js` `runRepairCycle()` calls `stopSubscriber(deviceId)` followed by `startSubscriber(deviceId, pairing, loadRooms(), getPairingForLookup)` after a successful `savePairing`. Net effect matches the `isStale` branch (lines 121–139) and the manual `POST /api/setup/repair/:deviceId` handler in `setup-router.js`.
- [x] **REPAIR-02
**: `resetSubscriberStats(deviceId)` is NOT called at the top of each `runRepairCycle` loop iteration. It is called only on a successful repair, inside the success block. On failure, `needsRepair` stays `true` so the dashboard Synced badge reflects real state.
- [x] **REPAIR-03
**: `listener/src/repair-scheduler.test.js` includes unit tests that assert:
  - `needsRepair` success path invokes `stopSubscriber` then `startSubscriber` exactly once per repaired device
  - `needsRepair` failure path does NOT clear `needsRepair` (no `resetSubscriberStats` call)
  - `isStale` success path continues to invoke `stopSubscriber` + `startSubscriber` (regression guard)

### Scheduled Repair — Full Re-Pair Capability (Phase 19)

- [x] **REPAIR-04
**: When `needsRepair === true`, the scheduler performs a full `pairSetup()` using `hap-controller`, not just an address/port refresh via `savePairingForRepair`. Successful pairing produces new `longTermData` that replaces the stored (rejected) data, matching the manual `POST /api/setup/repair/:deviceId` flow.
- [x] **REPAIR-05
**: The scheduler reads the device's stored PIN from the PIN vault (same mechanism used by the manual repair endpoint). Devices that have `needsRepair === true` but no stored PIN are skipped and logged at `warn` level with the device name; they do NOT count as `failed` or trip the scheduler's error handling.
- [x] **REPAIR-06
**: `listener/src/repair-scheduler.test.js` adds tests that assert:
  - pairSetup success path with a stored PIN writes new `longTermData` to pairings and restarts the subscriber
  - skip path (no stored PIN) emits a `warn` log and leaves the pairing record untouched
  - pairSetup failure (wrong PIN / device unreachable) leaves `needsRepair === true` and does NOT restart the subscriber

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
| Draggable/rearrangeable widgets | High complexity, limited value for single-user app |
| WebSocket real-time push | Polling via TanStack Query is sufficient |
| Full hue slider for accent color | Preset swatches cover the use case with less complexity |
| Mobile-native app | Web-first, responsive sidebar covers mobile use case |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| THEME-01 | Phase 10 | Complete |
| THEME-02 | Phase 10, 17 | Complete |
| THEME-03 | Phase 10 | Complete |
| THEME-04 | Phase 10 | Complete |
| THEME-05 | Phase 10 | Complete |
| NAV-01 | Phase 11, 16 | Complete |
| NAV-02 | Phase 11, 16 | Complete |
| NAV-03 | Phase 11, 16 | Complete |
| NAV-04 | Phase 13 | Complete |
| NAV-05 | Phase 11, 16 | Complete |
| LAYOUT-01 | Phase 12, 17 | Complete |
| LAYOUT-02 | Phase 11, 16 | Complete |
| LAYOUT-03 | Phase 12, 16 | Complete |
| WIDGET-01 | Phase 14 | Complete |
| WIDGET-02 | Phase 14 | Complete |
| WIDGET-03 | Phase 14 | Complete |
| WIDGET-04 | Phase 14 | Complete |
| WIDGET-05 | Phase 14 | Complete |
| CHART-01 | Phase 15 | Complete |
| CHART-02 | Phase 15, 16 | Complete |
| CHART-03 | Phase 15, 17 | Complete |
| RESP-01 | Phase 13 | Complete |
| RESP-02 | Phase 13 | Complete |

**Coverage:**
- v1.2 requirements: 23 total
- Mapped to phases: 23 (7 also assigned to gap closure phases 16-17)
- Unmapped: 0

### v1.3 Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| REPAIR-01 | Phase 18 | Pending |
| REPAIR-02 | Phase 18 | Pending |
| REPAIR-03 | Phase 18 | Pending |
| REPAIR-04 | Phase 19 | Pending |
| REPAIR-05 | Phase 19 | Pending |
| REPAIR-06 | Phase 19 | Pending |

**Coverage:**
- v1.3 requirements: 6 total
- Mapped to phases: 6
- Unmapped: 0

---
*Requirements defined: 2026-04-02*
*Last updated: 2026-04-20 — v1.3 Repair Reliability Fixes milestone started*
