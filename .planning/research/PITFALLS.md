# Domain Pitfalls

**Domain:** Express/Node.js code health refactoring — route extraction, migration system adoption, query optimization, error handler hardening
**Project:** HomeChronicle listener
**Researched:** 2026-04-02

---

## Critical Pitfalls

Mistakes that cause data loss, broken production deployments, or require rewrites.

---

### Pitfall 1: Migration Tool Bootstrapping Destroys the Existing IF-NOT-EXISTS Safety Net

**What goes wrong:** When adopting a versioned migration tool (e.g., node-pg-migrate) on a database that was built with `CREATE ... IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS`, the initial migration file must represent the complete current schema. If you write that initial migration as plain `CREATE TABLE` statements without `IF NOT EXISTS`, running it against a fresh install works — but running it against an existing upgraded install fails with "relation already exists." Conversely, if you use `IF NOT EXISTS` in the initial migration, the tool's tracking table records it as "run" even though some statements were silently no-ops, hiding the fact that the actual DB state is unknown.

**Why it happens:** node-pg-migrate (and most tools) track only whether a migration file ran to completion, not which individual statements succeeded. The `--fake` flag (mark as done without executing) exists precisely for this bootstrap problem but is easy to misapply: fake-marking the wrong migration version leaves the tracking table out of sync with reality on fresh installs.

**Consequences:**
- Fresh installs get a broken schema if the initial migration file is wrong.
- Existing production installs fail on upgrade if the bootstrap isn't faked correctly.
- If the `_migrations` table in `db.js` and the new tool's tracking table coexist without reconciliation, the one-off `initial_poll_cleanup` migration can run again after tool adoption, deleting legitimate events.

**Prevention:**
1. The correct bootstrap sequence: dump the current live schema to a single SQL file as migration `0001_initial_schema.sql`. Test it against a fresh Postgres 16 container.
2. On existing installs, use `--fake` to mark `0001_initial_schema.sql` as applied without executing it. Gate this behind a startup check: if `_migrations` table already exists AND `initial_poll_cleanup` is present, skip re-running the initial migration.
3. All subsequent migrations use plain `CREATE TABLE` / `ALTER TABLE` without `IF NOT EXISTS` — the tool's lock prevents double-runs.
4. Preserve the `_migrations` table or migrate its entries into the new tool's tracking table before retiring it.

**Warning signs:**
- Initial migration file contains `IF NOT EXISTS` — this defeats versioned migration purposes.
- No `--fake` documentation in upgrade notes for existing installs.
- `initial_poll_cleanup` key absent from the new tracking system.

**Phase:** Migration system adoption phase.

---

### Pitfall 2: Route Extraction Breaks the `discoveryCache` and In-Memory State Contract

**What goes wrong:** The routes still in `index.js` (setup, pairing, stats, accessories, rooms, display-names, notes, health) all close over module-level mutable variables: `discoveryCache`, `retentionSettings`, `matterRuntime`, `pairingsStore`, `roomsStore`, `displayNamesStore`, `notesStore`. When these routes are extracted into separate router modules, naively passing these values as constructor arguments captures the value at the time of router creation — not the live reference. Any mutation after router creation (e.g., `discoveryCache` filling in after a scan, `retentionSettings` changing when settings are saved) will not be visible to the router.

**Why it happens:** JavaScript passes objects by reference and primitives by value. `discoveryCache` is a module-level array that gets reassigned (`discoveryCache = results`), not mutated in place. A router receiving `{ discoveryCache }` at creation time holds the original empty array forever. The existing extracted routers avoid this by receiving accessor functions (`getRooms`, `getPool`) rather than values.

**Consequences:**
- Pairing endpoints return stale or empty discovery results.
- Stats endpoints return stale retention settings after the user changes them.
- The pairing save race guard (the `longTermData` protection in `savePairings`) is silently bypassed if the router receives a snapshot instead of the live store reference.

**Prevention:**
- Follow the exact pattern established by `createEventsRouter({ pool, getRooms })`: pass getter functions, not values. E.g., `getDiscoveryCache: () => discoveryCache`, `getPairings: () => pairingsStore.getSnapshot()`.
- For mutable objects that are fully replaced on update (like `discoveryCache`), the accessor function pattern is mandatory.
- For stores, pass the store instance itself (not a snapshot) so the router can call `.getSnapshot()` and `.write()`.
- Write at least one integration test per extracted router that exercises a route after simulating a state update (e.g., a scan that repopulates `discoveryCache`).

**Warning signs:**
- A router factory accepts `discoveryCache: []` instead of `getDiscoveryCache: () => discoveryCache`.
- Router tests only test the initial state, never post-mutation state.

**Phase:** Route extraction phase.

---

### Pitfall 3: Circular Imports When Extracting Modules That Share Utilities

**What goes wrong:** `index.js` imports from `events-router.js` (specifically `parseIntInRange` and `parentBridgeId`), which are utility functions defined there purely because they were needed. When a new router like `setup-router.js` is extracted and also needs `parseIntInRange`, it could either re-import from `events-router.js` (creating a coupling that makes no semantic sense) or copy the function (creating drift). If shared utilities are instead moved to a new `utils.js`, and `events-router.js` is updated to import from it, there is a window during the refactor where `index.js` imports `parseIntInRange` from `events-router.js` while `events-router.js` imports from `utils.js` — not a cycle, but a confusing transient state that causes test failures if the imports are updated piecemeal.

**Why it happens:** Utility functions accumulated in early-extracted routers because there was no shared utilities module. ESM does not hoist — if `utils.js` is not complete before the importing modules load, Node throws immediately.

**Consequences:**
- Tests fail with `SyntaxError: The requested module does not provide an export` if a re-export is missed.
- `index.js` breaks if `parseIntInRange` is removed from `events-router.js` before `index.js` is updated.

**Prevention:**
- Create `listener/src/utils.js` before extracting any new routers. Move `parseIntInRange` and `parentBridgeId` there atomically. Update `events-router.js` and `index.js` imports in the same commit.
- Never import utilities from a sibling router — only from `utils.js` or domain-specific modules.
- Run `npm test` after every file move to catch broken imports before they accumulate.

**Warning signs:**
- `alerts-router.js` already imports `parseIntInRange` from `events-router.js` (line 3) — this coupling exists and must be resolved before extracting additional routers.

**Phase:** Route extraction phase (first task: create utils.js).

---

## Moderate Pitfalls

Issues that cause bugs, degraded user experience, or debugging difficulty if not addressed.

---

### Pitfall 4: Estimated COUNT Returns Zero on Fresh Install

**What goes wrong:** Using `SELECT reltuples FROM pg_class WHERE relname = 'event_logs'` as the estimated count returns `-1` or `0` on a freshly created table before the first autovacuum/ANALYZE runs. PostgreSQL only populates `reltuples` after VACUUM, ANALYZE, or certain DDL operations. On a fresh HomeChronicle install, the first user sees "0 events / 0 pages" even after logging begins, because no ANALYZE has run yet.

**Why it happens:** `reltuples` is a planner statistic, not a live count. It defaults to `-1` (unknown) for brand-new tables and only updates when the autovacuum daemon processes the table, which on a low-traffic table with < `autovacuum_analyze_threshold` new rows may not happen for minutes or hours.

**Consequences:**
- Pagination shows 0 total pages while events actually exist.
- "No events found" UX even when the timeline has data.
- Self-hosted users on RPi where autovacuum tuning is conservative will see this for longer.

**Prevention:**
- Use a hybrid strategy: `GREATEST(reltuples::bigint, 0)` with a fallback to exact `COUNT(*)` when `reltuples <= 0` or when filters are active. This keeps the fast path for large populated tables while being correct on fresh installs.
- Alternatively: cache the last known exact count (e.g., in the query-cache module with a 60-second TTL) and only recompute when the cache expires. The existing `query-cache.js` already supports this pattern.
- Document that `ANALYZE event_logs;` can be run manually if the estimate is stuck.

**Warning signs:**
- Estimated count logic does not include a `<= 0` fallback branch.
- Integration tests only run against a pre-populated database, never against an empty schema.

**Phase:** Query optimization phase.

---

### Pitfall 5: Global Error Handler Added After Router Registration Has No Effect

**What goes wrong:** Express error-handling middleware (four-argument `(err, req, res, next)`) must be registered after all routes and routers. If `process.on('unhandledRejection')` and `process.on('uncaughtException')` are added correctly but the Express error middleware is inserted in the wrong position (e.g., before the extracted routers are mounted), errors thrown inside router handlers are passed to Express's built-in default handler (which sends a plain HTML 500 response) instead of the custom handler.

**Why it happens:** Express processes middleware in registration order. During the route extraction refactor, the order of `app.use()` calls in `index.js` will change. It is easy to insert the error middleware too early while reorganizing the file. Additionally, async route handlers in Express 4 that throw or reject do not automatically invoke the error middleware unless `next(err)` is explicitly called — Express 5 fixes this, but only for `async` handlers registered directly on the router, not for callbacks passed to third-party libraries.

**Consequences:**
- Unhandled errors in extracted routers produce `Cannot set headers after they are sent` or blank responses.
- The error handler runs but `req` context is lost, making debugging harder.
- Timer callbacks and HAP event handlers that throw still need `process.on('unhandledRejection')` — Express error middleware does not cover them.

**Prevention:**
- Add the global Express error middleware as the very last `app.use()` call in `index.js`, after all router mounts. Add a comment marking its position.
- Separately, add `process.on('unhandledRejection')` and `process.on('uncaughtException')` at process startup (before `migrateDb()`) so they cover timer callbacks and HAP subscription errors that live outside the request cycle.
- Verify the error middleware is active by writing an integration test that hits a route which calls `next(new Error('test'))` and asserts the response shape.

**Warning signs:**
- The error middleware is inserted near the top of the `app.use()` chain.
- No test exists that verifies error middleware receives thrown errors from router handlers.

**Phase:** Error handler phase.

---

### Pitfall 6: `uncaughtException` Handler That Continues Running Produces Zombie Process

**What goes wrong:** Adding `process.on('uncaughtException', handler)` with a handler that logs but does not exit leaves the Node.js process running in an undefined state. An uncaught exception means the call stack unwound past all try/catch boundaries — the application state is likely corrupted. On a self-hosted Docker deployment, this means the process appears healthy (container is running, health check responds) but is processing no HAP events, no alerts, and no requests.

**Why it happens:** The instinct when adding these handlers is to "be resilient" and keep running. This is appropriate for `unhandledRejection` (which is recoverable in many cases) but dangerous for `uncaughtException`.

**Consequences:**
- HAP subscriptions silently die; no new events are logged.
- Health endpoint returns 200 while the app is effectively dead.
- Docker restart policy never triggers because the process is still running.

**Prevention:**
- `process.on('uncaughtException', (err) => { log.error(...); process.exit(1); })` — always exit.
- `process.on('unhandledRejection', (reason) => { log.error(...); })` — log only; exiting on every unhandled rejection is too aggressive for async-heavy code with occasional third-party promise leaks (e.g., hap-controller internal promises).
- Docker's `restart: unless-stopped` policy ensures the container comes back. The exit code 1 provides a clear signal in `docker compose logs`.

**Warning signs:**
- Handler calls `log.error(err)` with no `process.exit()`.
- Comments say "keep running to avoid unnecessary restarts."

**Phase:** Error handler phase.

---

### Pitfall 7: `alert_deliveries` Retention Sweep Deletes Referenced Rows From a Running Alert Rule

**What goes wrong:** The `alert_deliveries` table is referenced by `alert_rules.id` (with `ON DELETE CASCADE`) and also used for quiet-period suppression: the alerts processor queries `alert_deliveries` for recent deliveries to decide whether to suppress the next one. If the retention sweep deletes deliveries that are within the quiet-period window of an active alert rule, the rule fires again immediately — potentially sending a duplicate webhook before the quiet period has actually elapsed.

**Why it happens:** The retention sweep is time-based and does not know about individual alert rules' quiet periods. A delivery from 85 days ago is technically "old," but an alert rule with `quiet_minutes = 130000` (90 days) — the maximum is 10,080 minutes (7 days) — would still be in quiet period. In practice, no rule has a 90-day quiet period, but the code must not assume the retention window is always longer than the longest possible quiet period.

**Consequences:**
- Duplicate webhook deliveries are sent after the sweep runs.
- Users with alert rules for critical events (e.g., front door unlocked) receive unexpected repeat notifications.

**Prevention:**
- The sweep should only delete deliveries older than `MAX(retention_days, MAX(quiet_minutes) / 1440 + 1)` across all enabled rules — i.e., always keep deliveries that are within any rule's quiet window.
- Simpler safe default: retain the last N deliveries per rule regardless of age (e.g., keep the most recent 100 per rule), plus delete all older than 90 days. This covers the quiet-period check without complex date math.
- Add an index on `alert_deliveries(sent_at)` before the sweep runs, not after — the sweep itself becomes the first query to benefit.

**Warning signs:**
- Sweep deletes by absolute age without consulting `alert_rules.quiet_minutes`.
- No test for the scenario: sweep runs, then event fires, alert should be suppressed.

**Phase:** Retention/cleanup phase.

---

### Pitfall 8: Integration Tests That Mock the Pool Break Under Real Query Shape Changes

**What goes wrong:** When writing integration tests for newly extracted routers, developers often mock `pool.query()` to return hardcoded rows. If the actual query changes (different column aliases, different parameter order, added JOIN), the mock still returns the old shape, the test passes, but production fails with `Cannot read properties of undefined`.

**Why it happens:** The existing test pattern uses `node:test` with direct imports and hand-rolled mocks. `events-router.integration.test.js` and `alerts-router.integration.test.js` demonstrate this — they mock `pool.query` with pre-shaped responses. The mock does not validate that the SQL query it received matches expectations.

**Consequences:**
- Tests pass in CI while production routes return 500s after a query change.
- Especially risky for the stats endpoints (complex aggregation queries) and the pairing endpoints (multi-step transactions).

**Prevention:**
- For new router integration tests, use `supertest` against an in-process Express app, but wire it to a real test database (Postgres in Docker, same as CI uses). The CI `ci.yml` already starts Postgres services — check whether it runs `db/init.sql` for the test DB.
- Alternatively, if mocking is used, assert the SQL string received by the mock matches an expected pattern (even a substring check catches most regressions).
- For the pairing endpoint tests specifically, mock at the `HttpClient` level (HAP network calls), not at the DB level — the DB interactions for pairing are simple and should be tested for real.

**Warning signs:**
- Mock returns `{ rows: [{ total: '5' }] }` without checking which SQL query was received.
- Test file has more mock setup lines than assertion lines.

**Phase:** Integration test phase.

---

## Minor Pitfalls

Low probability or low impact; worth knowing but unlikely to block the milestone.

---

### Pitfall 9: Dual Schema Source Drift Between `db/init.sql` and `db.js` `migrateDb()`

**What goes wrong:** If the migration tool is adopted and `migrateDb()` is replaced with migration file execution, `db/init.sql` must either be retired from the Docker volume mount or kept perfectly in sync. Any divergence means fresh installs (which run `init.sql` first, then `migrateDb()`) end up in a different state than upgraded installs.

**Prevention:**
- Decision point: either remove the `db/init.sql` volume mount from `docker-compose.yml` and use migrations exclusively, or generate `init.sql` from the first migration file. Do not maintain both independently.
- Document the chosen approach in `ARCHITECTURE.md` so future contributors do not add schema changes to the wrong place.

**Phase:** Migration system adoption phase.

---

### Pitfall 10: ES Module Top-Level `await` in Extracted Modules Blocks Startup Silently

**What goes wrong:** If an extracted router module (e.g., `setup-router.js`) uses top-level `await` — for example, to load an initial config or warm a cache — it blocks the entire module graph evaluation until it resolves. If the awaited operation hangs (e.g., a DB call before the pool is ready), the Express server never starts, but no error is thrown because the `await` is silently waiting.

**Why it happens:** ES modules support top-level `await` but it is easy to use inadvertently when moving async initialization code out of `index.js` into module scope of the extracted file.

**Prevention:**
- No top-level `await` in any extracted router module. All async initialization belongs in the factory function (`createSetupRouter`) or in `index.js`'s startup sequence.
- Lint rule: `no-await-in-loop` (already applicable), and consider a comment convention noting that extracted router modules must be synchronously importable.

**Phase:** Route extraction phase.

---

### Pitfall 11: Rate Limiter State Is Not Shared Between Router Instances

**What goes wrong:** Each call to `createEventsRouter(...)` or `createAlertsRouter(...)` creates new `rateLimit()` instances. If these factory functions are called more than once (e.g., in tests that instantiate fresh routers per test case), the rate limit counter resets between test runs. This is correct behavior for tests but can mask production issues where the rate limiter should be a singleton.

**Prevention:**
- Rate limiter instances are created inside the factory function — this is the right design for testability. Just do not call the factory more than once in production (`index.js` calls each factory exactly once).
- Test setup that calls the factory per test is fine; just ensure rate limit tests explicitly set low limits and test the actual rejection behavior.

**Phase:** Not milestone-critical; just do not add factory call redundancy in `index.js`.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Route extraction | Stale in-memory state in extracted routers (Pitfall 2) | Pass accessor functions, not values; test post-mutation state |
| Route extraction | Circular import from utilities in `events-router.js` (Pitfall 3) | Create `utils.js` first; update all import sites atomically |
| Route extraction | `async` handlers in new routers not calling `next(err)` on throw | Express 5 handles `async` throws automatically for direct route handlers; verify this is true for all new handlers |
| Migration adoption | Bootstrap `--fake` applied incorrectly (Pitfall 1) | Test bootstrap against fresh Postgres 16 container AND against a copy of production DB |
| Migration adoption | `initial_poll_cleanup` re-runs (Pitfall 1) | Migrate `_migrations` entries into new tool's table before retiring old system |
| Migration adoption | `init.sql` / `db.js` dual source drift (Pitfall 9) | Pick one source of truth in same PR that adds the tool |
| Query optimization | Estimated count is 0 on fresh install (Pitfall 4) | Add `<= 0` fallback to exact count in the same PR as the optimization |
| Query optimization | `alert_deliveries` sweep fires duplicate webhooks (Pitfall 7) | Validate sweep window against max quiet period across enabled rules |
| Error handling | Error middleware registered too early (Pitfall 5) | Pin its position with a comment; verify with a test |
| Error handling | `uncaughtException` does not exit (Pitfall 6) | Always call `process.exit(1)` in the handler |
| Integration tests | Pool mocks that hide query shape changes (Pitfall 8) | Use real test DB in CI; assert mock received SQL matches expectations |

---

## Sources

- [PostgreSQL Count Estimate — PostgreSQL Wiki](https://wiki.postgresql.org/wiki/Count_estimate)
- [Faster PostgreSQL Counting — Citus Data](https://www.citusdata.com/blog/2016/10/12/count-performance/)
- [CYBERTEC: PostgreSQL count(*) made fast](https://www.cybertec-postgresql.com/en/postgresql-count-made-fast/)
- [node-pg-migrate — npm](https://www.npmjs.com/package/node-pg-migrate)
- [node-pg-migrate Official Docs](https://salsita.github.io/node-pg-migrate/)
- [Handling PostgreSQL Migrations in Node.js — bitExpert](https://blog.bitexpert.de/blog/migrations-with-node-pg-migrate)
- [How we make database schema migrations safe and robust — Defacto](https://www.getdefacto.com/article/database-schema-migrations)
- [Express Error Handling — Better Stack](https://betterstack.com/community/guides/scaling-nodejs/error-handling-express/)
- [Express error handling — expressjs.com](https://expressjs.com/en/guide/error-handling.html)
- [The Tiny Mistake That Crashed Our Node.js App — DZone](https://dzone.com/articles/unhandled-promise-rejections-nodejs-crash)
- [Node.js Error Handling Best Practices — Sematext](https://sematext.com/blog/node-js-error-handling/)
- [Circular Dependencies in JavaScript — Tomas Vik](https://blog.viktoras.com/graph/circular-dependencies-in-javascript-explained/)
- [Fixing Circular Dependency Issues in JavaScript Modules — Medium](https://medium.com/@Adekola_Olawale/fixing-circular-dependency-issues-in-javascript-modules-24c953345520)
- [Refactoring a 3,879-Line Express Monolith — earezki.com](https://earezki.com/ai-news/2026-03-29-sprint-8-the-sprint-where-our-monolith-finally-broke/)
- [Node.js project architecture best practices — LogRocket](https://blog.logrocket.com/node-js-project-architecture-best-practices/)
