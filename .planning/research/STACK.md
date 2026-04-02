# Technology Stack — Code Health Milestone

**Project:** HomeChronicle
**Milestone:** Code health — migrations, query optimization, router extraction, error handling
**Researched:** 2026-04-02
**Overall confidence:** HIGH (all four domains verified against official documentation or primary sources)

---

## Domain 1: Node.js Database Migration Tool

### Recommendation: `node-pg-migrate` v8

**Version:** 8.0.4 (released December 11, 2025)
**Install:** `npm install node-pg-migrate`

#### Why node-pg-migrate over alternatives

| Criterion | node-pg-migrate v8 | dbmate | Knex migrations |
|-----------|-------------------|--------|-----------------|
| ES module native | YES (v8 is ESM-only) | N/A (Go binary) | Partial (CJS-first) |
| PostgreSQL-specific DSL | YES | NO (SQL-only) | NO (generic) |
| Programmatic API | YES | NO | YES |
| Node 22 compatible | YES (requires Node 20+) | YES | YES |
| Runs inline on startup | YES | Requires separate process | YES |
| TypeScript-authored | YES | NO | NO |
| Active maintenance | YES (Dec 2025 release) | YES | YES |

**Why not dbmate:** dbmate is a standalone Go binary that requires a separate process or Docker entrypoint step. It cannot be called programmatically from Node startup code — it must be invoked as a CLI command. For a self-hosted Docker container where the listener bootstraps its own schema, this is an awkward fit that adds Docker `command:` or `entrypoint:` complexity.

**Why not Knex migrations:** Knex is an ORM-adjacent query builder. Adopting only its migration system without using its query builder adds an unnecessary dependency footprint. HomeChronicle already uses raw `pg` queries and that pattern should be preserved.

**Why node-pg-migrate v8 specifically:** v8 (released Dec 2025) completed the long-awaited migration to ESM-only. It requires Node 20+ (matched by the project's Node 22 runtime), uses `import.meta.dirname` instead of `__dirname`, and the historical `ERR_REQUIRE_ESM` bug that affected v7 is resolved. Migration files written as `.js` in an ESM project work natively.

**Confidence:** HIGH — verified against GitHub releases page, npm, and the v8 ESM issue thread.

#### ESM import syntax

```js
import migrationRunner from 'node-pg-migrate';
```

#### Programmatic startup pattern

```js
// listener/src/db.js — run migrations before accepting requests
import migrationRunner from 'node-pg-migrate';

export async function runMigrations() {
  await migrationRunner({
    databaseUrl: process.env.DATABASE_URL,
    dir: new URL('../migrations', import.meta.url).pathname,
    direction: 'up',
    migrationsTable: 'pgmigrations',  // separate from hand-rolled _migrations
    singleTransaction: true,          // all pending migrations in one transaction
  });
}
```

#### Migration file convention

```
listener/migrations/
  1745000000000_initial-schema.js
  1745000000001_add-alert-deliveries-retention.js
  ...
```

Migration files use the node-pg-migrate DSL:

```js
// listener/migrations/1745000000001_add-alert-deliveries-retention.js
export const up = (pgm) => {
  pgm.addIndex('alert_deliveries', 'sent_at', { name: 'idx_alert_deliveries_sent_at' });
};

export const down = (pgm) => {
  pgm.dropIndex('alert_deliveries', 'sent_at', { name: 'idx_alert_deliveries_sent_at' });
};
```

#### Migration from current hand-rolled system

The existing `_migrations` table and `migrateDb()` `IF NOT EXISTS` pattern must coexist with node-pg-migrate during transition. The recommended sequence:

1. Snapshot the current schema into a single `0001_initial-schema.js` migration that is marked as already applied (insert the row into `pgmigrations` without executing DDL on existing installations).
2. All future schema changes go into numbered migration files.
3. The `migrateDb()` function in `db.js` is reduced to only the `pool.on('error')` setup; DDL moves to migration files.
4. `runMigrations()` is called before `migrateDb()` at startup.

**Bootstrapping existing installs without re-running DDL:** Use the `--fake` CLI flag or the `fake: true` programmatic option when marking the initial snapshot as applied on existing databases. For new installs, the migration runs normally.

---

## Domain 2: PostgreSQL COUNT(*) Optimization

### Recommendation: Two-tier count strategy — estimated vs. exact

The project's CONCERNS.md correctly identified this as a HIGH priority issue. The fix does not require a new library — it is a pure SQL pattern change.

#### Why COUNT(*) is slow at scale

PostgreSQL's MVCC model means no cached row count exists at the engine level. Every `COUNT(*)` requires scanning all index pages visible to the current transaction. For `event_logs` with hundreds of thousands of rows and no active filters, this becomes a full index scan on every paginated Timeline request.

#### Recommended approach: conditional count strategy

Use estimated row counts for unfiltered queries, exact counts only when filters are applied (since filtered counts are already faster due to index selectivity).

**Estimated count SQL (unfiltered only):**

```sql
-- Reads from pg_class stats, updated by autovacuum/ANALYZE
-- Typically within 10% of actual count; fast regardless of table size
SELECT reltuples::bigint AS estimate
FROM   pg_class
WHERE  oid = 'event_logs'::regclass;
```

**More accurate estimate (uses planner's scaled formula):**

```sql
-- Uses EXPLAIN JSON to get planner row estimate; handles filtered queries
CREATE OR REPLACE FUNCTION count_estimate(query text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE plan jsonb;
BEGIN
  EXECUTE format('EXPLAIN (FORMAT JSON) %s', query) INTO plan;
  RETURN (plan -> 0 -> 'Plan' ->> 'Plan Rows')::bigint;
END;
$$;
```

**Applied to events-router.js:**

```js
// In GET /events handler — replace the current COUNT(*) call:
let total;
if (!conditions.length) {
  // No filters: fast estimate from pg_class (O(1), avoids index scan)
  const estResult = await pool.query(
    `SELECT reltuples::bigint AS estimate FROM pg_class WHERE oid = 'event_logs'::regclass`
  );
  total = Number(estResult.rows[0].estimate);
} else {
  // Filters applied: exact COUNT is acceptable, row set is smaller
  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM event_logs WHERE ${conditions.join(' AND ')}`,
    params
  );
  total = Number(countResult.rows[0].total);
}
```

**Tradeoff to document in code:** `reltuples` is updated by autovacuum, which runs frequently on an append-only event table. The value can lag slightly after bulk inserts but is typically within a few percent. For a timeline's total page count display, this is acceptable — the user sees "~12,400 events" rather than "12,403 events." Add a `// estimated` flag in the JSON response so the UI can optionally indicate approximation.

**Confidence:** HIGH — behavior of `reltuples` documented in PostgreSQL official wiki (wiki.postgresql.org/wiki/Count_estimate), Citus Data engineering blog, and CYBERTEC.

#### alert_deliveries COUNT(*) fix (MEDIUM priority)

Same pattern applies to `alerts-router.js` line 303. Additionally, add a retention sweep for `alert_deliveries` older than N days to bound the table size:

```sql
DELETE FROM alert_deliveries WHERE sent_at < NOW() - INTERVAL '90 days';
```

Expose as `ALERT_DELIVERY_RETENTION_DAYS` env var with a default of 90.

#### Do NOT use keyset/cursor pagination for this milestone

Keyset pagination eliminates COUNT entirely but requires a breaking API change: the `?page=N` interface used by the React Timeline component would need to change to `?cursor=<opaque>`. This is a frontend-impacting API break that should be its own milestone. The two-tier count strategy solves the performance problem within the existing API contract.

---

## Domain 3: Express Router Extraction Pattern

### Recommendation: Native `express.Router()` — no new library needed

Express Router is the correct and complete tool. The project already has four successfully extracted routers (`events-router.js`, `alerts-router.js`, `retention-router.js`, `matter-router.js`). The pattern is proven. No additional library should be introduced.

**Confidence:** HIGH — Express 5 official documentation confirms the Router API is unchanged from v4 for this use case.

#### The established pattern (follow exactly)

The existing routers use a factory function pattern, not a bare `express.Router()` export. This is the correct approach because it allows dependency injection of `pool`, `store`, and other shared resources without module-level globals.

```js
// listener/src/setup-router.js
import express from 'express';

export function createSetupRouter({ pool, store, pairingStore }) {
  const router = express.Router();

  router.get('/setup/accessories', async (req, res) => {
    // ...
  });

  return router;
}
```

```js
// listener/src/index.js — mount point
import { createSetupRouter } from './setup-router.js';

app.use('/api', createSetupRouter({ pool, store, pairingStore }));
```

#### What to extract from index.js

Based on the CONCERNS.md audit of `listener/src/index.js` (2,102 lines), the remaining route groups that need extraction are:

| Module to create | Route prefix | Approx lines in index.js |
|-----------------|-------------|--------------------------|
| `setup-router.js` | `/api/setup`, `/api/pairing`, `/api/pairings` | ~600 lines |
| `accessories-router.js` | `/api/accessories`, `/api/rooms`, `/api/display-names`, `/api/notes` | ~400 lines |
| `stats-router.js` | `/api/stats`, `/api/dashboard` | ~300 lines |
| `health-router.js` | `/api/health` | ~50 lines |

#### Express 5 async error handling — eliminate try/catch in routes

Express 5 automatically propagates `async` route handler rejections to the error middleware. This is a v5-specific behavior that the existing routes do not yet exploit (they all use `try/catch` + `res.status(500).json()`).

**Current pattern (Express 4 style, still valid but verbose):**
```js
router.get('/events', async (req, res) => {
  try {
    // ...
  } catch (err) {
    log.error('[api] error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

**Express 5 pattern (preferred for new routers):**
```js
router.get('/events', async (req, res) => {
  // If this throws, Express 5 calls next(err) automatically
  // The global error handler (see Domain 4) catches it
  const result = await pool.query('...');
  res.json(result.rows);
});
```

For this milestone, the recommendation is: use the Express 5 auto-propagation in newly extracted routers, and leave existing try/catch patterns in place in files not being extracted. Do not do a broad try/catch removal pass — that is a separate cleanup concern.

#### Integration test pattern (follow existing)

```js
// listener/test/setup-router.integration.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createSetupRouter } from '../src/setup-router.js';

// Follow the pattern in alerts-router.integration.test.js
```

---

## Domain 4: Global Error Handling in Node.js/Express

### Recommendation: Three-layer handler — Express middleware + process.on events

No new library is needed. This is a pure Node.js + Express configuration change.

**Confidence:** HIGH — patterns verified against Express 5 official documentation and Node.js process event documentation.

#### Layer 1: Express error middleware (handles request-cycle errors)

Place this as the last `app.use()` call in `index.js`, after all routes:

```js
// listener/src/index.js — add after all app.use(router) calls

function globalExpressErrorHandler(err, req, res, next) {
  const status = err.status ?? err.statusCode ?? 500;
  log.error(`[api] Unhandled route error: ${req.method} ${req.path}`, err.message ?? err.stack);
  if (res.headersSent) {
    return next(err);
  }
  res.status(status).json({ error: err.message ?? 'Internal server error' });
}

app.use(globalExpressErrorHandler);
```

This catches:
- Errors thrown in synchronous route handlers
- Rejections from async route handlers (Express 5 auto-propagates these)
- Errors passed to `next(err)` anywhere in the middleware chain

#### Layer 2: process.on('unhandledRejection') — catches timer/event handler rejections

Covers rejected promises outside the Express request cycle (setInterval callbacks, event emitter handlers, HAP subscriber callbacks, Matter polling callbacks):

```js
// listener/src/index.js — near the top, before server.listen()

process.on('unhandledRejection', (reason, promise) => {
  log.error('[process] Unhandled promise rejection:', reason?.message ?? reason);
  // Do NOT exit here — Docker restarts the container but we lose all
  // in-flight HAP subscriptions. Log and continue; monitor for recurrence.
});
```

**Important nuance for this project:** The standard advice is "exit after unhandledRejection." For HomeChronicle, the correct choice is to log and continue. Exiting tears down all HAP event subscriptions, which take 30-60 seconds to re-establish on restart. A logged warning that occurs in a non-critical path (e.g., discovery cleanup) is preferable to a full restart storm. If the rejection is from a critical path, the relevant code should propagate the error correctly rather than relying on the global handler.

#### Layer 3: process.on('uncaughtException') — catches synchronous throw outside try/catch

```js
process.on('uncaughtException', (err) => {
  log.error('[process] Uncaught exception — exiting for clean Docker restart:', err.message ?? err.stack);
  // Always exit on uncaughtException. The process is in an unknown state.
  // Docker restart policy handles recovery.
  process.exit(1);
});
```

`uncaughtException` always warrants process exit — the synchronous exception means the call stack is undefined and continuing is unsafe.

#### Layer 4: Silent catch block remediation

Several `catch {}` blocks in `index.js`, `matter-controller.js` exist in cleanup paths where failure is expected (e.g., `discovery.stop()` after a scan timeout). These are not error hiding — they are intentionally silent on expected errors. The fix is minimal:

```js
// Before:
try { await discovery.stop(); } catch {}

// After:
try { await discovery.stop(); } catch (err) {
  log.debug('[discovery] Expected stop error during cleanup:', err.message);
}
```

Use `log.debug` not `log.error` — these are not actionable failures. The goal is debuggability, not alarming operators.

---

## Consolidated Install

```bash
# From listener/
npm install node-pg-migrate
```

That is the only new dependency this milestone requires. All other changes are pattern changes within existing code.

---

## What NOT to Use

| Tool | Why Not |
|------|---------|
| Knex | Brings query builder coupling to a project using raw pg; migration-only use is undersized for the dependency |
| dbmate | Go binary requiring CLI invocation; can't run programmatically from Node startup |
| Flyway / Liquibase | JVM tools — completely wrong runtime |
| `express-async-errors` | Monkey-patches Express require() internals; unnecessary since Express 5 has native async error propagation |
| `pg-promise` migrations | Ties migration system to query library; adds pg-promise to a project already using raw `pg` |
| Table partitioning | Out of scope per PROJECT.md — premature at current scale |
| Prometheus client | Out of scope per PROJECT.md |

---

## Sources

- node-pg-migrate GitHub releases: https://github.com/salsita/node-pg-migrate/releases
- node-pg-migrate programmatic API docs: https://salsita.github.io/node-pg-migrate/api
- node-pg-migrate ESM v8 issue (resolved): https://github.com/salsita/node-pg-migrate/issues/895
- PostgreSQL count estimation wiki: https://wiki.postgresql.org/wiki/Count_estimate
- Faster PostgreSQL Counting (Citus Data): https://www.citusdata.com/blog/2016/10/12/count-performance/
- Express 5 error handling docs: https://expressjs.com/en/guide/error-handling.html
- Express 5 routing docs: https://expressjs.com/en/guide/routing.html
- Node.js process events (unhandledRejection, uncaughtException): https://nodejs.org/api/process.html
- BetterStack Express error handling patterns: https://betterstack.com/community/guides/scaling-nodejs/error-handling-express/
