---
phase: 24-per-user-ui-preferences-phase-1
plan: "02"
subsystem: listener/src
tags: [me-router, preferences, pool-queries, upsert, index-mount, green]
dependency_graph:
  requires:
    - listener/migrations/0007_user_preferences.sql (from 24-01)
    - listener/src/me-router.js (skeleton from 24-01)
    - listener/test/me-router.integration.test.js (RED stubs from 24-01)
  provides:
    - listener/src/me-router.js (full GET/PUT /preferences implementation)
    - listener/src/index.js (me-router mounted at /api/me)
  affects:
    - listener (634/634 tests, fully green)
tech_stack:
  added: []
  patterns:
    - parameterized pool.query ($1/$2::jsonb) — no string interpolation (T-24-SQLI)
    - INSERT ... ON CONFLICT (user_id) DO UPDATE ... RETURNING prefs (upsert pattern)
    - session guard first, validation second, size cap before DB access (T-24-DOS)
    - factory router pattern (createMeRouter mirrors createAlertsRouter)
key_files:
  created: []
  modified:
    - listener/src/me-router.js
    - listener/src/index.js
decisions:
  - "Per D-04: GET no-row returns { prefs: {} }, NOT 404 — rows[0]?.prefs ?? {}"
  - "Per D-05: PUT replaces whole blob (last-writer-wins) via ON CONFLICT DO UPDATE RETURNING prefs"
  - "Per D-07/T-24-DOS: serialized size check runs BEFORE pool.query (no DB hit on rejected input)"
  - "Per D-08: mounted after createUsersRouter which is after global gate + csrfSynchronisedProtection"
  - "T-24-SQLI: serialized string passed as $2 param, cast to ::jsonb in SQL — no interpolation"
metrics:
  duration: "8 minutes"
  completed: "2026-06-14"
  tasks: 2
  files: 2
---

# Phase 24 Plan 02: me-router GET/PUT /preferences Implementation Summary

Full GET and PUT /preferences pool queries implemented in me-router.js and the router mounted at /api/me in index.js, turning all 7 RED integration stubs from 24-01 GREEN. Listener suite: 634/634.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Implement GET/PUT /preferences handlers | b28456a | listener/src/me-router.js |
| 2 | Mount me-router at /api/me in index.js | 016a96a | listener/src/index.js |

## Test Results

### Listener

- Total: 634 tests
- Passing: 634 (all green)
- Failing: 0

**me-router integration (17/17 GREEN — all 7 previously RED stubs now pass):**
- Route registration: 3/3
- 401 no-session guards (GET + PUT): 3/3
- 400 non-object validation (array/string/null/missing): 4/4
- GET no-row → `{ prefs: {} }`: PASS (was RED)
- GET with stored blob → stored blob: PASS (was RED)
- PUT upsert and return blob: PASS (was RED)
- PUT second call overwrites (D-05 last-writer-wins): PASS (was RED)
- PUT 400 oversize (>256 KB serialized): PASS (was RED)
- GET 500 on pool throw: PASS (was RED)
- PUT 500 on pool throw: PASS (was RED)

## Artifacts

### listener/src/me-router.js

GET /preferences handler:
- Session guard first (`req.hcSession?.user_id` → 401)
- `pool.query('SELECT prefs FROM user_preferences WHERE user_id = $1', [userId])`
- Returns `{ prefs: rows[0]?.prefs ?? {} }` — no-row returns empty object, not 404 (D-04)
- catch → `log.error('[api] GET /api/me/preferences error:', ...)` + 500

PUT /preferences handler:
- Session guard first (401 rejects API_TOKEN service-token callers, T-24-AUTHZ)
- Non-object validation (prefs == null || typeof !== 'object' || Array.isArray → 400)
- `JSON.stringify(prefs)` → `Buffer.byteLength(serialized, 'utf8') > MAX_PREFS_BYTES` → 400 before any DB access (T-24-DOS)
- `INSERT INTO user_preferences (user_id, prefs, updated_at) VALUES ($1, $2::jsonb, now()) ON CONFLICT (user_id) DO UPDATE SET prefs = EXCLUDED.prefs, updated_at = now() RETURNING prefs`
- Returns `{ prefs: rows[0].prefs }` (D-05 whole-blob replace)
- catch → `log.error('[api] PUT /api/me/preferences error:', ...)` + 500

### listener/src/index.js

- `import { createMeRouter } from './me-router.js';` added at line 50 (alongside other router imports)
- `app.use('/api/me', createMeRouter({ pool }));` added after createUsersRouter mount
- Position: after global auth gate (~line 524) and csrfSynchronisedProtection (~line 577)
- PUT /api/me/preferences is CSRF-protected automatically (SEC-02, D-08)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all 501 stubs from me-router.js have been replaced with full implementations.

## Threat Surface Scan

No new network endpoints or auth paths beyond what was planned. The implemented endpoints were already in the threat model:
- T-24-AUTHZ: mitigated — `req.hcSession?.user_id` 401 guard in both handlers
- T-24-DOS: mitigated — 256 KB size cap before pool.query
- T-24-VALID: mitigated — non-object rejection before DB access
- T-24-SQLI: mitigated — `$1`/`$2::jsonb` parameterized; no string interpolation
- T-24-CSRF: mitigated (inherited) — PUT mounted after csrfSynchronisedProtection

## Self-Check: PASSED

- listener/src/me-router.js: EXISTS, GET + PUT implemented
- listener/src/index.js: contains `import { createMeRouter }` and `app.use('/api/me', createMeRouter({ pool }))`
- Commit b28456a: Task 1 (me-router handlers)
- Commit 016a96a: Task 2 (index.js mount)
- `cd listener && npm test`: 634/634 green, 0 failing
- All 7 RED stubs from 24-01 now GREEN
