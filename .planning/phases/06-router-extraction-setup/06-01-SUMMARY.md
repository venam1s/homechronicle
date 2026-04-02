---
phase: 06-router-extraction-setup
plan: "01"
subsystem: listener/api
tags: [router-extraction, refactoring, setup-router, dependency-injection]
dependency_graph:
  requires: [05-01]
  provides: [setup-router-factory, slim-index-js]
  affects: [listener/src/index.js, listener/src/setup-router.js]
tech_stack:
  added: []
  patterns: [factory-function-router, getter-setter-callbacks, injectable-subscriber-lifecycle]
key_files:
  created:
    - listener/src/setup-router.js
  modified:
    - listener/src/index.js
decisions:
  - discoveryCache accessed exclusively via getDiscoveryCache()/setDiscoveryCache() callbacks (RTR-08)
  - getPairingForLookup extracted as named function replacing three identical inline closures
  - shortUuid/resolveControllerIdentity/runAddPairing imported directly in setup-router (pure functions, no closure)
  - setup-router mounted before retention-router at /api/setup (D-09/D-10)
  - getLevel/setLevel/shortUuid/resolveControllerIdentity/runAddPairing removed from index.js imports (now only in setup-router.js)
metrics:
  duration_minutes: 5
  completed_date: "2026-04-02"
  tasks_completed: 2
  files_changed: 2
---

# Phase 06 Plan 01: setup-router Extraction Summary

Extracted all 16 non-retention `/api/setup/*` route handlers from `listener/src/index.js` into a new `listener/src/setup-router.js` factory-function router, wired it into index.js, and reduced index.js from 1163 lines to 788 lines.

## What Was Built

**listener/src/setup-router.js** — New factory-function router exporting `createSetupRouter()`. Contains all setup routes organized in sections: Discovery (discovered, scan), Pairing/HomeKit (pair, bridge-children, pairings, delete-pairing, repair, add-pairing), Rooms, Display Names, Notes, Log Level.

**listener/src/index.js** — Reduced from 1163 lines to 788 lines. The setup routes are gone; replaced by `app.use('/api/setup', createSetupRouter({...}))` mount with all deps injected as callbacks.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Create setup-router.js factory with all 16 route handlers | 3c993b2 |
| 2 | Wire setup-router into index.js and remove extracted routes | b7fec6b |

## Key Decisions Made

1. **discoveryCache getter/setter pattern** — `getDiscoveryCache()` and `setDiscoveryCache()` callbacks injected into setup-router, matching the `getMatterDiscoveryCache/setMatterDiscoveryCache` pattern already established in index.js. In-place mutation (e.g., `item.paired = true`) uses the getter to retrieve the array reference — no setter needed for element updates, only for full array replacement.

2. **getPairingForLookup extracted** — Three identical inline arrow functions passed to `startSubscribers()` call sites (pair, repair, add-pairing) replaced with a single named `getPairingForLookup(id)` function defined in index.js and injected as a callback. Also applied to the startup `startSubscribers()` call in index.js.

3. **Pure function imports** — `shortUuid`, `resolveControllerIdentity`, `runAddPairing`, `getLevel`, `setLevel` are imported directly in setup-router.js (they are pure functions with no closure over index.js state). Removed from index.js imports since no longer used there.

4. **Route count reconciliation** — Plan states "18 routes" but setup-router.js has 16 routes. The 2 remaining `/api/setup` routes (GET/PATCH /retention) live in the separately-extracted `retention-router.js` (per D-09, which stays mounted separately). Total under `/api/setup` = 16 + 2 = 18.

5. **Line count** — index.js reaches 788 lines after extraction, not the 300-400 target. Helper functions (`normalizePairingRecord`, `isHomeKitPairing`, `getHomeKitPairings`, `loadPairings`, `savePairings`, etc.) stay in index.js per D-05 — they are injected as callbacks and a future cleanup phase will move them to a shared module. The 300-400 target is a combined Phase 5+6 aspirational goal that requires the helper migration (out of scope).

## Deviations from Plan

None - plan executed exactly as written, modulo the route count clarification noted above (16 in setup-router + 2 in retention-router = 18 total, matching plan intent).

## Verification

- `createSetupRouter` exported and importable: PASSED
- No bare `discoveryCache` references in setup-router.js: PASSED
- No `app.get/post/patch/delete('/api/setup/...'` in index.js: 0 matches
- `app.use('/api/setup', createRetentionRouter({` still present in index.js: PASSED
- `npm test` in listener/: 206 tests, 0 failures

## Known Stubs

None.

## Self-Check: PASSED

- listener/src/setup-router.js: FOUND
- listener/src/index.js: FOUND (788 lines)
- Commits 3c993b2, b7fec6b: FOUND
