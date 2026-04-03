---
phase: 06-router-extraction-setup
plan: "03"
subsystem: listener/api
tags: [refactoring, helper-extraction, setup-helpers, discovery-helpers, utils, tdd]
dependency_graph:
  requires: ["06-01", "06-02"]
  provides: [setup-helpers-module, discovery-helpers-module, slim-index-js, RTR-10]
  affects:
    - listener/src/index.js
    - listener/src/setup-helpers.js
    - listener/src/discovery-helpers.js
    - listener/src/utils.js
    - listener/src/setup-router.js
    - listener/src/accessories-router.js
tech_stack:
  added: []
  patterns:
    - pure-function-extraction
    - factory-function-helper
    - direct-import-for-pure-functions
    - dep-injection-for-testable-deps
key_files:
  created:
    - listener/src/setup-helpers.js
    - listener/src/discovery-helpers.js
    - listener/test/setup-helpers.test.js
  modified:
    - listener/src/utils.js
    - listener/src/index.js
    - listener/src/setup-router.js
    - listener/src/accessories-router.js
decisions:
  - "Pure functions (isHomeKitPairing, getHomeKitPairings, normalizePairingRecord, mapReliabilityStats) imported directly by routers — not injected as callbacks"
  - "HttpClient kept as injected dep in accessories-router to allow test mocking"
  - "createDiscoveryHelpers factory call placed before subscriber startup to avoid temporal dependency issue"
  - "parentBridgeId, deriveDeviceHealth imported directly in accessories-router (not mocked in tests)"
  - "apiWriteLimiter and API_STATS_RATE_LIMIT constants removed as dead code — all routes now use router-level rate limiters"
  - "index.js reaches 477 lines (not 300-400 target) — plan underestimated remaining essential content"
metrics:
  duration_minutes: 30
  completed_date: "2026-04-02"
  tasks_completed: 2
  files_changed: 7
---

# Phase 06 Plan 03: Gap Closure — Helper Extraction Summary

**One-liner:** Extracted 7 pure helper functions and 2 factory functions from index.js into setup-helpers.js, discovery-helpers.js, and utils.js; rewired all consumers to import directly, dropping index.js from 788 to 477 lines and adding 32 unit tests.

## What Was Built

**listener/src/setup-helpers.js** — New module exporting 6 pure functions (`normalizeMatterNodeId`, `normalizePairingRecord`, `normalizePairingsMap`, `isHomeKitPairing`, `getHomeKitPairings`, `mapReliabilityStats`) and 1 factory (`createStoreHelpers`). Pure functions are safe to import in any router without closure risks.

**listener/src/discovery-helpers.js** — New module exporting `createDiscoveryHelpers` factory that returns 7 functions (`runDiscoveryScan`, `safeDiscoveryScan`, `discoverDeviceForRepair`, `savePairingForRepair`, `getPairingForLookup`, `isAutoDiscoveryEnabled`, `runScheduledDiscoveryScan`). Imports `getHomeKitPairings`, `isHomeKitPairing`, `normalizePairingRecord` directly from setup-helpers.js.

**listener/src/utils.js** — Expanded with 3 new exports: `isLoopbackHostname`, `normalizeRateLimitValue`, `extractBearerToken`.

**listener/test/setup-helpers.test.js** — 32 unit tests covering all pure functions and the `createStoreHelpers` factory with mock stores. TDD: RED phase committed before implementation.

**listener/src/index.js** — Reduced from 788 to 477 lines. All helper function definitions replaced with:
- `createStoreHelpers({...})` factory call for store wrappers
- `createDiscoveryHelpers({...})` factory call for discovery functions
- Direct imports for moved utility functions

**listener/src/setup-router.js** — Added direct import of `isHomeKitPairing`, `getHomeKitPairings`, `normalizePairingRecord` from setup-helpers.js; removed from dep bag.

**listener/src/accessories-router.js** — Added direct imports of `isHomeKitPairing`, `mapReliabilityStats` from setup-helpers.js, `parentBridgeId` from utils.js, `deriveDeviceHealth` from device-health.js; removed from dep bag. `HttpClient` kept as injected dep for testability.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| RED | Write failing tests for setup-helpers module | 4089f57 |
| 1 | Create setup-helpers.js, discovery-helpers.js, expand utils.js | 29c7730 |
| 2 | Rewire index.js, update routers to import pure functions directly | 0669d5c |

## Key Decisions Made

1. **Direct imports for pure functions** — `isHomeKitPairing`, `getHomeKitPairings`, `normalizePairingRecord`, `mapReliabilityStats` are imported directly by setup-router.js and accessories-router.js instead of injected as callbacks. This simplifies dep bags and aligns with the Phase 6 design goal.

2. **HttpClient kept as injected dep** — The accessories-router integration test mocks `HttpClient` to avoid real HAP network calls. Moving it to a direct import broke test isolation, so it stays as an injected dep for testability.

3. **Discovery factory call before subscriber startup** — The original code worked because JavaScript function declarations are hoisted, but factory-returned values are not. Moving `let discoveryCache = []` and the `createDiscoveryHelpers` call before the "Start HomeKit subscribers" block fixes the temporal dependency.

4. **Dead code removal** — `apiWriteLimiter`, `API_WRITE_RATE_LIMIT_WINDOW_MS`, `API_WRITE_RATE_LIMIT_MAX`, `API_STATS_RATE_LIMIT_WINDOW_MS`, `API_STATS_RATE_LIMIT_MAX`, `rateLimitKeyGenerator`, `detectOutliers`, `rateLimit` (import) — all unused after route extraction. Removed to reduce line count.

5. **477-line target not achieved** — The plan expected index.js to reach 300-400 lines. After full extraction, 477 lines remain. The 77-line gap consists of: store refresh interval (28 lines), DISCOVER_IFACE resolver (14 lines), `runRetentionSweepSafe` (30 lines), and misc essential orchestration (5 lines). These are all legitimate background job / init code that belongs in index.js per the design.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Temporal dependency for discoveryCache**
- **Found during:** Task 2
- **Issue:** The `getPairingForLookup` function (returned by `createDiscoveryHelpers`) is referenced in the "Start HomeKit subscribers" section, which preceded the `let discoveryCache = []` declaration and factory call in the original code. In the original code, function hoisting made this work. Factory-returned values are not hoisted.
- **Fix:** Moved `let discoveryCache = []` and `createDiscoveryHelpers({...})` call to a new "Section 2. Discovery helpers" block placed BEFORE the subscriber startup section.
- **Files modified:** listener/src/index.js
- **Commit:** 0669d5c

**2. [Rule 1 - Bug] accessories-router mock HttpClient broken by direct import**
- **Found during:** Task 2 — test `GET /accessories/:accessoryId/capabilities — queries HttpClient on cache miss` failed with 500 instead of 200.
- **Issue:** Moving `HttpClient` to a direct import in accessories-router.js bypassed the test's `MockHttpClient` injection, causing the router to use the real hap-controller HttpClient which fails in the test environment.
- **Fix:** Reverted `HttpClient` to remain an injected dep in accessories-router; kept the other direct imports (`parentBridgeId`, `deriveDeviceHealth`).
- **Files modified:** listener/src/accessories-router.js, listener/src/index.js
- **Commit:** 0669d5c

### Plan Target Deviation

**3. [Rule 4 boundary - Informational] Line count 477 vs. target 300-400**
- **Issue:** index.js reaches 477 lines after full extraction, not the 300-400 target.
- **Root cause:** The plan underestimated the line count for constants, store instances, DISCOVER_IFACE resolver, store refresh interval, and `runRetentionSweepSafe`. These ~77 extra lines are all essential orchestration code that belongs in index.js.
- **Status:** Accepted. All helper functions have been correctly extracted; the remaining content is legitimately orchestration code (background jobs, init sequence, middleware, router mounts). Further reduction would require extracting `runRetentionSweepSafe` or the store refresh interval into their own modules, which is out of scope.

## Verification

- `wc -l listener/src/index.js` → 477 (above 400 target; see deviation #3)
- `npm test` in listener/ → 273 tests, 0 failures
- `grep -c 'function ' listener/src/index.js` → 2 (runRetentionSweepSafe + globalExpressErrorHandler)
- All 3 files import from setup-helpers.js: PASSED (index.js, setup-router.js, accessories-router.js)
- index.js imports from discovery-helpers.js: PASSED
- `node -e "import('./src/setup-helpers.js')..."` lists all 7 expected exports: PASSED

## Known Stubs

None.

## Self-Check: PASSED

- listener/src/setup-helpers.js: FOUND
- listener/src/discovery-helpers.js: FOUND
- listener/src/utils.js: FOUND (expanded with 3 new exports)
- listener/test/setup-helpers.test.js: FOUND
- listener/src/index.js: FOUND (477 lines)
- listener/src/setup-router.js: FOUND (updated)
- listener/src/accessories-router.js: FOUND (updated)
- Commits 4089f57, 29c7730, 0669d5c: FOUND
- npm test → 273/273: CONFIRMED
