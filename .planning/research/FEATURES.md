# Feature Landscape — Express Code Health Milestone

**Domain:** Node.js / Express production code health (self-hosted app)
**Researched:** 2026-04-02
**Scope:** Improving internal quality of an existing Express 5 + PostgreSQL listener service

---

## Table Stakes

Features users (and operators) expect in a production Node.js app. Missing any of these means the app is not reliably self-hostable — it can crash silently, degrade invisibly, or become unmaintainable.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Global unhandled rejection / uncaught exception handlers | Node 15+ crashes on unhandled rejections; Docker restart policy recovers but loses crash context | Low | Single `process.on('unhandledRejection')` + `process.on('uncaughtException')` block in index.js; log and exit with non-zero code |
| Logging in silent catch blocks (discovery, Matter cleanup) | Silent `catch {}` makes debugging impossible in the two hardest areas of the codebase (HAP mDNS, Matter lifecycle) | Low | Replace `catch {}` with `catch (err) { log.debug(...) }` — no behavioural change, diagnostic value is high |
| alert_deliveries retention sweep | Table grows unboundedly; combined with COUNT(*) this will eventually lock up the alerts listing endpoint | Low-Medium | Add index on `sent_at`; sweep older than configurable window (default 90 days); wire into existing retention sweep scheduling path |
| Estimated / cached COUNT for unfiltered pagination | Full-index scan on every paginated `/api/events` request; at 500K+ rows this becomes the primary latency bottleneck | Medium | Use `pg_class.reltuples` for no-filter case; exact COUNT only when WHERE conditions are present; TTL-cached in existing query-cache |
| Router extraction: setup-router, accessories-router, stats-router | 2,100-line monolith makes individual route testing impractical; established pattern already exists (events-router, alerts-router, matter-router) | Medium | Three natural extraction groups: setup/pairing (~400 lines, /api/setup), accessories/detail (~400 lines, /api/accessories), stats/dashboard (~350 lines, /api/stats) |
| Integration tests for extracted routers | New routers without tests are just moved tech debt; existing test pattern (mock pool, route handler lookup, invoke helper) is copy-paste ready | Medium | One test file per router, following events-router.integration.test.js pattern; mock pool, test happy path + key error conditions |
| Versioned migration system (sequential numbering in _migrations) | Current IF NOT EXISTS idiom cannot express column renames, type changes, or constraint modifications; rollback is impossible | Medium | Minimum viable: number migrations sequentially in the existing `_migrations` table and wrap each step in a transaction; does NOT require adopting a framework like node-pg-migrate unless complexity justifies it |

---

## Differentiators

Features that meaningfully improve code health or operator experience beyond the baseline, but whose absence does not cause silent failures.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Optional JSON log format for production | Enables structured log parsing (Loki, CloudWatch, Datadog, etc.) without requiring log-driver changes | Low | Add `LOG_FORMAT=json` env var; logger emits `JSON.stringify({level, ts, msg})` when set; zero-cost when not set |
| Centralized config.js module | Eliminates duplicated env-var parsing (e.g., `ALERTS_ALLOW_PRIVATE_TARGETS` parsed identically in alerts.js and alerts-router.js); one place to audit all configurable options | Low-Medium | Export a frozen config object; individual modules import named exports; does NOT require touching external interfaces |
| Request ID middleware (x-request-id) | Correlates log lines across a request lifecycle; essential when diagnosing intermittent HAP/Matter failures where multiple subscriptions fire concurrently | Low | `crypto.randomUUID()` per request, attach to `req.id`, include in log prefix; no external dependency needed |
| Pool configuration via environment variables | Lets operators tune `DB_POOL_MAX` and `DB_STATEMENT_TIMEOUT` for their hardware (RPi vs. NAS with more RAM) without code changes | Low | Expose 2-3 env vars to the existing `new Pool({})` constructor; safe defaults that match current behaviour |
| LRU eviction for in-memory query cache | Current Map-based cache has no size bound; safe now but becomes a hidden memory leak if dynamic cache keys are ever added | Low | Add `MAX_ENTRIES` constant (default 200); evict oldest key on insert when at limit; no external dependency needed |

---

## Anti-Features

Things to deliberately NOT build in this milestone. Each represents scope creep that would delay delivery without meaningfully improving production reliability.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Full migration framework adoption (node-pg-migrate, Flyway, Knex) | Requires restructuring the Docker entrypoint, modifying CI, migrating all existing schema logic, and adding a new runtime dependency — none of which are needed to fix the known problems | Number migrations sequentially in the existing `_migrations` table and wrap each in a transaction; this is sufficient for the actual problem (unordered, non-transactional one-offs) |
| Table partitioning for event_logs | Solves a scale problem that does not exist yet at typical self-hosted volumes; adds significant operational complexity for zero current benefit | Use estimated counts and the existing retention sweep to keep the table bounded |
| Prometheus metrics endpoint | Nice-to-have for operators with monitoring stacks; not relevant to reliability for users running a plain Docker volume | Keep the existing `/api/health` endpoint; document that structured JSON logs are the observability path |
| Frontend test coverage expansion | Separate concern from backend code health; risks pulling the milestone's focus off the listener service | Treat as a distinct future milestone |
| E2E test coverage | Playwright infrastructure exists but is expensive to maintain; the milestone's test goal is integration tests for extracted routers, not end-to-end flows | Leave the two existing E2E specs (theme audit, toast notifications) in place and do not expand |
| HTTPS termination / TLS | Documentation concern, not a code change; no code in the repo controls this layer | Add a note to docs; no code change needed |
| Database backup scripts | Operational concern; no code change improves data safety here | Document `pg_dump` cron setup in docs if requested |
| Centralized config.js (if time-constrained) | Valuable but low-urgency; already marked out-of-scope in PROJECT.md for this milestone | Defer; extract only if config.js naturally falls out of a router extraction as a cleanup step |

---

## Feature Dependencies

```
alert_deliveries retention sweep
  → requires: index on alert_deliveries.sent_at (add in migration step)
  → feeds: estimated COUNT fix for alerts-router (same root cause)

Estimated COUNT for /api/events pagination
  → independent of router extraction — can be applied now to events-router.js

Router extraction (setup-router)
  → depends on: understanding which stores/deps are required (pairingsStore, roomsStore, displayNamesStore, notesStore, subscriber, discoverer)
  → enables: integration tests for setup routes
  → enables: index.js shrinks to <400 lines (bootstrap, middleware, mount, listen)

Router extraction (accessories-router)
  → depends on: understanding pool + cache + anomaly-detection deps
  → enables: integration tests for accessories routes

Router extraction (stats-router)
  → depends on: pool + query-cache deps
  → can be done independently of setup and accessories extraction

Integration tests (per router)
  → depends on: corresponding router extraction completing first
  → follow existing mock-pool + route-handler-lookup + invoke() pattern

Versioned migrations
  → independent of all other work
  → should be done first or in parallel — any new schema changes (alert_deliveries index) need to follow the new convention immediately

Global error handlers + silent catch logging
  → independent of all other work
  → lowest risk, should land first
```

---

## MVP Recommendation

Sequence for this milestone, ordered by risk reduction per unit of effort:

1. **Global error handlers + silent catch logging** — two low-complexity fixes, highest reliability impact per line of code
2. **Versioned migration numbering** — one-time setup that all subsequent schema changes (alert_deliveries index) must follow
3. **alert_deliveries retention sweep** — eliminates unbounded table growth; add `sent_at` index in the first numbered migration
4. **Estimated COUNT for /api/events** — eliminates the most visible performance regression path; touches one line in events-router.js plus a helper
5. **Router extraction: setup-router** — largest extraction (pairing, repair, rooms, display-names, notes, log-level); most complex deps but follows established pattern
6. **Router extraction: accessories-router** — medium complexity; pool + anomaly-detection + metadata deps
7. **Router extraction: stats-router** — cleanest extraction; pure pool queries + cached()
8. **Integration tests** — one file per extracted router, following existing test pattern

**Defer:**
- Centralized config.js: useful but not urgent; PROJECT.md marks it out-of-scope
- JSON log format: valuable but not blocking; add as a stretch goal if extraction goes fast
- Request ID middleware: worth adding once routers are extracted (natural attachment point)

---

## Sources

Analysis derived from direct codebase inspection:
- `listener/src/index.js` (route inventory, env-var parsing, error handler absence)
- `listener/src/db.js` (migrateDb() structure, _migrations table, pool config)
- `listener/src/events-router.js` (COUNT(*) pattern, router factory pattern)
- `listener/src/alerts-router.js` (COUNT(*) pattern on alert_deliveries)
- `listener/src/logger.js` (current logger structure)
- `listener/test/events-router.integration.test.js` (established test pattern)
- `listener/test/alerts-router.integration.test.js` (established test pattern)
- `.planning/PROJECT.md` (active requirements, out-of-scope list)
- `.planning/codebase/CONCERNS.md` (severity ratings, file locations, impact analysis)

Confidence: HIGH — all findings are from direct codebase analysis, not external sources.
