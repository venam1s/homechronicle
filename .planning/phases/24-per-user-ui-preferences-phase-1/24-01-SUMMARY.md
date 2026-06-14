---
phase: 24-per-user-ui-preferences-phase-1
plan: "01"
subsystem: listener/migrations + listener/src + web/src/hooks
tags: [tdd, wave-0, migration, me-router, preferences, red-stubs]
dependency_graph:
  requires: []
  provides:
    - listener/migrations/0007_user_preferences.sql
    - listener/src/me-router.js (createMeRouter factory)
    - listener/test/migration.0007.test.js (GREEN)
    - listener/test/me-router.integration.test.js (10 GREEN, 7 RED)
    - web/src/hooks/useUserPreferences.test.js (RED until 24-03)
    - web/src/hooks/usePreference.test.js (RED until 24-03)
  affects:
    - listener (634 tests, 627 passing, 7 intentionally RED)
    - web/src/hooks (2 RED test files added, existing tests unaffected)
tech_stack:
  added: []
  patterns:
    - factory router pattern (createMeRouter mirrors createAlertsRouter)
    - source-inspection migration tests (mirrors migration.0005.test.js idiom)
    - fake-pool integration tests with selective-throw (me-router.integration.test.js)
    - Wave-0 TDD RED stubs (4 test files: 2 listener, 2 web)
key_files:
  created:
    - listener/migrations/0007_user_preferences.sql
    - listener/test/migration.0007.test.js
    - listener/src/me-router.js
    - listener/test/me-router.integration.test.js
    - web/src/hooks/useUserPreferences.test.js
    - web/src/hooks/usePreference.test.js
  modified: []
decisions:
  - "Kept me-router skeleton without pool queries (501 stubs) to preserve 7 intentional RED stubs for 24-02"
  - "migration.0007 uses BIGINT FK (not INTEGER) — confirmed against 0003_users_sessions.sql:14 sessions.user_id BIGINT"
  - "Web hook tests fail at collection (missing import targets) — expected Wave-0 state; 24-03 creates the modules"
metrics:
  duration: "13 minutes"
  completed: "2026-06-14"
  tasks: 3
  files: 6
---

# Phase 24 Plan 01: Wave-0 Foundation (Migration + Skeleton + RED Stubs) Summary

Migration 0007 (user_preferences BIGINT FK table), createMeRouter factory skeleton with session/validation guards, and four RED test stubs that 24-02 (listener) and 24-03 (web) turn green.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Migration 0007 + source-inspection test | 0e76f6b | listener/migrations/0007_user_preferences.sql, listener/test/migration.0007.test.js |
| 2 | me-router skeleton + RED listener stubs | bafe0e7 | listener/src/me-router.js, listener/test/me-router.integration.test.js |
| 3 | RED web hook test stubs | 73936ed | web/src/hooks/usePreference.test.js, web/src/hooks/useUserPreferences.test.js |

## Test Results

### Listener (expected state)

- Total: 634 tests
- Passing: 627 (includes 8 new migration.0007 GREEN + 10 new me-router GREEN)
- Failing (intentional RED): 7 me-router pool-dependent stubs

**GREEN tests (in scope):**
- migration.0007: 8/8 pass (source-inspection, BIGINT guard, up/down markers, purely additive)
- me-router route registration: 3/3 pass
- me-router 401-no-session: 3/3 pass (GET+PUT with undefined hcSession, GET with no user_id)
- me-router 400-non-object: 4/4 pass (array, string, null, missing prefs)

**RED tests (expected until 24-02):**
- GET no-row → { prefs: {} }
- GET with stored blob
- PUT upsert and return
- PUT second call overwrites (D-05)
- PUT 400 oversize (>256 KB)
- GET 500 on pool throw
- PUT 500 on pool throw

### Web (expected state)

Both web test files fail at collection (Vitest cannot resolve the import path for `usePreference.js` and `useUserPreferences.js` — modules don't exist until 24-03). This is the correct Wave-0 RED state.

## Artifacts

### listener/migrations/0007_user_preferences.sql

Purely additive. Creates `user_preferences` table:
- `user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE` (BIGINT, not INTEGER — FK type matches `sessions.user_id BIGINT` in 0003)
- `prefs JSONB NOT NULL DEFAULT '{}'::jsonb`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- Down: `DROP TABLE IF EXISTS user_preferences`
- No `ALTER TABLE` (additive only)

### listener/src/me-router.js

Factory `createMeRouter({ pool })` exports an Express router with:
- `GET /preferences`: session guard (401) → 501 stub (pool query deferred to 24-02)
- `PUT /preferences`: session guard (401) → prefs object validation (400) → 501 stub (upsert deferred to 24-02)
- `MAX_PREFS_BYTES = 256 * 1024` constant established (T-24-DOS)
- Follows `createAlertsRouter` factory pattern exactly

### listener/test/me-router.integration.test.js

17 tests covering full contract surface:
- Route registration assertions (3 GREEN)
- 401 guards for GET and PUT (3 GREEN)
- 400 non-object validation: array, string, null, missing (4 GREEN)
- GET no-row / stored blob / PUT upsert / oversize / 500-throw (7 RED, pending 24-02)

### web/src/hooks/useUserPreferences.test.js

5 cases (all RED):
- Query key `['me', 'preferences']` (not `['auth', 'me']` — D-09 collision guard)
- `queryFn` unwraps `d?.prefs ?? {}` (not raw envelope)
- Empty blob returns `{}`
- Query disabled when `user === null` — zero fetchJson calls (PREF-05/D-15)
- PUT mutation sends `{ prefs: blob }` and updates cache

### web/src/hooks/usePreference.test.js

12 cases (all RED):
- Authed: value from server blob; setter calls `setPrefsBlob` + mirrors localStorage
- Anon: zero fetchJson, value from localStorage, setter writes localStorage only
- Default value when localStorage is empty and user is null
- Seeding: exactly ONE `setPrefsBlob` call on empty blob; zero calls on non-empty blob (PREF-11/D-14)
- Debounce: multiple rapid set calls coalesce into ONE PUT with ALL keys in window (D-05, uses `vi.useFakeTimers()`)
- Malformed blob: falls back to per-key default (D-18)

## Deviations from Plan

None — plan executed exactly as written.

The me-router skeleton was kept at minimal (501 stub) rather than implementing pool queries, preserving the 7 intentional RED stubs for 24-02 to turn green. This matches the plan's "handlers may be minimal placeholders" direction.

## Known Stubs

The me-router.js GET and PUT handlers return 501 with a log message. This is intentional scaffolding for 24-02. The integration tests assert the correct 200/400/500 contracts, which remain RED until 24-02 wires the pool queries.

## Threat Flags

None — no new network endpoints, auth paths, or schema beyond the planned `user_preferences` table. The session guard and size cap (`MAX_PREFS_BYTES`) establish the T-24-AUTHZ and T-24-DOS mitigations at the skeleton level.

## Self-Check: PASSED

- listener/migrations/0007_user_preferences.sql: EXISTS
- listener/test/migration.0007.test.js: EXISTS, 8/8 GREEN
- listener/src/me-router.js: EXISTS, exports createMeRouter
- listener/test/me-router.integration.test.js: EXISTS, 10 GREEN / 7 RED (as required)
- web/src/hooks/useUserPreferences.test.js: EXISTS, RED (import-level, expected)
- web/src/hooks/usePreference.test.js: EXISTS, RED (import-level, expected)
- Commits: 0e76f6b, bafe0e7, 73936ed (verified via git log)
- No regressions: 609 pre-existing listener tests all still pass (609 + 8 migration + 10 me-router-green = 627 passing)
