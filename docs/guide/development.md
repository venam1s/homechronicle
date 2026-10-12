<!-- generated-by: gsd-doc-writer -->
# Development Guide

This guide covers local development setup, project structure, coding conventions, and how to extend homechronicle with new routes and database migrations.

## local setup

homechronicle has no root-level `package.json`. The `listener/` and `web/` directories are independent npm packages, each with their own `package-lock.json`. There is no npm workspace configuration — they are developed and installed separately.

### prerequisites

- Node.js 20 or later (CI runs on Node 20; the Docker image uses Node 22)
- Docker with Compose v2 (for the local PostgreSQL container)
- npm (no yarn or pnpm)

### starting the dev environment

The `dev-local.sh` script starts all three components — a PostgreSQL container, the listener, and the Vite dev server — with a single command:

```bash
./scripts/dev-local.sh
```

What it does:

1. Starts the `postgres` Docker container using `docker compose up -d postgres`
2. Waits for PostgreSQL to pass a health check
3. Runs `npm install` in `listener/` and `web/` if `node_modules` is absent
4. Starts the listener in development mode (`NODE_ENV=development`) on port 3001
5. Starts the Vite dev server on port 5173

| Service | URL |
|---------|-----|
| Web UI | http://localhost:5173 |
| Listener API | http://localhost:3001 |

Press `Ctrl+C` to stop both processes. The script traps `INT`, `TERM`, and `EXIT` to kill both background processes cleanly.

### environment variables

Copy `.env.example` to `.env` before running. The dev script sources `.env` automatically if it exists, then falls back to these defaults:

| Variable | Dev default |
|----------|-------------|
| `POSTGRES_USER` | `homekit` |
| `POSTGRES_PASSWORD` | `changeme` |
| `POSTGRES_DB` | `homekit_events` |
| `API_PORT` | `3001` |
| `DISCOVER_IFACE` | `en0` |

See [Environment Variables](environment-variables.md) for the full reference.

### running packages individually

**Listener** (from `listener/`):

```bash
npm run dev      # dev mode — uses local DB, DISCOVER_IFACE=en0
npm run start    # production mode — reads ../.env
npm test         # node --test (runs all test/*.test.js files)
npm run seed     # populate test data
npm run discover # standalone mDNS discovery
npm run pair     # standalone pairing
```

**Web** (from `web/`):

```bash
npm run dev      # Vite dev server with proxy to :3001
npm run build    # production build to dist/
npm run preview  # preview production build locally
npm test         # vitest run (jsdom environment)
```

---

## project structure

```
homechronicle/
├── listener/               # Node.js service (Express API + device subscriptions)
│   ├── src/                # ES module source files (kebab-case)
│   ├── migrations/         # SQL migration files (node-pg-migrate)
│   ├── test/               # Test files (node --test)
│   ├── data/               # Runtime JSON config files (gitignored)
│   └── package.json
├── web/                    # React SPA (Vite + Tailwind v4)
│   ├── src/
│   │   ├── components/     # React components (PascalCase .jsx)
│   │   ├── hooks/          # Custom hooks (use* prefix)
│   │   ├── lib/            # Shared utilities (api.js, episodes.js)
│   │   └── test/           # Vitest setup
│   └── package.json
├── docker/                 # Docker helper files
├── scripts/                # Dev and deployment scripts
├── e2e/                    # Playwright end-to-end tests
└── docker-compose.yml
```

### listener source layout

Each concern lives in its own file. There are no barrel files — import directly from the source file:

| File | Purpose |
|------|---------|
| `index.js` | Entry point; wires all routers and starts subscribers |
| `db.js` | pg pool, `insertEvent()`, `migrateDb()`, retention sweep |
| `store.js` | `JsonObjectStore` — atomic JSON file persistence |
| `subscriber.js` | HAP event subscriptions with reconnect backoff |
| `matter-runtime.js` / `matter-controller.js` | Matter.js lifecycle, subscriptions and reconcile/poll reads |
| `events-router.js` | GET events, accessories, stats |
| `alerts-router.js` + `alerts.js` | Webhook and email alert rules |
| `setup-router.js` | Discovery, pairing, rooms, display names, notes |
| `retention-router.js` | Retention and settings configuration |
| `repair-router.js` + `repair-scheduler.js` | Scheduled HomeKit pairing repair |
| `matter-router.js` | Matter device discovery and pairing |
| `archive-router.js` | Event archive management |
| `stats-router.js` | Aggregation stats and heatmaps |
| `accessories-router.js` | Accessory detail and metadata |
| `health-router.js` | Service health check |
| `security.js` | Token comparison, SSRF protection, rate limit key generation |
| `query-cache.js` | In-memory TTL cache for expensive queries |
| `logger.js` | Level-aware logger wrapping `console` |
| `anomaly-detection.js` | Statistical anomaly detection for events |

---

## coding conventions

### module system

All code uses native ES modules. Every file uses `import`/`export` — no `require()` or `module.exports`. Both packages declare `"type": "module"` in their `package.json`.

Always include the file extension in imports:

```js
import { log } from './logger.js';
import { createEventsRouter } from './events-router.js';
```

No path aliases are configured. Use relative paths only.

### file naming

| Context | Convention | Example |
|---------|------------|---------|
| Listener source files | kebab-case `.js` | `events-router.js`, `matter-controller.js` |
| React components | PascalCase `.jsx` | `Timeline.jsx`, `StatsCards.jsx` |
| Test files | Mirror source + `.test.` | `alerts.processor.test.js`, `Toast.test.jsx` |
| Integration tests | `.integration.test.js` | `events-router.integration.test.js` |
| E2E specs | `.spec.js` | `theme-audit.spec.js` |

### naming patterns

| Symbol | Convention | Example |
|--------|------------|---------|
| Functions | camelCase | `insertEvent()`, `parseIntInRange()` |
| React hooks | `use` prefix | `useEvents()`, `usePalette()` |
| Factory functions | `create` prefix | `createEventsRouter()`, `createAlertsRouter()` |
| Validator helpers | `validate` prefix | `validateWebhookTargetUrl()` |
| Parser helpers | `parse` prefix | `parseScopeType()`, `parseOperator()` |
| Module-level constants | UPPER_SNAKE_CASE | `EVENTS_RATE_LIMIT_MAX`, `PAGE_SIZE` |
| SQL columns | snake_case | `accessory_id`, `room_name`, `new_value` |
| JS object keys | camelCase | `accessoryId`, `roomName`, `newValue` |
| Local variables | camelCase | `retentionDays`, `sceneWindowMs` |

### code style

There is no ESLint or Prettier configured. Style is maintained manually:

- 2-space indentation
- Single quotes for strings
- Trailing commas in multi-line arrays and objects
- Semicolons required
- `import`/`export` throughout (no CommonJS)

Rely on Node.js strict mode and Vite build errors to catch issues.

### error handling

Each route handler wraps its body in try/catch:

```js
router.get('/events', async (req, res) => {
  try {
    // ...handler logic
  } catch (err) {
    log.error('[api] /api/events error:', err.message ?? err.stack ?? err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

Return `{ error: '<specific message>' }` with status 400 for validation errors. Return `{ error: 'Internal server error' }` with status 500 for unexpected errors.

---

## adding a new api route

All routers follow the factory function pattern: a `createXxxRouter({ ...deps })` function that accepts injected dependencies and returns an `express.Router()`. This keeps each module independently testable without starting the full server.

### 1. create the router file

Create `listener/src/my-feature-router.js`:

```js
import express from 'express';
import rateLimit from 'express-rate-limit';
import { log } from './logger.js';
import { rateLimitKeyGenerator } from './security.js';
import { parseIntInRange } from './utils.js';

const MY_RATE_LIMIT_WINDOW_MS = parseIntInRange(
  process.env.MY_RATE_LIMIT_WINDOW_MS,
  60_000,
  1_000,
  24 * 60 * 60 * 1000
);
const MY_RATE_LIMIT_MAX = parseIntInRange(
  process.env.MY_RATE_LIMIT_MAX,
  120,
  1,
  100_000
);

export function createMyFeatureRouter({ pool }) {
  const router = express.Router();
  const readLimiter = rateLimit({
    windowMs: MY_RATE_LIMIT_WINDOW_MS,
    max: MY_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    keyGenerator: rateLimitKeyGenerator,
    message: { error: 'Too many requests' },
  });

  router.get('/my-feature', readLimiter, async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT ...');
      res.json({ items: rows });
    } catch (err) {
      log.error('[my-feature] GET /api/my-feature error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
```

### 2. mount in index.js

Import the factory and mount the router in `listener/src/index.js`, alongside the existing routers:

```js
import { createMyFeatureRouter } from './my-feature-router.js';

// ...inside the REST API section:
app.use('/api', createMyFeatureRouter({ pool }));
```

### 3. write a test

Create `listener/test/my-feature-router.integration.test.js`. The integration test pattern creates a mock `pool` that returns canned query results, then invokes the route handler directly without starting a server:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMyFeatureRouter } from '../src/my-feature-router.js';

function getRouteHandler(router, method, path) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (layer.route.path !== path) continue;
    if (!layer.route.methods[method.toLowerCase()]) continue;
    return layer.route.stack.at(-1).handle;
  }
  throw new Error(`Route not found: ${method} ${path}`);
}

test('GET /api/my-feature returns items', async () => {
  const pool = { async query() { return { rows: [{ id: 1 }] }; } };
  const router = createMyFeatureRouter({ pool });
  const handler = getRouteHandler(router, 'get', '/my-feature');

  let jsonBody;
  const res = { json(b) { jsonBody = b; }, status() { return this; } };
  await handler({ query: {} }, res);

  assert.deepEqual(jsonBody, { items: [{ id: 1 }] });
});
```

Run the listener test suite:

```bash
cd listener && npm test
```

---

## adding a database migration

Migrations live in `listener/migrations/` and are managed by [node-pg-migrate](https://salsita.github.io/node-pg-migrate/). They run automatically when the listener starts, via `migrateDb()` in `listener/src/db.js`.

### migration file naming

Files are named with a zero-padded sequence number followed by a short description:

```
0001_baseline.sql
0002_alert_deliveries_sent_at_index.sql
0003_your_change_here.sql
```

The number must be strictly sequential. node-pg-migrate applies migrations in ascending order and records applied migrations in the `pgmigrations` table.

### migration file format

Each file contains an up migration. A down migration section is optional but recommended for reversibility:

```sql
-- Up Migration

ALTER TABLE event_logs ADD COLUMN IF NOT EXISTS my_column TEXT;

CREATE INDEX IF NOT EXISTS idx_event_logs_my_column ON event_logs (my_column);

-- Down Migration

DROP INDEX IF EXISTS idx_event_logs_my_column;
ALTER TABLE event_logs DROP COLUMN IF EXISTS my_column;
```

Use `IF NOT EXISTS` / `IF EXISTS` guards so that re-running a migration on an existing install does not cause errors.

### applying migrations

Migrations apply automatically the next time the listener starts. In development:

```bash
cd listener && npm run dev
```

Or start the full stack:

```bash
./scripts/dev-local.sh
```

The listener logs each migration as it runs:

```
[migrate] Migrating up: 0003_your_change_here
```

### existing install compatibility

`migrateDb()` handles upgrades from installations that predate the migration system. If the `event_logs` table already exists but the `pgmigrations` tracking table does not, the baseline migration (`0001_baseline`) is fake-applied so that node-pg-migrate does not attempt to recreate already-existing objects.

New migrations you add are always applied normally — this compatibility logic only affects the baseline.
