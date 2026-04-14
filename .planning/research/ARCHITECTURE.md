# Architecture Patterns: Express Router Extraction

**Domain:** Express route extraction from a monolithic entry point
**Researched:** 2026-04-02
**Confidence:** HIGH — based on direct code analysis of `listener/src/index.js` (2,103 lines) and all four existing router modules

---

## Current State

Four routers have already been extracted and establish the canonical pattern:

| Module | Factory | Mount point | Dependencies |
|--------|---------|-------------|--------------|
| `events-router.js` | `createEventsRouter({ pool, getRooms })` | `app.use('/api', ...)` | pool, loadRooms |
| `alerts-router.js` | `createAlertsRouter({ pool })` | `app.use('/api/alerts', ...)` | pool |
| `matter-router.js` | `createMatterRouter({ insertEvent, pool, loadPairings, savePairings, loadRooms, saveRooms, loadNotes, saveNotes, matterRuntime, getMatterDiscoveryCache, setMatterDiscoveryCache })` | `app.use('/api', ...)` | many |
| `retention-router.js` | `createRetentionRouter({ getSettings, saveSettings, sweepMs })` | `app.use('/api/setup', ...)` | getSettings, saveSettings |

The established pattern is a **factory function** — `createXxxRouter(deps)` returns `express.Router()`. Dependencies are injected via a plain object argument. Each module owns its own rate limiters and any module-local helpers.

One established cross-module export: `events-router.js` exports `parseIntInRange` and `parentBridgeId` which `index.js` and `alerts-router.js` import. New router modules can import these from `events-router.js` the same way.

---

## Routes Remaining in index.js

### Group 1: Setup / HomeKit Pairing

Routes: `GET /api/setup/discovered`, `POST /api/setup/scan`, `POST /api/setup/pair`, `GET /api/setup/bridge-children/:deviceId`, `GET /api/setup/pairings`, `DELETE /api/setup/pairing/:deviceId`, `POST /api/setup/repair/:deviceId`, `POST /api/setup/add-pairing`

**State dependencies:**
- `discoveryCache` — module-level array mutated by scan; must be owned by the router or passed in via getter/setter callbacks
- `loadPairings` / `savePairings` — store functions
- `loadRooms` — store function (used when starting a subscriber after pair)
- `startSubscribers`, `stopSubscriber`, `resetSubscriberStats` — subscriber lifecycle functions
- `discoverDeviceForRepair`, `savePairingForRepair` — internal discovery helpers; belong in this router
- `resolveControllerIdentity`, `runAddPairing` — from `add-pairing-helpers.js`
- `HttpClient` from `hap-controller` — HAP client for pairing and bridge-children queries
- `isHomeKitPairing`, `normalizePairingRecord`, `getHomeKitPairings`, `normalizePairingsMap` — pairing normalization helpers; belong in this router
- `pairingsStore.getByKey` — used directly in subscriber callbacks on pair/repair; the callback must either be passed in or constructed in `index.js` and injected
- `cacheAccessoryMetadata`, `shortUuid` — used in `bridge-children`; from `accessory-metadata.js`
- `getAccessoryCapabilities` — used in `bridge-children`

**Rate limiters:** `apiWriteLimiter` from `index.js` — inject as a dep or let the router create its own write limiter.

### Group 2: Rooms / Display Names / Notes

Routes: `PATCH /api/setup/room`, `GET /api/setup/rooms`, `PATCH /api/setup/display-name`, `GET /api/setup/display-names`, `PATCH /api/setup/note`, `GET /api/setup/notes`

**State dependencies:**
- `loadRooms` / `saveRooms`
- `loadDisplayNames` / `saveDisplayNames`
- `loadNotes` / `saveNotes`
- `apiWriteLimiter` — inject or create in router

These routes are pure CRUD over JSON stores. No database queries, no subscriber calls. The simplest extraction in the file.

### Group 3: Log Level

Routes: `GET /api/setup/log-level`, `PATCH /api/setup/log-level`

**State dependencies:**
- `getLevel`, `setLevel` from `logger.js`
- `apiWriteLimiter`

Trivially small. Can be collapsed into a setup-router or extracted standalone as `log-level-router.js`.

### Group 4: Accessories List + Detail

Routes: `GET /api/accessories`, `GET /api/accessories/:accessoryId/detail`, `GET /api/accessories/:accessoryId/characteristics/:characteristic/trend`, `GET /api/accessories/:accessoryId/heatmap`, `GET /api/accessories/:accessoryId/state-duration`, `GET /api/accessories/:accessoryId/char-summary`, `GET /api/accessories/:accessoryId/capabilities`

Note: `GET /api/accessories/:accessoryId/capabilities` is currently in `index.js` even though it relates to the accessory setup flow. It fits here by URL shape.

**State dependencies:**
- `pool`
- `loadRooms`, `loadPairings`
- `getSubscriberStats`, `getSubscriberHealth` — from `subscriber.js`
- `deriveDeviceHealth` from `device-health.js`
- `getAccessoryCapabilities`, `getAccessoryIdentity`, `getAllDiscoveredAccessories`, `cacheAccessoryMetadata`, `shortUuid` — from `accessory-metadata.js`
- `retentionSettings` — needs `staleThresholdHours`; inject via `getRetentionSettings` callback
- `mapReliabilityStats` — internal helper, move into this router
- `parentBridgeId`, `parseIntInRange` — import from `events-router.js`
- `HttpClient` from `hap-controller` — used in capabilities endpoint
- `isHomeKitPairing` — pairing helper; can be imported from wherever setup-router lands or duplicated as a small local helper
- `apiStatsReadLimiter` — inject or create in router

This is the heaviest read router in terms of dependencies.

### Group 5: Stats

Routes: `GET /api/stats/hourly`, `GET /api/stats/daily`, `GET /api/stats/top-devices`, `GET /api/stats/rooms`, `GET /api/stats/weekday`, `GET /api/stats/heatmap`, `GET /api/stats/device-patterns`, `GET /api/stats/anomalies`, `GET /api/stats/quiet-hours`

**State dependencies:**
- `pool`
- `loadRooms`
- `cached` from `query-cache.js`
- `detectOutliers` from `anomaly-detection.js`
- `retentionSettings` — needs `quietHoursEnabled`, `quietHoursStart`, `quietHoursEnd`, `quietHoursExcludedAccessories`; inject via `getRetentionSettings`
- `parentBridgeId`, `parseIntInRange` — import from `events-router.js`
- `apiStatsReadLimiter` — inject or create in router

Stats queries are already using the query cache pattern. This is a straightforward extraction.

Note: `GET /api/stats/anomalies` already lives in `events-router.js`. The remaining stats routes in `index.js` are separate from those. Verify before extraction that there is no overlap.

### Group 6: Archive

Routes: `GET /api/archive/export`, `GET /api/archive/count`

**State dependencies:**
- `pool`
- `apiStatsReadLimiter`

No store dependencies. Pure DB reads with streaming CSV response on export.

### Group 7: Data Management

Routes: `DELETE /api/data/accessory`, `DELETE /api/data/all`

**State dependencies:**
- `pool`
- `loadRooms` / `saveRooms`, `loadDisplayNames` / `saveDisplayNames`, `loadNotes` / `saveNotes`
- `apiWriteLimiter`

Destructive endpoints. Small group.

### Group 8: Health

Route: `GET /api/health`

**State dependencies:**
- `pool`
- `getSubscriberHealth` from `subscriber.js`
- `matterRuntime` — for `getStatus()`
- `loadPairings`
- `ALERTS_ENABLED` env flag

Health check is a single endpoint with cross-cutting reads. Can be its own tiny router or appended to an existing one. Given its operational nature it warrants its own module.

---

## Component Boundaries

```
index.js (after full extraction)
│
├── Global init + background jobs
│   ├── migrateDb()
│   ├── Store initialization (pairings, rooms, displayNames, notes, retention)
│   ├── initMatterController() + createMatterRuntime()
│   ├── startSubscribers()
│   ├── Background discovery scan interval
│   └── Background retention sweep interval
│
├── Express app bootstrap
│   ├── Global middleware (CORS, JSON parser, security headers, audit log, auth)
│   └── Router mounts
│
└── app.listen()

Router modules (listener/src/)
├── setup-router.js         ← NEW: HomeKit pairing and discovery
├── accessories-router.js   ← NEW: /api/accessories list + per-device detail
├── stats-router.js         ← NEW: /api/stats/* aggregations
├── archive-router.js       ← NEW: /api/archive/* CSV export
├── data-router.js          ← NEW: /api/data/* destructive deletes
├── health-router.js        ← NEW: /api/health
├── [rooms-display-names-notes into setup-router or own module]
├── events-router.js        ← EXISTS
├── alerts-router.js        ← EXISTS
├── matter-router.js        ← EXISTS
└── retention-router.js     ← EXISTS
```

### Boundary Decision: Rooms/Display Names/Notes

These three CRUD groups (`/api/setup/room`, `/api/setup/display-names`, `/api/setup/note`) can either be:
- **Merged into `setup-router.js`** alongside pairing routes — they share the write limiter and the store accessor callbacks, so the dep interface is already present
- **Extracted as `metadata-router.js`** — cleaner if setup-router becomes large, but creates a 3-route module

Recommendation: merge into `setup-router.js`. The combined setup router has a coherent "device management" concern and shares all dependencies. The route count stays manageable (~12 routes).

### Boundary Decision: Log Level

Two routes that delegate entirely to `logger.js`. Options:
- **Merge into `setup-router.js`** — no new deps, avoids a trivial module
- **Merge into `health-router.js`** — operational pair with health check

Recommendation: merge into `setup-router.js` where other admin/configuration routes live.

---

## Dependency Flow

```
index.js (owns)
  ├── store instances (pairingsStore, roomsStore, displayNamesStore, notesStore, retentionStore)
  │     └── exposes load/save closure functions → injected into routers
  ├── discoveryCache variable
  │     └── exposed as getDiscoveryCache / setDiscoveryCache callbacks → setup-router
  ├── matterRuntime instance
  │     └── injected into health-router and already into matter-router
  ├── retentionSettings variable
  │     └── exposed as getRetentionSettings() → accessories-router, stats-router
  └── background job intervals (no router involvement)

Routers receive only closures and plain objects — never store instances directly.
```

This keeps the dependency direction strictly `index.js → router`. Routers have no knowledge of `index.js` and do not import from it.

---

## Shared Utilities Pattern

`events-router.js` already exports `parseIntInRange` and `parentBridgeId`. Other routers import these directly from `events-router.js`. This is the established pattern — do not duplicate these helpers or create a separate shared util file.

If the set of shared helpers grows significantly, a future `router-utils.js` would be appropriate, but that is out of scope for this milestone.

---

## Suggested Extraction Order

Order is determined by: (1) fewest new dependencies, (2) allowing each step to verify correctness before proceeding.

| Step | Router | Rationale |
|------|--------|-----------|
| 1 | `archive-router.js` | Two endpoints, two deps (`pool`, rate limiter). Easiest first win. |
| 2 | `data-router.js` | Three destructive endpoints; deps are pool + store closures already defined. |
| 3 | `stats-router.js` | No write paths; deps are pool, cache, loadRooms, getRetentionSettings. Tests can mock pool easily. |
| 4 | `health-router.js` | Single endpoint; cross-cutting reads but no mutations. |
| 5 | `accessories-router.js` | Heaviest read router; depends on subscriber stats, accessory metadata, health derivation. Extract after simpler routers confirm dep injection pattern. |
| 6 | `setup-router.js` | Most complex: owns discoveryCache, discovery helpers, subscriber lifecycle, add-pairing. Extract last among new routers. |

Each step: extract → add integration test → verify `npm test` passes → proceed.

---

## What index.js Looks Like After Full Extraction

```
index.js responsibilities after full extraction:
1. Import and configure all stores
2. Initialize Matter controller and runtime
3. Start HomeKit subscribers
4. Run background jobs (discovery scan, retention sweep, store refresh)
5. Create Express app with global middleware (CORS, JSON body, headers, auth, audit)
6. Mount all routers
7. app.listen()
```

Target line count: approximately 300–400 lines (down from 2,103). All business logic lives in router modules.

---

## Integration Test Pattern

All four existing router test files follow this pattern (confirmed by code inspection):

```javascript
// test/xxx-router.integration.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createXxxRouter } from '../src/xxx-router.js';

function getRouteHandler(router, method, path) { /* walk router.stack */ }
async function invoke(handler, { query, params, body } = {}) { /* mock req/res */ }

test('description', async () => {
  const pool = { async query(sql, params) { /* stub */ } };
  const router = createXxxRouter({ pool, ... });
  const handler = getRouteHandler(router, 'GET', '/path');
  const { statusCode, jsonBody } = await invoke(handler, { ... });
  assert.equal(statusCode, 200);
});
```

New tests for extracted routers must follow this pattern. Mock `pool` with stub `query()` implementations per test. Do not spin up a real database.

---

## Cross-Cutting Concerns Already Handled in index.js

The following are applied globally in `index.js` **before** any router is mounted. Extracted routers do not re-implement them:

- **CORS** — `app.use(cors(...))`
- **JSON body parsing** — `app.use(express.json(...))`
- **Security headers** — `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` middleware
- **Audit logging** — logs all non-GET/HEAD/OPTIONS requests with method, URL, status, duration
- **API token auth** — applied as middleware before all route mounts

Each router is still responsible for its own **rate limiters**. This is the established pattern — rate limiters are scoped per router with environment-variable-configurable windows and maxes.

---

## Pitfalls in This Extraction

### discoveryCache ownership

`discoveryCache` is a module-level mutable array in `index.js` that both the scan background job and the setup router endpoints read/write. When extracting `setup-router.js`, this state must stay in `index.js` (owned alongside the scan job) and be threaded into the router via `getDiscoveryCache` / `setDiscoveryCache` callbacks — the same pattern `matter-router.js` already uses for `getMatterDiscoveryCache` / `setMatterDiscoveryCache`.

Do not move the scan job into the router. The scan job is a background interval managed in `index.js`; only the API surface for triggering/reading scans belongs in the router.

### Subscriber callbacks in setup-router

`POST /api/setup/pair`, `POST /api/setup/repair`, `POST /api/setup/add-pairing` all call `startSubscribers()` after a successful operation, using a closure that captures `pairingsStore.getByKey`. This callback must be constructed in `index.js` and injected into the setup router as `getSubscriberPairingCallback` or similar — it cannot be cleanly constructed inside the router because it closes over the store instance.

### retentionSettings is a live variable

The `retentionSettings` variable in `index.js` is updated on every store refresh cycle. Routers that need it (stats, accessories, health) should receive a `getRetentionSettings` callback, not the snapshot value, so they always read the current value at request time.

### parseIntInRange exported from events-router.js

`alerts-router.js` already imports `parseIntInRange` from `events-router.js`. New routers should do the same. Do not re-define this helper locally.

---

## Sources

- Direct code analysis of `listener/src/index.js` (lines 1–2103)
- Direct code analysis of `listener/src/events-router.js`, `alerts-router.js`, `matter-router.js`, `retention-router.js`
- Direct code analysis of `listener/test/events-router.integration.test.js`, `matter-router.test.js`
- `.planning/codebase/ARCHITECTURE.md` and `.planning/codebase/STRUCTURE.md` (2026-04-01)
- `.planning/PROJECT.md` (2026-04-02)
