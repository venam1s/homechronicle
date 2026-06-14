---
phase: 25-per-user-quiet-hours-phase-2
plan: "01"
subsystem: listener/stats
tags: [quiet-hours, per-user, session-aware, stats-router, tdd]
dependency_graph:
  requires: [phase-24-per-user-ui-preferences]
  provides: [session-aware-quiet-hours-handler]
  affects: [listener/src/stats-router.js, listener/src/retention-router.js, listener/test/stats-router.integration.test.js]
tech_stack:
  added: []
  patterns: [session-aware handler resolution, per-user preferences blob read, normalizeRetentionSettings reuse]
key_files:
  modified:
    - listener/src/stats-router.js
    - listener/test/stats-router.integration.test.js
  created: []
decisions:
  - "normalizeRetentionSettings was already exported from retention-router.js — no retention-router.js change needed"
  - "Single try/catch wraps the blob SELECT and the aggregation query so a DB error on either path logs and 500s consistently"
  - "Presence predicate is 'quietHoursEnabled' in blob (not truthiness) to distinguish explicit false from absent key (QH-02)"
metrics:
  duration: "~10 minutes"
  completed: "2026-06-14T13:21:27Z"
  tasks_completed: 2
  files_changed: 2
---

# Phase 25 Plan 01: Session-Aware Quiet-Hours Handler Summary

**One-liner:** Session-aware GET /stats/quiet-hours reads per-user quiet-hours blob from user_preferences via `req.hcSession?.user_id`, falling back to shared retention.json config when no session or blob lacks `quietHoursEnabled` key.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Augment stats-router integration tests (RED) | 029c321 | listener/test/stats-router.integration.test.js |
| 2 | Make GET /stats/quiet-hours session-aware (GREEN) | 9969337 | listener/src/stats-router.js |

## What Was Built

**Task 1 (RED):** Augmented the `invoke` helper in `stats-router.integration.test.js` to accept an `hcSession` option (mirroring `me-router.integration.test.js`). Added four test cases for `GET /stats/quiet-hours`:

- Path (a): No session → shared config used, `user_preferences` never queried
- Path (b): Authed user blob has `quietHoursEnabled:true` with `start:1/end:5` → per-user values returned (not shared `22/7`) — RED until Task 2
- Path (c): Authed user blob lacks `quietHoursEnabled` key → whole-config fallback (shared config)
- Path (d): Malformed blob `quietHoursStart:'abc'` → `normalizeRetentionSettings` coerces; no 500

**Task 2 (GREEN):**

- Added `import { normalizeRetentionSettings } from './retention-router.js'` to stats-router.js
- Changed handler signature from `(_req, res)` to `(req, res)`
- Settings resolution now: if `req.hcSession?.user_id` is truthy, run parameterized `SELECT prefs FROM user_preferences WHERE user_id = $1`, check `'quietHoursEnabled' in blob` (key-presence predicate), if true call `normalizeRetentionSettings(blob)`; otherwise `getRetentionSettings()`
- The blob SELECT and aggregation query are both inside a single try/catch (consistent error handling)
- No `cached()` call in the handler (QH-09)
- `quietHoursExcludedAccessories` and `mutedDevices` remain separate (QH-05)

## Deviations from Plan

**1. [Rule 1 - Observation] retention-router.js needed no change**
- Plan listed `listener/src/retention-router.js` in `files_modified` and said "add export if missing"
- `normalizeRetentionSettings` was already exported at line 11 (`export function normalizeRetentionSettings`)
- No edit made; the import in stats-router.js picks it up as-is
- Files changed: 0 in retention-router.js

None other — plan executed as written.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. The handler reads an existing table (`user_preferences`) with a parameterized query and the `user_id` comes from `req.hcSession` (server-set by the auth gate) — IDOR mitigated as specified in `T-25-IDOR`.

## Self-Check: PASSED

- `listener/test/stats-router.integration.test.js` — exists and modified
- `listener/src/stats-router.js` — exists and modified
- Commit 029c321 — exists (Task 1 RED)
- Commit 9969337 — exists (Task 2 GREEN)
- `cd listener && npm test` — 638/638 pass, 0 fail
