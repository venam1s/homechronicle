<!-- generated-by: gsd-doc-writer -->
# Testing

HomeChronicle has three test layers: listener unit/integration tests using the Node.js built-in test runner, web component tests using Vitest, and E2E browser tests using Playwright. All three layers run independently with no shared test infrastructure.

## listener tests

The listener uses the Node.js built-in test runner (`node --test`) with `node:assert/strict` for assertions. No additional test framework is installed — only `supertest` is listed as a dev dependency for potential HTTP-level testing.

**Run the full suite:**

```bash
cd listener
npm test
```

This executes `node --test`, which automatically discovers all `*.test.js` files under the current directory tree.

**Run a single file:**

```bash
cd listener
node --test test/events-router.integration.test.js
```

### test file locations

All listener tests live in `listener/test/`. Files follow two naming conventions:

| Pattern | Purpose |
|---|---|
| `*.test.js` | unit tests for a single module |
| `*.integration.test.js` | integration-style tests for a full router |

Examples of each:

- `alerts.processor.test.js` — unit test for `alerts.js`
- `security.test.js` — unit test for `security.js`
- `events-router.integration.test.js` — full router test for `events-router.js`
- `setup-router.integration.test.js` — full router test for `setup-router.js`

### mocking the database pool

The listener avoids any test database. Every test that touches database-backed code passes a hand-written `pool` object whose `query` method inspects the SQL string and returns canned rows:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEventsRouter } from '../src/events-router.js';

const pool = {
  async query(sql) {
    if (sql.includes('pg_class')) return { rows: [{ reltuples: 5000 }] };
    if (sql.includes('SELECT id')) return { rows: [] };
    return { rows: [] };
  },
};
```

Branch on SQL substrings to return different shapes. Every test constructs its own pool — there is no shared mock object.

### creating routers under test

Routers are created with `createXxxRouter({ pool, ...deps })`. Pass only the dependencies the test exercises; use no-op stubs for the rest:

```js
import { createSetupRouter } from '../src/setup-router.js';

function makeRouter(overrides = {}) {
  return createSetupRouter({
    pool: { async query() { return { rows: [] }; } },
    getDiscoveryCache: () => [],
    setDiscoveryCache: () => {},
    runDiscoveryScan: async () => [],
    loadPairings: () => ({}),
    savePairings: async () => {},
    loadRooms: () => ({}),
    saveRooms: async () => {},
    ...overrides,
  });
}
```

Use `overrides` to inject specific behaviour for each test without repeating the full stub list.

### invoking route handlers directly

Tests do not spin up an HTTP server. Instead they extract the route handler from `router.stack` and call it with a minimal `req`/`res` pair:

```js
function getRouteHandler(router, method, path) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (layer.route.path !== path) continue;
    if (!layer.route.methods[method.toLowerCase()]) continue;
    return layer.route.stack.at(-1).handle;
  }
  throw new Error(`Route not found: ${method} ${path}`);
}

async function invoke(handler, { query = {}, params = {}, body = {} } = {}) {
  let statusCode = 200;
  let jsonBody = null;
  const req = { query, params, body };
  const res = {
    status(code) { statusCode = code; return this; },
    json(payload) { jsonBody = payload; return this; },
    setHeader() { return this; },
  };
  await handler(req, res);
  return { statusCode, jsonBody };
}
```

This pattern avoids network overhead and keeps tests fast. Copy `getRouteHandler` and `invoke` verbatim into each integration test file.

### mocking global.fetch

Tests that exercise code calling `global.fetch` (such as alert webhook delivery) replace it temporarily and restore it in a `finally` block:

```js
const originalFetch = global.fetch;
global.fetch = async () => ({ ok: true, status: 200 });
try {
  await processAlertsForEvent(pool, makeEvent());
  assert.equal(deliveries[0].status, 'sent');
} finally {
  global.fetch = originalFetch;
}
```

### using node:test mock for timers and imports

For modules that schedule timers or have complex internal state, import `mock` from `node:test`:

```js
import { mock } from 'node:test';
```

The `repair-scheduler.test.js` file demonstrates patching `globalThis.Date` to control time-dependent logic without relying on fake timer APIs.

### factory helpers in tests

Tests define `makeRule()` and `makeEvent()` factory functions that return valid objects with sensible defaults, accepting an `overrides` spread:

```js
function makeRule(overrides = {}) {
  return {
    id: 1,
    name: 'Motion detected',
    enabled: true,
    scope_type: 'characteristic',
    scope_value: 'MotionDetected',
    operator: 'equals',
    match_value: 'true',
    target_url: 'https://203.0.113.10/hook',
    quiet_minutes: 0,
    ...overrides,
  };
}
```

Define these above the first `test()` call in each file.

---

## web tests

The web package uses Vitest 4.x with a jsdom environment. Testing Library (`@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`) provides the component assertion layer.

**Run the full suite:**

```bash
cd web
npm test
```

This executes `vitest run` — a single non-watch pass suitable for CI.

**Watch mode** (not configured as a named script — invoke vitest directly):

```bash
cd web
npx vitest
```

### configuration

Vitest is configured inside `web/vite.config.js`:

```js
test: {
  environment: 'jsdom',
  setupFiles: './src/test/setup.js',
  globals: true,
},
```

The setup file `web/src/test/setup.js` imports `@testing-library/jest-dom` to extend Vitest's `expect` with matchers like `toBeInTheDocument()` and `toBeChecked()`.

`globals: true` makes `describe`, `it`, `expect`, `vi`, `beforeEach`, and `afterEach` available without explicit imports in `.jsx` test files. Plain `.js` test files import them explicitly:

```js
import { describe, it, expect } from 'vitest';
```

### test file locations

Web tests live alongside the source files they test:

| File | Tests |
|---|---|
| `web/src/App.smoke.test.jsx` | Top-level tab navigation smoke test |
| `web/src/components/Toast.test.jsx` | Toast component behaviour |
| `web/src/components/Timeline.test.jsx` | Timeline rendering |
| `web/src/components/setup/MyDevicesTab.test.jsx` | Device list tab |
| `web/src/components/setup/SettingsTab.test.jsx` | Settings tab |
| `web/src/hooks/useLiveEventToasts.test.js` | Hook export verification |
| `web/src/lib/episodes.test.js` | `groupIntoScenes` / `groupScenesIntoEpisodes` logic |

### render helpers

The smoke test wraps the app in a `QueryClientProvider` with retries disabled and a `ToastProvider`:

```js
function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </QueryClientProvider>
  );
}
```

Use the same wrapper pattern in any test that renders components that call `useQuery` hooks. Set `retry: false` to prevent Vitest from waiting for query retries on network errors.

### mocking modules

Heavy components (charts, complex panels) are replaced with lightweight stubs using `vi.mock`:

```js
vi.mock('./components/Timeline.jsx', () => ({ default: () => <div>Timeline View</div> }));
vi.mock('./components/StatsCards.jsx', () => ({ default: () => <div>Stats Cards</div> }));
vi.mock('./hooks/useLiveEventToasts.js', () => ({ useLiveEventToasts: () => {} }));
```

Place `vi.mock` calls at the top of the test file, outside any `describe` block.

### pure logic tests

Tests for `web/src/lib/episodes.js` test exported functions directly with no React or jsdom involvement:

```js
import { describe, expect, it } from 'vitest';
import { groupIntoScenes, groupScenesIntoEpisodes } from './episodes.js';

it('groups nearby events into scenes', () => {
  const scenes = groupIntoScenes([
    makeEvent('1', '2026-03-11T12:03:00.000Z'),
    makeEvent('2', '2026-03-11T12:02:57.000Z'),
  ]);
  expect(scenes).toHaveLength(1);
});
```

---

## E2E tests

E2E tests use Playwright targeting Chromium only. They are not part of CI — they require a running application and must be run manually.

**Specs live in `e2e/`:**

| File | What it covers |
|---|---|
| `e2e/theme-audit.spec.js` | Visual screenshots of every tab in light and dark mode |
| `e2e/toast-notifications.spec.js` | Toast notification settings UI and API round-trips |

### prerequisites

The web preview server must be running on port 4173 before running E2E tests. The `toast-notifications.spec.js` tests additionally require the listener API to be running on port 3001.

```bash
# Terminal 1 — build and serve the web app
cd web
npm run build
npx vite preview

# Terminal 2 — start the listener (requires .env and PostgreSQL)
cd listener
npm run dev
```

### run E2E tests

```bash
# from the project root
npx playwright test
```

**Run a specific spec:**

```bash
npx playwright test e2e/theme-audit.spec.js
```

### playwright configuration

`playwright.config.js` in the project root:

```js
module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
```

Screenshots on failure are written to `test-results/`. Theme audit screenshots are always written to `test-results/theme-audit/` regardless of pass/fail.

### theme audit spec pattern

The theme audit spec loops over `['light', 'dark']` and every tab, setting theme via `localStorage` and `document.documentElement` attributes before taking a full-page screenshot:

```js
await page.evaluate((t) => {
  localStorage.setItem('hc_theme_preference', t);
  document.documentElement.dataset.theme = t;
  document.documentElement.classList.toggle('theme-dark', t === 'dark');
});
```

This produces screenshots named `test-results/theme-audit/dark-dashboard.png`, `test-results/theme-audit/light-timeline.png`, and so on.

---

## CI integration

The CI workflow is defined in `.github/workflows/ci.yml` and runs on all pull requests targeting `main`.

**Trigger:** `pull_request` to `main`  
**Runner:** `ubuntu-latest`, Node.js 20

Steps run sequentially:

1. Install listener dependencies — `npm ci --prefix listener`
2. Run listener tests — `npm test --prefix listener`
3. Install web dependencies — `npm ci --prefix web`
4. Run web tests — `npm test --prefix web`

E2E tests are **not** included in CI. They require a live application and are run manually.

No coverage thresholds are configured. The CI job passes when all `node --test` and `vitest run` assertions pass with exit code 0.
