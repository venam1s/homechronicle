# Project Research Summary

**Project:** HomeChronicle — Code Health Milestone
**Domain:** Node.js / Express production code health (migrations, query optimization, router extraction, error handling)
**Researched:** 2026-04-02
**Confidence:** HIGH

## Executive Summary

HomeChronicle's listener service has grown to a 2,103-line `index.js` monolith that successfully runs in production but carries four compounding risks: unhandled promise rejections that crash silently, a COUNT(*) query that will become the primary latency bottleneck beyond ~500K events, an IF NOT EXISTS migration pattern that cannot express schema evolution, and untestable route handlers because everything lives in one file. All four problems have well-understood fixes that require zero new architectural concepts — only disciplined application of Express's established router factory pattern, PostgreSQL's statistics tables, and one new dependency (`node-pg-migrate`).

The recommended approach is sequential, lowest-risk-first: land global error handlers and silent-catch logging first (two process.on calls, no tests broken), adopt a versioned migration system second (one-time bootstrap before any new schema changes land), fix the COUNT query and alert_deliveries retention in parallel as their first migration, then extract routers in dependency order from simplest (archive, data, stats) to most complex (accessories, setup). Each extracted router gets an integration test before the next extraction begins. The full extraction target is an `index.js` of 300–400 lines that only bootstraps and mounts.

The primary risks are all in the transition mechanics, not the destination. The `discoveryCache` stale-reference trap will silently break pairing if accessor functions are not used. The migration bootstrap on existing installations will re-run destructive one-off migrations if the `--fake` flag is misapplied. The estimated COUNT optimization returns zero on fresh installs if a fallback branch is omitted. Each risk has a concrete prevention strategy documented in PITFALLS.md and must be enforced at PR review time, not discovered in production.

---

## Key Findings

### Recommended Stack

The project already runs on the correct stack (Node 22, Express 5, PostgreSQL 16, raw `pg` driver, `node:test`). Only one new dependency is warranted: `node-pg-migrate` v8 (released December 2025, ESM-native, requires Node 20+). All other work — router extraction, error handling, COUNT optimization, query-cache LRU bounds — uses existing libraries and patterns. Nothing else should be added this milestone.

**Core technologies:**
- `node-pg-migrate` v8: migration runner — ESM-only, programmatic API, runs inline at startup via `runMigrations()` in `db.js`, avoids the separate-process complexity of Go-based tools like dbmate
- `express.Router()` factory pattern: already established in four routers — `createXxxRouter({ deps })` returning a router; no new library needed
- `pg_class.reltuples`: fast unfiltered row count — avoid full index scan on every paginated request; fallback to exact COUNT when `reltuples <= 0` or filters are active
- `process.on('unhandledRejection')` + `process.on('uncaughtException')`: process-level error containment — log-and-continue for rejections (HAP subscriptions must not be torn down on non-critical rejections), exit(1) for uncaught exceptions

**What NOT to add:** Knex (adds ORM coupling for migration-only use), dbmate (Go binary, cannot run programmatically), Prometheus client (out of scope), `express-async-errors` (Express 5 handles async propagation natively), table partitioning (premature at self-hosted scale).

### Expected Features

Research confirmed these as the complete and prioritized feature set for this milestone. The ordering below maps directly to phase sequence.

**Must have (table stakes) — in priority order:**
- Global `unhandledRejection` and `uncaughtException` handlers — Node 15+ crashes on unhandled rejections; Docker restart recovers but loses crash context
- Silent catch block logging in discovery and Matter cleanup paths — currently `catch {}` makes the two hardest debugging areas completely opaque
- Versioned migration numbering — IF NOT EXISTS cannot express column renames or constraint changes; rollback is impossible; must land before any new schema changes
- `alert_deliveries` retention sweep + `sent_at` index — table grows unboundedly; at scale the sweep and the COUNT(*) share the same root cause
- Estimated COUNT for unfiltered `/api/events` pagination — full index scan on every timeline load is the most visible perf regression path
- Router extraction: setup-router (~600 lines, HomeKit pairing + rooms + display-names + notes + log-level)
- Router extraction: accessories-router (~400 lines, per-device detail and characteristic history)
- Router extraction: stats-router (~300 lines, dashboard aggregations)
- Router extraction: archive-router + data-router + health-router (smaller groups, extract first for momentum)
- Integration tests for each extracted router (one file per router, following existing mock-pool + invoke() pattern)

**Should have (differentiators — defer if extraction runs long):**
- Optional JSON log format (`LOG_FORMAT=json` env var) — enables Loki/structured log parsing without code change to deployment
- Request ID middleware (`x-request-id` header) — correlates log lines across HAP/Matter concurrent subscription events
- Pool configuration via env vars (`DB_POOL_MAX`, `DB_STATEMENT_TIMEOUT`) — lets RPi operators tune without code changes
- LRU eviction for query-cache Map — current unbounded Map is safe now but becomes a hidden memory leak if dynamic keys are added
- Centralized `config.js` module — eliminates duplicated env-var parsing; PROJECT.md explicitly marks this out-of-scope for this milestone

**Defer (not this milestone):**
- Table partitioning for `event_logs` — premature at self-hosted volumes
- Prometheus metrics endpoint — operational concern; structured JSON logs are the observability path
- Frontend test coverage expansion — separate concern
- HTTPS termination / TLS — documentation concern, no code change
- Keyset/cursor pagination — breaking API change requiring frontend coordination; two-tier COUNT solves the problem within existing API contract

### Architecture Approach

The extraction follows a strict factory-function dependency injection pattern already proven by four existing routers. `index.js` owns all state (store instances, discoveryCache, matterRuntime, retentionSettings) and threads it into routers exclusively as closure callbacks or plain objects — never as snapshot values that can go stale. Routers have no knowledge of `index.js` and do not import from it. The dependency direction is always `index.js → router`.

**Major components after full extraction:**

1. `index.js` (300–400 lines) — bootstrap only: store init, Matter/HAP startup, background job intervals, Express middleware registration, router mounting, `app.listen()`
2. `setup-router.js` (NEW) — HomeKit pairing discovery, pair/repair/add-pairing endpoints, rooms/display-names/notes CRUD, log-level; owns `getDiscoveryCache`/`setDiscoveryCache` callbacks
3. `accessories-router.js` (NEW) — `/api/accessories` list and all per-device detail endpoints; heaviest dependency surface (subscriber stats, device health, accessory metadata)
4. `stats-router.js` (NEW) — `/api/stats/*` aggregations; cleanest extraction; pure pool + query-cache + anomaly-detection
5. `archive-router.js` (NEW) — CSV export streaming; two endpoints, two deps
6. `data-router.js` (NEW) — destructive delete endpoints; pool + store closures
7. `health-router.js` (NEW) — single cross-cutting read; pool + subscriber health + matterRuntime status
8. `utils.js` (NEW) — `parseIntInRange` and `parentBridgeId` moved here from `events-router.js`; must be created before any new routers are extracted to break the existing `alerts-router.js` → `events-router.js` coupling

Existing routers (`events-router.js`, `alerts-router.js`, `matter-router.js`, `retention-router.js`) are not refactored this milestone — only new extractions follow the updated pattern.

### Critical Pitfalls

1. **Migration bootstrap destroys existing data** — The initial migration file must be fake-applied on existing installs using `--fake`. If run for real against a live DB that has IF NOT EXISTS schema, the `initial_poll_cleanup` migration re-runs and deletes legitimate events. Test the bootstrap against both a fresh Postgres 16 container AND a copy of the production DB before merging.

2. **Stale in-memory state in extracted routers** — `discoveryCache` is a module-level array that gets *reassigned*, not mutated. Any router that receives it as a value at construction time will hold the original empty array forever. Every mutable variable must be threaded in as a getter function: `getDiscoveryCache: () => discoveryCache`. Also applies to `retentionSettings`. Write at least one integration test per router that exercises a route after simulating a state update.

3. **Circular import from utilities in `events-router.js`** — `alerts-router.js` already imports `parseIntInRange` from `events-router.js`. New routers needing this function must not add another import from `events-router.js`. Create `utils.js` first, move the helpers there atomically (update all import sites in the same commit), and run `npm test` before proceeding to any router extraction.

4. **Estimated COUNT returns zero on fresh install** — `pg_class.reltuples` defaults to `-1` on a newly created table until autovacuum runs ANALYZE. Add `GREATEST(reltuples::bigint, 0)` with a fallback to exact COUNT when the result is `<= 0`. Fresh install CI tests must run against an empty schema, not a pre-seeded one.

5. **`uncaughtException` handler that does not exit** — Logging but continuing after an uncaught exception leaves the process in undefined state. HAP subscriptions appear alive but process no events. Health endpoint returns 200. Docker restart never fires. Always call `process.exit(1)` in the `uncaughtException` handler. Only `unhandledRejection` should log-and-continue (to avoid tearing down HAP subscriptions on non-critical async leaks in `hap-controller`).

---

## Implications for Roadmap

### Phase 1: Error Handler Foundation
**Rationale:** Two `process.on()` calls with zero behavior change risk and highest reliability impact per line written. Independent of all other work. Establishes the catch-all safety net before any structural changes begin.
**Delivers:** `unhandledRejection` (log, continue), `uncaughtException` (log, exit 1), silent-catch logging in discovery and Matter cleanup paths
**Addresses:** Table stakes items 1 and 2 from FEATURES.md
**Avoids:** Pitfalls 5 and 6 (error middleware position, zombie process)
**Research flag:** None — patterns are fully specified in STACK.md Domain 4 and PITFALLS.md

### Phase 2: Migration System + Schema Fixes
**Rationale:** Must land before any new schema changes. The `alert_deliveries` index and retention sweep that follow are the first real migrations and must follow the versioned convention from day one. Doing this second means the error handlers are already in place if the bootstrap fails.
**Delivers:** `node-pg-migrate` v8 wired to `db.js` startup, `0001_initial_schema.js` fake-applied on existing installs, `0002_alert_deliveries_retention.js` adding the `sent_at` index and the sweep logic, `ALERT_DELIVERY_RETENTION_DAYS` env var
**Addresses:** Table stakes items 3 and 4 (versioned migrations, alert_deliveries retention)
**Avoids:** Pitfall 1 (bootstrap destroys data), Pitfall 7 (sweep fires duplicate webhooks), Pitfall 9 (dual schema source drift — pick one source of truth in this PR)
**Research flag:** Medium — bootstrap against existing install requires care; test plan must include both fresh-install and existing-install scenarios

### Phase 3: COUNT Optimization
**Rationale:** Independent of router extraction; can be applied to `events-router.js` immediately and delivers visible perf improvement with one addition to an existing, tested file. The fresh-install fallback branch must be included in the same PR.
**Delivers:** Two-tier count strategy in `events-router.js` (estimated for unfiltered, exact for filtered), `estimated: true` flag in API response, fallback branch for `reltuples <= 0`
**Addresses:** Table stakes item 5 (estimated COUNT)
**Avoids:** Pitfall 4 (zero count on fresh install)
**Research flag:** None — fully specified in STACK.md Domain 2 and PITFALLS.md

### Phase 4: Router Extraction — Simple Groups First
**Rationale:** Establish the dep injection pattern on low-dependency routers before tackling the complex ones. Each extraction confirms the pattern works before the next begins. `utils.js` creation is the first task of this phase — it unblocks all extractions.
**Delivers:** `utils.js` (parseIntInRange, parentBridgeId), `archive-router.js` (2 endpoints), `data-router.js` (2 destructive endpoints), `stats-router.js` (~9 stat aggregation endpoints), `health-router.js` (1 endpoint); integration tests for each
**Addresses:** Table stakes items 8–10 (router extraction and tests for simpler groups)
**Avoids:** Pitfall 3 (circular import — utils.js must exist before any extraction), Pitfall 2 (stale state — stats and health use `getRetentionSettings` callback)
**Research flag:** None — extraction order and dep interface fully documented in ARCHITECTURE.md

### Phase 5: Router Extraction — Accessories
**Rationale:** Heaviest read router; depends on subscriber stats, device health, and accessory metadata. Extracting after simpler routers confirms that the dep injection pattern and test harness are solid.
**Delivers:** `accessories-router.js` (~7 endpoints), integration tests; `index.js` now under 800 lines
**Addresses:** Table stakes item 7 (accessories-router extraction)
**Avoids:** Pitfall 2 (stale pairings snapshot), Pitfall 8 (pool mock hiding query shape changes)
**Research flag:** None — dependency surface fully mapped in ARCHITECTURE.md Group 4

### Phase 6: Router Extraction — Setup (HomeKit Pairing)
**Rationale:** Most complex extraction: owns `discoveryCache`, subscriber lifecycle callbacks, add-pairing flow, pairing normalization helpers. Extract last so all dep injection patterns are confirmed and `index.js` history is clean.
**Delivers:** `setup-router.js` (~12 endpoints covering pairing, repair, rooms, display-names, notes, log-level), integration tests; `index.js` reaches target 300–400 lines
**Addresses:** Table stakes item 6 (setup-router extraction and tests)
**Avoids:** Pitfall 2 (discoveryCache must use getter/setter callbacks — this is the highest-risk instance of this pitfall)
**Research flag:** Medium — subscriber lifecycle callbacks (startSubscribers, stopSubscriber) that close over the pairingsStore instance require careful injection design; verify the callback construction pattern with a real pairing test scenario

### Phase Ordering Rationale

- Error handlers come first because they are zero-risk and provide a safety net for all subsequent changes.
- Migrations come before any new schema changes so the first real migration (alert_deliveries) is the first to follow the versioned convention — avoiding a situation where schema fixes use the old IF NOT EXISTS pattern that the migration system was adopted to replace.
- COUNT optimization is independent and delivers visible user-facing improvement quickly; it does not block or depend on router extraction.
- Simple router extractions before complex ones: each extraction validates the pattern and test harness before the next one begins. `utils.js` creation unblocks all extractions and resolves the existing `alerts-router.js` → `events-router.js` utility coupling before it can proliferate.
- Setup router last because `discoveryCache` ownership is the highest-risk instance of the stale-state pitfall and the subscriber lifecycle callbacks require the most careful injection design.

### Research Flags

Phases needing closer attention during execution:
- **Phase 2 (Migration System):** Bootstrap on existing installs is tricky. Test plan must explicitly include a Postgres 16 container restored from a production dump, not just a fresh container. The `--fake` flag application and `_migrations` reconciliation require a documented step-by-step upgrade script.
- **Phase 6 (Setup Router):** Subscriber lifecycle callback injection design is the one architectural decision not fully resolved in research. The callback must be constructed in `index.js` (because it closes over the store instance) and injected as a named dep. Verify this works with a real pairing flow test, not just a unit mock.

Phases with fully documented patterns (no additional research needed):
- **Phase 1 (Error Handlers):** Implementation fully specified in STACK.md Domain 4.
- **Phase 3 (COUNT Optimization):** SQL and JS implementation fully specified in STACK.md Domain 2 and PITFALLS.md Pitfall 4.
- **Phase 4 (Simple Routers):** Extraction order and dep interfaces fully documented in ARCHITECTURE.md.
- **Phase 5 (Accessories Router):** Dependency surface fully mapped; follows same pattern as Phase 4.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All recommendations verified against official documentation or primary source code; only one new dependency (`node-pg-migrate` v8) |
| Features | HIGH | Derived entirely from direct codebase analysis of `listener/src/index.js`, existing routers, and `.planning/codebase/CONCERNS.md`; no inference needed |
| Architecture | HIGH | Route groups, dependency surfaces, and extraction order documented from direct code inspection of all 2,103 lines of `index.js` and all four existing router modules |
| Pitfalls | HIGH | Most pitfalls are confirmed failure modes observed in the existing code or in well-documented Node.js/PostgreSQL literature; not speculative |

**Overall confidence:** HIGH

### Gaps to Address

- **Migration bootstrap test environment:** Research specifies the approach but cannot pre-validate it against a real production dump. The PR for Phase 2 must include evidence of a successful bootstrap test against both fresh-install and existing-install scenarios before merging.
- **Subscriber callback injection design:** The exact interface for injecting `startSubscribers` into `setup-router.js` is described at the pattern level but not yet designed in code. This is the one place where the extraction may surface an interface decision not anticipated in research. Flag for review during Phase 6 planning.
- **`alert_deliveries` quiet-period sweep math:** PITFALLS.md recommends keeping the last N deliveries per rule regardless of age, but the exact N value and the interaction with the maximum configurable quiet period (10,080 minutes) should be validated against the actual schema constraints in `db/init.sql` during Phase 2 implementation.
- **Estimated COUNT: `reltuples` behavior with small tables:** On an RPi with conservative autovacuum settings, `reltuples` may lag longer than expected on low-event-rate installs. The exact threshold for "switch to exact count" may need tuning in the wild; document a manual `ANALYZE event_logs;` escape hatch in the operator docs.

---

## Sources

### Primary (HIGH confidence — official documentation or direct code analysis)
- `listener/src/index.js` (2,103 lines) — route inventory, env-var parsing, state ownership, error handler absence
- `listener/src/events-router.js`, `alerts-router.js`, `matter-router.js`, `retention-router.js` — established factory pattern
- `listener/test/events-router.integration.test.js`, `alerts-router.integration.test.js` — established test pattern
- `.planning/PROJECT.md`, `.planning/codebase/CONCERNS.md` — severity ratings and milestone scope
- node-pg-migrate GitHub releases (v8.0.4, December 2025): https://github.com/salsita/node-pg-migrate/releases
- node-pg-migrate programmatic API docs: https://salsita.github.io/node-pg-migrate/api
- PostgreSQL count estimation wiki: https://wiki.postgresql.org/wiki/Count_estimate
- Express 5 error handling and routing docs: https://expressjs.com/en/guide/error-handling.html
- Node.js process events documentation: https://nodejs.org/api/process.html

### Secondary (MEDIUM confidence — community-validated patterns)
- Faster PostgreSQL Counting (Citus Data): https://www.citusdata.com/blog/2016/10/12/count-performance/
- CYBERTEC: PostgreSQL count(*) made fast: https://www.cybertec-postgresql.com/en/postgresql-count-made-fast/
- BetterStack Express error handling patterns: https://betterstack.com/community/guides/scaling-nodejs/error-handling-express/
- Node.js project architecture best practices (LogRocket): https://blog.logrocket.com/node-js-project-architecture-best-practices/

---
*Research completed: 2026-04-02*
*Ready for roadmap: yes*
